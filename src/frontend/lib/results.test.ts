// T-040, R-203 — the results seam, on RTK Query over a stubbed `fetch`. 40 § State, § States.
//
// Two behaviours here decide whether the demo's second beat works: the poll that makes the
// number move without anybody touching anything, and the failed poll that must NOT blank a
// page somebody is presenting from.
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ResultsView } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, heldReply, stubApi, type StubReply } from '../test-utils.js';
import { POLL_MS, resultsSearch, useResponses, useResults } from './results.js';

const view = (responseCount: number): ResultsView => ({
  responseCount,
  audienceEstimate: null,
  responseRate: null,
  suppressed: false,
  threshold: 5,
  questions: [],
});

const answer = (responseCount: number): StubReply => ({ body: { data: view(responseCount) } });

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
  return renderHook(hook, { wrapper });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    const calls = stubApi({ 'GET /campaigns/c1/results': answer(612) });
    const { result } = render(() => useResults('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls.map((call) => call.path)).toEqual(['/campaigns/c1/results']);
    expect(result.current.data?.responseCount).toBe(612);
  });

  it('reports what arrived, and never on the first load', async () => {
    stubApi({ 'GET /campaigns/c1/results': (_call, count) => answer(count === 1 ? 612 : 613) });
    const { result } = render(() => useResults('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 612 responses "arriving" because the page opened would make the one number on this
    // screen that must be trusted look invented.
    expect(result.current.arrived).toBe(0);

    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.arrived).toBe(1));
  });

  it('a poll that brings nothing new says nothing arrived', async () => {
    stubApi({ 'GET /campaigns/c1/results': (_call, count) => answer(count === 1 ? 612 : 613) });
    const { result } = render(() => useResults('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.arrived).toBe(1));

    // Same count again: the "landed" moment must not hang around for a second poll.
    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.arrived).toBe(0));
  });

  it('polls every ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubApi({ 'GET /campaigns/c1/results': answer(612) });
    render(() => useResults('c1'));
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(calls).toHaveLength(2);
  });

  it('does not stack a second request behind a slow one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const never = heldReply();
    const calls = stubApi({ 'GET /campaigns/c1/results': () => never.promise });
    render(() => useResults('c1'));
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    // Venue wifi. A request that never comes back must not queue six more behind it.
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(calls).toHaveLength(1);
  });

  it('KEEPS THE LAST GOOD DATA when a poll fails', async () => {
    stubApi({
      'GET /campaigns/c1/results': (_call, count) => (count === 1 ? answer(612) : new TypeError('offline')),
    });
    const { result } = render(() => useResults('c1'));
    await waitFor(() => expect(result.current.data?.responseCount).toBe(612));

    await act(async () => { await result.current.reload(); });

    // 40 § States, and the reason is concrete: this page is on a projector.
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data?.responseCount).toBe(612);
  });

  it('asks for exactly what the filters say', async () => {
    const calls = stubApi({ 'GET /campaigns/c1/results?unitId=u9': answer(3) });
    const { result } = render(() => useResults('c1', { unitId: 'u9' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls[0]?.path).toBe('/campaigns/c1/results?unitId=u9');
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
    const calls = stubApi({});
    render(() => useResponses('c1', false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // A request nobody may answer is a request not worth making.
    expect(calls).toHaveLength(0);
  });

  it('reads a 403 as "this section is absent", not as an error to render', async () => {
    stubApi({ 'GET /campaigns/c1/responses': errorReply(403, 'FORBIDDEN', 'no') });
    const { result } = render(() => useResponses('c1'));
    await waitFor(() => expect(result.current.forbidden).toBe(true));

    // 40 § States: the aggregates still render and the comment section is simply not there.
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('carries the suppression flag through untouched', async () => {
    stubApi({ 'GET /campaigns/c1/responses': { body: { ...page, data: [], meta: { total: 3 }, suppressed: true } } });
    const { result } = render(() => useResponses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.suppressed).toBe(true);
    expect(result.current.data?.data).toEqual([]);
  });

  it('appends the next page rather than replacing it', async () => {
    const calls = stubApi({
      'GET /campaigns/c1/responses': { body: page },
      'GET /campaigns/c1/responses?cursor=cur': {
        body: {
          ...page,
          data: [{ id: 'r2', submittedAt: '2026-08-20T09:00:00.000Z', subjectName: null, answers: [] }],
          page: { nextCursor: null, hasMore: false },
        },
      },
    });
    const { result } = render(() => useResponses('c1'));
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    await act(async () => { await result.current.loadMore(); });

    expect(calls.at(-1)?.path).toBe('/campaigns/c1/responses?cursor=cur');
    await waitFor(() => expect(result.current.data?.data.map((item) => item.id)).toEqual(['r1', 'r2']));
    expect(result.current.data?.page.hasMore).toBe(false);
  });
});
