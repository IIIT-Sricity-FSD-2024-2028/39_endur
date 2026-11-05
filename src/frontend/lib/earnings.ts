// `/ops/earnings` — DEC-080, `71` § Revenue. The same fetch posture as `analytics-ops.ts`,
// and it reuses that module's `analyticsSearch` rather than writing a second query builder:
// the two pages take the same window, so one serialiser is what keeps a link pasted from one
// of them opening the other at the same range. On RTK Query since R-505.
import type { PlatformEarnings } from '@endur/shared';
import type { Loadable } from './estate.js';
import { analyticsSearch, windowReport, type AnalyticsWindow } from './analytics-ops.js';
import { useGetEarningsQuery } from '../store/api/endpoints/ops.js';
import { useLoadable } from './query.js';

export type EarningsWindow = AnalyticsWindow;

export function useEarnings(window: EarningsWindow): Loadable<PlatformEarnings> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  return windowReport(useLoadable(useGetEarningsQuery(analyticsSearch(window))));
}
