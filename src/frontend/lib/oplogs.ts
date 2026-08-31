// `/ops/logs` — `72` § State, `T-078`. Modelled on `lib/audit.ts` and `lib/estate.ts`: a
// `Loadable<T>`, a fixed-key-order search string so the effect dependency is stable, and a
// `forbidden` flag distinct from an empty result.
//
// NO POLLING, NO LIVE TAIL (`72` § Out of scope). The one control that refreshes a file is
// the one the reader presses.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogFileMeta, LogLine, LogStoreMeta, Page } from '@endur/shared';
import { OpsError, opsDownload, opsGet } from './ops.js';
import type { Loadable } from './estate.js';

export type LogFilter = {
  level?: number | undefined;
  status?: number | undefined;
  path?: string | undefined;
  orgId?: string | undefined;
  requestId?: string | undefined;
  q?: string | undefined;
};

/**
 * `DEC-074` — the export. Same filters as the view, so what lands on the operator's disk is
 * what was on their screen; `logSearch` is reused rather than copied for exactly that reason.
 */
export function useLogExport(): {
  run: (file: string, filter: LogFilter, format: 'ndjson' | 'csv') => Promise<void>;
  busy: boolean;
  error: Error | null;
  last: { name: string; lines: number; truncated: boolean } | null;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [last, setLast] = useState<{ name: string; lines: number; truncated: boolean } | null>(null);

  const run = useCallback(async (file: string, filter: LogFilter, format: 'ndjson' | 'csv') => {
    setBusy(true);
    setError(null);
    try {
      const search = logSearch(filter);
      const joiner = search ? '&' : '?';
      const result = await opsDownload(`/logs/${encodeURIComponent(file)}/export${search}${joiner}format=${format}`);
      setLast(result);
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, last };
}

export function useLogFiles(): Loadable<LogFileMeta[]> & { forbidden: boolean; store: LogStoreMeta | null } {
  const [state, setState] = useState<Loadable<LogFileMeta[]>>({ data: null, loading: true, error: null });
  const [forbidden, setForbidden] = useState(false);
  const [store, setStore] = useState<LogStoreMeta | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setState((current) => ({ ...current, loading: true }));
    opsGet<{ data: LogFileMeta[]; meta?: LogStoreMeta }>('/logs')
      .then((response) => {
        if (!alive.current) return;
        setForbidden(false);
        setStore(response.meta ?? null);
        setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        const status = error instanceof OpsError ? error.status : 0;
        setForbidden(status === 403);
        setState({ data: null, loading: false, error: status === 403 ? null : (error as Error) });
      });
    return () => {
      alive.current = false;
    };
  }, []);

  return { ...state, forbidden, store };
}

/** Fixed key order — the same fix every other `/ops` search string needed. */
function logSearch(filter: LogFilter, cursor?: string): string {
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
  const [state, setState] = useState<Loadable<Page<LogLine>>>({ data: null, loading: true, error: null });
  const [rows, setRows] = useState<LogLine[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  const search = file ? logSearch(filter) : '';

  const load = useCallback(async () => {
    if (!file) {
      setState({ data: null, loading: false, error: null });
      setRows([]);
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await opsGet<Page<LogLine>>(`/logs/${encodeURIComponent(file)}${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setNotFound(false);
      setRows(page.data);
      setState({ data: page, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof OpsError ? error.status : 0;
      setForbidden(status === 403);
      // `72` § States — "That file has rotated away", not a generic error, since it is the
      // expected outcome at midnight and at 10 MB rather than a real failure.
      setNotFound(status === 404);
      setRows([]);
      setState({
        data: null,
        loading: false,
        error: status === 403 || status === 404 ? null : (error as Error),
      });
    }
  }, [file, search]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    const cursor = state.data?.page.nextCursor;
    if (!file || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await opsGet<Page<LogLine>>(`/logs/${encodeURIComponent(file)}${logSearch(filter, cursor)}`);
      if (!alive.current) return;
      // Appended, never replaced — newest-first pages keep growing downward as the reader
      // scrolls further into the past.
      setRows((current) => [...current, ...next.data]);
      setState({ data: next, loading: false, error: null });
    } catch (error) {
      if (alive.current) setState((current) => ({ ...current, error: error as Error }));
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }, [file, filter, state.data, loadingMore]);

  return { ...state, rows, forbidden, notFound, loadMore, loadingMore, reload: load };
}
