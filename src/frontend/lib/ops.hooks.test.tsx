// R-505: the operator console on its own RTK Query API (`opsApi`), over a stubbed `fetch`.
// The platform pages' tests mock these hooks; this is what runs underneath.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnterpriseRequestRow, PlatformMeResponse, PlatformOrgSummary } from '@endur/shared';
import { setupStore, type AppStore } from '../store/index.js';
import { signedIn } from '../store/authSlice.js';
import { errorReply, meFixture, stubApi, type StubCall } from '../test-utils.js';
import { useBootOpsSession } from './opsSession.js';
import { useEnterpriseQueue, useEstate } from './estate.js';
import { useAnalytics } from './analytics-ops.js';
import { useLogLines } from './oplogs.js';

const ME: PlatformMeResponse = {
  operator: { id: 'op1', name: 'Mithil', email: 'ops@endur.test', role: 'owner' },
  capabilities: ['platform.enterprise.read'],
} as unknown as PlatformMeResponse;
const org = (id: string) => ({ id, name: id } as unknown as PlatformOrgSummary);
const page = <T,>(rows: T[], nextCursor: string | null = null) =>
  ({ body: { data: rows, page: { nextCursor, hasMore: nextCursor !== null }, meta: { total: rows.length } } });
const request = (id: string, status: EnterpriseRequestRow['status'], at: string) =>
  ({ id, at, status, org: { id: `org-${id}`, name: id, tier: 'gold' } } as unknown as EnterpriseRequestRow);

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

const gets = (calls: StubCall[], prefix: string) =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith(prefix)).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the operator session', () => {
  it('boots from /platform/me into the ops slice', async () => {
    stubApi({ 'GET /platform/me': { body: ME } });
    const { store } = render(() => useBootOpsSession());
    await waitFor(() => expect(store.getState().ops.status).toBe('authenticated'));
    expect(store.getState().ops.operator?.name).toBe('Mithil');
  });

  it('no operator cookie at boot means anonymous, and signs nobody out', async () => {
    stubApi({ 'GET /platform/me': errorReply(401, 'UNAUTHENTICATED', 'Sign in.') });
    const { store } = render(() => useBootOpsSession());
    await waitFor(() => expect(store.getState().ops.status).toBe('anonymous'));
  });

  it('TWO SESSIONS, NEVER CONFUSED: an expired operator session ends THAT one only, and its cache goes', async () => {
    // The operator cookie expires: from then on every platform route says 401, `/me` included.
    let expired = false;
    const gone = errorReply(401, 'UNAUTHENTICATED', 'Sign in.');
    stubApi({
      'GET /platform/me': () => (expired ? gone : { body: ME }),
      'GET /platform/orgs': () => (expired ? gone : page([org('o1')])),
    });
    const store = setupStore();
    // The same browser is also signed in as a customer.
    store.dispatch(signedIn(meFixture()));
    const { result } = render(() => {
      useBootOpsSession();
      return useEstate({});
    }, store);
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await waitFor(() => expect(store.getState().ops.status).toBe('authenticated'));

    expired = true;
    await act(async () => { await result.current.reload(); });

    await waitFor(() => expect(store.getState().ops.status).toBe('anonymous'));
    // The customer is still signed in: `19` §7's confusion is what this guards against.
    expect(store.getState().auth.status).toBe('authenticated');
    // And nothing the operator could see stays cached for the next person at this browser.
    await waitFor(() => expect(store.getState().opsApi.queries['getEstate("")']?.data).toBeUndefined());
  });
});

describe('useEstate', () => {
  it('"Load more" appends, and the loaded pages are still there after a look at one org and back', async () => {
    const calls = stubApi({
      'GET /platform/orgs': page([org('o1')], 'cur'),
      'GET /platform/orgs?cursor=cur': page([org('o2')]),
    });
    const store = setupStore();
    const first = render(() => useEstate({}), store);
    await waitFor(() => expect(first.result.current.rows).toHaveLength(1));
    await act(async () => { await first.result.current.loadMore(); });
    await waitFor(() => expect(first.result.current.rows.map((row) => row.id)).toEqual(['o1', 'o2']));
    first.unmount();

    // Back from an org's page: both pages at once, no skeleton, while they are re-read.
    const again = render(() => useEstate({}), store);
    expect(again.result.current.rows.map((row) => row.id)).toEqual(['o1', 'o2']);
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(gets(calls, '/platform/orgs')).toBeGreaterThan(2);
  });
});

describe('useEnterpriseQueue', () => {
  const routes = (overrides: Record<string, unknown> = {}) => stubApi({
    'GET /platform/enterprise-requests?status=open': { body: { data: [request('b', 'open', '2026-11-02')] } },
    'GET /platform/enterprise-requests?status=contacted': { body: { data: [request('a', 'contacted', '2026-11-01')] } },
    ...overrides,
  });

  it('is open AND contacted, oldest first, and asks nothing without the capability', async () => {
    const calls = routes();
    const { result } = render(() => ({ queue: useEnterpriseQueue(true), none: useEnterpriseQueue(false) }));
    await waitFor(() => expect(result.current.queue.rows.map((row) => row.id)).toEqual(['a', 'b']));
    expect(result.current.none.rows).toEqual([]);
    expect(gets(calls, '/platform/enterprise-requests')).toBe(2);
  });

  it('Contacted STAYS with its new state; closed LEAVES; approved leaves too', async () => {
    routes({
      'PATCH /platform/enterprise-requests/b': (call: StubCall) => ({
        body: { data: request('b', (call.body as { status: EnterpriseRequestRow['status'] }).status, '2026-11-02') },
      }),
      'POST /platform/enterprise-requests/a/approve': { body: { data: request('a', 'closed', '2026-11-01') } },
    });
    const { result } = render(() => useEnterpriseQueue(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    await act(async () => { await result.current.update('b', 'contacted'); });
    await waitFor(() => expect(result.current.rows.find((row) => row.id === 'b')?.status).toBe('contacted'));

    await act(async () => { await result.current.approve('a'); });
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['b']));

    await act(async () => { await result.current.update('b', 'closed'); });
    await waitFor(() => expect(result.current.rows).toEqual([]));
  });

  it('a refused write is ON SCREEN, never swallowed', async () => {
    routes({ 'PATCH /platform/enterprise-requests/b': errorReply(409, 'CONFLICT', 'Somebody else closed it.') });
    const { result } = render(() => useEnterpriseQueue(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    await act(async () => { await result.current.update('b', 'contacted'); });

    expect(result.current.error).toBe('Somebody else closed it.');
  });
});

describe('useAnalytics', () => {
  it('the last window DIMS AND STAYS while the next loads; a 403 is its own state', async () => {
    stubApi({
      'GET /platform/analytics?granularity=month': { body: { data: { label: 'month' } } },
      'GET /platform/analytics?granularity=quarter': errorReply(403, 'FORBIDDEN', 'Owner only.'),
    });
    const store = setupStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, rerender } = renderHook(
      ({ granularity }: { granularity: 'month' | 'quarter' }) => useAnalytics({ granularity }),
      { wrapper, initialProps: { granularity: 'month' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ label: 'month' }));

    rerender({ granularity: 'quarter' });
    expect(result.current.data).toEqual({ label: 'month' });
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useLogLines', () => {
  it('a rotated-away file is "not found", not an error; "Load older" appends', async () => {
    stubApi({
      'GET /platform/logs/gone.log': errorReply(404, 'NOT_FOUND', 'No such file.'),
      'GET /platform/logs/api.log?level=50': page([{ id: 'l1' }], 'cur'),
      'GET /platform/logs/api.log?level=50&cursor=cur': page([{ id: 'l2' }]),
    });
    const gone = render(() => useLogLines('gone.log', {}));
    await waitFor(() => expect(gone.result.current.notFound).toBe(true));
    expect(gone.result.current.error).toBeNull();

    const lines = render(() => useLogLines('api.log', { level: 50 }));
    await waitFor(() => expect(lines.result.current.rows).toHaveLength(1));
    await act(async () => { await lines.result.current.loadMore(); });
    await waitFor(() => expect(lines.result.current.rows).toHaveLength(2));
  });
});
