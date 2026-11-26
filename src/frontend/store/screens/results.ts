// The results screen's state, per campaign: what is open, the export in flight, and the
// "just landed" maths. docs/REDUX-PLAN.md §6.10 (R-707, DEC-R03).
//
// The numbers themselves are the cache's (`getResults`, polled; `getResponses`). This slice
// REACTS to them: every fulfilled poll goes through `extraReducers` here, which is how the
// "+2 just now" on the counter is worked out — counted per answer, never per change, and
// never on the first answer after opening (612 responses "just now" because the page opened
// would make the one number on this screen that must be trusted look invented).
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { request } from '../../lib/api.js';
import { signedOut } from '../authSlice.js';
import { resultsApi, type ResponsesPage } from '../api/endpoints/results.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type ResultsPage = {
  sharing: boolean;
  exporting: boolean;
  exportError: SerializedApiError | null;
  commentsExpanded: boolean;
  /**
   * The newest comment's time when comments first arrived on this visit. Anything later is
   * marked new. `undefined` until then; `null` never (an empty list records the epoch).
   */
  seenBefore: string | undefined;
  /** Per filter (`search`): the response count the last poll saw, and how many it added. */
  lastCount: Record<string, number>;
  arrived: Record<string, number>;
};

export type ResultsScreenState = { pages: Record<string, ResultsPage> };

const initialState: ResultsScreenState = { pages: {} };

export const BLANK_RESULTS: ResultsPage = {
  sharing: false,
  exporting: false,
  exportError: null,
  commentsExpanded: false,
  seenBefore: undefined,
  lastCount: {},
  arrived: {},
};

const pageOf = (state: ResultsScreenState, campaignId: string): ResultsPage =>
  (state.pages[campaignId] ??= { ...BLANK_RESULTS, lastCount: {}, arrived: {} });

/** Hands the browser a file. A side effect, so it lives in the thunk, never in a reducer. */
export function saveCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export CSV. Fetched through the API client rather than linked to: an `<a href>` would
 * answer a 402 (export is a Silver feature, `16` §3) by navigating to a page of raw JSON.
 * Here the plan message lands inline, where it can be acted on.
 */
export const resultsExported = createScreenThunk(
  'results/resultsExported',
  async ({ campaignId, filename }: { campaignId: string; filename: string }, { rejectWithValue }) => {
    try {
      const csv = await request<string>('GET', `/campaigns/${campaignId}/export`);
      saveCsv(filename, csv);
      return { campaignId };
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: ({ campaignId }, { getState }) => !selectResultsPage(getState(), campaignId).exporting },
);

export const resultsScreenSlice = createSlice({
  name: 'results',
  initialState,
  reducers: {
    /** The page opened: polls from now on are counted. Nothing landed "just now" yet. */
    resultsPageOpened(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId);
    },
    resultsPageLeft(state, action: PayloadAction<{ campaignId: string }>) {
      delete state.pages[action.payload.campaignId];
    },
    resultsShareOpened(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).sharing = true;
    },
    resultsShareClosed(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).sharing = false;
    },
    commentsExpanded(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).commentsExpanded = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(resultsExported.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.exporting = true;
        page.exportError = null;
      })
      .addCase(resultsExported.fulfilled, (state, action) => {
        pageOf(state, action.meta.arg.campaignId).exporting = false;
      })
      .addCase(resultsExported.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.exporting = false;
        page.exportError = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState)
      // A poll answered. Only for a page that is open: a late answer after leaving must not
      // seed the next visit's count, or its first poll would report arrivals.
      .addMatcher(resultsApi.endpoints.getResults.matchFulfilled, (state, action) => {
        const { campaignId, search } = action.meta.arg.originalArgs;
        const page = state.pages[campaignId];
        if (!page) return;
        const count = action.payload.responseCount;
        const before = page.lastCount[search];
        page.lastCount[search] = count;
        page.arrived[search] = before === undefined ? 0 : Math.max(0, count - before);
      })
      // The first comments of this visit fix what counts as "new" from here on.
      .addMatcher(resultsApi.endpoints.getResponses.matchFulfilled, (state, action) => {
        const page = state.pages[action.meta.arg.originalArgs];
        if (!page || page.seenBefore !== undefined) return;
        const pages = (action.payload as { pages?: ResponsesPage[] }).pages ?? [];
        page.seenBefore = pages[0]?.data[0]?.submittedAt ?? new Date(0).toISOString();
      });
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof resultsScreenSlice> {}
}

const injected = resultsScreenSlice.injectInto(rootReducer);

export const {
  resultsPageOpened,
  resultsPageLeft,
  resultsShareOpened,
  resultsShareClosed,
  commentsExpanded,
} = resultsScreenSlice.actions;

export const selectResultsPage = (state: RootState, campaignId: string): ResultsPage =>
  injected.selectSlice(state).pages[campaignId] ?? BLANK_RESULTS;

/** How many responses the most recent poll added, for this campaign and filter. */
export const selectArrived = (state: RootState, campaignId: string, search: string): number =>
  selectResultsPage(state, campaignId).arrived[search] ?? 0;
