// Accounts — provisioning, revocation, activation. 57.
//
// Split out of `lib/people.ts` on purpose: a PERSON and an ACCOUNT are different things
// (57 § Purpose), and `usePeopleList`/`usePerson` already re-read the whole person after
// every write for the same reason an account action does — the powers and the account are
// resolved server-side and there is no client-side way to guess the new state. Callers
// re-fetch the person themselves after one of these settles.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountInvite, ActivateAccountBody, ActivationPreview } from '@endur/shared';
import { apiDelete, apiGet, apiPost } from './api.js';
import type { Loadable } from './org.js';

/** `account.create` — a first sign-in link for somebody who has never had one. */
export const inviteAccount = (personId: string): Promise<AccountInvite> =>
  apiPost<undefined, { data: AccountInvite }>(`/people/${personId}/account`).then((r) => r.data);

/** `account.reset` — the support path. Invalidates any live link and mints a new one. */
export const resetAccount = (personId: string): Promise<AccountInvite> =>
  apiPost<undefined, { data: AccountInvite }>(`/people/${personId}/account/reset`).then((r) => r.data);

/** `account.revoke` — ends sign-in immediately. Positions and audit rows are untouched. */
export const revokeAccount = (personId: string): Promise<void> =>
  apiDelete(`/people/${personId}/account`);

/**
 * The public activation link. `null` while unread, and stays `null` on a dead token —
 * the caller reads `error` for the uniform dead-end message (57 § The token).
 */
export function useActivationPreview(token: string): Loadable<ActivationPreview> {
  const [state, setState] = useState<Loadable<ActivationPreview>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setState({ data: null, loading: true, error: null });
    void apiGet<{ data: ActivationPreview }>(`/auth/activate/${token}`)
      .then(({ data }) => {
        if (alive.current) setState({ data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (alive.current) setState({ data: null, loading: false, error });
      });
  }, [token]);

  return state;
}

/**
 * Consume the link and set the password. The server signs the browser in as part of this
 * call (`Set-Cookie` on the same response, 57 § Interactions) — the caller still has to
 * hydrate the session the same way `useSignIn` does, because this route deliberately
 * carries no user or organisation in its body (15 §2's argument, restated for one more
 * route).
 */
export const activate = (token: string, password: string): Promise<{ ok: true }> =>
  apiPost<ActivateAccountBody, { ok: true }>(`/auth/activate/${token}`, { password });
