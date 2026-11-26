// The caller's own account on RTK Query. 47 § Data contract; docs/REDUX-PLAN.md (R-504).
//
// Nothing here takes a person id: that is `self` scope on the client side of the wire.
// The name and the photo are also in `/auth/me` (the top bar draws them), so writing either
// re-reads `Me`.
import type { ChangePasswordBody, ProfileView } from '@endur/shared';
import { api } from '../api.js';

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const profileApi = api.injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<ProfileView, void>({
      query: () => '/profile',
      transformResponse: unwrap<ProfileView>,
      providesTags: ['Profile'],
    }),

    /**
     * The answer is the whole profile again, and it goes straight into the cache. A rename
     * cannot change positions or powers, so re-reading the profile would buy nothing; the
     * top bar's copy, in `/auth/me`, is re-read. So is any people list showing this person.
     */
    renameSelf: build.mutation<ProfileView, string>({
      query: (name) => ({ url: '/profile', method: 'PATCH', body: { name } }),
      transformResponse: unwrap<ProfileView>,
      invalidatesTags: ['Me', 'Person'],
      onQueryStarted: async (_name, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(profileApi.util.updateQueryData('getProfile', undefined, () => data));
        } catch {
          // The page puts the reason under the field.
        }
      },
    }),

    /**
     * Nothing comes back and nothing is cached: the password is no part of any state this
     * app holds (DEC-014). DevTools' copy of the action has both fields blanked
     * (`store/devtools.ts`), and a mutation keeps no argument in the store.
     */
    changePassword: build.mutation<void, ChangePasswordBody>({
      query: (body) => ({ url: '/profile/password', method: 'POST', body }),
    }),

    /** Multipart through the same client; the `File` never reaches the store. */
    uploadAvatar: build.mutation<void, File>({
      query: (file) => {
        const form = new FormData();
        form.append('file', file);
        return { url: '/profile/avatar', method: 'POST', body: form };
      },
      invalidatesTags: ['Profile', 'Me'],
    }),

    removeAvatar: build.mutation<void, void>({
      query: () => ({ url: '/profile/avatar', method: 'DELETE' }),
      invalidatesTags: ['Profile', 'Me'],
    }),
  }),
});

export const {
  useGetProfileQuery,
  useRenameSelfMutation,
  useChangePasswordMutation,
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
} = profileApi;
