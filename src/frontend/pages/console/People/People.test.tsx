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
  userId: `u-${over.id}`, email: `${over.id}@example.test`,
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
    peopleCount: 0, subjectCount: 0, peopleTotal: 0, subjectTotal: 0,
    children: [{
      id: 'u1', name: 'Engineering', parentId: 'u0', isTemporary: false, endsAt: null,
      peopleCount: 0, subjectCount: 0, peopleTotal: 0, subjectTotal: 0, children: [],
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
          { edgeId: 'e1', roleId: 'role-x', roleName: 'Dean', roleLevel: 1, unitId: 'u1', unitName: 'Engineering', isPrimary: true, validTo: null },
          { edgeId: 'e2', roleId: 'role-x', roleName: 'Tutor', roleLevel: 2, unitId: 'u2', unitName: 'Computer Science', isPrimary: false, validTo: null },
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
    expect(screen.getByDisplayValue('Asha Rao')).toBeTruthy();
    expect(screen.getByDisplayValue('Bo Chen')).toBeTruthy();
  });

  it('shows a two-hat person as TWO chips, each naming its own place', () => {
    mount();
    const row = screen.getByDisplayValue('Asha Rao').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Dean');
    expect(row.textContent).toContain('Engineering');
    expect(row.textContent).toContain('Tutor');
    expect(row.textContent).toContain('Computer Science');
  });

  it('never renders a position without its place', () => {
    mount();
    const chips = document.querySelectorAll('.position-chip');
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.querySelector('.position-role')?.textContent).toBeTruthy();
      expect(chip.querySelector('.position-unit')?.textContent).toBeTruthy();
    }
  });

  it('says so, in words, when a person holds no position', () => {
    mount();
    const row = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('No position');
  });

  it('does not say "invited" about somebody nobody has invited', () => {
    const fresh = person({ id: 'p3', name: 'Kim Ali', account: { state: 'none' } });
    list = { ...list, data: page([fresh]) };
    mount([...ALL, 'account.create']);
    const row = screen.getByDisplayValue('Kim Ali').closest('tr') as HTMLElement;
    expect(row.textContent?.toLowerCase()).not.toContain('invited');
    expect(within(row).getByRole('button', { name: 'Invite' })).toBeTruthy();
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
  it('asks for a name and an email and NOTHING about permissions', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Add a person/ }));
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

  it('makes a first position primary by default, and asks from the second onwards', () => {
    mount();
    const bo = screen.getByDisplayValue('Bo Chen').closest('tr') as HTMLElement;
    fireEvent.click(bo.querySelector('.btn-tiny') as HTMLElement);
    expect(screen.queryByLabelText('Primary')).toBeNull();

    const asha = screen.getByDisplayValue('Asha Rao').closest('tr') as HTMLElement;
    fireEvent.click(asha.querySelector('.btn-tiny') as HTMLElement);
    expect(screen.getByLabelText('Primary')).toBeTruthy();
  });

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
  it('omits every write action without the capability for it', () => {
    mount(['person.read']);
    expect(screen.queryByRole('button', { name: /Add a person/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(document.querySelector('.btn-tiny')).toBeNull();
    expect(screen.getByText('Asha Rao')).toBeTruthy();
  });

  it('does not offer to remove a position without assignment.delete', () => {
    mount(['person.read', 'assignment.create']);
    expect(screen.queryByRole('button', { name: /^Remove Dean/ })).toBeNull();
  });
});

describe('removing a person', () => {
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
