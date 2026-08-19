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
  Page,
  PersonSummary,
  ReparentBody,
  UnitImpact,
  UnitNode,
  UpdateUnitBody,
} from '@endur/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type UnitsController = Loadable<UnitNode[]> & {
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
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await apiGet<{ data: UnitNode[] }>('/units');
      last.current = response.data;
      if (alive.current) setState({ data: response.data, loading: false, error: null });
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

  return { ...state, reload, create, rename, reparent, remove };
}

/**
 * What deleting or moving this unit actually costs, in numbers. Fetched when the confirm
 * dialog opens; until it answers the dialog's destructive button stays disabled, because a
 * confirmation with unknown consequences is one nobody should be able to accept (32).
 */
export const unitImpact = (id: string): Promise<UnitImpact> =>
  apiGet<{ data: UnitImpact }>(`/units/${id}/impact`).then((response) => response.data);

/**
 * The first few people anchored in a unit, for the detail panel
 * (design_specs/design/04 §4.2). Scope-filtered by the API like every list — this never
 * filters for permission reasons (INV-003).
 */
export function usePeopleIn(unitId: string | null): Loadable<Page<PersonSummary>> {
  const [state, setState] = useState<Loadable<Page<PersonSummary>>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!unitId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    void apiGet<Page<PersonSummary>>(`/people?unitId=${encodeURIComponent(unitId)}&limit=5`)
      .then((page) => {
        if (!cancelled) setState({ data: page, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  return state;
}
