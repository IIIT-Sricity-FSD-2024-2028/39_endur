// The plan, as the console reads it. 49 § Data contract, 23 §3.
//
// Nothing here is cached in the store and that is the whole design: `49` § State says a
// stale tier is a wrong tier. The page fetches on open and refetches after a join, so what
// it shows is what the entitlement gate will decide with on the next request.
import { useCallback, useEffect, useState } from 'react';
import type { BillingSummary, PlanOption, Tier } from '@endur/shared';
import { apiGet, apiPost } from './api.js';
import type { Loadable } from './org.js';

export function useBilling(): Loadable<BillingSummary> & { set: (next: BillingSummary) => void } {
  const [state, setState] = useState<Loadable<BillingSummary>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: BillingSummary }>('/billing')
      .then((response) => {
        if (!cancelled) setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((next: BillingSummary) => {
    setState({ data: next, loading: false, error: null });
  }, []);

  return { ...state, set };
}

/**
 * The catalogue, from the server rather than from the shared package the page could import
 * directly. `/start` reads `SIGNUP_PLAN_OPTIONS` locally because it has no session to ask
 * with; this page has one, so it asks — and the plan list stays a thing the server can
 * change without a client release.
 */
export function usePlans(): Loadable<readonly PlanOption[]> {
  const [state, setState] = useState<Loadable<readonly PlanOption[]>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: PlanOption[] }>('/billing/plans')
      .then((response) => {
        if (!cancelled) setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Join a tier. Returns the NEW state as the server sees it — never a local patch.
 *
 * `paymentRef` is what <PaymentDialog> minted, carried so the ledger row and the dialog the
 * customer saw can be matched up (DEC-080). It is a LABEL: the server prices the tier itself
 * and writes the row with or without one, so a caller with nothing to pass may omit it.
 */
export function useJoinTier(): (tier: Tier, paymentRef?: string) => Promise<BillingSummary> {
  return useCallback(async (tier: Tier, paymentRef?: string) => {
    // The key is OMITTED rather than sent as `undefined` — `exactOptionalPropertyTypes` is on,
    // and `{ paymentRef: undefined }` would also serialise as a null-ish field the DTO would
    // then have to tolerate. A caller with nothing to say says nothing.
    const response = await apiPost<{ tier: Tier; paymentRef?: string }, { data: BillingSummary }>(
      '/billing/tier',
      paymentRef ? { tier, paymentRef } : { tier },
    );
    return response.data;
  }, []);
}
