// /app/plan — 49 § Acceptance.
//
// The assertions that carry this page are the two about DIRECTION, and DEC-096 changed what
// the second one is. An upgrade still applies with no confirmation. A DOWNGRADE IS NO LONGER
// OFFERED: the card below the current tier has no action, and `POST /billing/tier` refuses
// the move with a 409 if anything calls it anyway — which is where the rule lives (INV-003).
//
// A test that only checked "the join request was sent" would pass while the ladder was still
// two-way, which is the failure worth catching here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BillingSummary, Capability } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Plan from './index.js';

const SILVER: BillingSummary = {
  tier: 'silver',
  status: 'active',
  periodStart: '2026-08-01T00:00:00.000Z',
  // ONE MONTH — DEC-096. A year here would be a fixture quietly describing the old product.
  periodEnd: '2026-09-01T00:00:00.000Z',
  // Nothing scheduled, which is the ordinary state — DEC-098. The tests that care set it.
  pendingTier: null,
  // Nothing ran out either — DEC-113. Same rule: the tests about it set it.
  lapsedFrom: null,
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
    // `null` — the page falls back to the shared catalogue, which is the real behaviour
    // while `GET /billing/plans` is in flight.
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

  it('prices every tier it offers, per month — DEC-080, DEC-096', () => {
    const { container } = render();
    const text = container.textContent ?? '';
    expect(text).toContain('₹99');
    expect(text).toContain('₹999');
    expect(text).toContain('/ month');
    // The period moved and the page must move with it. This assertion used to say the
    // OPPOSITE — that "per month" appeared nowhere — which is the shape a stale test takes
    // when a decision lands and nobody greps for the sentence it invalidates.
    expect(text).not.toMatch(/\/ year|one year|per year/i);
    // Still no other currency — there is only one.
    expect(text).not.toMatch(/[$£€]/);
  });

  /**
   * AN UPGRADE NEEDS NO CONFIRMATION — the checkout is not one. Confirming before giving
   * somebody MORE is friction with no risk behind it.
   *
   * THE AMOUNT IS THE DIFFERENCE — DEC-097. Silver → Gold is ₹999 − ₹499 = ₹500, and the
   * assertion is on the PAY BUTTON rather than on the dialog text, because the dialog also
   * prints the full ₹999 as part of the subtraction it shows its working for. A test that
   * matched "₹999 appears somewhere" would pass on the old full-price behaviour.
   */
  it('takes an UPGRADE straight to the checkout, priced as the difference', async () => {
    render();
    fireEvent.click(within(card('Gold — Improve')).getByRole('button'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Gold/);
    // ₹999 − ₹499 already on Silver.
    expect(screen.getByRole('button', { name: 'Pay ₹500' })).toBeTruthy();
    expect(dialog.textContent).toMatch(/already on Silver/);
    // Nothing is written until Pay is pressed.
    expect(join).not.toHaveBeenCalled();

    pay();
    await waitFor(() => expect(join).toHaveBeenCalledWith('gold', expect.stringMatching(/^endur_/)), PAID);
  });

  /**
   * ~~CONFIRMS a downgrade~~ — THERE IS NOTHING TO CONFIRM. DEC-096.
   *
   * The old test drove a confirm dialog and then a checkout for Silver → Bronze. That flow
   * charged a customer a SECOND time, for LESS than they already held, in a product with no
   * refunds and an append-only ledger. It passed for a fortnight because it asserted the
   * dialog's wording rather than asking whether the transaction should exist.
   *
   * What replaces it asserts the card is inert AND says why the gap is deliberate — the note
   * is the difference between "one-way ladder" and "the button failed to render".
   */
  it('offers no way DOWN, and explains the gap rather than leaving one', () => {
    render();
    // Bronze is below Silver.
    const bronze = within(card('Bronze — Measure'));
    expect(bronze.queryByRole('button')).toBeNull();
    expect(bronze.getByText(/Below your plan/)).toBeTruthy();
    expect(bronze.getByText(/no refunds/)).toBeTruthy();

    // No dialog of either kind opened, and nothing was sent.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(join).not.toHaveBeenCalled();
  });

  /**
   * THE PAGE SAYS WHAT A MOVE COSTS BEFORE ANYBODY OPENS A CHECKOUT. "Charges the difference"
   * is the sentence that stops the amount in the dialog reading as a pricing bug.
   */
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

  /**
   * ENTERPRISE HAS AN ACTION NOW, AND IT IS NOT A CHECKOUT — `DEC-099` + `DEC-100`.
   *
   * This replaces an assertion that the card said "talk to sales" and offered nothing. Both
   * halves changed: `DEC-099` gave the tier a real price, and `DEC-100` gave the customer a
   * way to ask for it. What must NOT happen is the ask reaching the checkout — `joinTier`
   * still answers 409 on Enterprise, so a payment dialog here would take ₹4,999 for a plan
   * the server would then refuse to assign.
   */
  it('asks about Enterprise rather than buying it — no checkout, no charge', async () => {
    render();
    fireEvent.click(within(card('Enterprise — Decide')).getByRole('button', { name: 'Request' }));

    // The REQUEST dialog, not <PaymentDialog>: it says nothing is charged, and its verb sends.
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Nothing is charged now/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();

    fireEvent.click(dialog.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(requestEnterprise).toHaveBeenCalled());
    // And the plan was never joined.
    expect(join).not.toHaveBeenCalled();
  });

  /** Asked already: the card says so and stops offering. A second ask is a 409 (DEC-100). */
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

/**
 * THE SCHEDULED MOVE DOWN — T-098, DEC-098, `49` § Interactions.
 *
 * It lives UNDER THE CURRENT PLAN and not on a card, which is a decision worth pinning: the
 * picker's rule is that a tier below the current one carries no action, and a rule with one
 * exception is a rule somebody adds a second exception to.
 */
describe('scheduling a move down — DEC-098', () => {
  const scheduleBlock = (): HTMLElement =>
    document.querySelector('.plan-schedule') as HTMLElement;

  it('offers every sellable tier below the current one, with the date on it', () => {
    render();
    const block = within(scheduleBlock());
    // Silver is current, so Bronze is the only thing below it. Gold and Enterprise are not
    // offered — one is above, and the other is not a tier a customer may assign themselves
    // in either direction (DEC-099).
    expect(block.getByRole('button', { name: 'Move to Bronze' })).toBeTruthy();
    expect(block.queryByRole('button', { name: /Move to Gold/ })).toBeNull();
    expect(block.queryByRole('button', { name: /Enterprise/ })).toBeNull();
    // THE DATE IS ON THE PAGE. A promise about "the end of the period" without one is the
    // thing customers ring about.
    expect(scheduleBlock().textContent).toMatch(/Sep/);
  });

  it('schedules without opening the checkout — nothing is charged today', async () => {
    scheduleDowngrade.mockResolvedValue({ ...SILVER, pendingTier: 'bronze' });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Bronze' }));

    await waitFor(() => expect(scheduleDowngrade).toHaveBeenCalledWith('bronze'));
    // NO <PaymentDialog>. A schedule captures nothing at schedule time and nothing at apply
    // time, so a checkout in front of it would be asking for money for nothing.
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
    // The reassurance `16` §7 has always made, said where the decision is taken.
    expect(block.textContent).toMatch(/nothing you have collected is deleted/i);

    fireEvent.click(within(block).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelDowngrade).toHaveBeenCalled());
  });

  /**
   * WITHOUT `billing.update` THE BLOCK IS ABSENT, unlike the picker beside it. The picker is
   * still rendered inert because "what are we on, and what would the next tier add" is
   * `billing.read`'s question and a colleague needs to be able to say what to ask for. A
   * schedule is only ever an action, so there is nothing left of it to read.
   */
  it('is absent for a reader who cannot change the plan', () => {
    render(['billing.read']);
    expect(scheduleBlock()).toBeNull();
  });

  /** Bronze is the floor. Nothing below it, so the block does not offer a way down. */
  it('disappears on the lowest tier', () => {
    summary = { ...SILVER, tier: 'bronze' };
    render();
    expect(scheduleBlock()).toBeNull();
  });
});

