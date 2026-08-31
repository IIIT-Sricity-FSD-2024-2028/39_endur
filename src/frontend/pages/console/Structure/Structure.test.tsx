// T-033 — /app/structure, end to end in jsdom. 32 § Acceptance.
//
// Every acceptance item in doc 32 that does not need a real device is here. The two that
// do — "usable with touch at 390px" and the temporary-unit expiry actually firing on
// schedule — are a device check and a backend job respectively, and no jsdom test can
// stand in for either.
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
  // The branch totals are the SERVER's (DEC-082), so a fixture states them rather than
  // deriving them — a fixture that rolled them up itself would be testing its own walk.
  // A leaf's branch is itself, which is the default; the parents below say theirs.
  peopleTotal: over.peopleCount ?? 0, subjectTotal: over.subjectCount ?? 0,
  ...over,
});

/** Northfield › Engineering › Computer Science, with counts on the middle row. */
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

// The real envelope from 13 §4 — `data`, not `items`. The first version of this fixture
// repeated the shared type's wrong shape and made the panel's bug invisible (N-029).
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
/** The role mix behind the People stat — DEC-083. Two Tutors and one Head on Engineering's
 *  branch, which is a mix; a one-role unit is not one and renders nothing. */
let mix: UnitComposition | null;
let people: { data: Page<PersonSummary> | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({
    ...tree,
    totals: { people: 64, subjects: 1, units: 3 },
    reload, create, rename, reparent, remove,
  }),
  unitImpact: (id: string): Promise<UnitImpact> => impact(id) as Promise<UnitImpact>,
  // Answers for the unit it names and no other, the way the endpoint does — otherwise
  // every unit's panel shows Engineering's mix and the numbers collide.
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

/** The row a name belongs to, for assertions that must not match a sibling. */
const rowFor = (name: string): HTMLElement => {
  const row = screen.getByDisplayValue(name).closest('.unit-row');
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
};

/** The dialog's own Delete button. The panel has one too — clicking a row selects it. */
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
    // INV-003: out-of-scope units are ABSENT, not greyed. A level-2 user's response starts
    // at their own unit, and the page has no idea anything exists above it.
    tree = { data: [northfield()[0]!.children[0]!], loading: false, error: null };
    mount();

    expect(screen.getByDisplayValue('Engineering')).toBeTruthy();
    expect(screen.queryByDisplayValue('Northfield')).toBeNull();
  });

  it('shows counts in the caller vocabulary, over the whole branch — DEC-081', () => {
    // 64, not 4: Engineering holds four people and Computer Science under it holds sixty.
    // The server already reads it that way — the impact fixture below answers "delete
    // Engineering" with peopleAffected: 64 — so this row was the surface disagreeing.
    // And ONE Quaxel, not "1 Quaxels", which this assertion used to require.
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

  // The name is on screen twice now — once in the map above, once in the tree — so this
  // counts rather than demanding one. The assertion that matters is the first: a reader
  // without `unit.update` gets text, never an editable field.
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
    // The map and the tree print 64 for Engineering because a box has room for one number.
    // Somebody who clicks through after reading 64 must not then be shown a bare 4 with no
    // explanation — the two views would simply contradict each other.
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    expect(within(panel).getByText('64')).toBeTruthy();
    expect(within(panel).getByText('4 here · 60 below')).toBeTruthy();
  });

  it('says nothing about a split on a unit that has nothing under it', () => {
    // A footnote reading "60 here · 0 below" on every leaf is the "· 0" noise DEC-081's own
    // rule rejects one line above it.
    mount();
    fireEvent.click(rowFor('Computer Science'));

    const panel = screen.getByRole('complementary', { name: 'Computer Science details' });
    expect(within(panel).getByText('60')).toBeTruthy();
    expect(within(panel).queryByText(/here ·/)).toBeNull();
  });

  it('says WHO the people are, not only how many — DEC-083', () => {
    // The owner's complaint about a number that was already correct: a hospital reading
    // "30 people" means staff, and sixteen of those thirty are Patients. The stat is
    // honest and unusable until the panel says what it is made of.
    mount();
    fireEvent.click(rowFor('Engineering'));

    const panel = screen.getByRole('complementary', { name: 'Engineering details' });
    // Scoped to the breakdown: "60" is also the stat above it, and a bare getByText would
    // pass on the number this test is not about.
    const mixed = panel.querySelector('.unit-mix');
    expect(mixed?.textContent).toContain('By role');
    expect(mixed?.textContent).toContain('Head');
    expect(mixed?.textContent).toContain('4');
    expect(mixed?.textContent).toContain('Tutor');
    expect(mixed?.textContent).toContain('60');
  });

  it('warns when the roles add up past the total, instead of leaving it to be discovered', () => {
    // Somebody who is both a Nurse and a Head is honestly in both rows, so the column can
    // exceed the stat above it. Unexplained, the panel looks like it has lost count.
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
    // One row is the stat above in a taller shape. The breakdown earns its space only when
    // there is something to compare.
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
    // The envelope here is the real one from 13 §4. When this fixture said `items` the
    // panel read `undefined` and rendered nothing — and the test still passed (N-029).
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
    // Names, not links, until /app/people is built — a link to "Not built yet" reads as a
    // broken product (design_specs/design/02 §7). Restore both links with the page.
    expect(within(panel).getByText('Meera Iyer')).toBeTruthy();
    expect(within(panel).queryByRole('link', { name: 'Meera Iyer' })).toBeNull();
    // Scoped to the list: "Head" is also a row of the By-role breakdown above it (DEC-083),
    // and the role beside a NAME is the thing this test is about.
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
