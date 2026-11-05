// R-504: the caller's own account on RTK Query, over a stubbed `fetch`. The Profile page's
// own test mocks this hook; this is what runs underneath.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileView } from '@endur/shared';
import { setupStore, useAppSelector } from '../store/index.js';
import { errorReply, meFixture, stubApi, type StubCall } from '../test-utils.js';
import { ApiError } from './api.js';
import { useBootSession } from './session.js';
import { useProfile } from './profile.js';

const view = (name: string, avatarUrl: string | null = null) =>
  ({ user: { name, avatarUrl }, positions: [], powersByPlace: [] } as unknown as ProfileView);

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

const count = (calls: StubCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProfile', () => {
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
    const { result } = render(() => {
      useBootSession();
      return { profile: useProfile(), topBar: useAppSelector((state) => state.auth.user?.name) };
    });
    await waitFor(() => expect(result.current.profile.data?.user.name).toBe('Amara Rao'));
    await waitFor(() => expect(result.current.topBar).toBe('Amara Rao'));

    await act(async () => { await result.current.profile.rename('Amara R.'); });

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
    const { result } = render(() => useProfile());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => { await result.current.uploadAvatar(new File(['png'], 'me.png', { type: 'image/png' })); });
    expect(calls.find((call) => call.method === 'POST')?.body).toBeInstanceOf(FormData);
    expect(result.current.data?.user.avatarUrl).toBe('/files/me.png');

    await act(async () => { await result.current.removeAvatar(); });
    expect(result.current.data?.user.avatarUrl).toBeNull();
  });

  it('a wrong current password THROWS, for the card to put under the field', async () => {
    stubApi({
      'GET /profile': { body: { data: view('Amara') } },
      'POST /profile/password': errorReply(422, 'VALIDATION', 'That is not your current password.', {
        fields: { 'body.currentPassword': 'That is not your current password.' },
      }),
    });
    const { result } = render(() => useProfile());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const failure = await result.current
      .changePassword({ currentPassword: 'wrong-one', newPassword: 'a-long-new-one' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    // Folded into the page's `error`, it would land in the wrong place.
    expect(result.current.error).toBeNull();
  });
});
