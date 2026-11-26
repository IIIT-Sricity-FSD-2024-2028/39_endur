// The improve loop: your own assessment, and the plan you write once the gap opens.
// docs/REDUX-PLAN.md §6.10 (R-711, DEC-R03); 44. The cycles, the form and the gap are the
// cache's (`reflectApi`), and which cycle is open is the URL's (`?campaign=`).
//
// THE ORDER is the server's: the gap answers 404 until your assessment is recorded, and the
// page shows the form or the gap from that answer, never from a flag kept here.
//
// Trace for "Record my assessment":
//   an answer → `reflectionAnswered` → the button → `reflectionSubmitted(campaignId)` →
//   `reflectApi.submitReflection` → the cycle's tag is invalidated, the gap re-reads, no
//   longer 404s, and the page shows it.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { AnswerValue, PlanItem } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { reflectApi } from '../api/endpoints/reflect.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type ReflectPage = {
  answers: Record<string, AnswerValue>;
  saving: boolean;
  formError: SerializedApiError | null;
  /** The plan being written: `null` until edited, and the page shows the saved one meanwhile. */
  planItems: PlanItem[] | null;
  planBusy: boolean;
  planError: SerializedApiError | null;
  /** "Finalise" asks first: it is permanent. */
  confirmingFinalise: boolean;
};

export type ReflectScreenState = { pages: Record<string, ReflectPage> };

const initialState: ReflectScreenState = { pages: {} };

const blankPage = (): ReflectPage => ({
  answers: {},
  saving: false,
  formError: null,
  planItems: null,
  planBusy: false,
  planError: null,
  confirmingFinalise: false,
});

const pageOf = (state: ReflectScreenState, id: string): ReflectPage => (state.pages[id] ??= blankPage());

/** A plan with nothing in it yet: one empty line to write in. */
export const EMPTY_PLAN: PlanItem[] = [{ text: '', status: 'open' }];

/** "Record my assessment". Once only. */
export const reflectionSubmitted = createScreenThunk(
  'reflect/reflectionSubmitted',
  async (
    { campaignId, subjectId }: { campaignId: string; subjectId: string },
    { dispatch, getState, rejectWithValue },
  ) => {
    const answers = selectReflectScreen(getState()).pages[campaignId]?.answers ?? {};
    try {
      await dispatch(reflectApi.endpoints.submitReflection.initiate({
        campaignId,
        body: {
          subjectId,
          answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
        },
      })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: ({ campaignId }, { getState }) => !selectReflectScreen(getState()).pages[campaignId]?.saving },
);

/** "Save plan": the lines with something written in them. `from` is the plan on screen. */
export const planSaved = createScreenThunk(
  'reflect/planSaved',
  async ({ campaignId, from }: { campaignId: string; from: PlanItem[] }, { dispatch, getState, rejectWithValue }) => {
    const items = selectReflectScreen(getState()).pages[campaignId]?.planItems ?? from;
    try {
      await dispatch(reflectApi.endpoints.savePlan.initiate({
        campaignId,
        body: { items: items.filter((item) => item.text.trim().length > 0) },
      })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: ({ campaignId }, { getState }) => !selectReflectScreen(getState()).pages[campaignId]?.planBusy },
);

/** "Finalise", confirmed: the plan becomes a record and cannot be edited. */
export const planFinalised = createScreenThunk(
  'reflect/planFinalised',
  async ({ campaignId, planId }: { campaignId: string; planId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(reflectApi.endpoints.finalisePlan.initiate({ campaignId, planId })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: ({ campaignId }, { getState }) => !selectReflectScreen(getState()).pages[campaignId]?.planBusy },
);

export const reflectScreenSlice = createSlice({
  name: 'reflect',
  initialState,
  reducers: {
    reflectionAnswered(state, action: PayloadAction<{ campaignId: string; questionId: string; value: AnswerValue }>) {
      const { campaignId, questionId, value } = action.payload;
      pageOf(state, campaignId).answers[questionId] = value;
    },
    planLineEdited(
      state,
      action: PayloadAction<{ campaignId: string; index: number; patch: Partial<PlanItem>; from: PlanItem[] }>,
    ) {
      const { campaignId, index, patch, from } = action.payload;
      const page = pageOf(state, campaignId);
      // A copy: `from` is the cached plan, which is frozen.
      const items = (page.planItems ??= from.map((line) => ({ ...line })));
      const item = items[index];
      if (item) Object.assign(item, patch);
    },
    planLineAdded(state, action: PayloadAction<{ campaignId: string; from: PlanItem[] }>) {
      const page = pageOf(state, action.payload.campaignId);
      (page.planItems ??= action.payload.from.map((line) => ({ ...line }))).push({ text: '', status: 'open' });
    },
    finaliseAsked(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).confirmingFinalise = true;
    },
    finaliseDismissed(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).confirmingFinalise = false;
    },
    /** Back to the list, or another cycle: this one's drafts go. */
    reflectCycleLeft(state, action: PayloadAction<{ campaignId: string | null }>) {
      if (action.payload.campaignId) delete state.pages[action.payload.campaignId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(reflectionSubmitted.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.saving = true;
        page.formError = null;
      })
      .addCase(reflectionSubmitted.fulfilled, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.saving = false;
        page.answers = {};
      })
      .addCase(reflectionSubmitted.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.saving = false;
        page.formError = action.payload ?? null;
      })
      .addCase(planSaved.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = true;
        page.planError = null;
      })
      // Saved: the page shows the server's copy of the plan again.
      .addCase(planSaved.fulfilled, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = false;
        page.planItems = null;
      })
      .addCase(planSaved.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = false;
        page.planError = action.payload ?? null;
      })
      .addCase(planFinalised.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = true;
        page.planError = null;
        page.confirmingFinalise = false;
      })
      .addCase(planFinalised.fulfilled, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = false;
        page.planItems = null;
      })
      .addCase(planFinalised.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.planBusy = false;
        page.planError = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectReflectScreen: (state) => state,
    selectReflectPage: (state, campaignId: string): ReflectPage => state.pages[campaignId] ?? BLANK,
  },
});

const BLANK = blankPage();

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof reflectScreenSlice> {}
}

const injected = reflectScreenSlice.injectInto(rootReducer);

export const {
  reflectionAnswered,
  planLineEdited,
  planLineAdded,
  finaliseAsked,
  finaliseDismissed,
  reflectCycleLeft,
} = reflectScreenSlice.actions;

export const { selectReflectScreen, selectReflectPage } = injected.selectors;
