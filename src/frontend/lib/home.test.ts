// T-041 — the home seam. 46 § State.
//
// Small on purpose: one request, no polling, and a failure that leaves the shell usable.
// The one property worth pinning is the absence of a timer — this page is a hub, and a
// second poller running behind a screen nobody is watching is a cost with no reader.
// R-204: on RTK Query, over a stubbed `fetch`; every case below is the T-041 one, ported.
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HomeView, StatWindow } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { heldReply, stubApi, type StubCall, type StubReply } from '../test-utils.js';
import { useHome } from './home.js';

const VIEW: HomeView = {
  stats: {
    window: '30d', responses: 1057, subjectsCovered: 18,
    activeCampaigns: 2, responseRate: null, responsesEver: 4210,
  },
  activeCampaigns: [],
  prompts: [],
  configured: true,
};

const answer = (responses = 1057, window: StatWindow = '30d'): StubReply => ({
  body: { data: { ...VIEW, stats: { ...VIEW.stats, window, responses } } },
});

/** The home endpoint for each range, each answering in turn from its list. */
function serve(replies: Partial<Record<StatWindow, Array<StubReply | Promise<StubReply>>>> = {}): StubCall[] {
  const routes: Record<string, (call: StubCall, count: number) => StubReply | Promise<StubReply>> = {};
  for (const range of ['30d', 'today', '7d', 'all'] as StatWindow[]) {
    routes[`GET /home?window=${range}`] = (_call, count) => {
      const list = replies[range] ?? [answer(1057, range)];
      return list[Math.min(count, list.length) - 1] ?? answer(1057, range);
    };
  }
  return stubApi(routes);
}

function render<P>(hook: (props: P) => ReturnType<typeof useHome>, initialProps?: P) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
  return renderHook(hook, { wrapper, ...(initialProps ? { initialProps } : {}) });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useHome', () => {
  it('populates the whole page with ONE request', async () => {
    const calls = serve();
    const { result } = render(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(calls.map((call) => call.path)).toEqual(['/home?window=30d']);
    expect(result.current.data?.stats.responses).toBe(1057);
  });

  it('does NOT poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = serve();
    const { result } = render(() => useHome());
    // Awaited rather than merely counted: a request that has been SENT but whose state
    // update lands after the assertions is the act() warning T-039 chased down.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toHaveLength(1);

    // Live counters belong on 40, where a response landing is the point. Here they would
    // be a timer nobody is watching (46 § State).
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(calls).toHaveLength(1);
  });

  it('refetches when asked, which is what navigating back to /app does', async () => {
    serve({ '30d': [answer(1057), answer(1058)] });
    const { result } = render(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.data?.stats.responses).toBe(1058));
  });

  it('keeps the last good data when a refetch fails', async () => {
    serve({ '30d': [answer(1057), new TypeError('offline')] });
    const { result } = render(() => useHome());
    await waitFor(() => expect(result.current.data).toBeTruthy());

    await act(async () => { await result.current.reload(); });

    // The rest of the shell stays usable and the numbers stay on screen (46 § States).
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data?.stats.responses).toBe(1057);
  });

  it('asks the server for the range rather than slicing what it has — DEC-031', async () => {
    const calls = serve();
    const { result, rerender } = render(({ range }: { range: StatWindow }) => useHome(range), {
      range: '30d' as StatWindow,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ range: 'today' });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.at(-1)?.path).toBe('/home?window=today');
  });

  it('lets the NEWEST range win, however the responses come back', async () => {
    // The bug a boolean `alive` flag could not prevent: press 30d then Today, and a slow
    // first request lands last, painting a month of responses under a card saying "today".
    const slow = heldReply(answer(1057, '30d'));
    serve({ '30d': [slow.promise], today: [answer(3, 'today')] });

    const { result, rerender } = render(({ range }: { range: StatWindow }) => useHome(range), {
      range: '30d' as StatWindow,
    });
    rerender({ range: 'today' });
    await waitFor(() => expect(result.current.data?.stats.responses).toBe(3));

    await act(async () => {
      slow.release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.data?.stats.responses).toBe(3);
  });

  it('reports the failure when there was never anything to keep', async () => {
    serve({ '30d': [new TypeError('offline')] });
    const { result } = render(() => useHome());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
