// The Roles page's state: which tab, the ladder's commands and dialogs, and how the powers
// grid is being looked at (folded groups, the search, the "you will lose this" check).
// docs/REDUX-PLAN.md §6.10 (R-709, DEC-R03).
//
// The roles are the cache's; the grid's WORKING COPY is `powersGridSlice` (§6.8). This slice
// holds neither: it is what the administrator is doing with them.
import { createSlice, isAnyOf, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { signedOut } from '../authSlice.js';
import { rolesApi } from '../api/endpoints/roles.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type RolesTab = 'roles' | 'powers';

export type RolesScreenState = {
  tab: RolesTab;
  ladder: {
    adding: boolean;
    busy: boolean;
    error: SerializedApiError | null;
    /** The role whose deletion is being confirmed, and who its holders move to. */
    deletingId: string | null;
    reassignTo: string;
  };
  powers: {
    /** Groups folded shut, by module name. */
    closed: string[];
    query: string;
    /** The save would take away the administrator's own power to edit the grid. */
    confirming: boolean;
  };
};

const freshLadder = (): RolesScreenState['ladder'] => ({
  adding: false,
  busy: false,
  error: null,
  deletingId: null,
  reassignTo: '',
});

const initialState: RolesScreenState = {
  tab: 'roles',
  ladder: freshLadder(),
  powers: { closed: [], query: '', confirming: false },
};

// Each ladder command re-reads the ladder through the `Role` tags; a reorder takes the
// server's re-read list into the cache, so the derived levels arrive with the answer.

export const roleAdded = createScreenThunk(
  'roles/roleAdded',
  async (name: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(rolesApi.endpoints.createRole.initiate(name)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const roleRenamed = createScreenThunk(
  'roles/roleRenamed',
  async ({ roleId, name }: { roleId: string; name: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(rolesApi.endpoints.renameRole.initiate({ id: roleId, name })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const rolesReordered = createScreenThunk(
  'roles/rolesReordered',
  async (orderedIds: string[], { dispatch, rejectWithValue }) => {
    try {
      await dispatch(rolesApi.endpoints.reorderRoles.initiate(orderedIds)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** A role with holders cannot go until they are moved: `reassignTo` names where. */
export const roleDeleted = createScreenThunk(
  'roles/roleDeleted',
  async (
    { roleId, reassignTo }: { roleId: string; reassignTo?: string | undefined },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(rolesApi.endpoints.deleteRole.initiate({ id: roleId, reassignTo })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

const ladderCommands = [roleAdded, roleRenamed, rolesReordered, roleDeleted] as const;

export const rolesScreenSlice = createSlice({
  name: 'roles',
  initialState,
  reducers: {
    rolesTabChosen(state, action: PayloadAction<{ tab: RolesTab }>) {
      state.tab = action.payload.tab;
    },
    roleAddOpened(state) {
      state.ladder.adding = true;
    },
    roleAddClosed(state) {
      state.ladder.adding = false;
    },
    roleDeleteAsked(state, action: PayloadAction<{ roleId: string }>) {
      state.ladder.deletingId = action.payload.roleId;
      state.ladder.reassignTo = '';
    },
    roleDeleteDismissed(state) {
      state.ladder.deletingId = null;
    },
    reassignChosen(state, action: PayloadAction<{ roleId: string }>) {
      state.ladder.reassignTo = action.payload.roleId;
    },

    powerGroupToggled(state, action: PayloadAction<{ module: string }>) {
      const at = state.powers.closed.indexOf(action.payload.module);
      if (at === -1) state.powers.closed.push(action.payload.module);
      else state.powers.closed.splice(at, 1);
    },
    /** "Collapse all" folds the groups it names; "Expand all" sends none. */
    powerGroupsSet(state, action: PayloadAction<{ closed: string[] }>) {
      state.powers.closed = action.payload.closed;
    },
    powerSearchTyped(state, action: PayloadAction<{ query: string }>) {
      state.powers.query = action.payload.query;
    },
    ownGridLossAsked(state) {
      state.powers.confirming = true;
    },
    ownGridLossSettled(state) {
      state.powers.confirming = false;
    },

    rolesPageLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(roleAdded.pending, (state) => {
        state.ladder.adding = false;
      })
      .addCase(roleDeleted.pending, (state) => {
        state.ladder.deletingId = null;
      })
      .addCase(signedOut, () => initialState)
      .addMatcher(isAnyOf(...ladderCommands.map((thunk) => thunk.pending)), (state) => {
        state.ladder.busy = true;
        state.ladder.error = null;
      })
      .addMatcher(isAnyOf(...ladderCommands.map((thunk) => thunk.fulfilled)), (state) => {
        state.ladder.busy = false;
      })
      .addMatcher(isAnyOf(...ladderCommands.map((thunk) => thunk.rejected)), (state, action) => {
        state.ladder.busy = false;
        state.ladder.error = action.payload ?? null;
      });
  },
  selectors: {
    selectRolesTab: (state) => state.tab,
    selectLadder: (state) => state.ladder,
    selectPowersView: (state) => state.powers,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof rolesScreenSlice> {}
}

const injected = rolesScreenSlice.injectInto(rootReducer);

export const {
  rolesTabChosen,
  roleAddOpened,
  roleAddClosed,
  roleDeleteAsked,
  roleDeleteDismissed,
  reassignChosen,
  powerGroupToggled,
  powerGroupsSet,
  powerSearchTyped,
  ownGridLossAsked,
  ownGridLossSettled,
  rolesPageLeft,
} = rolesScreenSlice.actions;

export const { selectRolesTab, selectLadder, selectPowersView } = injected.selectors;
