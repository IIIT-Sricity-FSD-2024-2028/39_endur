// A 401 from any query means the session has gone. docs/REDUX-PLAN.md §6.6 (R-107).
//
// A classic, hand-written middleware (`store => next => action`), on purpose: it is the
// store's version of the Express chain's auth check, written once instead of in every
// screen. It replaces the module-level callbacks in `lib/api.ts` and `lib/ops.ts` for
// everything RTK Query sends; those callbacks stay for the plain calls (R-506).
//
// TWO SESSIONS, NEVER CONFUSED (`19` §7): a 401 from `api` ends the customer's session; a
// 401 from `opsApi` ends the operator's, and routes to `/ops/login`, never `/login`.
import { isRejectedWithValue, type Middleware } from '@reduxjs/toolkit';
import { signedOut } from '../authSlice.js';
import { opsSignedOut } from '../opsSlice.js';
import { labelsCleared } from '../vocabularySlice.js';
import { api } from '../api/api.js';
import { isSerializedApiError } from '../api/errors.js';
import { isSerializedOpsError, opsApi } from '../api/opsApi.js';
import type { RootState } from '../index.js';

export const sessionExpiredMiddleware: Middleware<object, RootState> =
  (store) => (next) => (action) => {
    const result = next(action);

    if (
      isRejectedWithValue(action) &&
      action.type.startsWith(`${api.reducerPath}/`) &&
      isSerializedApiError(action.payload) &&
      action.payload.status === 401 &&
      // Only a session that EXISTED can expire. This is also what stops a loop: signing out
      // resets the cache, a live query refetches and gets a 401, and by then there is
      // nobody left to sign out.
      store.getState().auth.status === 'authenticated'
    ) {
      store.dispatch(signedOut());
      store.dispatch(labelsCleared());
    }

    if (
      isRejectedWithValue(action) &&
      action.type.startsWith(`${opsApi.reducerPath}/`) &&
      isSerializedOpsError(action.payload) &&
      action.payload.status === 401 &&
      store.getState().ops.status === 'authenticated'
    ) {
      store.dispatch(opsSignedOut());
    }

    return result;
  };
