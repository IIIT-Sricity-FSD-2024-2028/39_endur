// Operator session state. Step 0.2, `Mithil/plan.md`, `70` § State.
//
// Mirror of `authSlice.ts` for the fourth principal kind (`19` §7). Kept separate rather
// than a branch of `authSlice` — the two never share a session, a cookie or a shape, and a
// union type here is the same privilege confusion `19` §7 warns against for the layout.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlatformCapability, PlatformRole } from '@endur/shared';
import { opsApi } from './api/opsApi.js';

export type OpsStatus = 'unknown' | 'authenticated' | 'anonymous';

export type OpsState = {
  status: OpsStatus;
  operator: { id: string; name: string; email: string; role: PlatformRole } | null;
  /** Usability only, never enforcement (INV-003) — `requirePlatform()` decides on the server. */
  capabilities: PlatformCapability[];
};

const initialState: OpsState = {
  status: 'unknown',
  operator: null,
  capabilities: [],
};

export const opsSlice = createSlice({
  name: 'ops',
  initialState,
  reducers: {
    opsSignedIn(
      state,
      action: PayloadAction<{
        operator: OpsState['operator'];
        capabilities: PlatformCapability[];
      }>,
    ) {
      state.status = 'authenticated';
      state.operator = action.payload.operator;
      state.capabilities = action.payload.capabilities;
    },
    opsSignedOut(state) {
      state.status = 'anonymous';
      state.operator = null;
      state.capabilities = [];
    },
  },

  // `/platform/me`'s answer, as `auth` takes `/auth/me`'s (R-505). At boot any failure means
  // "not signed in"; later, a failed re-read is a network blip, and a real 401 reaches
  // `sessionExpiredMiddleware`.
  extraReducers: (builder) => {
    builder
      .addMatcher(opsApi.endpoints.getOpsMe.matchFulfilled, (state, action) => {
        state.status = 'authenticated';
        state.operator = action.payload.operator;
        state.capabilities = action.payload.capabilities;
      })
      .addMatcher(opsApi.endpoints.getOpsMe.matchRejected, (state, action) => {
        if (action.meta.condition) return;
        if (state.status === 'unknown') {
          state.status = 'anonymous';
          state.operator = null;
          state.capabilities = [];
        }
      });
  },
});

export const { opsSignedIn, opsSignedOut } = opsSlice.actions;
export const opsReducer = opsSlice.reducer;
