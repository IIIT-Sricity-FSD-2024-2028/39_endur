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
import { useCallback } from 'react';
import type {
  CreateUnitBody,
  UnitComposition,
  UnitImpact,
  UnitNode,
  UnitTreeTotals,
} from '@endur/shared';
import { apiGet } from './api.js';
import {
  useCreateUnitMutation,
  useDeleteUnitMutation,
  useGetUnitCompositionQuery,
  useGetUnitsQuery,
  useRenameUnitMutation,
  useReparentUnitMutation,
} from '../store/api/endpoints/units.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

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
  create: (body: CreateUnitBody) => Promise<UnitNode[]>;
  rename: (id: string, name: string) => Promise<void>;
  reparent: (id: string, newParentId: string | null) => Promise<void>;
  remove: (id: string, reassignChildrenTo?: string) => Promise<void>;
};

/**
 * The tree. On a failed re-read the last good tree stays on screen, with the error beside
 * it for the page's retry (32 § States). `create`, `reparent` and `remove` resolve once the
 * re-read tree is in, as before; `rename` resolves when the server has agreed.
 */
export function useUnits(): UnitsController {
  const tree = useLoadable(useGetUnitsQuery());
  const { reload } = tree;
  const [createUnit] = useCreateUnitMutation();
  const [renameUnit] = useRenameUnitMutation();
  const [reparentUnit] = useReparentUnitMutation();
  const [deleteUnit] = useDeleteUnitMutation();

  const create = useCallback(
    async (body: CreateUnitBody) => {
      const created = await unwrapApi(createUnit(body));
      await reload();
      return created;
    },
    [createUnit, reload],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await unwrapApi(renameUnit({ id, name }));
    },
    [renameUnit],
  );

  const reparent = useCallback(
    async (id: string, newParentId: string | null) => {
      await unwrapApi(reparentUnit({ id, newParentId }));
      await reload();
    },
    [reparentUnit, reload],
  );

  const remove = useCallback(
    async (id: string, reassignChildrenTo?: string) => {
      await unwrapApi(deleteUnit({ id, reassignChildrenTo }));
      await reload();
    },
    [deleteUnit, reload],
  );

  return {
    data: tree.data?.data ?? null,
    loading: tree.loading,
    error: tree.error,
    totals: tree.data?.meta ?? null,
    reload,
    create,
    rename,
    reparent,
    remove,
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
 * dialog opens; until it answers the dialog's destructive button stays disabled, because a
 * confirmation with unknown consequences is one nobody should be able to accept (32).
 *
 * Not on RTK Query, on purpose: a one-off read for one dialog that must be fresh every time
 * it opens. A cache entry would never be read twice.
 */
export const unitImpact = (id: string): Promise<UnitImpact> =>
  apiGet<{ data: UnitImpact }>(`/units/${id}/impact`).then((response) => response.data);
