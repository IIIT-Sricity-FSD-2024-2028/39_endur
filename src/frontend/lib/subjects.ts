// Subjects — reads and writes. 35 § Data contract, 23 §3.
//
// The list is ONE request: `SubjectSummary` already carries `activeCampaigns`,
// `totalResponses` and `lastResponseAt`, computed server-side, because fetching them per
// row would turn an 18-row list into 19 requests and venue wifi gets a vote (35).
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateSubjectBody,
  Page,
  SubjectDetail,
  SubjectSummary,
  UpdateSubjectBody,
} from '@endur/shared';
import { apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type SubjectQuery = {
  q?: string | undefined;
  unitId?: string | undefined;
  archived?: boolean | undefined;
  cursor?: string | undefined;
};

export type SubjectListController = Loadable<Page<SubjectSummary>> & {
  reload: () => Promise<void>;
  create: (body: CreateSubjectBody) => Promise<SubjectSummary>;
  rename: (id: string, name: string) => Promise<void>;
  update: (id: string, body: UpdateSubjectBody) => Promise<void>;
  archive: (id: string) => Promise<void>;
};

/** The query string, built once so the effect can depend on a string rather than an object. */
export function subjectSearch(query: SubjectQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.unitId) params.set('unitId', query.unitId);
  // The API takes the literal 'true' / 'false' rather than a boolean, and only sends it
  // when asked for archived — the default list is live subjects (35).
  if (query.archived) params.set('archived', 'true');
  if (query.cursor) params.set('cursor', query.cursor);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function useSubjectList(query: SubjectQuery): SubjectListController {
  const [state, setState] = useState<Loadable<Page<SubjectSummary>>>({
    data: null, loading: true, error: null,
  });
  const last = useRef<Page<SubjectSummary> | null>(null);
  const alive = useRef(true);
  const search = subjectSearch(query);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (path: string) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const page = await apiGet<Page<SubjectSummary>>(`/subjects${path}`);
      last.current = page;
      if (alive.current) setState({ data: page, loading: false, error: null });
    } catch (error) {
      // The last good page stays on screen with the error above it (35 § States).
      if (alive.current) setState((current) => ({ ...current, loading: false, error: error as Error }));
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  const reload = useCallback(() => load(search), [load, search]);

  const create = useCallback(
    async (body: CreateSubjectBody) => {
      const response = await apiPost<CreateSubjectBody, { data: SubjectSummary }>('/subjects', body);
      await load(search);
      return response.data;
    },
    [load, search],
  );

  /**
   * Optimistic, with revert on failure (24 §7). It is one field, and renaming three
   * subjects must feel like typing rather than like three round trips.
   */
  const rename = useCallback(async (id: string, name: string) => {
    const previous = last.current;
    if (previous) {
      const next = {
        ...previous,
        data: previous.data.map((row) => (row.id === id ? { ...row, name } : row)),
      };
      last.current = next;
      setState((current) => ({ ...current, data: next }));
    }
    try {
      await apiPatch<UpdateSubjectBody, { data: SubjectSummary }>(`/subjects/${id}`, { name });
    } catch (error) {
      last.current = previous;
      setState((current) => ({ ...current, data: previous }));
      throw error;
    }
  }, []);

  const update = useCallback(
    async (id: string, body: UpdateSubjectBody) => {
      await apiPatch<UpdateSubjectBody, { data: SubjectSummary }>(`/subjects/${id}`, body);
      await load(search);
    },
    [load, search],
  );

  const archive = useCallback(
    async (id: string) => {
      await apiPost<undefined, { data: SubjectSummary }>(`/subjects/${id}/archive`);
      await load(search);
    },
    [load, search],
  );

  return { ...state, reload, create, rename, update, archive };
}

/** One subject, with its cycles. `GET /subjects/:id` answers both halves in one call. */
export function useSubject(id: string | undefined): Loadable<SubjectDetail> & {
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<SubjectDetail>>({
    data: null, loading: true, error: null,
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await apiGet<{ data: SubjectDetail }>(`/subjects/${id}`);
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
