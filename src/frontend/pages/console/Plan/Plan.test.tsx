import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BillingSummary, Capability } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Plan from './index.js';

const SILVER: BillingSummary = {
  tier: 'silver',
  status: 'active',
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z',
  pendingTier: null,
  lapsedFrom: null,
  lapsedFromTrial: null,
  seats: 34,
  seatBreakdown: { activeUsers: 30, nonPersonSubjects: 4 },
};

const join = vi.fn();
const scheduleDowngrade = vi.fn();
const cancelDowngrade = vi.fn();
const requestEnterprise = vi.fn();
let enterpriseRequestedAt: string | null = null;
let summary: BillingSummary = SILVER;

vi.mock('../../../lib/billing.js', async () => {
  const react = await import('react');
  return {
    useBilling: () => {
      const [data, set] = react.useState<BillingSummary | null>(summary);
      return { data, loading: false, error: null, set };
    },
    usePlans: () => ({ data: null, loading: false, error: null }),
    useJoinTier: () => join,
    useScheduleDowngrade: () => scheduleDowngrade,
    useCancelDowngrade: () => cancelDowngrade,
    useEnterpriseRequest: () => ({ requestedAt: enterpriseRequestedAt, request: requestEnterprise }),
  };
});

const ALL: Capability[] = ['billing.read', 'billing.update'];

const render = (capabilities: Capability[] = ALL) =>
  renderWithProviders(<Plan />, { capabilities, path: '/app/plan' });

const card = (name: string): HTMLElement => {
  const found = screen.getAllByText(name).find((node) => node.closest('.plan-card'));
  return found?.closest('.plan-card') as HTMLElement;
};

const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Pay ₹/ }));
const PAID = { timeout: 4000 };

beforeEach(() => {
  summary = SILVER;
  join.mockReset();
  join.mockImplementation((tier: BillingSummary['tier']) =>
    Promise.resolve({ ...SILVER, tier }));
  scheduleDowngrade.mockReset();
  scheduleDowngrade.mockResolvedValue({ ...SILVER, pendingTier: 'bronze' });
  cancelDowngrade.mockReset();
  cancelDowngrade.mockResolvedValue(SILVER);
  requestEnterprise.mockReset();
  requestEnterprise.mockResolvedValue(undefined);
  enterpriseRequestedAt = null;
});

describe('Plan', () => {
  it('names the current plan and marks it in the picker', () => {
    render();
    expect(screen.getAllByText('Silver — Understand').length).toBeGreaterThan(0);
    expect(within(card('Silver — Understand')).getByRole('button').textContent)
      .toContain('Current plan');
  });

  it('shows what the seat count is made of — 16 §5, never a bare total', () => {
    render();
    expect(screen.getByText(/30 people with accounts/)).toBeTruthy();
    expect(screen.getByText(/4 subjects that are not a person/)).toBeTruthy();
  });

  it('states that respondents are never counted', () => {
    render();
    expect(screen.getByText(/never counted/)).toBeTruthy();
  });

  it('prices every tier it offers, per month — DEC-080, DEC-096', () => {
    const { container } = render();
    const text = container.textContent ?? '';
    expect(text).toContain('₹99');
    expect(text).toContain('₹999');
    expect(text).toContain('/ month');
    expect(text).not.toMatch(/\/ year|one year|per year/i);
    expect(text).not.toMatch(/[$£€]/);
  });

  it('takes an UPGRADE straight to the checkout, priced as the difference', async () => {
    render();
    fireEvent.click(within(card('Gold — Improve')).getByRole('button'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Gold/);
    expect(screen.getByRole('button', { name: 'Pay ₹500' })).toBeTruthy();
    expect(dialog.textContent).toMatch(/already on Silver/);
    expect(join).not.toHaveBeenCalled();

    pay();
    await waitFor(() => expect(join).toHaveBeenCalledWith('gold', expect.stringMatching(/^endur_/)), PAID);
  });

  it('offers no way DOWN, and explains the gap rather than leaving one', () => {
    render();
    const bronze = within(card('Bronze — Measure'));
    expect(bronze.queryByRole('button')).toBeNull();
    expect(bronze.getByText(/Below your plan/)).toBeTruthy();
    expect(bronze.getByText(/no refunds/)).toBeTruthy();

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(join).not.toHaveBeenCalled();
  });

  it('states that moving up charges the difference', () => {
    render();
    expect(screen.getByText(/charges the difference/)).toBeTruthy();
  });

  it('cancels the checkout without changing anything', async () => {
    render();
    fireEvent.click(within(card('Gold — Improve')).getByRole('button'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(join).not.toHaveBeenCalled();
  });

  it('asks about Enterprise rather than buying it — no checkout, no charge', async () => {
    render();
    fireEvent.click(within(card('Enterprise — Decide')).getByRole('button', { name: 'Request' }));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Nothing is charged now/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();

    fireEvent.click(dialog.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(requestEnterprise).toHaveBeenCalled());
    expect(join).not.toHaveBeenCalled();
  });

  it('reads Requested once one is open, and offers no second ask', () => {
    enterpriseRequestedAt = '2026-08-30T00:00:00.000Z';
    render();
    const action = within(card('Enterprise — Decide')).getByRole('button');
    expect(action.textContent).toContain('Requested');
    expect(action.hasAttribute('disabled')).toBe(true);
  });

  it('reads without billing.update, and cannot change the plan', () => {
    render(['billing.read']);
    expect(screen.getAllByText('Silver — Understand').length).toBeGreaterThan(0);
    for (const action of screen.getAllByRole('button')) {
      expect((action as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(/needs the billing permission/)).toBeTruthy();
  });
});

describe('scheduling a move down — DEC-098', () => {
  const scheduleBlock = (): HTMLElement =>
    document.querySelector('.plan-schedule') as HTMLElement;

  it('offers every sellable tier below the current one, with the date on it', () => {
    render();
    const block = within(scheduleBlock());
    expect(block.getByRole('button', { name: 'Move to Bronze' })).toBeTruthy();
    expect(block.queryByRole('button', { name: /Move to Gold/ })).toBeNull();
    expect(block.queryByRole('button', { name: /Enterprise/ })).toBeNull();
    expect(scheduleBlock().textContent).toMatch(/Sep/);
  });

  it('schedules without opening the checkout — nothing is charged today', async () => {
    scheduleDowngrade.mockResolvedValue({ ...SILVER, pendingTier: 'bronze' });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Bronze' }));

    await waitFor(() => expect(scheduleDowngrade).toHaveBeenCalledWith('bronze'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/scheduled/i));
  });

  it('states what is scheduled and offers to cancel it', async () => {
    summary = { ...SILVER, pendingTier: 'bronze' };
    cancelDowngrade.mockResolvedValue(SILVER);
    render();

    const block = scheduleBlock();
    expect(block.textContent).toMatch(/Moving to/);
    expect(block.textContent).toMatch(/Bronze/);
    expect(block.textContent).toMatch(/Sep/);
    expect(block.textContent).toMatch(/nothing you have collected is deleted/i);

    fireEvent.click(within(block).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelDowngrade).toHaveBeenCalled());
  });

  it('is absent for a reader who cannot change the plan', () => {
    render(['billing.read']);
    expect(scheduleBlock()).toBeNull();
  });

  it('disappears on the lowest tier', () => {
    summary = { ...SILVER, tier: 'bronze' };
    render();
    expect(scheduleBlock()).toBeNull();
  });
});

