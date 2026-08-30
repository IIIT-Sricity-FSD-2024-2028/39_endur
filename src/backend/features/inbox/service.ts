// The response inbox. 58, 13 § Inbox.
//
// THIS FILE DOES NOT QUERY `responses`, AND MUST NOT LEARN HOW.
//
// Every comment it returns comes from features/results/service.ts's readComments(), which
// owns the k-anonymity gate. This file owns exactly one table — `inbox_state` — which holds
// no response content at all: a user id, a response id, and two timestamps.
//
// That split is the whole design. `58` and the MAP entry both say it in the same words: a
// second ungated path to individual comments is what INV-007 exists to prevent, and an
// inbox is the most tempting place in the product to build one.
//
// SINCE `DEC-101` IT ALSO OWNS `notifications`, and that does not weaken the rule above — it
// is the clearest possible case of it. A notification carries a `user_id`, a subject and a
// body typed by an Endur operator. There is no column on it that could reach a `responses`
// row, so the second stream cannot become the second path this file exists to refuse.
import type { InboxMessage, InboxMessageQuery, InboxQuery, InboxResponse } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Paged } from '../../lib/paginate.js';
import { readComments, type CommentFilter } from '../results/service.js';

export async function readInbox(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: InboxQuery,
): Promise<Paged<InboxResponse>> {
  // The caller's own rows, and only the ids. This is a list of things THEY have touched, so
  // it is bounded by their own activity rather than by the size of the org.
  const marks = await prisma.inboxState.findMany({
    where: { orgId, userId },
    select: { responseId: true, readAt: true, archivedAt: true },
  });

  const archived = marks.filter((mark) => mark.archivedAt !== null).map((m) => m.responseId);
  const read = marks
    .filter((mark) => mark.readAt !== null && mark.archivedAt === null)
    .map((m) => m.responseId);

  // Expressed as id sets and handed to readComments as a filter, so the state tabs page
  // CORRECTLY. Filtering after the page is taken would return a page of fifty holding
  // three unread, which on a queue is worse than useless.
  const ids = ((): CommentFilter['responseIds'] => {
    switch (query.state) {
      case 'archived':
        return { in: archived };
      case 'read':
        return { in: read };
      case 'unread':
        return { notIn: [...read, ...archived] };
      case 'all':
        // Everything NOT archived. Archiving that left the card sitting in All would be an
        // archive click that did nothing.
        return { notIn: archived };
    }
  })();

  // An empty `in` set means an empty tab, and Prisma's `{ in: [] }` says exactly that.
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

/**
 * Marking is an UPSERT on the caller's own row, and it never touches the response.
 *
 * Nothing in this product deletes or edits a response — a feedback tool where an
 * administrator can make a comment disappear is a feedback tool nobody should trust
 * (52 §6). Archiving is a timestamp on the reader's row and is reversible from the
 * Archived tab.
 */
export async function mark(
  orgId: string,
  userId: string,
  authzVersion: number,
  responseId: string,
  action: Mark,
): Promise<void> {
  // THE GATE APPLIES TO WRITES TOO. Without this, `POST /inbox/:id/read` on a guessed uuid
  // is an oracle: a 204 for a response that exists and a 404 for one that does not tells a
  // caller which ids are real in a campaign they cannot read. It costs one query.
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
  //     ^ archiving marks read as well. Nobody archives a comment they have not read, and
  //       leaving it unread would keep it in the unread COUNT after it left the queue.

  await prisma.inboxState.upsert({
    where: { userId_responseId: { userId, responseId } },
    create: { orgId, userId, responseId, readAt: null, archivedAt: null, ...value },
    update: value,
  });
}

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
    // The same 404 whether the response does not exist, sits in a campaign out of scope, or
    // sits in one below the threshold. Three different reasons, one answer — a distinct
    // message for the third would announce that suppressed data exists (52 §2).
    throw new NotFoundError('That response is not in your inbox.');
  }
}

// ---------------------------------------------------------------------------
// From Endur — DEC-101, T-101, 58 § From Endur.
//
// A SECOND STREAM OVER THE SAME MECHANIC, not a second inbox. `58` already built
// read/unread and a per-reader state; this reuses it and adds nothing to `11` §3 — the row
// NAMES A USER, so the reader is the addressee and there is nothing narrower to ask
// (`DEC-101`, and `58`'s own argument for adding no capability for inbox read state).
//
// WHY THE STATE IS A COLUMN HERE AND A JOIN TABLE THERE. `inbox_state` is keyed
// `(user_id, response_id)` because one response is visible to MANY readers and each has their
// own queue. A notification is written per recipient already — one row, one reader — so
// `read_at` sits on the row itself. Two mechanisms for two different cardinalities, not one
// pattern applied twice.
// ---------------------------------------------------------------------------

export async function readMessages(
  orgId: string,
  userId: string,
  query: InboxMessageQuery,
): Promise<Paged<InboxMessage>> {
  const where = {
    orgId,
    // SCOPED TO THE READER, not to the organisation. An administrator must not read a message
    // addressed to a colleague by name, and `org_id` alone would let them.
    userId,
    ...(query.state === 'unread' ? { readAt: null } : {}),
    ...(query.state === 'read' ? { readAt: { not: null } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      // NEWEST FIRST, and no cursor arithmetic: this stream is a handful of rows a year, not
      // a queue that grows with every response. `limit + 1` still answers `hasMore` honestly
      // rather than the page pretending it is complete.
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

/**
 * Mark one message read. Idempotent, and the timestamp is NOT re-stamped on a second call —
 * "when did they first see this" is the only question this column is ever asked.
 *
 * SCOPED BY `userId` IN THE WHERE, not checked after the read. A findUnique-then-compare
 * leaves a window where the id is enough; `updateMany` with both keys cannot match a row that
 * is not the caller's, and a count of 0 is the same 404 whether the row is missing or is
 * somebody else's — one answer, so the response cannot be used to probe for the other.
 */
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

