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
//
// On RTK Query since R-404 (`store/api/endpoints/people.ts`). Names and shapes unchanged.
// The import wizard's two requests moved here too (`usePeopleImport`): they were the last
// `apiPost` calls made from inside a component in this part of the console.
import { useCallback } from 'react';
import type {
  CreateAssignmentBody,
  CreatePersonBody,
  ImportPeopleBody,
  ImportPreview,
  Page,
  PersonDetail,
  PersonSummary,
  UpdatePersonBody,
} from '@endur/shared';
import {
  useAssignPersonMutation,
  useCreatePersonMutation,
  useDeletePersonMutation,
  useGetPeopleQuery,
  useGetPersonQuery,
  useImportPeopleMutation,
  usePreviewImportMutation,
  useUnassignPersonMutation,
  useUpdatePersonMutation,
  type ImportResult,
} from '../store/api/endpoints/people.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

export type { ImportResult };

/**
 * The first few people anchored in a unit, for the structure detail panel
 * (design_specs/design/04 §4.2). Scope-filtered by the API like every list — this never
 * filters for permission reasons (INV-003).
 */
export function usePeopleIn(unitId: string | null): Loadable<Page<PersonSummary>> {
  return usePeopleQuery(unitId ? `?unitId=${encodeURIComponent(unitId)}&limit=5` : null);
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
  return usePeopleQuery(trimmed.length >= 2 ? `?q=${encodeURIComponent(trimmed)}&limit=6` : null);
}

/**
 * `null` means "do not ask" — an empty search box must not fetch the whole directory.
 *
 * A new search never shows the last one's results (`current`). `loading` means "waiting,
 * with nothing to show": the panel prints "Loading…" above the list, and a re-read of a
 * list already on screen is not that.
 */
function usePeopleQuery(search: string | null): Loadable<Page<PersonSummary>> {
  const people = useLoadable(useGetPeopleQuery(search ?? '', { skip: search === null }), {
    current: true,
    initialOnly: true,
  });
  if (search === null) return { data: null, loading: false, error: null };
  return { data: people.data, loading: people.loading, error: people.error };
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

/** Built once so the cache key is a string rather than a freshly-made object. */
export function peopleSearch(query: PeopleQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.unitId) params.set('unitId', query.unitId);
  if (query.roleId) params.set('roleId', query.roleId);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The directory. The last good page stays on screen while the next one loads, and with the
 * error above it if a re-read fails (34 § States). Every command resolves once the list
 * has been re-read, as before: a row edited twice in a row must not be edited against the
 * old copy.
 */
export function usePeopleList(query: PeopleQuery): PeopleListController {
  const list = useLoadable(useGetPeopleQuery(peopleSearch(query)));
  const { reload } = list;
  const [createPerson] = useCreatePersonMutation();
  const [updatePerson] = useUpdatePersonMutation();
  const [deletePerson] = useDeletePersonMutation();
  const [assignPerson] = useAssignPersonMutation();
  const [unassignPerson] = useUnassignPersonMutation();

  const create = useCallback(
    async (body: CreatePersonBody) => {
      const created = await unwrapApi(createPerson(body));
      await reload();
      return created;
    },
    [createPerson, reload],
  );

  const update = useCallback(
    async (id: string, body: UpdatePersonBody) => {
      await unwrapApi(updatePerson({ id, body }));
      await reload();
    },
    [updatePerson, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await unwrapApi(deletePerson(id));
      await reload();
    },
    [deletePerson, reload],
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
      await unwrapApi(assignPerson({ id, body }));
      await reload();
    },
    [assignPerson, reload],
  );

  const unassign = useCallback(
    async (id: string, edgeId: string) => {
      await unwrapApi(unassignPerson({ id, edgeId }));
      await reload();
    },
    [unassignPerson, reload],
  );

  return { ...list, create, update, remove, assign, unassign };
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
 *
 * The re-read is the `{ Person, id }` tag each write invalidates; the promise resolves once
 * it is in. Moving to another person never shows the last one's record while it loads.
 */
export function usePerson(id: string): PersonController {
  const person = useLoadable(useGetPersonQuery(id), { current: true });
  const { reload } = person;
  const [updatePerson] = useUpdatePersonMutation();
  const [assignPerson] = useAssignPersonMutation();
  const [unassignPerson] = useUnassignPersonMutation();

  const patch = useCallback(
    async (body: UpdatePersonBody) => {
      await unwrapApi(updatePerson({ id, body }));
      await reload();
    },
    [id, updatePerson, reload],
  );

  return {
    ...person,
    rename: useCallback((name: string) => patch({ name }), [patch]),
    // Editable HERE and nowhere else in the product: an administrator changing somebody's
    // address is an identity change with an audit row against it, and `/profile` refuses
    // the same field for the same reason (47 § Data contract).
    setEmail: useCallback((email: string) => patch({ email }), [patch]),
    assign: useCallback(
      async (body: CreateAssignmentBody) => {
        await unwrapApi(assignPerson({ id, body }));
        await reload();
      },
      [id, assignPerson, reload],
    ),
    unassign: useCallback(
      async (edgeId: string) => {
        await unwrapApi(unassignPerson({ id, edgeId }));
        await reload();
      },
      [id, unassignPerson, reload],
    ),
  };
}

/* ------------------------------------------------------------------ the import */

export type PeopleImport = {
  /** What the file would do: its columns, a sample, and the names this org lacks. */
  preview: (csv: string) => Promise<ImportPreview>;
  /** `key` is the caller's idempotency key, derived from the file (`importKey`). */
  commit: (body: ImportPeopleBody, key: string) => Promise<ImportResult>;
};

/**
 * The CSV import's two requests, for `ImportWizard`. The commit re-reads the directory,
 * each role's head count and the branches' people by itself, so the list behind the wizard
 * is current when it closes.
 */
export function usePeopleImport(): PeopleImport {
  const [previewImport] = usePreviewImportMutation();
  const [importPeople] = useImportPeopleMutation();
  return {
    preview: useCallback((csv: string) => unwrapApi(previewImport(csv)), [previewImport]),
    commit: useCallback(
      (body: ImportPeopleBody, key: string) => unwrapApi(importPeople({ body, key })),
      [importPeople],
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
