// The home dashboard: one endpoint, one round trip.
// A section the caller cannot read is ABSENT, not greyed out, so a junior user gets a smaller
// coherent page rather than a page full of locks.
import { CampaignAccess } from '@endur/shared';
import type { HomeView, StatWindow } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
// The same visibility rule the campaigns list uses, not a second copy of it.
import { scopeToCampaigns } from '../campaigns/visibility.js';
import { whereStatus } from '../campaigns/status.js';
import { countAudience, ruleOf } from '../campaigns/audience.js';
import { publicUrlFor } from '../campaigns/token.js';

// Everything the dashboard needs, in one call.
export async function readHome(
  orgId: string,
  userId: string,
  authzVersion: number,
  window: StatWindow = '30d',
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
          anonymous: true,
          access: true,
          publicToken: true,
          _count: { select: { subjects: true, responses: true } },
        },
      });

  const stats = await readStats(orgId, canReadResults, activeCampaigns.length, window);
  const view: HomeView = { stats, prompts: [], configured };

  // Each section appears only if the caller holds the capability behind it.
  if (!seesNothing(canReadCampaigns)) {
    view.activeCampaigns = activeCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      subjectCount: campaign._count.subjects,
      responseCount: campaign._count.responses,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      // Carried here so the Share button opens a QR immediately instead of after another request.
      url: campaign.publicToken
        ? publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken)
        : null,
      anonymous: campaign.anonymous,
      // One more column the query already reads, so the share sheet can warn about a members-only link.
      access: CampaignAccess.catch('public').parse(campaign.access),
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

// The sections.

// When a window starts, or null for "all time".
// Windows begin at MIDNIGHT, not "now minus 24 hours", so a count does not silently drop this morning's
// responses as the afternoon wears on. It is the server's midnight, which is honest for a single-timezone org.
export function windowStart(window: StatWindow, now: Date = new Date()): Date | null {
  if (window === 'all') return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (window === '7d') start.setDate(start.getDate() - 6);
  if (window === '30d') start.setDate(start.getDate() - 29);
  return start;
}

type CampaignFacts = {
  id: string;
  audienceRule: unknown;
  publicToken: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  closedAt: Date | null;
  _count: { subjects: number; responses: number };
};

// Was this campaign collecting at any point inside the window?
// It decides which campaigns are allowed into the response rate's denominator: one that closed in March
// would otherwise drag a rate measured over last week towards zero.
function collectedDuring(campaign: CampaignFacts, since: Date | null, now: Date): boolean {
  if (!campaign.publicToken) return false;
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return false;
  if (!since) return true;
  const ended = campaign.closedAt ?? campaign.endsAt;
  return ended === null || ended.getTime() >= since.getTime();
}

// The four stat cards, and the response rate behind them.
async function readStats(
  orgId: string,
  visibility: Visibility,
  activeCampaigns: number,
  window: StatWindow,
): Promise<HomeView['stats']> {
  if (seesNothing(visibility)) {
    // A legitimate state for a low-permission role, so it must not look like an error: an empty state, not four zero cards.
    return {
      window,
      responses: 0,
      subjectsCovered: 0,
      activeCampaigns: 0,
      responseRate: null,
      responsesEver: 0,
    };
  }

  const now = new Date();
  const since = windowStart(window, now);
  const scoped = { campaign: { orgId, ...scopeToCampaigns(visibility) } };
  const inWindow = since ? { submittedAt: { gte: since } } : {};

  const [responsesEver, responses, covered, campaigns] = await Promise.all([
    prisma.response.count({ where: scoped }),
    prisma.response.count({ where: { ...scoped, ...inWindow } }),
    prisma.response.findMany({
      where: { ...scoped, ...inWindow, NOT: { subjectId: null } },
      distinct: ['subjectId'],
      select: { subjectId: true },
    }),
    prisma.campaign.findMany({
      where: { orgId, ...scopeToCampaigns(visibility) },
      select: {
        id: true,
        audienceRule: true,
        publicToken: true,
        startsAt: true,
        endsAt: true,
        closedAt: true,
        _count: { select: { subjects: true, responses: true } },
      },
    }),
  ]);

  // The anonymity gate applies to these numbers too: home must not become a way to read a suppressed
  // campaign one aggregate at a time. Gated on the all-time total, so a campaign does not appear and
  // vanish again as the date range moves.
  const countable = campaigns.filter(
    (campaign) =>
      campaign._count.responses >= config.K_ANON_THRESHOLD &&
      collectedDuring(campaign, since, now),
  );

  return {
    window,
    responses,
    subjectsCovered: covered.length,
    activeCampaigns,
    responseRate: await orgResponseRate(orgId, countable, since),
    responsesEver,
  };
}

// Responses over people asked, across the campaigns where "people asked" is a real number and the
// campaign was actually running during the window.
// A campaign whose audience is an open link is dropped from BOTH sides, rather than counting its
// responses against everybody else's audience. With no countable audience there is simply no rate.
async function orgResponseRate(
  orgId: string,
  campaigns: CampaignFacts[],
  since: Date | null,
): Promise<number | null> {
  if (campaigns.length === 0) return null;

  const counted = await prisma.response.groupBy({
    by: ['campaignId'],
    where: {
      campaignId: { in: campaigns.map((campaign) => campaign.id) },
      ...(since ? { submittedAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });
  const inWindow = new Map(counted.map((row) => [row.campaignId, row._count._all]));

  let audience = 0;
  let responses = 0;

  for (const campaign of campaigns) {
    const size = await countAudience(orgId, ruleOf(campaign.audienceRule));
    if (size === null || size === 0) continue;
    audience += size;
    responses += inWindow.get(campaign.id) ?? 0;
  }

  return audience > 0 ? Math.round((responses / audience) * 100) / 100 : null;
}

type Comment = NonNullable<HomeView['recentComments']>[number];

// A few recent comments, from campaigns that are past the anonymity threshold.
async function readComments(orgId: string, visibility: Visibility): Promise<Comment[]> {
  // Only from campaigns already past the threshold: one comment from a three-response campaign here
  // would defeat the gate on the results page.
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

// Setup nudges, at most two, in priority order: no subjects, no campaigns, setup incomplete, over seats.
// A prompt for something the caller has no permission to do is never shown.
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


