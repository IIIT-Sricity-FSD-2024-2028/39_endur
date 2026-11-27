// `/ops/earnings` — DEC-080, `71` § Revenue. The same window as Analytics
// (`state.opsReports.window`), so a range chosen on one page is the range the other opens
// at. This hook only subscribes: the figures are `selectEarningsView`.
import { useGetEarningsQuery } from '../store/api/endpoints/ops.js';
import { asReport, type ReportStatus } from './opsStatus.js';
import { useLoadable } from './query.js';

export function useEarnings(search: string): ReportStatus {
  return asReport(useLoadable(useGetEarningsQuery(search)));
}
