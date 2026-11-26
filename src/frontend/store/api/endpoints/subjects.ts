// Subjects on RTK Query. 35 § Data contract; docs/REDUX-PLAN.md §6.4 (R-405).
//
// The list is ONE request: `SubjectSummary` already carries `activeCampaigns`,
// `totalResponses` and `lastResponseAt`, computed server-side, because fetching them per
// row would turn an 18-row list into 19 requests and venue wifi gets a vote (35).
//
// Tags: each subject is `{ Subject, id }`, provided by every list it appears in and by its
// own detail read; the list as a whole is `{ Subject, LIST }`.
import type {
  CreateSubjectBody,
  Page,
  SubjectDetail,
  SubjectSummary,
  UpdateSubjectBody,
} from '@endur/shared';
import { api } from '../api.js';
import type { RootState } from '../../index.js';

const LIST = { type: 'Subject', id: 'LIST' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const subjectsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string (`subjectSearch`): one cache entry per search. */
    getSubjects: build.query<Page<SubjectSummary>, string>({
      query: (search) => `/subjects${search}`,
      providesTags: (page) => [
        ...(page?.data.map((row) => ({ type: 'Subject' as const, id: row.id })) ?? []),
        LIST,
      ],
    }),

    /** One subject with its cycles: `GET /subjects/:id` answers both halves in one call. */
    getSubject: build.query<SubjectDetail, string>({
      query: (id) => `/subjects/${id}`,
      transformResponse: unwrap<SubjectDetail>,
      providesTags: (_result, _error, id) => [{ type: 'Subject', id }],
    }),

    createSubject: build.mutation<SubjectSummary, CreateSubjectBody>({
      query: (body) => ({ url: '/subjects', method: 'POST', body }),
      transformResponse: unwrap<SubjectSummary>,
      invalidatesTags: [LIST, 'Home'],
    }),

    /**
     * OPTIMISTIC, with revert on failure (24 §7): one field, and renaming three subjects
     * must feel like typing rather than like three round trips.
     *
     * Every cached read that shows this subject is patched, not just the list the rename
     * came from: the same subject can be on screen in the list, a filtered list and the
     * detail header at once (`selectInvalidatedBy` finds them by its tag).
     */
    renameSubject: build.mutation<SubjectSummary, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/subjects/${id}`, method: 'PATCH', body: { name } }),
      transformResponse: unwrap<SubjectSummary>,
      onQueryStarted: async ({ id, name }, lifecycle) => {
        const { dispatch, queryFulfilled } = lifecycle;
        const patches = subjectsApi.util
          .selectInvalidatedBy(lifecycle.getState() as RootState, [{ type: 'Subject', id }])
          .map(({ endpointName, originalArgs }) => {
            if (endpointName === 'getSubjects') {
              return dispatch(
                subjectsApi.util.updateQueryData('getSubjects', originalArgs as string, (page) => {
                  const row = page.data.find((subject) => subject.id === id);
                  if (row) row.name = name;
                }),
              );
            }
            if (endpointName === 'getSubject') {
              return dispatch(
                subjectsApi.util.updateQueryData('getSubject', originalArgs as string, (subject) => {
                  subject.name = name;
                }),
              );
            }
            return null;
          });
        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) patch?.undo();
        }
      },
    }),

    updateSubject: build.mutation<SubjectSummary, { id: string; body: UpdateSubjectBody }>({
      query: ({ id, body }) => ({ url: `/subjects/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<SubjectSummary>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Subject', id }],
    }),

    /** It leaves the live list for the archived one, so both are re-read. */
    archiveSubject: build.mutation<SubjectSummary, string>({
      query: (id) => ({ url: `/subjects/${id}/archive`, method: 'POST' }),
      transformResponse: unwrap<SubjectSummary>,
      invalidatesTags: (_result, _error, id) => [{ type: 'Subject', id }, LIST, 'Home'],
    }),
  }),
});

export const {
  useGetSubjectsQuery,
  useGetSubjectQuery,
  useCreateSubjectMutation,
  useRenameSubjectMutation,
  useUpdateSubjectMutation,
  useArchiveSubjectMutation,
} = subjectsApi;
