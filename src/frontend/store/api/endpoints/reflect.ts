// The improve loop's reads on RTK Query. 44; docs/REDUX-PLAN.md (R-502).
//
// Three non-errors travel as the store's plain error, and `lib/reflect.ts` reads them: a
// 403 (the account), a 402 (the tier), and a 404 on the gap, which is the ordering rule
// ("write your own first"), not a missing page.
//
// The three writes are mutations (DEC-R03, R-711), run by the thunks in
// `store/screens/reflect.ts`. Each invalidates the cycle it is about (its form and its gap,
// which share the tag) and the cycle list, whose status moves with it.
import type {
  CreatePlanBody,
  GapView,
  ReflectionCycle,
  ReflectionForm,
  SubmitReflectionBody,
} from '@endur/shared';
import { api } from '../api.js';

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const reflectApi = api.injectEndpoints({
  endpoints: (build) => ({
    getCycles: build.query<ReflectionCycle[], void>({
      query: () => '/reflect',
      transformResponse: unwrap<ReflectionCycle[]>,
      providesTags: ['Reflection'],
    }),

    getReflectionForm: build.query<ReflectionForm, string>({
      query: (campaignId) => `/reflect/${campaignId}`,
      transformResponse: unwrap<ReflectionForm>,
      providesTags: (_result, _error, campaignId) => [{ type: 'Reflection', id: campaignId }],
    }),

    getGap: build.query<GapView, string>({
      query: (campaignId) => `/reflect/${campaignId}/gap`,
      transformResponse: unwrap<GapView>,
      providesTags: (_result, _error, campaignId) => [{ type: 'Reflection', id: campaignId }],
    }),

    /** Your own assessment. Once only: it is what your results are compared against. */
    submitReflection: build.mutation<{ id: string }, { campaignId: string; body: SubmitReflectionBody }>({
      query: ({ campaignId, body }) => ({ url: `/reflect/${campaignId}`, method: 'POST', body }),
      transformResponse: unwrap<{ id: string }>,
      invalidatesTags: (_result, _error, { campaignId }) => ['Reflection', { type: 'Reflection', id: campaignId }],
    }),

    savePlan: build.mutation<unknown, { campaignId: string; body: CreatePlanBody }>({
      query: ({ campaignId, body }) => ({ url: `/reflect/${campaignId}/plan`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { campaignId }) => ['Reflection', { type: 'Reflection', id: campaignId }],
    }),

    /** Permanent: the plan becomes a record. `campaignId` only says which cycle to re-read. */
    finalisePlan: build.mutation<unknown, { planId: string; campaignId: string }>({
      query: ({ planId }) => ({ url: `/reflect/plans/${planId}/finalise`, method: 'POST' }),
      invalidatesTags: (_result, _error, { campaignId }) => ['Reflection', { type: 'Reflection', id: campaignId }],
    }),
  }),
});

export const { useGetCyclesQuery, useGetReflectionFormQuery, useGetGapQuery } = reflectApi;
