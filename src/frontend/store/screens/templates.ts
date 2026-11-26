// The template screens' state: the list's search box, what is open on it, the per-card
// commands, the blank-form dialog, and one template's page. docs/REDUX-PLAN.md §6.10
// (R-707, DEC-R03). The templates themselves are the cache's.
import { createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { nameField, type TemplateDetail, type TemplateSummary } from '@endur/shared';
import { isValid } from '../../lib/validate.js';
import { signedOut } from '../authSlice.js';
import { toastShown } from '../uiSlice.js';
import { templatesApi } from '../api/endpoints/templates.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type BlankFormDraft = {
  name: string;
  category: string;
  saving: boolean;
  error: SerializedApiError | null;
};

/** One template's own page (`/app/templates/:id`). */
export type TemplatePage = {
  copying: boolean;
  confirmingDelete: boolean;
  error: SerializedApiError | null;
  /** Which command `error` came from, so the page can say which one did not happen. */
  failedDuring: TemplateCommand | null;
};

export type TemplateCommand = 'copy' | 'delete';

export type TemplatesScreenState = {
  /** The search box as typed; `null` until typed, when it shows the URL's `q`. */
  searchDraft: string | null;
  /** The template previewed, by id (own or library: both are in the cache). */
  previewId: string | null;
  /** The template whose delete is being confirmed, by id. */
  deletingId: string | null;
  /** The card whose copy is in flight. */
  busyId: string | null;
  /** The card a command failed on, which command, and what the server said. */
  cardError: { id: string; error: SerializedApiError; during: TemplateCommand } | null;
  blank: BlankFormDraft | null;
  pages: Record<string, TemplatePage>;
};

const initialState: TemplatesScreenState = {
  searchDraft: null,
  previewId: null,
  deletingId: null,
  busyId: null,
  cardError: null,
  blank: null,
  pages: {},
};

export const BLANK_TEMPLATE_PAGE: TemplatePage = {
  copying: false,
  confirmingDelete: false,
  error: null,
  failedDuring: null,
};

/** What to say when a command failed and the server said nothing usable. */
export const FAILED: Record<TemplateCommand, string> = {
  copy: 'That could not be copied.',
  delete: 'That could not be deleted.',
};

const pageOf = (state: TemplatesScreenState, id: string): TemplatePage =>
  (state.pages[id] ??= { ...BLANK_TEMPLATE_PAGE });

/** A blank form can be created once it has a name and a category the server will take. */
export const blankReady = (draft: BlankFormDraft): boolean =>
  isValid(nameField(120), draft.name) && isValid(nameField(60), draft.category);

/**
 * Copies a template into the organisation. `from` says which screen asked, so a failure
 * lands where the press was: on the card, or on the template's own page. A double press is
 * one copy: the button is disabled while this is in flight, and the idempotency key covers
 * a phone that retries because the first answer never arrived (36 § Acceptance).
 */
export const templateCopied = createScreenThunk(
  'templates/templateCopied',
  async (
    { templateId }: { templateId: string; from: 'card' | 'page' },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const copy: TemplateDetail = await dispatch(
        templatesApi.endpoints.cloneTemplate.initiate({
          id: templateId,
          key: `clone:${templateId}:${nanoid()}`,
        }),
      ).unwrap();
      return copy;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** Deletes a template, once confirmed. The list re-reads by itself (the tag). */
export const templateDeleted = createScreenThunk(
  'templates/templateDeleted',
  async (
    { templateId, name }: { templateId: string; name: string; from: 'card' | 'page' },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(templatesApi.endpoints.deleteTemplate.initiate(templateId)).unwrap();
      dispatch(toastShown({ message: `${name} deleted.` }));
      return { templateId };
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/** Creates the blank form in the dialog. The page then opens it in the builder. */
export const blankFormCreated = createScreenThunk(
  'templates/blankFormCreated',
  async (_: void, { getState, dispatch, rejectWithValue }) => {
    const draft = selectBlankForm(getState());
    if (!draft) throw new Error('The dialog is closed.');
    try {
      const created: TemplateSummary = await dispatch(
        templatesApi.endpoints.createTemplate.initiate({
          name: draft.name.trim(),
          category: draft.category.trim(),
        }),
      ).unwrap();
      return created;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const draft = selectBlankForm(getState());
      return Boolean(draft && !draft.saving && blankReady(draft));
    },
  },
);

export const templatesScreenSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {
    templateSearchTyped(state, action: PayloadAction<{ term: string }>) {
      state.searchDraft = action.payload.term;
    },
    templatePreviewOpened(state, action: PayloadAction<{ templateId: string }>) {
      state.previewId = action.payload.templateId;
    },
    templatePreviewClosed(state) {
      state.previewId = null;
    },
    templateDeleteAsked(state, action: PayloadAction<{ templateId: string }>) {
      state.deletingId = action.payload.templateId;
    },
    templateDeleteDismissed(state) {
      state.deletingId = null;
    },
    blankFormOpened(state) {
      state.blank = { name: '', category: 'General', saving: false, error: null };
    },
    blankFormClosed(state) {
      state.blank = null;
    },
    blankFormEdited(state, action: PayloadAction<{ name?: string; category?: string }>) {
      if (!state.blank) return;
      if (action.payload.name !== undefined) state.blank.name = action.payload.name;
      if (action.payload.category !== undefined) state.blank.category = action.payload.category;
    },
    templatesPageLeft(state) {
      return { ...initialState, pages: state.pages };
    },

    // ---- one template's page ----
    templateDeleteAskedOnPage(state, action: PayloadAction<{ templateId: string }>) {
      pageOf(state, action.payload.templateId).confirmingDelete = true;
    },
    templateDeleteDismissedOnPage(state, action: PayloadAction<{ templateId: string }>) {
      pageOf(state, action.payload.templateId).confirmingDelete = false;
    },
    templatePageLeft(state, action: PayloadAction<{ templateId: string }>) {
      delete state.pages[action.payload.templateId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(templateCopied.pending, (state, action) => {
        const { templateId, from } = action.meta.arg;
        if (from === 'page') {
          const page = pageOf(state, templateId);
          page.copying = true;
          page.error = null;
          page.failedDuring = null;
        } else {
          state.busyId = templateId;
          state.cardError = null;
        }
      })
      .addCase(templateCopied.fulfilled, (state, action) => {
        const { templateId, from } = action.meta.arg;
        if (from === 'page') pageOf(state, templateId).copying = false;
        else state.busyId = null;
      })
      .addCase(templateCopied.rejected, (state, action) => {
        const { templateId, from } = action.meta.arg;
        const error = action.payload ?? null;
        if (from === 'page') {
          const page = pageOf(state, templateId);
          page.copying = false;
          page.error = error;
          page.failedDuring = 'copy';
        } else {
          state.busyId = null;
          if (error) state.cardError = { id: templateId, error, during: 'copy' };
        }
      })
      // The confirmation goes the moment it is answered.
      .addCase(templateDeleted.pending, (state, action) => {
        const { templateId, from } = action.meta.arg;
        if (from === 'page') pageOf(state, templateId).confirmingDelete = false;
        else state.deletingId = null;
      })
      .addCase(templateDeleted.rejected, (state, action) => {
        const { templateId, from } = action.meta.arg;
        const error = action.payload ?? null;
        if (from === 'page') {
          const page = pageOf(state, templateId);
          page.error = error;
          page.failedDuring = 'delete';
        } else if (error) {
          state.cardError = { id: templateId, error, during: 'delete' };
        }
      })
      .addCase(blankFormCreated.pending, (state) => {
        if (!state.blank) return;
        state.blank.saving = true;
        state.blank.error = null;
      })
      .addCase(blankFormCreated.fulfilled, (state) => {
        state.blank = null;
      })
      .addCase(blankFormCreated.rejected, (state, action) => {
        if (!state.blank) return;
        state.blank.saving = false;
        state.blank.error = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectSearchDraft: (state) => state.searchDraft,
    selectPreviewId: (state) => state.previewId,
    selectDeletingId: (state) => state.deletingId,
    selectBusyId: (state) => state.busyId,
    selectCardError: (state) => state.cardError,
    selectBlankForm: (state) => state.blank,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof templatesScreenSlice> {}
}

const injected = templatesScreenSlice.injectInto(rootReducer);

export const {
  templateSearchTyped,
  templatePreviewOpened,
  templatePreviewClosed,
  templateDeleteAsked,
  templateDeleteDismissed,
  blankFormOpened,
  blankFormClosed,
  blankFormEdited,
  templatesPageLeft,
  templateDeleteAskedOnPage,
  templateDeleteDismissedOnPage,
  templatePageLeft,
} = templatesScreenSlice.actions;

export const {
  selectSearchDraft,
  selectPreviewId,
  selectDeletingId,
  selectBusyId,
  selectCardError,
  selectBlankForm,
} = injected.selectors;

export const selectTemplatePage = (state: RootState, templateId: string): TemplatePage =>
  injected.selectSlice(state).pages[templateId] ?? BLANK_TEMPLATE_PAGE;
