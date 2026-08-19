// T-035 — /app/templates/:id, the preview. 36 § Interactions, 05 §5.4.
//
// The load-bearing assertion in this file is that the preview renders through
// `<QuestionInput>` — the same six components the respondent form will use (INV-008).
// Everything else on this screen is arrangement; that one is the claim.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, QuestionConfig, TemplateDetail, TemplateSummary } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Detail from './Detail.js';

const question = (id: string, config: QuestionConfig, text: string, position: number) => ({
  id, kind: config.kind, text, config, required: false, position,
});

const detail = (over: Partial<TemplateDetail> = {}): TemplateDetail => ({
  id: 't1', name: 'Course feedback', category: 'Teaching',
  description: 'The standard end-of-term form.', industry: 'university',
  questionCount: 3, estimatedSeconds: 110, campaignCount: 0,
  isLibrary: true, clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z',
  readOnly: false,
  questions: [
    question('q1', { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' }, 'How clear was it?', 0),
    question('q2', { kind: 'yesno' }, 'Was the pace right?', 1),
    question('q3', { kind: 'text', multiline: true }, 'What would you change?', 2),
  ],
  ...over,
});

const summary = (over: Partial<TemplateSummary> & { id: string; name: string }): TemplateSummary => ({
  category: 'Teaching', description: null, industry: 'university',
  questionCount: 6, estimatedSeconds: 60, campaignCount: 0,
  isLibrary: true, clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

const clone = vi.fn();
const remove = vi.fn();
const reload = vi.fn();
let template: { data: TemplateDetail | null; loading: boolean; error: Error | null };
let library: TemplateSummary[];

vi.mock('../../../lib/templates.js', () => ({
  // `cloneKey` is stubbed to something recognisable rather than spread in from the real
  // module: what this page owns is passing the template's own key through to the clone
  // call, and the key's FORMAT is lib/templates.test.ts's business.
  cloneKey: (id: string) => `key-for-${id}`,
  librarySearch: () => '',
  useTemplate: () => ({ ...template, reload }),
  useTemplateLibrary: () => ({ data: library, loading: false, error: null, reload }),
  useTemplates: () => ({
    data: null, loading: false, error: null,
    reload, create: vi.fn(), clone, remove,
  }),
}));

const ALL: Capability[] = ['template.read', 'template.clone', 'template.delete'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/templates/:id" element={<Detail />} />
      <Route path="/app/templates" element={<p>LIBRARY</p>} />
      <Route path="/app/forms/:id/build" element={<p>BUILDER</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/templates/t1' },
  );

beforeEach(() => {
  vi.clearAllMocks();
  clone.mockResolvedValue({ id: 'new-1' });
  remove.mockResolvedValue(undefined);
  reload.mockResolvedValue(undefined);
  template = { data: detail(), loading: false, error: null };
  library = [
    summary({ id: 'l2', name: 'Semester review', category: 'Teaching' }),
    summary({ id: 'l3', name: 'Ward round', category: 'Care', industry: 'hospital' }),
  ];
});

describe('the preview IS the respondent form (INV-008)', () => {
  it('renders every question through <QuestionInput>, not a read-only lookalike', () => {
    mount();
    // A rating arriving as a radiogroup with its anchors on the end points is the shape
    // <QuestionInput> produces and nothing else in the codebase does.
    const rating = screen.getByRole('group', { name: /How clear was it\?/ });
    expect(within(rating).getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '1 — Poor' })).toBeTruthy();

    expect(screen.getByRole('group', { name: /Was the pace right\?/ })).toBeTruthy();
    expect(screen.getByLabelText(/What would you change\?/).tagName).toBe('TEXTAREA');
  });

  it('lets the controls respond, because a dead preview reads as broken rather than read-only', () => {
    mount();
    const four = screen.getByRole<HTMLInputElement>('radio', { name: '4' });
    expect(four.disabled).toBe(false);
    fireEvent.click(four);
    expect(four.checked).toBe(true);
  });

  it('says plainly that nothing is saved, and in the org\'s own word for a respondent', () => {
    mount();
    // INV-001 reaches even here: a hotel's preview says "guest", a hospital's "patient".
    expect(screen.getByText(/Preview — nothing is saved/)).toBeTruthy();
    expect(screen.getByText(/frimble sees/)).toBeTruthy();
  });

  it('keeps a disabled Submit rather than dropping it', () => {
    mount();
    // Removing it would make the preview shorter than the real form and hide the one
    // control every respondent has to find.
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit' });
    expect(submit.disabled).toBe(true);
  });
});

describe('the three widths', () => {
  it('offers phone, tablet and desktop, and opens on phone', () => {
    const { container } = mount();
    // Phone-first is not a default chosen for tidiness: on demo day every respondent is
    // on a phone (39).
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Phone' }).checked).toBe(true);
    expect(container.querySelector('.preview-frame.is-phone')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Tablet' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Desktop' })).toBeTruthy();
  });

  it('constrains the frame at phone and tablet, and releases it at desktop', () => {
    const { container } = mount();
    const frame = (): HTMLElement => container.querySelector('.preview-frame') as HTMLElement;
    expect(frame().style.maxWidth).toBe('390px');

    fireEvent.click(screen.getByRole('radio', { name: 'Tablet' }));
    expect(frame().style.maxWidth).toBe('720px');

    fireEvent.click(screen.getByRole('radio', { name: 'Desktop' }));
    expect(frame().style.maxWidth).toBe('');
  });
});

describe('the header carries the cost and the actions', () => {
  it('states the question count and the completion time', () => {
    mount();
    expect(screen.getByText(/3 questions · ~110 sec · Teaching/)).toBeTruthy();
  });

  it('clones and lands in the builder in one action', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    await waitFor(() => expect(screen.getByText('BUILDER')).toBeTruthy());
    expect(clone).toHaveBeenCalledTimes(1);
  });

  it('offers no Delete on a library template — readable by everyone, writable by nobody', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('offers Delete on the org\'s own, and returns to the list afterwards', async () => {
    template = { data: detail({ isLibrary: false }), loading: false, error: null };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('LIBRARY')).toBeTruthy());
  });

  it('cannot confirm a delete the server would refuse', () => {
    template = { data: detail({ isLibrary: false, campaignCount: 4 }), loading: false, error: null };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getByText(/4 plithes use Course feedback/)).toBeTruthy();
    expect(dialog.getByRole<HTMLButtonElement>('button', { name: 'Delete' }).disabled).toBe(true);
  });

  it('hides Use without template.clone, and still shows the preview', () => {
    mount(['template.read']);
    expect(screen.queryByRole('button', { name: 'Use this' })).toBeNull();
    expect(screen.getByRole('group', { name: /How clear was it\?/ })).toBeTruthy();
  });
});

describe('related templates, and the two states that are not a form', () => {
  it('suggests by category first and never suggests itself', () => {
    mount();
    const related = screen.getByRole('heading', { name: 'Related' }).closest('section') as HTMLElement;
    expect(within(related).getByRole('link', { name: 'Semester review' })).toBeTruthy();
    expect(within(related).queryByRole('link', { name: 'Course feedback' })).toBeNull();
    // Ward round shares neither category nor industry, so it is not related to anything.
    expect(within(related).queryByRole('link', { name: 'Ward round' })).toBeNull();
  });

  it('says a template with no questions is empty rather than rendering nothing', () => {
    template = { data: detail({ questions: [], questionCount: 0 }), loading: false, error: null };
    mount();
    expect(screen.getByText(/no questions yet/i)).toBeTruthy();
  });

  it('a missing template is a page, not a blank screen', () => {
    template = { data: null, loading: false, error: new Error('That template does not exist.') };
    mount();
    expect(screen.getByRole('heading', { name: /not here/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to templates' })).toBeTruthy();
  });
});
