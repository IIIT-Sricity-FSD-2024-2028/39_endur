// The unit tree on RTK Query. 32 § Data contract; docs/REDUX-PLAN.md §6.4 (R-402).
//
// ONE cache entry for the whole tree. A dozen screens read it (structure, people, the
// person page, the import wizard, subjects, results, analysis, the simulator, the
// campaign and announcement composers), and before this each of them fetched `/units` on
// its own: the People page alone asked three times. Now they share one request, and a
// change made on the Structure page is in every one of them.
//
// Two mutation policies, and the difference is deliberate (32 § State):
//   - RENAME is OPTIMISTIC, with revert on failure: the cache is patched before the request
//     goes out, and the patch is undone if it fails. One field, and the demo depends on it
//     feeling instant.
//   - REPARENT is not. A move that silently fails the server's cycle check and then snaps
//     back is worse than a brief wait, and the cycle check is the whole reason the server
//     is the authority here. It invalidates the tree, which is re-read.
//
// Tags: the tree is `{ Unit, LIST }`, plus `{ Unit, id }` for every node in it. Who sits in
// a branch is `{ UnitComposition, id }`. `Home`'s coverage counts move with the tree.
import type {
  CreateUnitBody,
  UnitComposition,
  UnitNode,
  UnitTreeTotals,
} from '@endur/shared';
import { api } from '../api.js';

/** `/units` as the server sends it: the forest, and its own totals in `meta` (DEC-082). */
export type UnitTree = { data: UnitNode[]; meta: UnitTreeTotals };

const LIST = { type: 'Unit', id: 'LIST' } as const;

/** Every id in the forest, depth first. */
function idsOf(nodes: UnitNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.id);
    idsOf(node.children, into);
  }
  return into;
}

/** Find one node in the forest, to patch it in place. */
function find(nodes: UnitNode[], id: string): UnitNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const below = find(node.children, id);
    if (below) return below;
  }
  return undefined;
}

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const unitsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getUnits: build.query<UnitTree, void>({
      query: () => '/units',
      providesTags: (tree) => [
        ...idsOf(tree?.data ?? []).map((id) => ({ type: 'Unit' as const, id })),
        LIST,
      ],
    }),

    /**
     * Who the branch's people ARE (`DEC-083`). Its own request rather than a field on the
     * tree: the panel shows one unit at a time, and a breakdown on every node would be
     * roles × units on a page load that mostly never reads it.
     */
    getUnitComposition: build.query<UnitComposition, string>({
      query: (id) => `/units/${id}/composition`,
      transformResponse: unwrap<UnitComposition>,
      providesTags: (_result, _error, id) => [{ type: 'UnitComposition', id }],
    }),

    /** Answers with the units it created (a path can create several). */
    createUnit: build.mutation<UnitNode[], CreateUnitBody>({
      query: (body) => ({ url: '/units', method: 'POST', body }),
      transformResponse: unwrap<UnitNode[]>,
      invalidatesTags: [LIST, 'Home'],
    }),

    /**
     * Optimistic: the tree on every screen has the new name before the request is sent,
     * and gets the old one back if the server refuses it. The tree is not re-read, since
     * nothing else in it changed. People's positions carry the unit's name, so they are.
     */
    renameUnit: build.mutation<UnitNode, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/units/${id}`, method: 'PATCH', body: { name } }),
      transformResponse: unwrap<UnitNode>,
      invalidatesTags: ['Person'],
      onQueryStarted: async ({ id, name }, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          unitsApi.util.updateQueryData('getUnits', undefined, (tree) => {
            const node = find(tree.data, id);
            if (node) node.name = name;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    /** Not optimistic: the server's cycle check decides, and the tree is re-read after. */
    reparentUnit: build.mutation<void, { id: string; newParentId: string | null }>({
      query: ({ id, newParentId }) => ({
        url: `/units/${id}/reparent`,
        method: 'POST',
        body: { newParentId },
      }),
      invalidatesTags: (_result, _error, { id }) => [LIST, { type: 'UnitComposition', id }, 'Home'],
    }),

    /** Its children move to `reassignChildrenTo`, or the delete is refused. */
    deleteUnit: build.mutation<void, { id: string; reassignChildrenTo?: string | undefined }>({
      query: ({ id, reassignChildrenTo }) => ({
        url: `/units/${id}`,
        method: 'DELETE',
        body: reassignChildrenTo ? { reassignChildrenTo } : {},
      }),
      invalidatesTags: [LIST, 'UnitComposition', 'Person', 'Home'],
    }),
  }),
});

export const {
  useGetUnitsQuery,
  useGetUnitCompositionQuery,
  useCreateUnitMutation,
  useRenameUnitMutation,
  useReparentUnitMutation,
  useDeleteUnitMutation,
} = unitsApi;
