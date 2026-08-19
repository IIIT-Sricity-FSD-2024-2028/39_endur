// Campaigns. 13 § Campaigns, 38, DEC-016, DEC-017.
import type {
  AudiencePreview,
  AudienceRule,
  CampaignDetail,
  CampaignListQuery,
  CampaignSummary,
  CreateCampaignBody,
  LaunchResult,
  UpdateCampaignBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { unitSubtree } from '../../db/graph.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { seesNothing, visibleUnits } from '../../authz/index.js';
import { config } from '../../lib/config.js';
import { statusOf, whereStatus } from './status.js';
import { mintToken, publicUrlFor } from './token.js';

/**
 * Campaigns are scoped through their SUBJECTS' units — a campaign has no unit of its own.
 * That is the honest reading of the model: a campaign is a template pointed at some
 * subjects, and the subjects are what live in the org graph.
 */
export async function listCampaigns(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: CampaignListQuery,
): Promise<Paged<CampaignSummary>> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'campaign.read', authzVersion });
  if (seesNothing(visibility)) {
    return { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } };
  }

  const where = {
    orgId,
    ...(visibility.all
      ? {}
      : { subjects: { some: { subject: { unitId: { in: visibility.unitIds } } } } }),
    // Filtering by a DERIVED status means restating the derivation in SQL. The alternative
    // — read every row and discard most of them — is worse, and status.ts keeps the two
    // statements next to each other so they are read together (DEC-016).
    ...(query.status ? whereStatus(query.status) : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where: { ...where, ...afterCursor(query.cursor) },
      take: query.limit + 1,
      orderBy: CURSOR_ORDER,
      select: campaignSelect,
    }),
    prisma.campaign.count({ where }),
  ]);

  return pageOf(rows, query.limit, total, toSummary);
}

export async function readCampaign(
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'campaign.read');
  return {
    ...toSummary(campaign),
    audience: campaign.audienceRule as AudienceRule,
    subjects: campaign.subjects.map(({ subject }) => ({
      id: subject.id,
      name: subject.name,
      unitName: subject.unit?.name ?? null,
    })),
  };
}

export async function createCampaign(
  req: Request,
  orgId: string,
  userId: string,
  body: CreateCampaignBody,
): Promise<CampaignDetail> {
  const template = await prisma.template.findFirst({
    where: { id: body.templateId, OR: [{ orgId }, { orgId: null }] },
    select: { id: true, orgId: true, _count: { select: { questions: true } } },
  });
  if (!template) throw new NotFoundError('That template does not exist.');
  if (template._count.questions === 0) {
    // A campaign with no questions collects nothing and cannot be told apart from a broken
    // link by the person who scans it.
    throw new ConflictError('That template has no questions yet.');
  }
  if (template.orgId === null) {
    // Library templates are shared; a campaign pointing at one would make every org's
    // responses hang off the same question rows. Clone first (36).
    throw new ConflictError('Clone that template into your organisation before using it.');
  }

  const subjects = await prisma.subject.findMany({
    where: { id: { in: body.subjectIds }, orgId, archivedAt: null },
    select: { id: true },
  });
  if (subjects.length !== body.subjectIds.length) {
    throw new NotFoundError('One of those does not exist, or has been archived.');
  }

  const created = await runInTransaction(req, async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        orgId,
        templateId: body.templateId,
        name: body.name,
        audienceRule: body.audience,
        anonymous: body.anonymous,
        ...(body.startsAt ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        createdById: userId,
        subjects: { create: body.subjectIds.map((subjectId) => ({ subjectId })) },
      },
      select: { id: true },
    });
    req.ctx.audit.push({
      action: 'campaign.create',
      targetType: 'campaign',
      targetId: campaign.id,
    });
    return campaign.id;
  });

  return readCampaign(orgId, userId, 0, created);
}

export async function updateCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  body: UpdateCampaignBody,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'campaign.update');

  // Draft only (13 §3). Once responses can arrive, changing the audience or the subjects
  // would make the numbers already collected mean something different.
  if (statusOf(campaign) !== 'draft') {
    throw new ConflictError('That campaign has launched. It can be closed, but not edited.');
  }

  await runInTransaction(req, async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.audience !== undefined ? { audienceRule: body.audience } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
        ...(body.anonymous !== undefined ? { anonymous: body.anonymous } : {}),
      },
    });
    if (body.subjectIds) {
      await tx.campaignSubject.deleteMany({ where: { campaignId } });
      await tx.campaignSubject.createMany({
        data: body.subjectIds.map((subjectId) => ({ campaignId, subjectId })),
      });
    }
    req.ctx.audit.push({
      action: 'campaign.update',
      targetType: 'campaign',
      targetId: campaignId,
    });
  });

  return readCampaign(orgId, userId, authzVersion, campaignId);
}

/**
 * Launch. Mints the public token, and is IRREVERSIBLE.
 *
 * Idempotent by key (13 §7), and idempotent by state as well: a campaign that already has
 * a token returns the same one. A double-click on stage must not mint a second token,
 * because the QR code already on the screen would then point at the wrong campaign.
 */
export async function launchCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<LaunchResult> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'campaign.launch');

  if (campaign.publicToken) {
    return {
      publicToken: campaign.publicToken,
      url: publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken),
      status: statusOf(campaign),
    };
  }
  if (campaign.closedAt) throw new ConflictError('That campaign has been closed.');

  const token = await runInTransaction(req, async (tx) => {
    const minted = mintToken();
    await tx.campaign.update({ where: { id: campaignId }, data: { publicToken: minted } });
    req.ctx.audit.push({
      action: 'campaign.launch',
      targetType: 'campaign',
      targetId: campaignId,
    });
    return minted;
  });

  return {
    publicToken: token,
    url: publicUrlFor(config.PUBLIC_BASE_URL, token),
    // Derived, so a campaign launched with a future start date correctly comes back
    // `scheduled` rather than `open` (DEC-016).
    status: statusOf({ ...campaign, publicToken: token }),
  };
}

export async function closeCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'campaign.close');
  if (statusOf(campaign) === 'closed') throw new ConflictError('That campaign is already closed.');
  if (!campaign.publicToken) throw new ConflictError('That campaign has not launched yet.');

  await runInTransaction(req, async (tx) => {
    // The ONE stored transition. Everything else about status is read off the dates.
    await tx.campaign.update({ where: { id: campaignId }, data: { closedAt: new Date() } });
    req.ctx.audit.push({
      action: 'campaign.close',
      targetType: 'campaign',
      targetId: campaignId,
    });
  });

  return readCampaign(orgId, userId, authzVersion, campaignId);
}

/**
 * How many people this campaign is actually for, resolved against the org graph.
 *
 * `anyone` has no countable audience — a link is a link — so it reports the number of
 * subjects instead of pretending to a headcount it cannot know. Saying "0" there would
 * read as a broken audience rather than an open one.
 */
export async function audiencePreview(
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<AudiencePreview> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'campaign.read');
  const rule = campaign.audienceRule as AudienceRule;

  if (rule.kind === 'anyone') {
    return {
      estimatedCount: campaign.subjects.length,
      sample: campaign.subjects.slice(0, 5).map(({ subject }) => ({
        id: subject.id,
        name: subject.name,
      })),
    };
  }

  const positionWhere =
    rule.kind === 'role'
      ? { roleId: rule.roleId }
      : {
          unitId: {
            in: rule.includeSubtree ? await unitSubtree(orgId, rule.unitId) : [rule.unitId],
          },
        };

  const people = await prisma.node.findMany({
    where: {
      orgId,
      kind: 'person',
      edgesAsParent: { some: { type: 'member', child: positionWhere } },
    },
    select: { id: true, name: true },
    take: 500,
  });

  return {
    estimatedCount: people.length,
    sample: people.slice(0, 5),
  };
}

/* ---------------------------------------------------------------- helpers */

async function assertVisible(
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'campaign.read' | 'campaign.update' | 'campaign.launch' | 'campaign.close',
): Promise<CampaignRow> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: campaignSelect,
  });
  if (!campaign) throw new NotFoundError('That campaign does not exist.');

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  if (visibility.all) return campaign;

  const units = campaign.subjects
    .map(({ subject }) => subject.unitId)
    .filter((unitId): unitId is string => Boolean(unitId));
  if (units.some((unitId) => visibility.unitIds.includes(unitId))) return campaign;

  // 404, not 403: a 403 would confirm the campaign exists to somebody outside its scope
  // and leak which departments are collecting feedback (13 §5).
  throw new NotFoundError('That campaign does not exist.');
}

const campaignSelect = {
  id: true,
  name: true,
  templateId: true,
  audienceRule: true,
  anonymous: true,
  startsAt: true,
  endsAt: true,
  closedAt: true,
  publicToken: true,
  createdAt: true,
  template: { select: { name: true } },
  _count: { select: { responses: true } },
  subjects: {
    select: {
      subject: { select: { id: true, name: true, unitId: true, unit: { select: { name: true } } } },
    },
  },
};

type CampaignRow = {
  id: string;
  name: string;
  templateId: string;
  audienceRule: unknown;
  anonymous: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  closedAt: Date | null;
  publicToken: string | null;
  createdAt: Date;
  template: { name: string };
  _count: { responses: number };
  subjects: Array<{
    subject: { id: string; name: string; unitId: string | null; unit: { name: string } | null };
  }>;
};

function toSummary(campaign: CampaignRow): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    // Derived on every read (DEC-016). There is no column to be stale.
    status: statusOf(campaign),
    templateId: campaign.templateId,
    templateName: campaign.template.name,
    subjectCount: campaign.subjects.length,
    responseCount: campaign._count.responses,
    anonymous: campaign.anonymous,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    closedAt: campaign.closedAt?.toISOString() ?? null,
    publicToken: campaign.publicToken,
    // A draft has no token and therefore no reachable URL (38 § Acceptance).
    url: campaign.publicToken
      ? publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken)
      : null,
    createdAt: campaign.createdAt.toISOString(),
  };
}
