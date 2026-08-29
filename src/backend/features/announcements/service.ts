// Announcements. 13 § Announcements, T-094, DEC-091.
//
// TWO THINGS THIS FILE IS NOT, and both are worth saying before the code:
//
//   1. IT IS NOT A MESSAGE TRANSPORT. Nothing is emailed and nothing is pushed. An
//      announcement is a row plus one receipt per recipient, read inside the product. The
//      composer says so on screen, because a composer that implies mail was sent when none
//      was is worse than one that admits what it did (70 § MessageComposer carries the same
//      limitation for operator messages).
//
//   2. IT IS NOT ANYWHERE NEAR `responses`. Receipts are identified — they name a `users`
//      row — and that is fine precisely because these are STAFF, not respondents. INV-006 is
//      a promise about `responses`, and no query below reads that table or could be joined
//      to it: there is no campaignId here, no responseId, and no column to put one in.
//
// The audience is `AudienceRule`, resolved by `features/campaigns/audience.ts` and by
// nothing else. Two resolvers is how "everyone in Housekeeping" comes to mean two different
// sets on two screens.
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

/**
 * One row, with its two counts and the reader's own receipt.
 *
 * `recipients` counts RECEIPT ROWS and not people-in-the-unit-today, which is the whole
 * reason receipts are written at publish time: the denominator has to describe who the
 * notice was sent to, not who happens to be there when somebody opens the list.
 */
function toSummary(
  row: Row,
  counts: { recipients: number; read: number },
  mine: { readAt: Date | null } | undefined,
): AnnouncementSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    // Through `ruleOf`, like every other reader of this column: it is JSONB, it defaults to
    // `{}`, and a client switching on `audience.kind` renders nothing at all for a row that
    // still holds the default.
    audience: ruleOf(row.audienceRule),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    authorName: row.createdBy?.name ?? null,
    recipients: counts.recipients,
    read: counts.read,
    // No receipt means the reader is not a recipient — an author who addressed a unit they
    // are not in. `null` rather than `false`, so the banner can tell "not for me" from "for
    // me and unread".
    readByMe: mine ? mine.readAt !== null : null,
  };
}

/** The counts and the reader's own receipt, for a set of announcements, in three queries. */
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

/**
 * WHAT THIS READER MAY SEE.
 *
 * A writer sees the organisation's announcements, drafts included — they are the people who
 * make them, and a draft nobody can list is a draft nobody can finish. Everybody else sees
 * exactly what was SENT TO THEM: a published row they hold a receipt for. Not "everything
 * published in this org", which would make a notice addressed to one unit readable by the
 * whole organisation and the audience rule decorative.
 */
const visibleTo = (orgId: string, userId: string, writer: boolean) =>
  writer ? { orgId } : { orgId, publishedAt: { not: null }, receipts: { some: { userId } } };

export async function listAnnouncements(
  orgId: string,
  userId: string,
  writer: boolean,
): Promise<AnnouncementSummary[]> {
  const rows = await prisma.announcement.findMany({
    where: visibleTo(orgId, userId, writer),
    // Newest first, drafts in the same order. A draft has no `publishedAt` to sort on and
    // `createdAt` is the one timestamp every row has.
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
  // 404 AND NOT 403 (13 §5). Something addressed to somebody else must not be
  // distinguishable from something that does not exist, or the id space becomes a way to
  // ask whether a notice was sent at all.
  if (!row) throw new NotFoundError('That announcement does not exist.');
  const [summary] = await decorate([row], userId);
  return summary as AnnouncementSummary;
}

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

/**
 * PUBLISH. Irreversible, in the same sense a campaign launch is.
 *
 * ONE transaction stamps `published_at` AND writes one receipt per resolved recipient. They
 * cannot be separated: a published row with no receipts is a notice with no denominator and
 * no reader, and receipts without the stamp are rows nobody will ever be shown.
 *
 * Idempotent by STATE as well as by key. Publishing twice returns the first result rather
 * than resolving the audience again — a second resolution runs against a different org
 * graph and would silently change who the notice was sent to.
 */
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
        // `read_at` NULL: every recipient starts unread, which is what makes the number on
        // the list a fraction rather than a count.
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

export async function deleteAnnouncement(req: Request, orgId: string, id: string): Promise<void> {
  const existing = await prisma.announcement.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('That announcement does not exist.');

  await runInTransaction(req, async (tx) => {
    // The receipts go with it, by the migration's ON DELETE CASCADE. A receipt for a notice
    // that no longer exists is a row nothing can render.
    await tx.announcement.delete({ where: { id } });
    req.ctx.audit.push({
      action: 'announcement.delete',
      targetType: 'announcement',
      targetId: id,
    });
  });
}

/**
 * Mark MY OWN receipt read. The route takes no user id, deliberately: there is no argument
 * this endpoint could be given that would let it reach somebody else's row.
 */
export async function markRead(orgId: string, userId: string, id: string): Promise<void> {
  const receipt = await prisma.announcementReceipt.findFirst({
    where: { announcementId: id, userId, announcement: { orgId } },
    select: { readAt: true },
  });
  // Not a recipient — 404, the same answer `readAnnouncement` gives and for the same
  // reason. Nothing is written.
  if (!receipt) throw new NotFoundError('That announcement does not exist.');
  if (receipt.readAt) return;

  await prisma.announcementReceipt.update({
    where: { announcementId_userId: { announcementId: id, userId } },
    data: { readAt: new Date() },
  });
}

/**
 * How many people an audience reaches, live while the composer's audience changes.
 *
 * The same resolver publish uses, so the number on screen is the number of receipts that
 * will be written rather than an estimate computed a second way — the argument
 * `audiencePreview` makes for campaigns, on the surface where it is easier to get wrong
 * because there is no roll to check it against afterwards.
 */
export async function previewAudience(
  orgId: string,
  rule: AudienceRule,
): Promise<AnnouncementPreview> {
  const users = await audienceUsers(orgId, rule);
  return { recipients: users.length };
}

/** 409, not 400. The request was well-formed; the row is simply past the point of editing. */
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
