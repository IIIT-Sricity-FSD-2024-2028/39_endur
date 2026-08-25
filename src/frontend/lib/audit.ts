// The activity log, client side. 56 § State, 23 §3.
//
// Local state, and no polling. This is a RECORD, not a monitor: `72` is the monitor, and a
// log that re-fetches under the reader moves the row they were reading. The one control
// that refreshes it is the one they press.
//
// Every filter and the cursor live in the URL, so a filtered log is linkable — *"here is
// the row I mean"* pasted into a chat is the whole reason two people open this page
// together.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditEntry, Page } from '@endur/shared';
import { ApiError, apiGet } from './api.js';
import type { Loadable } from './org.js';

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
 * A FIXED key order, so the string is a stable effect dependency. Building it from
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

export function useAudit(filters: AuditFilters, enabled = true): AuditController {
  const [state, setState] = useState<Loadable<Page<AuditEntry>>>({
    data: null,
    loading: true,
    error: null,
  });
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  const search = auditSearch(filters);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await apiGet<Page<AuditEntry>>(`/audit${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setRows(page.data);
      setState({ data: page, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof ApiError ? error.status : 0;
      setForbidden(status === 403);
      setRows([]);
      setState({ data: null, loading: false, error: status === 403 ? null : (error as Error) });
    }
  }, [search, enabled]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    const cursor = state.data?.page.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const joiner = search ? '&' : '?';
      const next = await apiGet<Page<AuditEntry>>(
        `/audit${search}${joiner}cursor=${encodeURIComponent(cursor)}`,
      );
      if (!alive.current) return;
      // Appended, never replaced. The rows already on screen are the ones being read.
      setRows((current) => [...current, ...next.data]);
      setState({ data: next, loading: false, error: null });
    } catch (error) {
      if (alive.current) setState((current) => ({ ...current, error: error as Error }));
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }, [search, state.data, loadingMore]);

  return { ...state, rows, forbidden, loadMore, loadingMore, reload: load };
}
