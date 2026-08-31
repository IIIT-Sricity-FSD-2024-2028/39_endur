// The plan, as the console reads it. 49 § Data contract, 23 §3.
//
// Nothing here is cached in the store and that is the whole design: `49` § State says a
// stale tier is a wrong tier. The page fetches on open and refetches after a join, so what
// it shows is what the entitlement gate will decide with on the next request.
import { useCallback, useEffect, useState } from 'react';
import type {
  BillingSummary,
  EnterpriseRequestState,
  PlanOption,
  Tier,
} from '@endur/shared';
import { apiDelete, apiGet, apiPost } from './api.js';
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

/**
 * SCHEDULE A MOVE DOWN, and cancel one. DEC-098, 49 § Interactions.
 *
 * Both return the WHOLE summary, like `useJoinTier`, and for the same reason `49` § State
 * gives: a stale tier is a wrong tier, so the page replaces what it holds rather than patching
 * one field of it. The pending tier and the period end move together on the server — the read
 * that answers a cancel may also be the read that fires an overdue downgrade — and a client
 * that merged one key would show a tier and a date that never coexisted.
 *
 * NO `paymentRef` ON EITHER. Nothing is captured at schedule time and nothing at apply time,
 * so there is no dialog in front of these and no reference to carry.
 */
export function useScheduleDowngrade(): (tier: Tier) => Promise<BillingSummary> {
  return useCallback(async (tier: Tier) => {
    const response = await apiPost<{ tier: Tier }, { data: BillingSummary }>(
      '/billing/downgrade',
      { tier },
    );
    return response.data;
  }, []);
}

export function useCancelDowngrade(): () => Promise<BillingSummary> {
  return useCallback(async () => {
    // No body. There is only ever one pending value, so naming it would let a caller cancel a
    // downgrade that had already been replaced and be told it worked (13 § Billing).
    const response = await apiDelete<{ data: BillingSummary }>('/billing/downgrade');
    return response.data;
  }, []);
}

/**
 * ASKING FOR ENTERPRISE — DEC-100, T-100, 49 § Asking for Enterprise.
 *
 * A READ AND A WRITE, and NEITHER touches the plan. The read answers one question — is there
 * an open request — because that is all the card's verb depends on. The lifecycle beyond that
 * (contacted, closed) is the OWNER'S, on `/ops`; telling a customer their request had been
 * "closed" would raise a question the product cannot answer.
 */
export function useEnterpriseRequest(): {
  requestedAt: string | null;
  request: (note: string) => Promise<void>;
} {
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: EnterpriseRequestState }>('/billing/enterprise-request')
      .then((response) => {
        if (!cancelled) setRequestedAt(response.data.requestedAt);
      })
      // SWALLOWED, and that is the right failure. This read decides one word on one button;
      // an error banner over the plan page because we could not tell whether somebody had
      // already asked would be the page reporting our problem as theirs.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async (note: string) => {
    const response = await apiPost<
      { note?: string },
      { data: EnterpriseRequestState }
    >('/billing/enterprise-request', note.trim() ? { note: note.trim() } : {});
    setRequestedAt(response.data.requestedAt);
  }, []);

  return { requestedAt, request };
}

