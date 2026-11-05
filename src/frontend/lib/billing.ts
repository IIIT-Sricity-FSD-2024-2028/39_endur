// The plan, as the console reads it. 49 § Data contract, 23 §3.
//
// `49` § State says a stale tier is a wrong tier. On RTK Query since R-503
// (`store/api/endpoints/billing.ts`), and that rule now holds in two ways it did not before:
// every write puts the server's whole summary into the one cache entry the page AND the
// shell's plan banner read, and the page shows its skeleton rather than a cached tier while
// a fresh read is in flight. What it shows is what the entitlement gate will decide with on
// the next request.
import { useCallback } from 'react';
import type { BillingSummary, PlanOption, Tier } from '@endur/shared';
import { useAppDispatch } from '../store/index.js';
import {
  billingApi,
  useCancelDowngradeMutation,
  useGetBillingQuery,
  useGetEnterpriseRequestQuery,
  useGetPlansQuery,
  useJoinTierMutation,
  useRequestEnterpriseMutation,
  useScheduleDowngradeMutation,
} from '../store/api/endpoints/billing.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

/**
 * The summary. `loading` is true during ANY read, a re-read included, and the Plan page
 * swaps itself for a skeleton while it is: a cached tier shown for a moment is still a tier
 * the gate may no longer agree with.
 */
export function useBilling(): Loadable<BillingSummary> & { set: (next: BillingSummary) => void } {
  const dispatch = useAppDispatch();
  const billing = useLoadable(useGetBillingQuery());

  const set = useCallback(
    (next: BillingSummary) => {
      dispatch(billingApi.util.updateQueryData('getBilling', undefined, () => next));
    },
    [dispatch],
  );

  return { data: billing.data, loading: billing.loading, error: billing.error, set };
}

/**
 * For the shell's plan banner: the same cache entry as the Plan page, so a join there is
 * here at once. `null` when the reader may not see billing (nothing is asked), while it
 * loads, and on a failure, which is SILENT by design: the banner is chrome on somebody
 * else's page, and an error strip about a plan on top of a broken subjects list tells
 * them about the wrong problem.
 */
export function usePlanSummary(enabled: boolean): BillingSummary | null {
  return useGetBillingQuery(undefined, { skip: !enabled }).data ?? null;
}

/**
 * The catalogue, from the server rather than from the shared package the page could import
 * directly. `/start` reads `SIGNUP_PLAN_OPTIONS` locally because it has no session to ask
 * with; this page has one, so it asks — and the plan list stays a thing the server can
 * change without a client release.
 */
export function usePlans(): Loadable<readonly PlanOption[]> {
  const plans = useLoadable(useGetPlansQuery());
  return { data: plans.data, loading: plans.loading, error: plans.error };
}

/**
 * Join a tier. Returns the NEW state as the server sees it — never a local patch.
 *
 * `paymentRef` is what <PaymentDialog> minted, carried so the ledger row and the dialog the
 * customer saw can be matched up (DEC-080). It is a LABEL: the server prices the tier itself
 * and writes the row with or without one, so a caller with nothing to pass may omit it.
 */
export function useJoinTier(): (tier: Tier, paymentRef?: string) => Promise<BillingSummary> {
  const [joinTier] = useJoinTierMutation();
  return useCallback(
    (tier: Tier, paymentRef?: string) => unwrapApi(joinTier({ tier, paymentRef })),
    [joinTier],
  );
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
  const [scheduleDowngrade] = useScheduleDowngradeMutation();
  return useCallback((tier: Tier) => unwrapApi(scheduleDowngrade(tier)), [scheduleDowngrade]);
}

export function useCancelDowngrade(): () => Promise<BillingSummary> {
  const [cancelDowngrade] = useCancelDowngradeMutation();
  return useCallback(() => unwrapApi(cancelDowngrade()), [cancelDowngrade]);
}

/**
 * ASKING FOR ENTERPRISE — DEC-100, T-100, 49 § Asking for Enterprise.
 *
 * A READ AND A WRITE, and NEITHER touches the plan. The read answers one question — is there
 * an open request — because that is all the card's verb depends on. The lifecycle beyond that
 * (contacted, closed) is the OWNER'S, on `/ops`; telling a customer their request had been
 * "closed" would raise a question the product cannot answer.
 *
 * A failed read is SWALLOWED, and that is the right failure: it decides one word on one
 * button, and an error banner over the plan page because we could not tell whether somebody
 * had already asked would be the page reporting our problem as theirs.
 */
export function useEnterpriseRequest(): {
  requestedAt: string | null;
  request: (note: string) => Promise<void>;
} {
  const { data } = useGetEnterpriseRequestQuery();
  const [requestEnterprise] = useRequestEnterpriseMutation();

  const request = useCallback(
    async (note: string) => {
      await unwrapApi(requestEnterprise(note));
    },
    [requestEnterprise],
  );

  return { requestedAt: data?.requestedAt ?? null, request };
}
