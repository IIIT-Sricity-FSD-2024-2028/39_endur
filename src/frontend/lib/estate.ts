// The estate list and one organisation. `70` § Data contract, `T-066` files list.
//
// Modelled on `lib/audit.ts`: a `Loadable<T>`, a FIXED-key-order search string so the effect
// dependency is stable, a cursor `loadMore` that appends rather than replaces, and a
// `forbidden` flag distinct from an empty result (`staff` reaching an owner-only query still
// gets a page — every estate capability here is `BOTH` — but the shape is kept for the same
// reason `lib/audit.ts` keeps it: a 403 is not "there is nothing").
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, PlatformOrgDetail, PlatformOrgSummary } from '@endur/shared';
import { OpsError, opsGet } from './ops.js';

export type Loadable<T> = { data: T | null; loading: boolean; error: Error | null };

export type EstateFilters = {
  tier?: string | undefined;
  status?: string | undefined;
  industry?: string | undefined;
  q?: string | undefined;
};

export type EstateController = Loadable<Page<PlatformOrgSummary>> & {
  forbidden: boolean;
  rows: PlatformOrgSummary[];
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  reload: () => Promise<void>;
};

/** A fixed key order, so the string is a stable effect dependency (the same fix
 *  `lib/audit.ts` and `lib/analysis.ts` needed). */
export function estateSearch(filters: EstateFilters): string {
  const params = new URLSearchParams();
  for (const key of ['tier', 'status', 'industry', 'q'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function useEstate(filters: EstateFilters): EstateController {
  const [state, setState] = useState<Loadable<Page<PlatformOrgSummary>>>({
    data: null,
    loading: true,
    error: null,
  });
  const [rows, setRows] = useState<PlatformOrgSummary[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  const search = estateSearch(filters);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await opsGet<Page<PlatformOrgSummary>>(`/orgs${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setRows(page.data);
      setState({ data: page, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof OpsError ? error.status : 0;
      setForbidden(status === 403);
      setState((current) => ({
        data: status === 403 ? current.data : null,
        loading: false,
        error: status === 403 ? null : (error as Error),
      }));
    }
  }, [search]);

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
      const next = await opsGet<Page<PlatformOrgSummary>>(
        `/orgs${search}${joiner}cursor=${encodeURIComponent(cursor)}`,
      );
      if (!alive.current) return;
      // Appended, not replaced — the estate list DIMS AND STAYS while loading (`70` §
      // States); a load-more that replaced the page would throw away the operator's scroll.
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

export function useOrgDetail(id: string | undefined): Loadable<PlatformOrgDetail> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<PlatformOrgDetail>>({
    data: null,
    loading: true,
    error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await opsGet<{ data: PlatformOrgDetail }>(`/orgs/${id}`);
      if (!alive.current) return;
      setForbidden(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof OpsError ? error.status : 0;
      setForbidden(status === 403);
      setState({ data: null, loading: false, error: status === 403 ? null : (error as Error) });
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, forbidden, reload: load };
}
