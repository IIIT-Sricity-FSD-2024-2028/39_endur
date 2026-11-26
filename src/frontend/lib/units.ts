// The unit tree's reads and writes. 32 § Data contract, 23 §3.
//
// Pages call these; they call the store's endpoints (`store/api/endpoints/units.ts`, R-402),
// which is the P3 seam doing its job: this file changed and nothing that renders did.
//
// Two mutation policies here, and the difference is deliberate (32 § State):
//   - RENAME is optimistic, with revert on failure. It is a single field, and the demo
//     depends on it feeling instant.
//   - REPARENT is not. A move that silently fails the server's cycle check and then snaps
//     back is worse than a brief wait, and the cycle check is the whole reason the server
//     is the authority here.
// Both are now done in the cache (`onQueryStarted` and `patch.undo()` for the rename), so
// every screen holding the tree sees the same thing at the same moment.
import { skipToken } from '@reduxjs/toolkit/query';
import type { UnitComposition, UnitImpact, UnitNode, UnitTreeTotals } from '@endur/shared';
import {
  useGetUnitCompositionQuery,
  useGetUnitImpactQuery,
  useGetUnitsQuery,
} from '../store/api/endpoints/units.js';
import { useLoadable, type Loadable } from './query.js';

export type UnitsController = Loadable<UnitNode[]> & {
  /**
   * The forest's own totals, straight from the response envelope (DEC-082).
   *
   * Not derived from `data`: a person placed under two roots of a scope-filtered tree is
   * one person, and the client holds scalars it can only add. `null` until the first load
   * answers.
   */
  totals: UnitTreeTotals | null;
  reload: () => Promise<void>;
};

/**
 * The tree. On a failed re-read the last good tree stays on screen, with the error beside
 * it for the page's retry (32 § States). `create`, `reparent` and `remove` resolve once the
 * re-read tree is in, as before; `rename` resolves when the server has agreed.
 */
export function useUnits(): UnitsController {
  // Creating, renaming, moving and deleting are thunks in store/screens/structure.ts
  // (DEC-R03); each lands in this one cache entry through the `Unit` tags.
  const tree = useLoadable(useGetUnitsQuery());
  const { reload } = tree;

  return {
    data: tree.data?.data ?? null,
    loading: tree.loading,
    error: tree.error,
    totals: tree.data?.meta ?? null,
    reload,
  };
}

/**
 * Who the branch's people ARE — `DEC-083`, `32` § What a count on a unit means.
 *
 * Its own fetch rather than a field on the tree: the panel shows one unit at a time, and a
 * breakdown carried on every node would be roles × units on a page load that mostly never
 * reads it. `null` asks nothing, so the panel costs a request only once a unit is selected.
 *
 * Its error is for the caller to ignore, by design: the breakdown explains a number that is
 * already on screen and still correct without it. An error strip here would report the
 * failure of the footnote as though the stat itself were in doubt.
 */
export function useUnitComposition(unitId: string | null): Loadable<UnitComposition> {
  // `current`: selecting another unit never shows the last one's breakdown while it loads.
  const composition = useLoadable(
    useGetUnitCompositionQuery(unitId ?? '', { skip: !unitId }),
    { current: true },
  );
  if (!unitId) return { data: null, loading: false, error: null };
  return { data: composition.data, loading: composition.loading, error: composition.error };
}

/**
 * What deleting or moving this unit actually costs, in numbers. Fetched when the confirm
 * dialog opens (`id` set) and fresh every time; until it answers, the dialog's destructive
 * button stays disabled, because a confirmation with unknown consequences is one nobody
 * should be able to accept (32).
 */
export function useUnitImpact(id: string | null): Loadable<UnitImpact> {
  const impact = useLoadable(useGetUnitImpactQuery(id ?? skipToken), { current: true });
  return { data: impact.data, loading: impact.loading, error: impact.error };
}
