// The estate list, the estate's numbers, one organisation, and the Enterprise queue: the
// operator console's READS. `70` § Data contract, `T-066`.
//
// THESE HOOKS ONLY SUBSCRIBE. Each one keeps its cache entry alive and fetching, and says
// whether it is loading, failed, or was refused (a 403 is not "there is nothing"). What the
// page DRAWS — the rows, their order, the flags, every count and percentage — is read from
// the store with the selectors in `store/screens/opsReports.ts`, over the same cache entry.
//
// On RTK Query since R-505, over the operator API (`store/api/opsApi.ts`). Every operator
// write is a thunk in `store/screens/operator.ts` (DEC-R03).
import { useCallback } from 'react';
import type { EnterpriseRequestRow, PlatformOrgDetail } from '@endur/shared';
import { OpsError } from './ops.js';
import {
  useGetEnterpriseQueueQuery,
  useGetEstateInfiniteQuery,
  useGetOpsStatsQuery,
  useGetOrgDetailQuery,
} from '../store/api/endpoints/ops.js';
import { useLoadable } from './query.js';
import { asReport, type ReportStatus } from './opsStatus.js';

export type { ReportStatus };

export type Loadable<T> = { data: T | null; loading: boolean; error: Error | null };

const statusOf = (error: Error | null): number => (error instanceof OpsError ? error.status : 0);

export type EstateController = ReportStatus & {
  loadMore: () => Promise<void>;
  loadingMore: boolean;
};

/**
 * The estate, for `search` (`selectEstateSearch`). "Load more" APPENDS: the list dims and
 * stays while loading (`70` § States), and the pages already loaded survive a look at one
 * organisation and back.
 */
export function useEstate(search: string): EstateController {
  const query = useGetEstateInfiniteQuery(search);
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = query;
  const last = query.data?.pages.at(-1);
  const loaded = useLoadable({ ...query, isFetching: isFetching && !isFetchingNextPage, data: last, currentData: last });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  return { ...asReport(loaded), loadMore, loadingMore: isFetchingNextPage };
}

/** The estate's six numbers (`/platform/stats`); `selectEstateStatsView` draws them. */
export function useEstateStats(enabled = true): ReportStatus {
  return asReport(useLoadable(useGetOpsStatsQuery(undefined, { skip: !enabled })));
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
 * request nobody may answer is a request not worth making.
 *
 * NOT PAGINATED. If this queue ever needs a second page, Endur has a sales problem it would
 * rather have; a cursor here would be machinery for a list that is empty most weeks.
 */
export function useEnterpriseQueue(enabled: boolean): {
  rows: EnterpriseRequestRow[];
  loading: boolean;
  /** Why the queue did not load. A refused WRITE is `state.operator.estate.queueError`. */
  error: string | null;
} {
  const queue = useLoadable(useGetEnterpriseQueueQuery(undefined, { skip: !enabled }));
  const loadError = queue.error ? (queue.error instanceof OpsError ? queue.error.message : 'Could not load the queue.') : null;
  return {
    rows: queue.data ?? [],
    loading: enabled && queue.loading && queue.data === null,
    error: loadError,
  };
}
