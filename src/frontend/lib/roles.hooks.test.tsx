// R-403: roles and the powers grid on RTK Query, run for real over a stubbed `fetch`.
//
// The first test is the acceptance item this stage exists for (`23` §6): a grant edit
// reaches the signed-in user's OWN capabilities, with no reload.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capability, GrantCell, RoleView } from '@endur/shared';
import { setupStore, type AppStore } from '../store/index.js';
import { meFixture, stubApi, type StubCall } from '../test-utils.js';
import { useCan } from './capabilities.js';
import { useBootSession } from './session.js';
import { usePowersGrid, useRoleLadder, useRoles } from './roles.js';

const role = (id: string, name: string, level: number): RoleView =>
  ({ id, name, level, peopleCount: 0, grantCount: 0 });
const allow = (roleId: string, capability: string): GrantCell =>
  ({ roleId, capability, scope: 'all', effect: 'allow' });

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

const gets = (calls: StubCall[], path: string) =>
  calls.filter((call) => call.method === 'GET' && call.path === path);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('R-403: a grant edit reaches the signed-in user\'s own powers, with no reload', () => {
  it('saving the grid re-reads /auth/me, and the nav\'s `can()` follows', async () => {
    // The signed-in administrator holds role r1. The server's answer to /auth/me is
    // computed from the grid, as it is for real.
    let grid: GrantCell[] = [allow('r1', 'grant.update')];
    const mine = () => grid.filter((cell) => cell.roleId === 'r1').map((cell) => cell.capability as Capability);
    const calls = stubApi({
      'GET /auth/me': () => ({ body: meFixture({ capabilities: mine() }) }),
      'GET /authz/capabilities': { body: { data: [] } },
      'GET /roles': { body: { data: [role('r1', 'Principal', 1)] } },
      'GET /grants': () => ({ body: { data: grid } }),
      'GET /grants/warnings': { body: { data: [] } },
      'PUT /grants': (call) => {
        grid = [...grid, ...(call.body as { cells: GrantCell[] }).cells];
        return { body: { data: grid } };
      },
    });

    // The app shell (its one live /auth/me subscription), the Roles page's grid, and the
    // nav's capability check, all on one store.
    const { result } = render(() => {
      useBootSession();
      return { grid: usePowersGrid(), can: useCan() };
    });
    await waitFor(() => expect(result.current.grid.state).not.toBeNull());
    expect(result.current.can('campaign.launch')).toBe(false);

    // The administrator gives their own role a power, and saves.
    act(() => result.current.grid.setCell('r1', 'campaign.launch', 'all'));
    await act(async () => { await result.current.grid.save(); });

    await waitFor(() => expect(result.current.can('campaign.launch')).toBe(true));
    expect(gets(calls, '/auth/me')).toHaveLength(2);
  });

  it('a rename does NOT re-read /auth/me: nobody\'s powers moved', async () => {
    const calls = stubApi({
      'GET /auth/me': { body: meFixture() },
      'GET /roles': { body: { data: [role('r1', 'Principal', 1)] } },
      'PATCH /roles/r1': { body: { data: role('r1', 'Head', 1) } },
    });
    const { result } = render(() => {
      useBootSession();
      return useRoleLadder();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await waitFor(() => expect(gets(calls, '/auth/me')).toHaveLength(1));

    await act(async () => { await result.current.rename('r1', 'Head'); });

    expect(gets(calls, '/auth/me')).toHaveLength(1);
  });
});

describe('useRoleLadder: each command resolves once the new list is on screen', () => {
  it('reorder() takes the server\'s own re-read into the cache, with no second request', async () => {
    const before = [role('r1', 'Principal', 1), role('r2', 'Tutor', 2)];
    const after = [role('r2', 'Tutor', 1), role('r1', 'Principal', 2)];
    const calls = stubApi({
      'GET /roles': { body: { data: before } },
      'POST /roles/reorder': { body: { data: after } },
    });
    const { result } = render(() => useRoleLadder());
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    await act(async () => { await result.current.reorder(['r2', 'r1']); });

    // The levels on screen are the server's: derived from the order, never sent.
    expect(result.current.data?.map((row) => [row.id, row.level])).toEqual([['r2', 1], ['r1', 2]]);
    expect(gets(calls, '/roles')).toHaveLength(1);
  });

  it('create() resolves after the list is re-read, and re-reads it once', async () => {
    let list = [role('r1', 'Principal', 1)];
    const calls = stubApi({
      'GET /roles': () => ({ body: { data: list } }),
      'POST /roles': () => {
        list = [...list, role('r2', 'Visitor', 2)];
        return { status: 201, body: { data: role('r2', 'Visitor', 2) } };
      },
    });
    const { result } = render(() => useRoleLadder());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => { await result.current.create('Visitor'); });

    expect(result.current.data?.map((row) => row.name)).toEqual(['Principal', 'Visitor']);
    expect(gets(calls, '/roles')).toHaveLength(2);
  });

  it('a rename on the ladder is in every other `useRoles()` on screen', async () => {
    let name = 'Principal';
    stubApi({
      'GET /roles': () => ({ body: { data: [role('r1', name, 1)] } }),
      'PATCH /roles/r1': () => {
        name = 'Head';
        return { body: { data: role('r1', name, 1) } };
      },
    });
    // The People page's position picker reads the same cache entry.
    const { result } = render(() => ({ ladder: useRoleLadder(), picker: useRoles() }));
    await waitFor(() => expect(result.current.picker.data?.[0]?.name).toBe('Principal'));

    await act(async () => { await result.current.ladder.rename('r1', 'Head'); });

    expect(result.current.picker.data?.[0]?.name).toBe('Head');
  });
});

describe('usePowersGrid: the working copy outlives the page', () => {
  it('unsaved edits are still there after leaving the page and coming back', async () => {
    stubApi({
      'GET /authz/capabilities': { body: { data: [] } },
      'GET /roles': { body: { data: [role('r1', 'Principal', 1), role('r2', 'Tutor', 2)] } },
      'GET /grants': { body: { data: [allow('r1', 'grant.update')] } },
      'GET /grants/warnings': { body: { data: [] } },
    });
    const store = setupStore();
    const first = render(() => usePowersGrid(), store);
    await waitFor(() => expect(first.result.current.state).not.toBeNull());
    act(() => first.result.current.setCell('r2', 'campaign.close', 'own_unit'));
    first.unmount();

    // A look at another page, and back. The grid re-reads the server on the way in.
    const again = render(() => usePowersGrid(), store);
    expect(again.result.current.state?.cells.get('r2|campaign.close')?.scope).toBe('own_unit');
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(again.result.current.dirty).toBe(true);
    expect(again.result.current.state?.cells.get('r2|campaign.close')?.scope).toBe('own_unit');
    expect(again.result.current.canUndo).toBe(true);
  });
});
