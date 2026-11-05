// Account activation on RTK Query. 57 § The token; docs/REDUX-PLAN.md (R-406).
//
// Only the read is here. Inviting, resetting and revoking stay plain functions in
// `lib/accounts.ts`: each is one click whose caller re-reads the person straight after, and
// activating signs the browser in, which the session thunks own.
import type { ActivationPreview } from '@endur/shared';
import { api } from '../api.js';

export const accountsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Who the link is for. A dead token is an error, and the page shows one dead end. */
    getActivationPreview: build.query<ActivationPreview, string>({
      query: (token) => `/auth/activate/${token}`,
      transformResponse: (response: { data: ActivationPreview }) => response.data,
      // A token is single-use: nothing is gained by keeping its answer once the page goes.
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useGetActivationPreviewQuery } = accountsApi;
