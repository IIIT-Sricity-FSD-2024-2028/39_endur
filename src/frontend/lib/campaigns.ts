// Campaigns — reads. 38 § Data contract, 23 §3. The commands are thunks in
// store/screens/campaigns.ts (DEC-R03).
//
// The one thing worth knowing before editing this file: **status is never sent and never
// stored** (DEC-016). It arrives derived on every read, so there is no `setStatus`, no state
// machine here, and `Cancel schedule` is a PATCH that clears `startsAt` rather than a
// transition backwards.
import { skipToken } from '@reduxjs/toolkit/query';
import type { CampaignDetail, CampaignStatus, CampaignSummary, Page } from '@endur/shared';
import { useLoadable, type Loadable } from './query.js';
import { useGetCampaignQuery, useGetCampaignsQuery } from '../store/api/endpoints/campaigns.js';

export type CampaignQuery = { status?: CampaignStatus | undefined; cursor?: string | undefined };

export function campaignSearch(query: CampaignQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export type CampaignListController = Loadable<Page<CampaignSummary>> & {
  reload: () => Promise<void>;
};

/**
 * One page of campaigns. Creating one (the wizard's thunk, store/screens/campaigns.ts)
 * invalidates the list and Home (R-205), so every mounted list and the Home counters
 * refetch by themselves. The last good page stays on screen with the error above it
 * (38 § States). `enabled: false` asks nothing: a page that only sometimes shows the list
 * (Inbox's filters).
 */
export function useCampaignList(query: CampaignQuery = {}, enabled = true): CampaignListController {
  return useLoadable(useGetCampaignsQuery(enabled ? campaignSearch(query) : skipToken));
}

export type CampaignController = Loadable<CampaignDetail> & {
  reload: () => Promise<void>;
};

/**
 * One campaign, read. Its commands (launch, close) are thunks on the page's slice now
 * (`store/screens/campaigns.ts`), so every press is an action with a payload (DEC-R03).
 */
export function useCampaign(id: string | undefined): CampaignController {
  return useLoadable(useGetCampaignQuery(id ?? '', { skip: !id }), { current: true });
}
