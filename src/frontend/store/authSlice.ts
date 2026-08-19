// One of exactly two slices in P1-P2 (DEC-008, 23 §2).
//
// It holds no credential. The session is an httpOnly cookie the browser manages, so
// there is nothing here to leak to devtools and nothing to persist by accident (20 §5).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Capability, MeResponse } from '@endur/shared';

/**
 * `unknown` is the state before /auth/me answers, and it is the reason the console
 * renders a loading state rather than flashing a login screen at someone who is
 * already signed in (20 §5).
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export type AuthState = {
  status: SessionStatus;
  user: MeResponse['user'] | null;
  org: MeResponse['organization'] | null;
  /** Usability only, never enforcement (INV-003). A wrong set is a confusing button. */
  capabilities: Capability[];
};

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  org: null,
  capabilities: [],
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<MeResponse>) {
      state.status = 'authenticated';
      state.user = action.payload.user;
      state.org = action.payload.organization;
      state.capabilities = action.payload.capabilities;
    },
    /** Boot found no session, or a 401 arrived mid-flight. Same end state either way. */
    signedOut(state) {
      state.status = 'anonymous';
      state.user = null;
      state.org = null;
      state.capabilities = [];
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
