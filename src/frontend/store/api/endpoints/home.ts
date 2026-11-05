// Home on RTK Query. 46 § Data contract; docs/REDUX-PLAN.md §6.4 (R-204).
//
// ONE request and no polling (46 § State). It provides `Home`, which every command that
// changes a count invalidates (a campaign created, launched or closed; a unit added), so a
// Home that is on screen catches up by itself.
import type { HomeView, StatWindow } from '@endur/shared';
import { api } from '../api.js';

export const homeApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * One cache entry per range. Pressing 30d then Today makes two entries, and a slow 30d
     * answer lands in ITS entry, never under the card that says "today" (the race the old
     * hook's sequence number existed to stop).
     */
    getHome: build.query<HomeView, StatWindow>({
      query: (window) => `/home?window=${window}`,
      transformResponse: (response: { data: HomeView }) => response.data,
      providesTags: ['Home'],
    }),
  }),
});

export const { useGetHomeQuery } = homeApi;
