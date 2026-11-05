// The powers grid's working copy. 33 § State; docs/REDUX-PLAN.md §6.8 (R-407).
//
// THE GRID IS NOT AUTOSAVED, AND THAT IS THE POINT. Every other editable surface in the
// product writes on blur, because the cost of a mistake is a rename somebody notices. Here
// the cost of a mistake is an organisation nobody can administer, so edits collect in a
// working copy until an explicit Save, and every edit can be undone before then.
//
// It used to be `useState` holding a `Map` inside `usePowersGrid`. Here it is a record
// keyed `roleId|capability` (a `Map` is not serialisable), and it lives in the store so it
// survives leaving the page: half a grid edited, a look at the People page, and back.
//
// The server's matrix is never edited in place. `saved` is the matrix as last read or
// saved; `cells` is the working copy; `past` is the undo stack. Whenever a new matrix
// arrives, the administrator's own edits are REBASED onto it (`rebase`), so a background
// re-read can neither throw their edits away nor quietly undo somebody else's save.
import {
  createAsyncThunk,
  createSelector,
  createSlice,
  current,
  isDraft,
  original,
  type PayloadAction,
  type WithSlice,
} from '@reduxjs/toolkit';
import type { GrantCell, GrantChoice } from '@endur/shared';
import { signedOut } from './authSlice.js';
import { api } from './api/api.js';
import { rolesApi } from './api/endpoints/roles.js';
import {
  isSerializedApiError,
  serializeApiError,
  type SerializedApiError,
} from './api/errors.js';
import { rootReducer, type AppDispatch, type RootState } from './index.js';

/** `roleId|capability`. A role id is a cuid and a capability is `noun.verb`, so `|` is
 *  never part of either. */
export type CellKey = string;
export const cellKey = (roleId: string, capability: string): CellKey =>
  `${roleId}|${capability}`;

/** Grant cells keyed by `cellKey`. An absent key is NO GRANT (default deny, `14`). */
export type Matrix = Record<CellKey, GrantCell>;

/** Undo steps kept. A grid edit is one click, so this is a long afternoon's worth. */
export const HISTORY_LIMIT = 100;

export type PowersGridState = {
  /** Whether a matrix has arrived from the server. Until then there is nothing to edit. */
  loaded: boolean;
  /** The matrix as the server last said it was. What a save is a diff against. */
  saved: Matrix;
  /** The working copy: what the grid shows. */
  cells: Matrix;
  /** Earlier working copies, newest last. */
  past: Matrix[];
  saving: boolean;
  /** The server's sentence for a refused save: the lockout guard, `WOULD_ESCALATE`. */
  saveError: string | null;
};

const initialState: PowersGridState = {
  loaded: false,
  saved: {},
  cells: {},
  past: [],
  saving: false,
  saveError: null,
};

/* ----------------------------------------------------------- pure helpers */

export function toMatrix(cells: readonly GrantCell[]): Matrix {
  const matrix: Matrix = {};
  for (const cell of cells) matrix[cellKey(cell.roleId, cell.capability)] = cell;
  return matrix;
}

/** Two cells say the same thing. Both absent is the same thing too. */
const same = (a: GrantCell | undefined, b: GrantCell | undefined): boolean =>
  a === b || (!!a && !!b && a.scope === b.scope && a.effect === b.effect);

/**
 * What a save sends: the DIFF, not the whole matrix. `33`'s "replaces the whole matrix"
 * describes the transaction, not the payload. `PUT /grants` writes the cells it is given
 * and leaves the rest alone, so sending 64 × 4 unchanged cells would rewrite every row,
 * clear `derived` on all of them, and make the audit entry claim a change nobody made.
 *
 * A removal is a cell with `scope: null`: default deny means an absent row is how a power
 * is taken away, so absence has to be sent explicitly.
 */
export function diffCells(saved: Matrix, cells: Matrix): GrantCell[] {
  const changed: GrantCell[] = [];
  for (const [key, cell] of Object.entries(cells)) {
    if (!same(saved[key], cell)) changed.push(cell);
  }
  for (const [key, cell] of Object.entries(saved)) {
    if (!(key in cells)) changed.push({ ...cell, scope: null });
  }
  return changed;
}

/**
 * `matrix`'s own edits (what it changed relative to `from`), replayed onto `onto`. A cell
 * the administrator did not touch takes the server's new value; a cell they did keeps
 * theirs. With no edits, the answer is simply `onto`.
 */
function rebase(matrix: Matrix, from: Matrix, onto: Matrix): Matrix {
  const out: Matrix = { ...onto };
  for (const key of new Set([...Object.keys(from), ...Object.keys(matrix)])) {
    const mine = matrix[key];
    if (same(mine, from[key])) continue;
    if (mine) out[key] = mine;
    else delete out[key];
  }
  return out;
}

/** The one place a cell's value is written, whatever asked for it. */
function writeCell(cells: Matrix, roleId: string, capability: string, choice: GrantChoice): void {
  const key = cellKey(roleId, capability);
  if (choice === null) delete cells[key];
  // A block is stored at `all` because it is not a narrow refusal: it is "not this, ever",
  // and a deny at a narrower scope would leave the wider part of the tree still allowed.
  else if (choice === 'blocked') cells[key] = { roleId, capability, scope: 'all', effect: 'deny' };
  else cells[key] = { roleId, capability, scope: choice, effect: 'allow' };
}

/** A plain copy of a draft's matrix: what the undo stack and `rebase` work on. */
const plain = (matrix: Matrix): Matrix => (isDraft(matrix) ? (original(matrix) ?? current(matrix)) : matrix);

/** Every edit goes through here, so undo is one implementation rather than three. */
function edit(state: PowersGridState, mutate: (cells: Matrix) => void): void {
  state.past.push(plain(state.cells));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  mutate(state.cells);
  state.saveError = null;
}

/** A new matrix from the server: the edits, and every undo step, carried across. */
function arrived(state: PowersGridState, from: Matrix, matrix: Matrix): void {
  state.cells = rebase(plain(state.cells), from, matrix);
  state.past = state.past.map((step) => rebase(plain(step), from, matrix));
  state.saved = matrix;
  state.loaded = true;
}

/** Everything a role held, out of one matrix: the role is gone. */
function withoutRole(matrix: Matrix, roleId: string): Matrix {
  const out: Matrix = {};
  for (const [key, cell] of Object.entries(matrix)) if (cell.roleId !== roleId) out[key] = cell;
  return out;
}

/* ------------------------------------------------------------- the save */

const createGridThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SerializedApiError;
}>();

/**
 * Save the working copy. Returns what was sent (to tell edits made during the save from
 * the ones in it) and the server's matrix after it.
 *
 * A refusal is REJECTED WITH THE SERVER'S ERROR and the working copy is untouched (`33`
 * § States): a refusal here is usually the lockout guard or `WOULD_ESCALATE`, both
 * sentences the administrator has to act on, and throwing their edits away would make the
 * message unusable.
 */
export const saveGrid = createGridThunk<{ sent: Matrix; matrix: GrantCell[] }, void>(
  'powersGrid/save',
  async (_arg, { getState, dispatch, rejectWithValue }) => {
    const { saved, cells } = selectPowersGrid(getState());
    try {
      const matrix = await dispatch(
        rolesApi.endpoints.putGrants.initiate({ cells: diffCells(saved, cells) }, { track: false }),
      ).unwrap();
      return { sent: cells, matrix };
    } catch (error) {
      return rejectWithValue(isSerializedApiError(error) ? error : serializeApiError(error));
    }
  },
  {
    // One save at a time, and never an empty one.
    condition: (_arg, { getState }) => {
      const grid = selectPowersGrid(getState());
      return !grid.saving && diffCells(grid.saved, grid.cells).length > 0;
    },
  },
);

/* ------------------------------------------------------------ the slice */

export const powersGridSlice = createSlice({
  name: 'powersGrid',
  initialState,
  reducers: {
    /**
     * One of the six things a cell can say (`DEC-076`), chosen by name. The click-cycle
     * it replaced could only reach a state by walking through ones nobody wanted.
     */
    cellSet(
      state,
      action: PayloadAction<{ roleId: string; capability: string; choice: GrantChoice }>,
    ) {
      const { roleId, capability, choice } = action.payload;
      edit(state, (cells) => writeCell(cells, roleId, capability, choice));
    },

    /**
     * Set a whole capability row, across every role, to the same thing.
     *
     * `roleIds` comes from the ROLE LIST, never from the cells already present: a role
     * that holds nothing has no cells, and deriving the columns from the working copy
     * would skip exactly the role a "grant this to everyone" click is most likely aimed at.
     */
    rowFilled(
      state,
      action: PayloadAction<{ capability: string; choice: GrantChoice; roleIds: string[] }>,
    ) {
      const { capability, choice, roleIds } = action.payload;
      edit(state, (cells) => {
        for (const [key, cell] of Object.entries(cells)) {
          if (cell.capability === capability) delete cells[key];
        }
        if (choice === null) return;
        for (const roleId of roleIds) writeCell(cells, roleId, capability, choice);
      });
    },

    undone(state) {
      const previous = state.past.pop();
      if (previous) state.cells = previous;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(saveGrid.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      // What was saved is the new baseline, and the undo stack ends there, as it always
      // did. An edit made while the save was in flight is not in it, so it is kept.
      .addCase(saveGrid.fulfilled, (state, action) => {
        const { sent, matrix } = action.payload;
        arrived(state, sent, toMatrix(matrix));
        state.past = [];
        state.saving = false;
      })
      .addCase(saveGrid.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload?.message ?? action.error.message ?? 'The save failed.';
      })
      // The working copy belongs to the session and the organisation: it goes when the
      // cache does (sign-out, org switch; `middleware/sessionReset.ts`).
      .addCase(signedOut, () => initialState)
      .addMatcher(api.util.resetApiState.match, () => initialState)
      // A deleted role takes its column with it, edits and undo steps included: a rebase
      // would keep an unsaved edit for it, and the next save would be refused for a role
      // that no longer exists.
      .addMatcher(rolesApi.endpoints.deleteRole.matchFulfilled, (state, action) => {
        const { id } = action.meta.arg.originalArgs;
        state.saved = withoutRole(plain(state.saved), id);
        state.cells = withoutRole(plain(state.cells), id);
        state.past = state.past.map((step) => withoutRole(plain(step), id));
      })
      // Every read of the matrix: the first, a re-read on returning to the page, one after
      // a role was deleted. Edits survive all of them (`rebase`).
      .addMatcher(rolesApi.endpoints.getGrants.matchFulfilled, (state, action) => {
        arrived(state, plain(state.saved), toMatrix(action.payload));
      });
  },

  selectors: {
    selectPowersGrid: (state) => state,
    selectGridCanUndo: (state) => state.past.length > 0,
    selectGridDirty: createSelector(
      [(state: PowersGridState) => state.saved, (state: PowersGridState) => state.cells],
      (saved, cells) => diffCells(saved, cells).length > 0,
    ),
  },
});

// Console-only, so injected from the Roles route chunk (§5: lazy-loaded slices).
declare module './index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof powersGridSlice> {}
}

const injectedPowersGridSlice = powersGridSlice.injectInto(rootReducer);

export const { cellSet, rowFilled, undone } = powersGridSlice.actions;

/** Root-state selectors. Before the grid's first action they read the initial state. */
export const { selectPowersGrid, selectGridCanUndo, selectGridDirty } =
  injectedPowersGridSlice.selectors;
