// The operator console's registers: the platform's own audit trail, the support visits,
// and the operator accounts. Reads only, and subscriptions only: what the pages draw is
// `selectAuditView`, `selectSupportView` (store/screens/opsReports.ts) and `selectTeamView`
// (store/screens/opsTeam.ts), over these hooks' cache entries.
import { useCallback } from 'react';
import {
  useGetOperatorsQuery,
  useGetPlatformAuditInfiniteQuery,
  useGetSupportSessionsQuery,
} from '../store/api/endpoints/ops.js';
import { asReport, type ReportStatus } from './opsStatus.js';
import { useLoadable } from './query.js';

export function usePlatformAudit(search: string, enabled = true): ReportStatus & {
  loadMore: () => Promise<void>;
  loadingMore: boolean;
} {
  const query = useGetPlatformAuditInfiniteQuery(search, { skip: !enabled });
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = query;
  const last = query.data?.pages.at(-1);
  const loaded = useLoadable({ ...query, isFetching: isFetching && !isFetchingNextPage, data: last, currentData: last });
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);
  return { ...asReport(loaded), loadMore, loadingMore: isFetchingNextPage };
}

/** The register, or one organisation's part of it (`supportSearch(orgId)`). */
export function useSupportSessions(search: string, enabled = true): ReportStatus {
  return asReport(useLoadable(useGetSupportSessionsQuery(search, { skip: !enabled })));
}

export function useOperators(enabled = true): ReportStatus {
  return asReport(useLoadable(useGetOperatorsQuery(undefined, { skip: !enabled })));
}
