// Boot. 20 §5.
//
// ONE call. /auth/me returns the session, the organisation, the vocabulary and the
// capability set together, so the first paint is already correct — right domain nouns,
// right actions — instead of rendering generic words and then re-rendering.
import { useCallback, useEffect, useState } from 'react';
import { setUnauthenticatedHandler } from './api.js';
import { useAppDispatch } from '../store/index.js';
import { labelsCleared, signedOut } from '../store/index.js';
import { useGetMeQuery } from '../store/api/endpoints/session.js';
import { signOut } from '../store/thunks/session.js';

/** The respondent world has no session and never will (DEC-009). Asking for one on a
 *  stranger's phone is a wasted round trip on a venue network. */
const isRespondentPath = (pathname: string): boolean => pathname.startsWith('/r/');

export function useBootSession(): void {
  const dispatch = useAppDispatch();
  // Decided once, at boot, as before: it is about where the app was opened.
  const [respondent] = useState(() => isRespondentPath(window.location.pathname));

  useEffect(() => {
    // A 401 from a PLAIN call lands here, which is what makes an expired session route to
    // /login from wherever the user happened to be. Queries and mutations have
    // `sessionExpiredMiddleware` instead.
    //
    // KEPT, ON PURPOSE (R-506). `lib/api.ts` is in the respondent's graph, which may not
    // reach the store (`pages/respond/bundle.test.ts`), so it cannot dispatch `signedOut`
    // itself; this callback is how it reports a 401 without importing the store. The plain
    // calls that still use it are one-off commands followed by a re-read (launch, invite,
    // publish, the reflection writes), the CSV export and the landing check at sign-in.
    setUnauthenticatedHandler(() => {
      dispatch(signedOut());
      dispatch(labelsCleared());
    });
    if (respondent) dispatch(signedOut());
  }, [dispatch, respondent]);

  // The app's ONE live subscription to /auth/me (R-104). Its answer updates the auth and
  // vocabulary slices through their `extraReducers`, and because it stays subscribed,
  // invalidating the `Me` tag refetches it: a grant edit reaches the nav with no reload.
  useGetMeQuery(undefined, { skip: respondent });
}

/**
 * Sign out. The thunk asks the server to destroy the session and then ends it locally
 * whatever the answer (`session/signOut`). The full page load to /login after it is belt
 * and braces: nothing of the session survives in memory either way.
 */
export function useSignOut(): () => Promise<void> {
  const dispatch = useAppDispatch();
  return useCallback(async () => {
    await dispatch(signOut());
    window.location.assign('/login');
  }, [dispatch]);
}
