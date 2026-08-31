// <Toast> — 24 §6, design_specs/design/10 §4.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Toast } from './Toast.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a toast is a success, announced politely and then gone', () => {
  it('is a status, never an alert', () => {
    render(<Toast message="Deleted." onDismiss={vi.fn()} />);
    // An alert interrupts a screen reader mid-sentence, and interrupting somebody to tell
    // them a thing went RIGHT is a strange thing to do.
    expect(screen.getByRole('status').textContent).toContain('Deleted.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dismisses itself, and the caller is the one that removes it', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Deleted." onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(4000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed by hand before the timer', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Deleted." onDismiss={onDismiss} />);
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers Undo only when there is something to undo', () => {
    const plain = render(<Toast message="Deleted." onDismiss={vi.fn()} />);
    // An undo button that cannot undo is worse than no undo at all — the template library
    // has no restore endpoint, so it passes nothing here.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    plain.unmount();

    const undo = vi.fn();
    render(<Toast message="Deleted." undo={undo} onDismiss={vi.fn()} />);
    act(() => screen.getByRole('button', { name: 'Undo' }).click());
    expect(undo).toHaveBeenCalled();
  });

  it('a second message resets the clock rather than inheriting the remainder', () => {
    const onDismiss = vi.fn();
    const view = render(<Toast message="First." onDismiss={onDismiss} />);
    act(() => void vi.advanceTimersByTime(3000));

    view.rerender(<Toast message="Second." onDismiss={onDismiss} />);
    act(() => void vi.advanceTimersByTime(3000));
    // Without the reset the second message would vanish after one second.
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
