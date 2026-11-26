// "My account": renaming yourself, your photo, and changing your password.
// docs/REDUX-PLAN.md §6.10 (R-710, DEC-R03). The profile itself is the cache's (`getProfile`).
//
// NO PASSWORD ENTERS THIS SLICE (DEC-014). The two password inputs are uncontrolled: the card
// reads them with `FormData` on submit and hands them to `passwordChanged` as its argument,
// which lives for one request (DevTools' copy is blanked by `store/devtools.ts`). What the
// store keeps is whether each box is filled enough to enable the button, and how the change
// went.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { ChangePasswordBody } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { profileApi } from '../api/endpoints/profile.js';
import { refreshMe } from '../thunks/session.js';
import { rootReducer, type AppDispatch } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** The shortest new password the card offers to send; the server says the same (422). */
export const PASSWORD_MIN = 10;

export type ProfileScreenState = {
  /** A rename that did not save, shown under the "You" card. */
  renameError: SerializedApiError | null;
  password: {
    /** Something is typed in "Current password". */
    currentGiven: boolean;
    /** "New password" is at least `PASSWORD_MIN` long. */
    nextLongEnough: boolean;
    busy: boolean;
    done: boolean;
    error: SerializedApiError | null;
  };
};

const initialPassword: ProfileScreenState['password'] = {
  currentGiven: false,
  nextLongEnough: false,
  busy: false,
  done: false,
  error: null,
};

const initialState: ProfileScreenState = { renameError: null, password: initialPassword };

/**
 * Your own name. The answer replaces the cached profile (`renameSelf`), and `/auth/me` is
 * re-read so the top bar says it too, without a reload (47 § State).
 */
export const selfRenamed = createScreenThunk(
  'profile/selfRenamed',
  async (name: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(profileApi.endpoints.renameSelf.initiate(name)).unwrap();
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
    await dispatch(refreshMe());
    return undefined;
  },
);

/** The profile re-read, so the card shows the server's copy of the photo before it settles. */
const profileReread = (dispatch: AppDispatch) =>
  dispatch(profileApi.endpoints.getProfile.initiate(undefined, { subscribe: false, forceRefetch: true }));

/** The photo. The `File` is the argument only; the top bar follows through `Me` (R-504). */
export const avatarUploaded = createScreenThunk(
  'profile/avatarUploaded',
  async (file: File, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(profileApi.endpoints.uploadAvatar.initiate(file)).unwrap();
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
    await profileReread(dispatch);
    return undefined;
  },
);

export const avatarRemoved = createScreenThunk(
  'profile/avatarRemoved',
  async (_: void, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(profileApi.endpoints.removeAvatar.initiate()).unwrap();
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
    await profileReread(dispatch);
    return undefined;
  },
);

/**
 * "Change password". The current one is asked for every time, so a browser somebody left
 * signed in is not enough. The session stays: the server swaps its id underneath it.
 */
export const passwordChanged = createScreenThunk(
  'profile/passwordChanged',
  async (body: ChangePasswordBody, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(profileApi.endpoints.changePassword.initiate(body)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (body, { getState }) => {
      const { password } = selectProfileScreen(getState());
      return !password.busy && body.currentPassword.length > 0 && body.newPassword.length >= PASSWORD_MIN;
    },
  },
);

export const profileScreenSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    /** Typing in either password box: only whether each is filled enough, never the text. */
    passwordTyped(state, action: PayloadAction<{ currentGiven: boolean; nextLongEnough: boolean }>) {
      state.password.currentGiven = action.payload.currentGiven;
      state.password.nextLongEnough = action.payload.nextLongEnough;
    },
    profileLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(selfRenamed.pending, (state) => {
        state.renameError = null;
      })
      .addCase(selfRenamed.rejected, (state, action) => {
        state.renameError = action.payload ?? null;
      })
      // A photo change starts the card afresh, as it always did.
      .addCase(avatarUploaded.pending, (state) => {
        state.renameError = null;
      })
      .addCase(avatarRemoved.pending, (state) => {
        state.renameError = null;
      })
      .addCase(passwordChanged.pending, (state) => {
        state.password.busy = true;
        state.password.done = false;
        state.password.error = null;
      })
      // The card empties both boxes (a DOM reset), so neither is filled any more.
      .addCase(passwordChanged.fulfilled, (state) => {
        state.password = { ...initialPassword, done: true };
      })
      .addCase(passwordChanged.rejected, (state, action) => {
        state.password.busy = false;
        state.password.error = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectProfileScreen: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof profileScreenSlice> {}
}

const injected = profileScreenSlice.injectInto(rootReducer);

export const { passwordTyped, profileLeft } = profileScreenSlice.actions;

export const { selectProfileScreen } = injected.selectors;
