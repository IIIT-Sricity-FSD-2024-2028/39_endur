// T-041 — the home seam. 46 § State.
//
// Small on purpose: one request, no polling, and a failure that leaves the shell usable.
// The one property worth pinning is the absence of a timer — this page is a hub, and a
// second poller running behind a screen nobody is watching is a cost with no reader.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HomeView, StatWindow } from '@endur/shared';
import { useHome } from './home.js';

const apiGet = vi.fn();

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) as unknown };
});

const VIEW: HomeView = {
  stats: {
    window: '30d', responses: 1057, subjectsCovered: 18,
    activeCampaigns: 2, responseRate: null, responsesEver: 4210,
  },
  activeCampaigns: [],
  prompts: [],
  configured: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: VIEW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHome', () => {
  it('populates the whole page with ONE request', async () => {
    const { result } = renderHook(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/home?window=30d');
    expect(result.current.data?.stats.responses).toBe(1057);
  });

  it('does NOT poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useHome());
    // Awaited rather than merely counted: a request that has been SENT but whose state
    // update lands after the assertions is the act() warning T-039 chased down.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet).toHaveBeenCalledTimes(1);

    // Live counters belong on 40, where a response landing is the point. Here they would
    // be a timer nobody is watching (46 § State).
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('refetches when asked, which is what navigating back to /app does', async () => {
    const { result } = renderHook(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    apiGet.mockResolvedValue({ data: { ...VIEW, stats: { ...VIEW.stats, responses: 1058 } } });
    await act(async () => { await result.current.reload(); });
    expect(result.current.data?.stats.responses).toBe(1058);
  });

  it('keeps the last good data when a refetch fails', async () => {
    const { result } = renderHook(() => useHome());
    await waitFor(() => expect(result.current.data).toBeTruthy());

    apiGet.mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.reload(); });

    // The rest of the shell stays usable and the numbers stay on screen (46 § States).
    expect(result.current.data?.stats.responses).toBe(1057);
    expect(result.current.error).toBeTruthy();
  });

  it('asks the server for the range rather than slicing what it has — DEC-031', async () => {
    const { result, rerender } = renderHook(({ range }) => useHome(range), {
      initialProps: { range: '30d' as StatWindow },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ range: 'today' });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(apiGet).toHaveBeenLastCalledWith('/home?window=today');
  });

  it('lets the NEWEST range win, however the responses come back', async () => {
    // The bug a boolean `alive` flag could not prevent: press 30d then Today, and a slow
    // first request lands last, painting a month of responses under a card saying "today".
    let settleFirst: ((value: unknown) => void) | undefined;
    apiGet.mockImplementationOnce(
      () => new Promise((resolve) => { settleFirst = resolve; }),
    );
    apiGet.mockResolvedValue({ data: { ...VIEW, stats: { ...VIEW.stats, window: 'today', responses: 3 } } });

    const { result, rerender } = renderHook(({ range }) => useHome(range), {
      initialProps: { range: '30d' as StatWindow },
    });
    rerender({ range: 'today' });
    await waitFor(() => expect(result.current.data?.stats.responses).toBe(3));

    await act(() => {
      settleFirst?.({ data: { ...VIEW, stats: { ...VIEW.stats, window: '30d', responses: 1057 } } });
      return Promise.resolve();
    });
    expect(result.current.data?.stats.responses).toBe(3);
  });

  it('reports the failure when there was never anything to keep', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
