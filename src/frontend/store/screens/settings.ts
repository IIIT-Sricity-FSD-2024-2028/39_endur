// The Settings page's state: the two cards' drafts and their saves. docs/REDUX-PLAN.md §6.10
// (R-710, DEC-R03). The organisation itself is the cache's (`getOrg`).
//
// A draft is `null` until somebody edits it, and the page shows what the server holds
// meanwhile: no effect copies the server's answer into state, so a re-read (after a logo
// upload, say) never overwrites what is being typed, and a saved card reads "Saved" because
// its draft went back to `null` when the save landed.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { LabelKey, type Industry, type LabelSet, type ResolvedLabels } from '@endur/shared';
import { derivePlural } from '../../lib/format.js';
import { signedOut } from '../authSlice.js';
import { toastShown } from '../uiSlice.js';
import { labelsLoaded } from '../vocabularySlice.js';
import { orgApi } from '../api/endpoints/org.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** The words card's draft: the five labels, and which plurals were typed by hand. */
export type WordsDraft = { labels: ResolvedLabels; overrides: LabelKey[] };

export type SettingsScreenState = {
  name: string | null;
  industry: Industry | null;
  words: WordsDraft | null;
  savingProfile: boolean;
  savingWords: boolean;
  profileError: SerializedApiError | null;
  wordsError: SerializedApiError | null;
};

const initialState: SettingsScreenState = {
  name: null,
  industry: null,
  words: null,
  savingProfile: false,
  savingWords: false,
  profileError: null,
  wordsError: null,
};

/** A draft of its own: `from` may hold the cache's (frozen) objects. */
const copyOf = (from: WordsDraft): WordsDraft => ({
  labels: Object.fromEntries(
    Object.entries(from.labels).map(([key, word]) => [key, { ...word }]),
  ) as ResolvedLabels,
  overrides: [...from.overrides],
});

/** The plurals that were typed rather than derived. */
export const overridesOf = (labels: ResolvedLabels): LabelKey[] =>
  LabelKey.options.filter((key) => labels[key].many !== derivePlural(labels[key].one));

/** Name and industry. The answer goes into the cache and `/auth/me` is re-read (R-401). */
export const orgProfileSaved = createScreenThunk(
  'settings/orgProfileSaved',
  async (body: { name: string; industry: Industry }, { dispatch, rejectWithValue }) => {
    try {
      const updated = await dispatch(orgApi.endpoints.updateOrg.initiate(body)).unwrap();
      dispatch(labelsLoaded(updated.labels as LabelSet));
      dispatch(toastShown({ message: 'Organization saved.' }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSettings(getState()).savingProfile },
);

/** The five words. Every screen re-skins at once: the vocabulary slice takes them here. */
export const wordsSaved = createScreenThunk(
  'settings/wordsSaved',
  async (labels: ResolvedLabels, { dispatch, rejectWithValue }) => {
    try {
      const updated = await dispatch(orgApi.endpoints.updateLabels.initiate({ ...labels })).unwrap();
      dispatch(labelsLoaded(updated.labels as LabelSet));
      dispatch(toastShown({ message: 'Words saved. Every screen is using them now.' }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSettings(getState()).savingWords },
);

/**
 * The logo (48). The `File` is the thunk's argument and never enters the store; the org is
 * re-read through its tag, so the card shows the server's copy of the image.
 */
export const logoUploaded = createScreenThunk(
  'settings/logoUploaded',
  async (file: File, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(orgApi.endpoints.uploadLogo.initiate(file)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const logoRemoved = createScreenThunk(
  'settings/logoRemoved',
  async (_: void, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(orgApi.endpoints.removeLogo.initiate()).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const settingsScreenSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    orgNameEdited(state, action: PayloadAction<{ name: string }>) {
      state.name = action.payload.name;
    },
    orgIndustryChosen(state, action: PayloadAction<{ industry: Industry }>) {
      state.industry = action.payload.industry;
    },
    /** A singular typed. Its plural follows, unless that plural was typed by hand. `from` is
     *  what the card showed, used when nothing had been edited yet. */
    wordSingularEdited(state, action: PayloadAction<{ key: LabelKey; one: string; from: WordsDraft }>) {
      const { key, one, from } = action.payload;
      const words = (state.words ??= copyOf(from));
      words.labels[key] = {
        one,
        many: words.overrides.includes(key) ? words.labels[key].many : derivePlural(one),
      };
    },
    /** A plural typed: from now on it is the one typed, not derived. */
    wordPluralEdited(state, action: PayloadAction<{ key: LabelKey; many: string; from: WordsDraft }>) {
      const { key, many, from } = action.payload;
      const words = (state.words ??= copyOf(from));
      words.labels[key].many = many;
      if (!words.overrides.includes(key)) words.overrides.push(key);
    },
    /** "Reset" beside a typed plural: it is derived from the singular again. */
    wordPluralReset(state, action: PayloadAction<{ key: LabelKey; from: WordsDraft }>) {
      const { key, from } = action.payload;
      const words = (state.words ??= copyOf(from));
      words.labels[key].many = derivePlural(words.labels[key].one);
      words.overrides = words.overrides.filter((entry) => entry !== key);
    },
    settingsLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(orgProfileSaved.pending, (state) => {
        state.savingProfile = true;
        state.profileError = null;
      })
      // Saved: the card shows the server's copy again, which is now what was typed.
      .addCase(orgProfileSaved.fulfilled, (state) => {
        state.savingProfile = false;
        state.name = null;
        state.industry = null;
      })
      .addCase(orgProfileSaved.rejected, (state, action) => {
        state.savingProfile = false;
        state.profileError = action.payload ?? null;
      })
      .addCase(wordsSaved.pending, (state) => {
        state.savingWords = true;
        state.wordsError = null;
      })
      .addCase(wordsSaved.fulfilled, (state) => {
        state.savingWords = false;
        state.words = null;
      })
      .addCase(wordsSaved.rejected, (state, action) => {
        state.savingWords = false;
        state.wordsError = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectSettings: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof settingsScreenSlice> {}
}

const injected = settingsScreenSlice.injectInto(rootReducer);

export const {
  orgNameEdited,
  orgIndustryChosen,
  wordSingularEdited,
  wordPluralEdited,
  wordPluralReset,
  settingsLeft,
} = settingsScreenSlice.actions;

export const { selectSettings } = injected.selectors;
