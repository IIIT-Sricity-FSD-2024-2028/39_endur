// Announcements, client side. 13 § Announcements, 23 §3, T-094.
//
// No polling, like `lib/audit.ts`: an announcement list is a record of what was sent, not a
// monitor, and a list that re-fetches under the reader moves the row they were reading.
//
// The reads are on RTK Query since R-501 (`store/api/endpoints/announcements.ts`): the list
// page and Home's banner share one cache entry. The writes stay plain calls through the
// same client, and every caller re-reads after one, as before; turning them into hooks
// would change three pages and their tests for no difference anybody would see.
//
// THE RECIPIENT COUNT COMES FROM THE SERVER. `useRecipientPreview` asks the API for it as
// the composer's audience changes rather than counting the org tree in the browser — the
// number on screen has to be the number of receipts publish will write, and there is only
// one resolver that knows (`features/campaigns/audience.ts`).
import { useEffect, useState } from 'react';
import type {
  AnnouncementSummary,
  AudienceRule,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from '@endur/shared';
import { apiDelete, apiPatch, apiPost } from './api.js';
import { isSerializedApiError } from '../store/api/errors.js';
import {
  useGetAnnouncementsQuery,
  useGetRecipientCountQuery,
} from '../store/api/endpoints/announcements.js';
import { useLoadable, type Loadable } from './query.js';

export type AnnouncementController = Loadable<AnnouncementSummary[]> & {
  rows: AnnouncementSummary[];
  /** Absent capability, not an empty list — the page renders a 403, never "nothing yet". */
  forbidden: boolean;
  reload: () => Promise<void>;
};

export function useAnnouncements(enabled = true): AnnouncementController {
  const query = useGetAnnouncementsQuery(undefined, { skip: !enabled });
  const list = useLoadable(query);
  // A 403 is an answer, not a failure: the page renders a refusal, never "nothing yet".
  const forbidden = isSerializedApiError(query.error) && query.error.status === 403;
  if (!enabled) return { data: null, loading: false, error: null, rows: [], forbidden: false, reload: list.reload };
  if (forbidden) return { data: null, loading: list.loading, error: null, rows: [], forbidden, reload: list.reload };
  return { ...list, rows: list.data ?? [], forbidden };
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
  // Serialised, so a CHANGE of rule is what counts rather than every render — a fresh
  // object literal from the parent is a new identity every time.
  const key = JSON.stringify(rule);
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setSettled(key), 250);
    return () => clearTimeout(timer);
  }, [key, enabled]);

  // Silent on failure: this is a number beside a form, and an error banner for a count the
  // reader did not ask for would be louder than the fact it reports.
  const { currentData } = useGetRecipientCountQuery(settled ?? '', { skip: !enabled || settled === null });
  // Until the rule on screen has settled and been answered, the count is "not known yet".
  return enabled && settled === key ? currentData ?? null : null;
}
