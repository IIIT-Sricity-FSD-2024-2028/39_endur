// Home's state: what used to be `useState` on the Home page and its two lists of forms.
// docs/REDUX-PLAN.md §6.10 (R-707, DEC-R03).
//
// Server data stays in the cache (`getHome`, `getWaiting`, `getAnswered`, `getAnnouncements`);
// this holds what the reader is doing with it: the range they picked, which card is open,
// which announcement they put away, whether the past-feedback list is unfolded.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { StatWindow } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { announcementsApi } from '../api/endpoints/announcements.js';
import { rootReducer } from '../index.js';
import { createScreenThunk } from './common.js';

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
