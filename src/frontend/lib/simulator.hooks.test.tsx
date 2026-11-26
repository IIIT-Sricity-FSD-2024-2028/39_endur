// R-406: the simulator and the activation link on RTK Query, over a stubbed `fetch`. Running a
// simulation is the `simulationRun` thunk (store/screens/simulator.ts), tested here against
// the store; the page is pages/console/Simulator.test.tsx.
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionView } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { selectSimulator, simulationRun, type SimulationQuery } from '../store/screens/simulator.js';
import { errorReply, stubApi } from '../test-utils.js';
import { useActivationPreview } from './accounts.js';
import { usePowersGrid } from './roles.js';
import { useCapabilityCatalogue } from './simulator.js';

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

const query: SimulationQuery = { principalUserId: 'p1', capability: 'campaign.launch', target: { kind: 'org' } };
const labels = { principalName: 'Amara', targetLabel: 'Ward 4', capabilityLabel: 'open plithes' };
const decision = (allowed: boolean) => ({ body: { data: { allowed } as unknown as DecisionView } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('simulationRun', () => {
  it('asks the server every time, and keeps the last five, newest first', async () => {
    let allowed = false;
    const calls = stubApi({ 'POST /authz/simulate': () => decision(allowed) });
    const store = setupStore();

    for (let run = 0; run < 6; run += 1) {
      allowed = run % 2 === 1;
      await store.dispatch(simulationRun({ query, labels }));
    }

    // The same question, asked again after a grant edit, must be ASKED again: never cached.
    expect(calls).toHaveLength(6);
    const { history, running } = selectSimulator(store.getState());
    expect(history).toHaveLength(5);
    expect(history[0]?.decision).toEqual({ allowed: true });
    expect(history[0]).toMatchObject({ principalName: 'Amara', query });
    expect(running).toBe(false);
  });

  it('sends a date as the request\'s instant, and keeps the plain string', async () => {
    const calls = stubApi({ 'POST /authz/simulate': () => decision(true) });
    const store = setupStore();
    await store.dispatch(simulationRun({ query: { ...query, at: '2026-12-01' }, labels }));
    expect((calls[0]?.body as { at: string }).at).toBe(new Date('2026-12-01').toISOString());
    expect(selectSimulator(store.getState()).history[0]?.query.at).toBe('2026-12-01');
  });

  it('keeps a failure, and adds nothing to the history', async () => {
    stubApi({ 'POST /authz/simulate': errorReply(409, 'CONFLICT', 'That person holds no position.') });
    const store = setupStore();
    await store.dispatch(simulationRun({ query, labels }));
    const { error, history } = selectSimulator(store.getState());
    expect(error).toMatchObject({ status: 409, message: 'That person holds no position.' });
    expect(history).toEqual([]);
  });
});

describe('useCapabilityCatalogue', () => {
  it('is the powers grid\'s own cache entry: two pages, one request', async () => {
    const calls = stubApi({
      'GET /authz/capabilities': { body: { data: [{ key: 'a.b', module: 'A', label: 'do a', phase: 'P2' }] } },
      'GET /roles': { body: { data: [] } },
      'GET /grants': { body: { data: [] } },
      'GET /grants/warnings': { body: { data: [] } },
    });
    const { result } = render(() => ({ simulator: useCapabilityCatalogue(), grid: usePowersGrid() }));
    await waitFor(() => expect(result.current.grid.state).not.toBeNull());

    expect(result.current.simulator.data).toHaveLength(1);
    expect(calls.filter((call) => call.path === '/authz/capabilities')).toHaveLength(1);
  });
});

describe('useActivationPreview', () => {
  it('names who the link is for', async () => {
    stubApi({
      'GET /auth/activate/tok': {
        body: { data: { personName: 'Amara', organizationName: 'Northfield', organizationLogoUrl: null, expiresAt: '2026-12-01T00:00:00.000Z' } },
      },
    });
    const { result } = render(() => useActivationPreview('tok'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.personName).toBe('Amara'));
    expect(result.current.loading).toBe(false);
  });

  it('a dead token leaves `data` null, and the page reads `error` for its one dead end', async () => {
    stubApi({ 'GET /auth/activate/dead': errorReply(404, 'NOT_FOUND', 'That link is not active.') });
    const { result } = render(() => useActivationPreview('dead'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
