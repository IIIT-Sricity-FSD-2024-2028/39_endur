// Templates on RTK Query. 36 § Data contract; docs/REDUX-PLAN.md §6.4 (R-201).
//
// Two lists, deliberately different shapes, because they are two different things:
//   GET /templates/library -> TemplateSummary[]       one copy for everybody
//   GET /templates         -> Page<TemplateSummary>   the org's own, cursor-paginated
//
// Tags: each org template is `{ Template, id }`; the org list is `{ Template, LIST }`; the
// library is `{ Template, LIBRARY }` and nothing an org does changes it.
import type {
  CreateTemplateBody,
  Page,
  QuestionInput,
  TemplateDetail,
  TemplateSummary,
  UpdateTemplateBody,
} from '@endur/shared';
import { api } from '../api.js';

const LIST = { type: 'Template', id: 'LIST' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const templatesApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The arg is the query string (`librarySearch`), so equal filters share a cache entry. */
    getTemplateLibrary: build.query<TemplateSummary[], string>({
      query: (search) => `/templates/library${search}`,
      transformResponse: unwrap<TemplateSummary[]>,
      providesTags: [{ type: 'Template', id: 'LIBRARY' }],
    }),

    getTemplates: build.query<Page<TemplateSummary>, string>({
      query: (search) => `/templates${search}`,
      providesTags: (page) => [
        ...(page?.data.map((row) => ({ type: 'Template' as const, id: row.id })) ?? []),
        LIST,
      ],
    }),

    getTemplate: build.query<TemplateDetail, string>({
      query: (id) => `/templates/${id}`,
      transformResponse: unwrap<TemplateDetail>,
      providesTags: (_result, _error, id) => [{ type: 'Template', id }],
    }),

    createTemplate: build.mutation<TemplateSummary, CreateTemplateBody>({
      query: (body) => ({ url: '/templates', method: 'POST', body }),
      transformResponse: unwrap<TemplateSummary>,
      invalidatesTags: [LIST],
    }),

    /**
     * Library → org, or org → org. `key` is the caller's idempotency key: a phone that
     * retries because the first response never arrived gets the FIRST clone back (13 §7).
     */
    cloneTemplate: build.mutation<TemplateDetail, { id: string; key: string; name?: string }>({
      query: ({ id, key, name }) => ({
        url: `/templates/${id}/clone`,
        method: 'POST',
        body: name ? { name } : {},
        idempotencyKey: key,
      }),
      transformResponse: unwrap<TemplateDetail>,
      invalidatesTags: [LIST],
    }),

    // Only the list. Invalidating the deleted template itself would refetch it, into a 404,
    // on the detail page that is about to navigate away from it.
    deleteTemplate: build.mutation<void, string>({
      query: (id) => ({ url: `/templates/${id}`, method: 'DELETE' }),
      invalidatesTags: [LIST],
    }),

    /** The builder's meta save: `PATCH`, never touching the questions (37). */
    updateTemplate: build.mutation<TemplateDetail, { id: string; body: UpdateTemplateBody }>({
      query: ({ id, body }) => ({ url: `/templates/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<TemplateDetail>,
      invalidatesTags: [LIST],
      onQueryStarted: ({ id }, lifecycle) => writeBack(id, lifecycle),
    }),

    /** The builder's question save: the whole set, in one transaction (37). */
    putQuestions: build.mutation<TemplateDetail, { id: string; questions: QuestionInput[] }>({
      query: ({ id, questions }) => ({
        url: `/templates/${id}/questions`,
        method: 'PUT',
        body: { questions },
      }),
      transformResponse: unwrap<TemplateDetail>,
      invalidatesTags: [LIST],
      onQueryStarted: ({ id }, lifecycle) => writeBack(id, lifecycle),
    }),
  }),
});

/**
 * Both builder saves answer with the whole template. Write it straight into that
 * template's cache entry rather than invalidating it: the builder saves every few seconds
 * while somebody types, and a refetch after each would be a wasted request whose answer is
 * already in hand. Preview then shows exactly what was saved.
 */
async function writeBack(
  id: string,
  { dispatch, queryFulfilled }: {
    dispatch: (action: unknown) => unknown;
    queryFulfilled: Promise<{ data: TemplateDetail }>;
  },
): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    dispatch(templatesApi.util.upsertQueryData('getTemplate', id, data));
  } catch {
    // The caller (the autosave listener) handles the failure; the cache is left as it was.
  }
}

export const {
  useGetTemplateLibraryQuery,
  useGetTemplatesQuery,
  useGetTemplateQuery,
  useCreateTemplateMutation,
  useCloneTemplateMutation,
  useDeleteTemplateMutation,
} = templatesApi;
