// The org API, as an RTK Query API slice. docs/REDUX-PLAN.md §6, R-102.
//
// No endpoints here. Each domain adds its own with `api.injectEndpoints` in
// `store/api/endpoints/*.ts`, so two people never edit the same file, and a route's
// endpoints load with that route.
//
// EVERY tag type is declared here, once, before any endpoint uses it (§6.4). Each list
// provides `{ type, id }` per row plus `{ type, id: 'LIST' }`. `Me` is the capability
// refresh: anything that changes what the signed-in user may do invalidates it, and the
// app shell's live `getMe` subscription refetches `/auth/me`.
import { createApi } from '@reduxjs/toolkit/query/react';
import { apiBaseQuery } from './baseQuery.js';

export const TAG_TYPES = [
  'Me',
  'Home',
  'Template',
  'Campaign',
  'Result',
  'Org',
  'Unit',
  'UnitComposition',
  'Role',
  'Grant',
  'Person',
  'Subject',
  'Account',
  'Inbox',
  'Announcement',
  'Audit',
  'Analysis',
  'Reflection',
  'Billing',
  'Bookable',
  'Profile',
] as const;

export const api = createApi({
  reducerPath: 'api',
  baseQuery: apiBaseQuery,
  tagTypes: TAG_TYPES,
  // Refetch what is on screen when the network comes back (`setupListeners` in
  // `store/index.ts`). NOT on focus: on a venue network that would refetch every screen
  // each time somebody switches tabs.
  refetchOnReconnect: true,
  // Every screen refetches when it mounts, exactly as each `use*` hook did before. The
  // difference is that a cached copy shows at once while it does, instead of a skeleton,
  // and two components asking at the same time share one request. Without this, a list
  // seen a minute ago would come back without its latest rows.
  refetchOnMountOrArgChange: true,
  endpoints: () => ({}),
});
