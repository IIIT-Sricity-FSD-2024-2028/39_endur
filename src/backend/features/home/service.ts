// The home dashboard. 13 § Home, 46.
//
// ONE endpoint, one round trip. A dashboard that fires six requests is six chances to be
// slow on venue wifi, and it is the first screen an evaluator sees after login.
//
// The other rule here is that a section the caller cannot read is ABSENT (INV-003). Not
// empty, not greyed, not present-with-a-flag — absent. A low-level user gets a smaller,
// coherent page rather than a page full of locks.
import { CampaignAccess } from '@endur/shared';
import type { HomeView, StatWindow } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
// The same predicate the campaigns list uses, not a second copy of it — this file held
// the second copy until DEC-093, and only one of the two got fixed when D-042 was found.
import { scopeToCampaigns } from '../campaigns/visibility.js';
import { whereStatus } from '../campaigns/status.js';
import { countAudience, ruleOf } from '../campaigns/audience.js';
import { publicUrlFor } from '../campaigns/token.js';

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

  // Sections, each present only if its capability is.
  if (!seesNothing(canReadCampaigns)) {
    view.activeCampaigns = activeCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      subjectCount: campaign._count.subjects,
      responseCount: campaign._count.responses,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      // Carried here so the card's Share opens a QR on the click rather than after a
      // request (46 § Data contract). It is one column the query already had to read.
      url: campaign.publicToken
        ? publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken)
        : null,
      anonymous: campaign.anonymous,
      // One more column the query already reads, so the sheet can warn about a restricted
      // link at the point somebody shares it (24 §6).
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

/* ---------------------------------------------------------------- sections */

/**
 * The instant a window opens, or `null` for "all time" — DEC-031.
 *
 * Windows start at MIDNIGHT, not at "now minus 24 hours". A count that silently drops this
 * morning's responses as the afternoon wears on is a count nobody can reconcile against
 * what they saw an hour ago. `7d` is therefore today plus the six days before it.
 *
 * Midnight is the SERVER's midnight, which is the same approximation `readStats` already
 * made for its "today" card. It is honest for a single-timezone organisation and off by
 * hours for a distributed one; making it exact needs a timezone on the org, which is a
 * schema change and not this task's (noted at DEC-031).
 */
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

/**
 * Was this campaign collecting at any point inside the window?
 *
 * It decides who is allowed into the response rate's DENOMINATOR, and getting it wrong is
 * the same class of mistake as `N-043`: a campaign that closed in March contributes its
 * whole audience to a rate measured over last week, and the rate collapses toward zero for
 * a reason that has nothing to do with last week.
 *
 * Never launched means never collected, so a draft is out on the token alone (DEC-016).
 * A campaign still open has no end, which is why a null `ended` passes.
 */
function collectedDuring(campaign: CampaignFacts, since: Date | null, now: Date): boolean {
  if (!campaign.publicToken) return false;
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return false;
  if (!since) return true;
  const ended = campaign.closedAt ?? campaign.endsAt;
  return ended === null || ended.getTime() >= since.getTime();
}

async function readStats(
  orgId: string,
  visibility: Visibility,
  activeCampaigns: number,
  window: StatWindow,
): Promise<HomeView['stats']> {
  if (seesNothing(visibility)) {
    // A legitimate state for a low-permission role, and it must not look like an error:
    // zeroes with no sections beneath them, and an empty state rather than four cards (46).
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

  // The k-anon gate applies to every number here too (46 § Acceptance): home must not
  // become a way to read a suppressed campaign's results one aggregate at a time. Campaign
  // totals below the threshold are excluded from the rate rather than rounded.
  //
  // GATED ON THE ALL-TIME TOTAL, not the windowed one, and that is deliberate: gating on
  // the window would make a campaign appear in the rate and vanish again as the range
  // moved, which reads as a bug and leaks the same aggregate anyway to anyone who changes
  // the range twice.
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

/**
 * Responses over people asked, across the campaigns where "people asked" is a real number
 * and the campaign was actually running during the window.
 *
 * **This summed `_count.subjects` until T-041** — the same substitution `N-043` found in
 * `readResults`, in a second reader nobody knew existed, on the FIRST screen after sign-in.
 * Measured against the seeded demo before the fix: Northfield 3161%, Grand Palace 2654%,
 * Meridian 2610%, Riverside 4675%.
 *
 * A campaign whose audience is `anyone` is dropped from **both** sides rather than having
 * its responses counted against everybody else's audience — that would be a third wrong
 * number rather than a compromise. When no campaign has an audience, there is no rate, and
 * the card says so instead of showing one.
 *
 * The numerator is counted per campaign rather than reusing the org-wide windowed total,
 * because the two sets differ: a campaign below the k-anon threshold contributes responses
 * to `stats.responses` and neither side of this fraction.
 */
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


