// T-034 — /app/subjects. 35 § Acceptance.
//
// This is the vocabulary showcase, so half of these tests are really one test asked in
// different places: does a word on this screen come from `useLabels()`? The fixture labels
// are nonsense on purpose — if an English noun appears in an assertion below, the component
// hardcoded it (22 §5, INV-001).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { Capability, Page, SubjectSummary, UnitNode } from '@endur/shared';
import { ApiError } from '../../../lib/api.js';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Subjects, { archiveConsequence } from './index.js';

const subject = (over: Partial<SubjectSummary> & { id: string; name: string }): SubjectSummary => ({
  type: 'general', unitId: 'u1', unitName: 'Engineering',
  linkedUserId: null, linkedUserName: null,
  activeCampaigns: 0, totalResponses: 0, lastResponseAt: null,
  archivedAt: null, createdAt: '2026-08-01T00:00:00.000Z', ...over,
});

const page = (rows: SubjectSummary[], over: Partial<Page<SubjectSummary>> = {}): Page<SubjectSummary> => ({
  data: rows,
  page: { nextCursor: null, hasMore: false },
  meta: { total: rows.length },
  ...over,
});

const units: UnitNode[] = [
  {
    id: 'u0', name: 'Northfield', parentId: null, isTemporary: false, endsAt: null,
    peopleCount: 0, subjectCount: 0,
    children: [{
      id: 'u1', name: 'Engineering', parentId: 'u0', isTemporary: false, endsAt: null,
      peopleCount: 0, subjectCount: 0, children: [],
    }],
  },
];

const create = vi.fn();
const rename = vi.fn();
const update = vi.fn();
const archive = vi.fn();
const reload = vi.fn();
let list: { data: Page<SubjectSummary> | null; loading: boolean; error: Error | null };
let seen: string[] = [];

vi.mock('../../../lib/subjects.js', () => ({
  useSubjectList: (query: Record<string, unknown>) => {
    seen.push(JSON.stringify(query));
    return { ...list, reload, create, rename, update, archive };
  },
  useSubject: () => ({ data: null, loading: false, error: null, reload }),
  subjectSearch: () => '',
}));
vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({ data: units, loading: false, error: null }),
}));
vi.mock('../../../lib/people.js', () => ({
  usePeopleSearch: () => ({ data: null, loading: false, error: null }),
  usePeopleIn: () => ({ data: null, loading: false, error: null }),
}));

const ALL: Capability[] = [
  'subject.read', 'subject.create', 'subject.update', 'subject.archive', 'person.read',
];

function Where(): JSX.Element {
  return <span data-testid="where">{useLocation().search}</span>;
}

const mount = (capabilities: Capability[] = ALL, path = '/app/subjects') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/subjects" element={<><Subjects /><Where /></>} />
      <Route path="/app/subjects/:id" element={<p>DETAIL</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path },
  );

const where = (): string => screen.getByTestId('where').textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  seen = [];
  create.mockResolvedValue(subject({ id: 's9', name: 'New one' }));
  rename.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  archive.mockResolvedValue(undefined);
  list = {
    data: page([
      subject({ id: 's1', name: 'Data Structures', totalResponses: 612, activeCampaigns: 1 }),
      subject({ id: 's2', name: 'Thermodynamics', linkedUserId: 'p7', linkedUserName: 'Vikram Shah' }),
    ]),
    loading: false,
    error: null,
  };
});

describe('the vocabulary showcase (INV-001)', () => {
  it('names itself, its column and its primary action from the labels', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Quaxels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a Quaxel' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Zblorn' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Active plithes' })).toBeTruthy();
  });

  it('renders the rows the API returned, counts included', () => {
    mount();
    const row = screen.getByDisplayValue('Data Structures').closest('tr');
    expect(within(row as HTMLElement).getByText('612')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vikram Shah' })).toBeTruthy();
  });
});

describe('filters live in the URL', () => {
  it('puts a search there, and paging starts again', () => {
    mount([...ALL], '/app/subjects?cursor=abc');
    fireEvent.change(screen.getByLabelText('Search Quaxels'), { target: { value: 'thermo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(where()).toContain('q=thermo');
    // A cursor from the old query means nothing against the new one.
    expect(where()).not.toContain('cursor');
  });

  it('filters by unit and toggles archived', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Filter by Zblorn'), { target: { value: 'u1' } });
    expect(where()).toContain('unit=u1');

    fireEvent.click(screen.getByLabelText('Show archived'));
    expect(where()).toContain('archived=true');
  });

  it('asks the API for exactly what the URL says', () => {
    mount([...ALL], '/app/subjects?q=data&unit=u1&archived=true');
    expect(seen[0]).toBe(JSON.stringify({ q: 'data', unitId: 'u1', archived: true, cursor: undefined }));
  });

  it('offers the next page only when there is one', () => {
    const first = mount();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    first.unmount();

    list = { data: page([subject({ id: 's1', name: 'A' })], {
      page: { nextCursor: 'cur2', hasMore: true }, meta: { total: 60 },
    }), loading: false, error: null };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(where()).toContain('cursor=cur2');
  });
});

describe('renaming', () => {
  it('commits on Enter', async () => {
    mount();
    const input = screen.getByDisplayValue('Data Structures');
    fireEvent.change(input, { target: { value: 'Data Structures II' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(rename).toHaveBeenCalledWith('s1', 'Data Structures II'));
  });

  it('says why when it fails — the name has already been put back by the hook', async () => {
    rename.mockRejectedValue(
      new ApiError({ code: 'CONFLICT', status: 409, message: 'That name is taken.', requestId: 'r' }),
    );
    mount();
    const input = screen.getByDisplayValue('Data Structures');
    fireEvent.change(input, { target: { value: 'Thermodynamics' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toBe('That name is taken.');
  });
});

describe('archiving states what is KEPT', () => {
  it('names the responses that survive', () => {
    mount();
    fireEvent.click(within(screen.getByDisplayValue('Data Structures').closest('tr') as HTMLElement)
      .getByRole('button', { name: 'Archive' }));

    expect(screen.getByRole('alertdialog').textContent).toContain(
      'keeps its 612 responses and removes it from new plithes',
    );
  });

  it('archives on confirm', async () => {
    mount();
    fireEvent.click(within(screen.getByDisplayValue('Data Structures').closest('tr') as HTMLElement)
      .getByRole('button', { name: 'Archive' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith('s1'));
  });

  it('does not promise responses that do not exist', () => {
    const text = archiveConsequence(subject({ id: 's3', name: 'Fresh', totalResponses: 0 }), 'plithes');
    expect(text).toBe('Archiving Fresh removes it from new plithes. Past results still include it.');
  });

  it('shows archived rows muted, with a tag, when the toggle is on', () => {
    list = { data: page([subject({ id: 's1', name: 'Old one', archivedAt: '2026-07-01T00:00:00.000Z' })]),
      loading: false, error: null };
    mount([...ALL], '/app/subjects?archived=true');

    const row = screen.getByText('Old one').closest('tr');
    expect(within(row as HTMLElement).getByText('Archived')).toBeTruthy();
    // An archived subject is not renameable — there is nothing to rename it for.
    expect(screen.queryByDisplayValue('Old one')).toBeNull();
  });
});

describe('creating', () => {
  it('sends name, unit and no link when none was chosen', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Quaxel' }));

    const dialog = screen.getByRole('dialog', { name: 'Add a Quaxel' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Fluid Mechanics' } });
    // The unit comes from <UnitTree mode="select"> — the tree's third placement (INV-009).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Engineering' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Fluid Mechanics', unitId: 'u1', type: 'general',
      }),
    );
  });

  it('is honest about what a link costs — 16 §5, which is the opposite of the obvious guess', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Quaxel' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a Quaxel' });

    expect(dialog.textContent).toContain('they already hold a seat, so it adds nothing to your plan');
  });
});

describe('the empty states differ, and that is the point', () => {
  it('offers the first one when the product is empty', () => {
    list = { data: page([]), loading: false, error: null };
    mount();

    expect(screen.getByText('No Quaxels yet')).toBeTruthy();
    // Exactly one Add button on this screen — the empty state's. The header hides its own
    // rather than showing the same primary action twice.
    expect(screen.getAllByRole('button', { name: 'Add a Quaxel' })).toHaveLength(1);
  });

  it('offers to clear the filters when the QUERY is empty', () => {
    list = { data: page([]), loading: false, error: null };
    mount([...ALL], '/app/subjects?q=nothing');

    expect(screen.getByText('No Quaxels match those filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(where()).toBe('');
  });
});

describe('what the reader may do', () => {
  it('offers no writes to somebody who may only read', () => {
    mount(['subject.read']);
    expect(screen.queryByRole('button', { name: /Add a Quaxel/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByDisplayValue('Data Structures')).toBeNull();
    expect(screen.getByText('Data Structures')).toBeTruthy();
  });
});

describe('the states that are not the happy one', () => {
  it('keeps the last good page and offers a retry', () => {
    list = { data: page([subject({ id: 's1', name: 'Data Structures' })]), loading: false, error: new Error('offline') };
    mount();

    expect(screen.getByDisplayValue('Data Structures')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });

  it('skeletons while the first page loads', () => {
    list = { data: null, loading: true, error: null };
    const { container } = mount();
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(5);
  });
});
