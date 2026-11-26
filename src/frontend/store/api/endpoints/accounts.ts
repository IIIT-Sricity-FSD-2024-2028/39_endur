// Accounts on RTK Query. 57; docs/REDUX-PLAN.md (R-406, R-705).
//
// A PERSON and an ACCOUNT are different things (57 § Purpose): inviting, resetting and
// revoking change whether somebody can sign in, never their positions. Each re-reads the
// person (`{ Person, id }`), whose page shows the account's state.
import type { AccountInvite, ActivateAccountBody, ActivationPreview } from '@endur/shared';
import { api } from '../api.js';

const person = (id: string) => [{ type: 'Person' as const, id }];

export const accountsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Who the link is for. A dead token is an error, and the page shows one dead end. */
    getActivationPreview: build.query<ActivationPreview, string>({
      query: (token) => `/auth/activate/${token}`,
      transformResponse: (response: { data: ActivationPreview }) => response.data,
      // A token is single-use: nothing is gained by keeping its answer once the page goes.
      keepUnusedDataFor: 0,
    }),

    /** `account.create`: a first sign-in link for somebody who has never had one. */
    inviteAccount: build.mutation<AccountInvite, string>({
      query: (personId) => ({ url: `/people/${personId}/account`, method: 'POST' }),
      transformResponse: (response: { data: AccountInvite }) => response.data,
      invalidatesTags: (_result, _error, personId) => person(personId),
    }),

    /** `account.reset`: the support path. Invalidates any live link and mints a new one. */
    resetAccount: build.mutation<AccountInvite, string>({
      query: (personId) => ({ url: `/people/${personId}/account/reset`, method: 'POST' }),
      transformResponse: (response: { data: AccountInvite }) => response.data,
      invalidatesTags: (_result, _error, personId) => person(personId),
    }),

    /** `account.revoke`: ends sign-in at once. Positions and audit rows are untouched. */
    revokeAccount: build.mutation<void, string>({
      query: (personId) => ({ url: `/people/${personId}/account`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, personId) => person(personId),
    }),

    /**
     * Consumes the link and sets the password. The server signs the browser in on the same
     * response; the caller then hydrates the session as sign-in does (`refreshMe`).
     */
    activateAccount: build.mutation<{ ok: true }, { token: string; body: ActivateAccountBody }>({
      query: ({ token, body }) => ({ url: `/auth/activate/${token}`, method: 'POST', body }),
    }),
  }),
});

export const { useGetActivationPreviewQuery } = accountsApi;
