// Home's state: what used to be `useState` on the Home page and its two lists of forms.
// docs/REDUX-PLAN.md §6.10 (R-707, DEC-R03).
//
// Server data stays in the cache (`getHome`, `getWaiting`, `getAnswered`, `getAnnouncements`);
// this holds what the reader is doing with it: the range they picked, which card is open,
// which announcement they put away, whether the past-feedback list is unfolded.
//
// AND EVERY FIGURE THE ACTIVITY ROW DERIVES (R-717, §6.12): the server sends counts only, and
// `selectHomeFigures` below works out the response rate from two of them. Trace for "74%":
//   `state.home.range` ('30d') → `state.api.queries['getHome("30d")'].data.stats.audience`
//   ({ asked: 50, answered: 37 }) → `selectHomeFigures` → `rate` (37 of 50 · 74%) → the card.
import { createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { HomeView, StatWindow } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { announcementsApi } from '../api/endpoints/announcements.js';
import { homeApi } from '../api/endpoints/home.js';
import { rootReducer, type RootState } from '../index.js';
import { createScreenThunk } from './common.js';
import { newestAnswer, shareOf, type Share } from './figures.js';

export type HomeScreenState = {
  /** The stats row's window. */
  range: StatWindow;
  /** The active campaign whose share sheet is open, by id (the row is in `getHome`). */
  sharingId: string | null;
  /** Announcements put away this visit: gone from the banner at once, before the re-read. */
  dismissed: string[];
  /** The waiting form unfolded for answering, by campaign id. One at a time. */
  answeringId: string | null;
  /** "Show all" pressed on past feedback. */
  pastExpanded: boolean;
};

const initialState: HomeScreenState = {
  range: '30d',
  sharingId: null,
  dismissed: [],
  answeringId: null,
  pastExpanded: false,
};

/**
 * Puts an announcement away: off the banner now (`pending`), and the reader's own receipt
 * marked read on the server. A failure is silent, as before: the banner already did what the
 * reader asked, and the receipt is marked the next time anyway.
 */
export const announcementDismissed = createScreenThunk(
  'home/announcementDismissed',
  async (id: string, { dispatch }) => {
    await dispatch(announcementsApi.endpoints.markAnnouncementRead.initiate(id))
      .unwrap()
      .catch(() => undefined);
  },
);

export const homeScreenSlice = createSlice({
  name: 'home',
  initialState,
  reducers: {
    homeRangeChosen(state, action: PayloadAction<{ range: StatWindow }>) {
      state.range = action.payload.range;
    },
    homeShareOpened(state, action: PayloadAction<{ campaignId: string }>) {
      state.sharingId = action.payload.campaignId;
    },
    homeShareClosed(state) {
      state.sharingId = null;
    },
    /** "Answer" on a waiting form; pressing it on the open one ("Not now") folds it. */
    waitingFormToggled(state, action: PayloadAction<{ campaignId: string }>) {
      state.answeringId = state.answeringId === action.payload.campaignId ? null : action.payload.campaignId;
    },
    /** Answered: the card folds (and the re-read list drops it). */
    waitingFormAnswered(state) {
      state.answeringId = null;
    },
    pastFeedbackToggled(state) {
      state.pastExpanded = !state.pastExpanded;
    },
    /** Home closed: it opens next time as it always did. */
    homeLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(announcementDismissed.pending, (state, action) => {
        if (!state.dismissed.includes(action.meta.arg)) state.dismissed.push(action.meta.arg);
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectHomeRange: (state) => state.range,
    selectHomeSharingId: (state) => state.sharingId,
    selectDismissed: (state) => state.dismissed,
    selectAnsweringId: (state) => state.answeringId,
    selectPastExpanded: (state) => state.pastExpanded,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof homeScreenSlice> {}
}

const injected = homeScreenSlice.injectInto(rootReducer);

export const {
  homeRangeChosen,
  homeShareOpened,
  homeShareClosed,
  waitingFormToggled,
  waitingFormAnswered,
  pastFeedbackToggled,
  homeLeft,
} = homeScreenSlice.actions;

export const {
  selectHomeRange,
  selectHomeSharingId,
  selectDismissed,
  selectAnsweringId,
  selectPastExpanded,
} = injected.selectors;

// ---------------------------------------------------------------------------------------
// The Activity row's figures (R-717).
// ---------------------------------------------------------------------------------------

export type HomeFigures = {
  window: StatWindow;
  responses: number;
  subjectsCovered: number;
  activeCampaigns: number;
  /**
   * Responses OF the people asked, with the percentage, across the campaigns whose audience
   * can be counted. `null` when none can: an open link has no roll, so there is no rate.
   */
  rate: Share | null;
  /** More answers than people asked: a link reached people beyond the roll it was sent to. */
  overRoll: boolean;
};

/** The arithmetic, on its own so it is tested on its own. */
export function deriveHomeFigures(stats: HomeView['stats']): HomeFigures {
  const { audience } = stats;
  return {
    window: stats.window,
    responses: stats.responses,
    subjectsCovered: stats.subjectsCovered,
    activeCampaigns: stats.activeCampaigns,
    rate: audience ? shareOf(audience.answered, audience.asked) : null,
    overRoll: audience !== null && audience.answered > audience.asked,
  };
}

/**
 * The stats the page has on screen: the cached answer for the range in `state.home.range`,
 * or, while that range is still loading, the answer before it (which is what the page keeps
 * showing — `useLoadable`'s `data`).
 */
const selectShownStats = (state: RootState): HomeView['stats'] | undefined =>
  (homeApi.endpoints.getHome.select(selectHomeRange(state))(state).data ??
    newestAnswer<HomeView>(state, 'getHome'))?.stats;

/** Every figure on the Activity row, memoised: re-derived only when the stats change. */
export const selectHomeFigures = createSelector([selectShownStats], (stats) =>
  stats ? deriveHomeFigures(stats) : null,
);
