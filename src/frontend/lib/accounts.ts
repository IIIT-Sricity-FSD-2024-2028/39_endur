// Accounts — provisioning, revocation, activation. 57.
//
// Split out of `lib/people.ts` on purpose: a PERSON and an ACCOUNT are different things
// (57 § Purpose), and `usePeopleList`/`usePerson` already re-read the whole person after
// every write for the same reason an account action does — the powers and the account are
// resolved server-side and there is no client-side way to guess the new state. Callers
// re-fetch the person themselves after one of these settles.
import type { AccountInvite, ActivateAccountBody, ActivationPreview } from '@endur/shared';
import { apiDelete, apiPost } from './api.js';
import { useGetActivationPreviewQuery } from '../store/api/endpoints/accounts.js';
import { useLoadable, type Loadable } from './query.js';

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
  // `initialOnly`: the page swaps its whole form for "Checking your link…" while loading,
  // and a re-read (the network coming back, say) must not do that to somebody typing.
  const preview = useLoadable(useGetActivationPreviewQuery(token), { current: true, initialOnly: true });
  return { data: preview.data, loading: preview.loading, error: preview.error };
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
