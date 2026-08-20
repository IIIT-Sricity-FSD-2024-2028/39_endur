// The home dashboard. 46 § State, 23 §3.
//
// ONE request, and no polling. Live counters belong on the results page, where a response
// landing is the point; here they would be a second timer running behind a screen nobody is
// watching (46 § State). Navigating back to `/app` refetches, which is what a hub needs.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeView } from '@endur/shared';
import { apiGet } from './api.js';
import type { Loadable } from './org.js';

export type HomeController = Loadable<HomeView> & { reload: () => Promise<void> };

export function useHome(): HomeController {
  const [state, setState] = useState<Loadable<HomeView>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await apiGet<{ data: HomeView }>('/home');
      if (!alive.current) return;
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      // The shell stays usable and the retry is inline (46 § States). A dashboard that
      // failed to load is still a page with a working sidebar on it.
      setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, reload: load };
}
