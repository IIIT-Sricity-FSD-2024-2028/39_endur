// T-040 — the results seam. 40 § State, § States.
//
// Two behaviours here decide whether the demo's second beat works: the poll that makes the
// number move without anybody touching anything, and the failed poll that must NOT blank a
// page somebody is presenting from.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ResultsView } from '@endur/shared';
import { ApiError } from './api.js';
import { POLL_MS, resultsSearch, useResponses, useResults } from './results.js';

const apiGet = vi.fn();

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) as unknown };
});

const view = (responseCount: number): ResultsView => ({
  responseCount,
  audienceEstimate: null,
  responseRate: null,
  suppressed: false,
  threshold: 5,
  questions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: view(612) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the query string', () => {
  it('carries only the filters that are set, so an unfiltered URL is clean', () => {
    expect(resultsSearch({})).toBe('');
    expect(resultsSearch({ subjectId: 's1' })).toBe('?subjectId=s1');
    expect(resultsSearch({ subjectId: 's1', unitId: 'u1' })).toBe('?subjectId=s1&unitId=u1');
  });
});

describe('polling', () => {
  it('loads once on mount', async () => {
    const { result } = renderHook(() => useResults('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet).toHaveBeenCalledWith('/campaigns/c1/results');
    expect(result.current.data?.responseCount).toBe(612);
  });

  it('reports what arrived, and never on the first load', async () => {
    const { result } = renderHook(() => useResults('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 612 responses "arriving" because the page opened would make the one number on this
    // screen that must be trusted look invented.
    expect(result.current.arrived).toBe(0);

    apiGet.mockResolvedValue({ data: view(613) });
    await act(async () => { await result.current.reload(); });
    expect(result.current.arrived).toBe(1);
  });

  it('polls every ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useResults('c1'));
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('does not stack a second request behind a slow one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiGet.mockImplementation(() => new Promise(() => undefined));
    renderHook(() => useResults('c1'));
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));

    // Venue wifi. A request that never comes back must not queue six more behind it.
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('KEEPS THE LAST GOOD DATA when a poll fails', async () => {
    const { result } = renderHook(() => useResults('c1'));
    await waitFor(() => expect(result.current.data?.responseCount).toBe(612));

    apiGet.mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.reload(); });

    // 40 § States, and the reason is concrete: this page is on a projector.
    expect(result.current.data?.responseCount).toBe(612);
    expect(result.current.error).toBeTruthy();
  });

  it('asks for exactly what the filters say', async () => {
    const { result } = renderHook(() => useResults('c1', { unitId: 'u9' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet).toHaveBeenCalledWith('/campaigns/c1/results?unitId=u9');
  });
});

describe('the comments, behind their own capability', () => {
  const page = {
    data: [{ id: 'r1', submittedAt: '2026-08-20T10:00:00.000Z', subjectName: 'Data Structures', answers: [] }],
    page: { nextCursor: 'cur', hasMore: true },
    meta: { total: 287 },
    suppressed: false,
  };

  it('does not ask at all when the capability is absent', async () => {
    renderHook(() => useResponses('c1', false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // A request nobody may answer is a request not worth making.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('reads a 403 as "this section is absent", not as an error to render', async () => {
    apiGet.mockRejectedValue(new ApiError({ code: 'FORBIDDEN', status: 403, requestId: 'r', message: 'no' }));
    const { result } = renderHook(() => useResponses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 40 § States: the aggregates still render and the comment section is simply not there.
    expect(result.current.forbidden).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('carries the suppression flag through untouched', async () => {
    apiGet.mockResolvedValue({ ...page, data: [], meta: { total: 3 }, suppressed: true });
    const { result } = renderHook(() => useResponses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.suppressed).toBe(true);
    expect(result.current.data?.data).toEqual([]);
  });

  it('appends the next page rather than replacing it', async () => {
    apiGet.mockResolvedValue(page);
    const { result } = renderHook(() => useResponses('c1'));
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    apiGet.mockResolvedValue({
      ...page,
      data: [{ id: 'r2', submittedAt: '2026-08-20T09:00:00.000Z', subjectName: null, answers: [] }],
      page: { nextCursor: null, hasMore: false },
    });
    await act(async () => { await result.current.loadMore(); });

    expect(apiGet).toHaveBeenLastCalledWith('/campaigns/c1/responses?cursor=cur');
    expect(result.current.data?.data.map((item) => item.id)).toEqual(['r1', 'r2']);
  });
});
