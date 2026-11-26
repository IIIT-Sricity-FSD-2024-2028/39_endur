// The Structure page's state: the selected unit, the row being added, what the tree has been
// asked to do, the per-row message, and the unit whose deletion is being confirmed.
// docs/REDUX-PLAN.md §6.10 (R-709, DEC-R03). The tree itself is the cache's (`getUnits`).
import { createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { CreateUnitBody } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { unitsApi } from '../api/endpoints/units.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, messageOf } from './common.js';

/** A row being added, before it has a name: a placeholder in the tree, keyed `draft:…`. */
export type UnitDraft = { id: string; parentId: string | null };

/** "Rename" or "Move" pressed in the side panel: the tree acts on it. `nonce` makes a repeat a new ask. */
export type TreeRequest = { id: string; action: 'rename' | 'move'; nonce: number };

export type StructureScreenState = {
  selectedId: string | null;
  draft: UnitDraft | null;
  request: TreeRequest | null;
  /** The line under one row: why its last command did not happen. */
  rowMessage: { id: string; text: string } | null;
  /** The unit whose deletion is being confirmed. */
  deletingId: string | null;
};

export const DRAFT = 'draft:';
export const isDraftRow = (id: string): boolean => id.startsWith(DRAFT);

const initialState: StructureScreenState = {
  selectedId: null,
  draft: null,
  request: null,
  rowMessage: null,
  deletingId: null,
};

/**
 * The tree's commands. Each takes the row it is about and what to say if the server says
 * nothing usable, so a failure lands under that row in the server's own words.
 */
type RowArg = { rowId: string; failure: string };

export const unitsCreated = createScreenThunk(
  'structure/unitsCreated',
  async ({ body }: RowArg & { body: CreateUnitBody }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(unitsApi.endpoints.createUnit.initiate(body)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** A rename is optimistic in the cache, and undone there on failure (R-402). */
export const unitRenamed = createScreenThunk(
  'structure/unitRenamed',
  async ({ rowId, name }: RowArg & { name: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(unitsApi.endpoints.renameUnit.initiate({ id: rowId, name })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** A move waits for the server: its cycle check decides it. */
export const unitReparented = createScreenThunk(
  'structure/unitReparented',
  async ({ rowId, newParentId }: RowArg & { newParentId: string | null }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(unitsApi.endpoints.reparentUnit.initiate({ id: rowId, newParentId })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** A branch with children hands them to its own parent; a leaf just goes. */
export const unitDeleted = createScreenThunk(
  'structure/unitDeleted',
  async (
    { rowId, reassignChildrenTo }: RowArg & { reassignChildrenTo?: string | undefined },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(unitsApi.endpoints.deleteUnit.initiate({ id: rowId, reassignChildrenTo })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

const failed = (state: StructureScreenState, arg: RowArg, error: unknown): void => {
  const text = messageOf(error as Parameters<typeof messageOf>[0], arg.failure);
  if (text) state.rowMessage = { id: arg.rowId, text };
};

export const structureScreenSlice = createSlice({
  name: 'structure',
  initialState,
  reducers: {
    unitSelected(state, action: PayloadAction<{ unitId: string | null }>) {
      state.selectedId = action.payload.unitId;
    },
    /** "Add" pressed: a nameless row under `parentId`, with a fresh id from `prepare`. */
    unitDraftStarted: {
      reducer(state, action: PayloadAction<UnitDraft>) {
        state.draft = action.payload;
        state.rowMessage = null;
      },
      prepare: (parentId: string | null) => ({ payload: { id: `${DRAFT}${nanoid(8)}`, parentId } }),
    },
    unitDraftDropped(state, action: PayloadAction<{ id: string }>) {
      if (state.draft?.id === action.payload.id) state.draft = null;
    },
    /** Each ask counts up, so pressing Rename twice on the same unit is two asks. */
    treeAsked(state, action: PayloadAction<{ id: string; action: 'rename' | 'move' }>) {
      state.request = { ...action.payload, nonce: (state.request?.nonce ?? 0) + 1 };
    },
    /** A message the page worked out itself (too many units in one go), under the row. */
    rowMessageShown(state, action: PayloadAction<{ id: string; text: string }>) {
      state.rowMessage = action.payload;
    },
    unitDeleteAsked(state, action: PayloadAction<{ unitId: string }>) {
      state.deletingId = action.payload.unitId;
    },
    unitDeleteDismissed(state) {
      state.deletingId = null;
    },
    structurePageLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(unitsCreated.pending, (state) => {
        state.rowMessage = null;
      })
      .addCase(unitsCreated.fulfilled, (state) => {
        state.draft = null;
      })
      .addCase(unitsCreated.rejected, (state, action) => failed(state, action.meta.arg, action.payload))
      .addCase(unitRenamed.pending, (state) => {
        state.rowMessage = null;
      })
      .addCase(unitRenamed.rejected, (state, action) => failed(state, action.meta.arg, action.payload))
      .addCase(unitReparented.pending, (state) => {
        state.rowMessage = null;
      })
      .addCase(unitReparented.rejected, (state, action) => failed(state, action.meta.arg, action.payload))
      .addCase(unitDeleted.pending, (state) => {
        state.deletingId = null;
      })
      .addCase(unitDeleted.fulfilled, (state, action) => {
        if (state.selectedId === action.meta.arg.rowId) state.selectedId = null;
      })
      .addCase(unitDeleted.rejected, (state, action) => failed(state, action.meta.arg, action.payload))
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectStructure: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof structureScreenSlice> {}
}

const injected = structureScreenSlice.injectInto(rootReducer);

export const {
  unitSelected,
  unitDraftStarted,
  unitDraftDropped,
  treeAsked,
  rowMessageShown,
  unitDeleteAsked,
  unitDeleteDismissed,
  structurePageLeft,
} = structureScreenSlice.actions;

export const { selectStructure } = injected.selectors;
