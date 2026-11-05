// `/ops/analytics` — `71` § State. Window and granularity are URL params so a figure quoted
// in a message is re-openable at the same window. On RTK Query since R-505: one cached
// report per window, re-read whenever the page opens it.
import type { PlatformAnalytics } from '@endur/shared';
import { OpsError } from './ops.js';
import type { Loadable } from './estate.js';
import { useGetAnalyticsQuery } from '../store/api/endpoints/ops.js';
import { useLoadable } from './query.js';

export type AnalyticsWindow = {
  from?: string | undefined;
  to?: string | undefined;
  granularity: 'month' | 'quarter';
};

/** Fixed key order, the same fix `estateSearch` needed — a stable string is a stable
 *  cache key. */
export function analyticsSearch(window: AnalyticsWindow): string {
  const params = new URLSearchParams();
  if (window.from) params.set('from', window.from);
  if (window.to) params.set('to', window.to);
  params.set('granularity', window.granularity);
  return `?${params.toString()}`;
}

/**
 * A window's report, for the analytics and earnings pages. The previous window's figures
 * DIM AND STAY while the next loads (`71` § States, `70`'s precedent): `data`, not
 * `currentData`. A 403 is its own state and clears them.
 */
export function windowReport<T>(report: Loadable<T> & { reload: () => Promise<void> }): Loadable<T> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  const forbidden = report.error instanceof OpsError && report.error.status === 403;
  return forbidden ? { ...report, data: null, error: null, forbidden } : { ...report, forbidden };
}

export function useAnalytics(window: AnalyticsWindow): Loadable<PlatformAnalytics> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  return windowReport(useLoadable(useGetAnalyticsQuery(analyticsSearch(window))));
}
