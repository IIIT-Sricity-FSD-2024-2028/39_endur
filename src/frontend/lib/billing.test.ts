// The billing hooks over a stubbed `fetch` (R-503). The Plan page tests mock this whole
// module, so without this file nothing checked which endpoints the page actually calls, or
// with what.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { createElement, StrictMode, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BillingSummary } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { stubApi } from '../test-utils.js';
import {
  useBilling,
  useCancelDowngrade,
  useEnterpriseRequest,
  useJoinTier,
  usePlanSummary,
  usePlans,
  useScheduleDowngrade,
} from './billing.js';

const SUMMARY: BillingSummary = {
  tier: 'silver',
  status: 'active',
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z',
  pendingTier: null,
  lapsedFrom: null,
  lapsedFromTrial: null,
  seats: 3,
  seatBreakdown: { activeUsers: 3, nonPersonSubjects: 0 },
};
const answer = (summary: BillingSummary) => ({ body: { data: summary } });

function render<T>(hook: () => T, strict = false) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = createElement(Provider, { store, children });
    return strict ? createElement(StrictMode, null, tree) : tree;
  };
  return renderHook(hook, { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useBilling', () => {
  it('loads the summary from GET /billing', async () => {
    const calls = stubApi({ 'GET /billing': answer(SUMMARY) });
    const { result } = render(() => useBilling());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls.map((call) => call.path)).toEqual(['/billing']);
    expect(result.current.data).toEqual(SUMMARY);
    expect(result.current.error).toBeNull();
  });

  it('keeps the error and no data when the read fails', async () => {
    stubApi({ 'GET /billing': new TypeError('offline') });
    const { result } = render(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe('offline');
  });

  // The page replaces the whole summary with what the server returned, never patches one field.
  it('replaces the summary wholesale through set()', async () => {
    stubApi({ 'GET /billing': answer(SUMMARY) });
    const { result } = render(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const gold: BillingSummary = { ...SUMMARY, tier: 'gold' };
    act(() => result.current.set(gold));
    await waitFor(() => expect(result.current.data).toEqual(gold));
  });

  // StrictMode mounts, unmounts and remounts (as development does). The hook used to send two
  // reads and needed a cancelled flag so the abandoned one could not answer last; the cache
  // sends one.
  it('sends one read under StrictMode, not two', async () => {
    const calls = stubApi({ 'GET /billing': answer(SUMMARY) });
    const { result } = render(() => useBilling(), true);
    await waitFor(() => expect(result.current.data?.tier).toBe('silver'));
    expect(calls).toHaveLength(1);
  });
});

describe('the Plan page and the shell banner read ONE summary', () => {
  it('a join on the page is in the banner at once, with no second read', async () => {
    const calls = stubApi({
      'GET /billing': answer({ ...SUMMARY, status: 'trialing' }),
      'POST /billing/tier': answer({ ...SUMMARY, tier: 'gold' }),
    });
    const { result } = render(() => ({
      banner: usePlanSummary(true),
      page: useBilling(),
      join: useJoinTier(),
    }));
    await waitFor(() => expect(result.current.banner?.status).toBe('trialing'));

    await act(async () => { await result.current.join('gold', 'endur_abc123'); });

    // Before, the banner fetched once when the console opened and kept saying "your trial
    // ends — add payment" after payment, until a reload.
    await waitFor(() => expect(result.current.banner?.tier).toBe('gold'));
    expect(result.current.page.data?.tier).toBe('gold');
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('the banner asks nothing for a reader who may not see billing', () => {
    const calls = stubApi({});
    const { result } = render(() => usePlanSummary(false));
    expect(result.current).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('usePlans', () => {
  it('reads the catalogue from the server', async () => {
    const calls = stubApi({ 'GET /billing/plans': { body: { data: [{ tier: 'bronze' }] } } });
    const { result } = render(() => usePlans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls[0]?.path).toBe('/billing/plans');
    expect(result.current.data).toEqual([{ tier: 'bronze' }]);
  });
});

describe('the plan writes', () => {
  it('joins with the tier and the reference the checkout minted', async () => {
    const calls = stubApi({ 'POST /billing/tier': answer({ ...SUMMARY, tier: 'gold' }) });
    const { result } = render(() => useJoinTier());
    const updated = await result.current('gold', 'endur_abc123');
    expect(calls[0]?.body).toEqual({ tier: 'gold', paymentRef: 'endur_abc123' });
    expect(updated.tier).toBe('gold');
  });

  // Never an amount, and no empty paymentRef key either: the DTO would have to tolerate it.
  it('sends only the tier when there is no reference', async () => {
    const calls = stubApi({ 'POST /billing/tier': answer(SUMMARY) });
    const { result } = render(() => useJoinTier());
    await result.current('silver');
    expect(calls[0]?.body).toEqual({ tier: 'silver' });
  });

  it('schedules a move down with a POST and cancels it with a DELETE', async () => {
    const calls = stubApi({
      'POST /billing/downgrade': answer({ ...SUMMARY, pendingTier: 'bronze' }),
      'DELETE /billing/downgrade': answer(SUMMARY),
    });
    const { result } = render(() => ({ schedule: useScheduleDowngrade(), cancel: useCancelDowngrade() }));

    expect((await result.current.schedule('bronze')).pendingTier).toBe('bronze');
    expect(calls[0]?.body).toEqual({ tier: 'bronze' });
    expect((await result.current.cancel()).pendingTier).toBeNull();
    expect(calls[1]?.method).toBe('DELETE');
  });
});

describe('useEnterpriseRequest', () => {
  it('reads whether a request is already open', async () => {
    stubApi({ 'GET /billing/enterprise-request': { body: { data: { requestedAt: '2026-10-10T00:00:00.000Z' } } } });
    const { result } = render(() => useEnterpriseRequest());
    await waitFor(() => expect(result.current.requestedAt).toBe('2026-10-10T00:00:00.000Z'));
  });

  // It decides one word on one button, so a failed read leaves it at "Request" rather than
  // putting an error on the plan page.
  it('treats a failed read as no request, and a request after it still reads as requested', async () => {
    stubApi({
      'GET /billing/enterprise-request': new TypeError('offline'),
      'POST /billing/enterprise-request': { body: { data: { requestedAt: '2026-10-17T00:00:00.000Z' } } },
    });
    const { result } = render(() => useEnterpriseRequest());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.current.requestedAt).toBeNull();

    await act(async () => { await result.current.request('call after 5pm'); });
    await waitFor(() => expect(result.current.requestedAt).toBe('2026-10-17T00:00:00.000Z'));
  });

  it('sends a trimmed note, or no note at all, and then reads as requested', async () => {
    const calls = stubApi({
      'GET /billing/enterprise-request': { body: { data: { requestedAt: null } } },
      'POST /billing/enterprise-request': { body: { data: { requestedAt: '2026-10-17T00:00:00.000Z' } } },
    });
    const { result } = render(() => useEnterpriseRequest());

    await act(() => result.current.request('  call after 5pm  '));
    expect(calls.at(-1)?.body).toEqual({ note: 'call after 5pm' });
    await waitFor(() => expect(result.current.requestedAt).toBe('2026-10-17T00:00:00.000Z'));

    await act(() => result.current.request('   '));
    expect(calls.at(-1)?.body).toEqual({});
  });
});
