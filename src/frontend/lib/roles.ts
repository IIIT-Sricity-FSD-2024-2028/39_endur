// Roles and the powers grid — reads and writes. 33 § Data contract, 23 §3.
//
// `useRoles()` MOVED HERE FROM lib/people.ts at T-052, and it is a move rather than a copy.
// T-034 put it in the people file because the position picker's first dropdown was the only
// thing that had ever needed it; `33` owns roles, and two hooks fetching `/roles` would be
// two places to fix when the shape changes. `lib/people.ts` re-exports it so that file's own
// callers are untouched (INV-009's rule, applied to a hook instead of a component).
//
// THE GRID IS NOT AUTOSAVED AND THAT IS THE POINT (33 § State). Every other editable surface
// in the product writes on blur, because the cost of a mistake is a rename somebody notices.
// Here the cost of a mistake is an organisation nobody can administer, so the working copy
// lives in `store/powersGridSlice.ts` until an explicit Save (R-407).
//
// On RTK Query since R-403 (`store/api/endpoints/roles.ts`). The hooks kept their names and
// shapes; what changed is that a grid save, a reorder or a role deleted now also refreshes
// the signed-in user's OWN powers, through the `Me` tag, with no reload.
import { useCallback, useMemo } from 'react';
import type { CapabilityMeta, GrantCell, GrantChoice, GrantWarning, RoleView } from '@endur/shared';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useGetCapabilityCatalogueQuery,
  useGetGrantsQuery,
  useGetGrantWarningsQuery,
  useGetRolesQuery,
  useRenameRoleMutation,
  useReorderRolesMutation,
} from '../store/api/endpoints/roles.js';
import {
  cellKey,
  cellSet,
  rowFilled,
  saveGrid,
  selectGridCanUndo,
  selectGridDirty,
  selectPowersGrid,
  undone,
  type CellKey,
} from '../store/powersGridSlice.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

export { cellKey, type CellKey };

/**
 * The roles in this organisation, ordered by level.
 *
 * Ordered by level because that is the order an administrator thinks in — and level is
 * ORDERING ONLY, never authorisation (DEC-002, CONF-002). Nothing here compares one to
 * another to decide anything; the server does that, from grants (`11` §5b).
 *
 * One cache entry for every caller (the ladder, the grid, the people pages), so a rename
 * on the Roles page is in the People page's dropdown without either asking twice.
 */
export function useRoles(): Loadable<RoleView[]> {
  return useLoadable(useGetRolesQuery());
}

/* ------------------------------------------------------------- the ladder */

export type RoleLadderController = Loadable<RoleView[]> & {
  reload: () => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  remove: (id: string, reassignTo?: string) => Promise<void>;
};

/**
 * The ladder. Every command resolves once the new list is on screen, as before: the
 * ladder's buttons re-enable when the promise settles, and a second "Move up" pressed
 * against the old order would send the wrong one.
 *
 * - `reorder` takes the server's own re-read of the list straight into the cache. Levels
 *   are DERIVED server-side from the array's order (`14`, `33`), so that answer is what
 *   proves the derivation agreed with what the screen showed — a client that renumbered
 *   its own rows would be the second source of truth the DTO comment exists to prevent.
 * - `create`, `rename` and `remove` invalidate the list, and wait for the re-read.
 */
export function useRoleLadder(): RoleLadderController {
  const roles = useLoadable(useGetRolesQuery());
  const { reload } = roles;
  const [createRole] = useCreateRoleMutation();
  const [renameRole] = useRenameRoleMutation();
  const [reorderRoles] = useReorderRolesMutation();
  const [deleteRole] = useDeleteRoleMutation();

  return {
    ...roles,
    create: useCallback(
      async (name: string) => {
        await unwrapApi(createRole(name));
        await reload();
      },
      [createRole, reload],
    ),
    rename: useCallback(
      async (id: string, name: string) => {
        await unwrapApi(renameRole({ id, name }));
        await reload();
      },
      [renameRole, reload],
    ),
    reorder: useCallback(
      async (orderedIds: string[]) => {
        await unwrapApi(reorderRoles(orderedIds));
      },
      [reorderRoles],
    ),
    remove: useCallback(
      async (id: string, reassignTo?: string) => {
        await unwrapApi(deleteRole({ id, reassignTo }));
        await reload();
      },
      [deleteRole, reload],
    ),
  };
}

/* --------------------------------------------------------------- the grid */

/** What one cell currently says, as the menu's own vocabulary (`scope-labels.ts`). */
export const choiceOf = (cell: GrantCell | undefined): GrantChoice =>
  !cell ? null : cell.effect === 'deny' ? 'blocked' : cell.scope;

export type GridState = {
  catalogue: CapabilityMeta[];
  roles: RoleView[];
  /** The WORKING COPY, keyed. Saved only when the administrator says so. */
  cells: Map<CellKey, GrantCell>;
  warnings: GrantWarning[];
};

export type GridController = {
  loading: boolean;
  error: Error | null;
  state: GridState | null;
  /** The last SAVED matrix, so a caller can ask what a pending save would change. */
  savedCells: Map<CellKey, GrantCell>;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  /**
   * Set one cell to one of the six things a cell can say (`DEC-076`). ONE mutation, chosen
   * by name — the click-cycle it replaced could only be reached by walking through states
   * the administrator did not want, and could not be reached at all on a touch screen.
   */
  setCell: (roleId: string, capability: string, choice: GrantChoice) => void;
  /** Set a whole capability row, across every role, to the same thing. */
  fillRow: (capability: string, choice: GrantChoice) => void;
  undo: () => void;
  canUndo: boolean;
  /** Never throws: a refusal lands in `saveError`, and the working copy stays. */
  save: () => Promise<void>;
  /** Re-reads all four. Unsaved edits survive it (`powersGridSlice`'s `rebase`). */
  reload: () => Promise<void>;
};

/** A record as the `Map` the grid components read. Built once per record. */
const asMap = (matrix: Record<CellKey, GrantCell>): Map<CellKey, GrantCell> =>
  new Map(Object.entries(matrix));

/**
 * The powers grid: four reads from the cache, and the working copy from `powersGridSlice`
 * (R-407). The shape is the one the grid components were written against, `Map`s and all.
 *
 * Saving invalidates `Me` (R-403): an administrator who gives their own role a power sees
 * the nav and the buttons follow, with no reload.
 */
export function usePowersGrid(): GridController {
  const dispatch = useAppDispatch();
  const catalogue = useLoadable(useGetCapabilityCatalogueQuery());
  const roles = useLoadable(useGetRolesQuery());
  const grants = useLoadable(useGetGrantsQuery());
  const warnings = useLoadable(useGetGrantWarningsQuery());

  const grid = useAppSelector(selectPowersGrid);
  const dirty = useAppSelector(selectGridDirty);
  const canUndo = useAppSelector(selectGridCanUndo);

  const cells = useMemo(() => asMap(grid.cells), [grid.cells]);
  const savedCells = useMemo(() => asMap(grid.saved), [grid.saved]);
  const state = useMemo<GridState | null>(
    () =>
      catalogue.data && roles.data && warnings.data && grid.loaded
        ? { catalogue: catalogue.data, roles: roles.data, cells, warnings: warnings.data }
        : null,
    [catalogue.data, roles.data, warnings.data, grid.loaded, cells],
  );

  const roleIds = useMemo(() => (roles.data ?? []).map((role) => role.id), [roles.data]);
  const { reload: reloadCatalogue } = catalogue;
  const { reload: reloadRoles } = roles;
  const { reload: reloadGrants } = grants;
  const { reload: reloadWarnings } = warnings;

  return {
    loading: catalogue.loading || roles.loading || grants.loading || warnings.loading,
    error: catalogue.error ?? roles.error ?? grants.error ?? warnings.error,
    state,
    savedCells,
    dirty,
    saving: grid.saving,
    saveError: grid.saveError,
    setCell: useCallback(
      (roleId: string, capability: string, choice: GrantChoice) => {
        dispatch(cellSet({ roleId, capability, choice }));
      },
      [dispatch],
    ),
    fillRow: useCallback(
      (capability: string, choice: GrantChoice) => {
        dispatch(rowFilled({ capability, choice, roleIds }));
      },
      [dispatch, roleIds],
    ),
    undo: useCallback(() => {
      dispatch(undone());
    }, [dispatch]),
    canUndo,
    save: useCallback(async () => {
      await dispatch(saveGrid());
    }, [dispatch]),
    reload: useCallback(async () => {
      await Promise.all([reloadCatalogue(), reloadRoles(), reloadGrants(), reloadWarnings()]);
    }, [reloadCatalogue, reloadRoles, reloadGrants, reloadWarnings]),
  };
}
