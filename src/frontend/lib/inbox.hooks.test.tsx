// R-501: the inbox and announcements on RTK Query, over a stubbed `fetch`. The Inbox page
// test runs the queue's UI; these pin what the hooks do with the cache.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudienceRule, InboxResponse, Page } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, stubApi } from '../test-utils.js';
import { useAnnouncements, useRecipientPreview } from './announcements.js';
import { useInbox } from './inbox.js';

const card = (id: string, read = false) =>
  ({ id, read, archived: false, comment: id } as unknown as InboxResponse);
const page = (rows: InboxResponse[], nextCursor: string | null = null, total = rows.length) =>
  ({ body: { data: rows, page: { nextCursor, hasMore: nextCursor !== null }, meta: { total } } as Page<InboxResponse> });

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useInbox', () => {
  it('"Load more" appends the next page to the queue', async () => {
    stubApi({
      'GET /inbox?state=unread': page([card('r1')], 'cur', 2),
      'GET /inbox?state=unread&cursor=cur': page([card('r2')], null, 2),
    });
    const { result } = render(() => useInbox({ state: 'unread' }));
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    await act(async () => { await result.current.loadMore(); });

    await waitFor(() => expect(result.current.data?.data.map((row) => row.id)).toEqual(['r1', 'r2']));
    expect(result.current.data?.page.hasMore).toBe(false);
  });

  it('counts an opened-and-kept card ONCE, however many marks follow it', async () => {
    stubApi({
      'GET /inbox?state=unread': page([card('r1'), card('r2'), card('r3')]),
      'POST /inbox/*': { status: 204 },
    });
    const { result } = render(() => useInbox({ state: 'unread' }));
    await waitFor(() => expect(result.current.data?.meta.total).toBe(3));

    // Opening r1 marks it read and keeps it on screen; the unread count drops.
    await act(async () => { await result.current.mark('r1', 'read', { keep: true }); });
    await waitFor(() => expect(result.current.data?.meta.total).toBe(2));
    expect(result.current.data?.data).toHaveLength(3);

    // Archiving r2 takes one more off. (It used to take two: r1, still on screen and no
    // longer unread, was counted as leaving all over again.)
    await act(async () => { await result.current.mark('r2', 'archive'); });
    await waitFor(() => expect(result.current.data?.meta.total).toBe(1));

    // And marking the kept one unread again puts it back in the count.
    await act(async () => { await result.current.mark('r1', 'unread'); });
    await waitFor(() => expect(result.current.data?.meta.total).toBe(2));
  });

  it('a 403 is the refusal state, not an empty queue', async () => {
    stubApi({ 'GET /inbox?state=unread': errorReply(403, 'FORBIDDEN', 'No.') });
    const { result } = render(() => useInbox({ state: 'unread' }));
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useAnnouncements', () => {
  it('a 403 is the refusal state; without the capability nothing is asked', async () => {
    const calls = stubApi({ 'GET /announcements': errorReply(403, 'FORBIDDEN', 'No.') });
    const { result } = render(() => ({ page: useAnnouncements(), home: useAnnouncements(false) }));
    await waitFor(() => expect(result.current.page.forbidden).toBe(true));
    expect(result.current.page.error).toBeNull();
    expect(result.current.home).toMatchObject({ loading: false, forbidden: false, rows: [] });
    expect(calls).toHaveLength(1);
  });
});

describe('useRecipientPreview', () => {
  const rule = (unitId: string) => ({ kind: 'unit', unitId } as unknown as AudienceRule);

  it('asks once the rule has settled, and says "not known" while it has not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubApi({
      'POST /announcements/preview': (call) => ({
        body: { data: { recipients: (call.body as { audience: { unitId: string } }).audience.unitId === 'u1' ? 40 : 7 } },
      }),
    });
    const { result, rerender } = renderHook(({ unit }: { unit: string }) => useRecipientPreview(rule(unit)), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={setupStore()}>{children}</Provider>,
      initialProps: { unit: 'u1' },
    });
    expect(result.current).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await waitFor(() => expect(result.current).toBe(40));

    // Three changes inside the debounce: one request, for the last of them.
    rerender({ unit: 'u2' });
    rerender({ unit: 'u3' });
    rerender({ unit: 'u4' });
    expect(result.current).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await waitFor(() => expect(result.current).toBe(7));
    expect(calls).toHaveLength(2);
  });
});
