// Roles, the powers grid and the capability catalogue on RTK Query. 33 § Data contract;
// docs/REDUX-PLAN.md §6.4 (R-403).
//
// THE POINT OF THIS FILE IS THE `Me` TAG. Before it, saving the grid reloaded the grid and
// nothing else: an administrator who gave their own role a power still saw the old nav and
// the old buttons until they reloaded the page. Anything here that can change what the
// signed-in user may do invalidates `Me`; the app shell's live `getMe` subscription then
// re-reads `/auth/me`, and `auth`'s `extraReducers` apply the new capability map.
//
// Which writes those are, from the server (`features/roles/service.ts`):
//   PUT /grants         writes grants, bumps the authz version        -> Me
//   POST /roles/reorder bumps the authz version                        -> Me
//   DELETE /roles/:id   moves its holders to another role, bumps it    -> Me
//   POST /roles         a new role holds NO grants (default deny)      -> not Me
//   PATCH /roles/:id    a rename; nobody's powers move                 -> not Me
import type {
  CapabilityMeta,
  GrantCell,
  GrantWarning,
  PutGrantsBody,
  RoleView,
} from '@endur/shared';
import { api } from '../api.js';

const ROLE_LIST = { type: 'Role', id: 'LIST' } as const;
/** The matrix and its warnings are tagged apart: a save answers with the matrix (written
 *  straight into the cache) but the warnings still have to be recomputed by the server. */
const MATRIX = { type: 'Grant', id: 'MATRIX' } as const;
const WARNINGS = { type: 'Grant', id: 'WARNINGS' } as const;
/** The catalogue and the warnings are worded in the tenant's own nouns, so a labels edit
 *  (which invalidates `Org`) re-reads them too. */
const NOUNS = { type: 'Org', id: 'NOUNS' } as const;

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const rolesApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Ordered by level: ORDERING ONLY, never authorisation (DEC-002, CONF-002). */
    getRoles: build.query<RoleView[], void>({
      query: () => '/roles',
      transformResponse: unwrap<RoleView[]>,
      providesTags: (roles) => [
        ...(roles?.map((role) => ({ type: 'Role' as const, id: role.id })) ?? []),
        ROLE_LIST,
      ],
    }),

    /** The grid's rows. Fixed by the application, so it changes only with the nouns. */
    getCapabilityCatalogue: build.query<CapabilityMeta[], void>({
      query: () => '/authz/capabilities',
      transformResponse: unwrap<CapabilityMeta[]>,
      providesTags: [NOUNS],
    }),

    getGrants: build.query<GrantCell[], void>({
      query: () => '/grants',
      transformResponse: unwrap<GrantCell[]>,
      providesTags: [MATRIX],
    }),

    getGrantWarnings: build.query<GrantWarning[], void>({
      query: () => '/grants/warnings',
      transformResponse: unwrap<GrantWarning[]>,
      providesTags: [WARNINGS, NOUNS],
    }),

    createRole: build.mutation<RoleView, string>({
      query: (name) => ({ url: '/roles', method: 'POST', body: { name } }),
      transformResponse: unwrap<RoleView>,
      invalidatesTags: [ROLE_LIST],
    }),

    renameRole: build.mutation<RoleView, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/roles/${id}`, method: 'PATCH', body: { name } }),
      // The answer carries zero counts (the server does not recount on a rename), so it is
      // re-read rather than written into the list.
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Role', id }, ROLE_LIST],
    }),

    /**
     * Levels are DERIVED server-side from the array's order (`14`, `33`), and the answer is
     * the server's own re-read of the list. It goes straight into the cache, which is what
     * proves the derivation agreed with what the screen showed, with no second request.
     */
    reorderRoles: build.mutation<RoleView[], string[]>({
      query: (orderedIds) => ({ url: '/roles/reorder', method: 'POST', body: { orderedIds } }),
      transformResponse: unwrap<RoleView[]>,
      invalidatesTags: ['Me'],
      onQueryStarted: async (_orderedIds, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(rolesApi.util.updateQueryData('getRoles', undefined, () => data));
        } catch {
          // The caller reports the failure; the list is left as it was.
        }
      },
    }),

    /** Its holders move to `reassignTo`, so their positions, the matrix and possibly the
     *  signed-in user's own powers all change. */
    deleteRole: build.mutation<void, { id: string; reassignTo?: string | undefined }>({
      query: ({ id, reassignTo }) => ({
        url: `/roles/${id}`,
        method: 'DELETE',
        body: reassignTo ? { reassignTo } : {},
      }),
      invalidatesTags: [ROLE_LIST, MATRIX, WARNINGS, 'Person', 'UnitComposition', 'Me'],
    }),

    /**
     * Save the grid: the DIFF, never the whole matrix (see `diffCells`). The server answers
     * with the whole matrix as it now stands, which goes straight into the cache; the
     * warnings, each role's grant count and the user's own powers are re-read.
     */
    putGrants: build.mutation<GrantCell[], PutGrantsBody>({
      query: (body) => ({ url: '/grants', method: 'PUT', body }),
      transformResponse: unwrap<GrantCell[]>,
      invalidatesTags: [WARNINGS, ROLE_LIST, 'Me'],
      onQueryStarted: async (_body, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(rolesApi.util.updateQueryData('getGrants', undefined, () => data));
        } catch {
          // The working copy survives a refused save; nothing to undo here.
        }
      },
    }),
  }),
});

export const {
  useGetRolesQuery,
  useGetCapabilityCatalogueQuery,
  useGetGrantsQuery,
  useGetGrantWarningsQuery,
  useCreateRoleMutation,
  useRenameRoleMutation,
  useReorderRolesMutation,
  useDeleteRoleMutation,
} = rolesApi;
