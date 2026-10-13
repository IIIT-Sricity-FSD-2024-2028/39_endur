import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type {
  Capability,
  Page,
  PersonSummary,
  UnitComposition,
  UnitImpact,
  UnitNode,
} from '@endur/shared';
import { ApiError } from '../../../lib/api.js';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Structure from './index.js';

const unit = (over: Partial<UnitNode> & { id: string; name: string }): UnitNode => ({
  parentId: null, isTemporary: false, endsAt: null,
  peopleCount: 0, subjectCount: 0, children: [],
  peopleTotal: over.peopleCount ?? 0, subjectTotal: over.subjectCount ?? 0,
  ...over,
});

const northfield = (): UnitNode[] => [
  unit({
    id: 'root',
    name: 'Northfield',
    peopleTotal: 64,
    subjectTotal: 1,
    children: [
      unit({
        id: 'eng',
        name: 'Engineering',
        parentId: 'root',
        peopleCount: 4,
        subjectCount: 1,
        peopleTotal: 64,
        subjectTotal: 1,
        children: [unit({ id: 'cs', name: 'Computer Science', parentId: 'eng', peopleCount: 60 })],
      }),
    ],
  }),
];

const impactOf = (over: Partial<UnitImpact> = {}): UnitImpact => ({
  unitId: 'eng', unitName: 'Engineering', descendantCount: 1,
  peopleAffected: 64, subjectsAffected: 12, campaignsAffected: 0,
  gained: [], lost: [], ...over,
});

const emptyPeople: Page<PersonSummary> = {
  data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 },
};

const reload = vi.fn();
const create = vi.fn();
const rename = vi.fn();
const reparent = vi.fn();
const remove = vi.fn();
const impact = vi.fn();

let tree: { data: UnitNode[] | null; loading: boolean; error: Error | null };
let mix: UnitComposition | null;
let people: { data: Page<PersonSummary> | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({
    ...tree,
    totals: { people: 64, subjects: 1, units: 3 },
    reload, create, rename, reparent, remove,
  }),
  unitImpact: (id: string): Promise<UnitImpact> => impact(id) as Promise<UnitImpact>,
  useUnitComposition: (id: string | null) => ({
    data: id && mix?.unitId === id ? mix : null,
    loading: false,
    error: null,
  }),
}));
vi.mock('../../../lib/people.js', () => ({
  usePeopleIn: (id: string | null) => (id ? people : { data: null, loading: false, error: null }),
}));

const ALL: Capability[] = [
  'unit.read', 'unit.create', 'unit.update', 'unit.delete', 'unit.reparent', 'person.read',
];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/structure" element={<Structure />} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/structure' },
  );

const rowFor = (name: string): HTMLElement => {
  const row = screen.getByDisplayValue(name).closest('.unit-row');
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
};

const confirmButton = (): HTMLElement =>
  within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' });

const typeInto = (input: HTMLElement, value: string): void => {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue([]);
  rename.mockResolvedValue(undefined);
  reparent.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  impact.mockResolvedValue(impactOf());
  tree = { data: northfield(), loading: false, error: null };
  people = { data: emptyPeople, loading: false, error: null };
  mix = {
    unitId: 'eng',
    total: 64,
    byRole: [
      { roleId: 'r1', roleName: 'Head', level: 1, count: 4 },
      { roleId: 'r2', roleName: 'Tutor', level: 2, count: 60 },
    ],
  };
});

describe('the tree', () => {
  it('names itself from the vocabulary, never from a hardcoded noun (INV-001)', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Zblorns' })).toBeTruthy();
    expect(screen.getByText('3 Zblorns, 3 levels deep')).toBeTruthy();
  });

  it('renders exactly the units the API returned — a subtree rooted at the caller unit', () => {
    tree = { data: [northfield()[0]!.children[0]!], loading: false, error: null };
    mount();

    expect(screen.getByDisplayValue('Engineering')).toBeTruthy();
    expect(screen.queryByDisplayValue('Northfield')).toBeNull();
  });

  it('shows counts in the caller vocabulary, over the whole branch — DEC-081', () => {
    mount();
    expect(within(rowFor('Engineering')).getByText('64 people · 1 Quaxel')).toBeTruthy();
  });
});

describe('adding', () => {
  it('adds a child and focuses it — two clicks, two words', async () => {
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Add a Zblorn'));

    const input = screen.getByPlaceholderText('Add a Zblorn');
    expect(document.activeElement).toBe(input);

    typeInto(input, 'Physics');
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'Physics', parentId: 'eng', isTemporary: false }),
    );
  });

  it('expands `Floor 1..8` into one request for eight siblings', async () => {
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Add a Zblorn'));
    typeInto(screen.getByPlaceholderText('Add a Zblorn'), 'Floor 1..8');

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Floor',
        parentId: 'eng',
        isTemporary: false,
        repeat: { from: 1, to: 8, letters: false },
      }),
    );
  });

  it('refuses `1..10000` with the number, and never asks the server', async () => {
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Add a Zblorn'));
    typeInto(screen.getByPlaceholderText('Add a Zblorn'), 'Floor 1..10000');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That would create 10000 Zblorns. The most in one go is 50.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('drops the placeholder row when the edit is abandoned', () => {
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Add a Zblorn'));
    const input = screen.getByPlaceholderText('Add a Zblorn');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Add a Zblorn')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('renaming', () => {
  it('commits on Enter', async () => {
    mount();
    typeInto(screen.getByDisplayValue('Computer Science'), 'Computing');
    await waitFor(() => expect(rename).toHaveBeenCalledWith('cs', 'Computing'));
  });

  it('says why when the rename could not be saved', async () => {
    rename.mockRejectedValue(
      new ApiError({ code: 'CONFLICT', status: 409, message: 'That name is taken.', requestId: 'r' }),
    );
    mount();
    typeInto(screen.getByDisplayValue('Computer Science'), 'Engineering');

    expect((await screen.findByRole('alert')).textContent).toBe('That name is taken.');
  });
});

describe('moving', () => {
  it('re-parents through the keyboard path', async () => {
    mount();
    fireEvent.click(within(rowFor('Computer Science')).getByLabelText('Move Computer Science'));
    fireEvent.click(within(rowFor('Northfield')).getByRole('button', { name: 'Move here' }));

    await waitFor(() => expect(reparent).toHaveBeenCalledWith('cs', 'root'));
  });

  it('shows the server refusal inline, on the row — never a dialog', async () => {
    reparent.mockRejectedValue(
      new ApiError({
        code: 'CONFLICT', status: 409, requestId: 'r',
        message: 'That move would put the unit inside itself.',
      }),
    );
    mount();
    fireEvent.click(within(rowFor('Computer Science')).getByLabelText('Move Computer Science'));
    fireEvent.click(within(rowFor('Northfield')).getByRole('button', { name: 'Move here' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That move would put the unit inside itself.',
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('deleting', () => {
  it('states real numbers, and only becomes actionable once it knows them', async () => {
    let answer: (value: UnitImpact) => void = () => undefined;
    impact.mockReturnValue(new Promise<UnitImpact>((resolve) => { answer = resolve; }));
    mount();

    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Delete Engineering'));

    expect(screen.getByText('Checking what deleting Engineering affects…')).toBeTruthy();
    expect(confirmButton()).toHaveProperty('disabled', true);

    answer(impactOf());
    expect(
      await screen.findByText(
        'Deleting Engineering moves 1 Zblorn, 60 people and 11 Quaxels into Northfield.' +
          ' Its own 4 positions end and 1 Quaxel is left without a zblorn.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(confirmButton()).toHaveProperty('disabled', false));
  });

  it('sends the children to the parent', async () => {
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Delete Engineering'));
    await waitFor(() => expect(confirmButton()).toHaveProperty('disabled', false));
    fireEvent.click(confirmButton());

    await waitFor(() => expect(remove).toHaveBeenCalledWith('eng', 'root'));
  });

  it('is impossible when the impact call failed', async () => {
    impact.mockRejectedValue(new Error('network'));
    mount();
    fireEvent.click(within(rowFor('Engineering')).getByLabelText('Delete Engineering'));

    const message = await screen.findByText(/cannot be deleted right now/);
    expect(message.textContent).toContain('Nothing has changed');
    expect(confirmButton()).toHaveProperty('disabled', true);

    fireEvent.click(confirmButton());
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('what the reader may do', () => {
  it('offers nothing destructive to somebody who may only read', () => {
    mount(['unit.read']);
    expect(screen.queryByLabelText('Delete Engineering')).toBeNull();
    expect(screen.queryByLabelText('Move Engineering')).toBeNull();
    expect(screen.queryByLabelText('Add a Zblorn')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add a Zblorn/ })).toBeNull();
  });

  it('shows names as text, not inputs, without unit.update', () => {
    mount(['unit.read']);
    expect(screen.queryByDisplayValue('Engineering')).toBeNull();
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
  });
});

describe('the states that are not the happy one', () => {
  it('skeletons at the tree shape while loading', () => {
    tree = { data: null, loading: true, error: null };
    const { container } = mount();
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(4);
  });

  it('keeps the last good tree on screen when a refetch fails, and offers a retry', () => {
    tree = { data: northfield(), loading: false, error: new Error('offline') };
    mount();

    expect(screen.getByDisplayValue('Engineering')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });

  it('offers the first unit when there are none', () => {
    tree = { data: [], loading: false, error: null };
    mount();

    expect(screen.getByText('No Zblorns yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Zblorn' }));
    expect(screen.getByPlaceholderText('Add a Zblorn')).toBeTruthy();
  });
});

describe('the detail panel', () => {
  it('opens on selection and reports what is inside', () => {
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).getByText('Quaxels')).toBeTruthy();
    expect(within(panel).getByText('People')).toBeTruthy();
  });

  it('is the ONE place the branch and the unit itself are both stated — DEC-081', () => {
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).getByText('64')).toBeTruthy();
    expect(within(panel).getByText('4 here · 60 below')).toBeTruthy();
  });

  it('says nothing about a split on a unit that has nothing under it', () => {
    mount();
    fireEvent.click(rowFor('Computer Science'));

    const panel = screen.getByRole('complementary', { name: 'Computer Science details' });
    expect(within(panel).getByText('60')).toBeTruthy();
    expect(within(panel).queryByText(/here ·/)).toBeNull();
  });

  it('says WHO the people are, not only how many — DEC-083', () => {
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    const mixed = panel.querySelector('.unit-mix');
    expect(mixed?.textContent).toContain('By role');
    expect(mixed?.textContent).toContain('Head');
    expect(mixed?.textContent).toContain('4');
    expect(mixed?.textContent).toContain('Tutor');
    expect(mixed?.textContent).toContain('60');
  });

  it('warns when the roles add up past the total, instead of leaving it to be discovered', () => {
    mix = {
      unitId: 'eng',
      total: 64,
      byRole: [
        { roleId: 'r1', roleName: 'Head', level: 1, count: 10 },
        { roleId: 'r2', roleName: 'Tutor', level: 2, count: 60 },
      ],
    };
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).getByText(/add up past 64/)).toBeTruthy();
  });

  it('does not restate a single role as a “mix”', () => {
    mix = {
      unitId: 'eng',
      total: 64,
      byRole: [{ roleId: 'r2', roleName: 'Tutor', level: 2, count: 64 }],
    };
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).queryByText('By role')).toBeNull();
  });

  it('lists the people the API returned, and offers the rest', () => {
    people = {
      data: {
        data: [
          {
            id: 'p1', userId: 'u9', name: 'Meera Iyer', email: 'meera@example.test',
            createdAt: '2026-08-01T00:00:00.000Z',
            account: { state: 'active', lastLoginAt: null },
            positions: [{ edgeId: 'e1', roleId: 'role-x', roleName: 'Head', roleLevel: 1, unitId: 'u1', unitName: 'Engineering', isPrimary: true, validTo: null }],
          },
        ],
        page: { nextCursor: null, hasMore: true },
        meta: { total: 4 },
      },
      loading: false,
      error: null,
    };
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).getByText('Meera Iyer')).toBeTruthy();
    expect(within(panel).queryByRole('link', { name: 'Meera Iyer' })).toBeNull();
    const list = panel.querySelector('.unit-people-list');
    expect(within(list as HTMLElement).getByText('Head')).toBeTruthy();
    expect(within(panel).getByText('4 people here in total.')).toBeTruthy();
  });

  it('starts a move from the panel, for a reader with no hover', async () => {
    mount();
    fireEvent.click(rowFor('Engineering'));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(screen.getByRole('status').textContent).toContain('Engineering');
    fireEvent.click(within(rowFor('Northfield')).getByRole('button', { name: 'Move here' }));
    await waitFor(() => expect(reparent).toHaveBeenCalledWith('eng', 'root'));
  });
});
