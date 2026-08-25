// T-051 — /app/people/:id. 34 § Acceptance.
//
// The fixture labels are NONSENSE on purpose (22 §5). If an English domain noun turns up in
// an assertion, the component hardcoded one and INV-001 is false on this screen.
//
// The two lines this file exists for are 34's own unticked acceptance items: powers come
// from the shared resolver, and powers on unit A do not appear under unit B. The second is
// asserted here as well as in the component's own test, because the page is where the two
// places could be flattened by a wrong prop long after the component was proved right.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, PersonDetail as PersonDetailView, RoleView, UnitNode } from '@endur/shared';
import { ApiError } from '../../../lib/api.js';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import PersonDetail from './PersonDetail.js';

const PERSON: PersonDetailView = {
  id: 'p1', userId: 'u9', name: 'Meera Iyer', email: 'meera@example.test',
  status: 'active', createdAt: '2026-08-01T00:00:00.000Z',
  account: { state: 'active', lastLoginAt: null },
  positions: [
    {
      edgeId: 'e1', roleId: 'role-x', roleName: 'Dean', roleLevel: 1, unitId: 'un1',
      unitName: 'Engineering', isPrimary: true, validTo: null,
    },
    {
      edgeId: 'e2', roleId: 'role-x', roleName: 'Tutor', roleLevel: 3, unitId: 'un2',
      unitName: 'Mechanical', isPrimary: false, validTo: '2026-12-31T00:00:00.000Z',
    },
  ],
  powersByPlace: [
    {
      unitId: 'un1', unitName: 'Engineering', roleName: 'Dean',
      capabilities: [
        { capability: 'campaign.launch', scope: 'subtree' },
        { capability: 'results.read', scope: 'subtree' },
      ],
    },
    {
      unitId: 'un2', unitName: 'Mechanical', roleName: 'Tutor',
      capabilities: [{ capability: 'results.read', scope: 'own_unit' }],
    },
  ],
};

const units: UnitNode[] = [
  {
    id: 'un1', name: 'Engineering', parentId: null, isTemporary: false, endsAt: null,
    peopleCount: 0, subjectCount: 0, children: [],
  },
];
const roles: RoleView[] = [{ id: 'r1', name: 'Dean', level: 1, peopleCount: 1, grantCount: 20 }];

const rename = vi.fn();
const setEmail = vi.fn();
const assign = vi.fn();
const unassign = vi.fn();
const reload = vi.fn();
let state: { data: PersonDetailView | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/people.js', () => ({
  usePerson: () => ({ ...state, reload, rename, setEmail, assign, unassign }),
  useRoles: () => ({ data: roles, loading: false, error: null }),
}));
vi.mock('../../../lib/units.js', () => ({ useUnits: () => ({ data: units, loading: false, error: null }) }));

beforeEach(() => {
  vi.clearAllMocks();
  state = { data: PERSON, loading: false, error: null };
  for (const fn of [rename, setEmail, assign, unassign, reload]) fn.mockResolvedValue(undefined);
});

/** The vocabulary fixture is a Partial, so the noun is pinned once here rather than
 *  asserted non-null at each call site. */
const UNIT_NOUN = NONSENSE_LABELS.unit?.one ?? '';

const ALL: Capability[] = ['person.read', 'person.update', 'assignment.create', 'assignment.delete'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes><Route path="/app/people/:id" element={<PersonDetail />} /></Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/people/p1' },
  );

describe('/app/people/:id', () => {
  it('shows identity, the account, positions and powers — in that order, payload last', () => {
    mount();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Identity', 'Account', 'Positions', 'What they can do, and where']);
  });

  it('PROVES INV-005 on the page — Engineering’s powers are absent from Mechanical', () => {
    mount();
    const mechanical = screen.getByRole('heading', { name: 'Mechanical' }).closest('.powers-place');
    expect(within(mechanical as HTMLElement).getByText('results.read')).toBeTruthy();
    // Absent under the other place, not greyed out there. Two places must stay two places:
    // a page that flattened them would look tidy and assert the opposite of the model.
    expect(within(mechanical as HTMLElement).queryByText('campaign.launch')).toBeNull();
    expect(document.querySelectorAll('.powers-place')).toHaveLength(2);
  });

  it('never renders a position without its place — the unit half boxes the powers', () => {
    mount();
    const chips = [...document.querySelectorAll('.position-chip')];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.querySelector('.position-unit')?.textContent).toBeTruthy();
    }
    // And the level and the expiry, which is what 47 asks for and the list deliberately omits.
    expect(screen.getByText('L1')).toBeTruthy();
    expect(screen.getByText(/^Until /)).toBeTruthy();
  });

  it('IS WHERE AN EMAIL CHANGES, unlike /app/profile', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Change/ }));
    const input = screen.getByRole('textbox', { name: 'Email' });
    fireEvent.change(input, { target: { value: 'meera.iyer@example.test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(setEmail).toHaveBeenCalledWith('meera.iyer@example.test'));
  });

  it('hides every write from a caller who only reads — absent, not greyed (design/02 §5)', () => {
    mount(['person.read']);
    expect(screen.queryByRole('button', { name: /Change/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Position/ })).toBeNull();
    expect(document.querySelectorAll('.position-remove')).toHaveLength(0);
    // The powers still render. Reading what somebody can do is the read, not a write.
    expect(screen.getByText('campaign.launch')).toBeTruthy();
  });

  it('adds a position through the two dropdowns, never a modal', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Position/ }));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(UNIT_NOUN), { target: { value: 'un1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith({ roleId: 'r1', unitId: 'un1', isPrimary: false }),
    );
  });

  it('KEEPS INV-012’s refusal VERBATIM — the sentence names the capability', async () => {
    assign.mockRejectedValue(
      new ApiError({
        code: 'WOULD_ESCALATE', status: 403, requestId: 'r1',
        message: 'That role can launch campaigns, and you cannot do that at Engineering.',
        details: { capability: 'campaign.launch' },
      }),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Position/ }));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(UNIT_NOUN), { target: { value: 'un1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const alert = await screen.findByRole('alert');
    // Verbatim. Replacing it with generic copy throws away the only actionable part — the
    // caller can perform this on most rows, so a bare refusal reads as a bug (34 § States).
    expect(alert.textContent).toBe('That role can launch campaigns, and you cannot do that at Engineering.');
  });

  it('warns about the POWERS before removing a position, not about a chip', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dean — Engineering' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Everything Meera Iyer could do at Engineering goes with it/)).toBeTruthy();
    // The account survives. Positions are the powers; the account is the key (34).
    expect(within(dialog).getByText(/keep their account/)).toBeTruthy();
  });

  it('404s IDENTICALLY for out-of-scope and nonexistent — ids cannot be probed (13 §5)', () => {
    state = {
      data: null, loading: false,
      error: new ApiError({
        code: 'NOT_FOUND', status: 404, requestId: 'r1', message: 'That person does not exist.',
      }),
    };
    mount();
    expect(screen.getByText('No such person here')).toBeTruthy();
    // The copy must be true for both cases, so it says neither — and says so out loud.
    expect(screen.getByText(/Both look the same from here/)).toBeTruthy();
  });

  it('says a person with no position can do nothing, rather than showing an empty area', () => {
    state = { data: { ...PERSON, positions: [], powersByPlace: [] }, loading: false, error: null };
    mount();
    expect(screen.getByText(/cannot sign in to anything yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing anywhere, because they hold no position/)).toBeTruthy();
  });
});
