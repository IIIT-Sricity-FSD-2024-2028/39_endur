// `/ops/analytics` — `71` § State. Window and granularity are URL params so a figure quoted
// in a message is re-openable at the same window; the report itself is fetched fresh per
// window and never cached across one, the same posture `lib/estate.ts` takes for its list.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformAnalytics } from '@endur/shared';
import { OpsError, opsGet } from './ops.js';
import type { Loadable } from './estate.js';

export type AnalyticsWindow = {
  from?: string | undefined;
  to?: string | undefined;
  granularity: 'month' | 'quarter';
};

/** Fixed key order, the same fix `estateSearch` needed — a stable string is a stable effect
 *  dependency. */
export function analyticsSearch(window: AnalyticsWindow): string {
  const params = new URLSearchParams();
  if (window.from) params.set('from', window.from);
  if (window.to) params.set('to', window.to);
  params.set('granularity', window.granularity);
  return `?${params.toString()}`;
}

export function useAnalytics(window: AnalyticsWindow): Loadable<PlatformAnalytics> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<PlatformAnalytics>>({
    data: null,
    loading: true,
    error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(true);
  const search = analyticsSearch(window);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await opsGet<{ data: PlatformAnalytics }>(`/analytics${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof OpsError ? error.status : 0;
      setForbidden(status === 403);
      // The previous window's figures DIM AND STAY rather than vanish (`71` § States,
      // `70`'s precedent) — only a real (non-403) error clears the data.
      setState((current) => ({
        data: status === 403 ? null : current.data,
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

  return { ...state, forbidden, reload: load };
}
