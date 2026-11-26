// Organisation reads and the wizard's single write. 31 § Data contract, 23 §3.
//
// Pages call these hooks; the hooks call the store's endpoints. The wizard must never
// touch `fetch` — its whole correctness argument is that five steps produce ONE request,
// and that is much easier to keep true when there is exactly one function that can send it.
//
// On RTK Query since R-401 (`store/api/endpoints/org.ts`). Names and shapes unchanged. What
// changed: saving the org's name or its words now also re-reads `/auth/me`, so the top bar
// and every noun in the shell follow without a reload.
import { useCallback } from 'react';
import type { OrgView, PresetView } from '@endur/shared';
import { useAppDispatch } from '../store/index.js';
import {
  orgApi,
  useGetOrgQuery,
  useGetPresetsQuery,
} from '../store/api/endpoints/org.js';
import { useLoadable, type Loadable } from './query.js';

/** Defined once, in `lib/query.ts`; re-exported because a dozen `lib` files import it here. */
export type { Loadable } from './query.js';

/**
 * The preset catalogue. Loaded BEFORE step 1 renders — 31 § States: "the wizard does not
 * open half-populated". A step-1 grid that pops in after a beat is the first thing an
 * evaluator sees, and it looks like a page that is not ready.
 */
export function usePresets(): Loadable<PresetView[]> {
  return useLoadable(useGetPresetsQuery());
}

/**
 * The org as settings needs it. Separate from the session's copy in `authSlice`: that one
 * carries only what the shell renders, and this page edits fields the shell never shows.
 *
 * `loading` means "nothing to show yet", not "a request is in flight": Settings swaps its
 * whole form for a skeleton while it is true, and a re-read after a logo upload must not
 * blank the form somebody is in the middle of.
 */
export function useOrg(): Loadable<OrgView> & { set: (org: OrgView) => void } {
  const dispatch = useAppDispatch();
  const org = useLoadable(useGetOrgQuery(), { initialOnly: true });

  const set = useCallback(
    (next: OrgView) => {
      dispatch(orgApi.util.updateQueryData('getOrg', undefined, () => next));
    },
    [dispatch],
  );

  return { data: org.data, loading: org.loading, error: org.error, set };
}

