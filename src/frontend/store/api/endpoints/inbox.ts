// The inbox on RTK Query. 58 § State; docs/REDUX-PLAN.md (R-501).
//
// Two streams, and they stay as different as they were:
//   - the comment QUEUE: an infinite list ("Load more" appends), and every mark is
//     OPTIMISTIC and reverts in place. The optimism lives in the cache (`markInbox`'s
//     `onQueryStarted` patches every loaded page; `patch.undo()` on failure), so it is the
//     same mechanism as the unit and subject renames.
//   - "From Endur" messages: a handful a year. Applied locally first, never reverted.
//
// A mark invalidates nothing. A re-read after every tick would renumber the queue under the
// reader's cursor while they work down it, which on a queue is the same as losing their
// place (58 § State).
import type { InboxMessage, InboxResponse, InboxState, Page } from '@endur/shared';
import { api } from '../api.js';

export type MarkAction = 'read' | 'unread' | 'archive' | 'unarchive';

/** The arg: the query string (`inboxSearch`) and the tab it names. */
export type InboxArgs = { search: string; tab: InboxState };

/** What a mark does to a card, applied locally before the request leaves. */
export function applyMark(card: InboxResponse, action: MarkAction): InboxResponse {
  switch (action) {
    case 'read':
      return { ...card, read: true };
    case 'unread':
      return { ...card, read: false };
    case 'archive':
      // Mirrors the server: archiving marks read too. Nobody archives a comment they have
      // not read, and leaving it unread would keep it in the unread count after it left.
      return { ...card, archived: true, read: true };
    case 'unarchive':
      return { ...card, archived: false };
  }
}

/** Whether a card still belongs in the tab being looked at, after a mark. */
export function belongsIn(card: InboxResponse, state: InboxState): boolean {
  switch (state) {
    case 'archived':
      return card.archived;
    case 'read':
      return card.read && !card.archived;
    case 'unread':
      return !card.read && !card.archived;
    case 'all':
      return !card.archived;
  }
}

export const inboxApi = api.injectEndpoints({
  endpoints: (build) => ({
    getInbox: build.infiniteQuery<Page<InboxResponse>, InboxArgs, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
      },
      query: ({ queryArg: { search }, pageParam: cursor }) => {
        const params = new URLSearchParams(search.replace(/^\?/, ''));
        if (cursor) params.set('cursor', cursor);
        const suffix = params.toString();
        return `/inbox${suffix ? `?${suffix}` : ''}`;
      },
      providesTags: ['Inbox'],
    }),

    /**
     * OPTIMISTIC, and it reverts the ONE mark rather than reloading the queue.
     *
     * A card that no longer belongs in the tab LEAVES it, and the total follows: that is
     * what "unread: 12" going to "unread: 11" means, and it has to happen at the click or
     * the count is a number nobody believes.
     *
     * `keep` IS THE EXCEPTION, AND IT EXISTS BECAUSE THE FIRST VERSION HAD A BUG: opening a
     * card marks it read, and on the Unread tab that evicted the card the reader had just
     * opened. A card never disappears as a side effect of being READ; it leaves when the
     * reader triages it (the tick, the archive button, `u`, `e`). The count drops either
     * way, because the count is about unread and it genuinely just changed.
     */
    markInbox: build.mutation<
      void,
      { responseId: string; action: MarkAction; keep?: boolean | undefined; args: InboxArgs }
    >({
      query: ({ responseId, action }) => ({ url: `/inbox/${responseId}/${action}`, method: 'POST' }),
      onQueryStarted: async ({ responseId, action, keep, args }, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          inboxApi.util.updateQueryData('getInbox', args, (draft) => {
            for (const page of draft.pages) {
              const index = page.data.findIndex((card) => card.id === responseId);
              const card = page.data[index];
              if (!card) continue;
              const marked = applyMark(card, action);
              // The total counts the cards that belong in this tab, so it moves by whether
              // THIS card did before and does after. (Counting every card that no longer
              // belonged subtracted an opened-and-kept card a second time on the next mark.)
              const delta = Number(belongsIn(marked, args.tab)) - Number(belongsIn(card, args.tab));
              if (keep || belongsIn(marked, args.tab)) page.data[index] = marked;
              else page.data.splice(index, 1);
              for (const each of draft.pages) each.meta.total = Math.max(0, each.meta.total + delta);
              break;
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    getMessages: build.query<Page<InboxMessage>, void>({
      query: () => '/inbox/messages',
      providesTags: [{ type: 'Inbox', id: 'MESSAGES' }],
    }),

    /**
     * Applied locally FIRST, like the comment queue: a message the reader has plainly just
     * opened should not sit there looking unread while a request flies. Unlike the queue
     * there is NO revert: the only consequence of a lost mark is a bold row that comes back
     * on the next load, and a message that silently un-reads itself mid-read is the more
     * alarming of the two failures.
     */
    markMessage: build.mutation<void, { id: string; action: 'read' | 'unread' }>({
      query: ({ id, action }) => ({ url: `/inbox/messages/${id}/${action}`, method: 'POST' }),
      onQueryStarted: ({ id, action }, { dispatch }) => {
        dispatch(
          inboxApi.util.updateQueryData('getMessages', undefined, (page) => {
            const row = page.data.find((message) => message.id === id);
            if (row) row.read = action === 'read';
          }),
        );
      },
    }),
  }),
});

export const {
  useGetInboxInfiniteQuery,
  useMarkInboxMutation,
  useGetMessagesQuery,
  useMarkMessageMutation,
} = inboxApi;
