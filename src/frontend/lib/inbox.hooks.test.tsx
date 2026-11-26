// R-501: the inbox and announcements on RTK Query, over a stubbed `fetch`. The Inbox page
// test runs the queue's UI; these pin what the hooks and the mark thunk do with the cache.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxResponse, Page } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, stubApi } from '../test-utils.js';
import { useAnnouncements, useRecipientCount } from './announcements.js';
import { inboxMarked } from '../store/screens/inbox.js';
import { useInbox, type MarkAction } from './inbox.js';

const card = (id: string, read = false) =>
  ({ id, read, archived: false, comment: id } as unknown as InboxResponse);
const page = (rows: InboxResponse[], nextCursor: string | null = null, total = rows.length) =>
  ({ body: { data: rows, page: { nextCursor, hasMore: nextCursor !== null }, meta: { total } } as Page<InboxResponse> });

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
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
    const { result, store } = render(() => useInbox({ state: 'unread' }));
    await waitFor(() => expect(result.current.data?.meta.total).toBe(3));
    const mark = (responseId: string, action: MarkAction, keep?: boolean) =>
      store.dispatch(inboxMarked({ responseId, action, ...(keep ? { keep } : {}), args: result.current.args }));

    // Opening r1 marks it read and keeps it on screen; the unread count drops.
    await act(async () => { await mark('r1', 'read', true); });
    await waitFor(() => expect(result.current.data?.meta.total).toBe(2));
    expect(result.current.data?.data).toHaveLength(3);

    // Archiving r2 takes one more off. (It used to take two: r1, still on screen and no
    // longer unread, was counted as leaving all over again.)
    await act(async () => { await mark('r2', 'archive'); });
    await waitFor(() => expect(result.current.data?.meta.total).toBe(1));

    // And marking the kept one unread again puts it back in the count.
    await act(async () => { await mark('r1', 'unread'); });
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

// The debounce is the composer's (`composerAudienceSettled`), tested with the page in
// pages/console/Announcements; this only reads the count for a settled rule.
describe('useRecipientCount', () => {
  const rule = (unitId: string) => JSON.stringify({ kind: 'unit', unitId });

  it('asks nothing until a rule has settled, then reads the server\'s count for it', async () => {
    const calls = stubApi({
      'POST /announcements/preview': (call) => ({
        body: { data: { recipients: (call.body as { audience: { unitId: string } }).audience.unitId === 'u1' ? 40 : 7 } },
      }),
    });
    const { result, rerender } = renderHook(({ settled }: { settled: string | null }) => useRecipientCount(settled), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={setupStore()}>{children}</Provider>,
      initialProps: { settled: null as string | null },
    });
    expect(result.current).toBeNull();
    expect(calls).toHaveLength(0);

    rerender({ settled: rule('u1') });
    await waitFor(() => expect(result.current).toBe(40));
    // A new rule is "not known yet" until its own answer, never the last rule's number.
    rerender({ settled: rule('u2') });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(7));
    expect(calls).toHaveLength(2);
  });
});
