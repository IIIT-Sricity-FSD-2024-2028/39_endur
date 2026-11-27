// What an operator report's SUBSCRIPTION says about itself: loading, failed, or refused. The
// figures never come from here: each page reads them with a selector over the same cache
// entry (`store/screens/opsReports.ts`). A 403 is its own state ("you may not see this"),
// never also an error line and never "there is nothing".
import { OpsError } from './ops.js';

export type ReportStatus = {
  loading: boolean;
  error: Error | null;
  forbidden: boolean;
};

export function asReport(loaded: { loading: boolean; error: Error | null }): ReportStatus {
  const forbidden = loaded.error instanceof OpsError && loaded.error.status === 403;
  return { loading: loaded.loading, error: forbidden ? null : loaded.error, forbidden };
}
