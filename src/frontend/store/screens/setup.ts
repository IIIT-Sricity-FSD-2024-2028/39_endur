// The setup wizard's PAGE state, beside `wizardSlice` (which holds what is being set up and
// survives leaving): the commit in flight, its failure, the preset switch waiting for a yes,
// and the rows the steps should focus. docs/REDUX-PLAN.md §6.10 (R-709, DEC-R03).
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { SetupOrgBody } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { orgApi } from '../api/endpoints/org.js';
import { refreshMe } from '../thunks/session.js';
import { wizardReset } from '../wizardSlice.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type SetupScreenState = {
  saving: boolean;
  error: SerializedApiError | null;
  /** Another preset picked over edits: which one, waiting for "Replace". */
  pendingPresetKey: string | null;
  /** The role row being dragged on the roles step. */
  roleDragId: string | null;
  /** The row just added, which takes the focus (roles step, structure step). */
  lastAddedRoleId: string | null;
  focusUnitId: string | null;
};

const initialState: SetupScreenState = {
  saving: false,
  error: null,
  pendingPresetKey: null,
  roleDragId: null,
  lastAddedRoleId: null,
  focusUnitId: null,
};

/**
 * Finish (or Skip, with the "custom" preset's defaults): the organisation is created in one
 * request, then the session is re-read so the shell knows it is configured, then the wizard
 * forgets what was typed. `outcome` is where the console lands afterwards.
 */
export const setupCommitted = createScreenThunk(
  'setup/setupCommitted',
  async (
    { body }: { body: SetupOrgBody; outcome: 'done' | 'skipped' },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(orgApi.endpoints.setupOrg.initiate(body)).unwrap();
      await dispatch(refreshMe()).unwrap();
      dispatch(wizardReset());
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSetup(getState()).saving },
);

export const setupScreenSlice = createSlice({
  name: 'setup',
  initialState,
  reducers: {
    presetSwitchAsked(state, action: PayloadAction<{ key: string }>) {
      state.pendingPresetKey = action.payload.key;
    },
    presetSwitchSettled(state) {
      state.pendingPresetKey = null;
    },
    setupRoleDragStarted(state, action: PayloadAction<{ roleId: string }>) {
      state.roleDragId = action.payload.roleId;
    },
    setupRoleDragEnded(state) {
      state.roleDragId = null;
    },
    setupRoleAdded(state, action: PayloadAction<{ roleId: string }>) {
      state.lastAddedRoleId = action.payload.roleId;
    },
    setupUnitAdded(state, action: PayloadAction<{ unitId: string }>) {
      state.focusUnitId = action.payload.unitId;
    },
    setupLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(setupCommitted.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(setupCommitted.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(setupCommitted.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? { kind: 'network', status: 0, message: action.error.message ?? '' };
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectSetup: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof setupScreenSlice> {}
}

const injected = setupScreenSlice.injectInto(rootReducer);

export const {
  presetSwitchAsked,
  presetSwitchSettled,
  setupRoleDragStarted,
  setupRoleDragEnded,
  setupRoleAdded,
  setupUnitAdded,
  setupLeft,
} = setupScreenSlice.actions;

export const { selectSetup } = injected.selectors;
