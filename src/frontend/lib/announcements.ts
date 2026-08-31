// Announcements, client side. 13 § Announcements, 23 §3, T-094.
//
// Local state and no polling, like `lib/audit.ts`: an announcement list is a record of what
// was sent, not a monitor, and a list that re-fetches under the reader moves the row they
// were reading. The banner on Home reloads when it is dismissed and not otherwise.
//
// THE RECIPIENT COUNT COMES FROM THE SERVER. `useRecipientPreview` asks the API for it as
// the composer's audience changes rather than counting the org tree in the browser — the
// number on screen has to be the number of receipts publish will write, and there is only
// one resolver that knows (`features/campaigns/audience.ts`).
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnnouncementPreview,
  AnnouncementSummary,
  AudienceRule,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from '@endur/shared';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type AnnouncementController = Loadable<AnnouncementSummary[]> & {
  rows: AnnouncementSummary[];
  /** Absent capability, not an empty list — the page renders a 403, never "nothing yet". */
  forbidden: boolean;
  reload: () => Promise<void>;
};

export function useAnnouncements(enabled = true): AnnouncementController {
  const [state, setState] = useState<Loadable<AnnouncementSummary[]>>({
    data: null,
    loading: enabled,
    error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await apiGet<{ data: AnnouncementSummary[] }>('/announcements');
      if (!alive.current) return;
      setForbidden(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof ApiError ? error.status : 0;
      setForbidden(status === 403);
      setState({ data: null, loading: false, error: status === 403 ? null : (error as Error) });
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, rows: state.data ?? [], forbidden, reload: load };
}

export const createAnnouncement = async (
  body: CreateAnnouncementBody,
): Promise<AnnouncementSummary> =>
  (await apiPost<CreateAnnouncementBody, { data: AnnouncementSummary }>('/announcements', body))
    .data;

export const updateAnnouncement = async (
  id: string,
  body: UpdateAnnouncementBody,
): Promise<AnnouncementSummary> =>
  (
    await apiPatch<UpdateAnnouncementBody, { data: AnnouncementSummary }>(
      `/announcements/${id}`,
      body,
    )
  ).data;

/**
 * Publish, with the caller's idempotency key.
 *
 * The same shape as `launchCampaign`, and for the same reason: this is the irreversible act,
 * and a double-click must write ONE set of receipts. The server returns the first response
 * for a repeated key (13 §7).
 */
export const publishAnnouncement = async (
  id: string,
  key: string,
): Promise<AnnouncementSummary> =>
  (
    await apiPost<undefined, { data: AnnouncementSummary }>(
      `/announcements/${id}/publish`,
      undefined,
      { idempotencyKey: key },
    )
  ).data;

export const publishKey = (id: string): string => `announcement-publish-${id}`;

export const deleteAnnouncement = (id: string): Promise<void> =>
  apiDelete(`/announcements/${id}`);

/** Marks the caller's OWN receipt. There is no id here but the announcement's. */
export const markAnnouncementRead = (id: string): Promise<void> =>
  apiPost<undefined, void>(`/announcements/${id}/read`);

/**
 * The live recipient count, debounced.
 *
 * Debounced for the reason `useAudiencePreview` is: the audience changes on every keystroke
 * in a select, and one request per change would put a queue of stale answers behind the
 * current one. `null` means "not known yet" and the composer says so rather than printing a
 * zero it does not believe.
 */
export function useRecipientPreview(rule: AudienceRule, enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);
  // Serialised, so the effect re-runs on a CHANGE of rule rather than on every render — a
  // fresh object literal from the parent is a new identity every time.
  const key = JSON.stringify(rule);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setCount(null);
    const timer = setTimeout(() => {
      void apiPost<{ audience: AudienceRule }, { data: AnnouncementPreview }>(
        '/announcements/preview',
        { audience: JSON.parse(key) as AudienceRule },
      )
        .then((response) => {
          if (alive) setCount(response.data.recipients);
        })
        // Silent: this is a number beside a form, and an error banner for a count the
        // reader did not ask for would be louder than the fact it reports.
        .catch(() => undefined);
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, enabled]);

  return count;
}
