// The activity log on RTK Query. 56 § State; docs/REDUX-PLAN.md (R-502).
//
// No polling. This is a RECORD, not a monitor (`72` is the monitor), and a log that
// re-fetches under the reader moves the row they were reading. "Load older" appends: an
// infinite query, whose pages are the rows already on screen and are never replaced.
import type { AuditEntry, Page } from '@endur/shared';
import { api } from '../api.js';

export const auditApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string (`auditSearch`): one cached log per set of filters. */
    getAudit: build.infiniteQuery<Page<AuditEntry>, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
      },
      query: ({ queryArg: search, pageParam: cursor }) => {
        if (!cursor) return `/audit${search}`;
        return `/audit${search}${search ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`;
      },
      providesTags: ['Audit'],
    }),
  }),
});

export const { useGetAuditInfiniteQuery } = auditApi;
