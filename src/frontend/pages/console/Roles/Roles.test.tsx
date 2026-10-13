import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  Capability, CapabilityMeta, GrantCell, GrantWarning, PutGrantsBody, RoleView,
} from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../../test-utils.js';
import Roles from './index.js';

const roles: RoleView[] = [
  { id: 'r1', name: 'Principal', level: 1, peopleCount: 1, grantCount: 20 },
  { id: 'r2', name: 'Tutor', level: 2, peopleCount: 4, grantCount: 8 },
  { id: 'r3', name: 'Learner', level: 3, peopleCount: 40, grantCount: 2 },
];

const catalogue: CapabilityMeta[] = [
  { key: 'grant.update', module: 'Powers', phase: 'P2', label: 'change what every role is allowed to do' },
  { key: 'campaign.launch', module: 'Campaigns', phase: 'P2', label: 'open plithes for answers' },
  { key: 'campaign.close', module: 'Campaigns', phase: 'P2', label: 'close plithes to further answers' },
  { key: 'apikey.create', module: 'Platform', phase: 'P3', label: 'issue an api key' },
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
  renderWithProviders(<Roles />, { capabilities, labels: NONSENSE_LABELS, path: '/app/roles' });

const openPowers = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('tab', { name: 'Powers' }));
  await screen.findByRole('combobox', { name: /Tutor: cannot open plithes for answers/i });
};

const cell = (name: RegExp) => screen.getByRole<HTMLSelectElement>('combobox', { name });

const choose = (name: RegExp, option: string): void => {
  fireEvent.change(cell(name), { target: { value: option } });
};

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

describe('the roles tab', () => {
  it('shows the ladder in level order, and the level is the POSITION', async () => {
    mount();
    await screen.findByDisplayValue('Principal');

    const levels = screen.getAllByLabelText(/^Level \d$/).map((node) => node.textContent);
    expect(levels).toEqual(['1', '2', '3']);

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
    expect(body).not.toHaveProperty('level');
  });

  it('will not delete the lowest role', async () => {
    mount();
    await screen.findByDisplayValue('Learner');
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

    expect(await screen.findByText(/4 people hold this role/i)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete' }).disabled).toBe(true);
  });

  it('is read-only without role.update', async () => {
    mount(['role.read', 'grant.read']);
    await screen.findByText('Principal');

    expect(screen.queryByRole('button', { name: 'Move Tutor up' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add a role/i })).toBeNull();
    expect(screen.getByText('Tutor')).toBeTruthy();
  });
});

describe('the powers grid', () => {
  it('renders the row label the SERVER sent, vocabulary and all — D-008', async () => {
    mount();
    await openPowers();

    expect(screen.getByText('open plithes for answers')).toBeTruthy();
    expect(screen.queryByText(/launch campaigns/i)).toBeNull();
  });

  it('says what a cell means IN WORDS, in the tenant’s vocabulary — DEC-076', async () => {
    mount();
    await openPowers();

    const tutor = cell(/Tutor: may close plithes to further answers, only in their own zblorn/i);
    expect(tutor.value).toBe('own_unit');
    expect([...tutor.options].map((option) => option.text)).toEqual([
      'No', 'Themselves', 'Their zblorn', 'Their zblorn + below', 'Everywhere', 'Blocked',
    ]);
    expect(screen.queryByText('tree')).toBeNull();
  });

  it('explains all six choices ONCE, at the top, rather than in tooltips', async () => {
    mount();
    await openPowers();

    expect(screen.getByText('in their own zblorn and every zblorn under it')).toBeTruthy();
    expect(
      screen.getByText(/never — this beats an allow from any other role, group or stand-in/i),
    ).toBeTruthy();
  });

  it('sets a cell from the dropdown, in one action', async () => {
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'all');
    expect(cell(/Learner: may open plithes for answers, anywhere in the organisation/i)).toBeTruthy();

    choose(/Learner: may open plithes for answers, anywhere in the organisation/i, 'none');
    expect(cell(/Learner: cannot open plithes/i)).toBeTruthy();
  });

  it('a BLOCK is one of the six choices, and says why it is different', async () => {
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'blocked');
    const blocked = cell(/Learner: blocked from “open plithes for answers”/i);
    expect(blocked.getAttribute('title')).toMatch(/beats an allow from any other role/i);
  });

  it('sets a whole row for every role from a visible control', async () => {
    mount();
    await openPowers();

    fireEvent.change(
      screen.getByRole('combobox', { name: /Set “open plithes for answers” for every role at once/i }),
      { target: { value: 'own_unit' } },
    );
    expect(cell(/Principal: may open plithes for answers, only in their own zblorn/i)).toBeTruthy();
    expect(cell(/Learner: may open plithes for answers, only in their own zblorn/i)).toBeTruthy();
  });

  it('SAVES A DIFF, not the whole matrix', async () => {
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'self');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put?.cells).toEqual([
      { roleId: 'r3', capability: 'campaign.launch', scope: 'self', effect: 'allow' },
    ]);
  });

  it('sends scope: null to REMOVE a power, because absence is how removal is expressed', async () => {
    mount();
    await openPowers();

    choose(/Tutor: may close plithes to further answers, only in their own zblorn/i, 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put?.cells).toContainEqual(
      expect.objectContaining({ roleId: 'r2', capability: 'campaign.close', scope: null }),
    );
  });

  it('copies a whole column — two dropdowns and a button, not a row of buttons', async () => {
    mount();
    await openPowers();

    fireEvent.change(screen.getByLabelText(/Copy every power from/i), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(/^onto$/i), { target: { value: 'r3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(cell(/Learner: may open plithes for answers, in their own zblorn and every zblorn under it/i)).toBeTruthy();
    expect(cell(/Learner: may change what every role is allowed to do, anywhere in the organisation/i)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Copied Principal’s powers onto Learner/);
  });

  it('undoes the last change', async () => {
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'self');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cell(/Learner: cannot open plithes/i)).toBeTruthy();
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

    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/The deny wins/);
    const owner = note.closest('td');
    expect(owner).not.toBeNull();
    expect(owner?.querySelector('select')?.getAttribute('aria-label'))
      .toMatch(/Principal: may open plithes/i);
  });

  it('keeps the working copy when a save is REFUSED', async () => {
    apiPut.mockRejectedValueOnce(
      new Error('That would leave no role able to change powers, and nobody could undo it.'),
    );
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'self');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/no role able to change powers/i);
    expect(cell(/Learner: may open plithes for answers, only where it is about them/i)).toBeTruthy();
  });

  it('WARNS BEFORE you take the grid away from your own role', async () => {
    mount();
    await openPowers();

    choose(/Principal: may change what every role is allowed to do, anywhere in the organisation/i, 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/will not be able to edit powers after this/i)).toBeTruthy();
    expect(put).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(put).not.toBeNull());
  });

  it('does not warn when the change is to somebody ELSE’s role', async () => {
    mount();
    await openPowers();

    choose(/Learner: cannot open plithes/i, 'self');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is READ-ONLY rather than absent without grant.update', async () => {
    mount(['role.read', 'grant.read']);
    fireEvent.click(screen.getByRole('tab', { name: 'Powers' }));
    await screen.findByText('open plithes for answers');

    expect(screen.queryByRole('combobox', { name: /Tutor: cannot open plithes/i })).toBeNull();
    expect(screen.getByLabelText(/Tutor: cannot open plithes/i).textContent).toBe('No');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByText(/read this grid but not change it/i)).toBeTruthy();
  });

  it('does not offer a choice on a power that is not built yet', async () => {
    mount();
    await openPowers();

    expect(screen.getByText('issue an api key')).toBeTruthy();
    expect(screen.getByTitle(/is not built yet/i)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /issue an api key/i })).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: /Set .issue an api key. for every role/i }),
    ).toBeNull();

    expect(cell(/Tutor: cannot open plithes for answers/i)).toBeTruthy();
  });

  it('counts what each role holds, so two columns can be compared without eyeballing them', async () => {
    mount();
    await openPowers();

    expect(screen.getByText('2 of 4 powers')).toBeTruthy();
    expect(screen.getAllByText('1 of 4 powers')).toHaveLength(1);
    expect(screen.getAllByText('0 of 4 powers')).toHaveLength(1);
  });

  it('sizes every cell to the longest phrase THIS organisation produces', async () => {
    mount();
    await openPowers();

    const table = document.querySelector('.powers-table') as HTMLElement;
    const longest = 'Their zblorn + below'.length;
    expect(table.style.getPropertyValue('--cell-ch')).toBe(String(longest));
  });

  it('hides the Powers tab entirely without grant.read', async () => {
    mount(['role.read']);
    await screen.findByText('Principal');  // read-only: plain text, not an input
    expect(screen.queryByRole('tab', { name: 'Powers' })).toBeNull();
  });
});
