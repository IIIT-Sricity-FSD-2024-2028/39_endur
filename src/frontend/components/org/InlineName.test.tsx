import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement, ReactNode } from 'react';
import { makeStore } from '../../test-utils.js';
import { InlineName } from './InlineName.js';

/** It keeps its state in the store (store/screens/widgets.ts), so it renders inside one, made fresh
 *  for each render. A `wrapper`, not a wrapping element, so `rerender` keeps it. */
const render = (ui: ReactElement) => {
  const store = makeStore();
  return rtlRender(ui, { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> });
};

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

  it('commits ONCE on Enter, not once for the key and again for the blur it causes', () => {
    const { input, onCommit } = mount();
    fireEvent.change(input, { target: { value: 'Provost' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
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
