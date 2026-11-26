// R-104 – R-107: the session on RTK Query, on the real store, over a stubbed `fetch`.
//
// Everything between `fetch` and the slices is the real code: `request()`, the base query,
// the `getMe` endpoint, the auth and vocabulary `extraReducers`, the session thunks, the
// 401 middleware and the reset listener.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api.js';
import { unwrapApi } from '../../lib/query.js';
import { errorReply, meFixture, stubApi } from '../../test-utils.js';
import { addAppListener } from '../middleware/listeners.js';
import { redactPasswords } from '../devtools.js';
import { setupStore, type AppStore } from '../index.js';
import { signedOut } from '../authSlice.js';
import { refreshMe, signIn, signOut } from '../thunks/session.js';
import { api } from './api.js';
import { sessionApi } from './endpoints/session.js';

const ME = meFixture({
  capabilities: ['campaign.read'],
  labels: { unit: { one: 'Ward', many: 'Wards' } },
});
const UNAUTHENTICATED = errorReply(401, 'UNAUTHENTICATED', 'Please sign in.');

// A query that is not `getMe`, to show the 401 handling applies to any query.
const probeApi = api.injectEndpoints({
  endpoints: (build) => ({ probe: build.query<unknown, void>({ query: () => '/probe' }) }),
});

/** Count every dispatch of `actionCreator` on this store from now on. */
function watch(store: AppStore, actionCreator: typeof signedOut | typeof api.util.resetApiState) {
  const seen = vi.fn();
  store.dispatch(addAppListener({ actionCreator, effect: () => { seen(); } }));
  return seen;
}

/** A store whose boot `getMe` has answered with ME. */
async function signedInStore() {
  const store = setupStore();
  await store.dispatch(sessionApi.endpoints.getMe.initiate());
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMe: one answer, two slices (R-104)', () => {
  it('updates the session AND the vocabulary from one fulfilled action', async () => {
    stubApi({ 'GET /auth/me': { body: ME } });
    const store = await signedInStore();

    const state = store.getState();
    expect(state.auth.status).toBe('authenticated');
    expect(state.auth.org?.name).toBe('Northfield');
    expect(state.auth.capabilities).toEqual({ 'campaign.read': 'all' });
    expect(state.vocabulary.labels.unit).toEqual({ one: 'Ward', many: 'Wards' });
  });

  it('a 401 at boot means signed out, not a loading screen', async () => {
    stubApi({ 'GET /auth/me': UNAUTHENTICATED });
    const store = setupStore();
    await store.dispatch(sessionApi.endpoints.getMe.initiate());
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('so does a network failure at boot, which looks the same to the user', async () => {
    stubApi({ 'GET /auth/me': new TypeError('Failed to fetch') });
    const store = setupStore();
    await store.dispatch(sessionApi.endpoints.getMe.initiate());
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('LATER, a failed refetch is a network blip: nobody is signed out', async () => {
    stubApi({ 'GET /auth/me': (_call, count) => (count === 1 ? { body: ME } : new TypeError('offline')) });
    const store = await signedInStore();
    await store.dispatch(refreshMe());
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('invalidating `Me` refetches it while the shell is subscribed, so new powers arrive', async () => {
    const calls = stubApi({
      'GET /auth/me': (_call, count) => ({
        body: count === 1 ? ME : { ...ME, capabilities: { 'campaign.read': 'all', 'campaign.create': 'all' } },
      }),
    });
    const store = setupStore();
    // What `useBootSession`'s `useGetMeQuery` holds for the life of the app.
    const subscription = store.dispatch(sessionApi.endpoints.getMe.initiate());
    await subscription;

    // What a grant edit's mutation will do (R-403).
    store.dispatch(api.util.invalidateTags(['Me']));
    await vi.waitFor(() => {
      expect(store.getState().auth.capabilities).toHaveProperty('campaign.create');
    });
    expect(calls.filter((call) => call.path === '/auth/me')).toHaveLength(2);
    subscription.unsubscribe();
  });
});

describe('sessionExpiredMiddleware: a 401 mid-session (R-107)', () => {
  it('signs out and puts the default words back, from ANY query', async () => {
    stubApi({ 'GET /auth/me': { body: ME }, 'GET /probe': UNAUTHENTICATED });
    const store = await signedInStore();

    await store.dispatch(probeApi.endpoints.probe.initiate());

    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().vocabulary.labels.unit.one).not.toBe('Ward');
  });

  it('and the cache is reset, so nothing of that session can reach the screen (R-106)', async () => {
    stubApi({ 'GET /auth/me': { body: ME }, 'GET /probe': UNAUTHENTICATED });
    const store = await signedInStore();
    const reset = watch(store, api.util.resetApiState);

    await store.dispatch(probeApi.endpoints.probe.initiate());

    expect(reset).toHaveBeenCalledTimes(1);
    expect(store.getState().api.queries).toEqual({});
  });

  it('a 401 with nobody signed in changes nothing, so a reset can never loop', async () => {
    stubApi({ 'GET /probe': UNAUTHENTICATED });
    const store = setupStore();
    store.dispatch(signedOut());
    const signedOutAgain = watch(store, signedOut);
    const reset = watch(store, api.util.resetApiState);

    await store.dispatch(probeApi.endpoints.probe.initiate());

    expect(signedOutAgain).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('other failures are left to the page: a 403 signs nobody out', async () => {
    stubApi({ 'GET /auth/me': { body: ME }, 'GET /probe': errorReply(403, 'FORBIDDEN', 'No.') });
    const store = await signedInStore();
    await store.dispatch(probeApi.endpoints.probe.initiate());
    expect(store.getState().auth.status).toBe('authenticated');
  });
});

describe('the session thunks (R-105)', () => {
  it('signIn logs in, then reads the session, in that order', async () => {
    const calls = stubApi({ 'POST /auth/login': { body: { ok: true } }, 'GET /auth/me': { body: ME } });
    const store = setupStore();
    store.dispatch(signedOut());

    const result = await store.dispatch(signIn({ email: 'amara@example.test', password: 'pw' }));

    expect(signIn.fulfilled.match(result)).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /auth/login', 'GET /auth/me']);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('a wrong password rejects WITH the server\'s error as a value, and is not a sign-out', async () => {
    stubApi({
      'POST /auth/login': errorReply(401, 'UNAUTHENTICATED', 'That email and password do not match.'),
    });
    const store = setupStore();
    store.dispatch(signedOut());
    const signedOutAgain = watch(store, signedOut);

    const result = await store.dispatch(signIn({ email: 'amara@example.test', password: 'nope' }));

    expect(signIn.rejected.match(result) && result.payload).toMatchObject({
      kind: 'api', status: 401, message: 'That email and password do not match.',
    });
    expect(signedOutAgain).not.toHaveBeenCalled();
  });

  it('unwrapApi turns the stored error back into an ApiError the form can read', async () => {
    stubApi({
      'POST /auth/login': errorReply(422, 'VALIDATION_FAILED', 'Check the form.', {
        fields: [{ path: 'body.email', message: 'Not an email address.' }],
      }),
    });
    const store = setupStore();

    const failure = await unwrapApi(store.dispatch(signIn({ email: 'x', password: 'pw' }))).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).fieldError('email')).toBe('Not an email address.');
  });

  it('signOut ends the session locally even when the server call fails, and clears the cache', async () => {
    stubApi({ 'GET /auth/me': { body: ME }, 'POST /auth/logout': new TypeError('offline') });
    const store = await signedInStore();

    await store.dispatch(signOut());

    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().api.queries).toEqual({});
  });
});

describe('switching organization (R-106)', () => {
  it('resets the cache when /auth/me comes back for a different org', async () => {
    stubApi({
      'GET /auth/me': (_call, count) => ({
        body: count === 1 ? ME : { ...ME, organization: { ...ME.organization, id: 'o2', name: 'Riverside' } },
      }),
    });
    const store = await signedInStore();
    const reset = watch(store, api.util.resetApiState);

    await store.dispatch(refreshMe());

    expect(reset).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.org?.name).toBe('Riverside');
  });

  it('does not reset it when the same org answers again', async () => {
    stubApi({ 'GET /auth/me': { body: ME } });
    const store = await signedInStore();
    const reset = watch(store, api.util.resetApiState);
    await store.dispatch(refreshMe());
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('the DevTools sanitiser', () => {
  it('blanks the password in a sign-in action and leaves everything else alone', () => {
    const pending = signIn.pending('request-1', { email: 'amara@example.test', password: 'hunter2' });
    const shown = redactPasswords(pending);
    expect(shown.meta.arg).toEqual({ email: 'amara@example.test', password: '[redacted]' });
    // The real action is untouched; only DevTools' copy changes.
    expect(pending.meta.arg.password).toBe('hunter2');

    const other = signedOut();
    expect(redactPasswords(other)).toBe(other);
  });

  it('blanks a password one level down, where an RTK Query mutation keeps its argument', () => {
    const action = {
      type: 'api/executeMutation/pending',
      meta: {
        arg: {
          endpointName: 'changePassword',
          originalArgs: { currentPassword: 'old-secret', newPassword: 'new-secret-long' },
        },
      },
    };
    expect(redactPasswords(action).meta.arg.originalArgs).toEqual({
      currentPassword: '[redacted]',
      newPassword: '[redacted]',
    });
    // An argument with no password in it is passed through as the same object.
    const plain = { type: 'x', meta: { arg: { originalArgs: { name: 'Amara' } } } };
    expect(redactPasswords(plain)).toBe(plain);
  });
});
