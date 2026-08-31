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
  Tier,
} from '@endur/shared';
import { TIERS, isQuietOrg } from '@endur/shared';
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
  subscription: {
    tier: string;
    status: string;
    seats: number;
    periodEnd: Date;
    pendingTier: string | null;
    lapsedFrom: string | null;
  } | null;
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
    // DERIVED, NOT READ — DEC-113. The column lags: an expired row keeps saying `gold` until
    // the customer next opens their own plan page and `readBilling` writes the move. The gate
    // does not wait for that and neither does this, so the estate shows the tier the product is
    // actually serving rather than the one the table has not caught up to.
    tier: row.subscription ? effectiveTier(row.subscription) : 'bronze',
    subscriptionStatus: row.subscription?.status ?? 'none',
    periodEnd: row.subscription?.periodEnd.toISOString() ?? null,
    lapsedFrom: (row.subscription?.lapsedFrom as Tier | null) ?? null,
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
  subscription: {
    select: {
      tier: true,
      status: true,
      seats: true,
      // DEC-113. `periodEnd` and `pendingTier` are what `effectiveTier()` needs; `lapsedFrom`
      // is what the row prints. None of them is a count of anything a tenant owns, so the
      // aggregate-only seam (INV-011, 19 §5) is untouched.
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

/**
 * The last instant of the day a date names — `D-044`, `DEC-103`.
 *
 * `<input type="date">` sends `2026-08-12` and `z.coerce.date()` reads it as midnight, so a
 * range query written `lte: to` excluded the whole of the last day the operator selected, and
 * a single-day window matched nothing at all. Every windowed query on both platform pages
 * runs through this.
 *
 * 999 MILLISECONDS, NOT `+ 1 DAY` WITH `lt`. Both are correct; this one keeps the comparison
 * `lte` everywhere, so no caller has to remember which of its two bounds is exclusive.
 */
function endOfDay(value: Date): Date {
  const end = new Date(value.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export async function analytics(query: AnalyticsQuery): Promise<PlatformAnalytics> {
  const now = new Date();
  const to = query.to ?? now;
  // Twelve months back by default (`71` § Interactions) — a year of monthly movement is the
  // window the owner opens the page to see, and quarter granularity reads the same range as
  // four quarters rather than a shorter one.
  const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const granularity = query.granularity;

  // `to` IS INCLUSIVE TO THE END OF THE DAY NAMED — D-044.
  //
  // `<input type="date">` sends `2026-08-12`; `z.coerce.date()` reads that as
  // `2026-08-12T00:00:00Z`; every query below is `lte: to`. SO THE WHOLE OF THE LAST DAY
  // SELECTED WAS EXCLUDED, and a single-day window (`from` === `to`) matched nothing at all —
  // which is what the owner met as "the date filters are not working".
  //
  // The adjustment is here rather than in the DTO because the DTO's job is to say the value
  // is a date; what a date MEANS at the end of a range is this function's question, and
  // `/ops/earnings` reads the same shape (`EarningsQuery = AnalyticsQuery`) and needs the
  // same answer.
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
      // Excludes `trialing` — decision 1. An org with no subscription row folds into bronze,
      // the same convention `stats()` already uses (D-012).
      db.organization.findMany({
        where: { OR: [{ subscription: null }, { subscription: { status: { not: 'trialing' } } }] },
        select: { id: true, subscription: { select: { tier: true } } },
      }),
      db.organization.findMany({
        where: { createdAt: { gte: from, lte: windowEnd } },
        select: { createdAt: true },
      }),
      // MOVEMENT READS `payments` — DEC-102 — AND STILL READS `plan.override` BESIDE IT.
      //
      // THE DECISION SAID "RATHER THAN", AND "RATHER THAN" WOULD HAVE LOST A CASE THE SAME
      // DECISION REQUIRES. `DEC-102`'s argument is that `plan.override` is the OPERATOR'S
      // action, so the table had only ever counted what operators did while being labelled as
      // the estate — true, and the remedy is to ADD the customer's own moves rather than to
      // swap one partial source for another. Its own `not` clause settles it: downgraded
      // "covers an operator override AND the scheduled expiry", and an override deliberately
      // writes NO `payments` row (`OverridePlan`'s DTO comment: an operator who could name an
      // amount could invent revenue). Replacing the source would have made an operator moving
      // thirty organisations to Gold show as no movement at all.
      //
      // THE TWO SOURCES ARE DISJOINT BY CONSTRUCTION, so there is nothing to de-duplicate: a
      // customer's own move writes a `payments` row and no platform audit row; an operator's
      // override writes a platform audit row and no `payments` row. That is not a coincidence
      // to rely on quietly — it is `19` §8's split between a sale and a support action, and if
      // it ever stops being true this count double-counts, which is why it is written down.
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

  // NO SEAT COLUMN — DEC-102. `DEC-080` prices per ORGANISATION, `subscriptions.seats` has
  // never been written (`D-013`), and the live count `16` §5 computes is not billed on. A
  // seat figure on the revenue owner's page measured something no invoice reads, and the
  // `seatsFor()` call that produced it was the most expensive query on the page.
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
  /**
   * ONE RULE FOR BOTH SOURCES: THE PREVIOUS PLAN AGAINST THE ONE THAT REPLACED IT.
   *
   * That is the owner's definition of a downgrade (`DEC-102`) and it is deliberately silent
   * about WHO caused the move — with `DEC-096` a customer cannot move down at all, so the
   * downgrades that reach here are an operator override and the scheduled expiry of
   * `DEC-098`, and a rule that named a cause would have to be extended for each new one.
   */
  const countMove = (at: Date, before?: string | null, after?: string | null): void => {
    // A SIGNUP IS NOT A MOVE. `from_tier` is null on it, and the organisation is already
    // counted under `new` from its own `created_at` — counting it here as well would put one
    // organisation in two of four columns decision 2 insists are never netted.
    const fromRank = before ? TIER_RANK.get(before as Tier) : undefined;
    const toRank = after ? TIER_RANK.get(after as Tier) : undefined;
    if (fromRank === undefined || toRank === undefined || fromRank === toRank) return;
    const bucket = movementMap.get(periodKeyOf(at, granularity));
    if (!bucket) return;
    if (toRank > fromRank) bucket.upgraded += 1;
    else bucket.downgraded += 1;
  };

  // The customer's own moves — a join (`DEC-097`) and a scheduled expiry (`DEC-098`).
  for (const row of planChanges) countMove(row.createdAt, row.fromTier, row.tier);

  // The operator's. Same rule, different table, because an override takes no money and so
  // writes no ledger row — see the query above.
  for (const row of planOverrides) {
    const payload = row.payload as { from?: string; to?: string } | null;
    countMove(row.createdAt, payload?.from ?? null, payload?.to ?? null);
  }
  for (const row of suspensions) {
    const bucket = movementMap.get(periodKeyOf(row.createdAt, granularity));
    if (bucket) bucket.churned += 1;
  }
  const movement = periods.map((period) => ({ period, ...movementMap.get(period)! }));

  // THE TRIAL COUNTERS ARE GONE — DEC-102, and the argument is that they could never move.
  //
  // `DEC-048` made registration write `status: 'active'`, so nothing on the sign-up path is
  // ever `trialing`; and `converted` was a hardcoded `0` under a comment saying it had no
  // source, so `conversionRate` was permanently the em-dash. TWO OF THE SIX HEADLINE CARDS
  // WERE STRUCTURALLY INCAPABLE OF CHANGING, which is what the owner met when they created an
  // organisation and Trials started did not move.
  //
  // The old comment's argument for the honest zero was right about honesty and wrong about
  // the remedy: the honest thing to do with a metric that has no source is NOT TO PRINT IT.
  // The DTO fields went with the queries, because a field left behind is a field something
  // starts computing again.

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
    // `to` GOES BACK OUT AS THE DAY THAT WAS ASKED FOR, not as the 23:59:59 the query used —
    // the page echoes this into its own date input, and an input that reads back a second
    // later than what was typed is a control arguing with the person using it.
    window: { from: from.toISOString(), to: to.toISOString(), granularity },
    orgs: { total: organizations, joined, trialing, cancelled },
    byTier,
    movement,
    adoption: { orgsWithACampaign, orgsWithAResponse, orgsQuiet30d },
    totals: { campaigns: campaignsTotal, responses: responsesTotal },
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

  // `expiry` AND `lapse` ARE BOTH EXCLUDED — DEC-098, DEC-113. Both record a plan MOVE with no
  // money on it (Rs 0), and this page is about money: counting either as a payment would leave
  // the average capture dragged down by events where nothing was captured, and the count
  // answering a different question from the sum beside it. `/ops/analytics` reads those rows
  // for exactly the opposite reason — it wants the movement, not the money (DEC-102).
  //
  // WRITTEN AS A LIST, so the next zero-amount kind is a name added here rather than a second
  // `not` somebody has to notice. `kind: { not: 'expiry' }` silently counted every lapse the
  // day `DEC-113` landed, which is how a two-word predicate becomes a wrong revenue figure.
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
    await tx.subscription.upsert({
      where: { orgId },
      // `pendingTier: null` for `joinTier`'s reason (DEC-098): an operator who has just been
      // asked to put an organisation on a tier has settled the question, and a scheduled move
      // down surviving that would take the plan away weeks later with the support call
      // already closed. An override is the newest fact about the plan, so it wins.
      //
      // `lapsedFrom: null` AND A FRESH PERIOD for the same reason, one step further — DEC-113.
      // An override lands most often on an organisation that has just lapsed, and leaving the
      // old dates would put the tier the operator granted straight back on an expired row: the
      // very next read would lapse it again, undoing the support action inside a second and
      // writing a ledger row saying so. A granted plan starts a period.
      update: { tier, status: 'active', pendingTier: null, lapsedFrom: null, ...newPeriod() },
      create: {
        orgId,
        tier,
        status: 'active',
        seats: 0,
        // ONE MONTH, from `billing/period.ts` — DEC-096. The third of four places that each
        // hardcoded a year, and the one that used a different expression from registration's.
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

/**
 * 70 § Interactions, DEC-101, T-101.
 *
 * ~~Delivery in P2 is the RECORD.~~ THE OLD COMMENT'S ARGUMENT WAS HALF RIGHT AND THE MISSING
 * HALF WAS THE WHOLE FEATURE. It said there is no mail transport in this product and
 * inventing one would be a feature nobody asked for — true, and `63` is still P3 behind a
 * provider and `17` (`CONF-006`). But "delivery is the record" is only true if the record is
 * somewhere the RECIPIENT can reach, and the only row this wrote was to
 * `platform_audit_log` — THE OPERATOR'S OWN TABLE. The customer's administrators had no route
 * that read it and no screen that rendered it.
 *
 * SO THE OPERATOR WAS SHOWN "Sent to 3 administrators" AND NOBODY HAD BEEN SENT ANYTHING.
 * That is worse than an unbuilt feature: an unbuilt feature does not report success.
 *
 * TWO ROWS NOW, IN ONE TRANSACTION, and they are two different records rather than one
 * duplicated. The audit row is what the NEXT OPERATOR sees on `/platform/audit` — the
 * conversation this desk has had with this customer. The `notifications` rows are what the
 * CUSTOMER sees in `/app/inbox`. The body is copied onto both deliberately (`10` §5): a
 * shared string that one side could edit is a record of a message that was never sent.
 *
 * STILL NO CHANNEL. Nothing leaves the product; the recipient already visits the inbox, and
 * a row in a table they already open is not `63`'s scope.
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
    // THE CUSTOMER'S COPY — one row per recipient, because read state is the reader's (`58`)
    // and a shared row cannot be read by one administrator and unread by another.
    await tx.notification.createMany({
      data: recipients.map((person) => ({
        orgId,
        userId: person.id,
        kind: 'platform_message',
        subject,
        body,
      })),
    });

    // The operator's. Same transaction, so `{ sentTo: n }` can never again be returned for a
    // message that was not written — which is exactly the failure this replaces.
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

// ---------------------------------------------------------------------------
// The Enterprise queue — DEC-100, T-100, 70 § The Enterprise queue, 19 §4.
//
// A WORK ITEM, NOT A NOTIFICATION. The owner's instruction was *"send a notif on owner admin
// account"*, and a bell was the wrong shape for it: a bell clears on read, and what has to
// survive is not "somebody was told" but "somebody has to ring this customer back". Reading
// this queue changes nothing.
//
// OWNER ONLY — `platform.enterprise.read` / `.update`, both `OWNER_ONLY`. Staff see every
// organisation because support helps one customer at a time; this is a REVENUE queue, and it
// gets the split `DEC-080` already made between `platform.analytics.read` and
// `platform.revenue.read`.
// ---------------------------------------------------------------------------

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
    // A missing subscription row folds into bronze — the same convention `stats()`,
    // `analytics()` and `earnings()` already use (D-012). Three pages agreeing about one
    // organisation matters more than a fourth answer here.
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
    // OLDEST FIRST, and this is the one list on the platform surface that is not newest-first.
    // Every other operator screen answers "what just happened"; a work queue answers "who has
    // been waiting longest", and putting the newest request at the top of it is how the first
    // customer who asked becomes the last one called.
    orderBy: { createdAt: 'asc' },
    select: ENTERPRISE_SELECT,
  });

  return rows.map(enterpriseView);
}

/**
 * Move a request along. `open` -> `contacted` -> `closed`, and back if somebody mis-clicked.
 *
 * NO STATE MACHINE. Three values and a free move between them, because the queue is worked by
 * one person and the cost of a wrong click is another click — a transition table would be
 * machinery guarding against a mistake that costs nothing.
 *
 * MOVING OFF `open` RELEASES THE PARTIAL UNIQUE INDEX, so a customer whose request was closed
 * can ask again. That is the behaviour we want and it is worth naming: the index says "one
 * OPEN request per organisation", never "one request ever".
 */
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
        // WHO CLOSED IT AND WHEN, cleared when it comes back to `open` — a handled-by that
        // survives a reopen names an operator for work that is once again undone.
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

  // THE ROW THAT WAS UPDATED, re-read by its own id. Returning the first row of the new status
  // instead would hand the caller somebody else's request whenever two are in the same state,
  // and the page would show the wrong customer's name against the click.
  const row = await db.enterpriseRequest.findUnique({ where: { id }, select: ENTERPRISE_SELECT });
  if (!row) throw new NotFoundError();
  return enterpriseView(row);
}

/**
 * APPROVE AN ENTERPRISE REQUEST — grant the tier AND record the sale. `DEC-111`, `T-106`.
 *
 * THIS SUPERSEDES `DEC-100`'s LINE that *"the queue tracks the conversation, it does not
 * perform the sale"*. That was right about a queue and wrong about the product: the owner
 * worked a request to `closed`, went to the organisation's page, set the tier by hand through
 * `platform.plan.override` — and `overridePlan` deliberately writes NO `payments` row, so
 * **the one tier the product charges ₹4,999 for earned nothing**. Every Enterprise customer
 * was invisible to `/ops/earnings`.
 *
 * THE "INVENT REVENUE" OBJECTION DOES NOT APPLY HERE, and it is worth saying why rather than
 * quietly widening the seam. `OverridePlan`'s DTO refuses an amount because an operator who
 * could name one could write any number into the ledger. **This names none.** The price comes
 * from `PLAN_OPTIONS` through `recordPayment`, server-side, exactly as it does on the
 * customer's own join — the operator supplies a request id and nothing else.
 *
 * `overridePlan` STAYS MONEY-FREE, and that split is the point. Moving a customer's tier
 * because support asked is not a sale; approving a request they made at the catalogue price
 * is. Two verbs, because the product needs to be able to do one without the other.
 *
 * THE CAPTURE IS THE DIFFERENCE (`DEC-097`), like every other move: a Gold organisation
 * approved to Enterprise contributes ₹4,000, not ₹4,999, because they have already paid for
 * this period once.
 *
 * WHO PAID IS THE PERSON WHO ASKED, read off the request row rather than from the operator's
 * session — `payer_name` answers "who bought this", and the operator did not buy it.
 */
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
    // Not an error worth a 500 and not a silent success either: the queue would otherwise
    // capture a second time for a tier they already hold, which is DEC-096's equal-rank case
    // arriving through a different door.
    throw new ConflictError('That organisation is already on Enterprise.');
  }

  const operator = req.ctx.principal;
  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { orgId },
      // `pendingTier: null` for `joinTier`'s reason — a scheduled move down is stale the
      // moment somebody buys their way up past it. `lapsedFrom: null` for DEC-113's: this is
      // a plan they now hold, so the notice saying the last one ran out is spent.
      update: {
        tier: 'enterprise',
        status: 'active',
        pendingTier: null,
        lapsedFrom: null,
        ...newPeriod(),
      },
      create: { orgId, tier: 'enterprise', status: 'active', seats: 0, ...newPeriod() },
    });

    // THE SALE. Priced server-side from PLAN_OPTIONS, in the same transaction as the tier it
    // pays for — INV-007's argument about audit rows, applied to money: a ledger that
    // disagrees with the subscription table is worse than no ledger.
    await recordPayment(tx, {
      orgId,
      tier: 'enterprise',
      fromTier: from,
      // FULL PRICE WHEN THE BRONZE THEY SIT ON WAS NEVER BOUGHT — DEC-113, the same rule
      // `joinTier` follows. An organisation that lapsed and then asked to be sold Enterprise
      // would otherwise be credited ₹99 it never paid.
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

    // TWO ROWS, because two different things happened and an operator reading the log later
    // needs both: the plan moved, and it moved because a request was approved.
    await writeAudit(tx, req, 'plan.override', orgId, { from, to: 'enterprise', reason: 'enterprise request approved' });
    await writeAudit(tx, req, 'enterprise.approve', orgId, { requestId: id });
  });

  const row = await db.enterpriseRequest.findUnique({ where: { id }, select: ENTERPRISE_SELECT });
  if (!row) throw new NotFoundError();
  return enterpriseView(row);
}

