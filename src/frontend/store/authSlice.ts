// One of exactly two slices in P1-P2 (DEC-008, 23 §2).
//
// It holds no credential. The session is an httpOnly cookie the browser manages, so
// there is nothing here to leak to devtools and nothing to persist by accident (20 §5).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HeldCapabilities, MeResponse, SupportContext } from '@endur/shared';
import { sessionApi } from './api/endpoints/session.js';

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

/** The session, from an `/auth/me` answer. One function for both ways it arrives. */
function applyMe(state: AuthState, me: MeResponse): void {
  state.status = 'authenticated';
  state.user = me.user;
  state.org = me.organization;
  state.capabilities = me.capabilities;
  // `?? null` and not `me.support` — the field is absent on every ordinary session, and
  // leaving `undefined` in the store would make the banner's guard a truthiness check over
  // two falsy values instead of one.
  state.support = me.support ?? null;
}

function clear(state: AuthState): void {
  state.status = 'anonymous';
  state.user = null;
  state.org = null;
  state.capabilities = {};
  state.support = null;
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<MeResponse>) {
      applyMe(state, action.payload);
    },
    /** Boot found no session, or a 401 arrived mid-flight. Same end state either way. */
    signedOut(state) {
      clear(state);
    },
  },

  // The `getMe` query (R-104). Every answer from `/auth/me` lands here: at boot, after a
  // sign-in, and whenever the `Me` tag is invalidated, which is how a grant edit reaches
  // this user's own capabilities without a reload (§6.4).
  extraReducers: (builder) => {
    builder
      .addMatcher(sessionApi.endpoints.getMe.matchFulfilled, (state, action) => {
        applyMe(state, action.payload);
      })
      .addMatcher(sessionApi.endpoints.getMe.matchRejected, (state, action) => {
        // `condition` means "not sent, a request is already in flight": no answer yet.
        if (action.meta.condition) return;
        // At BOOT, any failure means "not signed in": a network error and a 401 look the
        // same to the user, and anything else strands them on a loading screen. LATER, a
        // failed refetch is a network blip, not a sign-out; a real 401 reaches
        // `sessionExpiredMiddleware`, which says so.
        if (state.status === 'unknown') clear(state);
      });
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
