// The builder PAGE's own state, beside the builder slice: loading the template, which
// question card is open, and Duplicate. docs/REDUX-PLAN.md §6.10 (R-707, DEC-R03).
//
// The draft, its saves and its undo history are `store/builderSlice.ts` (§6.7); this slice
// does not touch them. It REACTS to them: a duplicated question opens the copy, a moved one
// keeps its card open where it went, a deleted one closes it. That is `extraReducers` on
// another slice's actions, which is how one slice follows another without reaching into it.
import { createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { TemplateDetail } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { questionDuplicated, questionMoved, questionRemoved, templateLoaded, type Draft } from '../builderSlice.js';
import { readBuilderHistory } from '../builderHistoryStorage.js';
import { templatesApi } from '../api/endpoints/templates.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type BuilderPageState = {
  /** The template this page is loading or showing, or null once it is left. */
  templateId: string | null;
  load: 'loading' | 'ready' | 'failed';
  loadError: SerializedApiError | null;
  /** The expanded question card, by position; null when all are folded. */
  openAt: number | null;
  duplicating: boolean;
  duplicateError: SerializedApiError | null;
};

const initialState: BuilderPageState = {
  templateId: null,
  load: 'loading',
  loadError: null,
  openAt: 0,
  duplicating: false,
  duplicateError: null,
};

export const toDraft = (template: TemplateDetail): Draft => ({
  name: template.name,
  description: template.description ?? '',
  // `position` is dropped here and never sent: it is derived from array order on save
  // (37), and a client-supplied position that disagrees with the array is silently wrong.
  questions: template.questions.map((question) => ({
    id: question.id,
    kind: question.kind,
    text: question.text,
    config: question.config,
    required: question.required,
  })),
});

/**
 * Opens a template in the builder: ONE fresh read per visit (R-201), handed to the builder
 * slice. A later refetch (on reconnect, say) must never replace what is being typed, so
 * this is not a subscription the page renders from.
 *
 * A plain thunk, not `createAsyncThunk`, because it hands its caller the cache subscription
 * to let go of on leaving, and a function may not travel in an action. The answer is
 * dropped if the page has moved on to another template, or left, before it came.
 */
export const builderOpened =
  (id: string) =>
  (dispatch: AppDispatch, getState: () => RootState): (() => void) => {
    dispatch(builderLoadStarted({ templateId: id }));
    const request = dispatch(templatesApi.endpoints.getTemplate.initiate(id, { forceRefetch: true }));
    void request
      .unwrap()
      .then((detail) => {
        if (selectBuilderPage(getState()).templateId !== id) return;
        dispatch(
          templateLoaded({
            id,
            draft: toDraft(detail),
            locked: detail.readOnly,
            history: readBuilderHistory(id),
          }),
        );
        dispatch(builderLoadSucceeded({ templateId: id }));
      })
      .catch((error: unknown) => {
        if (selectBuilderPage(getState()).templateId !== id) return;
        dispatch(builderLoadFailed({ templateId: id, error: asStoreError(error) }));
      });
    return () => request.unsubscribe();
  };

/** "Duplicate to edit": a copy of a form that is locked by its campaigns. */
export const formDuplicated = createScreenThunk(
  'builderPage/formDuplicated',
  async ({ templateId, name }: { templateId: string; name: string }, { dispatch, rejectWithValue }) => {
    try {
      const copy: TemplateDetail = await dispatch(
        templatesApi.endpoints.cloneTemplate.initiate({
          id: templateId,
          key: `clone:${templateId}:${nanoid()}`,
          name: `${name} (copy)`,
        }),
      ).unwrap();
      return copy;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectBuilderPage(getState()).duplicating },
);

export const builderPageSlice = createSlice({
  name: 'builderPage',
  initialState,
  reducers: {
    builderLoadStarted(state, action: PayloadAction<{ templateId: string }>) {
      return { ...initialState, templateId: action.payload.templateId };
    },
    builderLoadSucceeded(state, action: PayloadAction<{ templateId: string }>) {
      if (state.templateId === action.payload.templateId) state.load = 'ready';
    },
    builderLoadFailed(state, action: PayloadAction<{ templateId: string; error: SerializedApiError }>) {
      if (state.templateId !== action.payload.templateId) return;
      state.load = 'failed';
      state.loadError = action.payload.error;
    },
    questionCardOpened(state, action: PayloadAction<{ index: number }>) {
      state.openAt = action.payload.index;
    },
    /** The page closed: a late answer for this template is ignored from now on. */
    builderPageLeft() {
      return { ...initialState, templateId: null };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(questionDuplicated, (state, action) => {
        state.openAt = action.payload.index + 1;
      })
      .addCase(questionRemoved, (state) => {
        state.openAt = null;
      })
      .addCase(questionMoved, (state, action) => {
        if (state.openAt === action.payload.from) state.openAt = action.payload.to;
      })
      .addCase(formDuplicated.pending, (state) => {
        state.duplicating = true;
        state.duplicateError = null;
      })
      .addCase(formDuplicated.fulfilled, (state) => {
        state.duplicating = false;
      })
      .addCase(formDuplicated.rejected, (state, action) => {
        state.duplicating = false;
        state.duplicateError = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectBuilderPage: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof builderPageSlice> {}
}

const injected = builderPageSlice.injectInto(rootReducer);

export const {
  builderLoadStarted,
  builderLoadSucceeded,
  builderLoadFailed,
  questionCardOpened,
  builderPageLeft,
} = builderPageSlice.actions;

export const { selectBuilderPage } = injected.selectors;
