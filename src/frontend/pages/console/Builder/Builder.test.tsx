import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, TemplateDetail } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import type { QuestionDraft } from '../../../components/form/kinds.js';
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
  save: 'idle' as string,
  saveError: null as Error | null,
};

const flush = vi.fn();
const clone = vi.fn();
let saved: QuestionDraft[][] = [];

vi.mock('./useBuilder.js', () => ({
  useBuilder: () => {
    const [questions, setQuestions] = useState<QuestionDraft[]>(state.questions);
    const [name, setName] = useState('Mid-term check');
    return {
      loading: state.loading,
      loadError: state.loadError,
      template: state.loadError ? null : ({ readOnly: state.locked } as TemplateDetail),
      draft: { name, description: '', questions },
      save: state.save,
      saveError: state.saveError,
      locked: state.locked,
      estimatedSeconds: questions.length * 20,
      setMeta: (patch: { name?: string }) => { if (patch.name !== undefined) setName(patch.name); },
      setQuestions: (next: QuestionDraft[]) => { saved.push(next); setQuestions(next); },
      addQuestion: () => {
        const next = [...questions, {
          kind: 'rating' as const, text: '', required: false,
          config: { kind: 'rating' as const, max: 5 as const, lowLabel: 'Poor', highLabel: 'Excellent' },
        }];
        saved.push(next);
        setQuestions(next);
      },
      flush,
    };
  },
}));

vi.mock('../../../lib/templates.js', () => ({
  cloneKey: (id: string) => `key-for-${id}`,
  useTemplates: () => ({ data: null, loading: false, error: null, reload: vi.fn(), create: vi.fn(), clone, remove: vi.fn() }),
  useTemplate: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
  useTemplateLibrary: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
}));

const ALL: Capability[] = ['template.read', 'template.update', 'template.clone'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/forms/:id/build" element={<Builder />} />
      <Route path="/app/forms/:id/preview" element={<p>PREVIEW</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/forms/t1/build' },
  );

const cards = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll('.qcard')] as HTMLElement[];

beforeEach(() => {
  vi.clearAllMocks();
  saved = [];
  clone.mockResolvedValue({ id: 't2' });
  state.questions = QUESTIONS;
  state.loading = false;
  state.loadError = null;
  state.locked = false;
  state.save = 'idle';
  state.saveError = null;
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
    expect(saved.at(-1)).toHaveLength(4);
  });

  it('duplicates below the source and strips the id', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Duplicate How clear was it/ }));
    const next = saved.at(-1) ?? [];
    expect(next).toHaveLength(4);
    expect(next[1]?.id).toBeUndefined();
    expect(next[1]?.text).toBe('How clear was it?');
    expect(next[0]?.id).toBe('q1');
  });

  it('deletes immediately, with NO dialog, and offers undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Delete How clear was it/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(saved.at(-1)).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toContain('How clear was it? deleted.');
  });

  it('undo puts it back where it was, not at the end', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Was the pace right?' }));
    fireEvent.click(screen.getByRole('button', { name: /Delete Was the pace right/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const next = saved.at(-1) ?? [];
    expect(next.map((question) => question.id)).toEqual(['q1', 'q2', 'q3']);
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
    expect((saved.at(-1) ?? []).map((question) => question.id)).toEqual(['q2', 'q1', 'q3']);
    expect(cards(container)[1]?.className).toContain('is-expanded');
  });

  it('does nothing at the ends rather than wrapping around', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Move How clear was it\? up/ }));
    expect(saved).toHaveLength(0);
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
    expect(screen.getByText(/3 questions · ~60 sec/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText(/4 questions · ~80 sec/)).toBeTruthy();
  });

  it('says nothing at all before the first save', () => {
    mount();
    expect(screen.queryByText(/Saved|Saving/)).toBeNull();
  });

  it('shows a failed save where the reader must act, with the draft reassured', () => {
    state.save = 'error';
    state.saveError = new Error('The network dropped.');
    mount();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The network dropped.');
    expect(alert.textContent).toContain('Your work is still here.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(flush).toHaveBeenCalledTimes(1);
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
