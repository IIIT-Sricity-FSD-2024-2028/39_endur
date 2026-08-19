// The home dashboard. 13 § Home, 46.
//
// ONE endpoint, one round trip. A dashboard that fires six requests is six chances to be
// slow on venue wifi, and it is the first screen an evaluator sees after login.
//
// The other rule here is that a section the caller cannot read is ABSENT (INV-003). Not
// empty, not greyed, not present-with-a-flag — absent. A low-level user gets a smaller,
// coherent page rather than a page full of locks.
import type { HomeView } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
import { whereStatus } from '../campaigns/status.js';

export async function readHome(
  orgId: string,
  userId: string,
  authzVersion: number,
): Promise<HomeView> {
  const ask = (capability: Parameters<typeof visibleUnits>[0]['capability']) =>
    visibleUnits({ orgId, userId, capability, authzVersion });

  const [org, canReadCampaigns, canReadResults, canReadResponses, canCreateSubjects] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { settings: true },
      }),
      ask('campaign.read'),
      ask('results.read'),
      ask('response.read'),
      ask('subject.create'),
    ]);

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const configured = typeof settings.setupCompletedAt === 'string';

  const campaignWhere = {
    orgId,
    ...scopeToCampaigns(canReadCampaigns),
    ...whereStatus('open'),
  };

  const activeCampaigns = seesNothing(canReadCampaigns)
    ? []
    : await prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          endsAt: true,
          _count: { select: { subjects: true, responses: true } },
        },
      });

  const stats = await readStats(orgId, canReadResults, activeCampaigns.length);
  const view: HomeView = { stats, prompts: [], configured };

  // Sections, each present only if its capability is.
  if (!seesNothing(canReadCampaigns)) {
    view.activeCampaigns = activeCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      subjectCount: campaign._count.subjects,
      responseCount: campaign._count.responses,
      endsAt: campaign.endsAt?.toISOString() ?? null,
    }));
  }

  if (!seesNothing(canReadResponses)) {
    view.recentComments = await readComments(orgId, canReadResponses);
  }

  view.prompts = await buildPrompts(orgId, {
    configured,
    canCreateSubjects: !seesNothing(canCreateSubjects),
    hasCampaigns: activeCampaigns.length > 0,
  });

  return view;
}

/* ---------------------------------------------------------------- sections */

async function readStats(
  orgId: string,
  visibility: Visibility,
  activeCampaigns: number,
): Promise<HomeView['stats']> {
  if (seesNothing(visibility)) {
    // A legitimate state for a low-permission role, and it must not look like an error:
    // zeroes with no sections beneath them, and an empty state rather than four cards (46).
    return { responsesTotal: 0, responsesToday: 0, activeCampaigns: 0, responseRate: null };
  }

  const scoped = { campaign: { orgId, ...scopeToCampaigns(visibility) } };
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const [total, today, campaignsWithCounts] = await Promise.all([
    prisma.response.count({ where: scoped }),
    prisma.response.count({ where: { ...scoped, submittedAt: { gte: midnight } } }),
    prisma.campaign.findMany({
      where: { orgId, ...scopeToCampaigns(visibility) },
      select: { _count: { select: { subjects: true, responses: true } } },
    }),
  ]);

  // The k-anon gate applies to every number here too (46 § Acceptance): home must not
  // become a way to read a suppressed campaign's results one aggregate at a time. Campaign
  // totals below the threshold are excluded from the rate rather than rounded.
  const countable = campaignsWithCounts.filter(
    (campaign) => campaign._count.responses >= config.K_ANON_THRESHOLD,
  );
  const audience = countable.reduce((sum, campaign) => sum + campaign._count.subjects, 0);
  const responses = countable.reduce((sum, campaign) => sum + campaign._count.responses, 0);

  return {
    responsesTotal: total,
    responsesToday: today,
    activeCampaigns,
    responseRate: audience > 0 ? Math.round((responses / audience) * 100) / 100 : null,
  };
}

type Comment = NonNullable<HomeView['recentComments']>[number];

async function readComments(orgId: string, visibility: Visibility): Promise<Comment[]> {
  // Only from campaigns that are already past the threshold. Reading one comment from a
  // three-response campaign on the dashboard would defeat the gate on the results page.
  const open = await prisma.campaign.findMany({
    where: { orgId, ...scopeToCampaigns(visibility) },
    select: { id: true, _count: { select: { responses: true } } },
  });
  const eligible = open
    .filter((campaign) => campaign._count.responses >= config.K_ANON_THRESHOLD)
    .map((campaign) => campaign.id);
  if (eligible.length === 0) return [];

  const answers = await prisma.answer.findMany({
    where: {
      question: { kind: 'text' },
      response: { campaignId: { in: eligible } },
    },
    orderBy: { response: { submittedAt: 'desc' } },
    take: 5,
    select: {
      value: true,
      response: { select: { submittedAt: true, subject: { select: { name: true } } } },
    },
  });

  return answers
    .map((answer) => ({
      text: (answer.value as { text?: string }).text ?? '',
      subjectName: answer.response.subject?.name ?? null,
      submittedAt: answer.response.submittedAt.toISOString(),
    }))
    .filter((comment) => comment.text.length > 0);
}

/**
 * Setup nudges, at most two, in priority order:
 *   no subjects → no campaigns → setup incomplete → over seats.
 *
 * A prompt for an action the caller cannot take is not shown — telling somebody to add
 * something they have no permission to add is worse than saying nothing.
 */
async function buildPrompts(
  orgId: string,
  context: { configured: boolean; canCreateSubjects: boolean; hasCampaigns: boolean },
): Promise<HomeView['prompts']> {
  const prompts: HomeView['prompts'] = [];

  if (!context.configured) {
    prompts.push({ kind: 'setup_incomplete', href: '/app/setup' });
  }

  const subjects = await prisma.subject.count({ where: { orgId, archivedAt: null } });
  if (subjects === 0 && context.canCreateSubjects) {
    prompts.unshift({ kind: 'no_subjects', href: '/app/subjects' });
  } else if (!context.hasCampaigns && subjects > 0) {
    prompts.push({ kind: 'no_campaigns', href: '/app/campaigns' });
  }

  return prompts.slice(0, 2);
}

/** A campaign is reachable through its subjects' units — it has no unit of its own. */
const scopeToCampaigns = (visibility: Visibility) =>
  visibility.all
    ? {}
    : { subjects: { some: { subject: { unitId: { in: visibility.unitIds } } } } };
