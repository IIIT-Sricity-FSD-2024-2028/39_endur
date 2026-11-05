// The estate list and one organisation. `70` § Data contract, `T-066` files list.
//
// Modelled on `lib/audit.ts`: a `Loadable<T>`, a FIXED-key-order search string so the cache
// key is stable, a cursor `loadMore` that appends rather than replaces, and a `forbidden`
// flag distinct from an empty result (`staff` reaching an owner-only query still gets a
// page — every estate capability here is `BOTH` — but the shape is kept for the same reason
// `lib/audit.ts` keeps it: a 403 is not "there is nothing").
//
// On RTK Query since R-505, over the operator API (`store/api/opsApi.ts`): the estate's
// loaded pages survive a look at one organisation and back.
import { useCallback, useMemo, useState } from 'react';
import type {
  EnterpriseRequestRow,
  EnterpriseStatus,
  Page,
  PlatformOrgDetail,
  PlatformOrgSummary,
} from '@endur/shared';
import { OpsError } from './ops.js';
import {
  useApproveEnterpriseRequestMutation,
  useGetEnterpriseQueueQuery,
  useGetEstateInfiniteQuery,
  useGetOrgDetailQuery,
  useUpdateEnterpriseRequestMutation,
} from '../store/api/endpoints/ops.js';
import { unwrapApi, useLoadable } from './query.js';

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

/** A fixed key order, so the string is a stable cache key (the same fix `lib/audit.ts`
 *  and `lib/analysis.ts` needed). */
export function estateSearch(filters: EstateFilters): string {
  const params = new URLSearchParams();
  for (const key of ['tier', 'status', 'industry', 'q'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

const statusOf = (error: Error | null): number => (error instanceof OpsError ? error.status : 0);

export function useEstate(filters: EstateFilters): EstateController {
  const query = useGetEstateInfiniteQuery(estateSearch(filters));
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = query;
  const pages = query.data?.pages;
  const last = pages?.at(-1);
  const rows = useMemo(() => pages?.flatMap((page) => page.data) ?? [], [pages]);

  // The last list DIMS AND STAYS while another filter loads (`70` § States): `data`, not
  // `currentData`.
  const loaded = useLoadable({
    ...query,
    isFetching: isFetching && !isFetchingNextPage,
    data: last,
    currentData: last,
  });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  const forbidden = statusOf(loaded.error) === 403;
  return {
    ...loaded,
    ...(forbidden ? { error: null } : {}),
    rows,
    forbidden,
    loadMore,
    loadingMore: isFetchingNextPage,
  };
}

export function useOrgDetail(id: string | undefined): Loadable<PlatformOrgDetail> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  const detail = useLoadable(useGetOrgDetailQuery(id ?? '', { skip: !id }), { current: true });
  const forbidden = statusOf(detail.error) === 403;
  return forbidden ? { ...detail, data: null, error: null, forbidden } : { ...detail, forbidden };
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
  const queue = useLoadable(useGetEnterpriseQueueQuery(undefined, { skip: !enabled }));
  const [updateRequest] = useUpdateEnterpriseRequestMutation();
  const [approveRequest] = useApproveEnterpriseRequestMutation();
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * THE FAILURE IS KEPT, and that is the fix for the bug this shipped with.
   *
   * Every one of these used to `await` a request whose rejection nobody caught — the page
   * called `void queue.update(...).finally(...)` with no `.catch`, so a 403, a 409 or a 500
   * produced an unhandled promise rejection and **nothing at all on screen**. The operator
   * pressed Contacted and the row sat there. A write that can fail silently is worse than one
   * that fails loudly, because the second kind gets reported. (A refused write also re-reads
   * the queue: the mutations invalidate it on failure.)
   */
  const run = useCallback(async (work: () => Promise<unknown>) => {
    setFailure(null);
    try {
      await work();
    } catch (caught) {
      setFailure(caught instanceof OpsError ? caught.message : 'That did not go through.');
    }
  }, []);

  const update = useCallback(
    (id: string, status: EnterpriseStatus) => run(() => unwrapApi(updateRequest({ id, status }))),
    [run, updateRequest],
  );
  const approve = useCallback(
    (id: string) => run(() => unwrapApi(approveRequest(id))),
    [run, approveRequest],
  );

  const loadError = queue.error ? (queue.error instanceof OpsError ? queue.error.message : 'Could not load the queue.') : null;
  return {
    rows: queue.data ?? [],
    loading: enabled && queue.loading && queue.data === null,
    error: failure ?? loadError,
    update,
    approve,
  };
}
