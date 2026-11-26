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
// Every command (add, rename, positions, accounts, the CSV import) is a thunk in
// store/screens/people.ts since R-708 (DEC-R03): this file is the reads.
import type { Page, PersonDetail, PersonSummary } from '@endur/shared';
import { useGetPeopleQuery, useGetPersonQuery } from '../store/api/endpoints/people.js';
import { useLoadable, type Loadable } from './query.js';

export type { ImportResult } from '../store/api/endpoints/people.js';

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
  return useLoadable(useGetPeopleQuery(peopleSearch(query)));
}

/* ------------------------------------------------------------------ the detail page */

export type PersonController = Loadable<PersonDetail> & {
  reload: () => Promise<void>;
};

/**
 * One person, with their powers. `T-051`, `34` § Interactions. Moving to another person
 * never shows the last one's record while it loads (`current`).
 *
 * Its commands are thunks in store/screens/people.ts, and every one RE-READS the whole person
 * through the `{ Person, id }` tag rather than patching what came back: a position change
 * changes the POWERS, which are resolved server-side across the whole capability catalogue.
 */
export function usePerson(id: string): PersonController {
  return useLoadable(useGetPersonQuery(id), { current: true });
}

// The role picker's list, for the pages that assign positions: one import for both.
export { useRoles } from './roles.js';
