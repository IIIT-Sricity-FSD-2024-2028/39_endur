// `/ops/logs` — `72` § State, `T-078`. Modelled on `lib/audit.ts` and `lib/estate.ts`: a
// `Loadable<T>`, a fixed-key-order search string so the cache key is stable, and a
// `forbidden` flag distinct from an empty result. The reads are on RTK Query since R-505.
// The export is a download (a file, not JSON), run by the `logExported` thunk in
// `store/screens/operator.ts` (DEC-R03) with the same search string as the view.
//
// NO POLLING, NO LIVE TAIL (`72` § Out of scope). The one control that refreshes a file is
// the one the reader presses.
import { useCallback, useMemo } from 'react';
import type { LogFileMeta, LogLine, LogStoreMeta, Page } from '@endur/shared';
import { OpsError } from './ops.js';
import type { Loadable } from './estate.js';
import { useGetLogFilesQuery, useGetLogLinesInfiniteQuery } from '../store/api/endpoints/ops.js';
import { useLoadable } from './query.js';

export type LogFilter = {
  level?: number | undefined;
  status?: number | undefined;
  path?: string | undefined;
  orgId?: string | undefined;
  requestId?: string | undefined;
  q?: string | undefined;
};

export function useLogFiles(): Loadable<LogFileMeta[]> & { forbidden: boolean; store: LogStoreMeta | null } {
  const files = useLoadable(useGetLogFilesQuery());
  const forbidden = files.error instanceof OpsError && files.error.status === 403;
  return {
    data: forbidden ? null : files.data?.data ?? null,
    loading: files.loading,
    error: forbidden ? null : files.error,
    forbidden,
    store: files.data?.meta ?? null,
  };
}

/**
 * Fixed key order — the same fix every other `/ops` search string needed. Exported because the
 * export uses it too (DEC-074): the file that lands on disk is the one that was on screen.
 */
export function logSearch(filter: LogFilter, cursor?: string): string {
  const params = new URLSearchParams();
  for (const key of ['level', 'status', 'path', 'orgId', 'requestId', 'q'] as const) {
    const value = filter[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export type LogLinesController = Loadable<Page<LogLine>> & {
  forbidden: boolean;
  notFound: boolean;
  rows: LogLine[];
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  reload: () => Promise<void>;
};

export function useLogLines(file: string | null, filter: LogFilter): LogLinesController {
  const query = useGetLogLinesInfiniteQuery(
    { file: file ?? '', search: file ? logSearch(filter) : '' },
    { skip: !file },
  );
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = query;
  // Another file or filter never shows this one's lines.
  const pages = query.currentData?.pages;
  const last = pages?.at(-1);
  const rows = useMemo(() => pages?.flatMap((page) => page.data) ?? [], [pages]);

  const loaded = useLoadable({
    ...query,
    isFetching: isFetching && !isFetchingNextPage,
    data: last,
    currentData: last,
  });

  /** Appended, never replaced — newest-first pages keep growing downward as the reader
   *  scrolls further into the past. */
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  if (!file) {
    return {
      data: null, loading: false, error: null, rows: [], forbidden: false, notFound: false,
      loadMore, loadingMore: false, reload: loaded.reload,
    };
  }
  const status = loaded.error instanceof OpsError ? loaded.error.status : 0;
  // `72` § States — "That file has rotated away", not a generic error, since it is the
  // expected outcome at midnight and at 10 MB rather than a real failure.
  const forbidden = status === 403;
  const notFound = status === 404;
  const gated = forbidden || notFound;
  return {
    ...loaded,
    ...(gated ? { data: null, error: null } : {}),
    rows: gated ? [] : rows,
    forbidden,
    notFound,
    loadMore,
    loadingMore: isFetchingNextPage,
  };
}
