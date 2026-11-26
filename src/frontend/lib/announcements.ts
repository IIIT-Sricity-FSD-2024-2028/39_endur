// Announcements, client side. 13 § Announcements, 23 §3, T-094.
//
// No polling, like `lib/audit.ts`: an announcement list is a record of what was sent, not a
// monitor, and a list that re-fetches under the reader moves the row they were reading.
//
// Reads only. They are on RTK Query since R-501 (`store/api/endpoints/announcements.ts`):
// the list page and Home's banner share one cache entry. The writes (save, publish, delete,
// mark read) are thunks over its mutations: `store/screens/announcements.ts`, and Home's
// `announcementDismissed` (DEC-R03).
//
// THE RECIPIENT COUNT COMES FROM THE SERVER. `useRecipientCount` asks the API for it as
// the composer's audience changes rather than counting the org tree in the browser — the
// number on screen has to be the number of receipts publish will write, and there is only
// one resolver that knows (`features/campaigns/audience.ts`).
import type { AnnouncementSummary } from '@endur/shared';
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

/**
 * How many people the composer's audience reaches, from the server. `rule` is the audience
 * as JSON once it has settled (the composer debounces it, `composerAudienceSettled`), so a
 * select changed five times asks once. `null` means "not known yet", and the composer says
 * so rather than printing a zero it does not believe.
 *
 * Silent on failure: this is a number beside a form, and an error banner for a count the
 * reader did not ask for would be louder than the fact it reports.
 */
export function useRecipientCount(rule: string | null): number | null {
  return useGetRecipientCountQuery(rule ?? '', { skip: rule === null }).currentData ?? null;
}
