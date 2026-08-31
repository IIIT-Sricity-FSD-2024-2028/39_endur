// <PlanPicker> — 24 §6b, DEC-048, DEC-080.
//
// `signup` mode is exercised end to end by pages/public/Start.test.tsx, which is where it is
// actually used. This file covers what that page cannot reach: the ENTERPRISE CARD, which
// `/start` never renders because SIGNUP_PLAN_OPTIONS filters it out, and the `join`/`override`
// modes, which belong to T-058 and T-066. Those two are built here rather than later because
// 24 argues one component for all of them, and an unbuilt branch is not one component — it is
// a second one waiting to be written differently.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PLAN_OPTIONS, SIGNUP_PLAN_OPTIONS } from '@endur/shared';
import { PlanPicker } from './PlanPicker.js';

describe('the picker renders the tiers as data — 16 §2', () => {
  it('says what each tier sells and what it costs', () => {
    render(<PlanPicker plans={PLAN_OPTIONS} current={null} mode="join" onSelect={vi.fn()} />);
    expect(screen.getByText('Bronze — Measure')).toBeTruthy();
    expect(screen.getByText('Run the full loop')).toBeTruthy();
    // DEC-080, asserted at the one component where a price goes.
    expect(document.body.textContent).toContain('₹99');
    expect(document.body.textContent).toContain('₹999');
    // DEC-096 — the period is a MONTH, and this is the one place a reader learns it. The
    // assertion used to be that "per month" appeared NOWHERE, which was true of a yearly
    // product and is the sort of line that survives a decision if nobody looks for it.
    expect(document.body.textContent).toContain('/ month');
    expect(document.body.textContent).not.toMatch(/\/ year|per year/i);
    // Still no second currency — there is only one.
    expect(document.body.textContent).not.toMatch(/[$£€]/);
  });

  /**
   * ENTERPRISE PRINTS ITS PRICE LIKE EVERY OTHER CARD — `DEC-099`.
   *
   * The assertion this replaces demanded the string "Priced with you" and existed to stop a
   * well-meaning render of `formatMoney(0)`. THE PROPERTY IT WAS PROTECTING IS KEPT and is
   * the second line here — nothing renders ₹0 — but it is now true because the number is
   * real rather than because every caller remembered to branch on `selectable` first.
   */
  it('prices Enterprise like every other card', () => {
    render(<PlanPicker plans={PLAN_OPTIONS} current={null} mode="join" onSelect={vi.fn()} />);
    expect(document.body.textContent).toContain('₹4,999');
    expect(document.body.textContent).not.toContain('₹0');
    // The apology copy went with the sentinel it was written for.
    expect(screen.queryByText('Priced with you')).toBeNull();
  });

  /**
   * ENTERPRISE IS SHOWN AND A CUSTOMER CANNOT PRESS IT (16 §4, DEC-048, DEC-099). Hiding it
   * would make an operator setting it later look like a bug rather than a sale; enabling it
   * here would let an organisation assign itself the one tier that is arranged rather than
   * bought. What changed at `DEC-099` is that this is now true of `join` and `signup` ONLY —
   * see the operator's case below.
   */
  it('shows Enterprise and refuses to let a CUSTOMER select it', () => {
    const onSelect = vi.fn();
    render(<PlanPicker plans={PLAN_OPTIONS} current="bronze" mode="join" onSelect={onSelect} />);
    expect(screen.getByText('Enterprise — Decide')).toBeTruthy();
    expect(screen.getByText(/we will get in touch/)).toBeTruthy();

    // FOUR CARDS, AND THE ENTERPRISE ONE READS `Request` — DEC-100. Its verb is different from
    // every other card's precisely because it does something different: `onSelect('enterprise')`
    // opens a request dialog at the caller, never the checkout. Only Bronze is unpressable,
    // because it is the plan they are on.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((button) => button.hasAttribute('disabled'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Request' })).toBeTruthy();
    // Silver and Gold are the ordinary case and still say Join.
    expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * ASKED ALREADY — DEC-100. A second ask is a 409 (the partial unique index makes that true
   * under two simultaneous clicks), and a button whose only outcome is an error is not an
   * action, so the card says what it is waiting for instead.
   */
  it('reads Requested once one is open', () => {
    render(
      <PlanPicker
        plans={PLAN_OPTIONS}
        current="bronze"
        mode="join"
        requestedTier="enterprise"
        onSelect={vi.fn()}
      />,
    );
    const action = screen.getByRole('button', { name: 'Requested' });
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Request' })).toBeNull();
  });

  it('never offers Enterprise at sign-up at all', () => {
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current={null} mode="signup" onSelect={vi.fn()} />,
    );
    expect(document.body.textContent).not.toContain('Enterprise');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('one component, three verbs — 24 §6b', () => {
  it('reads Join for a customer and Set plan for an operator', () => {
    const { unmount } = render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="bronze" mode="join" onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2);
    unmount();

    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="bronze" mode="override" onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: 'Set plan' })).toHaveLength(2);
  });

  it('marks the tier they are on and does not offer to sell it to them again', () => {
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="silver" mode="join" onSelect={vi.fn()} />,
    );
    const current = screen.getByRole('button', { name: 'Current plan' });
    expect(current.hasAttribute('disabled')).toBe(true);
  });

  it('hands back the tier that was pressed', () => {
    const onSelect = vi.fn();
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="bronze" mode="join" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Join' })[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('gold');
  });

  /**
   * THE LADDER IS ONE-WAY — DEC-096. A card below the current tier carries a SENTENCE where
   * the others carry a button, and the sentence matters: a card that simply lost its action
   * reads as a rendering fault, which is how somebody "fixes" it back.
   *
   * NOT DISABLED, ABSENT. A permanently-dead button teaches a reader to distrust every
   * greyed control they meet — the same argument DEC-104 makes about `/ops`.
   */
  it('offers no action on a tier below the current one, and says why', () => {
    const onSelect = vi.fn();
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="gold" mode="join" onSelect={onSelect} />,
    );
    // Gold is current; Bronze and Silver are below it and lose their buttons entirely.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeTruthy();
    expect(screen.getAllByText(/Below your plan/)).toHaveLength(2);
    expect(document.body.textContent).toMatch(/no refunds/);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * AN OPERATOR MAY MOVE A PLAN IN EITHER DIRECTION. `platform.plan.override` is a support
   * action (`19` §4) and DEC-096 is about what a CUSTOMER may do to their own plan — reusing
   * one flag for both would have made the operator's console quietly one-way too.
   */
  it('still offers every tier to an operator overriding a plan', () => {
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="gold" mode="override" onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: 'Set plan' })).toHaveLength(2);
    expect(screen.queryByText(/Below your plan/)).toBeNull();
  });

  /**
   * AN OPERATOR CAN ASSIGN ENTERPRISE, AND UNTIL `DEC-099` COULD NOT. This is the whole of the
   * owner's report *"enterprise plan is not working"*, and it was one expression:
   * `unavailable = disabled || !plan.selectable`, applied in ALL THREE modes.
   *
   * `override` IS THE OPERATOR MOVING SOMEBODY ELSE'S PLAN — the path `DEC-048` routes
   * Enterprise through on purpose, with the capability in `19` §4 and the screen in `70`. So
   * THE ONE TIER THE PRODUCT CALLS OPERATOR-ASSIGNED WAS UNASSIGNABLE IN THE ONLY UI THAT CAN
   * ASSIGN IT, disabled by a flag that means "a customer may not choose this".
   *
   * The assertion is on the ENTERPRISE card specifically rather than on a count of enabled
   * buttons, because a count would have passed the whole time this was broken.
   */
  it('lets an operator set Enterprise, which a customer may not choose', () => {
    const onSelect = vi.fn();
    render(<PlanPicker plans={PLAN_OPTIONS} current="gold" mode="override" onSelect={onSelect} />);

    const card = screen.getByText('Enterprise — Decide').closest('.plan-card') as HTMLElement;
    const action = within(card).getByRole('button', { name: 'Set plan' });
    expect(action.hasAttribute('disabled')).toBe(false);

    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledWith('enterprise');
  });

  /** One write at a time: a second click while the first is in flight is a second tier. */
  it('locks every card while one is being joined', () => {
    render(
      <PlanPicker
        plans={SIGNUP_PLAN_OPTIONS}
        current="bronze"
        mode="join"
        busyTier="silver"
        onSelect={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
  });
});
