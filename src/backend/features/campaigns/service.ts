// Campaigns. 13 § Campaigns, 38, DEC-016, DEC-017.
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
    // DEC-093. The rule lives in visibility.ts because home/service.ts asks the same
    // question, and a predicate written twice is a predicate fixed once.
    ...scopeToCampaigns(visibility),
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
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.read');
  return {
    ...toSummary(campaign),
    // Through ruleOf, not a bare cast: the column is JSONB and holds `{}` on rows that
    // predate the discriminated union. A client switching on `audience.kind` renders
    // nothing at all for those.
    audience: ruleOf(campaign.audienceRule),
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
        // Two axes, written together. `audienceRule` is the denominator the response-rate
        // card divides by; `access` is the gate the public route enforces (38, DEC-037).
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

export async function updateCampaign(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  body: UpdateCampaignBody,
): Promise<CampaignDetail> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.update');

  // Draft only (13 §3). Once responses can arrive, changing the audience or the subjects
  // would make the numbers already collected mean something different.
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
        // Draft only, like everything else here — the status check above already refused a
        // launched campaign, and the trigger refuses this column even if it had not.
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

/**
 * QUICK CREATE — a poll or a suggestion box, launched in ONE transaction (DEC-089).
 *
 * Template, question, subject, campaign and token, composed here rather than in the
 * browser. Composed in the browser it is four round trips that can half-fail, and the
 * failure lands on stage: an orphan template, or a campaign with no token and a QR code
 * that never appears. Here it either produces a launched campaign or produces nothing.
 *
 * There is no new entity underneath this (DEC-088). A poll IS a campaign over a
 * one-question template; the category is the only thing that says which kind of thing the
 * console should call it.
 */
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
        // DATA, not schema. This string and `questionCount === 1` are the whole of what
        // tells a poll from a feedback form (DEC-088) — there is no type column and there
        // is not going to be one.
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
        // A link, answerable by anyone holding it, and anonymous. All three are what the
        // surface is FOR; none of them is a default worth making the presenter choose.
        audienceRule: { kind: 'anyone' },
        access: 'public',
        anonymous: true,
        ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        createdById: userId,
        // The token is minted HERE, by the same generator every other campaign uses
        // (DEC-017) — there must not be a second one to keep in step.
        publicToken: mintToken(),
        subjects: { create: [{ subjectId }] },
      },
      select: { id: true },
    });

    // Two rows, because two things happened, and the second is the irreversible one. An
    // activity log that shows only `campaign.quick` would hide the launch from the one
    // screen that exists to make launches visible (56).
    req.ctx.audit.push({ action: 'template.create', targetType: 'template', targetId: template.id });
    req.ctx.audit.push({ action: 'campaign.launch', targetType: 'campaign', targetId: campaign.id });
    return campaign.id;
  });

  // Read WITHOUT assertVisible, deliberately. The caller just created this row and passed
  // `campaign.launch` to get here; the singleton subject has no unit, so a scoped reader
  // would fail the unit check on a campaign they made one line ago. Re-authorising it can
  // only produce a false negative.
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

/**
 * The organisation as a subject of itself — found, or created once and reused.
 *
 * A poll has no reviewee, and `CreateCampaignBody.subjectIds` requires at least one. The
 * temptation is to relax that bound; the reason not to is that every results screen groups
 * by subject, so a campaign with none renders as an empty page rather than as a poll
 * (DEC-089). `type: 'organisation'` marks it as furniture rather than as something somebody
 * added on the Subjects screen.
 */
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
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'campaign.close');
  const noun = nounsOf(req).campaign.one.toLowerCase();
  if (statusOf(campaign) === 'closed') throw new ConflictError(`That ${noun} is already closed.`);
  if (!campaign.publicToken) throw new ConflictError(`That ${noun} has not launched yet.`);

  await runInTransaction(req, async (tx) => {
    // The ONE stored transition. Everything else about status is read off the dates.
    await tx.campaign.update({ where: { id: campaignId }, data: { closedAt: new Date() } });
    req.ctx.audit.push({
      action: 'campaign.close',
      targetType: 'campaign',
      targetId: campaignId,
    });
  });

  return readCampaign(req, orgId, userId, authzVersion, campaignId);
}

/**
 * How many people this campaign is actually for, resolved against the org graph.
 *
 * `anyone` has no countable audience — a link is a link — so it reports the number of
 * subjects instead of pretending to a headcount it cannot know. Saying "0" there would
 * read as a broken audience rather than an open one.
 */
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
    // countAudience() returns null here, correctly — a link has no roll. THIS screen still
    // needs a number, because "0" beside an open audience reads as a broken rule rather
    // than an unbounded one, so the substitution stays and stays visible. 40's response
    // RATE does not get the same courtesy; see countAudience.
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
      // The SHARED filter (T-094). This block used to be a second copy of countAudience's.
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

/* ---------------------------------------------------------------- helpers */

async function assertVisible(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'campaign.read' | 'campaign.update' | 'campaign.launch' | 'campaign.close',
): Promise<CampaignRow> {
  // Both throws below say the SAME thing, deliberately (13 §5) — and both say it in the
  // org's own noun (22 §6). Uniform and vocabulary-aware are not in tension: what must not
  // vary between the two branches is the answer, not the language it is written in.
  const missing = `That ${nounsOf(req).campaign.one.toLowerCase()} does not exist.`;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: campaignSelect,
  });
  if (!campaign) throw new NotFoundError(missing);

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  if (campaignInScope(campaign.subjects, visibility)) return campaign;

  // 404, not 403: a 403 would confirm the campaign exists to somebody outside its scope
  // and leak which parts of the organisation are collecting feedback (13 §5).
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
      // `type` is selected for the visibility rule, not for the DTO — an organisation
      // subject is the one that belongs to no unit on purpose (DEC-093).
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

function toSummary(campaign: CampaignRow): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    // Derived on every read (DEC-016). There is no column to be stale.
    status: statusOf(campaign),
    templateId: campaign.templateId,
    templateName: campaign.template.name,
    // DEC-088: data, not schema. 'Poll' and 'Suggestion box' are what the console reads to
    // tell a quick campaign from a feedback round.
    templateCategory: campaign.template.category,
    subjectCount: campaign.subjects.length,
    responseCount: campaign._count.responses,
    // The k-anonymity gate the results of this campaign will be held behind (INV-005). Sent
    // so a card that shows nothing can say WHY it shows nothing; the number stays the
    // server's, and the gate stays in SQL where it is enforced.
    resultsThreshold: config.K_ANON_THRESHOLD,
    anonymous: campaign.anonymous,
    // Through the parser rather than a bare cast: the column is TEXT with a CHECK, and a
    // row written outside the API (a seed, a migration) should not be able to put an
    // unknown mode in front of a client switching on it.
    access: CampaignAccess.catch('public').parse(campaign.access),
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
