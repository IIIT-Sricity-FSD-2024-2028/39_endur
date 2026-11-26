// The inbox — 58 § State, 23 §3.
//
// A queue, not a list. The difference is that a queue has a working copy: marking a card
// read has to happen NOW, on a page of four hundred, and a spinner on each card is worse
// than an occasional revert (58 § State). So every mark is optimistic and reverts in place.
//
// `state`, the filters and the cursor live in the URL, so a filtered queue is a link
// somebody can paste — the same rule as `40`'s filters.
//
// On RTK Query since R-501 (`store/api/endpoints/inbox.ts`): the queue is an infinite query,
// and the optimistic marks are patches to its cache, undone in place on failure. Reads only:
// the marks are thunks, with each card's failure, in `store/screens/inbox.ts` (DEC-R03).
import { useCallback, useMemo } from 'react';
import type { InboxMessage, InboxQuery, InboxResponse, InboxState, Page } from '@endur/shared';
import { isSerializedApiError } from '../store/api/errors.js';
import {
  useGetInboxInfiniteQuery,
  useGetMessagesQuery,
  type InboxArgs,
  type MarkAction,
} from '../store/api/endpoints/inbox.js';
import { useLoadable, type Loadable } from './query.js';

export type { InboxArgs, MarkAction };

export type InboxController = Loadable<Page<InboxResponse>> & {
  /** Absent capability, not an empty queue — the page renders a 403 rather than "up to date". */
  forbidden: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  reload: () => Promise<void>;
  /** Which cache entry this queue is: what `inboxMarked` patches. */
  args: InboxArgs;
};

export function inboxSearch(query: Partial<InboxQuery>): string {
  const params = new URLSearchParams();
  if (query.state) params.set('state', query.state);
  if (query.campaignId) params.set('campaignId', query.campaignId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The queue. Another tab or filter never shows the last one's cards while it loads; a
 * failed re-read keeps the last good page on screen with the error above it (58 § States).
 * Without the capability it asks nothing and reads as loading, as it did: the page shows
 * its refusal before it looks at `loading`.
 */
export function useInbox(query: Partial<InboxQuery>, enabled = true): InboxController {
  const tab: InboxState = query.state ?? 'unread';
  const search = inboxSearch(query);
  const args = useMemo(() => ({ search, tab }), [search, tab]);

  const inbox = useGetInboxInfiniteQuery(args, { skip: !enabled });
  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = inbox;

  // The loaded pages as ONE page: every card so far, and the cursor and total from the
  // newest page.
  const pages = inbox.currentData?.pages;
  const data = useMemo(() => {
    const last = pages?.at(-1);
    return pages && last ? { ...last, data: pages.flatMap((page) => page.data) } : undefined;
  }, [pages]);

  const forbidden = isSerializedApiError(inbox.error) && inbox.error.status === 403;
  const loaded = useLoadable({
    ...inbox,
    // "Load more" has its own flag; the queue itself is not reloading.
    isFetching: isFetching && !isFetchingNextPage,
    data,
    currentData: data,
  });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching]);

  return {
    ...loaded,
    ...(forbidden ? { data: null, error: null } : {}),
    forbidden,
    loadMore,
    loadingMore: isFetchingNextPage,
    args,
  };
}

// ---------------------------------------------------------------------------
// From Endur — DEC-101, T-101, 58 § From Endur.
//
// A SECOND STREAM, DELIBERATELY SIMPLER THAN THE FIRST. No revert, no per-card failure map,
// no cursor. `useInbox` above carries all of that because it is a queue of four hundred
// comments that a person works through at speed; this is a handful of messages a year, and
// the machinery that makes the comment queue feel fast would be machinery guarding against a
// problem this stream does not have.
//
// That is not a shortcut — it is `INV-009` read correctly. What is shared is the MECHANIC the
// reader sees (a tab, unread counts, click to read); what is not shared is an implementation
// tuned for a cardinality this stream does not have.
// ---------------------------------------------------------------------------

export type MessagesController = Loadable<Page<InboxMessage>> & {
  reload: () => Promise<void>;
};

/** The messages. Marking one is `messageMarked` (store/screens/inbox.ts). */
export function useMessages(enabled = true): MessagesController {
  const messages = useLoadable(useGetMessagesQuery(undefined, { skip: !enabled }));
  return { ...messages, loading: enabled && messages.loading };
}
