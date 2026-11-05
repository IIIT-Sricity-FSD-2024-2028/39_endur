// The session query. docs/REDUX-PLAN.md §6.6 (R-104).
//
// `/auth/me` returns the user, the organisation, the vocabulary and the capability set in
// one call. Its fulfilled action is the ONE action two slices respond to: `auth` takes the
// session and `vocabulary` takes the labels, each through its own `extraReducers`.
import type { MeResponse } from '@endur/shared';
import { api } from '../api.js';

export const sessionApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<MeResponse, void>({
      query: () => '/auth/me',
      // Invalidated by anything that changes what this user may do (a grant edit, a plan
      // change, a labels edit), so the nav and the buttons follow without a reload.
      providesTags: ['Me'],
    }),
  }),
});

export const { useGetMeQuery } = sessionApi;
