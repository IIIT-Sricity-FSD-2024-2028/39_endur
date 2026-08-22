// T-035 — /app/templates. 36.
//
// Two lists on one screen, and most of what can go wrong here is a filter quietly hiding
// something. The industry default is the sharpest case: it has to be applied (a hotel
// should not scroll past university forms) AND it has to be escapable (36 § Acceptance:
// "library templates from other industries are visible but not defaulted to").
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, Page, TemplateSummary } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Templates from './index.js';

const template = (over: Partial<TemplateSummary> & { id: string; name: string }): TemplateSummary => ({
  category: 'Teaching', description: 'A ready-made form.', industry: 'university',
  questionCount: 8, estimatedSeconds: 110, campaignCount: 0,
  isLibrary: true, clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

const LIBRARY: TemplateSummary[] = [
  template({ id: 'l1', name: 'Semester review', category: 'Programme' }),
  template({ id: 'l2', name: 'Facilities pulse', category: 'Facilities', questionCount: 3, estimatedSeconds: 38 }),
  template({ id: 'l3', name: 'Stay experience', industry: 'hotel', category: 'Stay' }),
  template({ id: 'l4', name: 'Ward round', industry: 'hospital', category: 'Care' }),
];

const own = (rows: TemplateSummary[]): Page<TemplateSummary> => ({
  data: rows,
  page: { nextCursor: null, hasMore: false },
  meta: { total: rows.length },
});

const OWN: TemplateSummary[] = [
  template({ id: 'o1', name: 'My course form', isLibrary: false, campaignCount: 2 }),
  template({ id: 'o2', name: 'Draft form', isLibrary: false, campaignCount: 0, questionCount: 0, estimatedSeconds: 0 }),
];

const clone = vi.fn();
const remove = vi.fn();
const create = vi.fn();
const reload = vi.fn();
let library: { data: TemplateSummary[] | null; loading: boolean; error: Error | null };
let list: { data: Page<TemplateSummary> | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/templates.js', () => ({
  // `cloneKey` is stubbed to something recognisable rather than spread in from the real
  // module: what this page owns is passing the template's own key through to the clone
  // call, and the key's FORMAT is lib/templates.test.ts's business.
  cloneKey: (id: string) => `key-for-${id}`,
  librarySearch: () => '',
  useTemplateLibrary: () => ({ ...library, reload }),
  useTemplates: () => ({ ...list, reload, create, clone, remove }),
}));

const ALL: Capability[] = ['template.read', 'template.create', 'template.clone', 'template.delete'];

const mount = (capabilities: Capability[] = ALL, path = '/app/templates') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/templates" element={<Templates />} />
      <Route path="/app/forms/:id/build" element={<p>BUILDER</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path },
  );

/** The org's own section, so a name appearing in both lists is never ambiguous. */
const section = (heading: string): HTMLElement =>
  screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  clone.mockResolvedValue({ id: 'new-1' });
  create.mockResolvedValue({ id: 'new-2' });
  remove.mockResolvedValue(undefined);
  reload.mockResolvedValue(undefined);
  library = { data: LIBRARY, loading: false, error: null };
  list = { data: own(OWN), loading: false, error: null };
});

describe('the two lists are visibly two different things', () => {
  it('separates the org\'s own from the shared library', () => {
    mount();
    expect(within(section('Your templates')).getByText('My course form')).toBeTruthy();
    expect(within(section('Library')).getByText('Semester review')).toBeTruthy();
  });

  it('puts the cost on every card, always — count and time', () => {
    mount();
    // The commercial constraint the product rests on (01 §5): competitors ship
    // forty-question templates, so the cost goes in the reader's eye before the name does.
    expect(within(section('Library')).getByText(/3 questions · ~40 sec/)).toBeTruthy();
    expect(within(section('Library')).getAllByText(/8 questions · ~110 sec/).length).toBeGreaterThan(0);
  });

  it('drops the time, not the count, when there is nothing to answer', () => {
    mount();
    const draft = within(section('Your templates')).getByText('Draft form').closest('article') as HTMLElement;
    expect(within(draft).getByText('0 questions')).toBeTruthy();
    expect(within(draft).queryByText(/sec|min/)).toBeNull();
  });

  it('shows usage on the org\'s own cards in the org\'s own word, and never on library ones', () => {
    mount();
    const mine = within(section('Your templates'));
    expect(mine.getByText('Used in 2 plithes')).toBeTruthy();
    expect(mine.getByText('Never used')).toBeTruthy();
    // A library template's usage would be every customer's combined — a number this org
    // cannot act on.
    expect(within(section('Library')).queryByText(/Used in|Never used/)).toBeNull();
  });
});

describe('the industry filter defaults to the org, and every other one stays reachable', () => {
  it('shows the org\'s own industry first without writing it into the URL', () => {
    mount();
    const shelf = within(section('Library'));
    expect(shelf.getByText('Semester review')).toBeTruthy();
    // The fixture org is a university. Hotel and hospital forms are filtered OUT by
    // default — that is the point — but the segment to reach them is right there.
    expect(shelf.queryByText('Stay experience')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Hotel' })).toBeTruthy();
  });

  it('"All" brings the other industries back', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    const shelf = within(section('Library'));
    expect(shelf.getByText('Stay experience')).toBeTruthy();
    expect(shelf.getByText('Ward round')).toBeTruthy();
  });

  it('an explicit industry in the URL beats the org default', () => {
    mount(ALL, '/app/templates?industry=hospital');
    const shelf = within(section('Library'));
    expect(shelf.getByText('Ward round')).toBeTruthy();
    expect(shelf.queryByText('Semester review')).toBeNull();
  });

  it('a category chip narrows further and can be pressed off again', () => {
    mount(ALL, '/app/templates?industry=all');
    fireEvent.click(screen.getByRole('button', { name: 'Facilities' }));
    expect(within(section('Library')).queryByText('Semester review')).toBeNull();
    expect(within(section('Library')).getByText('Facilities pulse')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Facilities' }));
    expect(within(section('Library')).getByText('Semester review')).toBeTruthy();
  });

  it('search filters the library in the browser and the org\'s own on the server', () => {
    mount(ALL, '/app/templates?industry=all&q=pulse');
    // One fetch of twenty cards, then filter here: switching a segment is instant and
    // "show me everything" costs no request (lib/templates).
    expect(within(section('Library')).getByText('Facilities pulse')).toBeTruthy();
    expect(within(section('Library')).queryByText('Semester review')).toBeNull();
  });
});

describe('the empty states differ, and neither one offers a blank page', () => {
  it('sends somebody with no forms to the library, not to a blank one', () => {
    list = { data: own([]), loading: false, error: null };
    mount();
    // 36 § States is explicit about this: a blank start is the enemy. It is where a
    // customer either gives up or writes forty questions.
    const empty = within(section('Your templates'));
    expect(empty.getByText('No forms yet')).toBeTruthy();
    expect(empty.getByRole('link', { name: 'Browse the library' })).toBeTruthy();
    expect(empty.queryByRole('button', { name: /blank/i })).toBeNull();
  });

  it('a filter that matches nothing offers to clear itself', () => {
    mount(ALL, '/app/templates?q=nothing-matches-this');
    const empty = within(section('Library'));
    expect(empty.getByText('No templates for that combination')).toBeTruthy();
    fireEvent.click(empty.getByRole('button', { name: 'Clear filters' }));
    expect(within(section('Library')).getByText('Stay experience')).toBeTruthy();
  });

  it('keeps the blank-form escape hatch in the header, as a secondary', () => {
    mount();
    const blank = screen.getByRole('button', { name: /Blank form/ });
    expect(blank.className).toContain('btn-secondary');
    expect(blank.className).not.toContain('btn-primary');
  });
});

describe('clone is one action and lands in the builder', () => {
  it('copies and navigates, with no intermediate confirmation', async () => {
    mount();
    fireEvent.click(within(section('Library')).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    // Cloning is cheap and reversible; a confirmation step here is friction on the demo
    // path (36 § Interactions).
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(screen.getByText('BUILDER')).toBeTruthy());
    expect(clone).toHaveBeenCalledTimes(1);
  });

  it('a double click produces ONE clone — the button stops accepting the second', async () => {
    let settle: (value: { id: string }) => void = () => undefined;
    clone.mockImplementation(() => new Promise<{ id: string }>((resolve) => { settle = resolve; }));
    mount();

    const use = within(section('Library')).getAllByRole('button', { name: 'Use' })[0] as HTMLElement;
    fireEvent.click(use);
    fireEvent.click(use);
    expect(clone).toHaveBeenCalledTimes(1);

    settle({ id: 'new-1' });
    await waitFor(() => expect(screen.getByText('BUILDER')).toBeTruthy());
  });

  it('sends an idempotency key, which is what covers the retry the button cannot', async () => {
    mount();
    fireEvent.click(within(section('Library')).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    // A phone on venue wifi retries a request whose response never arrived. The server
    // returns the FIRST response for a repeated key (13 §7).
    expect(clone.mock.calls[0]?.[1]).toBe('key-for-l1');
    await waitFor(() => expect(screen.getByText('BUILDER')).toBeTruthy());
  });

  it('reports a failure on the card rather than losing it', async () => {
    clone.mockRejectedValue(new Error('nope'));
    mount();
    fireEvent.click(within(section('Library')).getAllByRole('button', { name: 'Use' })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be copied/));
    expect(screen.queryByText('BUILDER')).toBeNull();
  });
});

describe('delete states its consequence, and refuses when the server would', () => {
  it('offers to delete an unused template and says what goes', async () => {
    mount();
    const draft = within(section('Your templates')).getByText('Draft form').closest('article') as HTMLElement;
    fireEvent.click(within(draft).getByRole('button', { name: /Delete Draft form/ }));

    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getByText(/Nothing has used it/)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('o2'));
  });

  it('opens the dialog for an IN-USE template but cannot confirm it', () => {
    mount();
    const used = within(section('Your templates')).getByText('My course form').closest('article') as HTMLElement;
    fireEvent.click(within(used).getByRole('button', { name: /Delete My course form/ }));

    const dialog = within(screen.getByRole('alertdialog'));
    // The reader asked what would happen, so the sentence is the answer — but pressing a
    // destructive button whose outcome is a 409 is not something to let them do (32).
    expect(dialog.getByText(/2 plithes use My course form/)).toBeTruthy();
    expect(dialog.getByRole<HTMLButtonElement>('button', { name: 'Delete' }).disabled).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('still handles a 409 from the server, because the count can be stale', async () => {
    remove.mockRejectedValue(new Error('That template is used by 1 campaign.'));
    mount();
    const draft = within(section('Your templates')).getByText('Draft form').closest('article') as HTMLElement;
    fireEvent.click(within(draft).getByRole('button', { name: /Delete Draft form/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    // A campaign created in another tab between the load and the press makes the server
    // the only authority.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be deleted/));
  });

  it('confirms a real deletion with a toast, which is success-only and never an alert', async () => {
    mount();
    const draft = within(section('Your templates')).getByText('Draft form').closest('article') as HTMLElement;
    fireEvent.click(within(draft).getByRole('button', { name: /Delete Draft form/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Draft form deleted/));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('capabilities decide what is offered, never what is enforced', () => {
  it('hides Use without template.clone and Delete without template.delete', () => {
    mount(['template.read']);
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
    expect(screen.queryByRole('img', { name: /^Delete / })).toBeNull();
    expect(screen.queryByRole('button', { name: /Blank form/ })).toBeNull();
    // Browsing still works without any of them (36 § States).
    expect(within(section('Library')).getByText('Semester review')).toBeTruthy();
  });

  // A button rather than a link since T-035's quick look: preview opens a dialog over the
  // grid instead of navigating away from it. The full page is still linked from inside the
  // dialog, so nothing became unreachable — only the first step changed.
  it('leaves Preview available to everybody who can read', () => {
    mount(['template.read']);
    expect(
      within(section('Library')).getAllByRole('button', { name: 'Preview' }).length,
    ).toBeGreaterThan(0);
  });
});

describe('loading and failure keep the page\'s shape', () => {
  it('draws card skeletons rather than a centred spinner', () => {
    library = { data: null, loading: true, error: null };
    list = { data: null, loading: true, error: null };
    const { container } = mount();
    expect(container.querySelectorAll('.tcard.is-skeleton').length).toBeGreaterThan(0);
  });

  it('puts a failure above the grid with a retry, keeping the last good cards', () => {
    library = { data: LIBRARY, loading: false, error: new Error('offline') };
    mount();
    expect(screen.getByRole('alert').textContent).toMatch(/offline|Could not load/);
    expect(within(section('Library')).getByText('Semester review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });
});
