// Campaigns — reads and writes. 38 § Data contract, 23 §3.
//
// The one thing worth knowing before editing this file: **status is never sent and never
// stored** (DEC-016). It arrives derived on every read, so there is no `setStatus`, no state
// machine here, and `Cancel schedule` is a PATCH that clears `startsAt` rather than a
// transition backwards.
import { useCallback, useEffect, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type {
  AudiencePreview,
  AudienceRule,
  CampaignDetail,
  CampaignStatus,
  CampaignSummary,
  CreateCampaignBody,
  LaunchResult,
  Page,
  QuickCampaignBody,
  UpdateCampaignBody,
} from '@endur/shared';
import { apiGet, apiPost } from './api.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';
import {
  useCloseCampaignMutation,
  useCreateCampaignMutation,
  useGetCampaignQuery,
  useGetCampaignsQuery,
  useLaunchCampaignMutation,
  useUpdateCampaignMutation,
} from '../store/api/endpoints/campaigns.js';

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
  create: (body: CreateCampaignBody) => Promise<CampaignDetail>;
};

/**
 * One page of campaigns. Creating one invalidates the list and Home (R-205), so every
 * mounted list and the Home counters refetch by themselves. The last good page stays on
 * screen with the error above it (38 § States).
 */
/** `enabled: false` asks nothing: a page that only sometimes shows the list (Inbox's filters). */
export function useCampaignList(query: CampaignQuery = {}, enabled = true): CampaignListController {
  const list = useLoadable(useGetCampaignsQuery(enabled ? campaignSearch(query) : skipToken));
  const [createCampaign] = useCreateCampaignMutation();

  const create = useCallback(
    (body: CreateCampaignBody) => unwrapApi(createCampaign(body)),
    [createCampaign],
  );

  return { ...list, create };
}

export type CampaignController = Loadable<CampaignDetail> & {
  reload: () => Promise<void>;
  update: (body: UpdateCampaignBody) => Promise<void>;
  launch: (key: string) => Promise<LaunchResult>;
  close: () => Promise<void>;
};

/**
 * One campaign. Each command resolves once the page can show its result, as before:
 * `update` and `close` write the server's answer into the cache; `launch` answers with the
 * link, so the campaign is re-read before the promise resolves.
 */
export function useCampaign(id: string | undefined): CampaignController {
  const campaign = useLoadable(useGetCampaignQuery(id ?? '', { skip: !id }), { current: true });
  const [updateCampaign] = useUpdateCampaignMutation();
  const [launchCampaignMutation] = useLaunchCampaignMutation();
  const [closeCampaign] = useCloseCampaignMutation();
  const { reload } = campaign;

  const update = useCallback(
    async (body: UpdateCampaignBody) => {
      await unwrapApi(updateCampaign({ id: id ?? '', body }));
    },
    [id, updateCampaign],
  );

  /**
   * Minting the token is the irreversible act, and `key` is the caller's idempotency key.
   *
   * A double-click on stage must not create two links: the QR already on screen would then
   * point at a campaign nobody is looking at (38). The server returns the FIRST response
   * for a repeated key (13 §7), and the button disables while it is in flight.
   */
  const launch = useCallback(
    async (key: string) => {
      const result = await unwrapApi(launchCampaignMutation({ id: id ?? '', key }));
      await reload();
      return result;
    },
    [id, launchCampaignMutation, reload],
  );

  const close = useCallback(async () => {
    await unwrapApi(closeCampaign(id ?? ''));
  }, [id, closeCampaign]);

  return { ...campaign, update, launch, close };
}

/**
 * The live audience count, debounced.
 *
 * NOT on RTK Query yet: no page uses it today (docs/REDUX-PLAN.md, R-202). Move it to the
 * `campaigns` endpoints, providing `{ Campaign, id }`, when one does.
 *
 * It is the visible proof that the org graph is real and not decorative — a number that
 * moves when you change a dropdown is worth more than a paragraph claiming the hierarchy is
 * wired up (38 § Interactions). 300ms, per 38 § State.
 */
export function useAudiencePreview(
  id: string | undefined,
  rule: AudienceRule,
): Loadable<AudiencePreview> {
  const [state, setState] = useState<Loadable<AudiencePreview>>({
    data: null, loading: false, error: null,
  });
  // Depend on the serialised rule rather than the object, or every render is a new rule.
  const key = JSON.stringify(rule);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    const timer = window.setTimeout(() => {
      void apiGet<{ data: AudiencePreview }>(`/campaigns/${id}/audience`)
        .then((response) => {
          if (!cancelled) setState({ data: response.data, loading: false, error: null });
        })
        .catch((error: Error) => {
          if (!cancelled) setState({ data: null, loading: false, error });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, key]);

  return state;
}

/**
 * Launch, as a plain call rather than through `useCampaign`.
 *
 * The three-step create flow has no campaign id until the moment it commits, so there is
 * nothing for a hook to have been bound to. Same endpoint, same idempotency key, same
 * guarantee — a repeated key returns the FIRST response (13 §7).
 */
export async function launchCampaign(id: string, key: string): Promise<LaunchResult> {
  const response = await apiPost<undefined, { data: LaunchResult }>(
    `/campaigns/${id}/launch`,
    undefined,
    { idempotencyKey: key },
  );
  return response.data;
}

/** A key for one launch ATTEMPT, stable across retries of that attempt. See `cloneKey`. */
export function launchKey(campaignId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `launch:${campaignId}:${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/**
 * A poll or a suggestion box, created and launched in ONE call (`DEC-088`, `DEC-089`).
 *
 * The three-step flow above is right for a feedback round, where the form, the subjects and
 * the dates are all real decisions. A poll has none of them: it is one question asked of a
 * room that is already in front of you, so the server composes template, question, subject,
 * campaign and token in a single transaction and returns the launched campaign.
 *
 * Idempotency key for the same reason `launch` carries one — this mints a public token, and
 * a double-click must not produce two links.
 */
export async function quickCreate(body: QuickCampaignBody): Promise<CampaignDetail> {
  const response = await apiPost<QuickCampaignBody, { data: CampaignDetail }>(
    '/campaigns/quick',
    body,
    { idempotencyKey: quickKey(body.name) },
  );
  return response.data;
}

/** One key per ATTEMPT, stable across retries of that attempt. See `launchKey`. */
function quickKey(name: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `quick:${name}:${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
