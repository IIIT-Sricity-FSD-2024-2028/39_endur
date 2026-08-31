// The estate list and one organisation. `70` § Data contract, `T-066` files list.
//
// Modelled on `lib/audit.ts`: a `Loadable<T>`, a FIXED-key-order search string so the effect
// dependency is stable, a cursor `loadMore` that appends rather than replaces, and a
// `forbidden` flag distinct from an empty result (`staff` reaching an owner-only query still
// gets a page — every estate capability here is `BOTH` — but the shape is kept for the same
// reason `lib/audit.ts` keeps it: a 403 is not "there is nothing").
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EnterpriseRequestRow,
  EnterpriseStatus,
  Page,
  PlatformOrgDetail,
  PlatformOrgSummary,
} from '@endur/shared';
import { OpsError, opsGet, opsPatch, opsPost } from './ops.js';

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

/**
 * THE ENTERPRISE QUEUE — DEC-100, T-100, 70 § The Enterprise queue.
 *
 * NOT ASKED FOR WITHOUT THE CAPABILITY. `platform.enterprise.read` is owner-only, and a
 * request nobody may answer is a request not worth making — the rule `/ops` already applies
 * to the analytics tab.
 *
 * NOT PAGINATED. If this queue ever needs a second page, Endur has a sales problem it would
 * rather have; a cursor here would be machinery for a list that is empty most weeks.
 */
export function useEnterpriseQueue(enabled: boolean): {
  rows: EnterpriseRequestRow[];
  loading: boolean;
  /** The last failure, for the page to render. NEVER swallowed — see below. */
  error: string | null;
  update: (id: string, status: EnterpriseStatus) => Promise<void>;
  approve: (id: string) => Promise<void>;
} {
  const [rows, setRows] = useState<EnterpriseRequestRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      // OPEN **AND** CONTACTED. The queue is what is outstanding, and a customer somebody has
      // rung once is still outstanding until the sale is made or dropped. Fetching only `open`
      // is what made "Contacted" look like it did nothing: the row vanished, which reads as a
      // failed click rather than as progress.
      const [open, contacted] = await Promise.all([
        opsGet<{ data: EnterpriseRequestRow[] }>('/enterprise-requests?status=open'),
        opsGet<{ data: EnterpriseRequestRow[] }>('/enterprise-requests?status=contacted'),
      ]);
      setRows([...open.data, ...contacted.data].sort((a, b) => a.at.localeCompare(b.at)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof OpsError ? caught.message : 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * THE FAILURE IS KEPT, and that is the fix for the bug this shipped with.
   *
   * Every one of these used to `await` a request whose rejection nobody caught — the page
   * called `void queue.update(...).finally(...)` with no `.catch`, so a 403, a 409 or a 500
   * produced an unhandled promise rejection and **nothing at all on screen**. The operator
   * pressed Contacted and the row sat there. A write that can fail silently is worse than one
   * that fails loudly, because the second kind gets reported.
   */
  const run = useCallback(
    async (work: () => Promise<void>) => {
      setError(null);
      try {
        await work();
      } catch (caught) {
        setError(caught instanceof OpsError ? caught.message : 'That did not go through.');
        // Re-read rather than guess. A refused write leaves the server's rows where they were,
        // and a local list patched on the assumption it succeeded is a list that lies.
        await load();
      }
    },
    [load],
  );

  const update = useCallback(
    (id: string, status: EnterpriseStatus) =>
      run(async () => {
        const response = await opsPatch<{ status: EnterpriseStatus }, { data: EnterpriseRequestRow }>(
          `/enterprise-requests/${id}`,
          { status },
        );
        // `closed` LEAVES THE QUEUE; `contacted` STAYS IN IT WITH ITS NEW STATE. The queue is
        // outstanding work, and the whole point of the Contacted verb is to record progress on
        // something still outstanding — dropping the row would make the two buttons do the
        // same visible thing.
        setRows((current) =>
          response.data.status === 'closed'
            ? current.filter((row) => row.id !== id)
            : current.map((row) => (row.id === id ? response.data : row)),
        );
      }),
    [run],
  );

  const approve = useCallback(
    (id: string) =>
      run(async () => {
        await opsPost<undefined, { data: EnterpriseRequestRow }>(
          `/enterprise-requests/${id}/approve`,
        );
        // Approving closes the request AND moves the plan, so the row leaves the queue.
        setRows((current) => current.filter((row) => row.id !== id));
      }),
    [run],
  );

  return { rows, loading, error, update, approve };
}

