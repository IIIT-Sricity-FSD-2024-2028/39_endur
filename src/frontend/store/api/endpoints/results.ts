// Results on RTK Query. 40 § Data contract; docs/REDUX-PLAN.md §6.5 (R-203).
//
// The server decides what this screen may see: the k-anonymity gate arrives as
// `suppressed: true` with no `questions` key at all, and nothing here could reconstruct
// one (52 §2). Read-only, so there are no mutations; a response arriving is something the
// poll finds, not something this client causes.
import type { Page, ResponseItem, ResultsView } from '@endur/shared';
import { api } from '../api.js';

export type ResponsesPage = Page<ResponseItem> & { suppressed: boolean };

export const resultsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** `search` is `resultsSearch(filters)`: one cache entry per campaign and filter. */
    getResults: build.query<ResultsView, { campaignId: string; search: string }>({
      query: ({ campaignId, search }) => `/campaigns/${campaignId}/results${search}`,
      transformResponse: (response: { data: ResultsView }) => response.data,
      providesTags: (_result, _error, { campaignId }) => [{ type: 'Result', id: campaignId }],
    }),

    /**
     * The comments, a page at a time. An infinite query: "Load more" appends the next page
     * to the ones already loaded, which `useResponses` used to do by hand with a cursor.
     */
    getResponses: build.infiniteQuery<ResponsesPage, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
      },
      query: ({ queryArg: campaignId, pageParam: cursor }) =>
        `/campaigns/${campaignId}/responses${cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ''}`,
      providesTags: (_result, _error, campaignId) => [{ type: 'Result', id: campaignId }],
    }),
  }),
});

export const { useGetResultsQuery, useGetResponsesInfiniteQuery } = resultsApi;
