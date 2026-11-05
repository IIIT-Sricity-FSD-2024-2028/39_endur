// R-307: the toast slice, and the host that draws it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from '../components/feedback/ToastHost.js';
import { signedOut } from './authSlice.js';
import { setupStore } from './index.js';
import { selectToast, toastDismissed, toastShown, uiSlice } from './uiSlice.js';
import { labelsLoaded } from './vocabularySlice.js';

const reduce = uiSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });

describe('uiSlice', () => {
  it('starts with no toast', () => {
    expect(initial).toEqual({ toast: null });
  });

  it('toastShown: prepare gives each toast an id; the payload carries the message', () => {
    const action = toastShown({ message: 'Organization saved.' });
    expect(action.payload).toEqual({ id: expect.any(String) as unknown, message: 'Organization saved.', undo: null });
    expect(toastShown({ message: 'x' }).payload.id).not.toBe(action.payload.id);
  });

  it('a newer toast replaces the one showing', () => {
    const state = [toastShown({ message: 'One' }), toastShown({ message: 'Two' })].reduce(reduce, initial);
    expect(state.toast?.message).toBe('Two');
  });

  it('a dismissal for an older toast does not close the newer one', () => {
    const first = toastShown({ message: 'One' });
    const state = [first, toastShown({ message: 'Two' }), toastDismissed({ id: first.payload.id })]
      .reduce(reduce, initial);
    expect(state.toast?.message).toBe('Two');
  });

  it('signing out clears it', () => {
    expect(reduce(reduce(undefined, toastShown({ message: 'x' })), signedOut())).toEqual({ toast: null });
  });
});

describe('<ToastHost>', () => {
  afterEach(() => vi.useRealTimers());

  const mount = () => {
    const store = setupStore();
    render(<Provider store={store}><ToastHost /></Provider>);
    return store;
  };

  it('draws whatever toast is in the store, and nothing when there is none', () => {
    const store = mount();
    expect(screen.queryByRole('status')).toBeNull();

    act(() => { store.dispatch(toastShown({ message: 'Words saved.' })); });
    expect(screen.getByRole('status').textContent).toContain('Words saved.');
    // No undo action was given, so no Undo button.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('Undo dispatches the action the toast carries, then closes it', () => {
    const store = mount();
    const undo = labelsLoaded({ unit: { one: 'Ward', many: 'Wards' } });
    act(() => { store.dispatch(toastShown({ message: 'Words changed.', undo })); });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.getState().vocabulary.labels.unit.one).toBe('Ward');
    expect(selectToast(store.getState())).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes itself after four seconds, and on the close button', () => {
    vi.useFakeTimers();
    const store = mount();
    act(() => { store.dispatch(toastShown({ message: 'Gone soon.' })); });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(selectToast(store.getState())).toBeNull();

    act(() => { store.dispatch(toastShown({ message: 'Gone now.' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(selectToast(store.getState())).toBeNull();
  });
});
