// <SlotGrid> — T-095. The three things this component decides, and nothing else.
//
// It is the ONE grid on both sides of the product (24 § SlotGrid), so the assertions worth
// having are the ones a picker and an editor would otherwise disagree about: what "full"
// looks like, whether a full slot can be pressed at all, and whether the editor's affordance
// leaks into the read-only render the respondent gets.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotGrid, remainingLabel } from './SlotGrid.js';

const slot = (over: Partial<{ id: string; remaining: number; capacity: number }> = {}) => ({
  id: over.id ?? 'a',
  startsAt: '2026-09-01T10:00:00.000Z',
  endsAt: '2026-09-01T10:45:00.000Z',
  capacity: over.capacity ?? 3,
  remaining: over.remaining ?? 3,
});

describe('remainingLabel', () => {
  it('calls out the last place on its own', () => {
    // The state the capacity work exists to produce, and the one a booker has to act on.
    expect(remainingLabel(1)).toBe('1 left');
    expect(remainingLabel(2)).toBe('2 left');
  });

  it('says Full rather than "0 left"', () => {
    expect(remainingLabel(0)).toBe('Full');
    // Capacity can be lowered under bookings that already exist. A negative number on a card
    // reads as a bug; the service clamps and this agrees with it.
    expect(remainingLabel(-2)).toBe('Full');
  });
});

describe('SlotGrid', () => {
  it('refuses a full slot before it is pressed, rather than after', () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={[slot({ remaining: 0 })]} onSelect={onSelect} />);
    const face = screen.getByRole('button');
    expect((face as HTMLButtonElement).disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is read-only with no onSelect, which is what the console list renders', () => {
    render(<SlotGrid slots={[slot()]} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  it('shows Remove only for the editor, so the picker carries none of it', () => {
    const { rerender } = render(<SlotGrid slots={[slot()]} onSelect={vi.fn()} />);
    expect(screen.queryByText('Remove')).toBeNull();
    rerender(<SlotGrid slots={[slot()]} onSelect={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Remove')).toBeTruthy();
  });

  it('names the time and the count for a screen reader, not just the count', () => {
    render(<SlotGrid slots={[slot({ remaining: 1 })]} onSelect={vi.fn()} />);
    // The visible text is a time and two words; the accessible name is the whole sentence.
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('1 left');
  });

  it('works without capacity at all — the public payload omits it (13 §6)', () => {
    const { capacity: _capacity, ...publicSlot } = slot({ remaining: 2 });
    render(<SlotGrid slots={[publicSlot]} onSelect={vi.fn()} />);
    expect(screen.getByText('2 left')).toBeTruthy();
  });

  it('says so plainly when there are no times yet', () => {
    render(<SlotGrid slots={[]} />);
    expect(screen.getByText('No times yet.')).toBeTruthy();
  });
});
