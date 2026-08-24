// The inbox — 58 § State, 23 §3.
//
// A queue, not a list. The difference is that a queue has a working copy: marking a card
// read has to happen NOW, on a page of four hundred, and a spinner on each card is worse
// than an occasional revert (58 § State). So every mark is optimistic and reverts in place.
//
// `state`, the filters and the cursor live in the URL, so a filtered queue is a link
// somebody can paste — the same rule as `40`'s filters.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxQuery, InboxResponse, InboxState, Page } from '@endur/shared';
import { ApiError, apiGet, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type MarkAction = 'read' | 'unread' | 'archive' | 'unarchive';

export type InboxController = Loadable<Page<InboxResponse>> & {
  /** Absent capability, not an empty queue — the page renders a 403 rather than "up to date". */
  forbidden: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  reload: () => Promise<void>;
  mark: (responseId: string, action: MarkAction, opts?: { keep?: boolean }) => Promise<void>;
  /** Per-card failure, keyed by response id. Inline on the card — never a toast (58 § States). */
  failures: Record<string, string>;
};

export function inboxSearch(query: Partial<InboxQuery>): string {
  const params = new URLSearchParams();
  if (query.state) params.set('state', query.state);
  if (query.campaignId) params.set('campaignId', query.campaignId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** What a mark does to a card, applied locally before the request leaves. */
function applyMark(card: InboxResponse, action: MarkAction): InboxResponse {
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
function belongsIn(card: InboxResponse, state: InboxState): boolean {
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

export function useInbox(query: Partial<InboxQuery>, enabled = true): InboxController {
  const [state, setState] = useState<Loadable<Page<InboxResponse>>>({
    data: null, loading: true, error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const alive = useRef(true);

  const tab: InboxState = query.state ?? 'unread';
  const search = inboxSearch(query);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!enabled) return;
      try {
        const params = new URLSearchParams(search.replace(/^\?/, ''));
        if (cursor) params.set('cursor', cursor);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const response = await apiGet<Page<InboxResponse>>(`/inbox${suffix}`);
        if (!alive.current) return;
        setForbidden(false);
        setState((current) => ({
          data:
            cursor && current.data
              ? { ...response, data: [...current.data.data, ...response.data] }
              : response,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (!alive.current) return;
        if (error instanceof ApiError && error.status === 403) {
          setForbidden(true);
          setState({ data: null, loading: false, error: null });
          return;
        }
        // The last good page stays on screen (58 § States). An error above the list is a
        // thing you can recover from; a blank page is not.
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    },
    [enabled, search],
  );

  useEffect(() => {
    alive.current = true;
    setState((current) => ({ ...current, loading: true }));
    void fetchPage();
    return () => {
      alive.current = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    const cursor = state.data?.page.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    if (alive.current) setLoadingMore(false);
  }, [fetchPage, loadingMore, state.data?.page.nextCursor]);

  /**
   * OPTIMISTIC, and it reverts the ONE card rather than reloading the queue.
   *
   * A reload after every tick would renumber the list under the reader's cursor while they
   * work down it, which on a queue is the same as losing their place.
   */
  const mark = useCallback(
    async (responseId: string, action: MarkAction, opts?: { keep?: boolean }) => {
      const before = state.data;
      if (!before) return;

      setFailures((current) => {
        if (!(responseId in current)) return current;
        const next = { ...current };
        delete next[responseId];
        return next;
      });

      const applied = before.data.map((card) =>
        card.id === responseId ? applyMark(card, action) : card,
      );
      // A card that no longer belongs in this tab LEAVES it, and meta.total follows. That
      // is what "unread: 12" going to "unread: 11" means, and it has to happen at the click
      // or the count is a number nobody believes.
      //
      // `keep` IS THE EXCEPTION, AND IT EXISTS BECAUSE THE FIRST VERSION HAD A BUG: opening
      // a card marks it read, and on the Unread tab that evicted the card the reader had
      // just opened — the detail appeared and vanished in the same frame. A card never
      // disappears as a side effect of being READ. It leaves when the reader triages it:
      // the tick, the archive button, `u`, `e`. The count drops either way, because the
      // count is about unread and it genuinely just changed.
      const kept = opts?.keep
        ? applied
        : applied.filter((card) => belongsIn(card, tab));
      const left = applied.filter((card) => !belongsIn(card, tab)).length;
      setState((current) => ({
        ...current,
        data: { ...before, data: kept, meta: { total: Math.max(0, before.meta.total - left) } },
      }));

      try {
        await apiPost<undefined, void>(`/inbox/${responseId}/${action}`);
      } catch (error) {
        if (!alive.current) return;
        setState((current) => ({ ...current, data: before }));
        setFailures((current) => ({
          ...current,
          [responseId]:
            error instanceof ApiError ? error.message : 'That did not save. Try again.',
        }));
      }
    },
    [state.data, tab],
  );

  return {
    ...state,
    forbidden,
    loadMore,
    loadingMore,
    reload: () => fetchPage(),
    mark,
    failures,
  };
}
