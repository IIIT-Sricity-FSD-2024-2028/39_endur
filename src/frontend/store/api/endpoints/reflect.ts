// The improve loop's reads on RTK Query. 44; docs/REDUX-PLAN.md (R-502).
//
// Three non-errors travel as the store's plain error, and `lib/reflect.ts` reads them: a
// 403 (the account), a 402 (the tier), and a 404 on the gap, which is the ordering rule
// ("write your own first"), not a missing page. The writes stay plain calls, each followed
// by the page's own re-read.
import type { GapView, ReflectionCycle, ReflectionForm } from '@endur/shared';
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
  }),
});

export const { useGetCyclesQuery, useGetReflectionFormQuery, useGetGapQuery } = reflectApi;
