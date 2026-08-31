// Campaigns: a template pointed at some subjects, for a window of time.
import { CampaignAccess, estimateSeconds } from '@endur/shared';
import type {
  AudiencePreview,
  CampaignDetail,
  CampaignListQuery,
  CampaignSummary,
  CreateCampaignBody,
  LaunchResult,
  QuestionConfig,
  QuestionKind,
  QuickCampaignBody,
  UpdateCampaignBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction, type Tx } from '../../db/tx.js';
import { positionFilter, ruleOf } from './audience.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { nounsOf } from '../../lib/vocabulary.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { seesNothing, visibleUnits } from '../../authz/index.js';
import { config } from '../../lib/config.js';
import { statusOf, whereStatus } from './status.js';
import { mintToken, publicUrlFor } from './token.js';
import { campaignInScope, ORGANISATION_SUBJECT, scopeToCampaigns } from './visibility.js';

// Campaigns are scoped through their SUBJECTS' units, because a campaign has no unit of its own.
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
    // The rule lives in visibility.ts, because the home screen asks the same question.
    ...scopeToCampaigns(visibility),
    // Filtering on a derived status means writing the same rule as a database filter; status.ts keeps the two together.
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

// One campaign, with its template, subjects and counts.
export async function readCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.read');
  return {
    ...toSummary(campaign),
    // Read through ruleOf, not a bare cast, so an older row holding {} still renders.
    audience: ruleOf(campaign.audienceRule),
    subjects: campaign.subjects.map(({ subject }) => ({
      id: subject.id,
      name: subject.name,
      unitName: subject.unit?.name ?? null,
    })),
  };
}

// Creates a draft campaign over a template and some subjects.
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
    // A campaign with no questions collects nothing and looks like a broken link to whoever scans it.
    throw new ConflictError('That template has no questions yet.');
  }
  if (template.orgId === null) {
    // Library templates are shared, so a campaign must point at this org's own copy. Clone it first.
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
        // Two different things: audienceRule is the denominator for the response rate, access is the gate the public route enforces.
        access: body.access,
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

  return readCampaign(req, orgId, userId, 0, created);
}

// Edits a draft campaign.
export async function updateCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  body: UpdateCampaignBody,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.update');

  // Draft only: once answers can arrive, changing the audience or subjects would change what the numbers mean.
  if (statusOf(campaign) !== 'draft') {
    throw new ConflictError(
      `That ${nounsOf(req).campaign.one.toLowerCase()} has launched. It can be closed, but not edited.`,
    );
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
        // Draft only as well, and the database refuses this column on a launched campaign anyway.
        ...(body.access !== undefined ? { access: body.access } : {}),
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

  return readCampaign(req, orgId, userId, authzVersion, campaignId);
}

// Quick create: a poll or a suggestion box, launched in ONE transaction.
// Template, question, subject, campaign and token together, because doing it in four browser calls
// can half-fail on stage and leave a campaign with no QR code. There is no new entity underneath:
// a poll IS a campaign over a one-question template.
export async function quickCreate(
  req: Request,
  orgId: string,
  userId: string,
  body: QuickCampaignBody,
): Promise<CampaignDetail> {
  const poll = body.purpose === 'poll';
  const config: QuestionConfig = poll
    ? { kind: 'single', options: body.options as string[], allowOther: false }
    : { kind: 'text', multiline: true };
  const kind: QuestionKind = poll ? 'single' : 'text';

  const campaignId = await runInTransaction(req, async (tx) => {
    const subjectId = await organisationSubject(tx, orgId);

    const template = await tx.template.create({
      data: {
        orgId,
        name: body.name,
        // Data, not schema: this category and "one question" are the whole of what tells a poll from a feedback form.
        category: poll ? 'Poll' : 'Suggestion box',
        estimatedSeconds: estimateSeconds([kind]),
        questions: {
          create: [{ kind, text: body.name, config: config as never, required: true, position: 0 }],
        },
      },
      select: { id: true },
    });

    const campaign = await tx.campaign.create({
      data: {
        orgId,
        templateId: template.id,
        name: body.name,
        // A link, answerable by anyone holding it, and anonymous - all three are what this surface is for.
        audienceRule: { kind: 'anyone' },
        access: 'public',
        anonymous: true,
        ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        createdById: userId,
        // The token is minted by the same generator every other campaign uses, so there is no second one to keep in step.
        publicToken: mintToken(),
        subjects: { create: [{ subjectId }] },
      },
      select: { id: true },
    });

    // Two audit rows, because two things happened, and the launch is the irreversible one.
    req.ctx.audit.push({ action: 'template.create', targetType: 'template', targetId: template.id });
    req.ctx.audit.push({ action: 'campaign.launch', targetType: 'campaign', targetId: campaign.id });
    return campaign.id;
  });

  // Read without the visibility check on purpose: the caller made this row a line ago, and the organisation
  // subject has no unit, so re-checking could only produce a false negative.
  const created = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: campaignSelect,
  });
  return {
    ...toSummary(created),
    audience: ruleOf(created.audienceRule),
    subjects: created.subjects.map(({ subject }) => ({
      id: subject.id,
      name: subject.name,
      unitName: subject.unit?.name ?? null,
    })),
  };
}

// The organisation as a subject of itself, found or created once and then reused.
// A poll has no reviewee, and every results screen groups by subject, so a campaign with none renders empty.
async function organisationSubject(tx: Tx, orgId: string): Promise<string> {
  const existing = await tx.subject.findFirst({
    where: { orgId, type: ORGANISATION_SUBJECT, archivedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const org = await tx.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true },
  });
  const subject = await tx.subject.create({
    data: { orgId, name: org.name, type: ORGANISATION_SUBJECT },
    select: { id: true },
  });
  return subject.id;
}

export { ORGANISATION_SUBJECT } from './visibility.js';

// Launch: mints the public token, and cannot be undone.
// Idempotent by key and by state, so a double-click returns the same token rather than minting a second one.
export async function launchCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<LaunchResult> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.launch');

  if (campaign.publicToken) {
    return {
      publicToken: campaign.publicToken,
      url: publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken),
      status: statusOf(campaign),
    };
  }
  if (campaign.closedAt) {
    throw new ConflictError(`That ${nounsOf(req).campaign.one.toLowerCase()} has been closed.`);
  }

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
    // Derived, so a campaign launched with a future start date comes back as scheduled rather than open.
    status: statusOf({ ...campaign, publicToken: token }),
  };
}

// Closes a campaign, so it stops accepting answers.
export async function closeCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.close');
  const noun = nounsOf(req).campaign.one.toLowerCase();
  if (statusOf(campaign) === 'closed') throw new ConflictError(`That ${noun} is already closed.`);
  if (!campaign.publicToken) throw new ConflictError(`That ${noun} has not launched yet.`);

  await runInTransaction(req, async (tx) => {
    // The one stored transition. Everything else about status is read off the dates.
    await tx.campaign.update({ where: { id: campaignId }, data: { closedAt: new Date() } });
    req.ctx.audit.push({
      action: 'campaign.close',
      targetType: 'campaign',
      targetId: campaignId,
    });
  });

  return readCampaign(req, orgId, userId, authzVersion, campaignId);
}

// How many people this campaign is for, resolved against the org graph.
// 'anyone' has no countable audience, so this screen shows the subject count instead - "0" beside an open
// audience would read as a broken rule rather than an unbounded one.
export async function audiencePreview(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<AudiencePreview> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.read');
  const rule = ruleOf(campaign.audienceRule);

  if (rule.kind === 'anyone') {
    // The response-rate card does NOT make this substitution; only this preview does, and it is visible here.
    return {
      estimatedCount: campaign.subjects.length,
      sample: campaign.subjects.slice(0, 5).map(({ subject }) => ({
        id: subject.id,
        name: subject.name,
      })),
    };
  }

  const people = await prisma.node.findMany({
    where: {
      orgId,
      kind: 'person',
      // The shared filter, so this and the count above cannot drift apart.
      edgesAsParent: { some: { type: 'member', child: await positionFilter(orgId, rule) } },
    },
    select: { id: true, name: true },
    take: 500,
  });

  return {
    estimatedCount: people.length,
    sample: people.slice(0, 5),
  };
}

// Helpers.

async function assertVisible(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'campaign.read' | 'campaign.update' | 'campaign.launch' | 'campaign.close',
): Promise<CampaignRow> {
  // Both refusals below say the same sentence, in the organisation's own noun.
  const missing = `That ${nounsOf(req).campaign.one.toLowerCase()} does not exist.`;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: campaignSelect,
  });
  if (!campaign) throw new NotFoundError(missing);

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  if (campaignInScope(campaign.subjects, visibility)) return campaign;

  // 404, not 403: a 403 would confirm the campaign exists to somebody outside its scope.
  throw new NotFoundError(missing);
}

const campaignSelect = {
  id: true,
  name: true,
  templateId: true,
  audienceRule: true,
  anonymous: true,
  access: true,
  startsAt: true,
  endsAt: true,
  closedAt: true,
  publicToken: true,
  createdAt: true,
  template: { select: { name: true, category: true } },
  _count: { select: { responses: true } },
  subjects: {
    select: {
      // The subject's type is selected for the visibility rule, not for the response body.
      subject: {
        select: { id: true, name: true, unitId: true, type: true, unit: { select: { name: true } } },
      },
    },
  },
};

type CampaignRow = {
  id: string;
  name: string;
  templateId: string;
  audienceRule: unknown;
  anonymous: boolean;
  access: string;
  startsAt: Date | null;
  endsAt: Date | null;
  closedAt: Date | null;
  publicToken: string | null;
  createdAt: Date;
  template: { name: string; category: string };
  _count: { responses: number };
  subjects: Array<{
    subject: {
      id: string;
      name: string;
      unitId: string | null;
      type: string;
      unit: { name: string } | null;
    };
  }>;
};

// Turns a campaign row into the summary shape the client reads.
function toSummary(campaign: CampaignRow): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    // Derived on every read, so there is no column that can go stale.
    status: statusOf(campaign),
    templateId: campaign.templateId,
    templateName: campaign.template.name,
    // Data, not schema: the category is what the console reads to tell a quick campaign from a feedback round.
    templateCategory: campaign.template.category,
    subjectCount: campaign.subjects.length,
    responseCount: campaign._count.responses,
    // The anonymity threshold these results will be held behind, sent so a card can say WHY it shows nothing.
    resultsThreshold: config.K_ANON_THRESHOLD,
    anonymous: campaign.anonymous,
    // Parsed rather than cast, so a row written by a seed or a migration cannot put an unknown mode in front of the client.
    access: CampaignAccess.catch('public').parse(campaign.access),
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    closedAt: campaign.closedAt?.toISOString() ?? null,
    publicToken: campaign.publicToken,
    // A draft has no token, and therefore no URL anybody could open.
    url: campaign.publicToken
      ? publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken)
      : null,
    createdAt: campaign.createdAt.toISOString(),
  };
}
