// T-052 — /app/roles. 33 § Acceptance.
//
// MOCKS `lib/api.js` RATHER THAN `lib/roles.js`, unlike the neighbouring page tests. The
// interesting logic on this screen IS the hook — the scope cycle, the deny, the column copy
// and above all the SAVE DIFF — and mocking the hook away would leave these tests asserting
// that a table renders, which was never the risk.
//
// The row labels come from the SERVER (`33`, `D-008`), so the fixture below writes them the
// way a renamed organisation would. If an English domain noun turns up in an assertion here,
// the phrase table was bypassed.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  Capability, CapabilityMeta, GrantCell, GrantWarning, PutGrantsBody, RoleView,
} from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Roles from './index.js';

const roles: RoleView[] = [
  { id: 'r1', name: 'Principal', level: 1, peopleCount: 1, grantCount: 20 },
  { id: 'r2', name: 'Tutor', level: 2, peopleCount: 4, grantCount: 8 },
  { id: 'r3', name: 'Learner', level: 3, peopleCount: 40, grantCount: 2 },
];

const catalogue: CapabilityMeta[] = [
  { key: 'grant.update', module: 'Powers', phase: 'P2', label: 'change what every role is allowed to do' },
  // The tenant renamed `campaign` to "Plithe", so this is what the server sends back.
  { key: 'campaign.launch', module: 'Campaigns', phase: 'P2', label: 'open plithes for answers' },
  { key: 'campaign.close', module: 'Campaigns', phase: 'P2', label: 'close plithes to further answers' },
  { key: 'analysis.read', module: 'Analyze', phase: 'P3', label: 'view themes and analysis' },
];

let grid: GrantCell[];
let warnings: GrantWarning[];
let put: PutGrantsBody | null;
let posted: unknown[];
let myPositions: Array<{ roleId: string | null; roleName: string }>;

const apiGet = vi.fn((path: string) => {
  if (path === '/roles') return { data: roles };
  if (path === '/authz/capabilities') return { data: catalogue };
  if (path === '/grants') return { data: grid };
  if (path === '/grants/warnings') return { data: warnings };
  // The reader's own positions, for the self-lockout prompt. `Position.roleId` is what
  // makes that question answerable without matching a role by NAME (T-052, N-057).
  if (path === '/profile') return { data: { user: {}, positions: myPositions, powersByPlace: [] } };
  throw new Error(`unmocked GET ${path}`);
});
const apiPut = vi.fn((_path: string, body: PutGrantsBody) => {
  put = body;
  return { data: [] };
});
const apiPost = vi.fn((path: string, body: unknown) => {
  posted.push([path, body]);
  return { data: null };
});
const apiPatch = vi.fn((_path: string, _body: unknown) => ({ data: null }));
const apiDelete = vi.fn((_path: string, _body: unknown) => ({ data: null }));

vi.mock('../../../lib/api.js', () => ({
  apiGet: (p: string) => apiGet(p),
  apiPut: (p: string, b: PutGrantsBody) => apiPut(p, b),
  apiPost: (p: string, b: unknown) => apiPost(p, b),
  apiPatch: (p: string, b: unknown) => apiPatch(p, b),
  apiDelete: (p: string, b: unknown) => apiDelete(p, b),
  ApiError: class ApiError extends Error {},
}));

const ALL: Capability[] = ['role.read', 'role.update', 'role.create', 'role.delete',
  'grant.read', 'grant.update'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(<Roles />, { capabilities, path: '/app/roles' });

const openPowers = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('tab', { name: 'Powers' }));
  await screen.findByRole('button', { name: /Tutor: cannot open plithes for answers/i });
};

/** One cell, by the sentence its aria-label makes. */
const cell = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  put = null;
  posted = [];
  grid = [
    { roleId: 'r1', capability: 'grant.update', scope: 'all', effect: 'allow' },
    { roleId: 'r1', capability: 'campaign.launch', scope: 'subtree', effect: 'allow' },
    { roleId: 'r2', capability: 'campaign.close', scope: 'own_unit', effect: 'allow' },
  ];
  warnings = [];
  myPositions = [{ roleId: 'r1', roleName: 'Principal' }];
});

/* ------------------------------------------------------------- the ladder */

describe('the roles tab', () => {
  it('shows the ladder in level order, and the level is the POSITION', async () => {
    mount();
    await screen.findByDisplayValue('Principal');

    const levels = screen.getAllByLabelText(/^Level \d$/).map((node) => node.textContent);
    expect(levels).toEqual(['1', '2', '3']);

    // The "Sees…" line is generated from the ORDER and updates with it (24 §4). It is what
    // an evaluator reads when they ask how permissions work, so it is asserted here as well
    // as in the wizard — one component, two placements, one sentence.
    expect(screen.getByText('Sees everything')).toBeTruthy();
    expect(screen.getByText('Responds only')).toBeTruthy();
  });

  it('sends the ORDER when a role moves, and never a level', async () => {
    mount();
    await screen.findByDisplayValue('Principal');

    fireEvent.click(screen.getByRole('button', { name: 'Move Tutor up' }));
    await waitFor(() => expect(posted).toHaveLength(1));

    const [path, body] = posted[0] as [string, { orderedIds: string[]; level?: number }];
    expect(path).toBe('/roles/reorder');
    expect(body.orderedIds).toEqual(['r2', 'r1', 'r3']);
    // 14 § ReorderRolesBody: a client-supplied level and a client-supplied order can
    // disagree, and when they do one of them is silently wrong.
    expect(body).not.toHaveProperty('level');
  });

  it('will not delete the lowest role', async () => {
    mount();
    await screen.findByDisplayValue('Learner');
    // Everyone who is not given a specific role lands on the bottom one. An org without a
    // floor has "no role at all" as its floor, which grants nothing and looks like a bug.
    // `<RoleRow>` says so in the label rather than only greying the control, which is 24 §4's
    // rule arriving as copy: a disabled button with no reason is indistinguishable from one
    // that is broken.
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: /Learner is the lowest level and cannot be deleted/i,
      }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete Principal' }).disabled)
      .toBe(false);
  });

  it('names the number of PEOPLE before deleting a held role', async () => {
    mount();
    await screen.findByDisplayValue('Tutor');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Tutor' }));

    // The consequence is about humans who have to move, not about a row disappearing.
    expect(await screen.findByText(/4 people hold this role/i)).toBeTruthy();
    // And it cannot be confirmed until somewhere has been chosen for them.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete' }).disabled).toBe(true);
  });

  it('is read-only without role.update', async () => {
    mount(['role.read', 'grant.read']);
    await screen.findByText('Principal');

    expect(screen.queryByRole('button', { name: 'Move Tutor up' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add a role/i })).toBeNull();
    // Present, though. Absent would read as "there are no roles".
    expect(screen.getByText('Tutor')).toBeTruthy();
  });
});

/* --------------------------------------------------------------- the grid */

describe('the powers grid', () => {
  it('renders the row label the SERVER sent, vocabulary and all — D-008', async () => {
    mount();
    await openPowers();

    // "open plithes for answers", never "launch campaigns". The tenant renamed the noun and
    // the row followed it, which is the whole of D-008.
    expect(screen.getByText('open plithes for answers')).toBeTruthy();
    expect(screen.queryByText(/launch campaigns/i)).toBeNull();
  });

  it('cycles a cell through the scopes and stops at nothing', async () => {
    mount();
    await openPowers();

    // `—` → self → own_unit → subtree → all → `—`. Four clicks in and it is the widest.
    fireEvent.click(cell(/Learner: cannot open plithes/i));
    expect(cell(/Learner: may open plithes for answers across only their own/i)).toBeTruthy();

    fireEvent.click(cell(/Learner: may open plithes for answers across only their own/i));
    fireEvent.click(cell(/Learner: may open plithes for answers across their own unit/i));
    fireEvent.click(cell(/Learner: may open plithes for answers across their unit and everything under it/i));
    expect(cell(/Learner: may open plithes for answers across the whole organisation/i)).toBeTruthy();

    fireEvent.click(cell(/Learner: may open plithes for answers across the whole organisation/i));
    expect(cell(/Learner: cannot open plithes/i)).toBeTruthy();
  });

  it('shift-click is a BLOCK, and a plain click does not cycle into one', async () => {
    mount();
    await openPowers();

    fireEvent.click(cell(/Learner: cannot open plithes/i), { shiftKey: true });
    const blocked = cell(/Learner: blocked from “open plithes for answers”/i);
    expect(blocked).toBeTruthy();
    // The one resolution rule an administrator benefits from knowing (INV-004), where they
    // will actually meet it.
    expect(blocked.getAttribute('title')).toMatch(/always beats an allow/i);

    // Cycling THROUGH a deny would arm the grid's most consequential state by accident,
    // four clicks into a scope walk. A plain click clears it instead.
    fireEvent.click(blocked);
    expect(cell(/Learner: cannot open plithes/i)).toBeTruthy();
  });

  it('SAVES A DIFF, not the whole matrix', async () => {
    mount();
    await openPowers();

    fireEvent.click(cell(/Learner: cannot open plithes/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    // ONE cell. `PUT /grants` writes what it is given and leaves the rest alone, so sending
    // the whole matrix would clear `derived` on every row and make the audit entry claim a
    // change nobody made.
    expect(put?.cells).toEqual([
      { roleId: 'r3', capability: 'campaign.launch', scope: 'self', effect: 'allow' },
    ]);
  });

  it('sends scope: null to REMOVE a power, because absence is how removal is expressed', async () => {
    mount();
    await openPowers();

    // Tutor holds campaign.close at own_unit. Cycle it round to nothing.
    fireEvent.click(cell(/Tutor: may close plithes to further answers across their own unit/i));
    fireEvent.click(cell(/Tutor: may close plithes to further answers across their unit and everything under it/i));
    fireEvent.click(cell(/Tutor: may close plithes to further answers across the whole organisation/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put?.cells).toContainEqual(
      expect.objectContaining({ roleId: 'r2', capability: 'campaign.close', scope: null }),
    );
  });

  it('copies a whole column in one action', async () => {
    mount();
    await openPowers();

    fireEvent.change(screen.getByLabelText(/Copy a whole role’s powers/i), {
      target: { value: 'r1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Learner' }));

    // Principal holds grant.update: all and campaign.launch: subtree. Learner now does too.
    expect(cell(/Learner: may open plithes for answers across their unit and everything under it/i)).toBeTruthy();
    expect(cell(/Learner: may change what every role is allowed to do across the whole organisation/i)).toBeTruthy();
  });

  it('undoes the last change', async () => {
    mount();
    await openPowers();

    fireEvent.click(cell(/Learner: cannot open plithes/i));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cell(/Learner: cannot open plithes/i)).toBeTruthy();
    // Back to where it started, so there is nothing to save.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saved' }).disabled).toBe(true);
  });

  it('renders a warning AT THE CELL, not in a list at the bottom', async () => {
    warnings = [{
      kind: 'deny_shadows_allow',
      capability: 'campaign.launch',
      roleId: 'r1',
      message: 'Principal is both allowed and denied “open plithes for answers”. The deny wins.',
    }];
    mount();
    await openPowers();

    // Problem and cure in the same place (customization.md §6). A list at the bottom is the
    // thing people learn to scroll past.
    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/The deny wins/);
    const owner = note.closest('td');
    expect(owner).not.toBeNull();
    expect(owner?.querySelector('button')?.getAttribute('aria-label'))
      .toMatch(/Principal: may open plithes/i);
  });

  it('keeps the working copy when a save is REFUSED', async () => {
    // 33 § States. A refusal here is the lockout guard or WOULD_ESCALATE, and both are
    // sentences the administrator has to act on — throwing their edits away with the message
    // still on screen would make it unusable.
    apiPut.mockRejectedValueOnce(
      new Error('That would leave no role able to change powers, and nobody could undo it.'),
    );
    mount();
    await openPowers();

    fireEvent.click(cell(/Learner: cannot open plithes/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/no role able to change powers/i);
    // The edit is still there.
    expect(cell(/Learner: may open plithes for answers across only their own/i)).toBeTruthy();
  });

  it('WARNS BEFORE you take the grid away from your own role', async () => {
    // 33 § The lockout guard, second paragraph — and the half the SERVER cannot do. It
    // refuses a matrix nobody can administer; handing the grid to somebody else and keeping
    // none is legal, occasionally intended, and still a one-way door for the person pressing
    // the button. Only the client knows which roles the reader holds.
    mount();
    await openPowers();

    fireEvent.click(cell(/Principal: may change what every role is allowed to do across the whole organisation/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/will not be able to edit powers after this/i)).toBeTruthy();
    // Nothing has been sent. Asked BEFORE the request, not after a failure — there is no
    // failure to react to.
    expect(put).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(put).not.toBeNull());
  });

  it('does not warn when the change is to somebody ELSE’s role', async () => {
    mount();
    await openPowers();

    fireEvent.click(cell(/Learner: cannot open plithes/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is READ-ONLY rather than absent without grant.update', async () => {
    mount(['role.read', 'grant.read']);
    fireEvent.click(screen.getByRole('tab', { name: 'Powers' }));
    await screen.findByText('open plithes for answers');

    // Visible, and visibly not editable. An empty screen looks broken; a hidden grid teaches
    // that the rules are secret, on the one page whose claim is that they are not.
    expect((cell(/Tutor: cannot open plithes/i) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByText(/read this grid but not change it/i)).toBeTruthy();
  });

  it('hides the Powers tab entirely without grant.read', async () => {
    mount(['role.read']);
    await screen.findByText('Principal');  // read-only: plain text, not an input
    // Usability, not enforcement (20 §6) — the API returns nothing either way.
    expect(screen.queryByRole('tab', { name: 'Powers' })).toBeNull();
  });
});
