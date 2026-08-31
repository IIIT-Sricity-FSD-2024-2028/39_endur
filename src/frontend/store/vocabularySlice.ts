// The other slice. 22 §3.
//
// A slice rather than a context because labels change on org switch and on the settings
// edit, and both must re-render every subscriber immediately — the chip row under the
// page title is the ten-second proof of the whole product (N-003).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_LABELS, resolveLabels, type LabelSet, type ResolvedLabels } from '@endur/shared';

export type VocabularyState = {
  /** Every key present, always. A component can never render `undefined` (22 §3). */
  labels: ResolvedLabels;
};

const initialState: VocabularyState = { labels: DEFAULT_LABELS };

const vocabularySlice = createSlice({
  name: 'vocabulary',
  initialState,
  reducers: {
    /**
     * Accepts a partial set — from /auth/me for staff, or from the public campaign
     * payload for a respondent, who has no session at all (13 §6). Merging happens per
     * key, so an org that renamed only one noun keeps sensible words for the rest.
     */
    labelsLoaded(state, action: PayloadAction<LabelSet | null | undefined>) {
      state.labels = resolveLabels(action.payload);
    },
    labelsCleared(state) {
      state.labels = DEFAULT_LABELS;
    },
  },
});

export const { labelsLoaded, labelsCleared } = vocabularySlice.actions;
export const vocabularyReducer = vocabularySlice.reducer;
