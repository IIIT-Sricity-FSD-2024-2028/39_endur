// Ops boot. `70` § State: "The operator and their role | Store". Step 0.2, `Mithil/plan.md`.
//
// Hydrated on first mount of the `/ops` TREE, not app boot — unlike `useBootSession`, which
// runs unconditionally for every visitor. An operator session is the rare case; asking
// `/platform/me` on every page load of the product for a cookie almost nobody carries is a
// wasted round trip on every customer's first paint.
//
// On RTK Query since R-505: `getOpsMe` (`store/api/opsApi.ts`), whose answer `opsSlice` takes
// through `extraReducers`, the way `auth` takes `/auth/me`'s.
import { useEffect } from 'react';
import { setOpsUnauthenticatedHandler } from './ops.js';
import { useAppDispatch } from '../store/index.js';
import { opsSignedOut } from '../store/opsSlice.js';
import { opsApi } from '../store/api/opsApi.js';

export function useBootOpsSession(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // A 401 from a PLAIN platform call (sign-out, an org action) lands here; one from a
    // query reaches `sessionExpiredMiddleware`. Either way an expired operator session
    // routes to `/ops/login` from wherever they were, never to `/login`.
    setOpsUnauthenticatedHandler(() => dispatch(opsSignedOut()));
  }, [dispatch]);

  // The operator tree's live subscription to `/platform/me`.
  opsApi.useGetOpsMeQuery();
}
