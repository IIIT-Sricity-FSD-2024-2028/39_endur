// The response inbox.
// This file does NOT query responses and must not learn how: every comment it shows comes from the
// results service, which owns the anonymity gate. It owns one table - inbox_state - holding a user id,
// a response id and two timestamps, and since the Endur-messages feature, the notifications table too.
import type { InboxMessage, InboxMessageQuery, InboxQuery, InboxResponse } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Paged } from '../../lib/paginate.js';
import { readComments, type CommentFilter } from '../results/service.js';

// One page of the comment queue, with each card's read and archived state.
export async function readInbox(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: InboxQuery,
): Promise<Paged<InboxResponse>> {
  // The caller's own rows, ids only: a list of what THEY have touched, bounded by their activity.
  const marks = await prisma.inboxState.findMany({
    where: { orgId, userId },
    select: { responseId: true, readAt: true, archivedAt: true },
  });

  const archived = marks.filter((mark) => mark.archivedAt !== null).map((m) => m.responseId);
  const read = marks
    .filter((mark) => mark.readAt !== null && mark.archivedAt === null)
    .map((m) => m.responseId);

  // Handed to the comment reader as an id filter, so the tabs page correctly - filtering after the page
  // was taken would return fifty rows holding three unread.
  const ids = ((): CommentFilter['responseIds'] => {
    switch (query.state) {
      case 'archived':
        return { in: archived };
      case 'read':
        return { in: read };
      case 'unread':
        return { notIn: [...read, ...archived] };
      case 'all':
        // Everything not archived, so an archive click never leaves the card sitting in All.
        return { notIn: archived };
    }
  })();

  // An empty set means an empty tab, which is exactly what an empty 'in' filter says.
  const page = await readComments(orgId, userId, authzVersion, {
    campaignId: query.campaignId,
    subjectId: query.subjectId,
    responseIds: ids,
    cursor: query.cursor,
    limit: query.limit,
  });

  const readSet = new Set(marks.filter((m) => m.readAt !== null).map((m) => m.responseId));
  const archivedSet = new Set(archived);

  return {
    ...page,
    data: page.data.map((row) => ({
      id: row.responseId,
      questionId: row.questionId,
      at: row.submittedAt.toISOString(),
      campaign: row.campaign,
      subject: row.subject,
      comment: row.comment,
      questionText: row.questionText,
      score: row.score,
      scoreMax: row.scoreMax,
      read: readSet.has(row.responseId),
      archived: archivedSet.has(row.responseId),
    })),
  };
}

type Mark = 'read' | 'unread' | 'archive' | 'unarchive';

// Marking is an upsert on the caller's own row and never touches the response itself.
// Nothing in this product edits or deletes a response; archiving is a timestamp on the reader's row,
// and it is reversible from the Archived tab.
export async function mark(
  orgId: string,
  userId: string,
  authzVersion: number,
  responseId: string,
  action: Mark,
): Promise<void> {
  // The gate applies to writes too: without it, marking a guessed id read would reveal which ids are real.
  await assertReadable(orgId, userId, authzVersion, responseId);

  const now = new Date();
  const value =
    action === 'read'
      ? { readAt: now }
      : action === 'unread'
        ? { readAt: null }
        : action === 'archive'
          ? { archivedAt: now, readAt: now }
          : { archivedAt: null };
  // Archiving marks the card read as well: nobody archives a comment they have not read.

  await prisma.inboxState.upsert({
    where: { userId_responseId: { userId, responseId } },
    create: { orgId, userId, responseId, readAt: null, archivedAt: null, ...value },
    update: value,
  });
}

// Throws 404 unless this response is one the caller may actually read.
async function assertReadable(
  orgId: string,
  userId: string,
  authzVersion: number,
  responseId: string,
): Promise<void> {
  const page = await readComments(orgId, userId, authzVersion, {
    responseIds: { in: [responseId] },
    limit: 1,
  });
  if (page.data.length === 0) {
    // The same 404 whether the response does not exist, is out of scope, or is below the threshold.
    throw new NotFoundError('That response is not in your inbox.');
  }
}

// Messages from Endur: a second stream over the same read/unread mechanic, not a second inbox.
// The read state is a column here rather than a join table, because a notification is already written
// per recipient - one row, one reader - while one response is read by many people.

// One page of messages sent to this user.
export async function readMessages(
  orgId: string,
  userId: string,
  query: InboxMessageQuery,
): Promise<Paged<InboxMessage>> {
  const where = {
    orgId,
    // Scoped to the READER, not the organisation: an administrator must not read a colleague's message.
    userId,
    ...(query.state === 'unread' ? { readAt: null } : {}),
    ...(query.state === 'read' ? { readAt: { not: null } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      // Newest first, with no cursor arithmetic: this stream is a handful of rows a year, not a growing queue.
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: { id: true, createdAt: true, kind: true, subject: true, body: true, readAt: true },
    }),
    prisma.notification.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const data = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    read: row.readAt !== null,
  }));

  return { data, page: { nextCursor: null, hasMore }, meta: { total } };
}

// Marks one message read. Idempotent, and the timestamp is not re-stamped: "when did they first see this"
// is the only question this column is asked. Scoped by user in the WHERE, not checked afterwards.
export async function markMessage(
  orgId: string,
  userId: string,
  id: string,
  action: 'read' | 'unread',
): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id, orgId, userId },
    data: { readAt: action === 'read' ? new Date() : null },
  });
  // A count of 0 means no row matched all three keys — missing, or somebody else's. ONE
  // ANSWER FOR BOTH, so the response cannot be used to probe for the existence of the other.
  if (result.count === 0) throw new NotFoundError('That message is not in your inbox.');
}

