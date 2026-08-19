// 24 §7 — "Enter commits, Esc reverts, blur commits."
//
// Every one of these three was written before it was tested, and Esc was WRONG: it
// committed. `setDraft(value)` is asynchronous and `blur()` is not, so the blur handler ran
// first with the draft the user had just asked to throw away.
//
// The first version of this test passed anyway, because `.blur()` on an element that was
// never focused is a no-op. `input.focus()` is the line that makes it a real test.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineName } from './InlineName.js';

const mount = (onCommit = vi.fn()) => {
  render(<InlineName value="Dean" onCommit={onCommit} ariaLabel="Role name" />);
  const input = screen.getByLabelText<HTMLInputElement>('Role name');
  input.focus();
  return { input, onCommit };
};

describe('<InlineName>', () => {
  it('reverts on Escape and commits nothing', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: 'Provost' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('Dean');
  });

  it('still commits on the NEXT edit after an Escape — the flag is not sticky', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: 'Provost' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    input.focus();
    fireEvent.change(input, { target: { value: 'Chancellor' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Chancellor');
  });

  it('commits on Enter', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: 'Provost' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Provost');
  });

  it('commits on blur', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: 'Provost' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Provost');
  });

  it('trims, and does not fire for a no-op edit', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: '  Dean  ' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reverts an emptied field rather than erroring — that is a slip, not an instruction', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('Dean');
  });

  it('follows the value when it changes underneath — a reorder, an undo, a preset swap', () => {
    const { rerender } = render(
      <InlineName value="Dean" onCommit={vi.fn()} ariaLabel="Role name" />,
    );
    rerender(<InlineName value="Provost" onCommit={vi.fn()} ariaLabel="Role name" />);
    expect(screen.getByLabelText<HTMLInputElement>('Role name').value).toBe('Provost');
  });
});
