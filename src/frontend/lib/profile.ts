// The caller's own account — reads and writes. 47 § Data contract, 23 §3.
//
// A separate seam from `lib/people.ts` even though the shapes overlap, because the QUESTION
// is different: nothing here takes an id. That is `self` scope on the client side of the
// wire — a page importing this file cannot ask about anybody else, because there is no
// argument for it to pass.
//
// On RTK Query since R-504 (`store/api/endpoints/profile.ts`). The photo moved here from the
// page, which used to upload and delete it itself.
import { useCallback } from 'react';
import type { ChangePasswordBody, ProfileView } from '@endur/shared';
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useRemoveAvatarMutation,
  useRenameSelfMutation,
  useUploadAvatarMutation,
} from '../store/api/endpoints/profile.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

export type ProfileController = Loadable<ProfileView> & {
  reload: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  changePassword: (body: ChangePasswordBody) => Promise<void>;
  /** Resolves once the profile has been re-read with the new photo; the top bar follows. */
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
};

export function useProfile(): ProfileController {
  const profile = useLoadable(useGetProfileQuery());
  const { reload } = profile;
  const [renameSelf] = useRenameSelfMutation();
  const [changePassword] = useChangePasswordMutation();
  const [uploadAvatar] = useUploadAvatarMutation();
  const [removeAvatar] = useRemoveAvatarMutation();

  return {
    ...profile,
    /**
     * The response is the whole profile again, and it replaces the cached copy directly —
     * no reload. A rename cannot change the positions or the powers, so a second round trip
     * would buy nothing. Compare `usePerson`, where a write CAN change the powers and
     * re-reads.
     */
    rename: useCallback(
      async (name: string) => {
        await unwrapApi(renameSelf(name));
      },
      [renameSelf],
    ),
    /**
     * Nothing comes back and nothing local changes — the password is not part of any state
     * this app holds (DEC-014: no credential survives `lib/auth.ts`, and none is created
     * here either). The caller keeps their session; the server has swapped the id underneath
     * them, which is invisible and is the point.
     *
     * The error is left to THROW rather than being folded into `error`: a wrong current
     * password belongs under the field that is wrong, and the card that owns the form is the
     * only thing that knows where that is (47 § States).
     */
    changePassword: useCallback(
      async (body: ChangePasswordBody) => {
        await unwrapApi(changePassword(body));
      },
      [changePassword],
    ),
    uploadAvatar: useCallback(
      async (file: File) => {
        await unwrapApi(uploadAvatar(file));
        await reload();
      },
      [uploadAvatar, reload],
    ),
    removeAvatar: useCallback(async () => {
      await unwrapApi(removeAvatar());
      await reload();
    }, [removeAvatar, reload]),
  };
}
