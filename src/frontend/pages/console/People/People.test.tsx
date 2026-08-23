// T-050 — /app/people. 34 § Acceptance.
//
// The fixture labels are NONSENSE on purpose (22 §5). If an English domain noun appears in
// an assertion below, the component hardcoded it and INV-001 is false on this screen.
// "People", "Name", "Email", "Position" are structural product words and correctly stay
// literal (22 §1) — the unit noun is not, and is asserted through the fixture.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { Capability, Page, PersonSummary, RoleView, UnitNode } from '@endur/shared';
import { ApiError } from '../../../lib/api.js';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import People from './index.js';

const person = (
  over: Partial<PersonSummary> & { id: string; name: string },
): PersonSummary => ({
  userId: `u-${over.id}`, email: `${over.id}@example.test`, status: 'active',
  positions: [], createdAt: '2026-08-01T00:00:00.000Z',
  account: { state: 'active', lastLoginAt: null }, ...over,
});

const page = (rows: PersonSummary[], over: Partial<Page<PersonSummary>> = {}): Page<PersonSummary> => ({
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

const roles: RoleView[] = [
  { id: 'r1', name: 'Dean', level: 1, peopleCount: 1, grantCount: 20 },
  { id: 'r2', name: 'Tutor', level: 2, peopleCount: 4, grantCount: 8 },
];

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const assign = vi.fn();
const unassign = vi.fn();
const reload = vi.fn();
let list: { data: Page<PersonSummary> | null; loading: boolean; error: Error | null };
let seen: string[] = [];

vi.mock('../../../lib/people.js', () => ({
  usePeopleList: (query: Record<string, unknown>) => {
    seen.push(JSON.stringify(query));
    return { ...list, reload, create, update, remove, assign, unassign };
  },
  useRoles: () => ({ data: roles, loading: false, error: null }),
  peopleSearch: () => '',
}));
vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({ data: units, loading: false, error: null }),
}));

const ALL: Capability[] = [
  'person.read', 'person.create', 'person.update', 'person.delete',
  'assignment.create', 'assignment.delete',
];

/** The fixture's unit noun, narrowed once — `LabelSet`'s keys are optional by type. */
const UNIT_ONE = NONSENSE_LABELS.unit?.one ?? '';

function Where(): JSX.Element {
  return <span data-testid="where">{useLocation().search}</span>;
}

const mount = (capabilities: Capability[] = ALL, path = '/app/people') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/people" element={<><People /><Where /></>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path },
  );

const where = (): string => screen.getByTestId('where').textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  seen = [];
  // The real `create` reloads the list before resolving, so the new row exists by the time
  // the page reacts. The mock has to do the same or the position editor has no row to open
  // on — and the test would fail for a reason the product does not have.
  create.mockImplementation(() => {
    const added = person({ id: 'p9', name: 'Kofi Mensah' });
    list = { ...list, data: page([...(list.data?.data ?? []), added]) };
    return Promise.resolve(added);
  });
  update.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  assign.mockResolvedValue(undefined);
  unassign.mockResolvedValue(undefined);
  list = {
    data: page([
      person({
        id: 'p1', name: 'Asha Rao',
        positions: [
          { edgeId: 'e1', roleName: 'Dean', unitName: 'Engineering', isPrimary: true },
          { edgeId: 'e2', roleName: 'Tutor', unitName: 'Computer Science', isPrimary: false },
        ],
      }),
      person({ id: 'p2', name: 'Bo Chen' }),
    ]),
    loading: false,
    error: null,
  };
});

describe('the list', () => {
  it('renders a person once per row, whatever their hat count', () => {
    mount();
    // The name is an <InlineName> input when the caller may rename, so it is a VALUE.
    expect(screen.getByDisplayValue('Asha Rao')).toBeTruthy();
    expect(screen.getByDisplayValue('Bo Chen')).toBeTruthy();
  });

  // 34 § Acceptance: "A person can hold two positions at different units, shown as two
  // chips." This is the multi-position model made visible, and it is the reason a dean who
  // is also a professor needs no special case.
  it('shows a two-hat person as TWO chips, each naming its own place', () => {
    mount();
    const row = screen.getByDisplayValue('Asha Rao').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Dean');
    expect(row.textContent).toContain('Engineering');
    expect(row.textContent).toContain('Tutor');
    expect(row.textContent).toContain('Computer Science');
  });

  // INV-005 lives in the unit half. A chip reading only "Dean" would hide the single most
  // important behavioural detail in the model on the screen where somebody is setting it.
  it('never renders a position without its place', () => {
    mount();
    const chips = document.querySelectorAll('.position-chip');
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.querySelector('.position-role')?.textContent).toBeTruthy();
      expect(chip.querySelector('.position-unit')?.textContent).toBeTruthy();
    }
  });

  // Somebody with no position can do nothing at all — the commonest reason an
  // administrator is on this screen. An empty cell would say nothing about it.
  it('says so, in words, when a person holds no position', () => {
    mount();
    const row = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('No position');
  });
});

describe('filters', () => {
  it('puts the search in the URL so a filtered list is linkable', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'asha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(where()).toContain('q=asha'));
  });

  it('drops the cursor when a filter changes — an old cursor means nothing', async () => {
    mount(ALL, '/app/people?cursor=abc');
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(where()).not.toContain('cursor'));
  });

  // The two empties differ, and showing the wrong one is a small daily frustration: one
  // needs an add action, the other needs a clear-filters action (34 § States).
  it('distinguishes an empty organization from an empty query', () => {
    list = { data: page([]), loading: false, error: null };
    const view = mount();
    expect(screen.getByText('Nobody here yet')).toBeTruthy();
    view.unmount();

    list = { data: page([]), loading: false, error: null };
    mount(ALL, '/app/people?q=zzz');
    expect(screen.getByText('No one matches those filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });
});

describe('adding a person', () => {
  // 14 §8 / 34: the create DTO carries no role, level or capability. A form that offered
  // one would be promising something the API refuses.
  it('asks for a name and an email and NOTHING about permissions', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Add a person/ }));
    // Scoped to the dialog: "Name" and "Email" are also column headers on the table behind
    // it, and an unscoped query would pass on the wrong element.
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Name')).toBeTruthy();
    expect(dialog.getByLabelText('Email')).toBeTruthy();
    expect(dialog.queryByLabelText('Role')).toBeNull();
  });

  it('creates, then opens the position editor for the person just added', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Add a person/ }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Kofi Mensah' } });
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'kofi@example.test' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add person' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'Kofi Mensah', email: 'kofi@example.test' }),
    );
    // Creating somebody grants them nothing. Leaving the administrator on a list with a new
    // row that can do nothing is leaving the job half done (34 § Interactions).
    await waitFor(() => expect(document.querySelector('.position-editor')).toBeTruthy());
  });
});

describe('positions', () => {
  it('adds one from two inline dropdowns, never a modal', async () => {
    mount();
    const row = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    fireEvent.click(row.querySelector('.btn-tiny') as HTMLElement);

    expect(document.querySelector('.dialog')).toBeNull();
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'r2' } });
    fireEvent.change(screen.getByLabelText(UNIT_ONE), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('p2', { roleId: 'r2', unitId: 'u1', isPrimary: true }),
    );
  });

  // DEC-044 made this consequential: a per-person grant anchors at the PRIMARY position's
  // unit, and two positions with none flagged leaves no anchor at all.
  it('makes a first position primary by default, and asks from the second onwards', () => {
    mount();
    const bo = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    fireEvent.click(bo.querySelector('.btn-tiny') as HTMLElement);
    // No checkbox: with no positions yet, primary is not a question worth asking.
    expect(screen.queryByLabelText('Primary')).toBeNull();

    const asha = screen.getByDisplayValue('Asha Rao').closest('tr') as HTMLElement;
    fireEvent.click(asha.querySelector('.btn-tiny') as HTMLElement);
    expect(screen.getByLabelText('Primary')).toBeTruthy();
  });

  // 34 § States. The refusal here is usually INV-012's, and its whole value is the sentence
  // naming the capability that would have been handed out. A generic message throws away
  // the only actionable part; a toast takes it away after four seconds (24 §6).
  it('shows a refusal INLINE and verbatim, never a toast', async () => {
    assign.mockRejectedValue(
      new ApiError({
        code: 'WOULD_ESCALATE',
        status: 403,
        message:
          'That position includes "grant.update" on Engineering, which you do not hold there yourself.',
        requestId: 'test',
        details: { capability: 'grant.update', unitName: 'Engineering' },
      }),
    );
    mount();
    const row = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    fireEvent.click(row.querySelector('.btn-tiny') as HTMLElement);
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(UNIT_ONE), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('grant.update');
    expect(alert.textContent).toContain('Engineering');
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('removes one, naming both halves in the button label for a screen reader', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dean — Engineering' }));
    await waitFor(() => expect(unassign).toHaveBeenCalledWith('p1', 'e1'));
  });
});

describe('permissions are the API’s job, not this screen’s', () => {
  // INV-003: out-of-scope actions are ABSENT, not disabled. A greyed row would be a list of
  // everything the caller cannot do (design_specs/design/02 §5).
  it('omits every write action without the capability for it', () => {
    mount(['person.read']);
    expect(screen.queryByRole('button', { name: /Add a person/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(document.querySelector('.btn-tiny')).toBeNull();
    // …and the list itself still renders. Hiding actions is not hiding data.
    // No `person.update` here, so the name is plain text rather than an input.
    expect(screen.getByText('Asha Rao')).toBeTruthy();
  });

  it('does not offer to remove a position without assignment.delete', () => {
    mount(['person.read', 'assignment.create']);
    expect(screen.queryByRole('button', { name: /^Remove Dean/ })).toBeNull();
  });
});

describe('removing a person', () => {
  // <ConfirmDialog> requires a consequence (24 §6), and the honest one depends on what they
  // hold: removing somebody with two positions takes two permission grants with them.
  it('names how many positions go with them', () => {
    mount();
    const row = screen.getByDisplayValue('Asha Rao').closest('tr') as HTMLElement;
    fireEvent.click(row.querySelector('.btn-ghost:not(.btn-tiny)') as HTMLElement);
    expect(screen.getByText(/2 positions/)).toBeTruthy();
  });

  it('says nothing else changes when they hold none', () => {
    mount();
    const row = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    const buttons = [...row.querySelectorAll('button')].filter((b) => b.textContent === 'Remove');
    fireEvent.click(buttons[0] as HTMLElement);
    expect(screen.getByText(/no positions/)).toBeTruthy();
  });
});
