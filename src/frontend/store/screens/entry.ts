// The ways in: signing in (`/login`), setting a password from an invitation (`/activate/:token`)
// and creating an organisation (`/start`), plus the landing page's rotating example.
// docs/REDUX-PLAN.md §6.10 (R-710, DEC-R03).
//
// NO PASSWORD ENTERS THIS SLICE (DEC-014). Every password box is uncontrolled: the page reads it
// from the form when it is needed and passes it as a thunk's argument, which lives for one
// request (DevTools' copy is blanked by `store/devtools.ts`). What the store keeps is whether a
// box is filled enough to enable its button, whether it is shown in clear, and how it went.
// To keep a password across a step (the organisation picker, sign-up's plan step), the page
// hides the form rather than unmounting it.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { RegisterBody, type SignupTier } from '@endur/shared';
import { fieldErrorsOf, type FieldErrors } from '../../lib/validate.js';
import { accountsApi } from '../api/endpoints/accounts.js';
import { findLanding, refreshMe, register, signIn } from '../thunks/session.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export const MIN_PASSWORD = 10;

/** What `/start` checks before it shows the plans: the same schema the server runs (14 §1). */
const DETAILS_SCHEMA = RegisterBody.pick({ orgName: true, name: true, email: true, password: true });

export type OrgChoice = { id: string; name: string };
export type SignupField = 'orgName' | 'name' | 'email';

export type EntryScreenState = {
  login: {
    email: string;
    reveal: boolean;
    busy: boolean;
    error: SerializedApiError | null;
    /** The sign-in works for more than one organisation: which one (ACCOUNT_AMBIGUOUS). */
    choices: OrgChoice[] | null;
  };
  activate: {
    longEnough: boolean;
    busy: boolean;
    error: SerializedApiError | null;
  };
  signup: {
    step: 'details' | 'plan';
    orgName: string;
    name: string;
    email: string;
    tier: SignupTier | null;
    reveal: boolean;
    /** The checkout is open. */
    paying: boolean;
    busy: boolean;
    error: SerializedApiError | null;
    /** The details' own check, before anything is sent. Empty until Continue is pressed. */
    detailErrors: FieldErrors;
    /** A paid sign-up waits for the checkout's success screen before it leaves for here. */
    landing: string | null;
  };
  /** The landing page's example vocabulary, and whether the reader has taken it over. */
  landing: { index: number; engaged: boolean };
};

const initialState: EntryScreenState = {
  login: { email: '', reveal: false, busy: false, error: null, choices: null },
  activate: { longEnough: false, busy: false, error: null },
  signup: {
    step: 'details',
    orgName: '',
    name: '',
    email: '',
    tier: null,
    reveal: false,
    paying: false,
    busy: false,
    error: null,
    detailErrors: {},
    landing: null,
  },
  landing: { index: 0, engaged: false },
};

// ---- signing in

/**
 * Sign in, then say where to go. `signIn` reads the session (the auth and vocabulary slices
 * take it); the page navigates with the answer.
 */
export const loginSubmitted = createScreenThunk(
  'entry/loginSubmitted',
  async (
    credentials: { email: string; password: string; orgId?: string | undefined },
    { dispatch, rejectWithValue },
  ) => {
    const { email, password, orgId } = credentials;
    const result = await dispatch(signIn({ email: email.trim(), password, ...(orgId ? { orgId } : {}) }));
    if (signIn.rejected.match(result)) return rejectWithValue(result.payload ?? asStoreError(result.error));
    return await findLanding();
  },
  { condition: (_, { getState }) => !selectEntry(getState()).login.busy },
);

// ---- setting a password from an invitation

/**
 * The server consumes the link and signs the browser in on the same response; the session is
 * then read the way sign-in reads it (57 § Interactions).
 */
export const activationSubmitted = createScreenThunk(
  'entry/activationSubmitted',
  async ({ token, password }: { token: string; password: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(accountsApi.endpoints.activateAccount.initiate({ token, body: { password } })).unwrap();
      await dispatch(refreshMe()).unwrap();
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
    return await findLanding();
  },
  {
    condition: ({ password }, { getState }) =>
      !selectEntry(getState()).activate.busy && password.length >= MIN_PASSWORD,
  },
);

// ---- creating an organisation

/**
 * "Continue" on the details: run the server's own schema over them (14 §1) and go on to the
 * plans only if it passes. The password comes from the form; only the messages are kept.
 */
export const signupDetailsContinued =
  (password: string) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const { orgName, name, email } = selectEntry(getState()).signup;
    const errors = fieldErrorsOf(DETAILS_SCHEMA, {
      orgName: orgName.trim(),
      name: name.trim(),
      email: email.trim(),
      password,
    });
    dispatch(signupDetailsChecked({ errors }));
  };

/**
 * Register. A trial goes straight in. A paid sign-up holds the session back
 * (`holdSession`): `/start` sits inside <RedirectIfSignedIn>, which leaves the moment the
 * session appears, and the checkout's "Payment successful" must be seen first
 * (`signupFinished` reads the session after it).
 */
export const signupSubmitted = createScreenThunk(
  'entry/signupSubmitted',
  async (
    options: { password: string; paymentRef?: string; trial: boolean; holdSession: boolean },
    { dispatch, getState, rejectWithValue },
  ) => {
    const { orgName, name, email, tier } = selectEntry(getState()).signup;
    if (!tier) return rejectWithValue(asStoreError(new Error('Choose a plan first.')));
    const registered = await dispatch(register({
      orgName: orgName.trim(),
      name: name.trim(),
      email: email.trim(),
      password: options.password,
      industry: 'custom',
      tier,
      paymentRef: options.paymentRef,
      trial: options.trial,
    }));
    if (register.rejected.match(registered)) {
      return rejectWithValue(registered.payload ?? asStoreError(registered.error));
    }
    if (!options.holdSession) {
      const me = await dispatch(refreshMe());
      if (refreshMe.rejected.match(me)) return rejectWithValue(me.payload ?? asStoreError(me.error));
    }
    return '/app/setup';
  },
  { condition: (_, { getState }) => !selectEntry(getState()).signup.busy },
);

/** After the checkout's success screen: read the session, then go where sign-up said. */
export const signupFinished = createScreenThunk(
  'entry/signupFinished',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    const { landing } = selectEntry(getState()).signup;
    const me = await dispatch(refreshMe());
    if (refreshMe.rejected.match(me)) return rejectWithValue(me.payload ?? asStoreError(me.error));
    return landing;
  },
);

/** Which 4xx send the reader back to the details: the address is taken, or a field is wrong. */
const BACK_TO_DETAILS = new Set([409, 422]);

export const entryScreenSlice = createSlice({
  name: 'entry',
  initialState,
  reducers: {
    // ---- /login
    loginEmailEdited(state, action: PayloadAction<{ email: string }>) {
      state.login.email = action.payload.email;
    },
    loginRevealToggled(state) {
      state.login.reveal = !state.login.reveal;
    },
    /** "Back" from the organisation picker. The form was only hidden, so nothing is retyped. */
    loginChoiceDismissed(state) {
      state.login.choices = null;
    },
    loginLeft(state) {
      state.login = initialState.login;
    },

    // ---- /activate/:token
    activationTyped(state, action: PayloadAction<{ longEnough: boolean }>) {
      state.activate.longEnough = action.payload.longEnough;
    },
    activationLeft(state) {
      state.activate = initialState.activate;
    },

    // ---- /start
    signupEdited(state, action: PayloadAction<{ field: SignupField; value: string }>) {
      const { field, value } = action.payload;
      state.signup[field] = value;
      delete state.signup.detailErrors[field];
    },
    /** Typing a password clears its message; the password itself is not in the action. */
    signupPasswordTyped(state) {
      delete state.signup.detailErrors['password'];
    },
    signupRevealToggled(state) {
      state.signup.reveal = !state.signup.reveal;
    },
    signupDetailsChecked(state, action: PayloadAction<{ errors: FieldErrors }>) {
      state.signup.detailErrors = action.payload.errors;
      if (Object.keys(action.payload.errors).length === 0) state.signup.step = 'plan';
    },
    signupTierChosen(state, action: PayloadAction<{ tier: SignupTier }>) {
      state.signup.tier = action.payload.tier;
    },
    signupBackToDetails(state) {
      if (!state.signup.busy) state.signup.step = 'details';
    },
    signupCheckoutOpened(state) {
      if (state.signup.tier && !state.signup.busy) state.signup.paying = true;
    },
    signupCheckoutClosed(state) {
      state.signup.paying = false;
    },
    signupLeft(state) {
      state.signup = initialState.signup;
    },

    // ---- / (the landing page)
    /** The rotation's tick. Stops for good once the reader picks one. */
    landingRotated(state, action: PayloadAction<{ count: number }>) {
      if (state.landing.engaged || action.payload.count === 0) return;
      state.landing.index = (state.landing.index + 1) % action.payload.count;
    },
    landingPicked(state, action: PayloadAction<{ index: number }>) {
      state.landing = { index: action.payload.index, engaged: true };
    },
    landingLeft(state) {
      state.landing = initialState.landing;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginSubmitted.pending, (state) => {
        state.login.busy = true;
        state.login.error = null;
      })
      // Busy until the page has gone: the button must not come back between the answer and
      // the navigation.
      .addCase(loginSubmitted.rejected, (state, action) => {
        state.login.busy = false;
        const error = action.payload ?? null;
        if (error?.kind === 'api' && error.code === 'ACCOUNT_AMBIGUOUS') {
          state.login.choices = (error.details['organizations'] as OrgChoice[] | undefined) ?? [];
          return;
        }
        state.login.choices = null;
        state.login.error = error;
      })

      .addCase(activationSubmitted.pending, (state) => {
        state.activate.busy = true;
        state.activate.error = null;
      })
      .addCase(activationSubmitted.rejected, (state, action) => {
        state.activate.busy = false;
        state.activate.error = action.payload ?? null;
      })

      .addCase(signupSubmitted.pending, (state) => {
        state.signup.busy = true;
        state.signup.error = null;
      })
      .addCase(signupSubmitted.fulfilled, (state, action) => {
        if (action.meta.arg.holdSession) state.signup.landing = action.payload;
      })
      .addCase(signupSubmitted.rejected, (state, action) => {
        state.signup.busy = false;
        state.signup.paying = false;
        state.signup.error = action.payload ?? null;
        if (BACK_TO_DETAILS.has(action.payload?.status ?? 0)) state.signup.step = 'details';
      });
    // NOT reset on `signedOut`, unlike every other screen slice: these ARE the signed-out
    // screens, and a boot that answers "nobody is signed in" late would wipe an address
    // somebody is already typing. Each page clears its own part when it is left instead.
  },
  selectors: {
    selectEntry: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof entryScreenSlice> {}
}

const injected = entryScreenSlice.injectInto(rootReducer);

export const {
  loginEmailEdited,
  loginRevealToggled,
  loginChoiceDismissed,
  loginLeft,
  activationTyped,
  activationLeft,
  signupEdited,
  signupPasswordTyped,
  signupRevealToggled,
  signupDetailsChecked,
  signupTierChosen,
  signupBackToDetails,
  signupCheckoutOpened,
  signupCheckoutClosed,
  signupLeft,
  landingRotated,
  landingPicked,
  landingLeft,
} = entryScreenSlice.actions;

export const { selectEntry } = injected.selectors;
