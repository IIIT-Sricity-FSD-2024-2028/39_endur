// The Analyze layer on RTK Query. 43 § Data contract; docs/REDUX-PLAN.md (R-502).
//
// No polling, unlike results: analysis is a corpus-wide recomputation on every call and
// does not change minute to minute (`43` § State). A Refresh button re-reads it.
//
// The 402 and 403 that are not errors travel as the store's plain error; `lib/analysis.ts`
// tells them apart (DEC-011).
import type { AnalysisView, ThemeDetail } from '@endur/shared';
import { api } from '../api.js';

export const analysisApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string (`analysisSearch`). */
    getAnalysis: build.query<AnalysisView, string>({
      query: (search) => `/analysis${search}`,
      transformResponse: (response: { data: AnalysisView }) => response.data,
      providesTags: ['Analysis'],
    }),

    /** One theme's source comments: what makes a theme a finding rather than an assertion. */
    getThemeDetail: build.query<ThemeDetail, { id: string; search: string }>({
      query: ({ id, search }) => `/analysis/themes/${encodeURIComponent(id)}${search}`,
      transformResponse: (response: { data: ThemeDetail }) => response.data,
      providesTags: ['Analysis'],
    }),
  }),
});

export const { useGetAnalysisQuery, useGetThemeDetailQuery } = analysisApi;
