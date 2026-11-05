// R-402: the unit tree on RTK Query, run for real over a stubbed `fetch`. Every page test
// mocks `useUnits`; this is what runs underneath them.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitComposition, UnitNode } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, heldReply, stubApi, type StubCall } from '../test-utils.js';
import { ApiError } from './api.js';
import { useUnitComposition, useUnits } from './units.js';

const node = (id: string, name: string, children: UnitNode[] = []): UnitNode =>
  ({ id, name, parentId: null, isTemporary: false, endsAt: null, children } as unknown as UnitNode);
const tree = (rootName = 'Faculty') => ({
  body: {
    data: [node('u1', rootName, [node('u2', 'Ward 4')])],
    meta: { people: 12, subjects: 3, units: 2 },
  },
});

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

const gets = (calls: StubCall[]) => calls.filter((call) => call.method === 'GET' && call.path === '/units');
const childName = (nodes: UnitNode[] | null) => nodes?.[0]?.children[0]?.name;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useUnits', () => {
  it('a dozen screens, one request: every reader shares the cache entry', async () => {
    const calls = stubApi({ 'GET /units': tree() });
    // The People page: the list, the import wizard and the person panel, all at once.
    const { result } = render(() => [useUnits(), useUnits(), useUnits()]);
    await waitFor(() => expect(result.current.every((units) => units.data !== null)).toBe(true));

    expect(gets(calls)).toHaveLength(1);
    expect(result.current[0]?.totals).toEqual({ people: 12, subjects: 3, units: 2 });
  });

  it('a rename shows at once, before the server answers', async () => {
    const reply = heldReply({ body: { data: node('u2', 'Ward Four') } });
    const calls = stubApi({ 'GET /units': tree(), 'PATCH /units/u2': () => reply.promise });
    const { result } = render(() => useUnits());
    await waitFor(() => expect(childName(result.current.data)).toBe('Ward 4'));

    let renamed!: Promise<void>;
    act(() => { renamed = result.current.rename('u2', 'Ward Four'); });

    // Still waiting on the server, and the tree already says it.
    await waitFor(() => expect(childName(result.current.data)).toBe('Ward Four'));
    reply.release();
    await act(async () => { await renamed; });
    // Nothing else in the tree changed, so it is not re-read.
    expect(gets(calls)).toHaveLength(1);
  });

  it('a refused rename puts the old name back, and throws the server\'s reason', async () => {
    stubApi({
      'GET /units': tree(),
      'PATCH /units/u2': errorReply(409, 'CONFLICT', 'A unit with that name already exists here.'),
    });
    const { result } = render(() => useUnits());
    await waitFor(() => expect(childName(result.current.data)).toBe('Ward 4'));

    let failure: unknown;
    await act(async () => {
      failure = await result.current.rename('u2', 'Ward 5').catch((error: unknown) => error);
    });

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe('A unit with that name already exists here.');
    await waitFor(() => expect(childName(result.current.data)).toBe('Ward 4'));
  });

  it('a move is NOT optimistic: it resolves with the server\'s re-read tree in place', async () => {
    let moved = false;
    const calls = stubApi({
      'GET /units': () => (moved
        ? { body: { data: [node('u1', 'Faculty'), node('u2', 'Ward 4')], meta: { people: 12, subjects: 3, units: 2 } } }
        : tree()),
      'POST /units/u2/reparent': () => {
        moved = true;
        return { body: { data: { ok: true } } };
      },
    });
    const { result } = render(() => useUnits());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => { await result.current.reparent('u2', null); });

    expect(result.current.data?.map((unit) => unit.id)).toEqual(['u1', 'u2']);
    expect(gets(calls)).toHaveLength(2);
  });

  it('keeps the last good tree on screen when a re-read fails, with the error beside it', async () => {
    stubApi({
      'GET /units': (_call, count) => (count === 1 ? tree() : errorReply(500, 'INTERNAL', 'Down.')),
    });
    const { result } = render(() => useUnits());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => { await result.current.reload(); });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useUnitComposition', () => {
  const composition = (people: number) =>
    ({ body: { data: { people, byRole: [] } as unknown as UnitComposition } });

  it('asks for nothing until a unit is selected, and is not loading meanwhile', () => {
    const calls = stubApi({});
    const { result } = render(() => useUnitComposition(null));
    expect(result.current).toEqual({ data: null, loading: false, error: null });
    expect(calls).toHaveLength(0);
  });

  it('never shows one unit\'s breakdown while another\'s loads', async () => {
    stubApi({
      'GET /units/u1/composition': composition(12),
      'GET /units/u2/composition': composition(5),
    });
    const store = setupStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, rerender } = renderHook(({ id }: { id: string }) => useUnitComposition(id), {
      wrapper,
      initialProps: { id: 'u1' },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    rerender({ id: 'u2' });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).not.toBeNull());
  });
});
