// Boot (R-104): the app shell's one live subscription to /auth/me.
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStore } from '../store/index.js';
import { meFixture, stubApi } from '../test-utils.js';
import { useBootSession } from './session.js';

const mount = () => {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  renderHook(() => useBootSession(), { wrapper });
  return store;
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('useBootSession', () => {
  it('reads the session once at boot, and the store is signed in from its answer', async () => {
    const calls = stubApi({ 'GET /auth/me': { body: meFixture({ name: 'Amara Rao' }) } });
    const store = mount();

    await waitFor(() => expect(store.getState().auth.status).toBe('authenticated'));
    expect(store.getState().auth.user?.name).toBe('Amara Rao');
    expect(calls).toHaveLength(1);
  });

  it('asks nothing on a respondent link: a stranger\'s phone has no session to find', async () => {
    window.history.replaceState({}, '', '/r/abc123');
    const calls = stubApi({});
    const store = mount();

    await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'));
    expect(calls).toHaveLength(0);
  });
});
