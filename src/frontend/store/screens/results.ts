// The results screen's state, per campaign: what is open, the export in flight, and the
// "just landed" maths. docs/REDUX-PLAN.md §6.10 (R-707, DEC-R03).
//
// The numbers themselves are the cache's (`getResults`, polled; `getResponses`). This slice
// REACTS to them: every fulfilled poll goes through `extraReducers` here, which is how the
// "+2 just now" on the counter is worked out — counted per answer, never per change, and
// never on the first answer after opening (612 responses "just now" because the page opened
// would make the one number on this screen that must be trusted look invented).
//
// AND EVERY FIGURE THE STAT CARDS DERIVE (R-717, §6.12): the server sends counts (responses,
// people asked, each question's answers and average), and `selectResultsFigures` below works
// out the response rate, the average rating and the share who left a comment. Trace for "77%":
//   `state.api.queries['getResults({"campaignId":"…","search":""})'].data` (responseCount 612,
//   audienceEstimate 800) → `selectResultsFigures` → `rate` (612 of 800 · 77%) → the card.
import { createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { QuestionSummary, ResultsView } from '@endur/shared';
import { request } from '../../lib/api.js';
import { signedOut } from '../authSlice.js';
import { resultsApi, type ResponsesPage } from '../api/endpoints/results.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';
import { newestAnswer, shareOf, type Share } from './figures.js';

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

// ---------------------------------------------------------------------------------------
// The stat cards' figures (R-717).
// ---------------------------------------------------------------------------------------

export type ResultsFigures = {
  responseCount: number;
  /** Responses OF the people asked. `null` for an open link (no roll) or a suppressed result. */
  rate: Share | null;
  /** More answers than people asked: anyone holding the link can respond. */
  overRoll: boolean;
  /** The mean of the rating questions' averages, and how many there were. */
  rating: { average: number; over: number } | null;
  /** Answers to free-text questions. */
  comments: number;
  /** Comments OF responses; `null` before the first response. */
  commentShare: Share | null;
};

/** Ratings only. NPS is a 0–10 instrument and averaging it with a 1–5 scale is nonsense. */
export function ratingAverage(questions: readonly QuestionSummary[]): { average: number; over: number } | null {
  const rated = questions.filter(
    (question) => question.kind === 'rating' && typeof question.average === 'number',
  );
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, question) => sum + (question.average ?? 0), 0);
  return { average: Math.round((total / rated.length) * 10) / 10, over: rated.length };
}

/** A "comment" is an answer to a free-text question. There is no other kind. */
export const commentCount = (questions: readonly QuestionSummary[]): number =>
  questions
    .filter((question) => question.kind === 'text')
    .reduce((sum, question) => sum + question.answered, 0);

/** The arithmetic, on its own so it is tested on its own. */
export function deriveResultsFigures(view: ResultsView): ResultsFigures {
  const questions = view.questions ?? [];
  const asked = view.audienceEstimate;
  const comments = commentCount(questions);
  const measurable = !view.suppressed && asked !== null && asked > 0;
  return {
    responseCount: view.responseCount,
    rate: measurable ? shareOf(view.responseCount, asked) : null,
    overRoll: measurable && view.responseCount > asked,
    rating: ratingAverage(questions),
    comments,
    commentShare: view.responseCount > 0 ? shareOf(comments, view.responseCount) : null,
  };
}

/**
 * The results the page has on screen: the cached answer for this campaign and filter, or,
 * while a new filter loads, the newest answer for this campaign (what the page keeps showing).
 */
const selectShownResults = (state: RootState, campaignId: string, search: string): ResultsView | undefined =>
  resultsApi.endpoints.getResults.select({ campaignId, search })(state).data ??
  newestAnswer<ResultsView>(
    state,
    'getResults',
    (args) => (args as { campaignId?: string } | undefined)?.campaignId === campaignId,
  );

/** Every figure on the stat cards, memoised: re-derived only when the cached answer changes. */
export const selectResultsFigures = createSelector([selectShownResults], (view) =>
  view ? deriveResultsFigures(view) : null,
);
