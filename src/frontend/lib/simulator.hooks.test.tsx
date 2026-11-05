// R-406: the simulator and the activation link on RTK Query, over a stubbed `fetch`.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecisionView, SimulateBody } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, stubApi } from '../test-utils.js';
import { useActivationPreview } from './accounts.js';
import { usePowersGrid } from './roles.js';
import { useCapabilityCatalogue, useSimulator } from './simulator.js';

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

const query = { principalId: 'p1', capability: 'campaign.launch' } as unknown as SimulateBody;
const labels = { principalName: 'Amara', targetLabel: 'Ward 4', capabilityLabel: 'open plithes' };
const decision = (allowed: boolean) => ({ body: { data: { allowed } as unknown as DecisionView } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSimulator', () => {
  it('asks the server every time, and keeps the last five, newest first', async () => {
    let allowed = false;
    const calls = stubApi({ 'POST /authz/simulate': () => decision(allowed) });
    const { result } = render(() => useSimulator());

    for (let run = 0; run < 6; run += 1) {
      allowed = run % 2 === 1;
      await act(async () => { await result.current.run(query, labels); });
    }

    // The same question, asked again after a grant edit, must be ASKED again: never cached.
    expect(calls).toHaveLength(6);
    expect(result.current.history).toHaveLength(5);
    expect(result.current.history[0]?.decision).toEqual({ allowed: true });
    expect(result.current.running).toBe(false);
  });

  it('a 403 means "you may not simulate", not an error to print', async () => {
    stubApi({ 'POST /authz/simulate': errorReply(403, 'FORBIDDEN', 'No.') });
    const { result } = render(() => useSimulator());

    await act(async () => { await result.current.run(query, labels); });

    expect(result.current.forbidden).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('any other failure is the server\'s sentence', async () => {
    stubApi({ 'POST /authz/simulate': errorReply(409, 'CONFLICT', 'That person holds no position.') });
    const { result } = render(() => useSimulator());

    await act(async () => { await result.current.run(query, labels); });

    expect(result.current.error).toBe('That person holds no position.');
    expect(result.current.history).toEqual([]);
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
