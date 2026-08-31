// Results — reads only. 40 § Data contract, 23 §3.
//
// Three endpoints and one rule that governs all of them: **the server decides what this
// screen may see.** The k-anonymity gate arrives as `suppressed: true` with no `questions`
// key at all, and there is deliberately nothing here that could reconstruct one. A client
// cannot render what it was never sent, which is the difference between a privacy guarantee
// and a UI convention (52 §2).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, ResponseItem, ResultsQuery, ResultsView } from '@endur/shared';
import { ApiError, apiGet } from './api.js';
import type { Loadable } from './org.js';

/**
 * Ten seconds, and a manual Refresh button beside it anyway (40 § State).
 *
 * Auto-refresh is the single thing most likely to be flaky on venue wifi, and the demo beat
 * — evaluator scans, submits, the number moves — cannot depend on a timer nobody can see.
 */
export const POLL_MS = 10_000;

export function resultsSearch(filters: ResultsQuery): string {
  const params = new URLSearchParams();
  if (filters.subjectId) params.set('subjectId', filters.subjectId);
  if (filters.unitId) params.set('unitId', filters.unitId);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export type ResultsController = Loadable<ResultsView> & {
  reload: () => Promise<void>;
  /** How many responses appeared on the most recent poll. Drives the "landed" moment. */
  arrived: number;
  /** True while a poll is in flight, so Refresh can show it without blanking the page. */
  refreshing: boolean;
};

export function useResults(
  campaignId: string | undefined,
  filters: ResultsQuery = {},
): ResultsController {
  const [state, setState] = useState<Loadable<ResultsView>>({
    data: null, loading: true, error: null,
  });
  const [arrived, setArrived] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const search = resultsSearch(filters);
  const alive = useRef(true);
  /** Guards the timer: a slow request must not stack a second one behind it. */
  const inFlight = useRef(false);
  const lastCount = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!campaignId || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const response = await apiGet<{ data: ResultsView }>(
        `/campaigns/${campaignId}/results${search}`,
      );
      if (!alive.current) return;
      const previous = lastCount.current;
      lastCount.current = response.data.responseCount;
      // First load is never an arrival. 612 responses appearing "just now" because the page
      // opened would make the one number on this screen that must be trusted look invented.
      setArrived(previous === null ? 0 : Math.max(0, response.data.responseCount - previous));
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      // THE LAST GOOD DATA STAYS VISIBLE (40 § States). A failed poll on venue wifi must not
      // blank a screen somebody is presenting from.
      setState((current) => ({ ...current, loading: false, error: error as Error }));
    } finally {
      inFlight.current = false;
      if (alive.current) setRefreshing(false);
    }
  }, [campaignId, search]);

  useEffect(() => {
    alive.current = true;
    lastCount.current = null;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);

  return { ...state, reload: load, arrived, refreshing };
}

export type ResponsesController = Loadable<Page<ResponseItem>> & {
  suppressed: boolean;
  /** Absent capability, not an empty list — the section is removed rather than greyed. */
  forbidden: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * The comments, behind their own capability.
 *
 * A 403 here is not an error to render — `40` § States says the section is **absent**, with
 * the aggregates still on screen. Seeing that the average is 4.3 and reading what one person
 * wrote are different levels of access, and this is what that looks like on the page.
 */
export function useResponses(campaignId: string | undefined, enabled = true): ResponsesController {
  const [state, setState] = useState<Loadable<Page<ResponseItem>>>({
    data: null, loading: true, error: null,
  });
  const [suppressed, setSuppressed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(true);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!campaignId || !enabled) return;
      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await apiGet<Page<ResponseItem> & { suppressed: boolean }>(
          `/campaigns/${campaignId}/responses${query}`,
        );
        if (!alive.current) return;
        setSuppressed(response.suppressed);
        setState((current) => ({
          data: cursor && current.data
            ? { ...response, data: [...current.data.data, ...response.data] }
            : response,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (!alive.current) return;
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          setForbidden(true);
          setState({ data: null, loading: false, error: null });
          return;
        }
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    },
    [campaignId, enabled],
  );

  useEffect(() => {
    alive.current = true;
    void fetchPage();
    return () => {
      alive.current = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    const cursor = state.data?.page.nextCursor;
    if (cursor) await fetchPage(cursor);
  }, [fetchPage, state.data]);

  return { ...state, suppressed, forbidden, loadMore, reload: () => fetchPage() };
}

export type ExportResult = { filename: string; csv: string };

/**
 * Fetched through the API client rather than linked to directly.
 *
 * An `<a href="/api/v1/…/export">` would be one line, and it would answer a `402 PAYMENT
 * REQUIRED` — export is a Silver feature (`16` §3) — by navigating the reader to a page of
 * raw JSON. Reading it here means the plan message lands inline, where it can be acted on.
 */
export async function fetchExport(campaignId: string): Promise<ExportResult> {
  const csv = await apiGet<string>(`/campaigns/${campaignId}/export`);
  return { filename: `${campaignId}-results.csv`, csv };
}

/** Hands the browser a file. Separated from the fetch so the fetch stays testable. */
export function saveCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
