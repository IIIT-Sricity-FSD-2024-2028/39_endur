// The respondent seam. 39 § Data contract, 13 §6, 23 §3.
//
// Two endpoints, no session, no capability check — the only pair in the product where
// access IS the token. Everything here is written for a phone on a venue network, so the
// whole form arrives in ONE request (39, rule 7: a second request is a second chance to fail)
// and the submit is idempotent, because a flaky network retries by itself.
//
// Both are on RTK Query (`store/api/endpoints/respond.ts`); the send is the `answersSubmitted`
// thunk in `store/screens/respond.ts`, which <RespondForm> dispatches. docs/REDUX-PLAN.md
// §6.10 (R-704). What is left here: the read's page-facing shape, and the device marker.
import type { PublicCampaign, ResolvedLabels } from '@endur/shared';
import { ApiError } from './api.js';
import { pageErrorOf } from '../store/screens/common.js';
import { useGetPublicCampaignQuery } from '../store/api/endpoints/respond.js';

/** Local knowledge, honestly best-effort: a marker per token (39 § State, 15 §3). */
const MARKER = (token: string) => `endur.responded.${token}`;

/**
 * DEC-037. The campaign is real and answerable, and this caller may not have it.
 *
 * Two outcomes rather than one, because the reader's next move differs and a shared screen
 * would have to hedge: a stranger can sign in, and somebody signed in elsewhere cannot do
 * anything useful at all (39 § States).
 *
 * `organizationName` is the CAMPAIGN's, which is the only name either error carries (13 §5).
 */
export type CampaignGate = {
  kind: 'signIn' | 'notMember';
  organizationName: string;
};

export type PublicCampaignState = {
  campaign: PublicCampaign | null;
  loading: boolean;
  /**
   * The uniform 404. Bad token, not launched yet, not open yet, or closed — the server
   * refuses to say which, on purpose (13 §6), so neither can this flag. See CONF-015.
   */
  unavailable: boolean;
  /**
   * Set only when the token WORKED and the gate refused (DEC-037). Distinct from
   * `unavailable` on purpose and in both directions: a restricted campaign is not a broken
   * link, and — the half that matters — a broken link never becomes a gate. The server
   * resolves before it gates, so a bad token 404s and lands above, which is what stops a
   * restricted campaign being an existence oracle.
   */
  gate: CampaignGate | null;
  /** Anything else — the network, a proxy, a 500. Distinct because it is worth retrying. */
  error: Error | null;
  reload: () => Promise<void>;
};

/** The organisation's display name is the only key either gate body carries (13 §5). */
function gateOf(error: unknown): CampaignGate | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'SIGN_IN_REQUIRED' && error.code !== 'NOT_A_MEMBER') return null;
  const name = (error.details as { organizationName?: unknown } | undefined)?.organizationName;
  return {
    kind: error.code === 'SIGN_IN_REQUIRED' ? 'signIn' : 'notMember',
    // A gate screen with a blank where a name should be is worse than a general one, and
    // the name is the server's to send — so fall back rather than render "undefined".
    organizationName: typeof name === 'string' && name ? name : 'this organization',
  };
}

/**
 * The form behind a link, as the page reads it: the campaign, or exactly one reason there is
 * none. A respondent has no session, so a 401 could not mean an expired one; the public
 * routes are TENANTLESS precisely so a bad token 404s rather than 401ing.
 */
export function usePublicCampaign(token: string | undefined): PublicCampaignState {
  const result = useGetPublicCampaignQuery(token ?? '', { skip: !token });
  const error = pageErrorOf(isPlainError(result.error) ? result.error : undefined);
  const notFound = error instanceof ApiError && error.status === 404;
  const gate = gateOf(error);
  const reload = async (): Promise<void> => {
    if (token) await result.refetch();
  };

  // No token in the path at all is the same dead end as a wrong one, and it is reachable:
  // somebody types `/r/` from the back of the room.
  if (!token) {
    return { campaign: null, loading: false, unavailable: true, gate: null, error: null, reload };
  }
  return {
    campaign: result.currentData ?? null,
    loading: result.isFetching && !result.currentData && !result.isError,
    unavailable: notFound,
    gate,
    // A gate is not a failure to retry. "Try again" on a 403 is a button that will always
    // do the same thing, which teaches the reader the product is broken.
    error: notFound || gate ? null : error,
    reload,
  };
}

/** RTK Query's error for this read is always the plain API error (`apiBaseQuery`). */
const isPlainError = (error: unknown): error is Parameters<typeof pageErrorOf>[0] =>
  typeof error === 'object' && error !== null && 'kind' in error;

export type SubmitResult = { responseCount: number };

/**
 * Best-effort duplicate prevention, and the product does not overclaim it (39 § State).
 * Clearing site data defeats it, another phone defeats it, and private browsing may refuse
 * to store it at all — which is why every access is wrapped. A form that threw here would
 * lose a response that the server has already accepted, to protect a marker that was never
 * a guarantee.
 */
export function hasResponded(token: string): boolean {
  try {
    return globalThis.localStorage?.getItem(MARKER(token)) !== null;
  } catch {
    return false;
  }
}

export function markResponded(token: string): void {
  try {
    globalThis.localStorage?.setItem(MARKER(token), new Date().toISOString());
  } catch {
    // iOS Safari in private mode throws on setItem. Nothing to do and nothing to say: the
    // response is already in, and this was only ever a courtesy.
  }
}

/**
 * What `/r/:token` hands `/r/:token/done` through router state.
 *
 * Carried rather than refetched, for two reasons. The response count is not in
 * `PublicCampaign` at all — 13 §6 excludes counts from the public payload deliberately, so
 * a second GET could not learn it — and a thank-you page that has to make a request is a
 * thank-you page that can fail after the answers are already saved.
 */
export type DoneState = {
  responseCount: number;
  subjectName?: string | undefined;
  anonymous: boolean;
  labels: ResolvedLabels;
};
