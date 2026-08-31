// `/ops/earnings` — DEC-080, `71` § Revenue. The same fetch posture as `analytics-ops.ts`,
// and it reuses that module's `analyticsSearch` rather than writing a second query builder:
// the two pages take the same window, so one serialiser is what keeps a link pasted from one
// of them opening the other at the same range.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformEarnings } from '@endur/shared';
import { OpsError, opsGet } from './ops.js';
import type { Loadable } from './estate.js';
import { analyticsSearch, type AnalyticsWindow } from './analytics-ops.js';

export type EarningsWindow = AnalyticsWindow;

export function useEarnings(window: EarningsWindow): Loadable<PlatformEarnings> & {
  forbidden: boolean;
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<PlatformEarnings>>({
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
      const response = await opsGet<{ data: PlatformEarnings }>(`/earnings${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof OpsError ? error.status : 0;
      setForbidden(status === 403);
      // The previous window's figures DIM AND STAY rather than vanish — `71` § States, and
      // the same rule the analytics hook follows. Only a real (non-403) error clears them.
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
