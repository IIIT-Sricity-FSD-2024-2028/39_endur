// Boot. 20 §5.
//
// ONE call. /auth/me returns the session, the organisation, the vocabulary and the
// capability set together, so the first paint is already correct — right domain nouns,
// right actions — instead of rendering generic words and then re-rendering.
import { useEffect } from 'react';
import type { MeResponse } from '@endur/shared';
import { apiGet, apiPost, setUnauthenticatedHandler } from './api.js';
import { useAppDispatch } from '../store/index.js';
import { labelsCleared, labelsLoaded, signedIn, signedOut } from '../store/index.js';

/** The respondent world has no session and never will (DEC-009). Asking for one on a
 *  stranger's phone is a wasted round trip on a venue network. */
const isRespondentPath = (pathname: string): boolean => pathname.startsWith('/r/');

export function useBootSession(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // A 401 from ANY later call lands here too, which is what makes an expired session
    // route to /login from wherever the user happened to be.
    setUnauthenticatedHandler(() => {
      dispatch(signedOut());
      dispatch(labelsCleared());
    });

    if (isRespondentPath(window.location.pathname)) {
      dispatch(signedOut());
      return;
    }

    let cancelled = false;
    void apiGet<MeResponse>('/auth/me')
      .then((me) => {
        if (cancelled) return;
        dispatch(signedIn(me));
        dispatch(labelsLoaded(me.labels));
      })
      // Any failure at boot means "not signed in" as far as the UI is concerned. A network
      // error and a 401 are indistinguishable to the user here, and pretending otherwise
      // would strand them on a loading screen.
      .catch(() => {
        if (!cancelled) dispatch(signedOut());
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}

/** Sign out. The server destroys the record — clearing the cookie alone would leave a
 *  valid session id alive for anyone who captured it. */
export async function signOut(): Promise<void> {
  try {
    await apiPost('/auth/logout');
  } finally {
    // Clear locally whatever the server said. A failed logout that leaves the UI looking
    // signed in is worse than one that looks signed out and is not.
    window.location.assign('/login');
  }
}
