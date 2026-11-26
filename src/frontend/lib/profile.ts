// The caller's own account — reads and writes. 47 § Data contract, 23 §3.
//
// A separate seam from `lib/people.ts` even though the shapes overlap, because the QUESTION
// is different: nothing here takes an id. That is `self` scope on the client side of the
// wire — a page importing this file cannot ask about anybody else, because there is no
// argument for it to pass.
//
// On RTK Query since R-504 (`store/api/endpoints/profile.ts`). The photo moved here from the
// page, which used to upload and delete it itself.
//
// Reads only (DEC-R03): renaming yourself, the photo and the password are thunks in
// `store/screens/profile.ts`.
import type { ProfileView } from '@endur/shared';
import { useGetProfileQuery } from '../store/api/endpoints/profile.js';
import { useLoadable, type Loadable } from './query.js';

export type ProfileController = Loadable<ProfileView> & { reload: () => Promise<void> };

export function useProfile(): ProfileController {
  return useLoadable(useGetProfileQuery());
}
