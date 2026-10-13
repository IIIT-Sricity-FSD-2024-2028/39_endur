import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PLAN_OPTIONS, SIGNUP_PLAN_OPTIONS } from '@endur/shared';
import { PlanPicker } from './PlanPicker.js';

describe('the picker renders the tiers as data — 16 §2', () => {
  it('says what each tier sells and what it costs', () => {
    render(<PlanPicker plans={PLAN_OPTIONS} current={null} mode="join" onSelect={vi.fn()} />);
    expect(screen.getByText('Bronze — Measure')).toBeTruthy();
    expect(screen.getByText('Run the full loop')).toBeTruthy();
    expect(document.body.textContent).toContain('₹99');
    expect(document.body.textContent).toContain('₹999');
    expect(document.body.textContent).toContain('/ month');
    expect(document.body.textContent).not.toMatch(/\/ year|per year/i);
    expect(document.body.textContent).not.toMatch(/[$£€]/);
  });

  it('prices Enterprise like every other card', () => {
    render(<PlanPicker plans={PLAN_OPTIONS} current={null} mode="join" onSelect={vi.fn()} />);
    expect(document.body.textContent).toContain('₹4,999');
    expect(document.body.textContent).not.toContain('₹0');
    expect(screen.queryByText('Priced with you')).toBeNull();
  });

  it('shows Enterprise and refuses to let a CUSTOMER select it', () => {
    const onSelect = vi.fn();
    render(<PlanPicker plans={PLAN_OPTIONS} current="bronze" mode="join" onSelect={onSelect} />);
    expect(screen.getByText('Enterprise — Decide')).toBeTruthy();
    expect(screen.getByText(/we will get in touch/)).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((button) => button.hasAttribute('disabled'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Request' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

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

  it('offers no action on a tier below the current one, and says why', () => {
    const onSelect = vi.fn();
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="gold" mode="join" onSelect={onSelect} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeTruthy();
    expect(screen.getAllByText(/Below your plan/)).toHaveLength(2);
    expect(document.body.textContent).toMatch(/no refunds/);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still offers every tier to an operator overriding a plan', () => {
    render(
      <PlanPicker plans={SIGNUP_PLAN_OPTIONS} current="gold" mode="override" onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: 'Set plan' })).toHaveLength(2);
    expect(screen.queryByText(/Below your plan/)).toBeNull();
  });

  it('lets an operator set Enterprise, which a customer may not choose', () => {
    const onSelect = vi.fn();
    render(<PlanPicker plans={PLAN_OPTIONS} current="gold" mode="override" onSelect={onSelect} />);

    const card = screen.getByText('Enterprise — Decide').closest('.plan-card') as HTMLElement;
    const action = within(card).getByRole('button', { name: 'Set plan' });
    expect(action.hasAttribute('disabled')).toBe(false);

    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledWith('enterprise');
  });

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
