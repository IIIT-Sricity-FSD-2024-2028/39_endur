// R-101 and R-103: the store factory and the listener middleware it installs.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS } from '@endur/shared';
import { setupStore } from './index.js';
import { signedOut } from './authSlice.js';
import { labelsLoaded } from './vocabularySlice.js';
import { addAppListener } from './middleware/listeners.js';

describe('setupStore', () => {
  it('builds every static slice with its initial state', () => {
    const state = setupStore().getState();

    expect(state.auth).toEqual({
      status: 'unknown', user: null, org: null, capabilities: {}, support: null,
    });
    expect(state.vocabulary).toEqual({ labels: DEFAULT_LABELS });
    expect(state.ops).toEqual({ status: 'unknown', operator: null, capabilities: [] });
  });

  it('starts from preloaded state when given one, and initial state for the rest', () => {
    const store = setupStore({ auth: { ...setupStore().getState().auth, status: 'anonymous' } });

    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().ops.status).toBe('unknown');
  });

  it('returns a fresh store on every call, so tests never share state', () => {
    const one = setupStore();
    const two = setupStore();

    one.dispatch(labelsLoaded({ unit: { one: 'Ward', many: 'Wards' } }));

    expect(one.getState().vocabulary.labels.unit.one).toBe('Ward');
    expect(two.getState().vocabulary.labels.unit).toEqual(DEFAULT_LABELS.unit);
  });
});

describe('the listener middleware', () => {
  it('runs a listener when its action is dispatched, after the reducer has run', () => {
    const store = setupStore();
    const seen = vi.fn();
    const unsubscribe = store.dispatch(
      addAppListener({
        actionCreator: signedOut,
        effect: (action, api) => {
          seen(action.type, api.getState().auth.status);
        },
      }),
    );

    store.dispatch(signedOut());
    unsubscribe();
    store.dispatch(signedOut());

    // Once, not twice: the unsubscribe returned by the dispatch removed it.
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('auth/signedOut', 'anonymous');
  });
});
