// Results — reads only. 40 § Data contract, 23 §3.
//
// Three endpoints and one rule that governs all of them: **the server decides what this
// screen may see.** The k-anonymity gate arrives as `suppressed: true` with no `questions`
// key at all, and there is deliberately nothing here that could reconstruct one. A client
// cannot render what it was never sent, which is the difference between a privacy guarantee
// and a UI convention (52 §2).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Page, ResponseItem, ResultsQuery, ResultsView } from '@endur/shared';
import { apiGet } from './api.js';
import { useLoadable, type Loadable } from './query.js';
import { isSerializedApiError } from '../store/api/errors.js';
import {
  useGetResponsesInfiniteQuery,
  useGetResultsQuery,
} from '../store/api/endpoints/results.js';

/**
 * Ten seconds, and a manual Refresh button beside it anyway (40 § State).
 *
 * Auto-refresh is the single thing most likely to be flaky on venue wifi, and the demo beat
 * — evaluator scans, submits, the number moves — cannot depend on a timer nobody can see.
 *
 * It polls whether or not the window has focus (no `skipPollingIfUnfocused`): a presenter
 * who clicks over to another app while the evaluator's phone submits must still see the
 * number move when they look back.
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

/**
 * The aggregates, polled (R-203). RTK Query's `pollingInterval` replaces the timer, and it
 * never stacks a second request behind a slow one, which was the in-flight guard here.
 * THE LAST GOOD DATA STAYS VISIBLE (40 § States): a failed poll on venue wifi must not
 * blank a screen somebody is presenting from, and `data` keeps it.
 */
export function useResults(
  campaignId: string | undefined,
  filters: ResultsQuery = {},
): ResultsController {
  const search = resultsSearch(filters);
  const query = useGetResultsQuery(
    { campaignId: campaignId ?? '', search },
    { skip: !campaignId, pollingInterval: POLL_MS },
  );
  const results = useLoadable(query);

  // Counted per ANSWER, not per change: a poll that brings nothing new resets it to 0.
  // The first answer seen for a campaign and filter is never an arrival — 612 responses
  // appearing "just now" because the page opened would make the one number on this screen
  // that must be trusted look invented.
  const [arrived, setArrived] = useState(0);
  const lastSeen = useRef<{ key: string; count: number } | null>(null);
  const key = `${campaignId ?? ''}${search}`;
  const count = query.data?.responseCount;
  const answeredAt = query.fulfilledTimeStamp;
  useEffect(() => {
    if (count === undefined || answeredAt === undefined) return;
    const before = lastSeen.current?.key === key ? lastSeen.current.count : null;
    lastSeen.current = { key, count };
    setArrived(before === null ? 0 : Math.max(0, count - before));
  }, [key, count, answeredAt]);

  return { ...results, arrived, refreshing: query.isFetching };
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
  const query = useGetResponsesInfiniteQuery(campaignId ?? '', { skip: !campaignId || !enabled });
  const { fetchNextPage, hasNextPage, isFetching } = query;
  const pages = query.data?.pages;

  // The loaded pages as ONE page, the shape the page renders: every row so far, and the
  // cursor and total from the newest page.
  const data = useMemo(() => {
    const last = pages?.at(-1);
    if (!pages || !last) return undefined;
    const { suppressed: _suppressed, ...page } = last;
    return { ...page, data: pages.flatMap((each) => each.data) };
  }, [pages]);

  const forbidden =
    isSerializedApiError(query.error) && (query.error.status === 403 || query.error.status === 404);
  const loaded = useLoadable({ ...query, data, currentData: data });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  return {
    ...loaded,
    ...(forbidden ? { data: null, error: null } : {}),
    suppressed: pages?.at(-1)?.suppressed ?? false,
    forbidden,
    loadMore,
  };
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
