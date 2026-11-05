// Signing in and out, as thunks. docs/REDUX-PLAN.md §6.6 (R-105).
//
// Hand-written async with visible `pending` / `fulfilled` / `rejected` actions in the log.
// A failure is rejected WITH A VALUE, the serialisable error (§6.2), never the thrown
// `ApiError`: RTK would otherwise strip it down to `{ name, message }` and the login page
// would lose the field errors it renders.
//
// NO CREDENTIAL SURVIVES THIS FILE. The password is in the thunk's argument for the length
// of one request; the login response is `Set-Cookie` and `{ ok: true }`, and nothing of it
// reaches the store (DEC-014). A thunk's actions do carry its argument as `meta.arg`, so
// the store's DevTools sanitiser (`store/devtools.ts`) blanks any `password` in it.
import { createAsyncThunk } from '@reduxjs/toolkit';
import type { LoginBody, MeResponse } from '@endur/shared';
import { request } from '../../lib/api.js';
import { signedOut } from '../authSlice.js';
import { labelsCleared } from '../vocabularySlice.js';
import { sessionApi } from '../api/endpoints/session.js';
import { isSerializedApiError, serializeApiError, type SerializedApiError } from '../api/errors.js';
import type { AppDispatch, RootState } from '../index.js';

const createSessionThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SerializedApiError;
}>();

/** Re-read `/auth/me`, bypassing the cache. Its fulfilled action updates `auth` and
 *  `vocabulary` (R-104); the result is also returned for callers that want it. */
export const refreshMe = createSessionThunk<MeResponse, void>(
  'session/refreshMe',
  async (_arg, { dispatch, rejectWithValue }) => {
    try {
      return await dispatch(
        sessionApi.endpoints.getMe.initiate(undefined, { subscribe: false, forceRefetch: true }),
      ).unwrap();
    } catch (error) {
      return rejectWithValue(isSerializedApiError(error) ? error : serializeApiError(error));
    }
  },
);

/**
 * Sign in, then read the session. The login answer deliberately carries no user,
 * organisation or vocabulary: `/auth/me` is the single source for all three (13 § Auth).
 */
export const signIn = createSessionThunk<MeResponse, LoginBody>(
  'session/signIn',
  async (credentials, { dispatch, rejectWithValue }) => {
    try {
      // `suppress401Handler`: a 401 here is the ANSWER ("those don't match"), not an
      // expired session, and must not look like a sign-out.
      await request('POST', '/auth/login', credentials, { suppress401Handler: true });
    } catch (error) {
      return rejectWithValue(serializeApiError(error));
    }
    const me = await dispatch(refreshMe());
    if (refreshMe.rejected.match(me)) {
      return rejectWithValue(me.payload ?? serializeApiError(me.error));
    }
    return me.payload;
  },
);

/**
 * Sign out. The server destroys the session record (clearing the cookie alone would leave
 * a valid id alive for anyone who captured it). Locally it ends whatever the server said:
 * a failed logout that leaves the UI looking signed in is worse than one that looks signed
 * out and is not.
 */
export const signOut = createSessionThunk<void, void>(
  'session/signOut',
  async (_arg, { dispatch }) => {
    try {
      await request('POST', '/auth/logout');
    } catch {
      // Ended locally below regardless.
    }
    dispatch(signedOut());
    dispatch(labelsCleared());
  },
);
