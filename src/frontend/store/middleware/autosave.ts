// The builder's autosave, as a listener. 37 § State, § Interactions; docs/REDUX-PLAN.md §6.7
// (R-302).
//
// It used to be a timer and four refs inside `useBuilder`. As a listener it lives with the
// store rather than the page, which fixes two things the hook could not:
//
// - **Leaving the page no longer drops the last edit.** The hook cleared its timer on
//   unmount, so anything typed in the 800 ms before navigating away was never sent. Now
//   `builderLeft` saves at once, and a pending debounce runs to completion regardless.
// - **One request at a time.** The hook could start a second save while the first was in
//   flight, and the two could land out of order, so the older draft won. Each save here
//   waits for the one before it.
//
// THE RULE IS STILL: never discard typed input. The listener only ever SENDS the draft; it
// never writes one back into the slice. It saves through RTK Query's `updateTemplate` and
// `putQuestions` mutations (R-201), which write the server's answer into the template's
// cache entry, so Preview shows what was saved without a refetch.
import { isAnyOf, type ListenerEffectAPI } from '@reduxjs/toolkit';
import { templatesApi } from '../api/endpoints/templates.js';
import { isSerializedApiError } from '../api/errors.js';
import {
  builderLeft,
  metaEdited,
  questionAdded,
  questionDuplicated,
  questionEdited,
  questionMoved,
  questionRemoved,
  questionRestored,
  redoRequested,
  saveFailed,
  saveRetried,
  saveStarted,
  saveSucceeded,
  savedName,
  selectBuilder,
  selectSaveState,
  undoRequested,
} from '../builderSlice.js';
import type { AppDispatch, RootState } from '../index.js';
import { startAppListening } from './listeners.js';

/** 37 § State fixes this. Long enough to swallow a burst of typing, short enough that
 *  "Saved" appears before somebody wonders whether it did. */
export const DEBOUNCE_MS = 800;

/** Everything that changes the draft, plus the first failure, whose retry is debounced too. */
const changedTheDraft = isAnyOf(
  metaEdited,
  questionAdded,
  questionEdited,
  questionDuplicated,
  questionRemoved,
  questionRestored,
  questionMoved,
  undoRequested,
  redoRequested,
  saveFailed,
);

/** Send whatever is dirty, as it is now. */
async function persist(api: ListenerEffectAPI<RootState, AppDispatch>): Promise<void> {
  if (selectBuilder(api.getState()).inFlight) {
    await api.condition((_action, state) => selectBuilder(state).inFlight === null);
  }

  // Read AFTER the wait, so it is the newest draft rather than the one there was when the
  // debounce started.
  const { templateId, locked, dirty, draft } = selectBuilder(api.getState());
  if (!templateId || locked || (!dirty.meta && !dirty.questions)) return;

  api.dispatch(saveStarted());
  let heldBack = false;
  // `track: false`: a save every few seconds would otherwise leave a mutation entry in the
  // store each time. The pending/fulfilled actions still show in DevTools.
  const untracked = { track: false } as const;
  try {
    if (dirty.meta) {
      const body = { name: savedName(draft.name), description: draft.description };
      await api
        .dispatch(templatesApi.endpoints.updateTemplate.initiate({ id: templateId, body }, untracked))
        .unwrap();
    }
    if (dirty.questions) {
      // The whole set, in one transaction. The builder autosaves a DOCUMENT, not a stream
      // of field edits, and reordering is one operation on an array (37).
      //
      // EXCEPT A QUESTION WITH NO TEXT YET. "Add question" makes one, and the reader is
      // about to type into it; the server requires a question's text, so sending it would
      // fail every save until they did (found on the demo path, R-601: "Add question",
      // pause, and the badge said the save had failed). It is not content yet, so it is
      // left out, and the rest of the set saves. The draft keeps it, and the indicator
      // keeps saying "Unsaved changes" until it has text (`heldBack`).
      const questions = draft.questions.filter((question) => question.text.trim() !== '');
      heldBack = questions.length < draft.questions.length;
      await api
        .dispatch(templatesApi.endpoints.putQuestions.initiate({ id: templateId, questions }, untracked))
        .unwrap();
    }
    api.dispatch(saveSucceeded({ templateId, heldBack }));
  } catch (error) {
    const message =
      isSerializedApiError(error) || error instanceof Error ? error.message : 'That did not save.';
    api.dispatch(saveFailed({ templateId, message }));
  }
}

// Debounced. Each edit cancels the wait the previous one started, so a burst of typing is
// one request carrying the last keystroke. The predicate runs after the reducer, so an edit
// the slice refused (a locked template) or a second failure (`error`) starts nothing.
startAppListening({
  predicate: (action, state) => changedTheDraft(action) && selectSaveState(state) === 'dirty',
  effect: async (_action, api) => {
    api.cancelActiveListeners();
    await api.delay(DEBOUNCE_MS);
    await persist(api);
  },
});

// Immediate: the reader pressed Try again, or left the page.
startAppListening({
  matcher: isAnyOf(saveRetried, builderLeft),
  effect: async (_action, api) => {
    await persist(api);
  },
});
