// WHAT THE OPERATOR CONSOLE SHOWS, AND EVERY FIGURE ON IT. docs/REDUX-PLAN.md §6.12 (R-716).
//
// Two halves, and the split is the answer to "where does this number come from?":
//
// 1. STATE — what each report is showing: the date window Analytics and Earnings share, the
//    estate's filters and sort, the audit trail's filters, the support register's filter,
//    which chart point is under the pointer, and which cached answer each page has on screen.
// 2. SELECTORS — every derived figure. The server answers with COUNTS AND SUMS only (what the
//    database knows); every percentage, share, average, ratio, change and label on `/ops` is
//    worked out HERE, in a memoised selector over the RTK Query cache entry that holds those
//    counts (`state.opsApi.queries`, visible in Redux DevTools). No page computes a figure.
//
// Trace for "Gold 74%" on Analytics:
//   `state.opsApi.queries['getAnalytics("?granularity=month")'].data.byTier` (the counts) →
//   `selectAnalyticsView` → `deriveAnalytics` → `tierMix.rows[gold].percent`, by
//   `sharesOf` (largest remainder, so the mix adds up to exactly 100) → <BarRow percent>.
import {
  createSelector,
  createSlice,
  type PayloadAction,
  type WithSlice,
} from '@reduxjs/toolkit';
import {
  TIERS,
  isQuietOrg,
  type Page,
  type PaymentKind,
  type PlatformAnalytics,
  type PlatformAuditEntry,
  type PlatformEarnings,
  type PlatformOrgSummary,
  type PlatformStats,
  type SupportSessionRow,
  type Tier,
} from '@endur/shared';
import { percentOf, shareOf, type Share } from './figures.js';
import { opsEndpoints } from '../api/endpoints/ops.js';
import { opsSignedOut } from '../opsSlice.js';
import { rootReducer, type RootState } from '../index.js';

// ---------------------------------------------------------------------------------------
// Arithmetic. Exported so the rules are tested once, on their own.
// ---------------------------------------------------------------------------------------

// `Share`, `percentOf` and `shareOf` are the console's too, so they live in `figures.ts` and
// are re-exported here: one rounding rule for every percentage either app prints.
export { percentOf, shareOf, type Share } from './figures.js';

/**
 * Whole-number percentages of a MIX that add up to exactly 100 (largest remainder). Rounding
 * each slice on its own gives 33 + 33 + 33 = 99, and a mix that does not add up is the first
 * thing a reader questions. All zeros when the counts are all zero.
 */
export function sharesOf(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - (floors[index] ?? 0) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

/** Change from one period to the next, in whole percent; `null` with nothing to compare to. */
export function changePercent(previous: number | undefined, current: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

export const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10` → `Oct 2026`, `2026-Q3` → `Q3 2026`. */
export function periodLabel(period: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) return `Q${quarter[2]} ${quarter[1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return `${MONTHS[Number(month[2]) - 1] ?? month[2]} ${month[1]}`;
  return period;
}

/** An ISO instant's calendar day, as `17 Oct 2026` (UTC: the server's windows are UTC days). */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------------------

export type Granularity = 'month' | 'quarter';
export type ReportWindow = { from: string | null; to: string | null; granularity: Granularity };

export type EstateSort = 'attention' | 'name' | 'newest' | 'responses' | 'seats';
export type EstateFilters = { tier: Tier | null; status: string | null; q: string | null };

export type AuditFilters = {
  action: string | null;
  orgId: string | null;
  /** The organisation's name, for the filter's chip: the id alone means nothing to a reader. */
  orgName: string | null;
};
export type SupportShow = 'all' | 'active' | 'over';

/** The charts a pointer can rest on; one point is "focused" at a time, console-wide. */
export type ChartId = 'revenue' | 'movement' | 'purchases';

export type OpsReportsState = {
  /** Analytics and Earnings read ONE window: set it on one, the other opens at it. */
  window: ReportWindow;
  estate: { filters: EstateFilters; sort: EstateSort };
  audit: AuditFilters;
  support: { show: SupportShow };
  /**
   * The search whose answer each page has on screen. While a new window loads, the page keeps
   * showing the last answer, dimmed (`71` § States); this is how the selectors know which
   * cached answer that is.
   */
  shown: { estate: string | null; analytics: string | null; earnings: string | null; audit: string | null };
  focus: { chart: ChartId; index: number } | null;
};

const blankFilters: EstateFilters = { tier: null, status: null, q: null };

export const initialOpsReports: OpsReportsState = {
  window: { from: null, to: null, granularity: 'month' },
  estate: { filters: blankFilters, sort: 'attention' },
  audit: { action: null, orgId: null, orgName: null },
  support: { show: 'all' },
  shown: { estate: null, analytics: null, earnings: null, audit: null },
  focus: null,
};

// The query strings, in a FIXED key order, so one filter set is one cache key.

export function reportSearch(window: ReportWindow): string {
  const params = new URLSearchParams();
  if (window.from) params.set('from', window.from);
  if (window.to) params.set('to', window.to);
  params.set('granularity', window.granularity);
  return `?${params.toString()}`;
}

export function estateSearch(filters: EstateFilters): string {
  const params = new URLSearchParams();
  for (const key of ['tier', 'status', 'q'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function auditSearch(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.orgId) params.set('orgId', filters.orgId);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export const opsReportsSlice = createSlice({
  name: 'opsReports',
  initialState: initialOpsReports,
  reducers: {
    /** A date or the granularity. An empty date clears that end of the window. */
    reportWindowChanged(state, action: PayloadAction<Partial<ReportWindow>>) {
      const { from, to, granularity } = action.payload;
      if (from !== undefined) state.window.from = from || null;
      if (to !== undefined) state.window.to = to || null;
      if (granularity) state.window.granularity = granularity;
      state.focus = null;
    },
    reportWindowReset(state) {
      state.window = initialOpsReports.window;
      state.focus = null;
    },

    estateFilterChanged(state, action: PayloadAction<{ key: keyof EstateFilters; value: string }>) {
      const value = action.payload.value.trim();
      if (action.payload.key === 'tier') {
        state.estate.filters.tier = (TIERS as readonly string[]).includes(value) ? (value as Tier) : null;
      } else {
        state.estate.filters[action.payload.key] = value || null;
      }
    },
    estateFiltersCleared(state) {
      state.estate.filters = blankFilters;
    },
    estateSorted(state, action: PayloadAction<{ sort: EstateSort }>) {
      state.estate.sort = action.payload.sort;
    },

    auditFilterChanged(state, action: PayloadAction<Partial<AuditFilters>>) {
      const { action: what, orgId, orgName } = action.payload;
      if (what !== undefined) state.audit.action = what || null;
      if (orgId !== undefined) {
        state.audit.orgId = orgId || null;
        state.audit.orgName = orgId ? (orgName ?? null) : null;
      }
    },
    supportShown(state, action: PayloadAction<{ show: SupportShow }>) {
      state.support.show = action.payload.show;
    },

    chartFocused(state, action: PayloadAction<{ chart: ChartId; index: number }>) {
      state.focus = action.payload;
    },
    /** Only if it is this chart's point: leaving one chart never clears another's. */
    chartLeft(state, action: PayloadAction<{ chart: ChartId }>) {
      if (state.focus?.chart === action.payload.chart) state.focus = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(opsEndpoints.endpoints.getEstate.matchFulfilled, (state, action) => {
        state.shown.estate = action.meta.arg.originalArgs;
      })
      .addMatcher(opsEndpoints.endpoints.getAnalytics.matchFulfilled, (state, action) => {
        state.shown.analytics = action.meta.arg.originalArgs;
      })
      .addMatcher(opsEndpoints.endpoints.getEarnings.matchFulfilled, (state, action) => {
        state.shown.earnings = action.meta.arg.originalArgs;
      })
      .addMatcher(opsEndpoints.endpoints.getPlatformAudit.matchFulfilled, (state, action) => {
        state.shown.audit = action.meta.arg.originalArgs;
      })
      // The next operator starts from nothing.
      .addMatcher(opsSignedOut.match, () => initialOpsReports);
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof opsReportsSlice> {}
}

const injected = opsReportsSlice.injectInto(rootReducer);
const selectReports = (state: RootState): OpsReportsState => injected.selectSlice(state);

export const {
  reportWindowChanged,
  reportWindowReset,
  estateFilterChanged,
  estateFiltersCleared,
  estateSorted,
  auditFilterChanged,
  supportShown,
  chartFocused,
  chartLeft,
} = opsReportsSlice.actions;

// ---------------------------------------------------------------------------------------
// Plain reads.
// ---------------------------------------------------------------------------------------

export const selectReportWindow = (state: RootState): ReportWindow => selectReports(state).window;
export const selectEstateFilters = (state: RootState): EstateFilters => selectReports(state).estate.filters;
export const selectEstateSort = (state: RootState): EstateSort => selectReports(state).estate.sort;
export const selectAuditFilters = (state: RootState): AuditFilters => selectReports(state).audit;
export const selectSupportShow = (state: RootState): SupportShow => selectReports(state).support.show;

/** The point under the pointer on this chart, or `null`. */
export const selectChartFocus = (state: RootState, chart: ChartId): number | null => {
  const focus = selectReports(state).focus;
  return focus?.chart === chart ? focus.index : null;
};

export const selectReportSearch = createSelector([selectReportWindow], reportSearch);
export const selectEstateSearch = createSelector([selectEstateFilters], estateSearch);
export const selectAuditSearch = createSelector([selectAuditFilters], auditSearch);

/** True when any estate filter is set: the empty state then offers to clear them. */
export const selectEstateFiltered = createSelector([selectEstateFilters], (filters) =>
  Boolean(filters.tier || filters.status || filters.q),
);

// The cached answers. The requested search's when it has one, else the one on screen.
const shownOr = <T,>(requested: T | undefined, shown: () => T | undefined): T | undefined => requested ?? shown();

const selectAnalyticsData = (state: RootState): PlatformAnalytics | undefined => {
  const read = (search: string) => opsEndpoints.endpoints.getAnalytics.select(search)(state).data;
  const shown = selectReports(state).shown.analytics;
  return shownOr(read(selectReportSearch(state)), () => (shown === null ? undefined : read(shown)));
};

const selectEarningsData = (state: RootState): PlatformEarnings | undefined => {
  const read = (search: string) => opsEndpoints.endpoints.getEarnings.select(search)(state).data;
  const shown = selectReports(state).shown.earnings;
  return shownOr(read(selectReportSearch(state)), () => (shown === null ? undefined : read(shown)));
};

type Pages<T> = { pages: Page<T>[] } | undefined;

const selectEstatePages = (state: RootState): Pages<PlatformOrgSummary> => {
  const read = (search: string) => opsEndpoints.endpoints.getEstate.select(search)(state).data;
  const shown = selectReports(state).shown.estate;
  return shownOr(read(selectEstateSearch(state)), () => (shown === null ? undefined : read(shown)));
};

const selectAuditPages = (state: RootState): Pages<PlatformAuditEntry> => {
  const read = (search: string) => opsEndpoints.endpoints.getPlatformAudit.select(search)(state).data;
  const shown = selectReports(state).shown.audit;
  return shownOr(read(selectAuditSearch(state)), () => (shown === null ? undefined : read(shown)));
};

const selectStatsData = (state: RootState): PlatformStats | undefined =>
  opsEndpoints.endpoints.getOpsStats.select()(state).data;

// ---------------------------------------------------------------------------------------
// The estate: its six numbers, and the list.
// ---------------------------------------------------------------------------------------

export type EstateStatsView = {
  organizations: number;
  active: Share;
  suspended: Share;
  seats: number;
  /** Seats per organisation, one decimal; `null` with no organisations. */
  seatsPerOrg: number | null;
  campaigns: number;
  responses: number;
  tiers: Array<{ tier: Tier; label: string } & Share>;
};

export function deriveEstateStats(stats: PlatformStats): EstateStatsView {
  const counts = TIERS.map((tier) => stats.byTier[tier] ?? 0);
  const percents = sharesOf(counts);
  const onTiers = sum(counts);
  return {
    organizations: stats.organizations,
    active: shareOf(stats.organizations - stats.suspended, stats.organizations),
    suspended: shareOf(stats.suspended, stats.organizations),
    seats: stats.seats,
    seatsPerOrg: stats.organizations > 0 ? oneDecimal(stats.seats / stats.organizations) : null,
    campaigns: stats.campaigns,
    responses: stats.responses,
    tiers: TIERS.map((tier, index) => ({
      tier,
      label: TIER_LABEL[tier],
      count: counts[index] ?? 0,
      of: onTiers,
      percent: percents[index] ?? 0,
    })),
  };
}

export const selectEstateStatsView = createSelector([selectStatsData], (stats) =>
  stats ? deriveEstateStats(stats) : null,
);

export type OrgChip = 'quiet' | 'overSeats' | 'lapsed' | 'endingSoon' | 'suspended';

/** How many days before a period ends an organisation reads "Ending soon" (DEC-113). */
export const ENDING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` (a `YYYY-MM-DD`) to an instant; negative once it has passed. */
export function daysFrom(today: string, iso: string): number {
  const start = Date.parse(`${today}T00:00:00.000Z`);
  return Math.floor((Date.parse(iso) - start) / DAY_MS);
}

/** The flags beside an organisation's name. `today` is passed in, so this stays pure. */
export function chipsOf(org: PlatformOrgSummary, today: string): OrgChip[] {
  const chips: OrgChip[] = [];
  if (org.suspendedAt) chips.push('suspended');
  if (isQuietOrg(org)) chips.push('quiet');
  if (org.seatLimit !== null && org.seats > org.seatLimit) chips.push('overSeats');
  if (org.lapsedFrom) chips.push('lapsed');
  else if (org.tier !== 'bronze' && org.periodEnd) {
    const left = daysFrom(today, org.periodEnd);
    if (left >= 0 && left <= ENDING_SOON_DAYS) chips.push('endingSoon');
  }
  return chips;
}

export type EstateRow = {
  org: PlatformOrgSummary;
  tierLabel: string;
  chips: OrgChip[];
  /** `12` or `12 / 10` against a limit. */
  seatsLabel: string;
  /** Days until the period ends, when there is one and it has not passed. */
  daysLeft: number | null;
};

export type EstateView = {
  rows: EstateRow[];
  /** What the server says matches the filters; `rows` is how many are loaded so far. */
  total: number;
  hasMore: boolean;
  /** Counted over the LOADED rows, and the page says so. */
  flagged: { quiet: number; lapsed: number; endingSoon: number; suspended: number; overSeats: number };
};

const lastActive = (org: PlatformOrgSummary): number =>
  org.lastActivityAt ? Date.parse(org.lastActivityAt) : Number.NEGATIVE_INFINITY;

/**
 * The order. "Needs attention" is the default and the reason the estate exists: the
 * organisations that went quiet longest ago first, and one that never did anything before
 * all of them.
 */
const ORDER: Record<EstateSort, (a: PlatformOrgSummary, b: PlatformOrgSummary) => number> = {
  attention: (a, b) => lastActive(a) - lastActive(b),
  name: (a, b) => a.name.localeCompare(b.name),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  responses: (a, b) => b.responsesLast30d - a.responsesLast30d,
  seats: (a, b) => b.seats - a.seats,
};

export function deriveEstate(
  pages: Page<PlatformOrgSummary>[] | undefined,
  sort: EstateSort,
  today: string,
): EstateView {
  const orgs = (pages ?? []).flatMap((page) => page.data);
  const rows = [...orgs].sort(ORDER[sort]).map((org): EstateRow => {
    const left = org.periodEnd ? daysFrom(today, org.periodEnd) : null;
    return {
      org,
      tierLabel: TIER_LABEL[org.tier],
      chips: chipsOf(org, today),
      seatsLabel: org.seatLimit === null ? String(org.seats) : `${org.seats} / ${org.seatLimit}`,
      daysLeft: left !== null && left >= 0 ? left : null,
    };
  });
  const flagged = { quiet: 0, lapsed: 0, endingSoon: 0, suspended: 0, overSeats: 0 };
  for (const row of rows) for (const chip of row.chips) flagged[chip] += 1;
  const last = pages?.at(-1);
  const first = pages?.[0];
  const total = typeof first?.meta?.total === 'number' ? first.meta.total : rows.length;
  return { rows, total, hasMore: last?.page.hasMore ?? false, flagged };
}

export const selectEstateView = createSelector(
  [
    (state: RootState) => selectEstatePages(state)?.pages,
    selectEstateSort,
    (_state: RootState, today: string) => today,
  ],
  deriveEstate,
);

// ---------------------------------------------------------------------------------------
// Analytics.
// ---------------------------------------------------------------------------------------

type MovementKey = 'new' | 'trialStarted' | 'upgraded' | 'downgraded' | 'churned';
const MOVEMENT_KEYS: readonly MovementKey[] = ['new', 'trialStarted', 'upgraded', 'downgraded', 'churned'];

export type AnalyticsView = {
  window: { label: string; granularity: Granularity };
  orgs: { total: number; joined: Share; trialing: Share; cancelled: Share };
  tierMix: { onPlan: number; rows: Array<{ tier: Tier; label: string } & Share> };
  adoption: {
    withCampaign: Share;
    withResponse: Share;
    quiet: Share;
    /** The estate, narrowing: each step as a share of the whole AND (from the third step)
     *  of the step before. */
    funnel: Array<{ label: string; count: number; percent: number; ofPrevious: number | null }>;
  };
  movement: {
    rows: Array<PlatformAnalytics['movement'][number] & {
      label: string;
      /** Each count against the busiest count in the window, 0–1: a bar's height. */
      ratios: Record<MovementKey, number>;
    }>;
    totals: Record<MovementKey, number>;
    peak: number;
  };
  totals: { campaigns: number; responses: number; responsesPerCampaign: number | null };
};

export function deriveAnalytics(data: PlatformAnalytics): AnalyticsView {
  const { total } = data.orgs;
  const counts = TIERS.map((tier) => data.byTier.find((row) => row.tier === tier)?.orgs ?? 0);
  const percents = sharesOf(counts);
  const onPlan = sum(counts);

  const peak = Math.max(1, ...data.movement.flatMap((row) => MOVEMENT_KEYS.map((key) => row[key])));
  const totals = Object.fromEntries(
    MOVEMENT_KEYS.map((key) => [key, sum(data.movement.map((row) => row[key]))]),
  ) as Record<MovementKey, number>;

  const { orgsWithACampaign, orgsWithAResponse, orgsQuiet30d } = data.adoption;

  return {
    window: {
      label: `${dayLabel(data.window.from)} – ${dayLabel(data.window.to)}`,
      granularity: data.window.granularity,
    },
    orgs: {
      total,
      joined: shareOf(data.orgs.joined, total),
      trialing: shareOf(data.orgs.trialing, total),
      cancelled: shareOf(data.orgs.cancelled, total),
    },
    tierMix: {
      onPlan,
      rows: TIERS.map((tier, index) => ({
        tier,
        label: TIER_LABEL[tier],
        count: counts[index] ?? 0,
        of: onPlan,
        percent: percents[index] ?? 0,
      })),
    },
    adoption: {
      withCampaign: shareOf(orgsWithACampaign, total),
      withResponse: shareOf(orgsWithAResponse, total),
      quiet: shareOf(orgsQuiet30d, total),
      funnel: [
        { label: 'On the platform', count: total, percent: total > 0 ? 100 : 0, ofPrevious: null },
        // `ofPrevious` is null here: the step before IS the whole estate, so it would only
        // repeat `percent`.
        {
          label: 'Ran a campaign',
          count: orgsWithACampaign,
          percent: percentOf(orgsWithACampaign, total),
          ofPrevious: null,
        },
        {
          label: 'Collected a response',
          count: orgsWithAResponse,
          percent: percentOf(orgsWithAResponse, total),
          ofPrevious: orgsWithACampaign > 0 ? percentOf(orgsWithAResponse, orgsWithACampaign) : null,
        },
      ],
    },
    movement: {
      rows: data.movement.map((row) => ({
        ...row,
        label: periodLabel(row.period),
        ratios: Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, row[key] / peak])) as Record<MovementKey, number>,
      })),
      totals,
      peak,
    },
    totals: {
      campaigns: data.totals.campaigns,
      responses: data.totals.responses,
      responsesPerCampaign:
        data.totals.campaigns > 0 ? oneDecimal(data.totals.responses / data.totals.campaigns) : null,
    },
  };
}

export const selectAnalyticsView = createSelector([selectAnalyticsData], (data) =>
  data ? deriveAnalytics(data) : null,
);

// ---------------------------------------------------------------------------------------
// Earnings.
// ---------------------------------------------------------------------------------------

type Payment = PlatformEarnings['recent'][number];

/** Why a payment happened, in words. */
export function reasonOf(payment: { kind: PaymentKind; tier: Tier; fromTier: Tier | null }): string {
  if (payment.kind === 'signup') return 'New organization';
  if (payment.kind === 'trial_signup') return 'Trial started';
  if (payment.kind === 'trial_expired') return 'Trial ended';
  const from = payment.fromTier ? TIER_LABEL[payment.fromTier] : 'Unknown';
  const move = `${from} → ${TIER_LABEL[payment.tier]}`;
  if (payment.kind === 'expiry') return `${move} · scheduled`;
  if (payment.kind === 'lapse') return `${move} · lapsed`;
  return move;
}

const RANK = new Map(TIERS.map((tier, index) => [tier, index]));

export type EarningsView = {
  currency: PlatformEarnings['currency'];
  window: { label: string; granularity: Granularity };
  totals: {
    revenueMinor: number;
    lifetimeRevenueMinor: number;
    payments: number;
    orgsPaying: number;
    /** Revenue ÷ payments, rounded to the paisa; `null` (a dash) with no payments: the mean
     *  of nothing is not zero. */
    averageMinor: number | null;
    /** This window's revenue as a share of everything ever taken. */
    ofLifetime: Share;
  };
  periods: {
    rows: Array<{
      period: string;
      label: string;
      revenueMinor: number;
      payments: number;
      /** Against the best period, 0–1: a bar's height. */
      ratio: number;
      /** Against the period before, in percent; `null` for the first or after an empty one. */
      change: number | null;
    }>;
    peakMinor: number;
    best: { label: string; revenueMinor: number } | null;
  };
  plans: {
    onPlan: number;
    rows: Array<{
      tier: Tier;
      label: string;
      orgsOnTier: number;
      /** Of the organisations on a plan now. Adds up to 100. */
      orgPercent: number;
      revenueMinor: number;
      /** Of this window's revenue. Adds up to 100. */
      revenuePercent: number;
      payments: number;
      /** The ring's slice, in degrees, from the exact counts (not the rounded percents). */
      arc: { from: number; to: number };
    }>;
  };
  purchases: {
    rows: Array<{ period: string; label: string; bronze: number; silver: number; gold: number;
      ratios: { bronze: number; silver: number; gold: number } }>;
    totals: { bronze: number; silver: number; gold: number };
  };
  recent: Array<Payment & { reason: string }>;
  changes: Array<Payment & { move: string; direction: 'up' | 'down' }>;
};

export function deriveEarnings(data: PlatformEarnings): EarningsView {
  const { totals } = data;

  const peakMinor = Math.max(0, ...data.byPeriod.map((row) => row.revenueMinor));
  const bestRow = data.byPeriod.reduce<PlatformEarnings['byPeriod'][number] | null>(
    (best, row) => (row.revenueMinor > (best?.revenueMinor ?? 0) ? row : best),
    null,
  );

  const orgCounts = data.byTier.map((row) => row.orgsOnTier);
  const orgPercents = sharesOf(orgCounts);
  const revenuePercents = sharesOf(data.byTier.map((row) => row.revenueMinor));
  const onPlan = sum(orgCounts);
  let sweep = 0;

  const purchasePeak = Math.max(1, ...data.tierOverTime.flatMap((row) => [row.bronze, row.silver, row.gold]));

  return {
    currency: data.currency,
    window: {
      label: `${dayLabel(data.window.from)} – ${dayLabel(data.window.to)}`,
      granularity: data.window.granularity,
    },
    totals: {
      revenueMinor: totals.revenueMinor,
      lifetimeRevenueMinor: totals.lifetimeRevenueMinor,
      payments: totals.payments,
      orgsPaying: totals.orgsPaying,
      averageMinor: totals.payments > 0 ? Math.round(totals.revenueMinor / totals.payments) : null,
      ofLifetime: shareOf(totals.revenueMinor, totals.lifetimeRevenueMinor),
    },
    periods: {
      rows: data.byPeriod.map((row, index) => ({
        period: row.period,
        label: periodLabel(row.period),
        revenueMinor: row.revenueMinor,
        payments: row.payments,
        ratio: peakMinor > 0 ? row.revenueMinor / peakMinor : 0,
        change: changePercent(data.byPeriod[index - 1]?.revenueMinor, row.revenueMinor),
      })),
      peakMinor,
      best: bestRow ? { label: periodLabel(bestRow.period), revenueMinor: bestRow.revenueMinor } : null,
    },
    plans: {
      onPlan,
      rows: data.byTier.map((row, index) => {
        const from = sweep;
        sweep += onPlan > 0 ? (row.orgsOnTier / onPlan) * 360 : 0;
        return {
          tier: row.tier,
          label: TIER_LABEL[row.tier],
          orgsOnTier: row.orgsOnTier,
          orgPercent: orgPercents[index] ?? 0,
          revenueMinor: row.revenueMinor,
          revenuePercent: revenuePercents[index] ?? 0,
          payments: row.payments,
          arc: { from, to: sweep },
        };
      }),
    },
    purchases: {
      rows: data.tierOverTime.map((row) => ({
        ...row,
        label: periodLabel(row.period),
        ratios: {
          bronze: row.bronze / purchasePeak,
          silver: row.silver / purchasePeak,
          gold: row.gold / purchasePeak,
        },
      })),
      totals: {
        bronze: sum(data.tierOverTime.map((row) => row.bronze)),
        silver: sum(data.tierOverTime.map((row) => row.silver)),
        gold: sum(data.tierOverTime.map((row) => row.gold)),
      },
    },
    recent: data.recent.map((row) => ({ ...row, reason: reasonOf(row) })),
    changes: data.recentChanges.map((row) => ({
      ...row,
      move: reasonOf(row),
      direction: (RANK.get(row.tier) ?? 0) >= (RANK.get(row.fromTier ?? 'bronze') ?? 0) ? 'up' : 'down',
    })),
  };
}

export const selectEarningsView = createSelector([selectEarningsData], (data) =>
  data ? deriveEarnings(data) : null,
);

// ---------------------------------------------------------------------------------------
// The audit trail.
// ---------------------------------------------------------------------------------------

/** Every action the platform writes (`src/backend/features/platform/service.ts`), in words. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'plan.override': 'Changed a plan',
  'org.suspend': 'Suspended an organization',
  'org.unsuspend': 'Reinstated an organization',
  'message.send': 'Messaged administrators',
  'support.enter': 'Opened a support session',
  'support.leave': 'Left a support session',
  'enterprise.update': 'Worked an Enterprise request',
  'enterprise.approve': 'Approved Enterprise',
  'operator.create': 'Added an operator',
  'operator.update': 'Changed an operator',
  'logs.read': 'Read a log file',
  'logs.export': 'Exported a log file',
};

export type AuditTone = 'money' | 'danger' | 'access' | 'team' | 'quiet';

const TONE: Record<string, AuditTone> = {
  'plan.override': 'money',
  'enterprise.approve': 'money',
  'enterprise.update': 'money',
  'org.suspend': 'danger',
  'org.unsuspend': 'danger',
  'support.enter': 'access',
  'support.leave': 'access',
  'operator.create': 'team',
  'operator.update': 'team',
};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const tierName = (value: unknown): string => {
  const name = text(value);
  return name && name in TIER_LABEL ? TIER_LABEL[name as Tier] : (name ?? '?');
};

/** One line saying what the action changed, from its recorded payload. */
export function auditSummary(entry: Pick<PlatformAuditEntry, 'action' | 'payload'>): string | null {
  const p = entry.payload ?? {};
  switch (entry.action) {
    case 'plan.override':
      return `${tierName(p.from)} → ${tierName(p.to)}${text(p.reason) ? ` · ${text(p.reason)}` : ''}`;
    case 'org.suspend':
    case 'org.unsuspend':
      return text(p.reason);
    case 'message.send': {
      const recipients = Array.isArray(p.recipients) ? p.recipients.length : 0;
      return `“${text(p.subject) ?? ''}” to ${recipients} administrator${recipients === 1 ? '' : 's'}`;
    }
    case 'support.enter':
      return text(p.reason) ? `“${text(p.reason)}”` : null;
    case 'enterprise.update':
      return text(p.status) ? `Marked ${text(p.status)}` : null;
    case 'operator.create':
      return `${text(p.email) ?? 'An operator'} as ${text(p.role) ?? '?'}`;
    case 'operator.update': {
      const changes = [text(p.role) && `role ${text(p.role)}`, text(p.status) && `now ${text(p.status)}`].filter(Boolean);
      return changes.length ? changes.join(', ') : null;
    }
    case 'logs.read':
      return text(p.file);
    case 'logs.export':
      return `${text(p.file) ?? ''} as ${text(p.format) ?? ''}${typeof p.lines === 'number' ? ` · ${p.lines} lines` : ''}`;
    default:
      return null;
  }
}

export type AuditRow = PlatformAuditEntry & { label: string; summary: string | null; tone: AuditTone };

export type AuditView = {
  rows: AuditRow[];
  total: number;
  hasMore: boolean;
  /** The loaded rows by what was done, busiest first: the filter's own counts. */
  byAction: Array<{ action: string; label: string; count: number }>;
};

export function deriveAudit(pages: Page<PlatformAuditEntry>[] | undefined): AuditView {
  const entries = (pages ?? []).flatMap((page) => page.data);
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  const first = pages?.[0];
  return {
    rows: entries.map((entry) => ({
      ...entry,
      label: AUDIT_ACTIONS[entry.action] ?? entry.action,
      summary: auditSummary(entry),
      tone: TONE[entry.action] ?? 'quiet',
    })),
    total: typeof first?.meta?.total === 'number' ? first.meta.total : entries.length,
    hasMore: pages?.at(-1)?.page.hasMore ?? false,
    byAction: [...counts.entries()]
      .map(([action, count]) => ({ action, label: AUDIT_ACTIONS[action] ?? action, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export const selectAuditView = createSelector([(state: RootState) => selectAuditPages(state)?.pages], deriveAudit);

/** One search's trail, for a page that is not the audit page (an organisation's activity). */
export const selectAuditViewFor = createSelector(
  [(state: RootState, search: string) => opsEndpoints.endpoints.getPlatformAudit.select(search)(state).data?.pages],
  deriveAudit,
);

// ---------------------------------------------------------------------------------------
// The support register.
// ---------------------------------------------------------------------------------------

export type SupportStatus = 'active' | 'left' | 'expired';

export type SupportRow = SupportSessionRow & {
  status: SupportStatus;
  /** How long it lasted, in whole minutes; `null` while it is still open. */
  minutes: number | null;
};

export type SupportView = {
  rows: SupportRow[];
  counts: { all: number; active: number; over: number };
  /** Distinct organisations and operators in the register. */
  orgs: number;
  operators: number;
  /** The mean length of a finished visit, in minutes; `null` with none finished. */
  averageMinutes: number | null;
};

export function supportStatusOf(row: SupportSessionRow): SupportStatus {
  if (row.active) return 'active';
  return row.endedAt ? 'left' : 'expired';
}

export function deriveSupport(rows: SupportSessionRow[] | undefined, show: SupportShow): SupportView {
  const all = (rows ?? []).map((row): SupportRow => {
    const status = supportStatusOf(row);
    const end = status === 'left' ? row.endedAt : status === 'expired' ? row.expiresAt : null;
    return {
      ...row,
      status,
      minutes: end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(row.startedAt)) / 60000)) : null,
    };
  });
  const over = all.filter((row) => row.status !== 'active');
  const finished = over.map((row) => row.minutes ?? 0);
  return {
    rows: show === 'all' ? all : show === 'active' ? all.filter((row) => row.status === 'active') : over,
    counts: { all: all.length, active: all.length - over.length, over: over.length },
    orgs: new Set(all.map((row) => row.org.id)).size,
    operators: new Set(all.map((row) => row.operator.id)).size,
    averageMinutes: finished.length > 0 ? Math.round(sum(finished) / finished.length) : null,
  };
}

/** The register, or one organisation's part of it (`orgId`), filtered by `show`. */
export const selectSupportView = createSelector(
  [
    (state: RootState, search: string) => opsEndpoints.endpoints.getSupportSessions.select(search)(state).data,
    (state: RootState, _search: string, show?: SupportShow) => show ?? selectSupportShow(state),
  ],
  deriveSupport,
);

export function supportSearch(orgId?: string): string {
  return orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
}
