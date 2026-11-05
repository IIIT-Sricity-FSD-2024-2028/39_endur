// The activity log, client side. 56 § State, 23 §3.
//
// No polling. This is a RECORD, not a monitor: `72` is the monitor, and a log that
// re-fetches under the reader moves the row they were reading. The one control that
// refreshes it is the one they press. On RTK Query since R-502: "Load older" is an infinite
// query (`store/api/endpoints/audit.ts`).
//
// Every filter and the cursor live in the URL, so a filtered log is linkable — *"here is
// the row I mean"* pasted into a chat is the whole reason two people open this page
// together.
import { useCallback, useMemo } from 'react';
import type { AuditEntry, Page } from '@endur/shared';
import { isSerializedApiError } from '../store/api/errors.js';
import { useGetAuditInfiniteQuery } from '../store/api/endpoints/audit.js';
import { useLoadable, type Loadable } from './query.js';

export type AuditFilters = {
  actorId?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  outcome?: 'allowed' | 'denied' | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export type AuditController = Loadable<Page<AuditEntry>> & {
  /** Absent capability, not an empty log — the page renders a 403, never "nothing yet". */
  forbidden: boolean;
  rows: AuditEntry[];
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  reload: () => Promise<void>;
};

/**
 * A FIXED key order, so the string is a stable cache key. Building it from
 * `Object.entries` would reorder whenever a caller built the object differently and
 * re-fetch for nothing (the same fix `lib/analysis.ts` needed).
 */
export function auditSearch(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const key of ['actorId', 'action', 'targetType', 'outcome', 'from', 'to'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The log. `data` is the newest page (its cursor, its total); `rows` is every row loaded
 * so far. Other filters never show this filter's rows while they load.
 */
export function useAudit(filters: AuditFilters, enabled = true): AuditController {
  const query = useGetAuditInfiniteQuery(auditSearch(filters), { skip: !enabled });
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = query;
  const pages = query.currentData?.pages;
  const last = pages?.at(-1);
  const rows = useMemo(() => pages?.flatMap((page) => page.data) ?? [], [pages]);

  const loaded = useLoadable({
    ...query,
    // "Load older" has its own flag; the log itself is not reloading.
    isFetching: isFetching && !isFetchingNextPage,
    data: last,
    currentData: last,
  });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  if (!enabled) {
    return { data: null, loading: false, error: null, rows: [], forbidden: false, loadMore, loadingMore: false, reload: loaded.reload };
  }
  // Absent capability, not an empty log: the page renders a 403, never "nothing yet".
  const forbidden = isSerializedApiError(query.error) && query.error.status === 403;
  return {
    ...loaded,
    ...(forbidden ? { data: null, error: null } : {}),
    rows: forbidden ? [] : rows,
    forbidden,
    loadMore,
    loadingMore: isFetchingNextPage,
  };
}
