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
// lives in memory until an explicit Save.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CapabilityMeta,
  CreateRoleBody,
  GrantCell,
  GrantWarning,
  PutGrantsBody,
  RoleView,
  Scope,
  UpdateRoleBody,
} from '@endur/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api.js';
import type { Loadable } from './org.js';

/**
 * The roles in this organisation, ordered by level.
 *
 * Ordered by level because that is the order an administrator thinks in — and level is
 * ORDERING ONLY, never authorisation (DEC-002, CONF-002). Nothing here compares one to
 * another to decide anything; the server does that, from grants (`11` §5b).
 */
export function useRoles(): Loadable<RoleView[]> {
  const [state, setState] = useState<Loadable<RoleView[]>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: RoleView[] }>('/roles')
      .then((response) => {
        if (!cancelled) setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------- the ladder */

export type RoleLadderController = Loadable<RoleView[]> & {
  reload: () => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  remove: (id: string, reassignTo?: string) => Promise<void>;
};

export function useRoleLadder(): RoleLadderController {
  const [state, setState] = useState<Loadable<RoleView[]>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const { data } = await apiGet<{ data: RoleView[] }>('/roles');
      if (alive.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (alive.current) {
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...state,
    reload: load,
    create: useCallback(
      async (name: string) => {
        await apiPost<CreateRoleBody, unknown>('/roles', { name });
        await load();
      },
      [load],
    ),
    rename: useCallback(
      async (id: string, name: string) => {
        await apiPatch<UpdateRoleBody, unknown>(`/roles/${id}`, { name });
        await load();
      },
      [load],
    ),
    /**
     * RE-READS rather than trusting the local order. Levels are DERIVED server-side from the
     * array's order (`14`, `33`), and re-reading is what proves the derivation agreed with
     * what the screen showed — a client that renumbered its own rows would be the second
     * source of truth the DTO comment exists to prevent.
     */
    reorder: useCallback(
      async (orderedIds: string[]) => {
        await apiPost<{ orderedIds: string[] }, unknown>('/roles/reorder', { orderedIds });
        await load();
      },
      [load],
    ),
    remove: useCallback(
      async (id: string, reassignTo?: string) => {
        await apiDelete<unknown, { reassignTo?: string }>(
          `/roles/${id}`,
          reassignTo ? { reassignTo } : {},
        );
        await load();
      },
      [load],
    ),
  };
}

/* --------------------------------------------------------------- the grid */

/** `null` scope is NO GRANT — an absent row, not a row with an empty scope (`14`). */
export type CellKey = string;
export const cellKey = (roleId: string, capability: string): CellKey =>
  `${roleId}|${capability}`;

/** The cycle a click walks. `33`: `—` → self → own_unit → subtree → all → `—`. */
export const SCOPE_CYCLE: Array<Scope | null> = [null, 'self', 'own_unit', 'subtree', 'all'];

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
  /** Cycle one cell's scope. */
  cycle: (roleId: string, capability: string) => void;
  /** Shift-click — a hard block. INV-004: it beats every allow, from any source. */
  block: (roleId: string, capability: string) => void;
  /** Copy a whole role's column onto another (`33` § Interactions). */
  copyColumn: (fromRoleId: string, toRoleId: string) => void;
  /** Grant or clear a whole capability row across every role. */
  fillRow: (capability: string, scope: Scope | null) => void;
  undo: () => void;
  canUndo: boolean;
  save: () => Promise<void>;
  reload: () => Promise<void>;
};

export function usePowersGrid(): GridController {
  const [state, setState] = useState<GridState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** A client-side stack over the working copy (`33` § State). */
  const [history, setHistory] = useState<Array<Map<CellKey, GrantCell>>>([]);
  const [saved, setSaved] = useState<Map<CellKey, GrantCell>>(new Map());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogue, roles, grid, warnings] = await Promise.all([
        apiGet<{ data: CapabilityMeta[] }>('/authz/capabilities'),
        apiGet<{ data: RoleView[] }>('/roles'),
        apiGet<{ data: GrantCell[] }>('/grants'),
        apiGet<{ data: GrantWarning[] }>('/grants/warnings'),
      ]);
      if (!alive.current) return;
      const cells = new Map<CellKey, GrantCell>();
      for (const cell of grid.data) cells.set(cellKey(cell.roleId, cell.capability), cell);
      setState({
        catalogue: catalogue.data, roles: roles.data, cells, warnings: warnings.data,
      });
      setSaved(new Map(cells));
      setHistory([]);
      setError(null);
    } catch (caught) {
      if (alive.current) setError(caught as Error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every mutation goes through here, so undo is one implementation rather than five. */
  const edit = useCallback(
    (mutate: (cells: Map<CellKey, GrantCell>) => void) => {
      setState((current) => {
        if (!current) return current;
        setHistory((stack) => [...stack, new Map(current.cells)]);
        const next = new Map(current.cells);
        mutate(next);
        return { ...current, cells: next };
      });
      setSaveError(null);
    },
    [],
  );

  const cycle = useCallback(
    (roleId: string, capability: string) => {
      edit((cells) => {
        const key = cellKey(roleId, capability);
        const existing = cells.get(key);
        // A deny is not part of the cycle — shift-click sets it and a plain click clears it,
        // because cycling THROUGH a deny would arm the grid's most consequential state by
        // accident, four clicks into a scope walk.
        if (existing?.effect === 'deny') {
          cells.delete(key);
          return;
        }
        const at = SCOPE_CYCLE.indexOf(existing?.scope ?? null);
        const next = SCOPE_CYCLE[(at + 1) % SCOPE_CYCLE.length] ?? null;
        if (next === null) cells.delete(key);
        else cells.set(key, { roleId, capability, scope: next, effect: 'allow' });
      });
    },
    [edit],
  );

  const block = useCallback(
    (roleId: string, capability: string) => {
      edit((cells) => {
        const key = cellKey(roleId, capability);
        if (cells.get(key)?.effect === 'deny') cells.delete(key);
        else cells.set(key, { roleId, capability, scope: 'all', effect: 'deny' });
      });
    },
    [edit],
  );

  const copyColumn = useCallback(
    (fromRoleId: string, toRoleId: string) => {
      edit((cells) => {
        for (const [key, cell] of [...cells]) {
          if (cell.roleId === toRoleId) cells.delete(key);
        }
        for (const cell of [...cells.values()]) {
          if (cell.roleId !== fromRoleId) continue;
          cells.set(cellKey(toRoleId, cell.capability), { ...cell, roleId: toRoleId });
        }
      });
    },
    [edit],
  );

  // The role ids come from the ROLE LIST, never from the cells already present. A role that
  // holds nothing at all has no cells, and deriving the columns from the working copy would
  // silently skip exactly the role a "grant this to everyone" click is most likely aimed at.
  const roleIds = useMemo(() => (state?.roles ?? []).map((role) => role.id), [state?.roles]);

  const fillRow = useCallback(
    (capability: string, scope: Scope | null) => {
      edit((cells) => {
        for (const [key, cell] of [...cells]) {
          if (cell.capability === capability) cells.delete(key);
        }
        if (scope === null) return;
        for (const roleId of roleIds) {
          cells.set(cellKey(roleId, capability), { roleId, capability, scope, effect: 'allow' });
        }
      });
    },
    [edit, roleIds],
  );

  const undo = useCallback(() => {
    setHistory((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setState((current) => (current ? { ...current, cells: previous } : current));
      return stack.slice(0, -1);
    });
  }, []);

  /**
   * The DIFF, not the whole matrix — and `33`'s "replaces the whole matrix" describes the
   * transaction, not the payload. `PUT /grants` writes the cells it is given and leaves the
   * rest alone, so sending 64 × 4 unchanged cells would rewrite every row, clear `derived`
   * on all of them, and make the audit entry claim a change nobody made.
   */
  const save = useCallback(async () => {
    if (!state) return;
    setSaving(true);
    setSaveError(null);
    try {
      const cells: GrantCell[] = [];
      for (const [key, cell] of state.cells) {
        const before = saved.get(key);
        if (!before || before.scope !== cell.scope || before.effect !== cell.effect) {
          cells.push(cell);
        }
      }
      // A removal is a cell with `scope: null` — default deny means an absent row is how a
      // power is taken away, so absence has to be sent explicitly.
      for (const [key, cell] of saved) {
        if (!state.cells.has(key)) {
          cells.push({ ...cell, scope: null });
        }
      }
      await apiPut<PutGrantsBody, unknown>('/grants', { cells });
      await load();
    } catch (caught) {
      // THE WORKING COPY SURVIVES A FAILED SAVE (`33` § States). A refusal here is usually
      // the lockout guard or `WOULD_ESCALATE`, and both are sentences the administrator has
      // to act on — throwing their edits away would make the message unusable.
      if (alive.current) setSaveError((caught as Error).message);
    } finally {
      if (alive.current) setSaving(false);
    }
  }, [state, saved, load]);

  const dirty = useMemo(() => {
    if (!state) return false;
    if (state.cells.size !== saved.size) return true;
    for (const [key, cell] of state.cells) {
      const before = saved.get(key);
      if (!before || before.scope !== cell.scope || before.effect !== cell.effect) return true;
    }
    return false;
  }, [state, saved]);

  return {
    loading, error, state, savedCells: saved, dirty, saving, saveError,
    cycle, block, copyColumn, fillRow, undo, canUndo: history.length > 0, save, reload: load,
  };
}
