// The estate, as numbers - what Endur's own operators read about their customers.
// Every query here runs through the platform client, which is what makes "counts, never content"
// a property of the code: asking it for content throws, rather than answering.
import type { Request, Response } from 'express';
import type {
  AnalyticsQuery,
  EarningsQuery,
  EnterpriseQueueQuery,
  EnterpriseRequestRow,
  EnterpriseStatus,
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
  EnterSupportResponse,
  SupportSessionListQuery,
  SupportSessionRow,
  Tier,
} from '@endur/shared';
import { TIERS, isQuietOrg, SUPPORT_DENIED_CAPABILITIES } from '@endur/shared';
import type { PaymentKind } from '@endur/shared';
import { platformClient } from '../../platform/db.js';
import { newPeriod } from '../../billing/period.js';
import { effectiveTier } from '../../billing/effective.js';
import { recordPayment } from '../../billing/payments.js';
import { writeAudit } from '../../platform/audit.js';
import { hashPassword } from '../../auth/password.js';
import { generateSecret, otpauthUrl } from '../../platform/totp.js';
import { listLogFiles, readLogFile, exportLogFile } from '../../platform/logs/index.js';
import { logDir, logToFile } from '../../lib/logger.js';
// The support seam is deliberately NOT the platform client - see the note above enterSupport().
import {
  endSupportSession,
  loadSupportSession,
  startSupportSession,
} from '../../db/support.js';
import { destroy, regenerate, save } from '../../auth/session.js';
import { issueCsrfToken } from '../../middleware/csrfProtection.js';
import { config } from '../../lib/config.js';
import type { LogExportResult } from '../../platform/logs/index.js';
import { ConflictError, NotFoundError, UnauthenticatedError } from '../../lib/errors.js';
import { afterCursor, encodeCursor, decodeCursor, type Paged } from '../../lib/paginate.js';

const db = platformClient();

const DAY = 24 * 60 * 60 * 1000;
const thirtyDaysAgo = () => new Date(Date.now() - 30 * DAY);

// A campaign that is launched, not closed and not past its end date. Derived here rather than imported,
// because the tenant version reads one organisation's row and this counts across all of them.
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
  subscription: {
    tier: string;
    status: string;
    seats: number;
    periodEnd: Date;
    pendingTier: string | null;
    lapsedFrom: string | null;
  } | null;
};

// Seats, computed live from the formula rather than read from the stored column, which nothing has
// ever written - reading it would show 0 seats for every customer and look like a broken screen.
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
      // Non-person subjects only: one linked to a person is already counted as a user above.
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

// Responses carry no organisation id - they are reached through their campaign - so these two numbers
// are grouped by campaign and folded back. Both are still a count and a maximum, which is all that is allowed.
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
    // Derived, not read: the stored column lags until the customer next opens their own plan page,
    // so the estate shows the tier the product is actually serving.
    tier: row.subscription ? effectiveTier(row.subscription) : 'bronze',
    subscriptionStatus: row.subscription?.status ?? 'none',
    periodEnd: row.subscription?.periodEnd.toISOString() ?? null,
    lapsedFrom: (row.subscription?.lapsedFrom as Tier | null) ?? null,
    seats: seats.get(row.id) ?? 0,
    // Null rather than a number, because there is no seat LIMIT in the product yet. A zero here would
    // render as "over seats" for every customer.
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
  subscription: {
    select: {
      tier: true,
      status: true,
      seats: true,
      // These three fields are what the effective tier is worked out from, and none is a count of
      // anything a tenant owns, so the counts-only rule is untouched.
      periodEnd: true,
      pendingTier: true,
      lapsedFrom: true,
    },
  },
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

  // Cursor pagination on creation date, like every other list. The page is sorted by last activity in
  // the UI, but paginating on an aggregate of another table is not a cursor.
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
      // Through the campaign, because responses carry no organisation id.
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

// Who to contact, worked out on the SERVER from who holds org.update, never supplied by the client:
// an operator typing an address is an operator who can send a customer's plan details to a stranger.
// A grants query rather than the resolver, because the question is "who, in this organisation".
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

  // A position carries no account id - the person does, joined by a membership edge - so this is TWO hops.
  // Written as one, every organisation reported having nobody to contact.
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
        // Granted to the person directly.
        { id: { in: subjectIds } },
        // Or holding a position whose ROLE was granted it, which is the common case.
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
  // An organisation with no subscription row counts as bronze here too, rather than vanishing from the mix.
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

// Analytics: the whole estate at once, for the owner.

// A period key like 2026-08 or 2026-Q3, so it sorts as a string and reads as a label.
function periodKeyOf(date: Date, granularity: 'month' | 'quarter'): string {
  if (granularity === 'quarter') {
    return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Every period between two dates, inclusive, so a quiet month still renders as a zero row instead of vanishing.
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

// The last instant of the day a date names.
// A date input sends a bare day, which is read as midnight, so a plain "less than or equal" would drop
// the whole of the last day selected - and a single-day window would match nothing at all.
function endOfDay(value: Date): Date {
  const end = new Date(value.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export async function analytics(query: AnalyticsQuery): Promise<PlatformAnalytics> {
  const now = new Date();
  const to = query.to ?? now;
  // Twelve months back by default, which is the window the owner opens the page to see.
  const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const granularity = query.granularity;

  // The end date is inclusive to the end of that day, for the reason above. Done here rather than in
  // the schema, because what a date MEANS at the end of a range is this function's question.
  const windowEnd = endOfDay(to);

  const [
    organizations,
    trialing,
    cancelled,
    tierRows,
    movementNew,
    planChanges,
    planOverrides,
    suspensions,
  ] =
    await Promise.all([
      db.organization.count(),
      db.subscription.count({ where: { status: 'trialing' } }),
      db.subscription.count({ where: { status: 'cancelled' } }),
      // Excludes trialing, and an organisation with no subscription row folds into bronze.
      db.organization.findMany({
        where: { OR: [{ subscription: null }, { subscription: { status: { not: 'trialing' } } }] },
        select: { id: true, subscription: { select: { tier: true } } },
      }),
      db.organization.findMany({
        where: { createdAt: { gte: from, lte: windowEnd } },
        select: { createdAt: true },
      }),
      // Movement reads BOTH the payments table and the operator's own audit log, because the two sources
      // are disjoint: a customer's own move writes a payment and no audit row, an operator's override
      // writes an audit row and no payment. Reading only one would miss half the estate's movement.
      db.payment.findMany({
        where: { createdAt: { gte: from, lte: windowEnd }, status: 'succeeded' },
        select: { createdAt: true, tier: true, fromTier: true },
      }),
      db.platformAuditLog.findMany({
        where: { action: 'plan.override', createdAt: { gte: from, lte: windowEnd } },
        select: { createdAt: true, payload: true },
      }),
      db.platformAuditLog.findMany({
        where: { action: 'org.suspend', createdAt: { gte: from, lte: windowEnd } },
        select: { createdAt: true },
      }),
    ]);

  const joined = organizations - trialing - cancelled;

  // No seat column here: the product prices per organisation, and a seat figure on the revenue page
  // would measure something no invoice reads.
  const byTierMap = new Map<Tier, number>(TIERS.map((tier) => [tier, 0]));
  for (const row of tierRows) {
    const tier = (row.subscription?.tier ?? 'bronze') as Tier;
    if (byTierMap.has(tier)) byTierMap.set(tier, byTierMap.get(tier)! + 1);
  }
  const byTier = TIERS.map((tier) => ({ tier, orgs: byTierMap.get(tier)! }));

  const periods = periodsBetween(from, to, granularity);
  const movementMap = new Map(
    periods.map((period) => [period, { new: 0, upgraded: 0, downgraded: 0, churned: 0 }]),
  );
  for (const row of movementNew) {
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) bucket.new += 1;
  }
  // One rule for both sources: the previous plan against the one that replaced it. It says nothing
  // about who caused the move, because a rule that named a cause would need extending for each new one.
  const countMove = (at: Date, before?: string | null, after?: string | null): void => {
    // A signup is not a move: the organisation is already counted as new, and counting it here too would
    // put one organisation in two columns.
    const fromRank = before ? TIER_RANK.get(before as Tier) : undefined;
    const toRank = after ? TIER_RANK.get(after as Tier) : undefined;
    if (fromRank === undefined || toRank === undefined || fromRank === toRank) return;
    const bucket = movementMap.get(periodKeyOf(at, granularity));
    if (!bucket) return;
    if (toRank > fromRank) bucket.upgraded += 1;
    else bucket.downgraded += 1;
  };

  // The customer's own moves: a join, and a scheduled expiry.
  for (const row of planChanges) countMove(row.createdAt, row.fromTier, row.tier);

  // The operator's. Same rule, different table, because an override takes no money and writes no ledger row.
  for (const row of planOverrides) {
    const payload = row.payload as { from?: string; to?: string } | null;
    countMove(row.createdAt, payload?.from ?? null, payload?.to ?? null);
  }
  for (const row of suspensions) {
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) bucket.churned += 1;
  }
  const movement = periods.map((period) => ({ period, ...movementMap.get(period)! }));

// The trial counters are gone, because they could never move: registration writes an active status,
// so nothing is ever trialing, and the conversion rate had no source at all.
// The honest thing to do with a metric that has no source is not to print it.

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

  const [campaignsTotal, responsesTotal] = await Promise.all([
    db.campaign.count(),
    db.response.count(),
  ]);

  return {
    // The end date goes back out as the DAY that was asked for, not the 23:59:59 the query used, because
    // the page echoes it into its own date input.
    window: { from: from.toISOString(), to: to.toISOString(), granularity },
    orgs: { total: organizations, joined, trialing, cancelled },
    byTier,
    movement,
    adoption: { orgsWithACampaign, orgsWithAResponse, orgsQuiet30d },
    totals: { campaigns: campaignsTotal, responses: responsesTotal },
  };
}

// Earnings: the money, for the owner.

// A capture, as the earnings page reads one. The row is denormalised at write time, so the only join
// here is the organisation's name.
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

// What the estate has paid. The same twelve-month default window as analytics, so the two pages
// cannot disagree about a quarter that has not changed.
// Empty periods are included as zero, the current tier mix is TODAY while everything else is the
// window, and only succeeded captures are counted.
export async function earnings(query: EarningsQuery): Promise<PlatformEarnings> {
  const now = new Date();
  const to = query.to ?? now;
  const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const granularity = query.granularity;

  // Expiry and lapse rows are both excluded: they record a plan move with no money on it, and this page
  // is about money. Written as a list, so the next zero-amount kind is a name added here.
  const UNPAID_KINDS = ['expiry', 'lapse'];
  const window = {
    createdAt: { gte: from, lte: to },
    status: 'succeeded',
    kind: { notIn: UNPAID_KINDS },
  };

  const [inWindow, lifetime, tierRows, recentRows, changeRows] = await Promise.all([
    db.payment.findMany({
      where: window,
      select: { orgId: true, tier: true, amountMinor: true, createdAt: true },
    }),
    db.payment.aggregate({
      where: { status: 'succeeded', kind: { notIn: UNPAID_KINDS } },
      _sum: { amountMinor: true },
    }),
    // The CURRENT mix. A missing subscription row folds into bronze, the same convention every other page uses.
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

    // Enterprise is never purchased - it is operator-assigned - so the per-period series carries only the
    // three sellable tiers rather than drawing a line that is always zero.
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
      // Null, never 0: the average of no payments is not a payment of zero.
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

  // The change and its audit row are one transaction, so there is no plan change with no record of who made it.
  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { orgId },
      // Any scheduled move down is cleared: an operator has just settled the question, and a stale one
      // would take the plan away weeks later. The lapse notice and the period are reset for the same
      // reason - a granted plan starts a period, or the very next read would lapse it again.
      update: { tier, status: 'active', pendingTier: null, lapsedFrom: null, ...newPeriod() },
      create: {
        orgId,
        tier,
        status: 'active',
        seats: 0,
        // One month, from the one place that decides how long a period is.
        ...newPeriod(),
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

// Sending a message to an organisation's administrators.
// It writes TWO rows in one transaction, and they are different records: the audit row is what the
// NEXT OPERATOR sees, and the notification rows are what the customer sees in their inbox.
// Before both existed, the operator was shown "sent to 3 administrators" and nobody had been sent anything.
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
    // The customer's copy: one row per recipient, because read state belongs to the reader.
    await tx.notification.createMany({
      data: recipients.map((person) => ({
        orgId,
        userId: person.id,
        kind: 'platform_message',
        subject,
        body,
      })),
    });

    // The operator's copy, in the same transaction, so a success count can never be reported for a message
    // that was not written.
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

// Operators: the one thing only an owner can manage.

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

  // Returned once, at creation, and never readable again - the same property an API key has.
  return { ...toOperator(created), otpauthUrl: otpauthUrl(input.email, secret) };
}

// A platform with one locked-out owner and no recovery path is an outage nobody can fix from inside,
// so the last owner cannot be demoted or disabled.
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
      // Two rather than one, because the actor is themselves an owner: "two left" means one after this change.
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

// The log file picker's data. A pure filesystem read, and no audit row, because listing what exists is
// not the operator action that has to be recorded - reading a file's contents is.
export function listOperatorLogFiles(): LogFileMeta[] {
  return listLogFiles();
}

// Where the log files live, how big a rotation gets and how long one survives, read straight off the
// live config, so the screen cannot claim a retention the writer is not honouring.
export function logStoreMeta(): LogStoreMeta {
  return {
    dir: logDir,
    enabled: logToFile,
    retentionDays: config.LOG_RETENTION_DAYS,
    maxSizeMb: config.LOG_MAX_SIZE_MB,
  };
}

// Reading a log file writes an audit row: reading is an operator action and is audited like one.
// It is the one place on this surface where a GET writes. The row goes in after a successful read,
// because the read is disk rather than the database and there is no transaction to bind it to.
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

// The export, and its audit row is the reason a download could be allowed at all: a read is a page on a
// screen, this is a file that outlives both the session and the retention window, so the row records the
// format, every filter, and how many lines actually left.
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

// The Enterprise queue: a work item, not a notification. A bell clears on read, and what has to survive
// is "somebody has to ring this customer back". Reading the queue changes nothing.
// Owner only, because this is a revenue queue, while support helps one customer at a time.

const ENTERPRISE_SELECT = {
  id: true,
  createdAt: true,
  askedName: true,
  askedEmail: true,
  note: true,
  status: true,
  handledAt: true,
  org: { select: { id: true, name: true, subscription: { select: { tier: true } } } },
} as const;

type EnterpriseRow = {
  id: string;
  createdAt: Date;
  askedName: string;
  askedEmail: string;
  note: string | null;
  status: string;
  handledAt: Date | null;
  org: { id: string; name: string; subscription: { tier: string } | null };
};

const enterpriseView = (row: EnterpriseRow): EnterpriseRequestRow => ({
  id: row.id,
  at: row.createdAt.toISOString(),
  org: {
    id: row.org.id,
    name: row.org.name,
    // A missing subscription row folds into bronze, the same convention every other page uses.
    tier: (row.org.subscription?.tier ?? 'bronze') as Tier,
  },
  askedName: row.askedName,
  askedEmail: row.askedEmail,
  note: row.note,
  status: row.status as EnterpriseStatus,
  handledAt: row.handledAt?.toISOString() ?? null,
});

export async function readEnterpriseQueue(
  query: EnterpriseQueueQuery,
): Promise<EnterpriseRequestRow[]> {
  const rows = await db.enterpriseRequest.findMany({
    where: { status: query.status },
    // Oldest first, and this is the one list here that is not newest-first: a work queue answers "who has
    // been waiting longest", and newest-first is how the first customer to ask becomes the last one called.
    orderBy: { createdAt: 'asc' },
    select: ENTERPRISE_SELECT,
  });

  return rows.map(enterpriseView);
}

// Moves a request along: open, contacted, closed, and back again if somebody mis-clicked.
// No state machine, because the queue is worked by one person and a wrong click costs another click.
// Moving off 'open' releases the unique index, so a customer whose request was closed can ask again.
export async function updateEnterpriseRequest(
  req: Request,
  id: string,
  status: EnterpriseStatus,
): Promise<EnterpriseRequestRow> {
  const existing = await db.enterpriseRequest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError();

  const operator = req.ctx.principal;
  await db.$transaction(async (tx) => {
    await tx.enterpriseRequest.update({
      where: { id },
      data: {
        status,
        // Who closed it and when, cleared when it reopens, because a handled-by that survives a reopen
        // names an operator for work that is undone again.
        ...(status === 'open'
          ? { handledBy: null, handledAt: null }
          : {
              handledAt: new Date(),
              ...(operator?.kind === 'platform' ? { handledBy: operator.id } : {}),
            }),
      },
    });
    await writeAudit(tx, req, 'enterprise.update', null, { requestId: id, status });
  });

  // The row that was updated, re-read by its own id: returning the first row of the new status would
  // hand back somebody else's request whenever two are in the same state.
  const row = await db.enterpriseRequest.findUnique({ where: { id }, select: ENTERPRISE_SELECT });
  if (!row) throw new NotFoundError();
  return enterpriseView(row);
}

// Approves an Enterprise request: grants the tier AND records the sale, in one transaction.
// Before this existed, the owner set the tier by hand through the plan override - which writes no
// payment row - so the one tier charged at the highest price earned nothing on the earnings page.
// The operator names no amount: the price comes from the plan catalogue, exactly as on a customer's
// own join, and the payer is the person who asked, read off the request row.
export async function approveEnterpriseRequest(
  req: Request,
  id: string,
): Promise<EnterpriseRequestRow> {
  const request = await db.enterpriseRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      askedName: true,
      askedEmail: true,
      org: { select: { id: true, subscription: { select: { tier: true, lapsedFrom: true } } } },
    },
  });
  if (!request) throw new NotFoundError();
  if (request.status === 'closed') {
    throw new ConflictError('That request is already closed. Reopen it before approving.');
  }

  const orgId = request.org.id;
  const from = (request.org.subscription?.tier ?? 'bronze') as Tier;
  if (from === 'enterprise') {
    // Neither a 500 nor a silent success: approving again would capture a second time for a tier they hold.
    throw new ConflictError('That organisation is already on Enterprise.');
  }

  const operator = req.ctx.principal;
  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { orgId },
      // Any scheduled move down is stale once somebody buys their way past it, and the lapse notice is spent.
      update: {
        tier: 'enterprise',
        status: 'active',
        pendingTier: null,
        lapsedFrom: null,
        ...newPeriod(),
      },
      create: { orgId, tier: 'enterprise', status: 'active', seats: 0, ...newPeriod() },
    });

    // The sale, priced on the server, in the same transaction as the tier it pays for.
    await recordPayment(tx, {
      orgId,
      tier: 'enterprise',
      fromTier: from,
      // Full price when the bronze they sit on was never bought: a lapsed organisation would otherwise be
      // credited for a tier it never paid for.
      pricedFrom: request.org.subscription?.lapsedFrom ? null : from,
      kind: 'change',
      payerName: request.askedName,
      payerEmail: request.askedEmail,
    });

    await tx.enterpriseRequest.update({
      where: { id },
      data: {
        status: 'closed',
        handledAt: new Date(),
        ...(operator?.kind === 'platform' ? { handledBy: operator.id } : {}),
      },
    });

    // Two audit rows, because two things happened: the plan moved, and it moved because a request was approved.
    await writeAudit(tx, req, 'plan.override', orgId, { from, to: 'enterprise', reason: 'enterprise request approved' });
    await writeAudit(tx, req, 'enterprise.approve', orgId, { requestId: id });
  });

  const row = await db.enterpriseRequest.findUnique({ where: { id }, select: ENTERPRISE_SELECT });
  if (!row) throw new NotFoundError();
  return enterpriseView(row);
}


// Support access.

// Why the writes below do NOT go through the platform seam, and must not.
// Opening a support session writes two rows inside a customer's organisation, and adding those tables
// to the seam's allowlist would make them writable from every function in this file, forever.
// The exception belongs to one operation, so it lives in one file - db/support.ts - which uses the base
// client and says at the top why it is allowed to. Feedback content stays unreachable either way.
export async function enterSupport(
  req: Request,
  res: Response,
  orgId: string,
  reason: string,
): Promise<EnterSupportResponse> {
  const operator = req.ctx.principal;
  if (operator?.kind !== 'platform') throw new UnauthenticatedError();

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) throw new NotFoundError();

  const profile = await db.platformUser.findUnique({
    where: { id: operator.id },
    select: { id: true, name: true, email: true },
  });
  if (!profile) throw new UnauthenticatedError();

  // Regenerate the session id FIRST, to prevent session fixation - it matters more here, because that
  // id will carry a customer organisation's capabilities.
  // It also gives us the id the browser will really use, which is what the support row is keyed on.
  await regenerate(req);
  req.session.support = true;
  req.session.orgId = orgId;
  await save(req);

  const session = await startSupportSession({
    operator: { id: profile.id, name: profile.name },
    orgId,
    reason,
    sessionId: req.sessionID,
  });

  // The member id is written after the row exists, so a crash between the two leaves a session that
  // resolves nothing rather than one pointing at a member with no mandate.
  req.session.userId = session.userId;
  await save(req);

  // Issue a CSRF token here, so the operator's first write works instead of failing once and asking them to reload.
  issueCsrfToken(res);

  await db.$transaction(async (tx) => {
    await writeAudit(tx, req, 'support.enter', orgId, {
      reason,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      // Recorded on our side too, so the register can answer "what could they see" without anybody having
      // to remember what the deny list said that day.
      denied: [...SUPPORT_DENIED_CAPABILITIES],
    });
  });

  return {
    session: {
      id: session.id,
      org: { id: org.id, name: org.name },
      operator: { id: profile.id, name: profile.name, email: profile.email },
      reason: session.reason,
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      endedAt: null,
      active: true,
    },
    // A path, not a URL and not a token: a link that granted access would be a credential in a browser
    // history and in every proxy log on the way. The cookie already set is the credential, and it is httpOnly.
    redirectTo: '/app',
    deniedCapabilities: [...SUPPORT_DENIED_CAPABILITIES],
  };
}

// Leave, called both from the operator console and from the banner inside the customer's console.
// It ends the support ROW before destroying the session, because the row is what confers everything -
// the other order would leave a live row and a browser that could replay a captured cookie.
export async function leaveSupport(req: Request, res: Response): Promise<{ ok: true }> {
  const sessionId = req.sessionID;
  const live = await loadSupportSession(sessionId);
  await endSupportSession(sessionId);

  if (live && req.ctx.principal?.kind === 'platform') {
    await db.$transaction(async (tx) => {
      await writeAudit(tx, req, 'support.leave', live.orgId, { sessionId: live.id });
    });
  }

  await destroy(req);
  res.clearCookie('endur.sid', { path: '/' });
  res.clearCookie('endur.csrf', { path: '/' });
  return { ok: true };
}

// The register of support visits.
// Still counts-only in spirit: an organisation's name, an operator's name and address, two timestamps
// and the reason they typed. Not one field here came out of a customer's data.
export async function listSupportSessions(
  query: SupportSessionListQuery,
): Promise<SupportSessionRow[]> {
  const now = new Date();
  const rows = await db.supportSession.findMany({
    where: {
      ...(query.orgId ? { orgId: query.orgId } : {}),
      // Whether a session is active is COMPUTED, not stored: it ends because somebody left OR because it
      // ran out, and only the first writes anything. A stored boolean would be false in the table and true
      // in fact until something noticed.
      ...(query.active === true ? { endedAt: null, expiresAt: { gt: now } } : {}),
      ...(query.active === false ? { OR: [{ endedAt: { not: null } }, { expiresAt: { lte: now } }] } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      reason: true,
      startedAt: true,
      expiresAt: true,
      endedAt: true,
      org: { select: { id: true, name: true } },
      operator: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    org: row.org,
    operator: row.operator,
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    active: row.endedAt === null && row.expiresAt > now,
  }));
}
