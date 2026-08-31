// Ops boot. `70` § State: "The operator and their role | Store". Step 0.2, `Mithil/plan.md`.
//
// Hydrated on first mount of the `/ops` TREE, not app boot — unlike `useBootSession`, which
// runs unconditionally for every visitor. An operator session is the rare case; asking
// `/platform/me` on every page load of the product for a cookie almost nobody carries is a
// wasted round trip on every customer's first paint.
import { useEffect } from 'react';
import type { PlatformMeResponse } from '@endur/shared';
import { opsGet, setOpsUnauthenticatedHandler } from './ops.js';
import { useAppDispatch } from '../store/index.js';
import { opsSignedIn, opsSignedOut } from '../store/opsSlice.js';

export function useBootOpsSession(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // A 401 from any later platform call lands here too — the same shape `useBootSession`
    // gives the org side, so an expired operator session routes to `/ops/login` from
    // wherever they were, never to `/login`.
    setOpsUnauthenticatedHandler(() => dispatch(opsSignedOut()));

    let cancelled = false;
    void opsGet<PlatformMeResponse>('/me')
      .then((me) => {
        if (!cancelled) dispatch(opsSignedIn({ operator: me.operator, capabilities: me.capabilities }));
      })
      .catch(() => {
        if (!cancelled) dispatch(opsSignedOut());
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}
