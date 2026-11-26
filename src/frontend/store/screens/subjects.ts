// The subject screens' state: the list's search box, the add/edit form (with its person
// search), what is being archived, and per-row failures. docs/REDUX-PLAN.md §6.10 (R-709,
// DEC-R03). The subjects themselves are the cache's.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { CreateSubjectBody, UpdateSubjectBody } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { subjectsApi } from '../api/endpoints/subjects.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type SubjectDraft = {
  name: string;
  unitId: string;
  linkedUserId: string | null;
  linkedUserName: string | null;
};

/** The add or edit dialog: one at a time, on the list (add) or a subject's page (edit). */
export type SubjectFormState = {
  mode: 'create' | 'edit';
  draft: SubjectDraft;
  /** The person search as typed, for linking a reviewee. */
  personTerm: string;
  saving: boolean;
  error: SerializedApiError | null;
};

export type SubjectCommand = 'rename' | 'archive';

export const FAILED: Record<SubjectCommand | 'save', string> = {
  rename: 'That name could not be saved.',
  archive: 'That could not be archived.',
  save: 'That could not be saved.',
};

export type SubjectsScreenState = {
  /** The search box as typed; `null` until typed, when it shows the URL's `q`. */
  searchDraft: string | null;
  form: SubjectFormState | null;
  /** The subject whose archiving is being confirmed. */
  archivingId: string | null;
  /** A command that failed: on a list row, or on the subject's own page. */
  failure: { id: string; error: SerializedApiError; during: SubjectCommand } | null;
};

const initialState: SubjectsScreenState = {
  searchDraft: null,
  form: null,
  archivingId: null,
  failure: null,
};

export const subjectCreated = createScreenThunk(
  'subjects/subjectCreated',
  async (body: CreateSubjectBody, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(subjectsApi.endpoints.createSubject.initiate(body)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSubjectForm(getState())?.saving },
);

/** Edited on its page: name, unit and linked person in one save. */
export const subjectUpdated = createScreenThunk(
  'subjects/subjectUpdated',
  async ({ subjectId, body }: { subjectId: string; body: UpdateSubjectBody }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(subjectsApi.endpoints.updateSubject.initiate({ id: subjectId, body })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSubjectForm(getState())?.saving },
);

/** The inline rename on the list: optimistic in every cached read of it (R-405). */
export const subjectRenamed = createScreenThunk(
  'subjects/subjectRenamed',
  async ({ subjectId, name }: { subjectId: string; name: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(subjectsApi.endpoints.renameSubject.initiate({ id: subjectId, name })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const subjectArchived = createScreenThunk(
  'subjects/subjectArchived',
  async ({ subjectId }: { subjectId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(subjectsApi.endpoints.archiveSubject.initiate(subjectId)).unwrap();
      return { subjectId };
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const subjectsScreenSlice = createSlice({
  name: 'subjects',
  initialState,
  reducers: {
    subjectSearchTyped(state, action: PayloadAction<{ term: string }>) {
      state.searchDraft = action.payload.term;
    },
    /** Add or Edit pressed: a fresh form, starting from what the page hands it. */
    subjectFormOpened(state, action: PayloadAction<{ mode: 'create' | 'edit'; draft: SubjectDraft }>) {
      state.form = { ...action.payload, personTerm: '', saving: false, error: null };
    },
    subjectFormClosed(state) {
      state.form = null;
    },
    subjectFormEdited(state, action: PayloadAction<Partial<SubjectDraft>>) {
      if (state.form) Object.assign(state.form.draft, action.payload);
    },
    subjectPersonSearchTyped(state, action: PayloadAction<{ term: string }>) {
      if (state.form) state.form.personTerm = action.payload.term;
    },
    /** A person picked from the search: linked, and the search cleared. */
    subjectPersonLinked(state, action: PayloadAction<{ personId: string; name: string } | null>) {
      if (!state.form) return;
      state.form.draft.linkedUserId = action.payload?.personId ?? null;
      state.form.draft.linkedUserName = action.payload?.name ?? null;
      state.form.personTerm = '';
    },
    subjectArchiveAsked(state, action: PayloadAction<{ subjectId: string }>) {
      state.archivingId = action.payload.subjectId;
    },
    subjectArchiveDismissed(state) {
      state.archivingId = null;
    },
    subjectsLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    for (const thunk of [subjectCreated, subjectUpdated]) {
      builder
        .addCase(thunk.pending, (state) => {
          if (!state.form) return;
          state.form.saving = true;
          state.form.error = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.form = null;
        })
        .addCase(thunk.rejected, (state, action) => {
          if (!state.form) return;
          state.form.saving = false;
          state.form.error = action.payload ?? null;
        });
    }
    builder
      .addCase(subjectRenamed.pending, (state) => {
        state.failure = null;
      })
      .addCase(subjectRenamed.rejected, (state, action) => {
        if (action.payload) state.failure = { id: action.meta.arg.subjectId, error: action.payload, during: 'rename' };
      })
      .addCase(subjectArchived.pending, (state) => {
        state.archivingId = null;
        state.failure = null;
      })
      .addCase(subjectArchived.rejected, (state, action) => {
        if (action.payload) state.failure = { id: action.meta.arg.subjectId, error: action.payload, during: 'archive' };
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectSubjectsScreen: (state) => state,
    selectSubjectForm: (state) => state.form,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof subjectsScreenSlice> {}
}

const injected = subjectsScreenSlice.injectInto(rootReducer);

export const {
  subjectSearchTyped,
  subjectFormOpened,
  subjectFormClosed,
  subjectFormEdited,
  subjectPersonSearchTyped,
  subjectPersonLinked,
  subjectArchiveAsked,
  subjectArchiveDismissed,
  subjectsLeft,
} = subjectsScreenSlice.actions;

export const { selectSubjectsScreen, selectSubjectForm } = injected.selectors;
