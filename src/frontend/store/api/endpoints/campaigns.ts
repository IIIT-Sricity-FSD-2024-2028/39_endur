// Campaigns on RTK Query. 38 § Data contract; docs/REDUX-PLAN.md §6.4 (R-202).
//
// Status is never sent and never stored (DEC-016): it arrives derived on every read. So
// launching or closing a campaign is a command, and what it changes is found out by
// reading the campaign again (or taking the server's answer, where it sends one).
//
// Tags: `{ Campaign, id }`, `{ Campaign, LIST }`, and `Home`, whose counts every one of
// these commands changes.
import type {
  CampaignDetail,
  CampaignSummary,
  CreateCampaignBody,
  LaunchResult,
  Page,
  UpdateCampaignBody,
} from '@endur/shared';
import { api } from '../api.js';

const LIST = { type: 'Campaign', id: 'LIST' } as const;
const HOME = { type: 'Home' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const campaignsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string (`campaignSearch`): one cache entry per filter and page. */
    getCampaigns: build.query<Page<CampaignSummary>, string>({
      query: (search) => `/campaigns${search}`,
      providesTags: (page) => [
        ...(page?.data.map((row) => ({ type: 'Campaign' as const, id: row.id })) ?? []),
        LIST,
      ],
    }),

    getCampaign: build.query<CampaignDetail, string>({
      query: (id) => `/campaigns/${id}`,
      transformResponse: unwrap<CampaignDetail>,
      providesTags: (_result, _error, id) => [{ type: 'Campaign', id }],
    }),

    createCampaign: build.mutation<CampaignDetail, CreateCampaignBody>({
      query: (body) => ({ url: '/campaigns', method: 'POST', body }),
      transformResponse: unwrap<CampaignDetail>,
      invalidatesTags: [LIST, HOME],
    }),

    updateCampaign: build.mutation<CampaignDetail, { id: string; body: UpdateCampaignBody }>({
      query: ({ id, body }) => ({ url: `/campaigns/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<CampaignDetail>,
      invalidatesTags: [LIST, HOME],
      onQueryStarted: ({ id }, lifecycle) => writeBack(id, lifecycle),
    }),

    /**
     * Minting the public token is the irreversible act, and `key` is the caller's
     * idempotency key: a double-click on stage must not create two links (38). The answer
     * is the link, not the campaign, so the campaign itself is invalidated and re-read.
     */
    launchCampaign: build.mutation<LaunchResult, { id: string; key: string }>({
      query: ({ id, key }) => ({
        url: `/campaigns/${id}/launch`,
        method: 'POST',
        idempotencyKey: key,
      }),
      transformResponse: unwrap<LaunchResult>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Campaign', id }, LIST, HOME],
    }),

    closeCampaign: build.mutation<CampaignDetail, string>({
      query: (id) => ({ url: `/campaigns/${id}/close`, method: 'POST' }),
      transformResponse: unwrap<CampaignDetail>,
      invalidatesTags: [LIST, HOME],
      onQueryStarted: (id, lifecycle) => writeBack(id, lifecycle),
    }),
  }),
});

/**
 * An update or a close answers with the whole campaign: write it straight into the cache,
 * so the page shows the new state the moment the promise resolves, as it did before.
 *
 * `updateQueryData`, not `upsertQueryData`: the update is applied synchronously, before the
 * caller's `await` continues (an upsert is a thunk of its own and lands a beat later). It
 * only touches an entry that exists, and these commands come from `useCampaign`, which is
 * subscribed to exactly that entry.
 */
async function writeBack(
  id: string,
  { dispatch, queryFulfilled }: {
    dispatch: (action: unknown) => unknown;
    queryFulfilled: Promise<{ data: CampaignDetail }>;
  },
): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    dispatch(campaignsApi.util.updateQueryData('getCampaign', id, () => data));
  } catch {
    // The caller reports the failure; the cache is left as it was.
  }
}

export const {
  useGetCampaignsQuery,
  useGetCampaignQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useLaunchCampaignMutation,
  useCloseCampaignMutation,
} = campaignsApi;
