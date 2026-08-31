// One of exactly two slices in P1-P2 (DEC-008, 23 §2).
//
// It holds no credential. The session is an httpOnly cookie the browser manages, so
// there is nothing here to leak to devtools and nothing to persist by accident (20 §5).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HeldCapabilities, MeResponse, SupportContext } from '@endur/shared';

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
  /** Usability only, never enforcement (INV-003). A wrong set is a confusing button.
   *  Capability to the WIDEST scope it is held at since T-086 — absent means not held. */
  capabilities: HeldCapabilities;
  /**
   * DEC-114. Non-null ONLY when somebody from Endur is driving this console.
   *
   * It sits in the auth slice rather than in a slice of its own because it is a fact about
   * WHO IS SIGNED IN, which is exactly what this slice is for — and because it arrives on
   * `/auth/me` with everything else, so a second slice would be a second thing to clear on
   * sign-out and a second thing to forget to clear.
   */
  support: SupportContext | null;
};

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  org: null,
  capabilities: {},
  support: null,
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
      // `?? null` and not `payload.support` — the field is absent on every ordinary session,
      // and leaving `undefined` in the store would make the banner's guard a truthiness check
      // over two falsy values instead of one.
      state.support = action.payload.support ?? null;
    },
    /** Boot found no session, or a 401 arrived mid-flight. Same end state either way. */
    signedOut(state) {
      state.status = 'anonymous';
      state.user = null;
      state.org = null;
      state.capabilities = {};
      state.support = null;
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
