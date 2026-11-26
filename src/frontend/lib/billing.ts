// The plan, as the console reads it. 49 § Data contract, 23 §3.
//
// `49` § State says a stale tier is a wrong tier. On RTK Query since R-503
// (`store/api/endpoints/billing.ts`), and that rule now holds in two ways it did not before:
// every write puts the server's whole summary into the one cache entry the page AND the
// shell's plan banner read, and the page shows its skeleton rather than a cached tier while
// a fresh read is in flight. What it shows is what the entitlement gate will decide with on
// the next request.
//
// Reads only (DEC-R03): joining, scheduling a move down and asking for Enterprise are thunks
// in `store/screens/plan.ts`.
import type { BillingSummary, PlanOption } from '@endur/shared';
import {
  useGetBillingQuery,
  useGetEnterpriseRequestQuery,
  useGetPlansQuery,
} from '../store/api/endpoints/billing.js';
import { useLoadable, type Loadable } from './query.js';

/**
 * The summary. `loading` is true during ANY read, a re-read included, and the Plan page
 * swaps itself for a skeleton while it is: a cached tier shown for a moment is still a tier
 * the gate may no longer agree with.
 */
export function useBilling(): Loadable<BillingSummary> {
  const billing = useLoadable(useGetBillingQuery());
  return { data: billing.data, loading: billing.loading, error: billing.error };
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
 * ASKING FOR ENTERPRISE — DEC-100, T-100, 49 § Asking for Enterprise. When the open request
 * was made, or `null`. The ask itself is `enterpriseRequested` (store/screens/plan.ts).
 *
 * The lifecycle beyond "asked" (contacted, closed) is the OWNER'S, on `/ops`; telling a
 * customer their request had been "closed" would raise a question the product cannot answer.
 *
 * A failed read is SWALLOWED, and that is the right failure: it decides one word on one
 * button, and an error banner over the plan page because we could not tell whether somebody
 * had already asked would be the page reporting our problem as theirs.
 */
export function useEnterpriseRequestedAt(): string | null {
  return useGetEnterpriseRequestQuery().data?.requestedAt ?? null;
}
