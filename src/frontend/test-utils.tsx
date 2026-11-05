import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Capability, HeldCapabilities, LabelSet, MeResponse } from '@endur/shared';
import { setupStore, type AppStore } from './store/index.js';
import { signedIn, signedOut } from './store/authSlice.js';
import { labelsLoaded } from './store/vocabularySlice.js';
import { ToastHost } from './components/feedback/ToastHost.js';

export type SessionFixture = {
  capabilities?: readonly Capability[] | HeldCapabilities;
  labels?: LabelSet;
  name?: string;
  orgName?: string;
  signedOut?: boolean;
  path?: string;
  support?: MeResponse['support'];
};

export const NONSENSE_LABELS: LabelSet = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

const heldFrom = (
  capabilities: readonly Capability[] | HeldCapabilities | undefined,
): HeldCapabilities => {
  if (!capabilities) return {};
  if (Array.isArray(capabilities)) {
    const held: HeldCapabilities = {};
    for (const capability of capabilities as readonly Capability[]) held[capability] = 'all';
    return held;
  }
  return capabilities as HeldCapabilities;
};

/**
 * The REAL store — `setupStore`, the app's own factory — with a session dispatched into it.
 * Every slice and every middleware the app has, so a component that starts reading a new
 * slice or depending on a listener works in a test the day it works in the app.
 */
/** The `/auth/me` answer a session fixture describes. */
export function meFixture(session: SessionFixture = {}): MeResponse {
  return {
    user: {
      id: 'u1',
      name: session.name ?? 'Amara Rao',
      email: 'amara@example.test',
      avatarUrl: null,
    },
    organization: {
      id: 'o1', name: session.orgName ?? 'Northfield', slug: 'northfield',
      industry: 'university',
    },
    labels: session.labels ?? {},
    capabilities: heldFrom(session.capabilities),
    ...(session.support ? { support: session.support } : {}),
  };
}

export function makeStore(session: SessionFixture = {}): AppStore {
  const store = setupStore();

  if (session.signedOut) {
    store.dispatch(signedOut());
  } else {
    store.dispatch(signedIn(meFixture(session)));
    store.dispatch(labelsLoaded(session.labels));
  }

  return store;
}

/** One request `stubApi` saw. `body` is parsed JSON when the request sent JSON. */
export type StubCall = { method: string; path: string; body: unknown; headers: Headers };

/** What a stubbed route answers: a status and JSON body, or an `Error` for no response. */
export type StubReply = { status?: number; body?: unknown } | Error;

/** A response the test releases when it chooses: for "what happens while it is in flight". */
export function heldReply(reply: StubReply = { body: {} }): {
  promise: Promise<StubReply>;
  release: () => void;
} {
  let release: () => void = () => undefined;
  const promise = new Promise<StubReply>((resolve) => {
    release = () => resolve(reply);
  });
  return { promise, release: () => release() };
}

/**
 * A typed `fetch` stub for endpoint tests (Q-3: no MSW). Routes are keyed
 * `"METHOD /path"`, the path without `/api/v1`. A key ending in `*` matches every path that
 * starts with what comes before it (`"GET /inbox*"`), for a route whose query string the
 * test does not want to spell out; an exact key wins over it, and a longer prefix over a
 * shorter one. A route may be a function of the call, to answer differently the second
 * time, and may answer with a promise (`heldReply`). An unmatched request fails the test
 * loudly.
 *
 * It replaces `fetch` itself, so everything above it is the real code: `request()`, the
 * CSRF echo, the error envelope, the base query and the store.
 */
export function stubApi(
  routes: Record<
    string,
    StubReply | ((call: StubCall, count: number) => StubReply | Promise<StubReply>)
  >,
): StubCall[] {
  const calls: StubCall[] = [];
  const counts = new Map<string, number>();
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace(/^\/api\/v1/, '');
    const call: StubCall = {
      method,
      path,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body,
      headers: new Headers(init.headers),
    };
    calls.push(call);

    const key = `${method} ${path}`;
    const route = routes[key] ?? byPrefix(routes, key);
    if (!route) return Promise.reject(new Error(`stubApi: no route for ${key}`));
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return Promise.resolve(typeof route === 'function' ? route(call, count) : route).then(
      (reply) => {
        if (reply instanceof Error) throw reply;
        const status = reply.status ?? 200;
        return status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(reply.body ?? {}), {
              status,
              headers: { 'content-type': 'application/json' },
            });
      },
    );
  });
  return calls;
}

/** The route whose `*` key is the longest prefix of `key`, if any. */
function byPrefix<R>(routes: Record<string, R>, key: string): R | undefined {
  let best: [string, R] | undefined;
  for (const [pattern, route] of Object.entries(routes)) {
    if (!pattern.endsWith('*') || !key.startsWith(pattern.slice(0, -1))) continue;
    if (!best || pattern.length > best[0].length) best = [pattern, route];
  }
  return best?.[1];
}

/** The error envelope the server sends, for a stubbed failure. */
export const errorReply = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): StubReply => ({
  status,
  body: { error: { code, message, requestId: 'req-test', ...(details ? { details } : {}) } },
});

/**
 * `store` is for a test that needs state in place before the first render, e.g. a template
 * already loaded into the builder: build it with `makeStore`, dispatch, then pass it here.
 */
export function renderWithProviders(
  ui: ReactNode,
  session: SessionFixture = {},
  store: AppStore = makeStore(session),
): RenderResult & { store: AppStore } {
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[session.path ?? '/app']}>
        {ui}
        {/* As in the console and ops shells: a page's toastShown is drawn by the host. */}
        <ToastHost />
      </MemoryRouter>
    </Provider>,
  );
  return { ...result, store };
}
