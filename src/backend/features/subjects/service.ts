// Subjects. 13 § Subjects, 35, 10 §9.
import type {
  CreateSubjectBody,
  SubjectCycle,
  SubjectDetail,
  SubjectListQuery,
  SubjectSummary,
  UpdateSubjectBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { seesNothing, visibleUnits } from '../../authz/index.js';
import { statusOf } from '../campaigns/status.js';

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

/**
 * The summary plus its history. 35 § Interactions.
 *
 * The history is what "did anything actually change?" looks like in miniature, and it is
 * worth having now even though the Improve loop is P3 — a subject with three cycles and a
 * falling response count is a story an evaluator can read off the screen.
 *
 * Two queries, never one per row: the campaigns, then one grouped count across all of
 * them. A subject with twelve cycles must not cost thirteen round trips.
 */
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
    // Oldest first: a trend reads left to right, and `startsAt` is null for a draft, so
    // `createdAt` is the tiebreak that keeps unlaunched cycles in a sensible place.
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
    // The one place status is computed, asked for here rather than reimplemented (DEC-016).
    status: statusOf(campaign),
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    closedAt: campaign.closedAt?.toISOString() ?? null,
    responseCount: countOf.get(campaign.id) ?? 0,
  }));

  return { ...toSummary(subject), cycles };
}

export async function createSubject(
  req: Request,
  orgId: string,
  body: CreateSubjectBody,
): Promise<SubjectSummary> {
  const unit = await prisma.node.findFirst({
    where: { id: body.unitId, orgId, kind: 'unit' },
    select: { id: true },
  });
  if (!unit) throw new NotFoundError('That unit does not exist.');

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
    if (!unit) throw new NotFoundError('That unit does not exist.');
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

/**
 * Archive, never delete.
 *
 * A subject with responses attached must survive for the history to mean anything (10 §9).
 * An archived subject drops out of new campaign audiences and still appears in the results
 * of past ones — which is the behaviour somebody looking at last year's numbers expects,
 * and the behaviour a hard delete makes impossible.
 */
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

/* ---------------------------------------------------------------- helpers */

/**
 * A subject IS anchored to a unit, so the scope question can be answered directly — unlike
 * a person, whose units come from their positions. 404 rather than 403 for a subject
 * outside the caller's scope: a 403 would confirm it exists (13 §5).
 */
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
  // Counted in the SAME query, so an 18-row list stays one request (35).
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

function toSummary(subject: SubjectRow): SubjectSummary {
  const now = Date.now();
  // Status is derived, here as everywhere (DEC-016). "Active" is the same five lines the
  // campaign feature uses, asked of the dates rather than of a stored column.
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
