// Templates — reads and writes. 36 § Data contract, 23 §3.
//
// Two lists, deliberately different shapes, because they are two different things:
//
//   GET /templates/library   -> TemplateSummary[]   one copy for everybody, orgId IS NULL
//   GET /templates           -> Page<TemplateSummary>  the org's own, cursor-paginated
//
// The library is small, fixed and browsed by eye; paginating twenty cards would add a
// control that never has anything to do. The org's own list grows without limit.
import { useCallback } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type { CreateTemplateBody, Page, TemplateDetail, TemplateSummary } from '@endur/shared';
import type { AppDispatch } from '../store/index.js';
import {
  templatesApi,
  useCloneTemplateMutation,
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useGetTemplateLibraryQuery,
  useGetTemplateQuery,
  useGetTemplatesQuery,
} from '../store/api/endpoints/templates.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

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
  create: (body: CreateTemplateBody) => Promise<TemplateSummary>;
  /** Library → org, or org → org. Returns the NEW template, which is what the caller opens. */
  clone: (id: string, key: string, name?: string) => Promise<TemplateDetail>;
  remove: (id: string) => Promise<void>;
};

/**
 * Clone a template. `key` is the caller's idempotency key and is NOT generated here.
 *
 * 36 § Acceptance: a double-clicked clone produces one template. The client disables the
 * button while the request is in flight, which covers the double click; the key covers
 * the case the button cannot — a phone that retries the request because the first
 * response never arrived. The server returns the FIRST response either way (13 §7). The
 * caller owns the key because only the caller knows which press is a retry of which.
 *
 * Its own hook so a page that only clones (the builder) does not also load the list.
 */
export function useCloneTemplate(): TemplateListController['clone'] {
  const [clone] = useCloneTemplateMutation();
  return useCallback(
    (id: string, key: string, name?: string) =>
      unwrapApi(clone({ id, key, ...(name ? { name } : {}) })),
    [clone],
  );
}

/**
 * The org's own templates. Creating, cloning or deleting one invalidates the list, so it
 * refetches by itself: `remove` no longer reloads by hand, and a template cloned from
 * another page is in the list when you come back.
 */
export function useTemplates(query: { q?: string | undefined; cursor?: string | undefined } = {}): TemplateListController {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString() ? `?${params.toString()}` : '';

  // The last good page stays on screen with the error above it (36 § States): `data`.
  const list = useLoadable(useGetTemplatesQuery(search));
  const [createTemplate] = useCreateTemplateMutation();
  const [deleteTemplate] = useDeleteTemplateMutation();
  const clone = useCloneTemplate();

  const create = useCallback(
    (body: CreateTemplateBody) => unwrapApi(createTemplate(body)),
    [createTemplate],
  );
  const remove = useCallback(
    async (id: string) => {
      await unwrapApi(deleteTemplate(id));
    },
    [deleteTemplate],
  );

  return { ...list, create, clone, remove };
}

/** One template, with its questions. What the preview renders. */
export function useTemplate(id: string | undefined): Loadable<TemplateDetail> & {
  reload: () => Promise<void>;
} {
  // `current`: only this id's data, so a dialog opened for B never shows A's questions
  // while B loads. Skipped without an id, which reads as loading, as before.
  return useLoadable(useGetTemplateQuery(id ?? '', { skip: !id }), { current: true });
}

/**
 * Fetch one template fresh, once, for the builder (R-201).
 *
 * Not a `useTemplate`: the builder takes the server's copy exactly ONCE per visit and edits
 * from there, and a later refetch (on reconnect, say) must never replace what the reader is
 * typing. This answers with the result of this one request, and holds the cache
 * subscription until `release`, so Preview reads the same entry meanwhile.
 */
export function openTemplate(
  dispatch: AppDispatch,
  id: string,
): { loaded: Promise<TemplateDetail>; release: () => void } {
  const request = dispatch(templatesApi.endpoints.getTemplate.initiate(id, { forceRefetch: true }));
  return { loaded: unwrapApi(request), release: () => request.unsubscribe() };
}

/**
 * A key for one clone ATTEMPT, stable across retries of that attempt.
 *
 * `randomUUID` is not universal — it needs a secure context, and the demo may well run
 * over plain http from a phone on the venue wifi. The fallback is not a security control:
 * the key only has to be unique among this browser's own in-flight requests.
 */
export function cloneKey(templateId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `clone:${templateId}:${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
