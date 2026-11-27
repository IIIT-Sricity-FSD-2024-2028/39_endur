// `/ops/earnings` through the real store and a stubbed operator API (R-716). The server
// answers sums and counts; every average, share and change on the page is
// `selectEarningsView`'s, and the window is `state.opsReports.window`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformEarnings } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import { selectReportWindow } from '../../../store/screens/opsReports.js';
import Earnings from './index.js';

const EARNINGS: PlatformEarnings = {
  window: { from: '2026-01-01T00:00:00.000Z', to: '2026-10-17T00:00:00.000Z', granularity: 'month' },
  currency: 'INR',
  totals: { revenueMinor: 99900 + 90000, payments: 2, orgsPaying: 2, lifetimeRevenueMinor: 500000 },
  byPeriod: [
    { period: '2026-09', revenueMinor: 100000, payments: 1 },
    { period: '2026-10', revenueMinor: 189900, payments: 2 },
  ],
  byTier: [
    { tier: 'bronze', payments: 0, revenueMinor: 0, orgsOnTier: 3 },
    { tier: 'silver', payments: 0, revenueMinor: 0, orgsOnTier: 1 },
    { tier: 'gold', payments: 2, revenueMinor: 189900, orgsOnTier: 2 },
    { tier: 'enterprise', payments: 0, revenueMinor: 0, orgsOnTier: 0 },
  ],
  tierOverTime: [{ period: '2026-10', bronze: 0, silver: 0, gold: 2 }],
  recent: [
    {
      id: 'p1', at: '2026-10-16T10:00:00.000Z', tier: 'gold', fromTier: null, kind: 'signup',
      amountMinor: 99900, currency: 'INR', payerName: 'Amara Rao', reference: 'endur_1',
      orgId: 'org-1', orgName: 'Northfield',
    },
    {
      id: 'p2', at: '2026-10-15T10:00:00.000Z', tier: 'gold', fromTier: 'bronze', kind: 'change',
      amountMinor: 90000, currency: 'INR', payerName: 'Ravi Iyer', reference: 'endur_2',
      orgId: 'org-2', orgName: 'Riverside',
    },
  ],
  recentChanges: [
    {
      id: 'p2', at: '2026-10-15T10:00:00.000Z', tier: 'gold', fromTier: 'bronze', kind: 'change',
      amountMinor: 90000, currency: 'INR', payerName: 'Ravi Iyer', reference: 'endur_2',
      orgId: 'org-2', orgName: 'Riverside',
    },
  ],
};

const EMPTY: PlatformEarnings = {
  ...EARNINGS,
  totals: { ...EARNINGS.totals, revenueMinor: 0, payments: 0, orgsPaying: 0 },
  byPeriod: [{ period: '2026-10', revenueMinor: 0, payments: 0 }],
  recent: [],
  recentChanges: [],
};

let calls: StubCall[] = [];
const server = (routes: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({ 'GET /platform/earnings*': { body: { data: EARNINGS } }, ...routes });
};
const earningsCalls = (): string[] =>
  calls.filter((call) => call.path.startsWith('/platform/earnings')).map((call) => call.path);

beforeEach(() => server());
afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<Earnings />, { path: '/ops/earnings' });

describe('the earnings page', () => {
  it('shows the window’s revenue, and the average and share the selector derived', async () => {
    // Reduced motion: the figure is printed at once instead of counting up through frames,
    // which a loaded test run cannot be relied on to deliver.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    render();
    const kpis = await screen.findByRole('region', { name: 'This window in numbers' });
    expect(kpis.textContent).toContain('₹1,899');
    // 189,900 of 500,000 paise: 38%. The server sends neither the share nor the average.
    expect(kpis.textContent).toContain('38% of ₹5,000 taken in total');
    expect(within(kpis).getByText('₹949.50')).toBeTruthy();
    expect(kpis.textContent).toContain('2 organizations paid in this window');
  });

  it('says why each payment happened, and who moved plan', async () => {
    render();
    const table = await screen.findByRole('table', { name: 'The most recent payments in this window' });
    expect(within(table).getByText('New organization')).toBeTruthy();
    expect(within(table).getByText('Bronze → Gold')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Who moved plan' }).textContent).toContain('Riverside');
  });

  it('the plan mix prints both shares, each adding up to 100', async () => {
    render();
    const mix = await screen.findByRole('table', { name: /Plan mix/ });
    const gold = within(mix).getByRole('row', { name: /Gold/ });
    expect(gold.textContent).toContain('33%');
    expect(gold.textContent).toContain('100%');
  });

  it('prints a dash, not ₹0, for the average of an empty window', async () => {
    server({ 'GET /platform/earnings*': { body: { data: EMPTY } } });
    render();
    expect(await screen.findByText('Nothing was captured in this window')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Nobody changed plan in this window.')).toBeTruthy();
  });

  it('a 403 names the capability instead of showing figures', async () => {
    server({ 'GET /platform/earnings*': errorReply(403, 'FORBIDDEN', 'Owner only.') });
    render();
    expect(await screen.findByText('platform.revenue.read')).toBeTruthy();
    expect(screen.queryByText('Recent payments')).toBeNull();
  });

  it('the window is in the store: a new date or granularity is a new request', async () => {
    const { store } = render();
    await screen.findByRole('region', { name: 'This window in numbers' });
    expect(earningsCalls()).toContain('/platform/earnings?granularity=month');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly' }));
    expect(selectReportWindow(store.getState())).toEqual({ from: '2026-01-01', to: null, granularity: 'quarter' });
    await waitFor(() =>
      expect(earningsCalls()).toContain('/platform/earnings?from=2026-01-01&granularity=quarter'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(selectReportWindow(store.getState())).toEqual({ from: null, to: null, granularity: 'month' });
  });

  it('a bar’s figures show when it is focused, from state.opsReports.focus', async () => {
    const { store } = render();
    const bar = await screen.findByRole('button', { name: /^Oct 2026: Revenue/ });
    fireEvent.focus(bar);
    expect(store.getState().opsReports?.focus).toEqual({ chart: 'revenue', index: 1 });
    const tip = screen.getByRole('status');
    expect(tip.textContent).toContain('Oct 2026');
    // Against September's ₹1,000: +90%.
    expect(tip.textContent).toContain('+90%');
    fireEvent.blur(bar);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
