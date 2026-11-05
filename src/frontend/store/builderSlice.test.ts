// R-301, R-303: the builder slice's reducers, as pure functions. No store, no timers, no
// requests: state in, action in, state out. Autosave is tested in middleware/autosave.test.ts.
import { describe, expect, it } from 'vitest';
import type { QuestionDraft } from '../components/form/kinds.js';
import { signedOut } from './authSlice.js';
import {
  HISTORY_LIMIT,
  builderLeft,
  builderReset,
  builderSlice,
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
  sameDraft,
  selectCanRedo,
  selectCanUndo,
  selectDraft,
  selectEstimatedSeconds,
  templateLoaded,
  undoRequested,
  type BuilderState,
  type Draft,
} from './builderSlice.js';
import { setupStore } from './index.js';

const reduce = builderSlice.reducer;

const Q1: QuestionDraft = {
  id: 'q1', kind: 'rating', text: 'How clear was it?',
  config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' }, required: true,
};
const Q2: QuestionDraft = {
  id: 'q2', kind: 'yesno', text: 'Was the pace right?', config: { kind: 'yesno' }, required: false,
};
const Q3: QuestionDraft = {
  id: 'q3', kind: 'text', text: 'Anything else?', config: { kind: 'text', multiline: true }, required: false,
};

const DRAFT: Draft = { name: 'Mid-term check', description: 'A short one.', questions: [Q1, Q2, Q3] };

/** The slice right after the template arrived. */
const loaded = (over: { draft?: Draft; locked?: boolean } = {}): BuilderState =>
  reduce(undefined, templateLoaded({ id: 't1', draft: over.draft ?? DRAFT, locked: over.locked ?? false }));

/** Apply actions in order. */
const run = (state: BuilderState, ...actions: Parameters<typeof reduce>[1][]): BuilderState =>
  actions.reduce(reduce, state);

const ids = (state: BuilderState) => state.draft.questions.map((question) => question.id);

describe('initial state (§6.9)', () => {
  it('is an empty, idle draft with no template and no history', () => {
    expect(reduce(undefined, { type: '@@init' })).toEqual({
      templateId: null,
      locked: false,
      draft: { name: '', description: '', questions: [] },
      dirty: { meta: false, questions: false },
      inFlight: null,
      save: 'idle',
      saveError: null,
      autoRetried: false,
      past: [],
      future: [],
      lastEdit: null,
    });
  });
});

describe('templateLoaded', () => {
  it('replaces the draft and starts idle: "Saved" before any save reports on nothing', () => {
    const state = loaded();
    expect(state.templateId).toBe('t1');
    expect(state.draft).toEqual(DRAFT);
    expect(state.save).toBe('idle');
    expect(state.past).toEqual([]);
  });

  it('carries the lock, so every control can go read-only', () => {
    expect(loaded({ locked: true }).locked).toBe(true);
  });

  it('starts over, history and all, when a different template loads', () => {
    const edited = run(loaded(), metaEdited({ name: 'Renamed' }));
    const next = reduce(edited, templateLoaded({ id: 't2', draft: DRAFT, locked: false }));
    expect(next.templateId).toBe('t2');
    expect(next.past).toEqual([]);
    expect(next.draft.name).toBe('Mid-term check');
  });

  it('keeps the undo history when the reader comes back to the same, saved template (R-304)', () => {
    const edited = run(
      loaded(),
      metaEdited({ name: 'Renamed' }),
      saveStarted(),
      saveSucceeded({ templateId: 't1' }),
      builderLeft(),
    );
    // The server now holds what was saved, with fresh question ids.
    const server: Draft = {
      ...edited.draft,
      questions: edited.draft.questions.map((question, index) => ({ ...question, id: `new-${index}` })),
    };
    const back = reduce(edited, templateLoaded({ id: 't1', draft: server, locked: false }));
    expect(back.past).toHaveLength(1);
    expect(back.draft.name).toBe('Renamed');
  });

  it('NEVER replaces unsaved edits with the server copy, which is older than they are', () => {
    const typing = run(loaded(), metaEdited({ name: 'Not saved yet' }));
    const back = reduce(typing, templateLoaded({ id: 't1', draft: DRAFT, locked: false }));
    expect(back.draft.name).toBe('Not saved yet');
    expect(back.dirty.meta).toBe(true);
  });

  it('NEVER replaces a draft whose save is still in flight', () => {
    const saving = run(loaded(), metaEdited({ name: 'In flight' }), saveStarted());
    const back = reduce(saving, templateLoaded({ id: 't1', draft: DRAFT, locked: false }));
    expect(back.draft.name).toBe('In flight');
    expect(back.save).toBe('saving');
  });

  it('drops the history when the server copy has moved on (edited somewhere else)', () => {
    const saved = run(
      loaded(),
      metaEdited({ name: 'Mine' }),
      saveStarted(),
      saveSucceeded({ templateId: 't1' }),
    );
    const theirs = { ...DRAFT, name: 'Theirs' };
    const back = reduce(saved, templateLoaded({ id: 't1', draft: theirs, locked: false }));
    expect(back.draft.name).toBe('Theirs');
    expect(back.past).toEqual([]);
  });

  it('adopts a history from sessionStorage only if its present matches the server (Q-2)', () => {
    const history = { templateId: 't1', past: [{ ...DRAFT, name: 'Older' }], present: DRAFT, future: [] };
    const restored = reduce(undefined, templateLoaded({ id: 't1', draft: DRAFT, locked: false, history }));
    expect(restored.past).toHaveLength(1);

    const stale = { ...history, present: { ...DRAFT, name: 'Something the server no longer has' } };
    const refused = reduce(undefined, templateLoaded({ id: 't1', draft: DRAFT, locked: false, history: stale }));
    expect(refused.past).toEqual([]);

    const otherTemplate = { ...history, templateId: 't9' };
    expect(reduce(undefined, templateLoaded({ id: 't1', draft: DRAFT, locked: false, history: otherTemplate })).past).toEqual([]);
  });
});

describe('editing: events in, draft out, part marked dirty', () => {
  it('metaEdited changes only the meta, and marks only the meta dirty', () => {
    const state = run(loaded(), metaEdited({ description: 'Two minutes.' }));
    expect(state.draft.description).toBe('Two minutes.');
    expect(state.draft.questions).toBe(loaded().draft.questions);
    expect(state.dirty).toEqual({ meta: true, questions: false });
    expect(state.save).toBe('dirty');
  });

  it('an edit that changes nothing records nothing', () => {
    const state = run(loaded(), metaEdited({ name: 'Mid-term check' }));
    expect(state.past).toEqual([]);
    expect(state.save).toBe('idle');
  });

  it('questionAdded appends a blank question with the kind\'s default config', () => {
    const state = run(loaded(), questionAdded({ kind: 'rating' }));
    expect(state.draft.questions).toHaveLength(4);
    expect(state.draft.questions[3]).toEqual({
      kind: 'rating', text: '', required: false,
      config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' },
    });
    expect(state.dirty).toEqual({ meta: false, questions: true });
  });

  it('questionEdited replaces the one question at that position', () => {
    const state = run(loaded(), questionEdited({ index: 1, question: { ...Q2, text: 'Too fast?' } }));
    expect(state.draft.questions.map((question) => question.text)).toEqual([
      'How clear was it?', 'Too fast?', 'Anything else?',
    ]);
  });

  it('questionDuplicated puts the copy directly below, without the source\'s id', () => {
    const state = run(loaded(), questionDuplicated({ index: 0 }));
    expect(ids(state)).toEqual(['q1', undefined, 'q2', 'q3']);
    expect(state.draft.questions[1]?.text).toBe('How clear was it?');
  });

  it('questionRemoved removes it, and questionRestored puts it back where it was', () => {
    const removed = run(loaded(), questionRemoved({ index: 1 }));
    expect(ids(removed)).toEqual(['q1', 'q3']);
    const restored = reduce(removed, questionRestored({ templateId: 't1', at: 1, question: Q2 }));
    expect(ids(restored)).toEqual(['q1', 'q2', 'q3']);
  });

  it('questionRestored still lands in the right place after other edits', () => {
    const state = run(
      loaded(),
      questionRemoved({ index: 1 }),
      metaEdited({ name: 'Renamed meanwhile' }),
      questionRestored({ templateId: 't1', at: 1, question: Q2 }),
    );
    expect(ids(state)).toEqual(['q1', 'q2', 'q3']);
    expect(state.draft.name).toBe('Renamed meanwhile');
  });

  it('questionRestored does nothing to a different template (the toast outlives the page)', () => {
    const elsewhere = run(loaded(), templateLoaded({ id: 't2', draft: DRAFT, locked: false }));
    const state = reduce(elsewhere, questionRestored({ templateId: 't1', at: 0, question: Q2 }));
    expect(state).toEqual(elsewhere);
  });

  it('questionMoved reorders; array order is the question order', () => {
    expect(ids(run(loaded(), questionMoved({ from: 0, to: 1 })))).toEqual(['q2', 'q1', 'q3']);
    expect(ids(run(loaded(), questionMoved({ from: 2, to: 0 })))).toEqual(['q3', 'q1', 'q2']);
  });

  it('a move past either end does nothing rather than wrapping around', () => {
    const state = run(loaded(), questionMoved({ from: 0, to: -1 }), questionMoved({ from: 2, to: 3 }));
    expect(ids(state)).toEqual(['q1', 'q2', 'q3']);
    expect(state.past).toEqual([]);
    expect(state.save).toBe('idle');
  });
});

describe('undo and redo (R-303)', () => {
  it('undo steps back one edit and redo steps forward again', () => {
    const moved = run(loaded(), questionMoved({ from: 0, to: 2 }));
    const undone = reduce(moved, undoRequested());
    expect(ids(undone)).toEqual(['q1', 'q2', 'q3']);
    expect(selectCanRedo({ builder: undone })).toBe(true);

    const redone = reduce(undone, redoRequested());
    expect(ids(redone)).toEqual(['q2', 'q3', 'q1']);
    expect(selectCanRedo({ builder: redone })).toBe(false);
  });

  it('undo can go back more than one step, which a single delete toast never could', () => {
    const state = run(
      loaded(),
      questionRemoved({ index: 0 }),
      questionRemoved({ index: 0 }),
      undoRequested(),
      undoRequested(),
    );
    expect(ids(state)).toEqual(['q1', 'q2', 'q3']);
    expect(selectCanUndo({ builder: state })).toBe(false);
  });

  it('a new edit after an undo clears the redo stack', () => {
    const state = run(loaded(), questionRemoved({ index: 0 }), undoRequested(), metaEdited({ name: 'New' }));
    expect(state.future).toEqual([]);
  });

  it('a run of keystrokes in one field is ONE undo step', () => {
    const typed = run(
      loaded(),
      metaEdited({ name: 'M' }),
      metaEdited({ name: 'Mi' }),
      metaEdited({ name: 'Mid' }),
    );
    expect(typed.past).toHaveLength(1);
    expect(reduce(typed, undoRequested()).draft.name).toBe('Mid-term check');
  });

  it('typing in a different field, or the same field after another edit, starts a new step', () => {
    const state = run(
      loaded(),
      metaEdited({ name: 'A' }),
      metaEdited({ description: 'B' }),
      metaEdited({ name: 'AA' }),
    );
    expect(state.past).toHaveLength(3);
  });

  it('typing in one question\'s text is one step; toggling required is a step of its own', () => {
    const state = run(
      loaded(),
      questionEdited({ index: 0, question: { ...Q1, text: 'H' } }),
      questionEdited({ index: 0, question: { ...Q1, text: 'Ho' } }),
      questionEdited({ index: 0, question: { ...Q1, text: 'Ho', required: false } }),
    );
    expect(state.past).toHaveLength(2);
  });

  it('leaving the page ends the typing run, so coming back and typing is a new step', () => {
    const state = run(loaded(), metaEdited({ name: 'A' }), builderLeft(), metaEdited({ name: 'AB' }));
    expect(state.past).toHaveLength(2);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps, dropping the oldest`, () => {
    let state = loaded();
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) {
      state = reduce(state, questionAdded({ kind: 'yesno' }));
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    // The oldest left is the draft after the 20th add, not the loaded one.
    expect(state.past[0]?.questions).toHaveLength(3 + 20);
  });

  it('undo marks dirty only the part it actually changed', () => {
    const saved = run(
      loaded(),
      metaEdited({ name: 'Renamed' }),
      saveStarted(),
      saveSucceeded({ templateId: 't1' }),
    );
    const undone = reduce(saved, undoRequested());
    expect(undone.dirty).toEqual({ meta: true, questions: false });
    expect(undone.save).toBe('dirty');
  });

  it('undo with nothing to undo does nothing at all', () => {
    expect(reduce(loaded(), undoRequested())).toEqual(loaded());
    expect(reduce(loaded(), redoRequested())).toEqual(loaded());
  });
});

describe('a locked template accepts no edits at all', () => {
  it('ignores every edit, so nothing can be queued behind the banner', () => {
    const state = run(
      loaded({ locked: true }),
      metaEdited({ name: 'Sneaky' }),
      questionAdded({ kind: 'rating' }),
      questionRemoved({ index: 0 }),
      questionMoved({ from: 0, to: 1 }),
    );
    expect(state.draft).toEqual(DRAFT);
    expect(state.save).toBe('idle');
    expect(selectCanUndo({ builder: state })).toBe(false);
  });
});

describe('the save state machine: idle → dirty → saving → saved | error', () => {
  it('clears the dirty flags BEFORE the request, remembering what is in flight', () => {
    const state = run(loaded(), metaEdited({ name: 'X' }), saveStarted());
    expect(state.save).toBe('saving');
    expect(state.dirty).toEqual({ meta: false, questions: false });
    expect(state.inFlight).toEqual({ meta: true, questions: false });
  });

  it('a success with nothing typed since says saved', () => {
    const state = run(loaded(), metaEdited({ name: 'X' }), saveStarted(), saveSucceeded({ templateId: 't1' }));
    expect(state.save).toBe('saved');
    expect(state.inFlight).toBeNull();
  });

  it('never says "Saved" over a keystroke that arrived mid-request', () => {
    const state = run(
      loaded(),
      metaEdited({ name: 'First' }),
      saveStarted(),
      metaEdited({ name: 'Second' }),
      saveSucceeded({ templateId: 't1' }),
    );
    expect(state.save).toBe('dirty');
    expect(state.draft.name).toBe('Second');
  });

  it('the first failure is retried automatically; the second hands over a button', () => {
    const once = run(loaded(), metaEdited({ name: 'X' }), saveStarted(), saveFailed({ templateId: 't1', message: 'offline' }));
    expect(once.save).toBe('dirty');
    expect(once.dirty.meta).toBe(true);

    const twice = run(once, saveStarted(), saveFailed({ templateId: 't1', message: 'offline' }));
    expect(twice.save).toBe('error');
    expect(twice.saveError).toBe('offline');
  });

  it('KEEPS the draft through both failures: nothing is reloaded or reset', () => {
    const state = run(
      loaded(),
      questionRemoved({ index: 0 }),
      saveStarted(),
      saveFailed({ templateId: 't1', message: 'offline' }),
      saveStarted(),
      saveFailed({ templateId: 't1', message: 'offline' }),
    );
    expect(ids(state)).toEqual(['q2', 'q3']);
    expect(state.dirty.questions).toBe(true);
  });

  it('a manual retry that fails goes straight back to the button, with no hidden retry', () => {
    const state = run(
      loaded(),
      metaEdited({ name: 'X' }),
      saveRetried(),
      saveStarted(),
      saveFailed({ templateId: 't1', message: 'still offline' }),
    );
    expect(state.save).toBe('error');
  });

  it('a success resets the retry, so the next failure is retried automatically again', () => {
    const state = run(
      loaded(),
      metaEdited({ name: 'X' }),
      saveStarted(),
      saveFailed({ templateId: 't1', message: 'offline' }),
      saveStarted(),
      saveSucceeded({ templateId: 't1' }),
      metaEdited({ name: 'Y' }),
      saveStarted(),
      saveFailed({ templateId: 't1', message: 'offline' }),
    );
    expect(state.save).toBe('dirty');
  });

  it('ignores the result of a save for a template the reader has since left', () => {
    const elsewhere = run(
      loaded(),
      metaEdited({ name: 'X' }),
      saveStarted(),
      templateLoaded({ id: 't2', draft: DRAFT, locked: false }),
      saveSucceeded({ templateId: 't1' }),
    );
    expect(elsewhere.templateId).toBe('t2');
    expect(elsewhere.save).toBe('idle');
  });
});

describe('reset', () => {
  it('builderReset and signing out both go back to the initial state', () => {
    const edited = run(loaded(), metaEdited({ name: 'X' }));
    const initial = reduce(undefined, { type: '@@init' });
    expect(reduce(edited, builderReset())).toEqual(initial);
    // The next person in this tab must not be able to undo into the last one's form.
    expect(reduce(edited, signedOut())).toEqual(initial);
  });
});

describe('selectors, on the real store', () => {
  it('read the initial state before the builder has seen a single action', () => {
    const store = setupStore();
    expect(selectDraft(store.getState())).toEqual({ name: '', description: '', questions: [] });
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it('derive the completion time live from the draft, before any save', () => {
    const store = setupStore();
    store.dispatch(templateLoaded({ id: 't1', draft: DRAFT, locked: false }));
    const before = selectEstimatedSeconds(store.getState());
    store.dispatch(questionAdded({ kind: 'text' }));
    expect(selectEstimatedSeconds(store.getState())).toBeGreaterThan(before);
  });
});

describe('sameDraft', () => {
  it('ignores ids, key order inside a config, and whitespace the server trims', () => {
    const fromServer: Draft = {
      name: 'Mid-term check',
      description: 'A short one.',
      questions: [
        { id: 'zz', kind: 'rating', text: 'How clear was it? ', required: true,
          config: { highLabel: 'Great', kind: 'rating', lowLabel: 'Poor', max: 5 } },
        { ...Q2, id: 'yy' },
        { ...Q3, id: 'xx' },
      ],
    };
    expect(sameDraft(DRAFT, fromServer)).toBe(true);
    expect(sameDraft(DRAFT, { ...fromServer, name: 'Other' })).toBe(false);
  });

  it('treats a blank name as the "Untitled form" the server stores for it', () => {
    expect(sameDraft({ ...DRAFT, name: '  ' }, { ...DRAFT, name: 'Untitled form' })).toBe(true);
  });
});
