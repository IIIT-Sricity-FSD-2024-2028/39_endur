// THE ARITHMETIC EVERY DERIVED FIGURE USES, in the customer console and on `/ops` alike.
// docs/REDUX-PLAN.md §6.12 (R-716, R-717).
//
// The server sends counts; the percentages printed from them are worked out by memoised
// selectors in `store/screens/*`, and every one of those selectors divides with THESE two
// functions, so "37 of 50 · 74%" is rounded the same way on every page that prints one.
//
// Kept out of `opsReports.ts` on purpose: that file arrives with the operator console's
// chunk, and a customer page importing it would download `/ops` code with it.
import type { RootState } from '../index.js';

/** A count against what it is a share of, with the percentage. All three, always: a
 *  percentage printed without its "of what" is the number nobody can trace. */
export type Share = { count: number; of: number; percent: number };

/** Whole-number percent of `whole`; 0 when there is nothing to be a share of. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export const shareOf = (count: number, of: number): Share => ({ count, of, percent: percentOf(count, of) });

/** The parts of an RTK Query cache entry `newestAnswer` reads. */
type CacheEntry = {
  endpointName?: string;
  originalArgs?: unknown;
  data?: unknown;
  fulfilledTimeStamp?: number;
};

/**
 * The newest answer the organisation API holds for one endpoint, among the entries `belongs`
 * accepts: what a page is still SHOWING while the answer for a new range or filter loads.
 *
 * The page's hook keeps its last answer on screen while the next one loads (`useLoadable`'s
 * `data`). A selector that only read the entry for what was just asked would come back empty
 * for that moment, and the figures would blank while the page around them did not. So each
 * page's selector reads the entry it asked for, and falls back to this.
 */
export function newestAnswer<T>(
  state: RootState,
  endpointName: string,
  belongs: (args: unknown) => boolean = () => true,
): T | undefined {
  let newest: CacheEntry | undefined;
  for (const entry of Object.values(state.api.queries) as Array<CacheEntry | undefined>) {
    if (!entry || entry.endpointName !== endpointName || entry.data === undefined) continue;
    if (!belongs(entry.originalArgs)) continue;
    if (!newest || (entry.fulfilledTimeStamp ?? 0) > (newest.fulfilledTimeStamp ?? 0)) newest = entry;
  }
  return newest?.data as T | undefined;
}
