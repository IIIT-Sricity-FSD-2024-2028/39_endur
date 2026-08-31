// Subjects: the people or things feedback is collected about.
import type {
  CreateSubjectBody,
  SubjectCycle,
  SubjectDetail,
  SubjectListQuery,
  SubjectSummary,
  UpdateSubjectBody,
} from '@endur/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { nounsOf } from '../../lib/vocabulary.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { seesNothing, visibleUnits } from '../../authz/index.js';
import { statusOf } from '../campaigns/status.js';
import { ORGANISATION_SUBJECT } from '../campaigns/visibility.js';

// The subject list, filtered to what the caller may see.
export async function listSubjects(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: SubjectListQuery,
): Promise<Paged<SubjectSummary>> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'subject.read', authzVersion });
  if (seesNothing(visibility)) {
    return { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } };
  }

  const where = {
    orgId,
    ...(visibility.all ? {} : { unitId: { in: visibility.unitIds } }),
    ...(query.archived === 'true' ? { NOT: { archivedAt: null } } : { archivedAt: null }),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    ...(query.unitId ? { unitId: query.unitId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.subject.findMany({
      where: { ...where, ...afterCursor(query.cursor) },
      take: query.limit + 1,
      orderBy: CURSOR_ORDER,
      select: subjectSelect,
    }),
    prisma.subject.count({ where }),
  ]);

  return pageOf(rows, query.limit, total, toSummary);
}

// One subject plus its history of cycles - the miniature version of "did anything actually change?".
// Two queries only: the campaigns, then one grouped count across all of them, so twelve cycles is not thirteen trips.
export async function readSubject(
  orgId: string,
  userId: string,
  authzVersion: number,
  subjectId: string,
): Promise<SubjectDetail> {
  const subject = await assertVisible(orgId, userId, authzVersion, subjectId, 'subject.read');

  const campaigns = await prisma.campaign.findMany({
    where: { orgId, subjects: { some: { subjectId } } },
    select: {
      id: true, name: true, publicToken: true,
      closedAt: true, startsAt: true, endsAt: true, createdAt: true,
    },
    // Oldest first, because a trend reads left to right. createdAt breaks the tie for drafts, which have no start date.
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
  });

  const counts = campaigns.length
    ? await prisma.response.groupBy({
        by: ['campaignId'],
        where: { subjectId, campaignId: { in: campaigns.map((campaign) => campaign.id) } },
        _count: true,
      })
    : [];
  const countOf = new Map(counts.map((row) => [row.campaignId, row._count]));

  const cycles: SubjectCycle[] = campaigns.map((campaign) => ({
    campaignId: campaign.id,
    campaignName: campaign.name,
    // Status is worked out in one place and asked for here, never re-implemented.
    status: statusOf(campaign),
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    closedAt: campaign.closedAt?.toISOString() ?? null,
    responseCount: countOf.get(campaign.id) ?? 0,
  }));

  return { ...toSummary(subject), cycles };
}

// Creates a subject in a unit, optionally linked to a person's account.
export async function createSubject(
  req: Request,
  orgId: string,
  body: CreateSubjectBody,
): Promise<SubjectSummary> {
  const unit = await prisma.node.findFirst({
    where: { id: body.unitId, orgId, kind: 'unit' },
    select: { id: true },
  });
  if (!unit) throw new NotFoundError(`That ${nounsOf(req).unit.one.toLowerCase()} does not exist.`);

  // The organisation-wide subject type is reserved. Anyone could otherwise mint a subject that made
  // their own campaign visible to the whole organisation - a permission written in a text column.
  // It answers 422 rather than quietly substituting another type.
  if (body.type === ORGANISATION_SUBJECT) {
    throw new ValidationError(
      new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['body', 'type'],
          message: `'${ORGANISATION_SUBJECT}' is reserved`,
        },
      ]),
    );
  }

  if (body.linkedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: body.linkedUserId, orgId },
      select: { id: true },
    });
    if (!user) throw new NotFoundError('That person does not exist.');
  }

  return runInTransaction(req, async (tx) => {
    const subject = await tx.subject.create({
      data: {
        orgId,
        name: body.name,
        type: body.type,
        unitId: body.unitId,
        ...(body.linkedUserId ? { linkedUserId: body.linkedUserId } : {}),
      },
      select: subjectSelect,
    });
    req.ctx.audit.push({ action: 'subject.create', targetType: 'subject', targetId: subject.id });
    return toSummary(subject);
  });
}

// Renames a subject or moves it to another unit.
export async function updateSubject(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  subjectId: string,
  body: UpdateSubjectBody,
): Promise<SubjectSummary> {
  await assertVisible(orgId, userId, authzVersion, subjectId, 'subject.update');

  if (body.unitId) {
    const unit = await prisma.node.findFirst({
      where: { id: body.unitId, orgId, kind: 'unit' },
      select: { id: true },
    });
    if (!unit) throw new NotFoundError(`That ${nounsOf(req).unit.one.toLowerCase()} does not exist.`);
  }

  return runInTransaction(req, async (tx) => {
    const subject = await tx.subject.update({
      where: { id: subjectId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.unitId !== undefined ? { unitId: body.unitId } : {}),
        ...(body.linkedUserId !== undefined ? { linkedUserId: body.linkedUserId } : {}),
      },
      select: subjectSelect,
    });
    req.ctx.audit.push({ action: 'subject.update', targetType: 'subject', targetId: subjectId });
    return toSummary(subject);
  });
}

// Archive, never delete.
// An archived subject drops out of new audiences and still appears in past results, which is what
// somebody looking at last year's numbers expects.
export async function archiveSubject(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  subjectId: string,
): Promise<SubjectSummary> {
  const subject = await assertVisible(orgId, userId, authzVersion, subjectId, 'subject.archive');
  if (subject.archivedAt) throw new ConflictError('That one is already archived.');

  return runInTransaction(req, async (tx) => {
    const archived = await tx.subject.update({
      where: { id: subjectId },
      data: { archivedAt: new Date() },
      select: subjectSelect,
    });
    req.ctx.audit.push({ action: 'subject.archive', targetType: 'subject', targetId: subjectId });
    return toSummary(archived);
  });
}

// Helpers.

// A subject is anchored to a unit, so its scope can be checked directly. 404, not 403, so a stranger cannot confirm it exists.
async function assertVisible(
  orgId: string,
  userId: string,
  authzVersion: number,
  subjectId: string,
  capability: 'subject.read' | 'subject.update' | 'subject.archive',
): Promise<SubjectRow> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, orgId },
    select: subjectSelect,
  });
  if (!subject) throw new NotFoundError('That one does not exist.');

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  if (visibility.all) return subject;
  if (subject.unitId && visibility.unitIds.includes(subject.unitId)) return subject;
  throw new NotFoundError('That one does not exist.');
}

const subjectSelect = {
  id: true,
  name: true,
  type: true,
  unitId: true,
  linkedUserId: true,
  archivedAt: true,
  createdAt: true,
  unit: { select: { name: true } },
  linkedUser: { select: { name: true } },
  // Counted in the same query, so an 18-row list is still one request.
  _count: { select: { responses: true } },
  campaigns: {
    select: {
      campaign: {
        select: { publicToken: true, closedAt: true, startsAt: true, endsAt: true },
      },
    },
  },
  responses: {
    take: 1,
    orderBy: { submittedAt: 'desc' as const },
    select: { submittedAt: true },
  },
};

type SubjectRow = {
  id: string;
  name: string;
  type: string;
  unitId: string | null;
  linkedUserId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  unit: { name: string } | null;
  linkedUser: { name: string } | null;
  _count: { responses: number };
  campaigns: Array<{
    campaign: {
      publicToken: string | null;
      closedAt: Date | null;
      startsAt: Date | null;
      endsAt: Date | null;
    };
  }>;
  responses: Array<{ submittedAt: Date }>;
};

// Turns a subject row into the summary shape the client reads.
function toSummary(subject: SubjectRow): SubjectSummary {
  const now = Date.now();
  // Status is derived from the dates, here as everywhere, rather than read from a stored column.
  const activeCampaigns = subject.campaigns.filter(({ campaign }) => {
    if (campaign.closedAt) return false;
    if (!campaign.publicToken) return false;
    if (campaign.startsAt && campaign.startsAt.getTime() > now) return false;
    if (campaign.endsAt && campaign.endsAt.getTime() < now) return false;
    return true;
  }).length;

  return {
    id: subject.id,
    name: subject.name,
    type: subject.type,
    unitId: subject.unitId,
    unitName: subject.unit?.name ?? null,
    linkedUserId: subject.linkedUserId,
    linkedUserName: subject.linkedUser?.name ?? null,
    activeCampaigns,
    totalResponses: subject._count.responses,
    lastResponseAt: subject.responses[0]?.submittedAt.toISOString() ?? null,
    archivedAt: subject.archivedAt?.toISOString() ?? null,
    createdAt: subject.createdAt.toISOString(),
  };
}
