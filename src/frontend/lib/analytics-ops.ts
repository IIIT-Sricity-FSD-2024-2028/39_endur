// `/ops/analytics` — `71` § State. The window is `state.opsReports.window`, shared with
// `/ops/earnings`; its search string (`selectReportSearch`) is the cache key, so each window
// is one cached report. This hook only subscribes: the figures are `selectAnalyticsView`.
import { useGetAnalyticsQuery } from '../store/api/endpoints/ops.js';
import { asReport, type ReportStatus } from './opsStatus.js';
import { useLoadable } from './query.js';

export function useAnalytics(search: string): ReportStatus {
  return asReport(useLoadable(useGetAnalyticsQuery(search)));
}
