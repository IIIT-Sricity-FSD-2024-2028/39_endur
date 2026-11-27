// `/ops/team`: the operator accounts, for an owner (`platform.operator.manage`).
// docs/REDUX-PLAN.md §6.12 (R-716).
//
// THE NEW OPERATOR'S PASSWORD IS NEVER IN THE STORE (DEC-014), exactly as the sign-in
// form's is not: its box is uncontrolled, it is read with `FormData` when "Add operator" is
// pressed, and it travels only as `operatorAdded`'s argument (which DevTools is shown
// redacted). That is also why adding an operator is a thunk over `opsRequest` and NOT an RTK
// Query mutation: a mutation's argument is kept in `state.opsApi.mutations`.
//
// THE AUTHENTICATOR SECRET IS SHOWN ONCE. The server returns it at creation and never again,
// so it is held in `created` only while the owner reads the code off the screen; "Done",
// leaving the page or signing out drops it, and DevTools is shown it redacted.
//
// Trace for "Make staff" on an owner:
//   the row's button → `operatorChangeAsked` → <ConfirmDialog> from `pending` → Confirm →
//   `operatorChanged()` → `opsEndpoints.updateOperator` → `Operators` and `OpsAudit` re-read.
import { createAsyncThunk, createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { PlatformOperator, PlatformRole } from '@endur/shared';
import { opsRequest } from '../../lib/ops.js';
import { opsApi, serializeOpsError, type SerializedOpsError } from '../api/opsApi.js';
import { opsEndpoints } from '../api/endpoints/ops.js';
import { opsSignedOut } from '../opsSlice.js';
import { toastShown } from '../uiSlice.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';

const createOpsThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SerializedOpsError;
}>();

const asOpsError = (error: unknown): SerializedOpsError =>
  typeof error === 'object' && error !== null && 'kind' in error && 'status' in error
    ? (error as SerializedOpsError)
    : serializeOpsError(error);

/** The server's DTO minimum for an operator's password. */
export const OPERATOR_PASSWORD_MIN = 12;

export type OperatorChange = { role?: PlatformRole; status?: 'active' | 'disabled' };

export type OpsTeamState = {
  add: {
    open: boolean;
    email: string;
    name: string;
    role: PlatformRole;
    /** Whether the password box holds enough characters: the box's text itself is not here. */
    passwordLongEnough: boolean;
    busy: boolean;
    error: SerializedOpsError | null;
  };
  /** The account just made, with its authenticator link, until "Done". */
  created: { name: string; email: string; otpauthUrl: string } | null;
  /** The change waiting on its confirmation. */
  pending: { id: string; name: string; change: OperatorChange } | null;
  busyId: string | null;
  error: SerializedOpsError | null;
};

const blankAdd: OpsTeamState['add'] = {
  open: false,
  email: '',
  name: '',
  role: 'staff',
  passwordLongEnough: false,
  busy: false,
  error: null,
};

const initialState: OpsTeamState = { add: blankAdd, created: null, pending: null, busyId: null, error: null };

/** "Add operator": the typed fields from the store, the password as the argument. */
export const operatorAdded = createOpsThunk(
  'opsTeam/operatorAdded',
  async ({ password }: { password: string }, { dispatch, getState, rejectWithValue }) => {
    const { email, name, role } = selectTeam(getState()).add;
    try {
      const made = await opsRequest<{ data: PlatformOperator & { otpauthUrl: string } }>('POST', '/operators', {
        email: email.trim(),
        name: name.trim(),
        password,
        role,
      });
      dispatch(opsApi.util.invalidateTags(['Operators', 'OpsAudit']));
      return { name: made.data.name, email: made.data.email, otpauthUrl: made.data.otpauthUrl };
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  {
    condition: ({ password }, { getState }) => {
      const { add } = selectTeam(getState());
      return !add.busy && add.email.trim() !== '' && add.name.trim() !== '' && password.length >= OPERATOR_PASSWORD_MIN;
    },
  },
);

/** The confirmed role or status change. */
export const operatorChanged = createOpsThunk(
  'opsTeam/operatorChanged',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    const pending = selectTeam(getState()).pending;
    if (!pending) return undefined;
    try {
      const updated = await dispatch(
        opsEndpoints.endpoints.updateOperator.initiate({ id: pending.id, ...pending.change }),
      ).unwrap();
      dispatch(toastShown({ message: `${updated.name} is now ${updated.status === 'disabled' ? 'disabled' : updated.role}.` }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (_, { getState }) => selectTeam(getState()).busyId === null },
);

export const opsTeamSlice = createSlice({
  name: 'opsTeam',
  initialState,
  reducers: {
    addOperatorOpened(state) {
      state.add = { ...blankAdd, open: true };
    },
    addOperatorClosed(state) {
      state.add = blankAdd;
    },
    addOperatorEdited(state, action: PayloadAction<{ email?: string; name?: string; role?: PlatformRole }>) {
      const { email, name, role } = action.payload;
      if (email !== undefined) state.add.email = email;
      if (name !== undefined) state.add.name = name;
      if (role !== undefined) state.add.role = role;
    },
    /** The password box changed: only whether it is long enough is kept. */
    addOperatorPasswordTyped(state, action: PayloadAction<{ longEnough: boolean }>) {
      state.add.passwordLongEnough = action.payload.longEnough;
    },
    createdAcknowledged(state) {
      state.created = null;
    },
    operatorChangeAsked(state, action: PayloadAction<{ id: string; name: string; change: OperatorChange }>) {
      state.pending = action.payload;
      state.error = null;
    },
    operatorChangeDismissed(state) {
      state.pending = null;
    },
    teamLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(operatorAdded.pending, (state) => {
        state.add.busy = true;
        state.add.error = null;
      })
      .addCase(operatorAdded.fulfilled, (state, action) => {
        state.add = blankAdd;
        state.created = action.payload;
      })
      .addCase(operatorAdded.rejected, (state, action) => {
        state.add.busy = false;
        state.add.error = action.payload ?? null;
      })
      .addCase(operatorChanged.pending, (state) => {
        state.busyId = state.pending?.id ?? null;
        state.error = null;
      })
      .addCase(operatorChanged.fulfilled, (state) => {
        state.busyId = null;
        state.pending = null;
      })
      .addCase(operatorChanged.rejected, (state, action) => {
        state.busyId = null;
        state.pending = null;
        state.error = action.payload ?? null;
      })
      .addCase(opsSignedOut, () => initialState);
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof opsTeamSlice> {}
}

const injected = opsTeamSlice.injectInto(rootReducer);
export const selectTeam = (state: RootState): OpsTeamState => injected.selectSlice(state);

export const {
  addOperatorOpened,
  addOperatorClosed,
  addOperatorEdited,
  addOperatorPasswordTyped,
  createdAcknowledged,
  operatorChangeAsked,
  operatorChangeDismissed,
  teamLeft,
} = opsTeamSlice.actions;

// ---- the list, as the page draws it

export type TeamRow = PlatformOperator & {
  isYou: boolean;
  /**
   * Why this account's role and status cannot be changed from here, or `null` when they can.
   * The server refuses both cases (`updateOperator`); this only says so before the press.
   */
  locked: string | null;
};

export type TeamView = {
  rows: TeamRow[];
  counts: { owners: number; staff: number; disabled: number };
};

/**
 * The server's two rules, mirrored for the buttons: nobody changes their own account, and an
 * active owner cannot be demoted or disabled while only two are active (the one acting and
 * the one being changed), because the platform would be left with a single owner.
 */
export function deriveTeam(operators: PlatformOperator[] | undefined, meId: string | null): TeamView {
  const rows = operators ?? [];
  const activeOwners = rows.filter((row) => row.role === 'owner' && row.status === 'active').length;
  return {
    rows: rows.map((row) => {
      const isYou = row.id === meId;
      const lastOwners = row.role === 'owner' && row.status === 'active' && activeOwners <= 2;
      return {
        ...row,
        isYou,
        locked: isYou
          ? 'You cannot change your own account.'
          : lastOwners
            ? 'The platform needs at least two owners before one steps down.'
            : null,
      };
    }),
    counts: {
      owners: rows.filter((row) => row.role === 'owner' && row.status === 'active').length,
      staff: rows.filter((row) => row.role === 'staff' && row.status === 'active').length,
      disabled: rows.filter((row) => row.status !== 'active').length,
    },
  };
}

export const selectTeamView = createSelector(
  [
    (state: RootState) => opsEndpoints.endpoints.getOperators.select()(state).data,
    (state: RootState) => state.ops.operator?.id ?? null,
  ],
  deriveTeam,
);
