// R-504: the caller's own account on RTK Query, over a stubbed `fetch`: the read hook, and
// the profile thunks (store/screens/profile.ts) against the same cache.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileView } from '@endur/shared';
import { setupStore, useAppSelector } from '../store/index.js';
import {
  avatarRemoved, avatarUploaded, passwordChanged, selectProfileScreen, selfRenamed,
} from '../store/screens/profile.js';
import { errorReply, meFixture, stubApi, type StubCall } from '../test-utils.js';
import { useBootSession } from './session.js';
import { useProfile } from './profile.js';

const view = (name: string, avatarUrl: string | null = null) =>
  ({ user: { name, avatarUrl }, positions: [], powersByPlace: [] } as unknown as ProfileView);

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

/** A thunk run to its end inside `act`, so the hooks see its result. */
const run = async (dispatching: () => Promise<unknown>): Promise<void> => {
  await act(async () => { await dispatching(); });
};

const count = (calls: StubCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProfile and the profile thunks', () => {
  it('a rename takes the answer into the cache, and the top bar follows through /auth/me', async () => {
    let name = 'Amara Rao';
    const calls = stubApi({
      'GET /auth/me': () => ({ body: meFixture({ name }) }),
      'GET /profile': () => ({ body: { data: view(name) } }),
      'PATCH /profile': (call) => {
        name = (call.body as { name: string }).name;
        return { body: { data: view(name) } };
      },
    });
    const { result, store } = render(() => {
      useBootSession();
      return { profile: useProfile(), topBar: useAppSelector((state) => state.auth.user?.name) };
    });
    await waitFor(() => expect(result.current.profile.data?.user.name).toBe('Amara Rao'));
    await waitFor(() => expect(result.current.topBar).toBe('Amara Rao'));

    await run(() => store.dispatch(selfRenamed('Amara R.')));

    await waitFor(() => expect(result.current.profile.data?.user.name).toBe('Amara R.'));
    expect(count(calls, 'GET', '/profile')).toBe(1);
    await waitFor(() => expect(result.current.topBar).toBe('Amara R.'));
  });

  it('a new photo goes up as multipart and resolves once the profile has it', async () => {
    let avatarUrl: string | null = null;
    const calls = stubApi({
      'GET /profile': () => ({ body: { data: view('Amara', avatarUrl) } }),
      'POST /profile/avatar': () => {
        avatarUrl = '/files/me.png';
        return { status: 201, body: { data: { id: 'f1' } } };
      },
      'DELETE /profile/avatar': () => {
        avatarUrl = null;
        return { status: 204 };
      },
    });
    const { result, store } = render(() => useProfile());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await run(() => store.dispatch(avatarUploaded(new File(['png'], 'me.png', { type: 'image/png' }))));
    expect(calls.find((call) => call.method === 'POST')?.body).toBeInstanceOf(FormData);
    expect(result.current.data?.user.avatarUrl).toBe('/files/me.png');

    await run(() => store.dispatch(avatarRemoved()));
    expect(result.current.data?.user.avatarUrl).toBeNull();
  });

  it('a wrong current password is kept for the card to put under the field', async () => {
    stubApi({
      'GET /profile': { body: { data: view('Amara') } },
      'POST /profile/password': errorReply(422, 'VALIDATION', 'That is not your current password.', {
        fields: [{ path: 'body.currentPassword', message: 'That is not your current password.' }],
      }),
    });
    const { result, store } = render(() => useProfile());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await run(() => store.dispatch(passwordChanged({ currentPassword: 'wrong-one', newPassword: 'a-long-new-one' })));

    expect(selectProfileScreen(store.getState()).password.error).toMatchObject({ status: 422 });
    // Folded into the read's `error`, it would land in the wrong place.
    expect(result.current.error).toBeNull();
    // DEC-014: no password anywhere in the store, the request's own record included.
    expect(JSON.stringify(store.getState())).not.toMatch(/wrong-one|a-long-new-one/);
  });
});
