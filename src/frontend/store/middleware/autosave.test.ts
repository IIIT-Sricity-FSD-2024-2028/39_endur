// R-302, R-201: the builder's autosave listener, on the real store, saving through RTK
// Query's mutations over a stubbed `fetch`.
//
// Ported from the old `useBuilder.test.ts`, whose acceptance criterion it keeps: "autosave
// never loses typed input, including across a failed save and a retry". That needs a
// failing request, a keystroke during a request, and leaving the page, all of which are
// cheap here and impossible to rehearse by hand. The last two cases are bugs the hook had.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDetail } from '@endur/shared';
import type { QuestionDraft } from '../../components/form/kinds.js';
import { errorReply, heldReply, stubApi, type StubCall, type StubReply } from '../../test-utils.js';
import { setupStore } from '../index.js';
import { templatesApi } from '../api/endpoints/templates.js';
import {
  builderLeft,
  metaEdited,
  questionAdded,
  questionEdited,
  questionMoved,
  questionRemoved,
  saveRetried,
  selectBuilder,
  templateLoaded,
  type Draft,
} from '../builderSlice.js';
import './autosave.js';

const QUESTIONS: QuestionDraft[] = [
  {
    id: 'q1', kind: 'rating', text: 'How clear was it?',
    config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' }, required: true,
  },
  { id: 'q2', kind: 'yesno', text: 'Was the pace right?', config: { kind: 'yesno' }, required: false },
];
const DRAFT: Draft = { name: 'Mid-term check', description: 'A short one.', questions: QUESTIONS };

/** What the server answers a save with: the whole template. */
const saved = (name = 'Mid-term check'): StubReply => ({
  body: {
    data: {
      id: 't1', name, category: 'Teaching', description: 'A short one.', industry: 'university',
      questionCount: 2, estimatedSeconds: 7, campaignCount: 0, isLibrary: false,
      clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z', readOnly: false,
      questions: QUESTIONS.map((question, position) => ({ ...question, id: `s${position}`, position })),
    } satisfies TemplateDetail,
  },
});

let calls: StubCall[];
const patches = () => calls.filter((call) => call.method === 'PATCH');
const puts = () => calls.filter((call) => call.method === 'PUT');

/** Answers for the two save endpoints; each defaults to success. */
function serve(answers: {
  patch?: (count: number) => StubReply | Promise<StubReply>;
  put?: (count: number) => StubReply | Promise<StubReply>;
} = {}) {
  calls = stubApi({
    'PATCH /templates/t1': (_call, count) => answers.patch?.(count) ?? saved(),
    'PUT /templates/t1/questions': (_call, count) => answers.put?.(count) ?? saved(),
  });
}

function mount(locked = false) {
  const store = setupStore();
  store.dispatch(templateLoaded({ id: 't1', draft: DRAFT, locked }));
  const builder = () => selectBuilder(store.getState());
  return { store, builder };
}

/** Push past the 800ms debounce and let the request settle. */
const settle = () => vi.advanceTimersByTimeAsync(900);

const OFFLINE = errorReply(503, 'INTERNAL', 'offline');

beforeEach(() => {
  vi.useFakeTimers();
  serve();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('autosave is debounced, and says only what is true', () => {
  it('does not fire before 800ms, and fires once for a burst of typing', async () => {
    const { store, builder } = mount();
    store.dispatch(metaEdited({ name: 'M' }));
    store.dispatch(metaEdited({ name: 'Mi' }));
    store.dispatch(metaEdited({ name: 'Mid' }));
    expect(builder().save).toBe('dirty');

    await vi.advanceTimersByTimeAsync(700);
    expect(patches()).toHaveLength(0);

    await settle();
    expect(patches()).toHaveLength(1);
    // The LAST value, not the one there was when the first keystroke started the wait.
    expect(patches()[0]?.body).toEqual({ name: 'Mid', description: 'A short one.' });
    expect(builder().save).toBe('saved');
  });

  it('sends the meta and the questions to their OWN endpoints', async () => {
    const { store } = mount();
    store.dispatch(metaEdited({ description: 'Two minutes.' }));
    await settle();
    // Renaming a form must not rewrite its questions (37 § Data contract).
    expect(patches()).toHaveLength(1);
    expect(puts()).toHaveLength(0);

    store.dispatch(questionAdded({ kind: 'rating' }));
    await settle();
    expect(puts()).toHaveLength(1);
    expect(patches()).toHaveLength(1);
  });

  it('saves the whole question set in ONE request, not one per question', async () => {
    const { store, builder } = mount();
    store.dispatch(questionAdded({ kind: 'rating' }));
    store.dispatch(questionAdded({ kind: 'yesno' }));
    for (const index of [2, 3]) {
      const question = builder().draft.questions[index] as QuestionDraft;
      store.dispatch(questionEdited({ index, question: { ...question, text: `Question ${index}` } }));
    }
    store.dispatch(questionMoved({ from: 3, to: 0 }));
    await settle();

    expect(puts()).toHaveLength(1);
    const body = puts()[0]?.body as { questions: QuestionDraft[] };
    expect(body.questions.map((question) => question.kind)).toEqual(['yesno', 'rating', 'yesno', 'rating']);
  });

  it('leaves out a question with NO TEXT YET, saves the rest, and still says "Unsaved"', async () => {
    const { store, builder } = mount();
    store.dispatch(questionAdded({ kind: 'rating' }));
    await settle();

    // The server requires a question's text; sending the empty one failed every save.
    const body = puts()[0]?.body as { questions: QuestionDraft[] };
    expect(body.questions.map((question) => question.text)).toEqual(['How clear was it?', 'Was the pace right?']);
    // The reader is about to type into it: it stays in the draft, and it is not "Saved".
    expect(builder().draft.questions).toHaveLength(3);
    expect(builder().save).toBe('dirty');

    // Once it has text, it goes with the next save, and only then is the form saved.
    const blank = builder().draft.questions[2] as QuestionDraft;
    store.dispatch(questionEdited({ index: 2, question: { ...blank, text: 'Anything else?' } }));
    await settle();
    expect((puts()[1]?.body as { questions: QuestionDraft[] }).questions).toHaveLength(3);
    expect(builder().save).toBe('saved');
  });

  it('sends "Untitled form" for a blank name, which is what the server stores', async () => {
    const { store } = mount();
    store.dispatch(metaEdited({ name: '   ' }));
    await settle();
    expect(patches()[0]?.body).toMatchObject({ name: 'Untitled form' });
  });

  it('writes the saved template into the cache, so Preview shows it with no refetch', async () => {
    serve({ patch: () => saved('Renamed') });
    const { store } = mount();
    store.dispatch(metaEdited({ name: 'Renamed' }));
    await settle();

    const cached = templatesApi.endpoints.getTemplate.select('t1')(store.getState());
    expect(cached.data?.name).toBe('Renamed');
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(0);
  });

  it('never reports "Saved" over a keystroke that arrived mid-request', async () => {
    const first = heldReply(saved());
    serve({ patch: (count) => (count === 1 ? first.promise : saved()) });
    const { store, builder } = mount();

    store.dispatch(metaEdited({ name: 'First' }));
    await settle();
    expect(builder().save).toBe('saving');

    // Typed while the request was in flight.
    store.dispatch(metaEdited({ name: 'Second' }));
    first.release();
    await vi.advanceTimersByTimeAsync(0);

    // "Saved" here would be the one lie this indicator can tell.
    expect(builder().save).toBe('dirty');
    expect(builder().draft.name).toBe('Second');

    // And the keystroke is sent in its own save.
    await settle();
    expect(patches()).toHaveLength(2);
    expect(patches()[1]?.body).toMatchObject({ name: 'Second' });
    expect(builder().save).toBe('saved');
  });

  it('sends one request at a time, so an older draft can never land after a newer one', async () => {
    const first = heldReply(saved());
    serve({ put: (count) => (count === 1 ? first.promise : saved()) });
    const { store } = mount();

    store.dispatch(questionRemoved({ index: 0 }));
    await settle();
    expect(puts()).toHaveLength(1);

    store.dispatch(questionRemoved({ index: 0 }));
    await settle();
    // The first is still in flight, so the second waits for it rather than racing it.
    expect(puts()).toHaveLength(1);

    first.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(puts()).toHaveLength(2);
    expect((puts()[1]?.body as { questions: unknown[] }).questions).toHaveLength(0);
  });
});

describe('a failed save costs the reader nothing but a retry', () => {
  it('retries once automatically, then stops and hands over a button', async () => {
    serve({ patch: () => OFFLINE });
    const { store, builder } = mount();
    store.dispatch(metaEdited({ name: 'Renamed' }));

    await settle();
    // First failure: one silent retry rather than an error the reader has to read.
    expect(patches()).toHaveLength(1);
    expect(builder().save).toBe('dirty');

    await settle();
    expect(patches()).toHaveLength(2);
    // Retrying forever hides the fault.
    expect(builder().save).toBe('error');
    expect(builder().saveError).toBe('offline');

    await settle();
    expect(patches()).toHaveLength(2);
  });

  it('KEEPS the draft through both failures: nothing is reloaded or reset', async () => {
    serve({ put: () => OFFLINE });
    const { store, builder } = mount();
    store.dispatch(questionRemoved({ index: 0 }));
    store.dispatch(questionRemoved({ index: 0 }));
    await settle();
    await settle();

    expect(builder().save).toBe('error');
    expect(builder().draft.questions).toHaveLength(0);
  });

  it('keeps typing usable while it is failing, and sends the newest on the next try', async () => {
    serve({ patch: (count) => (count <= 2 ? OFFLINE : saved()) });
    const { store, builder } = mount();
    store.dispatch(metaEdited({ name: 'One' }));
    await settle();
    await settle();
    expect(builder().save).toBe('error');

    store.dispatch(metaEdited({ name: 'Two' }));
    await settle();

    expect(builder().save).toBe('saved');
    expect(patches().at(-1)?.body).toMatchObject({ name: 'Two' });
  });

  it('Try again (saveRetried) saves now rather than waiting out the debounce', async () => {
    const { store } = mount();
    store.dispatch(metaEdited({ name: 'Now' }));
    store.dispatch(saveRetried());
    await vi.advanceTimersByTimeAsync(0);
    expect(patches()).toHaveLength(1);
  });
});

describe('leaving the page', () => {
  it('saves at once, so an edit typed just before navigating away is not lost', async () => {
    const { store, builder } = mount();
    store.dispatch(metaEdited({ name: 'Typed, then left' }));
    store.dispatch(builderLeft());
    await vi.advanceTimersByTimeAsync(0);

    expect(patches()[0]?.body).toMatchObject({ name: 'Typed, then left' });
    expect(builder().save).toBe('saved');
  });

  it('with nothing pending, sends nothing', async () => {
    const { store } = mount();
    store.dispatch(builderLeft());
    await settle();
    expect(calls).toHaveLength(0);
  });
});

describe('a locked template', () => {
  it('sends nothing, because the slice accepted no edit to send', async () => {
    const { store } = mount(true);
    store.dispatch(metaEdited({ name: 'Sneaky' }));
    store.dispatch(questionAdded({ kind: 'rating' }));
    store.dispatch(saveRetried());
    await settle();

    expect(calls).toHaveLength(0);
  });
});
