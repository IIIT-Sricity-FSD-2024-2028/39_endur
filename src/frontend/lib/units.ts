// The unit tree's reads and writes. 32 § Data contract, 23 §3.
//
// Pages call these; only this file calls `api.ts` for `/units`. That is the P3 seam —
// swapping to RTK Query changes this file and nothing that renders.
//
// Two mutation policies here, and the difference is deliberate (32 § State):
//   - RENAME is optimistic, with revert on failure. It is a single field, and the demo
//     depends on it feeling instant.
//   - REPARENT is not. A move that silently fails the server's cycle check and then snaps
//     back is worse than a brief wait, and the cycle check is the whole reason the server
//     is the authority here.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateUnitBody,
  DeleteUnitBody,
  ReparentBody,
  UnitComposition,
  UnitImpact,
  UnitNode,
  UnitTreeTotals,
  UpdateUnitBody,
} from '@endur/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

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

/** A copy of `nodes` with one node's name replaced. Used by the optimistic rename. */
function renameIn(nodes: UnitNode[], id: string, name: string): UnitNode[] {
  return nodes.map((node) =>
    node.id === id
      ? { ...node, name }
      : { ...node, children: renameIn(node.children, id, name) },
  );
}

export function useUnits(): UnitsController {
  const [state, setState] = useState<Loadable<UnitNode[]>>({
    data: null, loading: true, error: null,
  });
  // The last tree we showed. The optimistic rename needs something to put back that does
  // not depend on reading state inside a setState updater, which React may run twice.
  const last = useRef<UnitNode[] | null>(null);
  const [totals, setTotals] = useState<UnitTreeTotals | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await apiGet<{ data: UnitNode[]; meta: UnitTreeTotals }>('/units');
      last.current = response.data;
      if (alive.current) {
        setTotals(response.meta);
        setState({ data: response.data, loading: false, error: null });
      }
    } catch (error) {
      // The last good tree stays on screen; the page shows a retry above it (32 § States).
      if (alive.current) {
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (body: CreateUnitBody) => {
      const response = await apiPost<CreateUnitBody, { data: UnitNode[] }>('/units', body);
      await reload();
      return response.data;
    },
    [reload],
  );

  const rename = useCallback(async (id: string, name: string) => {
    const previous = last.current;
    if (previous) {
      const next = renameIn(previous, id, name);
      last.current = next;
      setState((current) => ({ ...current, data: next }));
    }
    try {
      await apiPatch<UpdateUnitBody, { data: UnitNode }>(`/units/${id}`, { name });
    } catch (error) {
      last.current = previous;
      setState((current) => ({ ...current, data: previous }));
      throw error;
    }
  }, []);

  const reparent = useCallback(
    async (id: string, newParentId: string | null) => {
      await apiPost<ReparentBody, { data: { ok: true } }>(`/units/${id}/reparent`, { newParentId });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string, reassignChildrenTo?: string) => {
      await apiDelete<{ data: { ok: true } }, DeleteUnitBody>(
        `/units/${id}`,
        reassignChildrenTo ? { reassignChildrenTo } : {},
      );
      await reload();
    },
    [reload],
  );

  return { ...state, totals, reload, create, rename, reparent, remove };
}

/**
 * Who the branch's people ARE — `DEC-083`, `32` § What a count on a unit means.
 *
 * Its own fetch rather than a field on the tree: the panel shows one unit at a time, and a
 * breakdown carried on every node would be roles × units on a page load that mostly never
 * reads it. `null` asks nothing, so the panel costs a request only once a unit is selected.
 */
export function useUnitComposition(unitId: string | null): Loadable<UnitComposition> {
  const [state, setState] = useState<Loadable<UnitComposition>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!unitId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    void apiGet<{ data: UnitComposition }>(`/units/${unitId}/composition`)
      .then((response) => {
        if (!cancelled) setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: Error) => {
        // Silent by design: the breakdown explains a number that is already on screen and
        // still correct without it. An error strip here would report the failure of the
        // footnote as though the stat itself were in doubt.
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  return state;
}

/**
 * What deleting or moving this unit actually costs, in numbers. Fetched when the confirm
 * dialog opens; until it answers the dialog's destructive button stays disabled, because a
 * confirmation with unknown consequences is one nobody should be able to accept (32).
 */
export const unitImpact = (id: string): Promise<UnitImpact> =>
  apiGet<{ data: UnitImpact }>(`/units/${id}/impact`).then((response) => response.data);
