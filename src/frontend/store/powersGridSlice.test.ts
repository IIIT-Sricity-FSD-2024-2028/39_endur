// R-407: the powers grid's working copy. Reducers first, pure; then the two things that
// need the store: a matrix arriving from the server, and a save.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GrantCell } from '@endur/shared';
import { setupStore } from './index.js';
import { signedOut } from './authSlice.js';
import { api } from './api/api.js';
import { rolesApi } from './api/endpoints/roles.js';
import {
  HISTORY_LIMIT,
  cellKey,
  cellSet,
  diffCells,
  powersGridSlice,
  rowFilled,
  saveGrid,
  selectGridCanUndo,
  selectGridDirty,
  selectPowersGrid,
  toMatrix,
  undone,
  type PowersGridState,
} from './powersGridSlice.js';
import { errorReply, heldReply, stubApi } from '../test-utils.js';

const allow = (roleId: string, capability: string, scope: GrantCell['scope'] = 'all'): GrantCell =>
  ({ roleId, capability, scope, effect: 'allow' });

const reduce = powersGridSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });

/** A grid already holding `cells`, saved and unedited. */
const loaded = (cells: GrantCell[]): PowersGridState => {
  const matrix = toMatrix(cells);
  return { ...initial, loaded: true, saved: matrix, cells: matrix };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editing the working copy', () => {
  it('sets one cell, and a block is stored as a deny at `all`', () => {
    let state = reduce(loaded([]), cellSet({ roleId: 'r1', capability: 'c.x', choice: 'own_unit' }));
    expect(state.cells[cellKey('r1', 'c.x')]).toEqual(allow('r1', 'c.x', 'own_unit'));

    state = reduce(state, cellSet({ roleId: 'r1', capability: 'c.x', choice: 'blocked' }));
    // A deny at a narrower scope would leave the wider part of the tree allowed.
    expect(state.cells[cellKey('r1', 'c.x')]).toMatchObject({ scope: 'all', effect: 'deny' });

    state = reduce(state, cellSet({ roleId: 'r1', capability: 'c.x', choice: null }));
    expect(cellKey('r1', 'c.x') in state.cells).toBe(false);
  });

  it('fills a row for EVERY role in the list, including one that holds nothing yet', () => {
    const state = reduce(
      loaded([allow('r1', 'a')]),
      rowFilled({ capability: 'a', choice: 'subtree', roleIds: ['r1', 'r2', 'r3'] }),
    );
    // r3 had no cells at all: deriving the columns from the cells would have skipped it.
    expect(['r1', 'r2', 'r3'].map((id) => state.cells[cellKey(id, 'a')]?.scope)).toEqual([
      'subtree', 'subtree', 'subtree',
    ]);
  });

  it('undoes step by step, back to where it started, and keeps at most HISTORY_LIMIT steps', () => {
    let state = loaded([]);
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      state = reduce(state, cellSet({ roleId: 'r1', capability: `c.${i}`, choice: 'all' }));
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);

    state = reduce(state, undone());
    expect(`r1|c.${HISTORY_LIMIT + 4}` in state.cells).toBe(false);
    expect(`r1|c.${HISTORY_LIMIT + 3}` in state.cells).toBe(true);
  });

  it('an edit clears the last save error: the sentence was about the old working copy', () => {
    const refused = { ...loaded([]), saveError: 'Nobody could edit powers after this.' };
    expect(reduce(refused, cellSet({ roleId: 'r1', capability: 'a', choice: 'all' })).saveError).toBeNull();
  });
});

describe('the diff a save sends', () => {
  it('only what changed, and a removal as `scope: null`', () => {
    const saved = toMatrix([allow('r1', 'a'), allow('r1', 'b'), allow('r2', 'c', 'self')]);
    const cells = toMatrix([allow('r1', 'a'), allow('r2', 'c', 'subtree'), allow('r3', 'd')]);
    expect(diffCells(saved, cells)).toEqual([
      allow('r2', 'c', 'subtree'),
      allow('r3', 'd'),
      { ...allow('r1', 'b'), scope: null },
    ]);
  });

  it('is dirty exactly while there is something to send', () => {
    const grid = loaded([allow('r1', 'a')]);
    const root = (state: PowersGridState) => ({ powersGrid: state }) as never;
    expect(selectGridDirty(root(grid))).toBe(false);

    const edited = reduce(grid, cellSet({ roleId: 'r1', capability: 'a', choice: null }));
    expect(selectGridDirty(root(edited))).toBe(true);
    expect(selectGridCanUndo(root(edited))).toBe(true);

    // Setting it back by hand is not a change, whatever the undo stack says.
    const back = reduce(edited, cellSet({ roleId: 'r1', capability: 'a', choice: 'all' }));
    expect(selectGridDirty(root(back))).toBe(false);
  });
});

describe('a matrix arriving from the server', () => {
  it('replaces an unedited working copy, and REBASES an edited one', async () => {
    let server = [allow('r1', 'a'), allow('r2', 'b')];
    stubApi({ 'GET /grants': () => ({ body: { data: server } }) });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    expect(selectPowersGrid(store.getState()).cells).toEqual(toMatrix(server));

    // Mine: a new power for r3. Meanwhile somebody else, elsewhere, narrows r2's.
    store.dispatch(cellSet({ roleId: 'r3', capability: 'c', choice: 'self' }));
    server = [allow('r1', 'a'), allow('r2', 'b', 'own_unit')];
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false, forceRefetch: true }));

    const grid = selectPowersGrid(store.getState());
    expect(grid.cells['r3|c']?.scope).toBe('self'); // my edit survived the re-read
    expect(grid.cells['r2|b']?.scope).toBe('own_unit'); // and did not undo theirs
    // Undo still goes back to the server's state as it is NOW, not as it was.
    store.dispatch(undone());
    expect(selectPowersGrid(store.getState()).cells).toEqual(toMatrix(server));
  });

  it('a deleted role takes its unsaved edits with it, so the next save is not refused', async () => {
    stubApi({
      'GET /grants': { body: { data: [allow('r1', 'a')] } },
      'DELETE /roles/r2': { body: { data: { ok: true } } },
    });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    store.dispatch(cellSet({ roleId: 'r2', capability: 'a', choice: 'all' }));
    store.dispatch(cellSet({ roleId: 'r1', capability: 'b', choice: 'self' }));

    await store.dispatch(rolesApi.endpoints.deleteRole.initiate({ id: 'r2' }, { track: false }));

    const grid = selectPowersGrid(store.getState());
    expect(diffCells(grid.saved, grid.cells)).toEqual([allow('r1', 'b', 'self')]);
    expect(grid.past.some((step) => 'r2|a' in step)).toBe(false);
  });

  it('is cleared with the cache: sign-out, or another organisation', () => {
    const edited = reduce(loaded([allow('r1', 'a')]), cellSet({ roleId: 'r1', capability: 'a', choice: null }));
    expect(reduce(edited, signedOut())).toEqual(initial);
    expect(reduce(edited, api.util.resetApiState())).toEqual(initial);
  });
});

describe('saving', () => {
  it('sends the diff, takes the server\'s matrix as the new baseline, and ends the undo stack there', async () => {
    const calls = stubApi({
      'GET /grants': { body: { data: [allow('r1', 'a')] } },
      'PUT /grants': { body: { data: [allow('r1', 'a'), allow('r2', 'a', 'self')] } },
    });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    store.dispatch(cellSet({ roleId: 'r2', capability: 'a', choice: 'self' }));

    await store.dispatch(saveGrid());

    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ cells: [allow('r2', 'a', 'self')] });
    const grid = selectPowersGrid(store.getState());
    expect(grid.saving).toBe(false);
    expect(grid.past).toEqual([]);
    expect(selectGridDirty(store.getState())).toBe(false);
  });

  it('a REFUSED save keeps every edit, and the server\'s sentence', async () => {
    stubApi({
      'GET /grants': { body: { data: [allow('r1', 'grant.update')] } },
      'PUT /grants': errorReply(409, 'CONFLICT', 'Nobody could edit powers after this.'),
    });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    store.dispatch(cellSet({ roleId: 'r1', capability: 'grant.update', choice: null }));

    await store.dispatch(saveGrid());

    const grid = selectPowersGrid(store.getState());
    expect(grid.saveError).toBe('Nobody could edit powers after this.');
    expect('r1|grant.update' in grid.cells).toBe(false);
    expect(grid.past).toHaveLength(1); // the edit can still be undone
  });

  it('an edit made WHILE the save is in flight is not lost, and is still unsaved after it', async () => {
    const reply = heldReply({ body: { data: [allow('r1', 'a'), allow('r2', 'a')] } });
    stubApi({
      'GET /grants': { body: { data: [allow('r1', 'a')] } },
      'PUT /grants': () => reply.promise,
    });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    store.dispatch(cellSet({ roleId: 'r2', capability: 'a', choice: 'all' }));

    const saving = store.dispatch(saveGrid());
    store.dispatch(cellSet({ roleId: 'r3', capability: 'a', choice: 'self' }));
    // A second save while one is in flight is not sent.
    await store.dispatch(saveGrid());
    reply.release();
    await saving;

    const grid = selectPowersGrid(store.getState());
    expect(grid.cells['r3|a']?.scope).toBe('self');
    expect(diffCells(grid.saved, grid.cells)).toEqual([allow('r3', 'a', 'self')]);
  });

  it('sends nothing when there is nothing to send', async () => {
    const calls = stubApi({ 'GET /grants': { body: { data: [allow('r1', 'a')] } } });
    const store = setupStore();
    await store.dispatch(rolesApi.endpoints.getGrants.initiate(undefined, { subscribe: false }));
    await store.dispatch(saveGrid());
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });
});
