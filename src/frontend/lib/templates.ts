// Templates — reads and writes. 36 § Data contract, 23 §3.
//
// Two lists, deliberately different shapes, because they are two different things:
//
//   GET /templates/library   -> TemplateSummary[]   one copy for everybody, orgId IS NULL
//   GET /templates           -> Page<TemplateSummary>  the org's own, cursor-paginated
//
// The library is small, fixed and browsed by eye; paginating twenty cards would add a
// control that never has anything to do. The org's own list grows without limit.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateTemplateBody,
  Page,
  TemplateDetail,
  TemplateSummary,
} from '@endur/shared';
import { apiDelete, apiGet, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type LibraryFilters = { industry?: string | undefined; category?: string | undefined };

/** The query string, built once so the effect depends on a string rather than an object. */
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
export function useTemplateLibrary(filters: LibraryFilters = {}): Loadable<TemplateSummary[]> & {
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<TemplateSummary[]>>({
    data: null, loading: true, error: null,
  });
  const search = librarySearch(filters);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await apiGet<{ data: TemplateSummary[] }>(`/templates/library${search}`);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}

export type TemplateListController = Loadable<Page<TemplateSummary>> & {
  reload: () => Promise<void>;
  create: (body: CreateTemplateBody) => Promise<TemplateSummary>;
  /** Library → org, or org → org. Returns the NEW template, which is what the caller opens. */
  clone: (id: string, key: string, name?: string) => Promise<TemplateDetail>;
  remove: (id: string) => Promise<void>;
};

export function useTemplates(query: { q?: string | undefined; cursor?: string | undefined } = {}): TemplateListController {
  const [state, setState] = useState<Loadable<Page<TemplateSummary>>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);

  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString() ? `?${params.toString()}` : '';

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (path: string) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await apiGet<Page<TemplateSummary>>(`/templates${path}`);
      if (alive.current) setState({ data: page, loading: false, error: null });
    } catch (error) {
      // The last good page stays on screen with the error above it (36 § States).
      if (alive.current) setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  const reload = useCallback(() => load(search), [load, search]);

  const create = useCallback(async (body: CreateTemplateBody) => {
    const response = await apiPost<CreateTemplateBody, { data: TemplateSummary }>('/templates', body);
    return response.data;
  }, []);

  /**
   * `key` is the caller's idempotency key and is NOT generated here.
   *
   * 36 § Acceptance: a double-clicked clone produces one template. The client disables the
   * button while the request is in flight, which covers the double click; the key covers
   * the case the button cannot — a phone that retries the request because the first
   * response never arrived. The server returns the FIRST response either way (13 §7). The
   * caller owns the key because only the caller knows which press is a retry of which.
   */
  const clone = useCallback(async (id: string, key: string, name?: string) => {
    const response = await apiPost<{ name?: string }, { data: TemplateDetail }>(
      `/templates/${id}/clone`,
      name ? { name } : {},
      { idempotencyKey: key },
    );
    return response.data;
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await apiDelete<{ data: { ok: true } }>(`/templates/${id}`);
      await load(search);
    },
    [load, search],
  );

  return { ...state, reload, create, clone, remove };
}

/** One template, with its questions. What the preview renders. */
export function useTemplate(id: string | undefined): Loadable<TemplateDetail> & {
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<TemplateDetail>>({
    data: null, loading: true, error: null,
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await apiGet<{ data: TemplateDetail }>(`/templates/${id}`);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
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
