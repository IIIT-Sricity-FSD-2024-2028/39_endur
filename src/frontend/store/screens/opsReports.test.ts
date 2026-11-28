// R-716: every figure on the operator console is a selector's. These pin the arithmetic
// (each rule once), and that the selectors read the RTK Query cache entry for the window or
// filters in the store, and keep the last answer on screen while the next one loads.
import { describe, expect, it } from 'vitest';
import type {
  Page,
  PlatformAnalytics,
  PlatformEarnings,
  PlatformOrgSummary,
  PlatformStats,
  SupportSessionRow,
} from '@endur/shared';
import { setupStore } from '../index.js';
import { opsEndpoints } from '../api/endpoints/ops.js';
import { opsSignedOut } from '../opsSlice.js';
import {
  auditSummary,
  changePercent,
  chipsOf,
  chartFocused,
  chartLeft,
  deriveAnalytics,
  deriveAudit,
  deriveEarnings,
  deriveEstate,
  deriveEstateStats,
  deriveSupport,
  estateFilterChanged,
  percentOf,
  periodLabel,
  reasonOf,
  reportWindowChanged,
  reportWindowReset,
  selectAnalyticsView,
  selectChartFocus,
  selectEstateSearch,
  selectReportSearch,
  selectReportWindow,
  sharesOf,
} from './opsReports.js';

const ANALYTICS: PlatformAnalytics = {
  window: { from: '2026-01-01T00:00:00.000Z', to: '2026-03-31T00:00:00.000Z', granularity: 'month' },
  orgs: { total: 50, joined: 37, trialing: 10, cancelled: 3 },
  byTier: [
    { tier: 'bronze', orgs: 20 },
    { tier: 'silver', orgs: 10 },
    { tier: 'gold', orgs: 7 },
    { tier: 'enterprise', orgs: 3 },
  ],
  movement: [
    { period: '2026-01', new: 4, upgraded: 1, downgraded: 0, churned: 1, trialStarted: 2 },
    { period: '2026-02', new: 8, upgraded: 2, downgraded: 1, churned: 0, trialStarted: 0 },
  ],
  adoption: { orgsWithACampaign: 40, orgsWithAResponse: 30, orgsQuiet30d: 5 },
  totals: { campaigns: 80, responses: 1000 },
};

const EARNINGS: PlatformEarnings = {
  window: { from: '2026-01-01T00:00:00.000Z', to: '2026-03-31T00:00:00.000Z', granularity: 'month' },
  currency: 'INR',
  totals: { revenueMinor: 300000, payments: 4, orgsPaying: 3, lifetimeRevenueMinor: 1200000 },
  byPeriod: [
    { period: '2026-01', revenueMinor: 100000, payments: 1 },
    { period: '2026-02', revenueMinor: 0, payments: 0 },
    { period: '2026-03', revenueMinor: 200000, payments: 3 },
  ],
  byTier: [
    { tier: 'bronze', payments: 0, revenueMinor: 0, orgsOnTier: 1 },
    { tier: 'silver', payments: 1, revenueMinor: 100000, orgsOnTier: 1 },
    { tier: 'gold', payments: 3, revenueMinor: 200000, orgsOnTier: 1 },
    { tier: 'enterprise', payments: 0, revenueMinor: 0, orgsOnTier: 0 },
  ],
  tierOverTime: [
    { period: '2026-01', bronze: 0, silver: 1, gold: 0 },
    { period: '2026-03', bronze: 0, silver: 0, gold: 3 },
  ],
  recent: [
    {
      id: 'p1', at: '2026-03-02T00:00:00.000Z', tier: 'gold', fromTier: 'silver', kind: 'change',
      amountMinor: 90000, currency: 'INR', payerName: 'Ravi', reference: 'r1', orgId: 'o1', orgName: 'Northfield',
    },
  ],
  recentChanges: [
    {
      id: 'p1', at: '2026-03-02T00:00:00.000Z', tier: 'gold', fromTier: 'silver', kind: 'change',
      amountMinor: 90000, currency: 'INR', payerName: 'Ravi', reference: 'r1', orgId: 'o1', orgName: 'Northfield',
    },
    {
      id: 'p2', at: '2026-03-01T00:00:00.000Z', tier: 'bronze', fromTier: 'gold', kind: 'expiry',
      amountMinor: 0, currency: 'INR', payerName: 'Endur', reference: 'r2', orgId: 'o2', orgName: 'Riverside',
    },
  ],
};

const org = (patch: Partial<PlatformOrgSummary>): PlatformOrgSummary => ({
  id: 'o1', name: 'Northfield', slug: 'northfield', industry: 'university', tier: 'gold',
  subscriptionStatus: 'active', periodEnd: null, lapsedFrom: null, seats: 5, seatLimit: null,
  activeCampaigns: 1, responsesLast30d: 3, lastActivityAt: '2026-10-01T00:00:00.000Z',
  suspendedAt: null, createdAt: '2026-01-01T00:00:00.000Z', ...patch,
});

const page = <T,>(data: T[], hasMore = false, total = data.length): Page<T> => ({
  data, page: { nextCursor: hasMore ? 'next' : null, hasMore }, meta: { total },
});

describe('the arithmetic', () => {
  it('a percent of nothing is 0, not NaN', () => {
    expect(percentOf(37, 50)).toBe(74);
    expect(percentOf(3, 0)).toBe(0);
  });

  it('a mix adds up to exactly 100 (largest remainder), and all-zero stays zero', () => {
    expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf([20, 10, 7, 3]).reduce((a, b) => a + b)).toBe(100);
    expect(sharesOf([0, 0])).toEqual([0, 0]);
    expect(sharesOf([2, 0, 0])).toEqual([100, 0, 0]);
  });

  it('a change needs something to change from', () => {
    expect(changePercent(100, 150)).toBe(50);
    expect(changePercent(200, 100)).toBe(-50);
    expect(changePercent(0, 100)).toBeNull();
    expect(changePercent(undefined, 100)).toBeNull();
  });

  it('periods read as words', () => {
    expect(periodLabel('2026-10')).toBe('Oct 2026');
    expect(periodLabel('2026-Q3')).toBe('Q3 2026');
  });
});

describe('deriveAnalytics', () => {
  const view = deriveAnalytics(ANALYTICS);

  it('says what every share is a share OF', () => {
    expect(view.orgs.joined).toEqual({ count: 37, of: 50, percent: 74 });
    expect(view.adoption.quiet).toEqual({ count: 5, of: 50, percent: 10 });
  });

  it('the plan mix is of the organisations ON a plan, and adds up to 100', () => {
    expect(view.tierMix.onPlan).toBe(40);
    expect(view.tierMix.rows.map((row) => row.percent)).toEqual([50, 25, 18, 7]);
    expect(view.tierMix.rows.every((row) => row.of === 40)).toBe(true);
  });

  it('the funnel narrows, each step against the whole and the step before', () => {
    expect(view.adoption.funnel.map((step) => [step.count, step.percent, step.ofPrevious])).toEqual([
      [50, 100, null],
      [40, 80, null],
      [30, 60, 75],
    ]);
  });

  it('movement: totals for the window, and bar heights against the busiest count', () => {
    expect(view.movement.totals).toEqual({ new: 12, trialStarted: 2, upgraded: 3, downgraded: 1, churned: 1 });
    expect(view.movement.peak).toBe(8);
    expect(view.movement.rows[1]?.ratios.new).toBe(1);
    expect(view.movement.rows[0]?.ratios.new).toBe(0.5);
    expect(view.totals.responsesPerCampaign).toBe(12.5);
  });
});

describe('deriveEarnings', () => {
  const view = deriveEarnings(EARNINGS);

  it('derives the average and this window against all time; the server sends neither', () => {
    expect(view.totals.averageMinor).toBe(75000);
    expect(view.totals.ofLifetime).toEqual({ count: 300000, of: 1200000, percent: 25 });
  });

  it('the mean of no payments is a dash, not zero', () => {
    const empty = deriveEarnings({ ...EARNINGS, totals: { ...EARNINGS.totals, revenueMinor: 0, payments: 0 } });
    expect(empty.totals.averageMinor).toBeNull();
  });

  it('periods: bar heights against the best one, and the change from the period before', () => {
    expect(view.periods.rows.map((row) => row.ratio)).toEqual([0.5, 0, 1]);
    expect(view.periods.rows.map((row) => row.change)).toEqual([null, -100, null]);
    expect(view.periods.best).toEqual({ label: 'Mar 2026', revenueMinor: 200000 });
  });

  it('the plan mix: two shares that each add up to 100, and the ring from the exact counts', () => {
    expect(view.plans.rows.map((row) => row.orgPercent)).toEqual([34, 33, 33, 0]);
    expect(view.plans.rows.map((row) => row.revenuePercent)).toEqual([0, 33, 67, 0]);
    expect(view.plans.rows[2]?.arc).toEqual({ from: 240, to: 360 });
  });

  it('says why each payment happened, and which way a plan moved', () => {
    expect(view.recent[0]?.reason).toBe('Silver → Gold');
    expect(view.changes.map((row) => [row.move, row.direction])).toEqual([
      ['Silver → Gold', 'up'],
      ['Gold → Bronze · scheduled', 'down'],
    ]);
    expect(reasonOf({ kind: 'signup', tier: 'gold', fromTier: null })).toBe('New organization');
  });
});

describe('the estate', () => {
  it('flags: suspended, quiet, over seats, lapsed, and ending within seven days', () => {
    const today = '2026-11-01';
    expect(chipsOf(org({ suspendedAt: '2026-10-01T00:00:00.000Z' }), today)).toContain('suspended');
    expect(chipsOf(org({ responsesLast30d: 0 }), today)).toContain('quiet');
    expect(chipsOf(org({ seats: 12, seatLimit: 10 }), today)).toContain('overSeats');
    expect(chipsOf(org({ lapsedFrom: 'gold', tier: 'bronze' }), today)).toEqual(['lapsed']);
    expect(chipsOf(org({ periodEnd: '2026-11-05T00:00:00.000Z' }), today)).toContain('endingSoon');
    expect(chipsOf(org({ periodEnd: '2026-11-30T00:00:00.000Z' }), today)).not.toContain('endingSoon');
    // Bronze never "ends".
    expect(chipsOf(org({ tier: 'bronze', periodEnd: '2026-11-02T00:00:00.000Z' }), today)).toEqual([]);
  });

  it('orders the loaded rows, counts the flags, and reads the total from the server', () => {
    const rows = [
      org({ id: 'a', name: 'Zeta', lastActivityAt: '2026-10-20T00:00:00.000Z', responsesLast30d: 9 }),
      org({ id: 'b', name: 'Alpha', lastActivityAt: null, responsesLast30d: 0 }),
      org({ id: 'c', name: 'Mid', lastActivityAt: '2026-09-01T00:00:00.000Z', responsesLast30d: 0 }),
    ];
    const pages = [page(rows, true, 40)];
    const attention = deriveEstate(pages, 'attention', '2026-11-01');
    expect(attention.rows.map((row) => row.org.id)).toEqual(['b', 'c', 'a']);
    expect(attention.total).toBe(40);
    expect(attention.hasMore).toBe(true);
    // `b` has never been active, so it is not "quiet" (it never started); `c` is.
    expect(attention.flagged.quiet).toBe(1);
    expect(deriveEstate(pages, 'name', '2026-11-01').rows.map((row) => row.org.name)).toEqual(['Alpha', 'Mid', 'Zeta']);
    expect(deriveEstate(pages, 'responses', '2026-11-01').rows[0]?.org.id).toBe('a');
  });

  it('the six numbers: shares of the estate, and seats per organisation', () => {
    const stats: PlatformStats = {
      organizations: 8, suspended: 2, byTier: { bronze: 4, silver: 2, gold: 1, enterprise: 1 },
      seats: 30, campaigns: 5, responses: 900,
    };
    const view = deriveEstateStats(stats);
    expect(view.active).toEqual({ count: 6, of: 8, percent: 75 });
    expect(view.seatsPerOrg).toBe(3.8);
    expect(view.tiers.map((tier) => tier.percent)).toEqual([50, 25, 13, 12]);
  });
});

describe('the registers', () => {
  it('the audit trail says what each action changed', () => {
    expect(auditSummary({ action: 'plan.override', payload: { from: 'bronze', to: 'gold', reason: 'Deal' } }))
      .toBe('Bronze → Gold · Deal');
    expect(auditSummary({ action: 'message.send', payload: { subject: 'Hi', recipients: ['a', 'b'] } }))
      .toBe('“Hi” to 2 administrators');
    const view = deriveAudit([page([
      { id: '1', at: 'x', actor: null, action: 'org.suspend', org: null, payload: null, requestId: null },
      { id: '2', at: 'x', actor: null, action: 'org.suspend', org: null, payload: null, requestId: null },
      { id: '3', at: 'x', actor: null, action: 'logs.read', org: null, payload: { file: 'a.log' }, requestId: null },
    ], false, 3)]);
    expect(view.byAction[0]).toEqual({ action: 'org.suspend', label: 'Suspended an organization', count: 2 });
    expect(view.rows[0]?.tone).toBe('danger');
  });

  it('support visits: status, length, and the filter is the selector’s, not a request', () => {
    const visit = (id: string, patch: Partial<SupportSessionRow>): SupportSessionRow => ({
      id, org: { id: 'o1', name: 'N' }, operator: { id: 'op1', name: 'A', email: 'a@x' }, reason: 'Ticket 1',
      startedAt: '2026-11-01T10:00:00.000Z', expiresAt: '2026-11-01T11:00:00.000Z', endedAt: null, active: false, ...patch,
    });
    const rows = [
      visit('open', { active: true }),
      visit('left', { endedAt: '2026-11-01T10:20:00.000Z' }),
      visit('ran-out', {}),
    ];
    const all = deriveSupport(rows, 'all');
    expect(all.rows.map((row) => [row.status, row.minutes])).toEqual([['active', null], ['left', 20], ['expired', 60]]);
    expect(all.counts).toEqual({ all: 3, active: 1, over: 2 });
    expect(all.averageMinutes).toBe(40);
    expect(deriveSupport(rows, 'active').rows.map((row) => row.id)).toEqual(['open']);
    expect(deriveSupport(rows, 'over').rows.map((row) => row.id)).toEqual(['left', 'ran-out']);
  });
});

describe('the state', () => {
  it('one window for Analytics and Earnings; its search string is the cache key', () => {
    const store = setupStore();
    expect(selectReportSearch(store.getState())).toBe('?granularity=month');
    store.dispatch(reportWindowChanged({ from: '2026-01-01', granularity: 'quarter' }));
    expect(selectReportSearch(store.getState())).toBe('?from=2026-01-01&granularity=quarter');
    store.dispatch(reportWindowChanged({ from: '' }));
    expect(selectReportWindow(store.getState()).from).toBeNull();
    store.dispatch(reportWindowReset());
    expect(selectReportSearch(store.getState())).toBe('?granularity=month');
  });

  it('estate filters: a tier that is not a tier is no filter', () => {
    const store = setupStore();
    store.dispatch(estateFilterChanged({ key: 'tier', value: 'platinum' }));
    store.dispatch(estateFilterChanged({ key: 'q', value: '  north ' }));
    expect(selectEstateSearch(store.getState())).toBe('?q=north');
  });

  it('the chart point under the pointer, per chart; signing out forgets everything', () => {
    const store = setupStore();
    store.dispatch(chartFocused({ chart: 'revenue', index: 2 }));
    expect(selectChartFocus(store.getState(), 'revenue')).toBe(2);
    expect(selectChartFocus(store.getState(), 'movement')).toBeNull();
    store.dispatch(chartLeft({ chart: 'movement' }));
    expect(selectChartFocus(store.getState(), 'revenue')).toBe(2);
    store.dispatch(reportWindowChanged({ granularity: 'quarter' }));
    store.dispatch(opsSignedOut());
    expect(selectChartFocus(store.getState(), 'revenue')).toBeNull();
    expect(selectReportWindow(store.getState()).granularity).toBe('month');
  });

  it('reads the cached report for the window, and keeps the last one on screen while the next loads', async () => {
    const store = setupStore();
    expect(selectAnalyticsView(store.getState())).toBeNull();
    await store.dispatch(
      opsEndpoints.util.upsertQueryData('getAnalytics', '?granularity=month', ANALYTICS),
    );
    expect(selectAnalyticsView(store.getState())?.orgs.joined.percent).toBe(74);

    // Another window, not loaded yet: the last answer stays (dimmed by the page).
    store.dispatch(reportWindowChanged({ granularity: 'quarter' }));
    expect(selectAnalyticsView(store.getState())?.orgs.joined.percent).toBe(74);
  });
});
