// Writes the builder's undo history to sessionStorage as it changes. Q-2, R-304.
// Loaded with the builder's chunk; reading it back happens in `useBuilder`, on load.
import { isAnyOf } from '@reduxjs/toolkit';
import {
  metaEdited,
  questionAdded,
  questionDuplicated,
  questionEdited,
  questionMoved,
  questionRemoved,
  questionRestored,
  redoRequested,
  selectBuilder,
  templateLoaded,
  undoRequested,
} from '../builderSlice.js';
import { writeBuilderHistory } from '../builderHistoryStorage.js';
import { startAppListening } from './listeners.js';

/** Serialising up to a hundred drafts on every keystroke is wasted work; once typing pauses
 *  is enough, since a reload inside this window loses at most the last few characters'
 *  undo steps, never the text itself (autosave has that). */
export const HISTORY_WRITE_MS = 300;

startAppListening({
  matcher: isAnyOf(
    templateLoaded,
    metaEdited,
    questionAdded,
    questionEdited,
    questionDuplicated,
    questionRemoved,
    questionRestored,
    questionMoved,
    undoRequested,
    redoRequested,
  ),
  effect: async (_action, api) => {
    api.cancelActiveListeners();
    await api.delay(HISTORY_WRITE_MS);
    writeBuilderHistory(selectBuilder(api.getState()));
  },
});
