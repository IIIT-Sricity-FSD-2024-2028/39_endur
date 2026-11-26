// The form builder's draft, its save state and its undo history. 37 § State, § Interactions;
// docs/REDUX-PLAN.md §6.7 and §6.9 (R-301, R-303).
//
// Client state, so a hand-written slice. The reducers are pure: no request, no timer, no
// storage. Saving is a listener (`middleware/autosave.ts`) that reacts to the events below,
// and the history's copy in sessionStorage is another (`middleware/builderHistory.ts`).
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: **never discard typed input.** Not on a failed
// save, not on a retry, not on a save that lands while the reader is still typing, and not
// when the template is loaded again. Every decision below falls out of that.
//
// Actions are events in the past tense (`questionMoved`), never setters (`setQuestions`).
// Questions are addressed by POSITION, not id: the server replaces the whole set on every
// save and ignores the ids it is sent (templates/service.ts `putQuestions`), so a new
// question has no id until the template is next loaded. Array order is question order.
import {
  createSelector,
  createSlice,
  current,
  type PayloadAction,
  type WithSlice,
} from '@reduxjs/toolkit';
import { estimateSeconds, type QuestionKind } from '@endur/shared';
import { defaultConfig, type QuestionDraft } from '../components/form/kinds.js';
import { signedOut } from './authSlice.js';
import { rootReducer } from './index.js';

/** Enough to walk back through a working session, small enough that a hundred snapshots of
 *  a fifty-question form stay well under sessionStorage's quota (R-304). */
export const HISTORY_LIMIT = 100;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type Draft = {
  name: string;
  description: string;
  questions: QuestionDraft[];
};

/**
 * Two parts, because they are two endpoints: `PATCH` for the meta, `PUT` for the whole
 * question set (37 § Data contract). Renaming a form must not rewrite its questions.
 */
export type DirtyParts = { meta: boolean; questions: boolean };

/** The undo history as it is kept in sessionStorage, and handed back on a reload (Q-2). */
export type BuilderHistory = {
  templateId: string;
  past: Draft[];
  present: Draft;
  future: Draft[];
};

export type BuilderState = {
  templateId: string | null;
  /** True once a launched campaign uses the template: every edit is ignored (37 § States). */
  locked: boolean;
  draft: Draft;
  /** What has changed since the last save started. */
  dirty: DirtyParts;
  /** What the request in flight is sending, or null when none is. A failure puts it back. */
  inFlight: DirtyParts | null;
  save: SaveState;
  /** A message, not an `Error`: the store holds only serialisable values. */
  saveError: string | null;
  /** One automatic retry, then the reader gets a button. Retrying forever hides the fault. */
  autoRetried: boolean;
  /** Snapshots before each edit, oldest first. `draft` is the present. */
  past: Draft[];
  /** Snapshots undone, the next redo first. Any new edit clears it. */
  future: Draft[];
  /**
   * Which field the last edit typed into, e.g. `meta:name` or `q:2:text`. A run of edits to
   * the same field is ONE undo step, so undo doesn't walk back a character at a time.
   */
  lastEdit: string | null;
};

const EMPTY_DRAFT: Draft = { name: '', description: '', questions: [] };
const CLEAN: DirtyParts = { meta: false, questions: false };

const initialState: BuilderState = {
  templateId: null,
  locked: false,
  draft: EMPTY_DRAFT,
  dirty: CLEAN,
  inFlight: null,
  save: 'idle',
  saveError: null,
  autoRetried: false,
  past: [],
  future: [],
  lastEdit: null,
};

/** The name the server stores for a draft name (autosave sends exactly this). */
export const savedName = (name: string): string => name.trim() || 'Untitled form';

/** Equal as JSON values, ignoring key order: Postgres `jsonb` does not keep it. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Whether two drafts would save to the same template. Ids are ignored, because the server
 * hands out new ones on every save, and so is whitespace the server trims.
 */
export function sameDraft(a: Draft, b: Draft): boolean {
  return (
    savedName(a.name) === savedName(b.name) &&
    a.description.trim() === b.description.trim() &&
    a.questions.length === b.questions.length &&
    a.questions.every((question, index) => {
      const other = b.questions[index];
      return (
        other !== undefined &&
        question.kind === other.kind &&
        question.text.trim() === other.text.trim() &&
        question.required === other.required &&
        sameJson(question.config, other.config)
      );
    })
  );
}

const hasUnsaved = (state: BuilderState): boolean =>
  state.dirty.meta || state.dirty.questions || state.inFlight !== null;

/**
 * Every edit goes through here. It snapshots the draft for undo (unless the edit continues
 * the same typing run), applies the change, and marks that part dirty. A change that
 * returns the draft untouched, such as moving the first question up, records nothing.
 */
function edit(
  state: BuilderState,
  part: keyof DirtyParts,
  run: string | null,
  change: (draft: Draft) => Draft,
): void {
  if (state.locked) return;
  // `current` gives a plain snapshot of the draft. Pushing the Immer draft itself would put
  // the same object in `past` and in `draft`, and the next mutation would change both.
  const before = current(state.draft);
  const after = change(before);
  if (after === before) return;

  if (run === null || run !== state.lastEdit) {
    state.past.push(before);
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
  }
  state.future = [];
  state.lastEdit = run;
  state.draft = after;
  state.dirty[part] = true;
  state.save = 'dirty';
}

/** Undo and redo replace the whole draft, so mark dirty whichever part actually differs. */
function travelled(state: BuilderState, from: Draft, to: Draft): void {
  if (from.name !== to.name || from.description !== to.description) state.dirty.meta = true;
  if (from.questions !== to.questions) state.dirty.questions = true;
  state.draft = to;
  state.save = 'dirty';
  state.lastEdit = null;
}

const withQuestions = (draft: Draft, questions: QuestionDraft[]): Draft => ({ ...draft, questions });

/** Which typing run an edit to a question belongs to, or null if it is not typing. */
function questionRun(index: number, before: QuestionDraft, after: QuestionDraft): string | null {
  const changed = (['kind', 'text', 'config', 'required'] as const).filter(
    (field) => before[field] !== after[field],
  );
  // Text, and the text inside a config (option labels, scale anchors), is typed a key at a
  // time. A kind change or a `required` toggle is one deliberate act, and its own step.
  if (changed.length === 1 && (changed[0] === 'text' || changed[0] === 'config')) {
    return `q:${index}:${changed[0]}`;
  }
  return null;
}

export const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    /**
     * The template arrived from the server. Usually that means starting over from it, but
     * NOT when the reader is coming back to the same template: unsaved or still-saving
     * edits are newer than the server's copy, and a draft that matches the server's keeps
     * its undo history (R-304: the history survives a route change). `history` is the copy
     * from sessionStorage, adopted after a reload only if its present matches the server.
     */
    templateLoaded(
      state,
      action: PayloadAction<{
        id: string;
        draft: Draft;
        locked: boolean;
        history?: BuilderHistory | null;
      }>,
    ) {
      const { id, draft, locked, history } = action.payload;
      if (state.templateId === id && (hasUnsaved(state) || sameDraft(state.draft, draft))) {
        state.locked = locked;
        state.lastEdit = null;
        return;
      }
      const restored = history && history.templateId === id && sameDraft(history.present, draft);
      return {
        ...initialState,
        templateId: id,
        locked,
        draft,
        past: restored ? history.past.slice(-HISTORY_LIMIT) : [],
        future: restored ? history.future.slice(0, HISTORY_LIMIT) : [],
      };
    },

    /** The name or description was edited. Payload: only the fields that changed. */
    metaEdited(state, action: PayloadAction<Partial<Pick<Draft, 'name' | 'description'>>>) {
      const changes = action.payload;
      const run = `meta:${Object.keys(changes).sort().join(',')}`;
      edit(state, 'meta', run, (draft) =>
        (Object.keys(changes) as Array<keyof typeof changes>).every(
          (key) => changes[key] === draft[key],
        )
          ? draft
          : { ...draft, ...changes },
      );
    },

    /** A new question at the end, blank, with the kind's default config. */
    questionAdded(state, action: PayloadAction<{ kind: QuestionKind }>) {
      const question: QuestionDraft = {
        kind: action.payload.kind,
        text: '',
        config: defaultConfig(action.payload.kind),
        required: false,
      };
      edit(state, 'questions', null, (draft) =>
        withQuestions(draft, [...draft.questions, question]),
      );
    },

    /** One question was changed in its card. Payload: its position and the new version. */
    questionEdited(state, action: PayloadAction<{ index: number; question: QuestionDraft }>) {
      const { index, question } = action.payload;
      // From a plain snapshot, not the Immer draft: a draft's nested objects are proxies, so
      // comparing `config` by reference would always say it changed.
      const before = current(state.draft).questions[index];
      if (!before) return;
      edit(state, 'questions', questionRun(index, before, question), (draft) =>
        withQuestions(
          draft,
          draft.questions.map((existing, at) => (at === index ? question : existing)),
        ),
      );
    },

    /** A copy goes in directly below the source, without the source's id. */
    questionDuplicated(state, action: PayloadAction<{ index: number }>) {
      const { index } = action.payload;
      edit(state, 'questions', null, (draft) => {
        const source = draft.questions[index];
        if (!source) return draft;
        const { id: _id, ...copy } = source;
        const questions = [...draft.questions];
        questions.splice(index + 1, 0, { ...copy, config: { ...source.config } });
        return withQuestions(draft, questions);
      });
    },

    questionRemoved(state, action: PayloadAction<{ index: number }>) {
      const { index } = action.payload;
      edit(state, 'questions', null, (draft) =>
        index < 0 || index >= draft.questions.length
          ? draft
          : withQuestions(draft, draft.questions.filter((_, at) => at !== index)),
      );
    },

    /**
     * The delete toast's Undo. It puts back THAT question, where it was, rather than
     * undoing whatever the last edit happens to be by the time the button is pressed. The
     * toast can outlive the page (R-307), so it names its template and does nothing to any
     * other one.
     */
    questionRestored(
      state,
      action: PayloadAction<{ templateId: string; at: number; question: QuestionDraft }>,
    ) {
      const { templateId, at, question } = action.payload;
      if (templateId !== state.templateId) return;
      edit(state, 'questions', null, (draft) => {
        const questions = [...draft.questions];
        questions.splice(Math.min(Math.max(at, 0), questions.length), 0, question);
        return withQuestions(draft, questions);
      });
    },

    /** Reordered by one or more places. Out of range does nothing; it never wraps. */
    questionMoved(state, action: PayloadAction<{ from: number; to: number }>) {
      const { from, to } = action.payload;
      edit(state, 'questions', null, (draft) => {
        const last = draft.questions.length - 1;
        if (from === to || from < 0 || to < 0 || from > last || to > last) return draft;
        const questions = [...draft.questions];
        const [moved] = questions.splice(from, 1);
        if (moved) questions.splice(to, 0, moved);
        return withQuestions(draft, questions);
      });
    },

    undoRequested(state) {
      if (state.locked) return;
      const past = current(state.past);
      const previous = past.at(-1);
      if (!previous) return;
      const present = current(state.draft);
      state.past = past.slice(0, -1);
      state.future = [present, ...current(state.future)].slice(0, HISTORY_LIMIT);
      travelled(state, present, previous);
    },

    redoRequested(state) {
      if (state.locked) return;
      const future = current(state.future);
      const next = future[0];
      if (!next) return;
      const present = current(state.draft);
      state.future = future.slice(1);
      state.past = [...current(state.past), present].slice(-HISTORY_LIMIT);
      travelled(state, present, next);
    },

    /**
     * A save went out. The dirty flags clear BEFORE the request, not after it: an edit made
     * while it is in flight must mark the draft dirty again rather than be swallowed by a
     * late success.
     */
    saveStarted(state) {
      state.inFlight = { ...state.dirty };
      state.dirty = CLEAN;
      state.save = 'saving';
      state.saveError = null;
    },

    /**
     * Ignored if it belongs to a template the reader has since left.
     *
     * `heldBack`: the save left out a question that has no text yet (see the autosave
     * listener). That question is still unsaved, so the questions stay dirty and the
     * indicator says "Unsaved changes" until it has some.
     */
    saveSucceeded(state, action: PayloadAction<{ templateId: string; heldBack?: boolean }>) {
      if (action.payload.templateId !== state.templateId) return;
      state.inFlight = null;
      state.autoRetried = false;
      if (action.payload.heldBack) state.dirty.questions = true;
      // Still dirty means somebody typed during the request. Say `dirty`, not `saved`:
      // "Saved" over an unsaved keystroke is the one lie this indicator can tell.
      state.save = state.dirty.meta || state.dirty.questions ? 'dirty' : 'saved';
    },

    /**
     * THE DRAFT IS UNTOUCHED. What was being sent is marked dirty again, so the next save
     * sends it. The first failure in a run is retried automatically (the autosave listener
     * sees `dirty`); the second hands the reader a button.
     */
    saveFailed(state, action: PayloadAction<{ templateId: string; message: string }>) {
      if (action.payload.templateId !== state.templateId) return;
      const sent = state.inFlight ?? CLEAN;
      state.inFlight = null;
      state.dirty = {
        meta: state.dirty.meta || sent.meta,
        questions: state.dirty.questions || sent.questions,
      };
      if (!state.autoRetried) {
        state.autoRetried = true;
        state.save = 'dirty';
        return;
      }
      state.save = 'error';
      state.saveError = action.payload.message;
    },

    /** The reader pressed Try again. The listener saves now; a failure goes straight back
     *  to the button, with no hidden second attempt. */
    saveRetried(state) {
      state.autoRetried = true;
    },

    /** The builder page closed. The listener saves anything pending now rather than in
     *  800 ms, and the next keystroke after coming back starts a new undo step. */
    builderLeft(state) {
      state.lastEdit = null;
    },

    builderReset: () => initialState,
  },

  // Signing out clears the draft and its history: the next person in this tab must not be
  // able to undo their way into the last one's form.
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState);
  },

  selectors: {
    selectBuilder: (state) => state,
    selectDraft: (state) => state.draft,
    selectLocked: (state) => state.locked,
    selectSaveState: (state) => state.save,
    selectSaveError: (state) => state.saveError,
    selectCanUndo: (state) => !state.locked && state.past.length > 0,
    selectCanRedo: (state) => !state.locked && state.future.length > 0,
    /** Memoised on the question list, so it recomputes only when the questions change. Live
     *  from the draft: a time that moved only after a save would argue a beat too late. */
    selectEstimatedSeconds: createSelector(
      [(state: BuilderState) => state.draft.questions],
      (questions) => estimateSeconds(questions.map((question) => question.kind)),
    ),
  },
});

// The builder is console-only, so its slice is injected from the builder's route chunk
// rather than listed in `store/index.ts` (§5: lazy-loaded slices). Importing this module is
// what adds it; `RootState.builder` is declared here for the same reason.
declare module './index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof builderSlice> {}
}

const injectedBuilderSlice = builderSlice.injectInto(rootReducer);

export const {
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
  saveStarted,
  saveSucceeded,
  saveFailed,
  saveRetried,
  builderLeft,
  builderReset,
} = builderSlice.actions;

/** Root-state selectors. Before the first builder action they read the initial state. */
export const {
  selectBuilder,
  selectDraft,
  selectLocked,
  selectSaveState,
  selectSaveError,
  selectCanUndo,
  selectCanRedo,
  selectEstimatedSeconds,
} = injectedBuilderSlice.selectors;
