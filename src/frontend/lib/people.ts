// People — reads and writes. 34 § Data contract, 23 §3.
//
// Created by T-034 for the subjects page's linked-person picker, and it took `usePeopleIn`
// with it from `lib/units.ts` — a people query living in the units file was only ever
// convenience. `34-PAGE-people.md` owns this file, and T-050 is where it stopped being
// read-only.
//
// **Creating a person and giving them a position are two calls, and this file keeps them
// two calls** (`14` §8). Granting a position is a permission change and has to appear in
// the audit log as one; bundling it into the create would also make "who gave them that?"
// unanswerable for the commonest way people get access. The UI hides the seam by asking
// both questions in one dialog — it does not remove it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateAssignmentBody,
  CreatePersonBody,
  Page,
  PersonDetail,
  PersonSummary,
  UpdatePersonBody,
} from '@endur/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

/**
 * The first few people anchored in a unit, for the structure detail panel
 * (design_specs/design/04 §4.2). Scope-filtered by the API like every list — this never
 * filters for permission reasons (INV-003).
 */
export function usePeopleIn(unitId: string | null): Loadable<Page<PersonSummary>> {
  return usePeopleQuery(unitId ? `unitId=${encodeURIComponent(unitId)}&limit=5` : null);
}

/**
 * Name search, for choosing the person a subject is about (35 § Interactions).
 *
 * Explicit selection only — 35 rules out auto-linking by name, because a silent wrong match
 * makes one person's review land on another's record, and nothing about the screen would
 * show it. The search is a way to find a person, never a way to guess one.
 */
export function usePeopleSearch(term: string): Loadable<Page<PersonSummary>> {
  const trimmed = term.trim();
  return usePeopleQuery(trimmed.length >= 2 ? `q=${encodeURIComponent(trimmed)}&limit=6` : null);
}

/** `null` means "do not ask" — an empty search box must not fetch the whole directory. */
function usePeopleQuery(search: string | null): Loadable<Page<PersonSummary>> {
  const [state, setState] = useState<Loadable<Page<PersonSummary>>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!search) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    void apiGet<Page<PersonSummary>>(`/people?${search}`)
      .then((page) => {
        if (!cancelled) setState({ data: page, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  return state;
}

/* ------------------------------------------------------------------ the list page */

export type PeopleQuery = {
  q?: string | undefined;
  unitId?: string | undefined;
  roleId?: string | undefined;
  cursor?: string | undefined;
};

export type PeopleListController = Loadable<Page<PersonSummary>> & {
  reload: () => Promise<void>;
  create: (body: CreatePersonBody) => Promise<PersonSummary>;
  update: (id: string, body: UpdatePersonBody) => Promise<void>;
  remove: (id: string) => Promise<void>;
  assign: (id: string, body: CreateAssignmentBody) => Promise<void>;
  unassign: (id: string, edgeId: string) => Promise<void>;
};

/** Built once so the effect depends on a string rather than a freshly-made object. */
export function peopleSearch(query: PeopleQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.unitId) params.set('unitId', query.unitId);
  if (query.roleId) params.set('roleId', query.roleId);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function usePeopleList(query: PeopleQuery): PeopleListController {
  const [state, setState] = useState<Loadable<Page<PersonSummary>>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);
  const search = peopleSearch(query);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (path: string) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await apiGet<Page<PersonSummary>>(`/people${path}`);
      if (alive.current) setState({ data: page, loading: false, error: null });
    } catch (error) {
      // The last good page stays on screen with the error above it (34 § States).
      if (alive.current) {
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  const reload = useCallback(() => load(search), [load, search]);

  const create = useCallback(
    async (body: CreatePersonBody) => {
      const response = await apiPost<CreatePersonBody, { data: PersonSummary }>('/people', body);
      await load(search);
      return response.data;
    },
    [load, search],
  );

  const update = useCallback(
    async (id: string, body: UpdatePersonBody) => {
      await apiPatch<UpdatePersonBody, { data: PersonSummary }>(`/people/${id}`, body);
      await load(search);
    },
    [load, search],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiDelete(`/people/${id}`);
      await load(search);
    },
    [load, search],
  );

  /**
   * NOT optimistic, unlike a rename (`lib/subjects.ts`). A position is a permission change:
   * showing it as applied before the server agreed would mean the screen claims somebody has
   * powers they may not have — and INV-012 means this call can legitimately be REFUSED
   * (`403 WOULD_ESCALATE`) even though the caller holds `assignment.create`. An optimistic
   * chip that then vanished would read as a bug rather than as the rule it is.
   */
  const assign = useCallback(
    async (id: string, body: CreateAssignmentBody) => {
      await apiPost<CreateAssignmentBody, { data: PersonSummary }>(
        `/people/${id}/assignments`,
        body,
      );
      await load(search);
    },
    [load, search],
  );

  const unassign = useCallback(
    async (id: string, edgeId: string) => {
      await apiDelete(`/people/${id}/assignments/${edgeId}`);
      await load(search);
    },
    [load, search],
  );

  return { ...state, reload, create, update, remove, assign, unassign };
}

/* ------------------------------------------------------------------ the detail page */

export type PersonController = Loadable<PersonDetail> & {
  reload: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  setEmail: (email: string) => Promise<void>;
  assign: (body: CreateAssignmentBody) => Promise<void>;
  unassign: (edgeId: string) => Promise<void>;
};

/**
 * One person, with their powers. `T-051`, `34` § Interactions.
 *
 * Every write here RE-READS the whole person rather than patching what came back, and that
 * is not laziness — a position change changes the POWERS, and the powers are resolved
 * server-side across the whole capability catalogue. There is no client-side way to work out
 * what adding "Tutor at Section B" grants somebody, and a screen that showed the new chip
 * beside the old power list would be showing a state that never existed.
 */
export function usePerson(id: string): PersonController {
  const [state, setState] = useState<Loadable<PersonDetail>>({
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
      const { data } = await apiGet<{ data: PersonDetail }>(`/people/${id}`);
      if (alive.current) setState({ data, loading: false, error: null });
    } catch (error) {
      // The last good copy stays on screen with the error above it, like the list (34).
      if (alive.current) {
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (body: UpdatePersonBody) => {
      await apiPatch<UpdatePersonBody, { data: PersonSummary }>(`/people/${id}`, body);
      await load();
    },
    [id, load],
  );

  return {
    ...state,
    reload: load,
    rename: useCallback((name: string) => patch({ name }), [patch]),
    // Editable HERE and nowhere else in the product: an administrator changing somebody's
    // address is an identity change with an audit row against it, and `/profile` refuses
    // the same field for the same reason (47 § Data contract).
    setEmail: useCallback((email: string) => patch({ email }), [patch]),
    assign: useCallback(
      async (body: CreateAssignmentBody) => {
        await apiPost<CreateAssignmentBody, { data: PersonSummary }>(
          `/people/${id}/assignments`,
          body,
        );
        await load();
      },
      [id, load],
    ),
    unassign: useCallback(
      async (edgeId: string) => {
        await apiDelete(`/people/${id}/assignments/${edgeId}`);
        await load();
      },
      [id, load],
    ),
  };
}

/**
 * MOVED TO `lib/roles.ts` AT T-052, and re-exported here so this file's callers are
 * untouched. `33` owns roles; T-034 put the hook here only because the position picker's
 * first dropdown was the first thing that ever needed it, and two hooks fetching `/roles`
 * would be two places to fix when the shape changes.
 */
export { useRoles } from './roles.js';
