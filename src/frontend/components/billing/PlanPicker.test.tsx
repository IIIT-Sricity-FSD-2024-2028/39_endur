// <PlanPicker> — 24 §6b, DEC-048, DEC-035.
//
// `signup` mode is exercised end to end by pages/public/Start.test.tsx, which is where it is
// actually used. This file covers what that page cannot reach: the ENTERPRISE CARD, which
// `/start` never renders because SIGNUP_PLAN_OPTIONS filters it out, and the `join`/`override`
// modes, which belong to T-058 and T-066. Those two are built here rather than later because
// 24 argues one component for all of them, and an unbuilt branch is not one component — it is
// a second one waiting to be written differently.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PLAN_OPTIONS, SIGNUP_PLAN_OPTIONS } from '@endur/shared';
import { PlanPicker } from './PlanPicker.js';

describe('the picker renders the tiers as data — 16 §2', () => {
  it('says what each tier sells, without ever saying what it costs', () => {
    render(<PlanPicker plans={PLAN_OPTIONS} current={null} mode="join" onSelect={vi.fn()} />);
    expect(screen.getByText('Bronze — Measure')).toBeTruthy();
    expect(screen.getByText('Run the full loop')).toBeTruthy();
    // DEC-035, asserted at the one component where a price would go.
    expect(document.body.textContent).not.toMatch(/[$£€]|\/mo|per month/i);
  });

  /**
   * ENTERPRISE IS SHOWN AND CANNOT BE PRESSED (16 §4, DEC-048). Hiding it would make an
   * operator setting it later look like a bug rather than a sale; enabling it would let an
   * organisation assign itself a tier that is priced individually.
   */
  it('shows Enterprise and refuses to let anyone select it', () => {
    const onSelect = vi.fn();
    render(<PlanPicker plans={PLAN_OPTIONS} current="bronze" mode="join" onSelect={onSelect} />);
    expect(screen.getByText('Enterprise — Decide')).toBeTruthy();
    expect(screen.getByText(/talk to sales/)).toBeTruthy();

    // Four cards, two of them unpressable: bronze because it is the current plan, enterprise
    // because nobody may assign themselves it.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((button) => button.hasAttribute('disabled'))).toHaveLength(2);
    expect(onSelect).not.toHaveBeenCalled();
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
