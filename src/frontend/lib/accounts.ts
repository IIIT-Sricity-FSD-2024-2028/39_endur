// Accounts — provisioning, revocation, activation. 57.
//
// Split out of `lib/people.ts` on purpose: a PERSON and an ACCOUNT are different things
// (57 § Purpose), and `usePeopleList`/`usePerson` already re-read the whole person after
// every write for the same reason an account action does — the powers and the account are
// resolved server-side and there is no client-side way to guess the new state. Callers
// re-fetch the person themselves after one of these settles.
import type { ActivationPreview } from '@endur/shared';
import { useGetActivationPreviewQuery } from '../store/api/endpoints/accounts.js';
import { useLoadable, type Loadable } from './query.js';

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
