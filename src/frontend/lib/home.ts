// The home dashboard. 46 § State, 23 §3.
//
// ONE request, and no polling. Live counters belong on the results page, where a response
// landing is the point; here they would be a second timer running behind a screen nobody is
// watching (46 § State). Navigating back to `/app` refetches, which is what a hub needs.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeView, StatWindow } from '@endur/shared';
import { apiGet } from './api.js';
import type { Loadable } from './org.js';

export type HomeController = Loadable<HomeView> & { reload: () => Promise<void> };

/**
 * `window` is the range every number is measured over (DEC-031). Changing it refetches
 * rather than filtering client-side, because the k-anonymity gate and the response rate's
 * denominator are both decided on the server — a client that held all-time rows and sliced
 * them would be holding rows the gate exists to withhold.
 *
 * The PREVIOUS numbers stay on screen while the new range loads (`loading` flips, `data`
 * does not), so pressing "Today" does not blank the page and push the layout around.
 */
export function useHome(window: StatWindow = '30d'): HomeController {
  const [state, setState] = useState<Loadable<HomeView>>({
    data: null, loading: true, error: null,
  });
  /**
   * A SEQUENCE NUMBER, not a boolean.
   *
   * An `alive` flag was enough while this hook fetched once, and stopped being enough the
   * moment the range became a dependency: pressing 30d then Today fires two requests, and
   * a flag that the second effect sets back to `true` lets the FIRST one land last and
   * paint 30 days of responses under a card that says "today". The counter makes a
   * response prove it is the newest one before it is allowed to write.
   */
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = (latest.current += 1);
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await apiGet<{ data: HomeView }>(`/home?window=${window}`);
      if (ticket !== latest.current) return;
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (ticket !== latest.current) return;
      // The shell stays usable and the retry is inline (46 § States). A dashboard that
      // failed to load is still a page with a working sidebar on it.
      setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, [window]);

  useEffect(() => {
    void load();
    // Unmount invalidates every in-flight ticket, so nothing sets state on a dead page.
    return () => {
      latest.current += 1;
    };
  }, [load]);

  return { ...state, reload: load };
}
