// `/ops/team` through the real store and a stubbed operator API (R-716): the accounts are
// RTK Query's cache, the page's state is `state.opsTeam`, and the new operator's password
// never enters the store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformOperator } from '@endur/shared';
import { errorReply, makeStore, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import { opsSignedIn } from '../../../store/opsSlice.js';
import { redactPasswords, redactSecrets } from '../../../store/devtools.js';
import Team from './index.js';

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn(() => Promise.resolve()) } }));

const me: PlatformOperator = {
  id: 'op1', email: 'owner@endur.test', name: 'Endur Owner', role: 'owner', status: 'active',
  lastLoginAt: '2026-11-27T09:00:00.000Z',
};
const second: PlatformOperator = { ...me, id: 'op2', email: 'owner2@endur.test', name: 'Owner Two' };
const third: PlatformOperator = { ...me, id: 'op3', email: 'owner3@endur.test', name: 'Owner Three' };
const staff: PlatformOperator = {
  ...me, id: 'op4', email: 'support@endur.test', name: 'Endur Support', role: 'staff', lastLoginAt: null,
};

const SECRET = 'otpauth://totp/Endur:new@endur.test?secret=ABCDEF';
const PASSWORD = 'a-long-new-password';

let operators: PlatformOperator[] = [];
let calls: StubCall[] = [];
const server = (routes: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /platform/operators': () => ({ body: { data: operators } }),
    'POST /platform/operators': (call) => {
      const body = call.body as { email: string; name: string; role: 'owner' | 'staff' };
      const made = { ...staff, id: 'op9', email: body.email, name: body.name, role: body.role };
      operators = [...operators, made];
      return { status: 201, body: { data: { ...made, otpauthUrl: SECRET } } };
    },
    'PATCH /platform/operators/*': (call) => {
      const id = call.path.split('/').pop();
      const patch = call.body as Partial<PlatformOperator>;
      operators = operators.map((row) => (row.id === id ? { ...row, ...patch } : row));
      return { body: { data: operators.find((row) => row.id === id) } };
    },
    ...routes,
  });
};

const render = () => {
  const store = makeStore();
  store.dispatch(opsSignedIn({
    operator: { id: me.id, name: me.name, email: me.email, role: 'owner' },
    capabilities: ['platform.operator.manage'],
  }));
  return renderWithProviders(<Team />, { path: '/ops/team' }, store);
};

beforeEach(() => {
  operators = [me, second, staff];
  server();
});
afterEach(() => vi.unstubAllGlobals());

const row = (name: RegExp | string) => {
  const table = screen.getByRole('table', { name: 'Operators' });
  return within(table).getByText(name).closest('tr') as HTMLElement;
};

describe('the team list', () => {
  it('never offers to change your own account, nor to drop below two owners', async () => {
    render();
    await screen.findByText('Owner Two');
    expect(row(/Endur Owner \(you\)/).textContent).toContain('You cannot change your own account.');
    expect(row('Owner Two').textContent).toContain('at least two owners');
    expect(within(row('Endur Support')).getByRole('button', { name: 'Make owner' })).toBeTruthy();
  });

  it('with a third owner, an owner can step down', async () => {
    operators = [me, second, third, staff];
    render();
    await screen.findByText('Owner Two');
    expect(within(row('Owner Two')).getByRole('button', { name: 'Make staff' })).toBeTruthy();
  });

  it('asks before a change, then makes it and the list re-reads', async () => {
    render();
    await screen.findByText('Endur Support');
    fireEvent.click(within(row('Endur Support')).getByRole('button', { name: 'Disable' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Change Endur Support?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'disabled' }));
    expect(await screen.findByText('Endur Support is now disabled.')).toBeTruthy();
    await waitFor(() => expect(within(row('Endur Support')).getByRole('button', { name: 'Enable' })).toBeTruthy());
  });

  it('a refused change says why', async () => {
    server({ 'PATCH /platform/operators/*': errorReply(409, 'CONFLICT', 'That would leave the platform with a single owner.') });
    render();
    await screen.findByText('Endur Support');
    fireEvent.click(within(row('Endur Support')).getByRole('button', { name: 'Make owner' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Make owner' }));
    expect((await screen.findByRole('alert')).textContent).toContain('single owner');
  });
});

describe('adding an operator', () => {
  const open = async () => {
    const view = render();
    await screen.findByText('Endur Support');
    fireEvent.click(screen.getByRole('button', { name: 'Add operator' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an operator' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New Person' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'new@endur.test' } });
    return { ...view, dialog };
  };

  it('waits for a long enough password; the password itself is never in the store', async () => {
    const { dialog, store } = await open();
    const password = within(dialog).getByLabelText('Password');
    const submit = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Add operator' });

    fireEvent.change(password, { target: { value: 'short' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(password, { target: { value: PASSWORD } });
    expect(submit.disabled).toBe(false);
    expect(JSON.stringify(store.getState())).not.toContain(PASSWORD);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Owner' }));
    act(() => {
      fireEvent.submit(dialog);
    });
    await waitFor(() => expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      email: 'new@endur.test', name: 'New Person', password: PASSWORD, role: 'owner',
    }));
    expect(JSON.stringify(store.getState())).not.toContain(PASSWORD);
  });

  it('shows the authenticator code once, redacted from DevTools, and "Done" drops it', async () => {
    const { dialog, store } = await open();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: PASSWORD } });
    act(() => {
      fireEvent.submit(dialog);
    });
    const created = await screen.findByRole('region', { name: /New Person can sign in/ });
    expect(created.textContent).toContain(SECRET);
    // What DevTools would be shown: the secret blanked in the state and in the action.
    expect(JSON.stringify(redactSecrets(store.getState()))).not.toContain(SECRET);
    expect(JSON.stringify(redactPasswords({
      type: 'opsTeam/operatorAdded/fulfilled', payload: { otpauthUrl: SECRET }, meta: { arg: { password: PASSWORD } },
    }))).not.toMatch(/ABCDEF|a-long-new-password/);
    // The list re-read and has them.
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Operators' })).getByText('New Person')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Done, they have it' }));
    expect(screen.queryByRole('region', { name: /New Person can sign in/ })).toBeNull();
    expect(JSON.stringify(store.getState())).not.toContain(SECRET);
  });

  it('a refused address says why and keeps the form', async () => {
    server({ 'POST /platform/operators': errorReply(409, 'CONFLICT', 'That address already has an operator account.') });
    const { dialog } = await open();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: PASSWORD } });
    act(() => {
      fireEvent.submit(dialog);
    });
    expect((await within(dialog).findByRole('alert')).textContent).toContain('already has an operator account');
    expect(within(dialog).getByLabelText<HTMLInputElement>('Name').value).toBe('New Person');
  });
});

describe('without the capability', () => {
  it('a 403 is the access screen', async () => {
    server({ 'GET /platform/operators': errorReply(403, 'FORBIDDEN', 'Owner only.') });
    render();
    expect(await screen.findByText('platform.operator.manage')).toBeTruthy();
  });
});
