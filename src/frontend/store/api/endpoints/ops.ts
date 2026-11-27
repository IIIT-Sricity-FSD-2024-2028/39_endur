// The operator console's reads and its writes. 70, 71, 72; R-505. The writes are run by the
// thunks in `store/screens/operator.ts` (DEC-R03, R-713).
//
// Injected into `opsApi` from the platform pages' `lib` files, so none of it is in the
// customer-facing entry chunk.
import type {
  EnterSupportResponse,
  EnterpriseRequestRow,
  EnterpriseStatus,
  LogFileMeta,
  LogLine,
  LogStoreMeta,
  Page,
  PlatformAnalytics,
  PlatformEarnings,
  PlatformOrgDetail,
  PlatformAuditEntry,
  PlatformOperator,
  PlatformOrgSummary,
  PlatformStats,
  SupportSessionRow,
  Tier,
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
      invalidatesTags: (_result, error) => (error ? ['Enterprise'] : ['OpsAudit']),
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
        error
          ? ['Enterprise']
          : ['Estate', 'OpsStats', 'OpsAudit', 'OpsEarnings', 'OpsAnalytics',
              ...(result ? [{ type: 'OpsOrg' as const, id: result.org.id }] : [])],
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

    /** An operator's plan override. The organisation and the estate row re-read. */
    setOrgPlan: build.mutation<unknown, { id: string; tier: Tier }>({
      query: ({ id, tier }) => ({ url: `/orgs/${id}/plan`, method: 'POST', body: { tier } }),
      invalidatesTags: (_result, _error, { id }) => [
        'Estate', 'OpsStats', 'OpsAudit', 'OpsAnalytics', 'OpsEarnings', { type: 'OpsOrg', id },
      ],
    }),

    /** Suspend, or reinstate. Staff sign-in only; the respondent surface keeps working. */
    setOrgSuspended: build.mutation<unknown, { id: string; suspended: boolean }>({
      query: ({ id, suspended }) => ({ url: `/orgs/${id}/suspend`, method: 'POST', body: { suspended } }),
      invalidatesTags: (_result, _error, { id }) => ['Estate', 'OpsStats', 'OpsAudit', { type: 'OpsOrg', id }],
    }),

    /** Opens a support session; the answer says where the browser goes next. */
    enterSupportSession: build.mutation<EnterSupportResponse, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/orgs/${id}/support-session`, method: 'POST', body: { reason } }),
      transformResponse: unwrap<EnterSupportResponse>,
      invalidatesTags: ['SupportSessions', 'OpsAudit'],
    }),

    /** To the organisation's administrators' inboxes; recipients are resolved server-side. */
    messageOrg: build.mutation<{ sentTo: number }, { id: string; subject: string; body: string }>({
      query: ({ id, subject, body }) => ({ url: `/orgs/${id}/message`, method: 'POST', body: { subject, body } }),
      transformResponse: unwrap<{ sentTo: number }>,
      invalidatesTags: ['OpsAudit'],
    }),

    /** The arg is `selectReportSearch` (`reportSearch(window)`): one cached report per window. */
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

    /**
     * The estate as six numbers (`platform.usage.read`, both roles): organisations, suspended,
     * the tier counts, seats, live campaigns and responses. COUNTS ONLY: every share and
     * percentage drawn from them is derived in `store/screens/opsReports.ts`.
     */
    getOpsStats: build.query<PlatformStats, void>({
      query: () => '/stats',
      transformResponse: unwrap<PlatformStats>,
      providesTags: ['OpsStats'],
    }),

    /**
     * The platform's OWN audit trail (`platform.audit.read`): every operator action, newest
     * first. The arg is `auditSearch(filters)`, so each filter is its own cached list.
     */
    getPlatformAudit: build.infiniteQuery<Page<PlatformAuditEntry>, string, string | null>({
      infiniteQueryOptions: { initialPageParam: null, getNextPageParam: nextCursor },
      query: ({ queryArg: search, pageParam }) => withCursor('/audit', search, pageParam),
      providesTags: ['OpsAudit'],
    }),

    /** The operator accounts (`platform.operator.manage`, owner only). */
    getOperators: build.query<PlatformOperator[], void>({
      query: () => '/operators',
      transformResponse: unwrap<PlatformOperator[]>,
      providesTags: ['Operators'],
    }),

    /**
     * A role or a status. Creating an operator is NOT here: its body carries a password, and
     * a mutation's argument is kept in the store (`opsApi.mutations`). That one is a thunk
     * over `opsRequest` (`store/screens/opsTeam.ts`), as signing in is.
     */
    updateOperator: build.mutation<
      PlatformOperator,
      { id: string; role?: 'owner' | 'staff'; status?: 'active' | 'disabled' }
    >({
      query: ({ id, ...patch }) => ({ url: `/operators/${id}`, method: 'PATCH', body: patch }),
      transformResponse: unwrap<PlatformOperator>,
      invalidatesTags: ['Operators', 'OpsAudit'],
    }),

    /** The register of support visits; the arg is `?orgId=…&active=…` or empty. */
    getSupportSessions: build.query<SupportSessionRow[], string>({
      query: (search) => `/support-sessions${search}`,
      transformResponse: unwrap<SupportSessionRow[]>,
      providesTags: ['SupportSessions'],
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
  useGetOpsStatsQuery,
  useGetPlatformAuditInfiniteQuery,
  useGetOperatorsQuery,
  useGetSupportSessionsQuery,
} = opsEndpoints;
