// /app/plan — 49 § Acceptance.
//
// The assertions that carry this page are the two about DIRECTION. An upgrade must apply
// with no dialog and a downgrade must confirm, because a downgrade takes surfaces away and
// a customer who does not know their data survives one will not downgrade — they will
// leave (49 § Interactions). A test that only checked "the join request was sent" would
// pass while the dialog was missing, which is the failure worth catching here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BillingSummary, Capability } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Plan from './index.js';

const SILVER: BillingSummary = {
  tier: 'silver',
  status: 'active',
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2027-08-01T00:00:00.000Z',
  seats: 34,
  seatBreakdown: { activeUsers: 30, nonPersonSubjects: 4 },
};

const join = vi.fn();
let summary: BillingSummary = SILVER;

vi.mock('../../../lib/billing.js', async () => {
  const react = await import('react');
  return {
    useBilling: () => {
      const [data, set] = react.useState<BillingSummary | null>(summary);
      return { data, loading: false, error: null, set };
    },
    // `null` — the page falls back to the shared catalogue, which is the real behaviour
    // while `GET /billing/plans` is in flight.
    usePlans: () => ({ data: null, loading: false, error: null }),
    useJoinTier: () => join,
  };
});

const ALL: Capability[] = ['billing.read', 'billing.update'];

const render = (capabilities: Capability[] = ALL) =>
  renderWithProviders(<Plan />, { capabilities, path: '/app/plan' });

/**
 * One tier's card in the picker, by the plan name printed on it.
 *
 * Every card's action reads exactly "Join" — the whole picker is four identical verbs, and
 * `PlanPicker.test.tsx` pins that copy — so a query by button name cannot say WHICH tier.
 * The card is the unit that identifies it.
 */
const card = (name: string): HTMLElement => {
  const found = screen.getAllByText(name).find((node) => node.closest('.plan-card'));
  return found?.closest('.plan-card') as HTMLElement;
};

/**
 * Press Pay in the checkout, then wait out its own sequence — a ~700ms simulated capture
 * and a ~1500ms success overlay (PaymentDialog.tsx). Real timers: `waitFor` and fake timers
 * fight each other, and the whole thing is ~2.2s.
 */
const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Pay ₹/ }));
const PAID = { timeout: 4000 };

beforeEach(() => {
  summary = SILVER;
  join.mockReset();
  join.mockImplementation((tier: BillingSummary['tier']) =>
    Promise.resolve({ ...SILVER, tier }));
});

describe('Plan', () => {
  it('names the current plan and marks it in the picker', () => {
    render();
    // Twice on purpose: the current-plan card states it, the picker marks it.
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

  it('prices every tier it offers — DEC-080', () => {
    const { container } = render();
    const text = container.textContent ?? '';
    expect(text).toContain('₹99');
    expect(text).toContain('₹999');
    // Still no monthly plan and still no other currency — neither exists.
    expect(text).not.toMatch(/[$£€]|\bper month\b|\/mo\b/);
  });

  /**
   * AN UPGRADE STILL NEEDS NO CONFIRMATION — the checkout is not one. `49`'s asymmetry is
   * about CONSEQUENCE: a downgrade takes surfaces away and has to say so, an upgrade does
   * not. The payment dialog asks a different question, and it asks it of both directions.
   */
  it('takes an UPGRADE straight to the checkout, with no confirmation', async () => {
    render();
    fireEvent.click(within(card('Gold — Improve')).getByRole('button'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Gold/);
    expect(dialog.textContent).toMatch(/₹999/);
    // Nothing is written until Pay is pressed.
    expect(join).not.toHaveBeenCalled();

    pay();
    await waitFor(() => expect(join).toHaveBeenCalledWith('gold', expect.stringMatching(/^endur_/)), PAID);
  });

  it('CONFIRMS a downgrade, says the data is kept, and only then asks for money', async () => {
    render();
    // Bronze is below Silver.
    fireEvent.click(within(card('Bronze — Measure')).getByRole('button'));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/Bronze/);
    expect(dialog.textContent).toMatch(/Nothing is deleted/);
    // Not sent until the dialog is answered.
    expect(join).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Move to Bronze/ }));
    // THE CONSEQUENCE IS ANSWERED BEFORE THE PRICE IS SHOWN. Asking for money first and
    // explaining what stops working second is the order that produces a refund request in a
    // product that has no refunds.
    const checkout = await screen.findByRole('dialog');
    expect(checkout.textContent).toMatch(/₹99/);
    expect(join).not.toHaveBeenCalled();

    pay();
    await waitFor(() => expect(join).toHaveBeenCalledWith('bronze', expect.stringMatching(/^endur_/)), PAID);
  });

  it('cancels the checkout without changing anything', async () => {
    render();
    fireEvent.click(within(card('Gold — Improve')).getByRole('button'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(join).not.toHaveBeenCalled();
  });

  it('offers no action on Enterprise — it is arranged with us (16 §4)', () => {
    render();
    expect(screen.getByText(/talk to sales/)).toBeTruthy();
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
