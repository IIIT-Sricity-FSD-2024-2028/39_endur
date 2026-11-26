// What a session ending or changing clears. docs/REDUX-PLAN.md §6.6 (R-106).
//
// The slices reset their own state through `extraReducers` on `signedOut` (builder,
// wizard, ui). This listener clears what lives outside them:
//
// - **the RTK Query cache.** Without this, org A's cached campaigns can flash onto org B's
//   screens. Of everything that can go wrong in this phase, that is the one failure that
//   is more than cosmetic.
// - **the builder's undo history in sessionStorage** (Q-2).
// - **the operator cache** (`opsApi`), on operator sign-out (R-505).
//
// Registered from `store/index.ts`, so it is live from boot, not only once the builder's
// chunk has loaded.
import { signedOut } from '../authSlice.js';
import { opsSignedOut } from '../opsSlice.js';
import { clearBuilderHistory } from '../builderHistoryStorage.js';
import { api } from '../api/api.js';
import { opsApi } from '../api/opsApi.js';
import { sessionApi } from '../api/endpoints/session.js';
import { startAppListening } from './listeners.js';

// Signed out: drop everything that belonged to the session.
startAppListening({
  actionCreator: signedOut,
  effect: (_action, listenerApi) => {
    clearBuilderHistory();
    // Only if there was a session to clear. A sign-out that changes nothing (boot found no
    // session, or a second 401) must not reset the cache and restart its queries.
    if (listenerApi.getOriginalState().auth.status === 'authenticated') {
      listenerApi.dispatch(api.util.resetApiState());
    }
  },
});

// Same browser, different organisation: everything cached was the other org's.
startAppListening({
  matcher: sessionApi.endpoints.getMe.matchFulfilled,
  effect: (action, listenerApi) => {
    const before = listenerApi.getOriginalState().auth.org?.id;
    if (before && before !== action.payload.organization.id) {
      listenerApi.dispatch(api.util.resetApiState());
      clearBuilderHistory();
    }
  },
});

// The operator signed out (or their session expired): nothing they could see stays cached
// for whoever uses this browser next. Only if there was a session, for the same reason as
// above.
startAppListening({
  actionCreator: opsSignedOut,
  effect: (_action, listenerApi) => {
    if (listenerApi.getOriginalState().ops.status === 'authenticated') {
      listenerApi.dispatch(opsApi.util.resetApiState());
    }
  },
});
