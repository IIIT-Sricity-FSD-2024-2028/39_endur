// People reads. 34 § Data contract, 23 §3.
//
// Created by T-034 for the subjects page's linked-person picker, and it took `usePeopleIn`
// with it from `lib/units.ts` — a people query living in the units file was only ever
// convenience. `34-PAGE-people.md` owns this file when that page is built.
import { useEffect, useState } from 'react';
import type { Page, PersonSummary } from '@endur/shared';
import { apiGet } from './api.js';
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
