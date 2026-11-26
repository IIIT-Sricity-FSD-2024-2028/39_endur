// People on RTK Query. 34 § Data contract; docs/REDUX-PLAN.md §6.4 (R-404).
//
// Tags: each person is `{ Person, id }`, provided by every list they appear in and by their
// own detail read, so an edit to one person re-reads exactly the lists that show them. The
// directory as a whole is `{ Person, LIST }`, which a create or an import re-reads.
//
// **A position is a permission change** (`14` §8). Adding or ending one changes what that
// person may do, so it re-reads `Me` too (the administrator may be placing themselves), and
// each role's head count (`Role`), and who sits in each branch (`UnitComposition`).
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
import { api } from '../api.js';

const LIST = { type: 'Person', id: 'LIST' } as const;
const ROLE_LIST = { type: 'Role', id: 'LIST' } as const;

export type ImportResult = { created: number; updated: number; assigned: number; skipped: string[] };

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

/** What a position change re-reads: the person, and everything a permission change moves. */
const positionChanged = (id: string) =>
  [{ type: 'Person' as const, id }, 'UnitComposition' as const, ROLE_LIST, 'Me' as const];

export const peopleApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string, `?` included (`peopleSearch`): one entry per search. */
    getPeople: build.query<Page<PersonSummary>, string>({
      query: (search) => `/people${search}`,
      providesTags: (page) => [
        ...(page?.data.map((row) => ({ type: 'Person' as const, id: row.id })) ?? []),
        LIST,
      ],
    }),

    getPerson: build.query<PersonDetail, string>({
      query: (id) => `/people/${id}`,
      transformResponse: unwrap<PersonDetail>,
      providesTags: (_result, _error, id) => [{ type: 'Person', id }],
    }),

    createPerson: build.mutation<PersonSummary, CreatePersonBody>({
      query: (body) => ({ url: '/people', method: 'POST', body }),
      transformResponse: unwrap<PersonSummary>,
      invalidatesTags: [LIST, 'UnitComposition'],
    }),

    updatePerson: build.mutation<PersonSummary, { id: string; body: UpdatePersonBody }>({
      query: ({ id, body }) => ({ url: `/people/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<PersonSummary>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Person', id }],
    }),

    deletePerson: build.mutation<void, string>({
      query: (id) => ({ url: `/people/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Person', id }, 'UnitComposition', ROLE_LIST],
    }),

    /**
     * NOT optimistic, unlike a rename. INV-012 means this can legitimately be REFUSED
     * (`403 WOULD_ESCALATE`) even though the caller holds `assignment.create`, and a chip
     * that appeared and then vanished would read as a bug rather than as the rule it is.
     */
    assignPerson: build.mutation<void, { id: string; body: CreateAssignmentBody }>({
      query: ({ id, body }) => ({ url: `/people/${id}/assignments`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => positionChanged(id),
    }),

    unassignPerson: build.mutation<void, { id: string; edgeId: string }>({
      query: ({ id, edgeId }) => ({ url: `/people/${id}/assignments/${edgeId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { id }) => positionChanged(id),
    }),

    /** Reads the file and reports what it would do. Changes nothing, so re-reads nothing. */
    previewImport: build.mutation<ImportPreview, string>({
      query: (csv) => ({ url: '/people/import/preview', method: 'POST', body: { csv } }),
      transformResponse: unwrap<ImportPreview>,
    }),

    /**
     * The commit. `key` is derived from the file, so committing the same file twice (a
     * double click, a retry after a dropped response) is one import (13 §7).
     */
    importPeople: build.mutation<ImportResult, { body: ImportPeopleBody; key: string }>({
      query: ({ body, key }) => ({ url: '/people/import', method: 'POST', body, idempotencyKey: key }),
      transformResponse: unwrap<ImportResult>,
      invalidatesTags: [LIST, 'UnitComposition', ROLE_LIST, 'Me'],
    }),
  }),
});

export const {
  useGetPeopleQuery,
  useGetPersonQuery,
  useCreatePersonMutation,
  useUpdatePersonMutation,
  useDeletePersonMutation,
  useAssignPersonMutation,
  useUnassignPersonMutation,
  usePreviewImportMutation,
  useImportPeopleMutation,
} = peopleApi;
