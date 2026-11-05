// The plan on RTK Query. 49 § Data contract; docs/REDUX-PLAN.md §6.4 (R-503).
//
// `49` § State: a stale tier is a wrong tier. Two consequences here:
//   - every write answers with the WHOLE summary, which goes straight into the cache. The
//     page and the shell's plan banner then show the same tier the moment it changes.
//     Before, the banner fetched once when the console opened, so after adding payment on
//     the Plan page it went on saying "your trial ends — add payment" until a reload.
//   - the Plan page shows its skeleton, not a cached tier, while a re-read is in flight
//     (`useBilling` keeps `loading` true during one).
//
// No `Me`: the tier is not in `/auth/me`, and the capability map is built from grants alone
// (`authz/held.ts`); the plan is enforced by `requireEntitlement` on the server.
import type {
  BillingSummary,
  EnterpriseRequestState,
  PlanOption,
  Tier,
} from '@endur/shared';
import { api } from '../api.js';

const SUMMARY = { type: 'Billing', id: 'SUMMARY' } as const;
const ENTERPRISE = { type: 'Billing', id: 'ENTERPRISE' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

/**
 * A plan write answers with the summary as it now stands: that IS the new cache entry.
 * `updateQueryData`, not `upsertQueryData`: an upsert passes through "pending", and the
 * Plan page shows its skeleton while the summary is pending.
 */
async function writeBack({ dispatch, queryFulfilled }: {
  dispatch: (action: unknown) => unknown;
  queryFulfilled: Promise<{ data: BillingSummary }>;
}): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    dispatch(billingApi.util.updateQueryData('getBilling', undefined, () => data));
  } catch {
    // The page reports the refusal; the summary on screen is still the true one.
  }
}

export const billingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBilling: build.query<BillingSummary, void>({
      query: () => '/billing',
      transformResponse: unwrap<BillingSummary>,
      providesTags: [SUMMARY],
    }),

    /** From the server, so the plan list can change without a client release. */
    getPlans: build.query<PlanOption[], void>({
      query: () => '/billing/plans',
      transformResponse: unwrap<PlanOption[]>,
    }),

    /**
     * Join a tier. `paymentRef` is a LABEL the checkout minted (DEC-080): the server prices
     * the tier itself. The key is omitted rather than sent as `undefined`.
     */
    joinTier: build.mutation<BillingSummary, { tier: Tier; paymentRef?: string | undefined }>({
      query: ({ tier, paymentRef }) => ({
        url: '/billing/tier',
        method: 'POST',
        body: paymentRef ? { tier, paymentRef } : { tier },
      }),
      transformResponse: unwrap<BillingSummary>,
      onQueryStarted: (_arg, lifecycle) => writeBack(lifecycle),
    }),

    /** DEC-098. Nothing is captured at schedule time, so there is no `paymentRef`. */
    scheduleDowngrade: build.mutation<BillingSummary, Tier>({
      query: (tier) => ({ url: '/billing/downgrade', method: 'POST', body: { tier } }),
      transformResponse: unwrap<BillingSummary>,
      onQueryStarted: (_tier, lifecycle) => writeBack(lifecycle),
    }),

    /** No body: there is only ever one pending move, so naming it could cancel the wrong one. */
    cancelDowngrade: build.mutation<BillingSummary, void>({
      query: () => ({ url: '/billing/downgrade', method: 'DELETE' }),
      transformResponse: unwrap<BillingSummary>,
      onQueryStarted: (_arg, lifecycle) => writeBack(lifecycle),
    }),

    /** Whether an Enterprise request is open: one word on one button (DEC-100). */
    getEnterpriseRequest: build.query<EnterpriseRequestState, void>({
      query: () => '/billing/enterprise-request',
      transformResponse: unwrap<EnterpriseRequestState>,
      providesTags: [ENTERPRISE],
    }),

    requestEnterprise: build.mutation<EnterpriseRequestState, string>({
      query: (note) => ({
        url: '/billing/enterprise-request',
        method: 'POST',
        body: note.trim() ? { note: note.trim() } : {},
      }),
      transformResponse: unwrap<EnterpriseRequestState>,
      onQueryStarted: async (_note, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          // An upsert, because the read before it may have failed (it is allowed to) and
          // left no entry to patch.
          void dispatch(billingApi.util.upsertQueryData('getEnterpriseRequest', undefined, data));
        } catch {
          // The page says the request did not go; the button still says "Request".
        }
      },
    }),
  }),
});

export const {
  useGetBillingQuery,
  useGetPlansQuery,
  useJoinTierMutation,
  useScheduleDowngradeMutation,
  useCancelDowngradeMutation,
  useGetEnterpriseRequestQuery,
  useRequestEnterpriseMutation,
} = billingApi;
