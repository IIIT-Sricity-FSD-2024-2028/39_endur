// The operator console's reads and the enterprise queue's writes. 70, 71, 72; R-505.
//
// Injected into `opsApi` from the platform pages' `lib` files, so none of it is in the
// customer-facing entry chunk.
import type {
  EnterpriseRequestRow,
  EnterpriseStatus,
  LogFileMeta,
  LogLine,
  LogStoreMeta,
  Page,
  PlatformAnalytics,
  PlatformEarnings,
  PlatformOrgDetail,
  PlatformOrgSummary,
} from '@endur/shared';
import { opsApi } from '../opsApi.js';

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

/** A cursor appended to a search string that may or may not have one already. */
const withCursor = (path: string, search: string, cursor: string | null): string =>
  cursor ? `${path}${search}${search ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : `${path}${search}`;

const nextCursor = <T,>(page: Page<T>): string | undefined => page.page.nextCursor ?? undefined;

export const opsEndpoints = opsApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The estate. "Load more" APPENDS: the list dims and stays while loading (`70` §
     * States), and replacing the page would throw away the operator's scroll. Being in
     * the cache, the pages already loaded are still there after a look at one org and back.
     */
    getEstate: build.infiniteQuery<Page<PlatformOrgSummary>, string, string | null>({
      infiniteQueryOptions: { initialPageParam: null, getNextPageParam: nextCursor },
      query: ({ queryArg: search, pageParam }) => withCursor('/orgs', search, pageParam),
      providesTags: ['Estate'],
    }),

    getOrgDetail: build.query<PlatformOrgDetail, string>({
      query: (id) => `/orgs/${id}`,
      transformResponse: unwrap<PlatformOrgDetail>,
      providesTags: (_result, _error, id) => [{ type: 'OpsOrg', id }],
    }),

    /**
     * OPEN **AND** CONTACTED, as one list. The queue is what is outstanding, and a customer
     * somebody has rung once is still outstanding until the sale is made or dropped.
     * Fetching only `open` is what made "Contacted" look like it did nothing. Two requests
     * on the server's side, one entry on ours (`queryFn`).
     */
    getEnterpriseQueue: build.query<EnterpriseRequestRow[], void>({
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        const [open, contacted] = await Promise.all([
          baseQuery('/enterprise-requests?status=open'),
          baseQuery('/enterprise-requests?status=contacted'),
        ]);
        const failed = open.error ?? contacted.error;
        if (failed) return { error: failed };
        const rows = [
          ...(open.data as Wrapped<EnterpriseRequestRow[]>).data,
          ...(contacted.data as Wrapped<EnterpriseRequestRow[]>).data,
        ];
        return { data: rows.sort((a, b) => a.at.localeCompare(b.at)) };
      },
      providesTags: ['Enterprise'],
    }),

    /**
     * `closed` LEAVES THE QUEUE; `contacted` STAYS IN IT WITH ITS NEW STATE: the whole point
     * of the Contacted verb is to record progress on something still outstanding. The
     * server's answer goes straight into the cache. On a refusal the queue is re-read
     * rather than guessed at: a list patched on the assumption a write worked is a list
     * that lies.
     */
    updateEnterpriseRequest: build.mutation<EnterpriseRequestRow, { id: string; status: EnterpriseStatus }>({
      query: ({ id, status }) => ({ url: `/enterprise-requests/${id}`, method: 'PATCH', body: { status } }),
      transformResponse: unwrap<EnterpriseRequestRow>,
      invalidatesTags: (_result, error) => (error ? ['Enterprise'] : []),
      onQueryStarted: async ({ id }, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            opsEndpoints.util.updateQueryData('getEnterpriseQueue', undefined, (rows) =>
              data.status === 'closed'
                ? rows.filter((row) => row.id !== id)
                : rows.map((row) => (row.id === id ? data : row)),
            ),
          );
        } catch {
          // Re-read by the invalidation above.
        }
      },
    }),

    /** Approving closes the request AND moves that organisation's plan. */
    approveEnterpriseRequest: build.mutation<EnterpriseRequestRow, string>({
      query: (id) => ({ url: `/enterprise-requests/${id}/approve`, method: 'POST' }),
      transformResponse: unwrap<EnterpriseRequestRow>,
      invalidatesTags: (result, error) =>
        error ? ['Enterprise'] : ['Estate', ...(result ? [{ type: 'OpsOrg' as const, id: result.org.id }] : [])],
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          dispatch(
            opsEndpoints.util.updateQueryData('getEnterpriseQueue', undefined, (rows) =>
              rows.filter((row) => row.id !== id),
            ),
          );
        } catch {
          // Re-read by the invalidation above.
        }
      },
    }),

    /** The arg is `analyticsSearch(window)`: one cached report per window. */
    getAnalytics: build.query<PlatformAnalytics, string>({
      query: (search) => `/analytics${search}`,
      transformResponse: unwrap<PlatformAnalytics>,
      providesTags: ['OpsAnalytics'],
    }),

    getEarnings: build.query<PlatformEarnings, string>({
      query: (search) => `/earnings${search}`,
      transformResponse: unwrap<PlatformEarnings>,
      providesTags: ['OpsEarnings'],
    }),

    getLogFiles: build.query<{ data: LogFileMeta[]; meta?: LogStoreMeta }, void>({
      query: () => '/logs',
      providesTags: ['OpsLogs'],
    }),

    /** One file, newest first; "Load older" appends. No polling and no live tail (`72`). */
    getLogLines: build.infiniteQuery<Page<LogLine>, { file: string; search: string }, string | null>({
      infiniteQueryOptions: { initialPageParam: null, getNextPageParam: nextCursor },
      query: ({ queryArg: { file, search }, pageParam }) =>
        withCursor(`/logs/${encodeURIComponent(file)}`, search, pageParam),
      providesTags: ['OpsLogs'],
    }),
  }),
});

export const {
  useGetEstateInfiniteQuery,
  useGetOrgDetailQuery,
  useGetEnterpriseQueueQuery,
  useUpdateEnterpriseRequestMutation,
  useApproveEnterpriseRequestMutation,
  useGetAnalyticsQuery,
  useGetEarningsQuery,
  useGetLogFilesQuery,
  useGetLogLinesInfiniteQuery,
} = opsEndpoints;
