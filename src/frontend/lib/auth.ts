// The two ways into the console. 30 § Data contract, 23 §3.
//
// Pages call these; they call `api.ts`. Nothing here reaches for `fetch`, and nothing in
// a page reaches past here — that seam is what makes P3's move to RTK Query additive.
//
// NO CREDENTIAL SURVIVES THIS FILE. `POST /auth/login` answers with `Set-Cookie` and
// `{ ok: true }`; the password is a local variable in a form and is gone the moment the
// promise settles. There is nothing to put in the store and nothing to persist (DEC-014).
import { useCallback } from 'react';
import type { HomeView, LoginBody, MeResponse, RegisterBody } from '@endur/shared';
import { apiGet, apiPost } from './api.js';
import { useAppDispatch } from '../store/index.js';
import { labelsLoaded, signedIn } from '../store/index.js';
import type { AppDispatch } from '../store/index.js';

/**
 * Re-run boot by hand after a successful sign-in.
 *
 * The login response deliberately carries no user, no organisation and no vocabulary —
 * `/auth/me` is the single source for all three (13 § Auth), and having login return a
 * second, slightly different copy is how the two drift. One extra round trip buys one
 * definition of what a session is.
 */
async function hydrate(dispatch: AppDispatch): Promise<MeResponse> {
  const me = await apiGet<MeResponse>('/auth/me');
  dispatch(signedIn(me));
  dispatch(labelsLoaded(me.labels));
  return me;
}

/**
 * Where a freshly signed-in user belongs.
 *
 * An organisation with no roles and no structure has a console that renders correctly and
 * says nothing — the worst possible first screen, because it looks broken rather than
 * empty. `HomeView.configured` exists for exactly this decision (46), so ask, and send
 * them to the wizard instead.
 *
 * If the call fails, land on `/app` anyway. A dashboard that might be sparse beats a
 * sign-in that appears to hang, and `/app` will ask the same question again when it loads.
 */
async function landingRoute(): Promise<string> {
  try {
    const { data } = await apiGet<{ data: HomeView }>('/home');
    return data.configured ? '/app' : '/app/setup';
  } catch {
    return '/app';
  }
}

/**
 * Re-read the session after something changed it server-side — the setup wizard rewrites
 * the organisation's vocabulary, and every screen reads that from the store. Exported so a
 * page can refresh without knowing what `/auth/me` returns or which slices it feeds.
 */
export function useRefreshSession(): () => Promise<MeResponse> {
  const dispatch = useAppDispatch();
  return useCallback(() => hydrate(dispatch), [dispatch]);
}

/** Sign in. Resolves to the route the caller should navigate to. */
export function useSignIn(): (credentials: LoginBody) => Promise<string> {
  const dispatch = useAppDispatch();

  return useCallback(
    async (credentials: LoginBody) => {
      // `suppress401Handler` because a 401 here is the ANSWER, not an expired session.
      // Without it, a mistyped password would fire the global handler and the page would
      // be told it had been logged out — from a page nobody was logged in on.
      await apiPost<LoginBody, { ok: true }>('/auth/login', credentials, {
        suppress401Handler: true,
      });
      await hydrate(dispatch);
      return await landingRoute();
    },
    [dispatch],
  );
}

/**
 * Create an organisation and its first user, and sign them in — one transaction on the
 * server (15 §5), because a half-seeded org has no roles, so nobody can do anything, and
 * that looks exactly like a broken product.
 *
 * Always lands on `/app/setup`. There is no "configured" case to check: the org was
 * created seconds ago.
 */
export function useRegister(): (body: RegisterBody) => Promise<string> {
  const dispatch = useAppDispatch();

  return useCallback(
    async (body: RegisterBody) => {
      await apiPost<RegisterBody, { organization: { id: string; slug: string } }>(
        '/auth/register',
        body,
      );
      await hydrate(dispatch);
      return '/app/setup';
    },
    [dispatch],
  );
}
