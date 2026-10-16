// The billing hooks against a faked api layer. The Plan page tests mock this whole module, so
// without this file nothing checked which endpoints the page actually calls, or with what.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BillingSummary } from '@endur/shared';
import {
  useBilling,
  useCancelDowngrade,
  useEnterpriseRequest,
  useJoinTier,
  usePlans,
  useScheduleDowngrade,
} from './billing.js';

const apiGet = vi.fn<(path: string) => Promise<unknown>>();
const apiPost = vi.fn<(path: string, body?: unknown) => Promise<unknown>>();
const apiDelete = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('./api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./api.js');
  return {
    ...actual,
    apiGet: (path: string) => apiGet(path),
    apiPost: (path: string, body?: unknown) => apiPost(path, body),
    apiDelete: (path: string) => apiDelete(path),
  };
});

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

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiDelete.mockReset();
});

describe('useBilling', () => {
  it('loads the summary from GET /billing', async () => {
    apiGet.mockResolvedValue({ data: SUMMARY });
    const { result } = renderHook(() => useBilling());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet).toHaveBeenCalledWith('/billing');
    expect(result.current.data).toEqual(SUMMARY);
    expect(result.current.error).toBeNull();
  });

  it('keeps the error and no data when the read fails', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe('offline');
  });

  // The page replaces the whole summary with what the server returned, never patches one field.
  it('replaces the summary wholesale through set()', async () => {
    apiGet.mockResolvedValue({ data: SUMMARY });
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const gold: BillingSummary = { ...SUMMARY, tier: 'gold' };
    act(() => result.current.set(gold));
    expect(result.current.data).toEqual(gold);
  });

  // The cancelled flag, made visible. StrictMode runs the effect, cleans it up, and runs it again
  // (as development does), so two reads go out. If the first, abandoned one answers LAST, the
  // flag is all that stops it overwriting the second.
  it('ignores the answer to a read whose effect was cleaned up', async () => {
    const pending: Array<(value: unknown) => void> = [];
    apiGet.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const { result } = renderHook(() => useBilling(), { wrapper: StrictMode });
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1]!({ data: { ...SUMMARY, tier: 'gold' } });
      await Promise.resolve();
    });
    await act(async () => {
      pending[0]!({ data: SUMMARY });
      await Promise.resolve();
    });
    expect(result.current.data?.tier).toBe('gold');
  });
});

describe('usePlans', () => {
  it('reads the catalogue from the server', async () => {
    apiGet.mockResolvedValue({ data: [{ tier: 'bronze' }] });
    const { result } = renderHook(() => usePlans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet).toHaveBeenCalledWith('/billing/plans');
    expect(result.current.data).toEqual([{ tier: 'bronze' }]);
  });
});

describe('the plan writes', () => {
  it('joins with the tier and the reference the checkout minted', async () => {
    apiPost.mockResolvedValue({ data: { ...SUMMARY, tier: 'gold' } });
    const { result } = renderHook(() => useJoinTier());
    const updated = await result.current('gold', 'endur_abc123');
    expect(apiPost).toHaveBeenCalledWith('/billing/tier', { tier: 'gold', paymentRef: 'endur_abc123' });
    expect(updated.tier).toBe('gold');
  });

  // Never an amount, and no empty paymentRef key either: the DTO would have to tolerate it.
  it('sends only the tier when there is no reference', async () => {
    apiPost.mockResolvedValue({ data: SUMMARY });
    const { result } = renderHook(() => useJoinTier());
    await result.current('silver');
    expect(apiPost).toHaveBeenCalledWith('/billing/tier', { tier: 'silver' });
  });

  it('schedules a move down with a POST and cancels it with a DELETE', async () => {
    apiPost.mockResolvedValue({ data: { ...SUMMARY, pendingTier: 'bronze' } });
    apiDelete.mockResolvedValue({ data: SUMMARY });
    const schedule = renderHook(() => useScheduleDowngrade()).result.current;
    const cancel = renderHook(() => useCancelDowngrade()).result.current;

    expect((await schedule('bronze')).pendingTier).toBe('bronze');
    expect(apiPost).toHaveBeenCalledWith('/billing/downgrade', { tier: 'bronze' });
    expect((await cancel()).pendingTier).toBeNull();
    expect(apiDelete).toHaveBeenCalledWith('/billing/downgrade');
  });
});

describe('useEnterpriseRequest', () => {
  it('reads whether a request is already open', async () => {
    apiGet.mockResolvedValue({ data: { requestedAt: '2026-10-10T00:00:00.000Z' } });
    const { result } = renderHook(() => useEnterpriseRequest());
    await waitFor(() => expect(result.current.requestedAt).toBe('2026-10-10T00:00:00.000Z'));
    expect(apiGet).toHaveBeenCalledWith('/billing/enterprise-request');
  });

  // It decides one word on one button, so a failed read leaves it at "Request" rather than
  // putting an error on the plan page.
  it('treats a failed read as no request, without throwing', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useEnterpriseRequest());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.requestedAt).toBeNull();
  });

  it('sends a trimmed note, or no note at all, and then reads as requested', async () => {
    apiGet.mockResolvedValue({ data: { requestedAt: null } });
    apiPost.mockResolvedValue({ data: { requestedAt: '2026-10-17T00:00:00.000Z' } });
    const { result } = renderHook(() => useEnterpriseRequest());

    await act(() => result.current.request('  call after 5pm  '));
    expect(apiPost).toHaveBeenLastCalledWith('/billing/enterprise-request', { note: 'call after 5pm' });
    expect(result.current.requestedAt).toBe('2026-10-17T00:00:00.000Z');

    await act(() => result.current.request('   '));
    expect(apiPost).toHaveBeenLastCalledWith('/billing/enterprise-request', {});
  });
});
