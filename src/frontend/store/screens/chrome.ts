// The shell's own state: the theme, the phone drawer, which top-bar menu is open, and the
// support-session strip. docs/REDUX-PLAN.md §6.10 (R-712, DEC-R03).
//
// Injected rather than added to `uiSlice`: that slice is in the respondent's entry chunk,
// and the theme's storage helpers have no business there.
//
// The theme is ALSO in `localStorage` (`lib/theme.ts`): that copy is what the page reads
// before React starts, so the first paint is already the right colour. This slice is what
// the toggle and the shell read once it has.
import { createAsyncThunk, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { opsRequest } from '../../lib/ops.js';
import { readChoice, type ThemeChoice } from '../../lib/theme.js';
import { signedOut } from '../authSlice.js';
import { rootReducer } from '../index.js';

export type ChromeState = {
  theme: ThemeChoice;
  drawerOpen: boolean;
  /** The id of the top-bar menu that is open, or none. One at a time. */
  openMenu: string | null;
  support: {
    /** The clock the strip's countdown reads, ticked every 30 seconds while it shows. */
    now: number;
    leaving: boolean;
  };
};

const initialState = (): ChromeState => ({
  theme: readChoice(),
  drawerOpen: false,
  openMenu: null,
  support: { now: Date.now(), leaving: false },
});

/**
 * The operator's "Leave" on the support strip. The session row is ended before anything
 * else on the server, so the caller goes back to `/ops` whatever this answers.
 */
export const supportSessionLeft = createAsyncThunk('chrome/supportSessionLeft', async () => {
  try {
    await opsRequest('POST', '/support-session/leave', {});
  } catch {
    // Back to /ops regardless: if the call reached the server, the access is already gone.
  }
});

export const chromeSlice = createSlice({
  name: 'chrome',
  initialState,
  reducers: {
    themeChosen(state, action: PayloadAction<{ theme: ThemeChoice }>) {
      state.theme = action.payload.theme;
    },
    drawerOpened(state) {
      state.drawerOpen = true;
    },
    /** Closed by its backdrop, Escape, a link inside it, or the route changing under it. */
    drawerClosed(state) {
      state.drawerOpen = false;
    },
    menuToggled(state, action: PayloadAction<{ id: string }>) {
      state.openMenu = state.openMenu === action.payload.id ? null : action.payload.id;
    },
    /** Closed by Escape, a press outside it, or choosing from it. Only if it is this one. */
    menuClosed(state, action: PayloadAction<{ id: string }>) {
      if (state.openMenu === action.payload.id) state.openMenu = null;
    },
    supportClockTicked: {
      reducer(state, action: PayloadAction<{ now: number }>) {
        state.support.now = action.payload.now;
      },
      /** The time is read here, not in the reducer. */
      prepare: () => ({ payload: { now: Date.now() } }),
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(supportSessionLeft.pending, (state) => {
        state.support.leaving = true;
      })
      // The theme is the browser's, not the session's: it outlives signing out.
      .addCase(signedOut, (state) => ({ ...initialState(), theme: state.theme }));
  },
  selectors: {
    selectTheme: (state) => state.theme,
    selectDrawerOpen: (state) => state.drawerOpen,
    selectOpenMenu: (state) => state.openMenu,
    selectSupportClock: (state) => state.support,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof chromeSlice> {}
}

const injected = chromeSlice.injectInto(rootReducer);

export const {
  themeChosen,
  drawerOpened,
  drawerClosed,
  menuToggled,
  menuClosed,
  supportClockTicked,
} = chromeSlice.actions;

export const { selectTheme, selectDrawerOpen, selectOpenMenu, selectSupportClock } = injected.selectors;
