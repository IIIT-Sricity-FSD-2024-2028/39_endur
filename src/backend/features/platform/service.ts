// The estate, as numbers. 19 §5, 70 § Data contract.
//
// Every query in this file runs through `platformClient()`, and that is not a style choice:
// it is what makes INV-011 a property of the code rather than a promise about the code. If
// a handler here ever asks for content, the seam throws a `PlatformSeamViolation` — a
// programming error, deliberately not a 403, because an INV-011 breach is a line to delete
// rather than a refusal to render.
import type { Request } from 'express';
import type {
  AnalyticsQuery,
  EarningsQuery,
  EstateQuery,
  LogExportQuery,
  LogFileMeta,
  LogLine,
  LogStoreMeta,
  LogReadQuery,
  PlatformAnalytics,
  PlatformAuditEntry,
  PlatformEarnings,
  PlatformOperator,
  PlatformOrgDetail,
  PlatformOrgSummary,
  PlatformStats,
  Tier,
} from '@endur/shared';
import { TIERS, isQuietOrg } from '@endur/shared';
import type { PaymentKind } from '@endur/shared';
import { platformClient } from '../../platform/db.js';
import { writeAudit } from '../../platform/audit.js';
import { hashPassword } from '../../auth/password.js';
import { generateSecret, otpauthUrl } from '../../platform/totp.js';
import { listLogFiles, readLogFile, exportLogFile } from '../../platform/logs/index.js';
import { logDir, logToFile } from '../../lib/logger.js';
import { config } from '../../lib/config.js';
import type { LogExportResult } from '../../platform/logs/index.js';
import { ConflictError, NotFoundError, UnauthenticatedError } from '../../lib/errors.js';
import { afterCursor, encodeCursor, decodeCursor, type Paged } from '../../lib/paginate.js';

const db = platformClient();

const DAY = 24 * 60 * 60 * 1000;
const thirtyDaysAgo = () => new Date(Date.now() - 30 * DAY);

/**
 * A campaign that is LAUNCHED, not closed, and not past its end date. Deliberately derived
 * here rather than imported from `features/campaigns/status.ts`: that module reads a
 * tenant-bound row and this one counts across every tenant at once, and the two would have
 * to agree about a shape neither can see. The definition is small enough to state, and
 * stating it is honest about the seam.
 */
const activeCampaignWhere = (now: Date) => ({
  publicToken: { not: null },
  closedAt: null,
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  suspendedAt: Date | null;
  createdAt: Date;
  subscription: { tier: string; status: string; seats: number } | null;
};

/**
 * Seats, computed live from `16` §5's formula rather than read from `subscriptions.seats`.
 *
 * The cached column is `T-057`'s job and nothing has ever written it (`D-012`'s sibling),
 * so reading it here would show 0 seats for every organisation on the estate list and look
 * like a broken screen rather than an unbuilt meter. Computing it is two counts.
 */
async function seatsFor(orgIds: string[]): Promise<Map<string, number>> {
  if (orgIds.length === 0) return new Map();
  const [users, subjects] = await Promise.all([
    db.user.groupBy({
      by: ['orgId'],
      where: { orgId: { in: orgIds }, status: 'active' },
      _count: { _all: true },
    }),
    db.subject.groupBy({
      by: ['orgId'],
      // Non-person subjects only: one with `linkedUserId` is already counted as a user
      // above, and double-counting it would overstate a customer's bill.
      where: { orgId: { in: orgIds }, linkedUserId: null, archivedAt: null },
      _count: { _all: true },
    }),
    ]);
  const seats = new Map<string, number>();
  for (const row of [...users, ...subjects]) {
    seats.set(row.orgId, (seats.get(row.orgId) ?? 0) + row._count._all);
  }
  return seats;
}

/**
 * `responses` HAS NO `org_id` — it is reached through its campaign (10 §8), which is
 * exactly what makes `db/tenant.ts`'s "scoping the parent scopes the child" true. So the
 * estate's two response numbers are grouped by campaign and folded back, rather than asked
 * of a column that does not exist.
 *
 * Both are still COUNT(*) and MAX(), which is the whole of what INV-011 permits.
 */
async function responseFacts(orgIds: string[]) {
  const campaigns = await db.campaign.findMany({
    where: { orgId: { in: orgIds } },
    select: { id: true, orgId: true },
  });
  const orgOf = new Map(campaigns.map((row) => [row.id, row.orgId]));
  const campaignIds = [...orgOf.keys()];

  const recent = new Map<string, number>();
  const lastAt = new Map<string, Date | null>();
  if (campaignIds.length === 0) return { recent, lastAt };

  const [counts, maxima] = await Promise.all([
    db.response.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaignIds }, submittedAt: { gte: thirtyDaysAgo() } },
      _count: { _all: true },
    }),
    db.response.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaignIds } },
      _max: { submittedAt: true },
    }),
  ]);

  for (const row of counts) {
    const orgId = orgOf.get(row.campaignId);
    if (orgId) recent.set(orgId, (recent.get(orgId) ?? 0) + row._count._all);
  }
  for (const row of maxima) {
    const orgId = orgOf.get(row.campaignId);
    const at = row._max.submittedAt;
    if (!orgId || !at) continue;
    const current = lastAt.get(orgId);
    if (!current || at > current) lastAt.set(orgId, at);
  }
  return { recent, lastAt };
}

async function summarise(rows: OrgRow[]): Promise<PlatformOrgSummary[]> {
  const ids = rows.map((row) => row.id);
  const now = new Date();
  const [seats, campaigns, responses] = await Promise.all([
    seatsFor(ids),
    db.campaign.groupBy({
      by: ['orgId'],
      where: { orgId: { in: ids }, ...activeCampaignWhere(now) },
      _count: { _all: true },
    }),
    responseFacts(ids),
  ]);

  const campaignCount = new Map(campaigns.map((row) => [row.orgId, row._count._all]));
  const responseCount = responses.recent;
  const lastAt = responses.lastAt;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    industry: row.industry,
    tier: (row.subscription?.tier ?? 'bronze') as Tier,
    subscriptionStatus: row.subscription?.status ?? 'none',
    seats: seats.get(row.id) ?? 0,
    // `null` and not a number, because there is no seat LIMIT in the product: `16` §6
    // describes over-limit behaviour and `T-057` is what would set the ceiling. A zero
    // here would render as "over seats" for every customer, which is worse than absent.
    seatLimit: null,
    activeCampaigns: campaignCount.get(row.id) ?? 0,
    responsesLast30d: responseCount.get(row.id) ?? 0,
    lastActivityAt: (lastAt.get(row.id) ?? null)?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  industry: true,
  suspendedAt: true,
  createdAt: true,
  subscription: { select: { tier: true, status: true, seats: true } },
} as const;

export async function estate(query: EstateQuery): Promise<Paged<PlatformOrgSummary>> {
  const where = {
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    ...(query.industry ? { industry: query.industry } : {}),
    ...(query.tier || query.status
      ? {
          subscription: {
            ...(query.tier ? { tier: query.tier } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
        }
      : {}),
  };

  // Cursor pagination on `createdAt`, like every other list (13 §4). The estate list SORTS
  // by last activity ascending in the UI (70), but paginating on an aggregate of another
  // table is not a cursor — the client sorts the page it was given, and the filters are
  // what narrow the estate rather than the scroll.
  const after = afterCursor(query.cursor);

  const [rows, total] = await Promise.all([
    db.organization.findMany({
      where: { ...where, ...after },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: ORG_SELECT,
    }),
    db.organization.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: await summarise(page),
    page: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    },
    meta: { total },
  };
}

export async function orgDetail(id: string): Promise<PlatformOrgDetail> {
  const row = await db.organization.findUnique({ where: { id }, select: ORG_SELECT });
  if (!row) throw new NotFoundError();
  const [summary] = await summarise([row]);
  if (!summary) throw new NotFoundError();

  const [units, roles, people, subjects, campaigns, responses, administrators, history] =
    await Promise.all([
      db.node.count({ where: { orgId: id, kind: 'unit' } }),
      db.node.count({ where: { orgId: id, kind: 'role' } }),
      db.user.count({ where: { orgId: id } }),
      db.subject.count({ where: { orgId: id, archivedAt: null } }),
      db.campaign.count({ where: { orgId: id } }),
      // Through the campaign, because `responses` carries no `org_id` (10 §8).
      db.response.count({ where: { campaign: { orgId: id } } }),
      administratorsOf(id),
      db.platformAuditLog.findMany({
        where: { targetOrgId: id, action: 'plan.override' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, payload: true, actor: { select: { name: true } } },
      }),
    ]);

  return {
    ...summary,
    counts: { units, roles, people, subjects, campaigns, responses },
    administrators,
    planHistory: history.map((entry) => ({
      at: entry.createdAt.toISOString(),
      tier: ((entry.payload as { to?: string } | null)?.to ?? 'bronze') as Tier,
      by: entry.actor.name,
    })),
  };
}

/**
 * Who to contact — resolved SERVER-SIDE from who holds `org.update`, never supplied by the
 * client (70 § Acceptance). An operator typing an address is an operator who can typo a
 * customer's plan details to a stranger.
 *
 * A grants query rather than the resolver: the resolver answers "may THIS person do this
 * HERE" one user at a time, and the question here is "who, in this organisation" — for
 * which an allow-grant on `org.update` held by a role that somebody occupies, or by their
 * person node directly, is the honest approximation. It over-reports nobody: a deny would
 * make one of these people unable to act, and a support email reaching one extra
 * administrator is not a failure.
 */
async function administratorsOf(orgId: string): Promise<Array<{ id: string; name: string; email: string }>> {
  const grants = await db.grant.findMany({
    where: {
      orgId,
      capability: 'org.update',
      effect: 'allow',
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
    },
    select: { subjectId: true },
  });
  if (grants.length === 0) return [];
  const subjectIds = grants.map((grant) => grant.subjectId);

  // A POSITION carries no `user_id` — the person does, and a `member` edge joins the two
  // (10 §4). So the role-granted case is TWO HOPS, and writing it as one was the bug the
  // administrators test caught: every organisation reported having nobody to contact.
  const positions = await db.node.findMany({
    where: { orgId, kind: 'position', roleId: { in: subjectIds } },
    select: { id: true },
  });
  const memberships = await db.edge.findMany({
    where: { orgId, type: 'member', childId: { in: positions.map((row) => row.id) } },
    select: { parentId: true },
  });

  const holders = await db.node.findMany({
    where: {
      orgId,
      kind: 'person',
      userId: { not: null },
      OR: [
        // Granted to the person node directly.
        { id: { in: subjectIds } },
        // Or holding a position whose ROLE was granted it — the common case (11 §3).
        { id: { in: memberships.map((row) => row.parentId) } },
      ],
    },
    select: { user: { select: { id: true, name: true, email: true, status: true } } },
  });

  const seen = new Map<string, { id: string; name: string; email: string }>();
  for (const holder of holders) {
    const user = holder.user;
    if (!user || user.status !== 'active') continue;
    seen.set(user.id, { id: user.id, name: user.name, email: user.email });
  }
  return [...seen.values()];
}

export async function stats(): Promise<PlatformStats> {
  const now = new Date();
  const [organizations, suspended, tiers, campaigns, responses, orgIds] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { suspendedAt: { not: null } } }),
    db.subscription.groupBy({ by: ['tier'], _count: { _all: true } }),
    db.campaign.count({ where: activeCampaignWhere(now) }),
    db.response.count(),
    db.organization.findMany({ select: { id: true } }),
  ]);

  const byTier = Object.fromEntries(TIERS.map((tier) => [tier, 0])) as Record<Tier, number>;
  for (const row of tiers) byTier[row.tier as Tier] = row._count._all;
  // An org with no subscription row reads as bronze everywhere else (D-012), so it reads
  // as bronze here too rather than vanishing from the tier mix.
  const withRow = tiers.reduce((sum, row) => sum + row._count._all, 0);
  byTier.bronze += organizations - withRow;

  const seats = await seatsFor(orgIds.map((row) => row.id));
  return {
    organizations,
    suspended,
    byTier,
    seats: [...seats.values()].reduce((sum, value) => sum + value, 0),
    campaigns,
    responses,
  };
}

// ---------------------------------------------------------------------------
// Analytics. `71` — the estate at once, for the owner. `T-067`.
// ---------------------------------------------------------------------------

/** `YYYY-MM` or `YYYY-Qn`, so a period is both sortable as a string and readable as a label. */
function periodKeyOf(date: Date, granularity: 'month' | 'quarter'): string {
  if (granularity === 'quarter') {
    return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The ordered list of period keys covering `[from, to]`, inclusive — so a period with no
 *  activity still renders as a zero row rather than vanishing from the table (`71` decision 2:
 *  movement is reported per period, and a missing period reads as "nothing happened" only if
 *  it is actually there to read). */
function periodsBetween(from: Date, to: Date, granularity: 'month' | 'quarter'): string[] {
  const step = granularity === 'quarter' ? 3 : 1;
  const periods: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= end) {
    const key = periodKeyOf(cursor, granularity);
    if (periods[periods.length - 1] !== key) periods.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }
  return periods;
}

const TIER_RANK = new Map(TIERS.map((tier, index) => [tier, index]));

export async function analytics(query: AnalyticsQuery): Promise<PlatformAnalytics> {
  const now = new Date();
  const to = query.to ?? now;
  // Twelve months back by default (`71` § Interactions) — a year of monthly movement is the
  // window the owner opens the page to see, and quarter granularity reads the same range as
  // four quarters rather than a shorter one.
  const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const granularity = query.granularity;

  const [organizations, trialing, cancelled, tierRows, movementNew, planOverrides, suspensions] =
    await Promise.all([
      db.organization.count(),
      db.subscription.count({ where: { status: 'trialing' } }),
      db.subscription.count({ where: { status: 'cancelled' } }),
      // Excludes `trialing` — decision 1. An org with no subscription row folds into bronze,
      // the same convention `stats()` already uses (D-012).
      db.organization.findMany({
        where: { OR: [{ subscription: null }, { subscription: { status: { not: 'trialing' } } }] },
        select: { id: true, subscription: { select: { tier: true } } },
      }),
      db.organization.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      db.platformAuditLog.findMany({
        where: { action: 'plan.override', createdAt: { gte: from, lte: to } },
        select: { createdAt: true, payload: true },
      }),
      db.platformAuditLog.findMany({
        where: { action: 'org.suspend', createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
    ]);

  const joined = organizations - trialing - cancelled;

  const seats = await seatsFor(tierRows.map((row) => row.id));
  const byTierMap = new Map<Tier, { orgs: number; seats: number }>(
    TIERS.map((tier) => [tier, { orgs: 0, seats: 0 }]),
  );
  for (const row of tierRows) {
    const tier = (row.subscription?.tier ?? 'bronze') as Tier;
    const entry = byTierMap.get(tier);
    if (!entry) continue;
    entry.orgs += 1;
    entry.seats += seats.get(row.id) ?? 0;
  }
  const byTier = TIERS.map((tier) => ({ tier, ...byTierMap.get(tier)! }));

  const periods = periodsBetween(from, to, granularity);
  const movementMap = new Map(
    periods.map((period) => [period, { new: 0, upgraded: 0, downgraded: 0, churned: 0 }]),
  );
  for (const row of movementNew) {
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) bucket.new += 1;
  }
  for (const row of planOverrides) {
    const payload = row.payload as { from?: string; to?: string } | null;
    const fromRank = payload?.from ? TIER_RANK.get(payload.from as Tier) : undefined;
    const toRank = payload?.to ? TIER_RANK.get(payload.to as Tier) : undefined;
    if (fromRank === undefined || toRank === undefined || fromRank === toRank) continue;
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (!bucket) continue;
    if (toRank > fromRank) bucket.upgraded += 1;
    else bucket.downgraded += 1;
  }
  for (const row of suspensions) {
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) bucket.churned += 1;
  }
  const movement = periods.map((period) => ({ period, ...movementMap.get(period)! }));

  // Trials. `19` §13b / `Mithil/plan.md`: register never writes `trialing` (DEC-048), so
  // only a seeded operator-created org can be. `started`/`expired` read the only start/end
  // dates the model has (`periodStart`/`periodEnd`); `converted` has NO SOURCE — nothing
  // records a trialing-to-active TRANSITION, only a tier override, which carries no prior
  // status. Reporting a guessed conversion would be exactly the fabricated confidence
  // decision 3 exists to refuse, so it stays honestly zero until a real signal exists.
  const [trialsStarted, trialsExpired] = await Promise.all([
    db.subscription.count({ where: { status: 'trialing', periodStart: { gte: from, lte: to } } }),
    db.subscription.count({
      where: { status: 'trialing', periodEnd: { gte: from, lte: to, lt: now } },
    }),
  ]);
  const trialsConverted = 0;
  const completed = trialsConverted + trialsExpired;
  const conversionRate = completed === 0 ? null : trialsConverted / completed;

  const [orgsWithACampaign, orgsWithAResponse, allOrgIds] = await Promise.all([
    db.organization.count({ where: { campaigns: { some: {} } } }),
    db.organization.count({ where: { campaigns: { some: { responses: { some: {} } } } } }),
    db.organization.findMany({ select: { id: true } }),
  ]);
  const activity = await responseFacts(allOrgIds.map((row) => row.id));
  let orgsQuiet30d = 0;
  for (const id of allOrgIds.map((row) => row.id)) {
    if (
      isQuietOrg({
        responsesLast30d: activity.recent.get(id) ?? 0,
        lastActivityAt: (activity.lastAt.get(id) ?? null)?.toISOString() ?? null,
      })
    ) {
      orgsQuiet30d += 1;
    }
  }

  const allSeats = await seatsFor(allOrgIds.map((row) => row.id));
  const [campaignsTotal, responsesTotal] = await Promise.all([
    db.campaign.count(),
    db.response.count(),
  ]);

  return {
    window: { from: from.toISOString(), to: to.toISOString(), granularity },
    orgs: { total: organizations, joined, trialing, cancelled },
    byTier,
    movement,
    trials: {
      started: trialsStarted,
      converted: trialsConverted,
      expired: trialsExpired,
      conversionRate,
    },
    adoption: { orgsWithACampaign, orgsWithAResponse, orgsQuiet30d },
    totals: {
      seats: [...allSeats.values()].reduce((sum, value) => sum + value, 0),
      campaigns: campaignsTotal,
      responses: responsesTotal,
    },
  };
}

// ---------------------------------------------------------------------------
// Earnings. `71` § Revenue, DEC-080 — the money, for the owner. `T-058`.
// ---------------------------------------------------------------------------

/**
 * A capture, as the earnings page reads one. The row is denormalised at write time
 * (`payer_name` is captured, never joined), so the only join here is the organisation's
 * NAME — an id is not something an owner can act on.
 */
const PAYMENT_SELECT = {
  id: true,
  createdAt: true,
  orgId: true,
  tier: true,
  fromTier: true,
  kind: true,
  amountMinor: true,
  currency: true,
  payerName: true,
  reference: true,
  org: { select: { name: true } },
} as const;

type PaymentRow = {
  id: string;
  createdAt: Date;
  orgId: string;
  tier: string;
  fromTier: string | null;
  kind: string;
  amountMinor: number;
  currency: string;
  payerName: string;
  reference: string;
  org: { name: string } | null;
};

const paymentView = (row: PaymentRow) => ({
  id: row.id,
  at: row.createdAt.toISOString(),
  orgId: row.orgId,
  orgName: row.org?.name ?? 'Unknown organisation',
  tier: row.tier as Tier,
  fromTier: (row.fromTier as Tier | null) ?? null,
  kind: row.kind as PaymentKind,
  amountMinor: row.amountMinor,
  currency: 'INR' as const,
  payerName: row.payerName,
  reference: row.reference,
});

const RECENT_PAYMENTS = 20;
const RECENT_CHANGES = 10;

/**
 * What the estate has paid. `platform.revenue.read`, owner only.
 *
 * THE SAME WINDOW AS `analytics()`, down to the twelve-month default, and deliberately so:
 * an owner reads the two pages one after the other, and two default ranges would make them
 * disagree about a quarter that has not changed.
 *
 * `byPeriod` INCLUDES EMPTY PERIODS AS ZERO, for the reason `periodsBetween` already gives
 * about movement — a month that vanishes from a revenue line reads as a gap in the data
 * rather than as a month nobody bought anything.
 *
 * `orgsOnTier` IS TODAY AND EVERYTHING ELSE IS THE WINDOW, and the legend on the page says
 * which is which. They are different questions — "who is on Gold now" against "what did
 * Gold earn since March" — and folding them into one number would answer neither.
 *
 * ONLY `succeeded` ROWS ARE COUNTED. Nothing writes any other status today; the filter is
 * here so that the day something does, a failed capture does not silently become revenue.
 */
export async function earnings(query: EarningsQuery): Promise<PlatformEarnings> {
  const now = new Date();
  const to = query.to ?? now;
  const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const granularity = query.granularity;

  const window = { createdAt: { gte: from, lte: to }, status: 'succeeded' };

  const [inWindow, lifetime, tierRows, recentRows, changeRows] = await Promise.all([
    db.payment.findMany({
      where: window,
      select: { orgId: true, tier: true, amountMinor: true, createdAt: true },
    }),
    db.payment.aggregate({ where: { status: 'succeeded' }, _sum: { amountMinor: true } }),
    // The CURRENT mix. A missing subscription row folds into bronze — the same convention
    // `stats()` and `analytics()` already use (D-012), and changing it in one place only
    // would make three pages disagree about the same organisation.
    db.organization.findMany({ select: { id: true, subscription: { select: { tier: true } } } }),
    db.payment.findMany({
      where: window,
      orderBy: { createdAt: 'desc' },
      take: RECENT_PAYMENTS,
      select: PAYMENT_SELECT,
    }),
    db.payment.findMany({
      where: { ...window, kind: 'change' },
      orderBy: { createdAt: 'desc' },
      take: RECENT_CHANGES,
      select: PAYMENT_SELECT,
    }),
  ]);

  const revenueMinor = inWindow.reduce((sum, row) => sum + row.amountMinor, 0);
  const payments = inWindow.length;

  const periods = periodsBetween(from, to, granularity);
  const periodMap = new Map(periods.map((period) => [period, { revenueMinor: 0, payments: 0 }]));
  const tierPeriodMap = new Map(
    periods.map((period) => [period, { bronze: 0, silver: 0, gold: 0 }]),
  );
  const byTierMap = new Map<Tier, { payments: number; revenueMinor: number; orgsOnTier: number }>(
    TIERS.map((tier) => [tier, { payments: 0, revenueMinor: 0, orgsOnTier: 0 }]),
  );
  const payingOrgs = new Set<string>();

  for (const row of inWindow) {
    payingOrgs.add(row.orgId);

    const bucket = periodMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) {
      bucket.revenueMinor += row.amountMinor;
      bucket.payments += 1;
    }

    const tier = row.tier as Tier;
    const tierBucket = byTierMap.get(tier);
    if (tierBucket) {
      tierBucket.payments += 1;
      tierBucket.revenueMinor += row.amountMinor;
    }

    // Enterprise is never PURCHASED — it is operator-assigned (16 §4) and `joinTier`
    // refuses it — so the per-period series carries the three sellable tiers and does not
    // draw a line that is structurally always zero.
    const tierSeries = tierPeriodMap.get(periodKeyOf(row.createdAt, granularity));
    if (tierSeries && (tier === 'bronze' || tier === 'silver' || tier === 'gold')) {
      tierSeries[tier] += 1;
    }
  }

  for (const row of tierRows) {
    const tier = (row.subscription?.tier ?? 'bronze') as Tier;
    const entry = byTierMap.get(tier);
    if (entry) entry.orgsOnTier += 1;
  }

  return {
    window: { from: from.toISOString(), to: to.toISOString(), granularity },
    currency: 'INR',
    totals: {
      revenueMinor,
      payments,
      orgsPaying: payingOrgs.size,
      // `null`, never 0 — the same argument decision 3 makes about a conversion rate. A
      // mean of no payments is not a payment of zero.
      averageMinor: payments === 0 ? null : Math.round(revenueMinor / payments),
      lifetimeRevenueMinor: lifetime._sum.amountMinor ?? 0,
    },
    byPeriod: periods.map((period) => ({ period, ...periodMap.get(period)! })),
    byTier: TIERS.map((tier) => ({ tier, ...byTierMap.get(tier)! })),
    tierOverTime: periods.map((period) => ({ period, ...tierPeriodMap.get(period)! })),
    recent: recentRows.map((row) => paymentView(row as PaymentRow)),
    recentChanges: changeRows.map((row) => paymentView(row as PaymentRow)),
  };
}

export async function overridePlan(
  req: Request,
  orgId: string,
  tier: Tier,
  reason?: string,
): Promise<{ tier: Tier; effectiveFrom: string }> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, subscription: { select: { tier: true } } },
  });
  if (!org) throw new NotFoundError();
  const from = org.subscription?.tier ?? 'bronze';

  // INV-007, one feature over: the row and the change are one transaction, so there is no
  // plan change without a record of who made it.
  await db.$transaction(async (tx) => {
    const today = new Date();
    await tx.subscription.upsert({
      where: { orgId },
      update: { tier, status: 'active' },
      create: {
        orgId,
        tier,
        status: 'active',
        seats: 0,
        periodStart: today,
        periodEnd: new Date(today.getTime() + 365 * DAY),
      },
    });
    await writeAudit(tx, req, 'plan.override', orgId, { from, to: tier, ...(reason ? { reason } : {}) });
  });

  return { tier, effectiveFrom: new Date().toISOString() };
}

export async function setSuspended(
  req: Request,
  orgId: string,
  suspended: boolean,
  reason?: string,
): Promise<{ status: 'suspended' | 'active' }> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundError();

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: orgId },
      data: { suspendedAt: suspended ? new Date() : null },
    });
    await writeAudit(tx, req, suspended ? 'org.suspend' : 'org.unsuspend', orgId, {
      ...(reason ? { reason } : {}),
    });
  });

  return { status: suspended ? 'suspended' : 'active' };
}

/**
 * 70 § Interactions. Delivery in P2 is the RECORD — there is no mail transport in this
 * product and inventing one here would be a feature nobody asked for. The record is the
 * half that makes it a support tool rather than a mailto link: the next operator can see
 * the conversation, and `/platform/audit` is where they see it.
 */
export async function messageAdministrators(
  req: Request,
  orgId: string,
  subject: string,
  body: string,
): Promise<{ sentTo: number; recipients: string[] }> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundError();

  const recipients = await administratorsOf(orgId);
  if (recipients.length === 0) {
    throw new ConflictError('That organization has no administrator to contact.');
  }

  await db.$transaction(async (tx) => {
    await writeAudit(tx, req, 'message.send', orgId, {
      subject,
      body,
      recipients: recipients.map((person) => person.email),
    });
  });

  return { sentTo: recipients.length, recipients: recipients.map((person) => person.email) };
}

export async function readPlatformAudit(query: {
  cursor?: string;
  limit: number;
  action?: string;
  orgId?: string;
}): Promise<Paged<PlatformAuditEntry>> {
  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.orgId ? { targetOrgId: query.orgId } : {}),
  };
  const after = (() => {
    if (!query.cursor) return {};
    const { createdAt, id } = decodeCursor(query.cursor);
    return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: BigInt(id) } }] };
  })();

  const [rows, total] = await Promise.all([
    db.platformAuditLog.findMany({
      where: { ...where, ...after },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        action: true,
        payload: true,
        requestId: true,
        actor: { select: { id: true, name: true } },
        targetOrg: { select: { id: true, name: true } },
      },
    }),
    db.platformAuditLog.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((row) => ({
      id: String(row.id),
      at: row.createdAt.toISOString(),
      actor: row.actor,
      action: row.action,
      org: row.targetOrg,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      requestId: row.requestId,
    })),
    page: {
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: String(last.id) }) : null,
    },
    meta: { total },
  };
}

// ---------------------------------------------------------------------------
// Operators. 19 §6 — the one thing `owner` cannot do.
// ---------------------------------------------------------------------------

const toOperator = (row: {
  id: string; email: string; name: string; role: string; status: string; lastLoginAt: Date | null;
}): PlatformOperator => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role as PlatformOperator['role'],
  status: row.status,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
});

const OPERATOR_SELECT = {
  id: true, email: true, name: true, role: true, status: true, lastLoginAt: true,
} as const;

export async function listOperators(): Promise<PlatformOperator[]> {
  const rows = await db.platformUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: OPERATOR_SELECT,
  });
  return rows.map(toOperator);
}

export async function createOperator(
  req: Request,
  input: { email: string; name: string; password: string; role: 'owner' | 'staff' },
): Promise<PlatformOperator & { otpauthUrl: string }> {
  const existing = await db.platformUser.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw new ConflictError('That address already has an operator account.');

  const secret = generateSecret();
  const passwordHash = await hashPassword(input.password);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.platformUser.create({
      data: { email: input.email, name: input.name, passwordHash, role: input.role, mfaSecret: secret },
      select: OPERATOR_SELECT,
    });
    await writeAudit(tx, req, 'operator.create', null, { email: input.email, role: input.role });
    return row;
  });

  // Returned ONCE, at creation, and never readable again — the same property an API key
  // has (45). The new operator scans it; nothing stores it anywhere else.
  return { ...toOperator(created), otpauthUrl: otpauthUrl(input.email, secret) };
}

/**
 * 19 §6, and both halves are the same failure: a platform with one locked-out owner and no
 * recovery path is an outage nobody can fix from inside. `33`'s lockout guard already
 * exists for exactly this reason on the org side, and the reasoning transfers unchanged.
 */
export async function updateOperator(
  req: Request,
  id: string,
  patch: { role?: 'owner' | 'staff'; status?: 'active' | 'disabled' },
): Promise<PlatformOperator> {
  const actor = req.ctx.principal;
  if (actor?.kind !== 'platform') throw new UnauthenticatedError();

  const target = await db.platformUser.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  if (!target) throw new NotFoundError();

  if (target.id === actor.id) {
    throw new ConflictError('An operator cannot change their own role or disable themselves.');
  }

  const losingAnOwner =
    target.role === 'owner' && (patch.role === 'staff' || patch.status === 'disabled');
  if (losingAnOwner) {
    const owners = await db.platformUser.count({ where: { role: 'owner', status: 'active' } });
    if (owners <= 2) {
      // <= 2 rather than <= 1: the actor is themselves an owner (only owners hold
      // `platform.operator.manage`), so "two left" means one after this change — and the
      // actor could then be locked out by a password they forgot with nobody to reset it.
      throw new ConflictError('That would leave the platform with a single owner.');
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.platformUser.update({
      where: { id },
      data: { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}) },
      select: OPERATOR_SELECT,
    });
    await writeAudit(tx, req, 'operator.update', null, { operatorId: id, ...patch });
    return row;
  });
  return toOperator(updated);
}

/** `72` § Interactions — the file picker's data. Pure filesystem read; no audit row, because
 *  listing what exists is not the operator action `19` §10 means (reading a file's content is). */
export function listOperatorLogFiles(): LogFileMeta[] {
  return listLogFiles();
}

/** `18` §2 — where the files are written, how big a rotation gets and how long one survives.
 *  Read straight off the live config rather than restated, so the screen cannot claim a
 *  retention the writer is not honouring. */
export function logStoreMeta(): LogStoreMeta {
  return {
    dir: logDir,
    enabled: logToFile,
    retentionDays: config.LOG_RETENTION_DAYS,
    maxSizeMb: config.LOG_MAX_SIZE_MB,
  };
}

/**
 * `72` § Acceptance — "reading logs writes a `platform_audit_log` row. Reading is an operator
 * action and is audited like one." This is the one place in the platform surface a GET writes:
 * the file read itself is not transactional (it is disk, not the database), so the audit row
 * is written in its own one-statement transaction immediately after a successful read rather
 * than wrapped around the read — INV-007's "same transaction as the mutation" has nothing to
 * synchronise with here, there being no database mutation to race against.
 */
export async function readOperatorLogFile(
  req: Request,
  fileName: string,
  query: LogReadQuery,
): Promise<{ data: LogLine[]; page: { nextCursor: string | null; hasMore: boolean } }> {
  const result = readLogFile(fileName, query);

  await db.$transaction((tx) =>
    writeAudit(tx, req, 'logs.read', null, {
      file: fileName,
      ...(query.requestId ? { requestId: query.requestId } : {}),
    }),
  );

  return result;
}

/**
 * `DEC-074` — the export, and its audit row is the entire reason `72` § Out of scope could
 * reverse its "no download" position rather than argue around it. A read is a page on a
 * screen; this is a file that outlives both the session and the fourteen-day retention
 * window, so the row carries the format, EVERY filter and how many lines actually left.
 *
 * Written after a successful export for the same reason `logs.read`'s is: the copy is disk,
 * not the database, so there is no mutation for INV-007 to bind the row to.
 */
export async function exportOperatorLogFile(
  req: Request,
  fileName: string,
  query: LogExportQuery,
): Promise<LogExportResult> {
  const result = exportLogFile(fileName, query);

  await db.$transaction((tx) =>
    writeAudit(tx, req, 'logs.export', null, {
      file: fileName,
      format: query.format,
      lines: result.lines,
      truncated: result.truncated,
      ...(query.level !== undefined ? { level: query.level } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.path ? { path: query.path } : {}),
      ...(query.orgId ? { orgId: query.orgId } : {}),
      ...(query.requestId ? { requestId: query.requestId } : {}),
      ...(query.q ? { q: query.q } : {}),
    }),
  );

  return result;
}
