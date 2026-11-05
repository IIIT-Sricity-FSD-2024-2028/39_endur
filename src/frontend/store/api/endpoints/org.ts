// The organisation on RTK Query. 31, 48 § Data contract; docs/REDUX-PLAN.md §6.4 (R-401).
//
// Two things here change what the app SHELL shows, not only the Settings page: the org's
// name and industry (the top bar), and its labels (every noun on every screen). Both are in
// `/auth/me`, so both invalidate `Me`, and `auth` and `vocabulary` take the new values from
// its re-read through their `extraReducers`. Before this, renaming the organisation left the
// old name in the top bar until a reload.
//
// Tags: the org itself is `{ Org, CURRENT }`. `{ Org, NOUNS }` is everything the SERVER
// words in the tenant's nouns (the capability catalogue, the grid's warnings), which a
// labels edit re-reads.
import type { LabelSet, OrgView, PresetView, SetupOrgBody, UpdateOrgBody } from '@endur/shared';
import { api } from '../api.js';

const ORG = { type: 'Org', id: 'CURRENT' } as const;
const NOUNS = { type: 'Org', id: 'NOUNS' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const orgApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The preset catalogue: fixed by the application, so it provides no tag. */
    getPresets: build.query<PresetView[], void>({
      query: () => '/org/presets',
      transformResponse: unwrap<PresetView[]>,
    }),

    getOrg: build.query<OrgView, void>({
      query: () => '/org',
      transformResponse: unwrap<OrgView>,
      providesTags: [ORG],
    }),

    /**
     * The wizard's commit. ONE request, ONE transaction: the server seeds roles, units,
     * derived grants and the preset's starter templates atomically. Everything those
     * touch is re-read, the user's own powers included.
     */
    setupOrg: build.mutation<OrgView, SetupOrgBody>({
      query: (body) => ({ url: '/org/setup', method: 'POST', body }),
      transformResponse: unwrap<OrgView>,
      invalidatesTags: ['Org', 'Role', 'Grant', 'Unit', 'UnitComposition', 'Template', 'Home', 'Me'],
    }),

    /** Name and industry. Both are in the top bar, through `/auth/me`. */
    updateOrg: build.mutation<OrgView, UpdateOrgBody>({
      query: (body) => ({ url: '/org', method: 'PATCH', body }),
      transformResponse: unwrap<OrgView>,
      invalidatesTags: ['Me'],
      onQueryStarted: (_body, lifecycle) => writeBack(lifecycle),
    }),

    /**
     * Labels are PATCHed per key and merged server-side (`22` §3): a whole-set write would
     * silently discard a rename the caller did not have on screen.
     */
    updateLabels: build.mutation<OrgView, LabelSet>({
      query: (labels) => ({ url: '/org/labels', method: 'PATCH', body: { labels } }),
      transformResponse: unwrap<OrgView>,
      invalidatesTags: ['Me', NOUNS],
      onQueryStarted: (_labels, lifecycle) => writeBack(lifecycle),
    }),

    /**
     * The logo (48), as multipart: `request()` sends a `FormData` body as-is. The answer is
     * the file, not the org, so the org is re-read. A mutation keeps no argument in the
     * store, so the `File` never reaches it.
     */
    uploadLogo: build.mutation<void, File>({
      query: (file) => {
        const form = new FormData();
        form.append('file', file);
        return { url: '/org/logo', method: 'POST', body: form };
      },
      invalidatesTags: [ORG],
    }),

    removeLogo: build.mutation<void, void>({
      query: () => ({ url: '/org/logo', method: 'DELETE' }),
      invalidatesTags: [ORG],
    }),
  }),
});

/**
 * An update answers with the whole org: write it straight into the cache, so the page has
 * the saved values the moment the promise resolves, with no second request.
 * `updateQueryData` is synchronous, so it lands before the caller's `await` continues.
 */
async function writeBack({ dispatch, queryFulfilled }: {
  dispatch: (action: unknown) => unknown;
  queryFulfilled: Promise<{ data: OrgView }>;
}): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    dispatch(orgApi.util.updateQueryData('getOrg', undefined, () => data));
  } catch {
    // The caller reports the failure; the cache is left as it was.
  }
}

export const {
  useGetPresetsQuery,
  useGetOrgQuery,
  useSetupOrgMutation,
  useUpdateOrgMutation,
  useUpdateLabelsMutation,
  useUploadLogoMutation,
  useRemoveLogoMutation,
} = orgApi;
