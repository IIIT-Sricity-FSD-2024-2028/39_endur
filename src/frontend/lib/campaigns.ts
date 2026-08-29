// Campaigns — reads and writes. 38 § Data contract, 23 §3.
//
// The one thing worth knowing before editing this file: **status is never sent and never
// stored** (DEC-016). It arrives derived on every read, so there is no `setStatus`, no state
// machine here, and `Cancel schedule` is a PATCH that clears `startsAt` rather than a
// transition backwards.
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

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

export function useCampaignList(query: CampaignQuery = {}): CampaignListController {
  const [state, setState] = useState<Loadable<Page<CampaignSummary>>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);
  const search = campaignSearch(query);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (path: string) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await apiGet<Page<CampaignSummary>>(`/campaigns${path}`);
      if (alive.current) setState({ data: page, loading: false, error: null });
    } catch (error) {
      // The last good page stays on screen with the error above it (38 § States).
      if (alive.current) setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  const create = useCallback(async (body: CreateCampaignBody) => {
    const response = await apiPost<CreateCampaignBody, { data: CampaignDetail }>('/campaigns', body);
    return response.data;
  }, []);

  return { ...state, reload: () => load(search), create };
}

export type CampaignController = Loadable<CampaignDetail> & {
  reload: () => Promise<void>;
  update: (body: UpdateCampaignBody) => Promise<void>;
  launch: (key: string) => Promise<LaunchResult>;
  close: () => Promise<void>;
};

export function useCampaign(id: string | undefined): CampaignController {
  const [state, setState] = useState<Loadable<CampaignDetail>>({
    data: null, loading: true, error: null,
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await apiGet<{ data: CampaignDetail }>(`/campaigns/${id}`);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (body: UpdateCampaignBody) => {
      await apiPatch<UpdateCampaignBody, { data: CampaignDetail }>(`/campaigns/${id ?? ''}`, body);
      await load();
    },
    [id, load],
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
      const response = await apiPost<undefined, { data: LaunchResult }>(
        `/campaigns/${id ?? ''}/launch`,
        undefined,
        { idempotencyKey: key },
      );
      await load();
      return response.data;
    },
    [id, load],
  );

  const close = useCallback(async () => {
    await apiPost<undefined, { data: CampaignDetail }>(`/campaigns/${id ?? ''}/close`);
    await load();
  }, [id, load]);

  return { ...state, reload: load, update, launch, close };
}

/**
 * The live audience count, debounced.
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
