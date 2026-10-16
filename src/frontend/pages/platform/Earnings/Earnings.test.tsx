import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformEarnings } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import type { EarningsWindow } from '../../../lib/earnings.js';
import Earnings from './index.js';

const EARNINGS: PlatformEarnings = {
  window: { from: '2026-01-01T00:00:00.000Z', to: '2026-10-17T00:00:00.000Z', granularity: 'month' },
  currency: 'INR',
  totals: {
    revenueMinor: 99900 + 90000,
    payments: 2,
    orgsPaying: 2,
    averageMinor: 94950,
    lifetimeRevenueMinor: 500000,
  },
  byPeriod: [{ period: '2026-10', revenueMinor: 189900, payments: 2 }],
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

let earnings: { data: PlatformEarnings | null; forbidden: boolean } = { data: EARNINGS, forbidden: false };
const asked: EarningsWindow[] = [];

vi.mock('../../../lib/earnings.js', () => ({
  useEarnings: (window: EarningsWindow) => {
    asked.push(window);
    return { ...earnings, loading: false, error: null, reload: vi.fn() };
  },
}));

const render = (path = '/ops/earnings') => renderWithProviders(<Earnings />, { path });

beforeEach(() => {
  earnings = { data: EARNINGS, forbidden: false };
  asked.length = 0;
});

describe('the earnings page', () => {
  it('shows the window’s revenue, payments and average', async () => {
    render();
    // The revenue counts up, then lands on the real figure.
    const card = (): string => screen.getByText('Revenue in this window').parentElement?.textContent ?? '';
    await waitFor(() => expect(card()).toContain('₹1,899'), { timeout: 2000 });
    expect(screen.getByText(/₹5,000 taken in total/)).toBeTruthy();
    expect(screen.getByText('₹949.50')).toBeTruthy();
    expect(screen.getByText(/2 organisations paid in this window/)).toBeTruthy();
  });

  it('says why each payment happened', () => {
    render();
    const table = screen.getByRole('table', { name: 'The most recent payments in this window' });
    expect(within(table).getByText('New organisation')).toBeTruthy();
    expect(within(table).getByText('Bronze → Gold')).toBeTruthy();
  });

  // A mean of no payments is not zero.
  it('prints a dash, not ₹0, for the average of an empty window', () => {
    earnings = {
      data: {
        ...EARNINGS,
        totals: { ...EARNINGS.totals, revenueMinor: 0, payments: 0, orgsPaying: 0, averageMinor: null },
        recent: [],
        recentChanges: [],
      },
      forbidden: false,
    };
    render();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Nothing was captured in this window')).toBeTruthy();
    expect(screen.getByText('Nobody changed plan in this window.')).toBeTruthy();
  });

  it('names the capability rather than showing figures to somebody without it', () => {
    earnings = { data: null, forbidden: true };
    render();
    expect(screen.getByText('platform.revenue.read')).toBeTruthy();
    expect(screen.queryByText('Recent payments')).toBeNull();
  });

  it('reads its window from the link and writes a new one back', () => {
    render('/ops/earnings?from=2026-01-01&granularity=quarter');
    expect(asked[asked.length - 1]).toMatchObject({ from: '2026-01-01', granularity: 'quarter' });

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-06-30' } });
    expect(asked[asked.length - 1]).toMatchObject({
      from: '2026-01-01',
      to: '2026-06-30',
      granularity: 'quarter',
    });
  });
});
