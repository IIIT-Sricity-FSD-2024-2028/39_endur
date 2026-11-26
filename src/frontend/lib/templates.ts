// Templates — reads and writes. 36 § Data contract, 23 §3.
//
// Two lists, deliberately different shapes, because they are two different things:
//
//   GET /templates/library   -> TemplateSummary[]   one copy for everybody, orgId IS NULL
//   GET /templates           -> Page<TemplateSummary>  the org's own, cursor-paginated
//
// The library is small, fixed and browsed by eye; paginating twenty cards would add a
// control that never has anything to do. The org's own list grows without limit.
import { skipToken } from '@reduxjs/toolkit/query';
import type { Page, TemplateDetail, TemplateSummary } from '@endur/shared';
import {
  useGetTemplateLibraryQuery,
  useGetTemplateQuery,
  useGetTemplatesQuery,
} from '../store/api/endpoints/templates.js';
import { useLoadable, type Loadable } from './query.js';

export type LibraryFilters = { industry?: string | undefined; category?: string | undefined };

/** The query string, built once so the cache key is a string rather than an object. */
export function librarySearch(filters: LibraryFilters): string {
  const params = new URLSearchParams();
  if (filters.industry) params.set('industry', filters.industry);
  if (filters.category) params.set('category', filters.category);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The shared library.
 *
 * The industry filter is applied CLIENT-SIDE by the page, not through this hook, and the
 * reason is 36 § State: the filter defaults to the org's own industry, but the other
 * industries must stay visible rather than being hidden by a default nobody chose. One
 * fetch of ~20 cards, then filter in the browser, means switching the segment is instant
 * and "show me everything" costs no request at all.
 */
export function useTemplateLibrary(filters: LibraryFilters = {}, enabled = true): Loadable<TemplateSummary[]> & {
  reload: () => Promise<void>;
} {
  return useLoadable(useGetTemplateLibraryQuery(enabled ? librarySearch(filters) : skipToken));
}

export type TemplateListController = Loadable<Page<TemplateSummary>> & {
  reload: () => Promise<void>;
};

/**
 * The org's own templates. Creating, copying or deleting one (the thunks in
 * store/screens/templates.ts) invalidates the list, so it refetches by itself, and a
 * template copied from another page is in the list when you come back.
 */
export function useTemplates(query: { q?: string | undefined; cursor?: string | undefined } = {}): TemplateListController {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString() ? `?${params.toString()}` : '';

  // The last good page stays on screen with the error above it (36 § States): `data`.
  return useLoadable(useGetTemplatesQuery(search));
}

/** One template, with its questions. What the preview renders. */
export function useTemplate(id: string | undefined): Loadable<TemplateDetail> & {
  reload: () => Promise<void>;
} {
  // `current`: only this id's data, so a dialog opened for B never shows A's questions
  // while B loads. Skipped without an id, which reads as loading, as before.
  return useLoadable(useGetTemplateQuery(id ?? '', { skip: !id }), { current: true });
}


