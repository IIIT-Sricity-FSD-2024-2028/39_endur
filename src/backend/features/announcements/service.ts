// Announcements. Two things this file is NOT:
//   1. a message transport - nothing is emailed or pushed. An announcement is a row plus one receipt
//      per recipient, read inside the product, and the composer says so on screen.
//   2. anywhere near responses - receipts name a staff account, which is fine precisely because these
//      are staff and not respondents. No query here touches the responses table.
// The audience is resolved by the campaigns' audience helper and by nothing else, so "everyone in
// Housekeeping" cannot mean two different sets on two screens.
import type {
  AnnouncementPreview,
  AnnouncementSummary,
  AudienceRule,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { audienceUsers, ruleOf } from '../campaigns/audience.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

const rowSelect = {
  id: true,
  title: true,
  body: true,
  audienceRule: true,
  publishedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const;

type Row = {
  id: string;
  title: string;
  body: string;
  audienceRule: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string } | null;
};

// One row, with its two counts and the reader's own receipt.
// The recipient count counts RECEIPT ROWS, not who is in the unit today - which is exactly why receipts
// are written at publish time.
function toSummary(
  row: Row,
  counts: { recipients: number; read: number },
  mine: { readAt: Date | null } | undefined,
): AnnouncementSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    // Read through the shared helper, because the column is JSON and older rows hold the default.
    audience: ruleOf(row.audienceRule),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    authorName: row.createdBy?.name ?? null,
    recipients: counts.recipients,
    read: counts.read,
    // No receipt means the reader is not a recipient. Null rather than false, so a banner can tell
    // "not for me" from "for me and unread".
    readByMe: mine ? mine.readAt !== null : null,
  };
}

// The counts and the reader's own receipt for a set of announcements, in three queries.
async function decorate(rows: Row[], userId: string): Promise<AnnouncementSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [grouped, readGrouped, mine] = await Promise.all([
    prisma.announcementReceipt.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.announcementReceipt.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: ids }, readAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.announcementReceipt.findMany({
      where: { announcementId: { in: ids }, userId },
      select: { announcementId: true, readAt: true },
    }),
  ]);

  const recipients = new Map(grouped.map((group) => [group.announcementId, group._count._all]));
  const read = new Map(readGrouped.map((group) => [group.announcementId, group._count._all]));
  const own = new Map(mine.map((receipt) => [receipt.announcementId, receipt]));

  return rows.map((row) =>
    toSummary(
      row,
      { recipients: recipients.get(row.id) ?? 0, read: read.get(row.id) ?? 0 },
      own.get(row.id),
    ),
  );
}

// What this reader may see.
// A writer sees the organisation's announcements including drafts, because they are the people who make
// them. Everybody else sees exactly what was SENT to them: a published row they hold a receipt for.
const visibleTo = (orgId: string, userId: string, writer: boolean) =>
  writer ? { orgId } : { orgId, publishedAt: { not: null }, receipts: { some: { userId } } };

// One page of announcements for this reader.
export async function listAnnouncements(
  orgId: string,
  userId: string,
  writer: boolean,
): Promise<AnnouncementSummary[]> {
  const rows = await prisma.announcement.findMany({
    where: visibleTo(orgId, userId, writer),
    // Newest first. A draft has no publish date, and createdAt is the one timestamp every row has.
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
    select: rowSelect,
  });
  return decorate(rows, userId);
}

export async function readAnnouncement(
  orgId: string,
  userId: string,
  writer: boolean,
  id: string,
): Promise<AnnouncementSummary> {
  const row = await prisma.announcement.findFirst({
    where: { id, ...visibleTo(orgId, userId, writer) },
    select: rowSelect,
  });
  // 404 and not 403: something addressed to somebody else must not be distinguishable from something
  // that does not exist.
  if (!row) throw new NotFoundError('That announcement does not exist.');
  const [summary] = await decorate([row], userId);
  return summary as AnnouncementSummary;
}

// Creates a draft announcement.
export async function createAnnouncement(
  req: Request,
  orgId: string,
  userId: string,
  body: CreateAnnouncementBody,
): Promise<AnnouncementSummary> {
  const id = await runInTransaction(req, async (tx) => {
    const row = await tx.announcement.create({
      data: {
        orgId,
        title: body.title,
        body: body.body,
        audienceRule: body.audience,
        createdById: userId,
      },
      select: { id: true },
    });
    req.ctx.audit.push({
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: row.id,
    });
    return row.id;
  });
  return readAnnouncement(orgId, userId, true, id);
}

// Edits a draft.
export async function updateAnnouncement(
  req: Request,
  orgId: string,
  userId: string,
  id: string,
  body: UpdateAnnouncementBody,
): Promise<AnnouncementSummary> {
  await assertDraft(orgId, id);

  await runInTransaction(req, async (tx) => {
    await tx.announcement.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.audience !== undefined ? { audienceRule: body.audience } : {}),
      },
    });
    req.ctx.audit.push({
      action: 'announcement.update',
      targetType: 'announcement',
      targetId: id,
    });
  });

  return readAnnouncement(orgId, userId, true, id);
}

// Publish: irreversible, in the same sense a campaign launch is.
// One transaction stamps the publish date AND writes one receipt per recipient - a published row with no
// receipts has no readers and no denominator.
// Idempotent by state as well as by key, because resolving the audience twice would run against a
// different org graph and silently change who was sent it.
export async function publishAnnouncement(
  req: Request,
  orgId: string,
  userId: string,
  id: string,
): Promise<AnnouncementSummary> {
  const existing = await prisma.announcement.findFirst({
    where: { id, orgId },
    select: { id: true, publishedAt: true, audienceRule: true },
  });
  if (!existing) throw new NotFoundError('That announcement does not exist.');
  if (existing.publishedAt) return readAnnouncement(orgId, userId, true, id);

  const rule: AudienceRule = ruleOf(existing.audienceRule);
  const recipients = await audienceUsers(orgId, rule);

  await runInTransaction(req, async (tx) => {
    await tx.announcement.update({ where: { id }, data: { publishedAt: new Date() } });
    if (recipients.length > 0) {
      await tx.announcementReceipt.createMany({
        // Every recipient starts unread, which is what makes the number on the list a fraction.
        data: recipients.map((recipientId) => ({ announcementId: id, userId: recipientId })),
        skipDuplicates: true,
      });
    }
    req.ctx.audit.push({
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: id,
    });
  });

  return readAnnouncement(orgId, userId, true, id);
}

// Deletes an announcement and its receipts.
export async function deleteAnnouncement(req: Request, orgId: string, id: string): Promise<void> {
  const existing = await prisma.announcement.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('That announcement does not exist.');

  await runInTransaction(req, async (tx) => {
    // The receipts go with it, by the database's cascade: a receipt for a notice that no longer exists renders nothing.
    await tx.announcement.delete({ where: { id } });
    req.ctx.audit.push({
      action: 'announcement.delete',
      targetType: 'announcement',
      targetId: id,
    });
  });
}

// Marks MY OWN receipt read. The route takes no user id, so there is no argument that could reach
// somebody else's row.
export async function markRead(orgId: string, userId: string, id: string): Promise<void> {
  const receipt = await prisma.announcementReceipt.findFirst({
    where: { announcementId: id, userId, announcement: { orgId } },
    select: { readAt: true },
  });
  // Not a recipient: 404, the same answer the read route gives, and nothing is written.
  if (!receipt) throw new NotFoundError('That announcement does not exist.');
  if (receipt.readAt) return;

  await prisma.announcementReceipt.update({
    where: { announcementId_userId: { announcementId: id, userId } },
    data: { readAt: new Date() },
  });
}

// How many people an audience reaches, updated live while the composer changes it.
// The same resolver publish uses, so the number on screen is the number of receipts that will be written.
export async function previewAudience(
  orgId: string,
  rule: AudienceRule,
): Promise<AnnouncementPreview> {
  const users = await audienceUsers(orgId, rule);
  return { recipients: users.length };
}

// 409, not 400: the request was well formed, the row is simply past the point of editing.
async function assertDraft(orgId: string, id: string): Promise<void> {
  const row = await prisma.announcement.findFirst({
    where: { id, orgId },
    select: { publishedAt: true },
  });
  if (!row) throw new NotFoundError('That announcement does not exist.');
  if (row.publishedAt) {
    throw new ConflictError('That announcement has been published. It cannot be edited.');
  }
}
