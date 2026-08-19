// The respondent seam. 39 § Data contract, 13 §6, 23 §3.
//
// Two endpoints, no session, no store, no capability check — the only pair in the product
// where access IS the token. Everything here is written for a phone on a venue network, so
// the whole form arrives in ONE request (39, rule 7: a second request is a second chance to
// fail) and the submit is idempotent, because a flaky network retries by itself.
//
// It reuses `lib/api.ts` deliberately rather than calling `fetch`. That file already unpacks
// the error envelope into the field errors this form renders inline, and a second wrapper
// would be a second place for the 422 shape to be understood differently.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicCampaign, ResolvedLabels, SubmitResponseBody } from '@endur/shared';
import { ApiError, apiGet, apiPost } from './api.js';

/** Local knowledge, honestly best-effort: a marker per token (39 § State, 15 §3). */
const MARKER = (token: string) => `endur.responded.${token}`;

export type PublicCampaignState = {
  campaign: PublicCampaign | null;
  loading: boolean;
  /**
   * The uniform 404. Bad token, not launched yet, not open yet, or closed — the server
   * refuses to say which, on purpose (13 §6), so neither can this flag. See CONF-015.
   */
  unavailable: boolean;
  /** Anything else — the network, a proxy, a 500. Distinct because it is worth retrying. */
  error: Error | null;
  reload: () => Promise<void>;
};

export function usePublicCampaign(token: string | undefined): PublicCampaignState {
  const [state, setState] = useState<Omit<PublicCampaignState, 'reload'>>({
    campaign: null, loading: true, unavailable: false, error: null,
  });
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!token) {
      // No token in the path at all is the same dead end as a wrong one, and it is
      // reachable: somebody types `/r/` from the back of the room.
      setState({ campaign: null, loading: false, unavailable: true, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await apiGet<{ data: PublicCampaign }>(
        `/public/campaigns/${encodeURIComponent(token)}`,
        // A respondent has no session, so a 401 here is not an expired one and must not
        // fire the global sign-out handler. It cannot happen — the public routes are
        // TENANTLESS precisely so a bad token 404s rather than 401ing — but the seam
        // should not depend on that staying true somewhere else.
        { suppress401Handler: true },
      );
      if (alive.current) {
        setState({ campaign: response.data, loading: false, unavailable: false, error: null });
      }
    } catch (error) {
      if (!alive.current) return;
      const notFound = error instanceof ApiError && error.status === 404;
      setState({
        campaign: null,
        loading: false,
        unavailable: notFound,
        error: notFound ? null : (error as Error),
      });
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, reload: load };
}

export type SubmitResult = { responseCount: number };

export async function submitResponse(
  token: string,
  body: SubmitResponseBody,
  key: string,
): Promise<SubmitResult> {
  const response = await apiPost<SubmitResponseBody, { data: { responseCount: number } }>(
    `/public/campaigns/${encodeURIComponent(token)}/responses`,
    body,
    { idempotencyKey: key, suppress401Handler: true },
  );
  return { responseCount: response.data.responseCount };
}

/**
 * One key per FORM FILL, not per token.
 *
 * 13 §7 says respondent submit is "keyed on the invitation token", which is right for an
 * invitation — one token, one person. An open link is the opposite: everyone in the room
 * holds the same token, so keying on it would replay the first person's 201 to the second
 * and the campaign would collect exactly one response in front of the evaluator.
 *
 * Generated once when the form mounts and reused for every retry of that fill, which is
 * what makes the retry idempotent without making two people the same person. A failed
 * submit stores nothing (the middleware caches successes only), so editing an answer after
 * a 422 and pressing again is a fresh request, not a conflict.
 */
export function submitKey(token: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `submit:${token}:${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

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
