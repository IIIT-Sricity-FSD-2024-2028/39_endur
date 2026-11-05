// The builder page, on the REAL builder slice. Only the load (`useBuilder`) and the server
// calls are stubbed; every edit goes through the reducer the app runs, so the assertions
// read the store the page dispatched to (rubric items 6-9, docs/REDUX-PLAN.md §0).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, TemplateDetail } from '@endur/shared';
import { makeStore, renderWithProviders, stubApi, NONSENSE_LABELS, type StubCall } from '../../../test-utils.js';
import type { QuestionDraft } from '../../../components/form/kinds.js';
import type { AppStore } from '../../../store/index.js';
import {
  metaEdited,
  saveFailed,
  saveStarted,
  selectBuilder,
  templateLoaded,
} from '../../../store/builderSlice.js';
import '../../../store/middleware/autosave.js';
import Builder from './index.js';

const QUESTIONS: QuestionDraft[] = [
  {
    id: 'q1', kind: 'rating', text: 'How clear was it?',
    config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' }, required: true,
  },
  { id: 'q2', kind: 'yesno', text: 'Was the pace right?', config: { kind: 'yesno' }, required: false },
  { id: 'q3', kind: 'text', text: 'Anything else?', config: { kind: 'text', multiline: true }, required: false },
];

const state = {
  questions: QUESTIONS,
  loading: false,
  loadError: null as Error | null,
  locked: false,
  /** Put the slice in `error` before rendering, as two failed saves would. */
  failedSave: null as string | null,
};

const clone = vi.fn();
let calls: StubCall[];

vi.mock('./useBuilder.js', () => ({
  useBuilder: () => ({
    loading: state.loading,
    loadError: state.loadError,
    template: state.loadError ? null : ({ readOnly: state.locked } as TemplateDetail),
  }),
}));

vi.mock('../../../lib/templates.js', () => ({
  cloneKey: (id: string) => `key-for-${id}`,
  useCloneTemplate: () => clone,
  useTemplates: () => ({ data: null, loading: false, error: null, reload: vi.fn(), create: vi.fn(), clone, remove: vi.fn() }),
  useTemplate: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
  useTemplateLibrary: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
}));

const ALL: Capability[] = ['template.read', 'template.update', 'template.clone'];

let store: AppStore;

const mount = (capabilities: Capability[] = ALL) => {
  const session = { capabilities, labels: NONSENSE_LABELS, path: '/app/forms/t1/build' };
  store = makeStore(session);
  if (!state.loadError) {
    store.dispatch(templateLoaded({
      id: 't1',
      draft: { name: 'Mid-term check', description: '', questions: state.questions },
      locked: state.locked,
    }));
  }
  if (state.failedSave) {
    store.dispatch(metaEdited({ description: 'Edited before the network dropped' }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      store.dispatch(saveStarted());
      store.dispatch(saveFailed({ templateId: 't1', message: state.failedSave }));
    }
  }
  return renderWithProviders(
    <Routes>
      <Route path="/app/forms/:id/build" element={<Builder />} />
      <Route path="/app/forms/:id/preview" element={<p>PREVIEW</p>} />
    </Routes>,
    session,
    store,
  );
};

const builder = () => selectBuilder(store.getState());
const ids = () => builder().draft.questions.map((question) => question.id);

const cards = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll('.qcard')] as HTMLElement[];

beforeEach(() => {
  vi.clearAllMocks();
  // Fake, so the autosave debounce an edit starts never fires into a later test.
  vi.useFakeTimers();
  clone.mockResolvedValue({ id: 't2' });
  // The autosave listener saves through RTK Query, over this.
  calls = stubApi({
    'PATCH /templates/t1': { body: { data: {} } },
    'PUT /templates/t1/questions': { body: { data: {} } },
  });
  state.questions = QUESTIONS;
  state.loading = false;
  state.loadError = null;
  state.locked = false;
  state.failedSave = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the stack: exactly one card is open', () => {
  it('opens the first and collapses the rest', () => {
    const { container } = mount();
    const stack = cards(container);
    expect(stack).toHaveLength(3);
    expect(stack[0]?.className).toContain('is-expanded');
    expect(stack[1]?.className).toContain('is-collapsed');
    expect(stack[2]?.className).toContain('is-collapsed');
  });

  it('opening one closes the one that was open', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Was the pace right?' }));
    const stack = cards(container);
    expect(stack.filter((card) => card.className.includes('is-expanded'))).toHaveLength(1);
    expect(stack[1]?.className).toContain('is-expanded');
  });
});

describe('add, duplicate, delete, undo', () => {
  it('adds a question from the tool rail', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(builder().draft.questions).toHaveLength(4);
  });

  it('duplicates below the source and strips the id', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Duplicate How clear was it/ }));
    const next = builder().draft.questions;
    expect(next).toHaveLength(4);
    expect(next[1]?.id).toBeUndefined();
    expect(next[1]?.text).toBe('How clear was it?');
    expect(next[0]?.id).toBe('q1');
  });

  it('deletes immediately, with NO dialog, and offers undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Delete How clear was it/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(builder().draft.questions).toHaveLength(2);
    expect(screen.getByText('How clear was it? deleted.')).toBeTruthy();
  });

  it('undo puts it back where it was, not at the end', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Was the pace right?' }));
    fireEvent.click(screen.getByRole('button', { name: /Delete Was the pace right/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ids()).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('undo and redo, driven by the slice', () => {
  it('start disabled, because there is nothing in `past` or `future`', () => {
    mount();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Undo last change' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Redo last change' }).disabled).toBe(true);
  });

  it('undo walks back a move and enables redo; redo walks it forward again', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Move How clear was it\? down/ }));
    const undo = screen.getByRole<HTMLButtonElement>('button', { name: 'Undo last change' });
    expect(undo.disabled).toBe(false);

    fireEvent.click(undo);
    expect(ids()).toEqual(['q1', 'q2', 'q3']);
    const redo = screen.getByRole<HTMLButtonElement>('button', { name: 'Redo last change' });
    expect(redo.disabled).toBe(false);

    fireEvent.click(redo);
    expect(ids()).toEqual(['q2', 'q1', 'q3']);
  });

  it('are not offered at all on a form the reader cannot edit', () => {
    mount(['template.read']);
    expect(screen.queryByRole('button', { name: 'Undo last change' })).toBeNull();
  });
});

describe('the name field writes to the slice, and the page follows it', () => {
  it('typing a name dispatches it, and the header title and save badge update', () => {
    mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Form name' }), { target: { value: 'End-of-term' } });
    expect(builder().draft.name).toBe('End-of-term');
    expect(screen.getByRole('heading', { name: 'End-of-term' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes');
  });
});

describe('reorder works without a mouse', () => {
  it('offers move buttons, because HTML5 drag does not exist on touch', () => {
    mount();
    expect(screen.getByRole('img', { name: /Move How clear was it\? down/ })).toBeTruthy();
  });

  it('moves a question down and keeps the open card open', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Move How clear was it\? down/ }));
    expect(ids()).toEqual(['q2', 'q1', 'q3']);
    expect(cards(container)[1]?.className).toContain('is-expanded');
  });

  it('does nothing at the ends rather than wrapping around', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Move How clear was it\? up/ }));
    expect(ids()).toEqual(['q1', 'q2', 'q3']);
    expect(builder().past).toHaveLength(0);
  });

  it('does not expand a collapsed card when its move button is pressed', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Move Anything else\? up/ }));
    expect(cards(container)[0]?.className).toContain('is-expanded');
  });
});

describe('the header carries the live cost and the save state', () => {
  it('shows the question count and time, and updates as questions are added', () => {
    mount();
    // rating 4 + yes/no 3 + text 25 = 32 s; another rating makes it 36 (SECONDS_PER_KIND).
    expect(screen.getByText(/3 questions · ~30 sec/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText(/4 questions · ~40 sec/)).toBeTruthy();
  });

  it('says nothing at all before the first save', () => {
    mount();
    expect(screen.queryByText(/Saved|Saving/)).toBeNull();
  });

  it('shows a failed save where the reader must act, with the draft reassured', async () => {
    state.failedSave = 'The network dropped.';
    mount();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The network dropped.');
    expect(alert.textContent).toContain('Your work is still here.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    // Now, not after the debounce: the retry listener sends what is dirty at once.
    const patches = calls.filter((call) => call.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body).toMatchObject({ description: 'Edited before the network dropped' });

    // And the badge follows the slice back out of the error.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('links to the preview rather than rendering a second one', () => {
    mount();
    expect(screen.getByRole('link', { name: 'Preview' }).getAttribute('href')).toBe('/app/forms/t1/preview');
  });
});

describe('the two things this page deliberately does not have (CONF-014)', () => {
  it('has no Publish button', () => {
    mount();
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });

  it('has no Responses or Settings tab', () => {
    mount();
    expect(screen.queryByRole('link', { name: /Responses|Settings/ })).toBeNull();
  });

  it('has no Save button — autosave is the only commit', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });
});

describe('states', () => {
  it('offers an inline first question rather than a full-page empty state', () => {
    state.questions = [];
    mount();
    expect(screen.getByRole('button', { name: /Add your first question/ })).toBeTruthy();
  });

  it('locks with a banner in the org\'s own word, and a way out', () => {
    state.locked = true;
    const { container } = mount();
    expect(screen.getByRole('status').textContent).toMatch(/in use by a plithe/);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Form name' }).disabled).toBe(true);
    expect(container.querySelector('.builder-rail')).toBeNull();
    expect(screen.getByRole('button', { name: 'Duplicate to edit' })).toBeTruthy();
  });

  it('renders read-only without template.update, and still lets somebody look', () => {
    mount(['template.read']);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Form name' }).disabled).toBe(true);
    expect(screen.getByDisplayValue('How clear was it?')).toBeTruthy();
  });

  it('a missing form is a page, not a blank screen', () => {
    state.loadError = new Error('gone');
    mount();
    expect(screen.getByRole('heading', { name: /not here/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to templates' })).toBeTruthy();
  });
});
