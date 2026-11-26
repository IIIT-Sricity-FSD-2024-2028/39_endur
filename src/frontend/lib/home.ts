// The home dashboard. 46 § State, 23 §3.
//
// ONE request, and no polling. Live counters belong on the results page, where a response
// landing is the point; here they would be a second timer running behind a screen nobody is
// watching (46 § State). Navigating back to `/app` refetches, which is what a hub needs.
import type { HomeView, StatWindow } from '@endur/shared';
import { useLoadable, type Loadable } from './query.js';
import { useGetHomeQuery } from '../store/api/endpoints/home.js';

export type HomeController = Loadable<HomeView> & { reload: () => Promise<void> };

/**
 * `window` is the range every number is measured over (DEC-031). Changing it refetches
 * rather than filtering client-side, because the k-anonymity gate and the response rate's
 * denominator are both decided on the server — a client that held all-time rows and sliced
 * them would be holding rows the gate exists to withhold.
 *
 * The PREVIOUS numbers stay on screen while the new range loads (`loading` flips, `data`
 * does not), so pressing "Today" does not blank the page and push the layout around. And
 * the newest range always wins: each range is its own cache entry (R-204).
 */
export function useHome(window: StatWindow = '30d'): HomeController {
  // The shell stays usable and the retry is inline (46 § States): `data` keeps the last
  // good numbers when a refetch fails.
  return useLoadable(useGetHomeQuery(window));
}
