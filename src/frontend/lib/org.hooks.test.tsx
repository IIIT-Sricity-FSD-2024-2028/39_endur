// R-401: the organisation hooks on RTK Query, run for real over a stubbed `fetch`. The
// Settings and Setup pages' own tests mock these hooks; this is what runs underneath.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LabelSet, OrgView } from '@endur/shared';
import { setupStore, useAppSelector, type AppStore } from '../store/index.js';
import { meFixture, stubApi, type StubCall } from '../test-utils.js';
import { useBootSession } from './session.js';
import { useOrg, useRemoveLogo, useUpdateLabels, useUpdateOrg, useUploadLogo } from './org.js';

const org = (patch: Partial<OrgView> = {}): OrgView => ({
  id: 'o1', name: 'Northfield', slug: 'northfield', industry: 'university', labels: {},
  configured: true, logoUrl: null, createdAt: '2026-01-01T00:00:00.000Z', ...patch,
});

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

const count = (calls: StubCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a save reaches the app shell, with no reload', () => {
  it('renaming the organization re-reads /auth/me, so the top bar has the new name', async () => {
    let name = 'Northfield';
    const calls = stubApi({
      'GET /auth/me': () => ({ body: meFixture({ orgName: name }) }),
      'GET /org': () => ({ body: { data: org({ name }) } }),
      'PATCH /org': (call) => {
        name = (call.body as { name: string }).name;
        return { body: { data: org({ name }) } };
      },
    });
    const { result } = render(() => {
      useBootSession();
      return {
        org: useOrg(),
        update: useUpdateOrg(),
        topBar: useAppSelector((state) => state.auth.org?.name),
      };
    });
    await waitFor(() => expect(result.current.topBar).toBe('Northfield'));
    await waitFor(() => expect(result.current.org.data?.name).toBe('Northfield'));

    await act(async () => { await result.current.update({ name: 'Northfield College' }); });

    // The page has the server's answer at once (written into the cache, not re-read)...
    expect(result.current.org.data?.name).toBe('Northfield College');
    expect(count(calls, 'GET', '/org')).toBe(1);
    // ...and the shell catches up through `Me`.
    await waitFor(() => expect(result.current.topBar).toBe('Northfield College'));
  });

  it('saving the words re-reads /auth/me, and the vocabulary slice takes them', async () => {
    let labels: LabelSet = {};
    stubApi({
      'GET /auth/me': () => ({ body: meFixture({ labels }) }),
      'PATCH /org/labels': (call) => {
        labels = (call.body as { labels: LabelSet }).labels;
        return { body: { data: org({ labels }) } };
      },
    });
    const { result, store } = render(() => {
      useBootSession();
      return {
        save: useUpdateLabels(),
        unit: useAppSelector((state) => state.vocabulary.labels.unit.one),
      };
    });
    await waitFor(() => expect(result.current.unit).toBe('Unit'));
    await waitFor(() => expect(store.getState().api.queries['getMe(undefined)']?.status).toBe('fulfilled'));

    await act(async () => { await result.current.save({ unit: { one: 'Ward', many: 'Wards' } }); });

    await waitFor(() => expect(result.current.unit).toBe('Ward'));
  });
});

describe('useOrg', () => {
  it('reads as loading only until there is an org to show, never on a re-read', async () => {
    let logoUrl: string | null = null;
    const consoleError = vi.spyOn(console, 'error');
    const calls = stubApi({
      'GET /org': () => ({ body: { data: org({ logoUrl }) } }),
      'POST /org/logo': () => {
        logoUrl = '/files/logo.png';
        return { status: 201, body: { data: { id: 'f1' } } };
      },
      'DELETE /org/logo': () => {
        logoUrl = null;
        return { status: 204 };
      },
    });
    const seen: boolean[] = [];
    const { result } = render(() => {
      const value = { org: useOrg(), upload: useUploadLogo(), remove: useRemoveLogo() };
      seen.push(value.org.loading);
      return value;
    });
    await waitFor(() => expect(result.current.org.data).not.toBeNull());
    const before = seen.length;

    let updated: OrgView | undefined;
    await act(async () => {
      updated = await result.current.upload(new File(['png'], 'logo.png', { type: 'image/png' }));
    });

    // The upload answers with the file, so the org is re-read, and that is what comes back.
    expect(updated?.logoUrl).toBe('/files/logo.png');
    expect(calls.find((call) => call.method === 'POST')?.body).toBeInstanceOf(FormData);
    // One re-read, not two: the invalidation and the hook's own read are the same request.
    expect(count(calls, 'GET', '/org')).toBe(2);
    // Settings swaps the whole form for a skeleton while `loading`: a re-read must not.
    expect(seen.slice(before)).not.toContain(true);
    // The `File` went out in the request and never into the store.
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => { updated = await result.current.remove(); });
    expect(updated?.logoUrl).toBeNull();
  });

  it('set() puts an org the page already has into the cache', async () => {
    stubApi({ 'GET /org': { body: { data: org() } } });
    const { result } = render(() => useOrg());
    await waitFor(() => expect(result.current.data?.name).toBe('Northfield'));

    act(() => result.current.set(org({ name: 'Renamed' })));

    // A cache patch is auto-batched: subscribers hear of it on the next frame.
    await waitFor(() => expect(result.current.data?.name).toBe('Renamed'));
  });
});
