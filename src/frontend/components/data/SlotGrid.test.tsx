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
    expect(remainingLabel(1)).toBe('1 left');
    expect(remainingLabel(2)).toBe('2 left');
  });

  it('says Full rather than "0 left"', () => {
    expect(remainingLabel(0)).toBe('Full');
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

  // The guest page: past times are filtered out, so "yet" would be wrong once they have all gone.
  it('says what the caller asks it to when there are none left', () => {
    render(<SlotGrid slots={[]} emptyText="There are no upcoming times to book right now." />);
    expect(screen.getByText('There are no upcoming times to book right now.')).toBeTruthy();
    expect(screen.queryByText('No times yet.')).toBeNull();
  });
});
