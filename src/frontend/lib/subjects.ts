// Subjects — reads and writes. 35 § Data contract, 23 §3.
//
// The list is ONE request: `SubjectSummary` already carries `activeCampaigns`,
// `totalResponses` and `lastResponseAt`, computed server-side, because fetching them per
// row would turn an 18-row list into 19 requests and venue wifi gets a vote (35).
//
// On RTK Query since R-405 (`store/api/endpoints/subjects.ts`). Names and shapes unchanged.
import { useCallback } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type {
  CreateSubjectBody,
  Page,
  SubjectDetail,
  SubjectSummary,
  UpdateSubjectBody,
} from '@endur/shared';
import {
  useArchiveSubjectMutation,
  useCreateSubjectMutation,
  useGetSubjectQuery,
  useGetSubjectsQuery,
  useRenameSubjectMutation,
  useUpdateSubjectMutation,
} from '../store/api/endpoints/subjects.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

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

/** The query string, built once so the cache key is a string rather than an object. */
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

/**
 * The list. The last good page stays on screen while the next loads, and with the error
 * above it if a re-read fails (35 § States).
 *
 * The simulator searches on every keystroke, and this used to number its requests so an
 * older, slower answer arriving last could not replace the right one. Each search is now
 * its own cache entry, and the hook reads the entry for what the box says, so a late answer
 * lands in its own entry and is simply not the one on screen.
 */
/** `enabled: false` asks nothing: a page that only sometimes shows the list (Inbox's filters). */
export function useSubjectList(query: SubjectQuery, enabled = true): SubjectListController {
  const list = useLoadable(useGetSubjectsQuery(enabled ? subjectSearch(query) : skipToken));
  const { reload } = list;
  const [createSubject] = useCreateSubjectMutation();
  const [renameSubject] = useRenameSubjectMutation();
  const [updateSubject] = useUpdateSubjectMutation();
  const [archiveSubject] = useArchiveSubjectMutation();

  const create = useCallback(
    async (body: CreateSubjectBody) => {
      const created = await unwrapApi(createSubject(body));
      await reload();
      return created;
    },
    [createSubject, reload],
  );

  /**
   * Optimistic, with revert on failure (24 §7). It is one field, and renaming three
   * subjects must feel like typing rather than like three round trips.
   */
  const rename = useCallback(
    async (id: string, name: string) => {
      await unwrapApi(renameSubject({ id, name }));
    },
    [renameSubject],
  );

  const update = useCallback(
    async (id: string, body: UpdateSubjectBody) => {
      await unwrapApi(updateSubject({ id, body }));
      await reload();
    },
    [updateSubject, reload],
  );

  const archive = useCallback(
    async (id: string) => {
      await unwrapApi(archiveSubject(id));
      await reload();
    },
    [archiveSubject, reload],
  );

  return { ...list, create, rename, update, archive };
}

/**
 * One subject, with its cycles. Without an id it asks nothing and reads as loading, as
 * before; moving to another subject never shows the last one while it loads.
 */
export function useSubject(id: string | undefined): Loadable<SubjectDetail> & {
  reload: () => Promise<void>;
} {
  return useLoadable(useGetSubjectQuery(id ?? '', { skip: !id }), { current: true });
}
