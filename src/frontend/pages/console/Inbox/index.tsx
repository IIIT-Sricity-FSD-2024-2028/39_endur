// T-080 — /app/inbox. 58, design_specs/design/08 §8.3.
//
// The only screen in the product with a TRIAGE shape rather than a reporting shape, and
// that is its whole reason to exist. `40` answers *what do the numbers say*. This answers
// *what did people actually write*, one comment at a time, in a queue you can work through
// and mark off. An administrator opening it twice a week wants to know what is new since
// last time — not to re-read four hundred.
//
// Two things this page does NOT do, both deliberate:
//
//   1. NO ANALYSIS TAGS. The mockup draws sentiment, emotion, intent and topic on every
//      card; all four need the Analyze layer (43, P3). <ResponseCard> has no prop for them
//      so nobody can stub one in, and a stubbed sentiment chip is a confident wrong answer
//      printed beside somebody's words.
//   2. NO SUPPRESSED PLACEHOLDER. A campaign below the k-anonymity threshold contributes no
//      rows at all — not greyed, not counted, not "3 hidden". The server sends nothing, so
//      the empty queue here is INDISTINGUISHABLE from an org with no comments, which is the
//      point (52 §2).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { InboxState } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ResponseCard } from '../../../components/feedback/ResponseCard.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useInbox, type MarkAction } from '../../../lib/inbox.js';
import { useCampaignList } from '../../../lib/campaigns.js';
import { useSubjectList } from '../../../lib/subjects.js';

const TABS: Array<{ id: InboxState; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'archived', label: 'Archived' },
];

const isState = (value: string | null): value is InboxState =>
  value === 'all' || value === 'unread' || value === 'read' || value === 'archived';

export default function Inbox(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  // Everything that shapes the queue lives in the URL, so a filtered queue is a link
  // somebody can paste — the same rule as 40's filters (58 § State).
  const raw = params.get('state');
  const state: InboxState = isState(raw) ? raw : 'unread';
  const campaignId = params.get('campaignId') ?? undefined;
  const subjectId = params.get('subjectId') ?? undefined;
  const filtered = Boolean(campaignId ?? subjectId);

  // Not asked for at all without the capability. A 403 is handled anyway, but a request
  // nobody may answer is a request not worth making (the same rule as 40's comments).
  const inbox = useInbox(
    {
      state,
      ...(campaignId ? { campaignId } : {}),
      ...(subjectId ? { subjectId } : {}),
    },
    can('response.read'),
  );
  // The filter dropdowns are themselves scope-filtered by their own endpoints, so a
  // filter cannot reach past the scope the queue already applied (INV-003, 40).
  const campaigns = useCampaignList();
  const subjects = useSubjectList({});

  const cards = useMemo(() => inbox.data?.data ?? [], [inbox.data]);

  const [expanded, setExpanded] = useState<string | null>(null);
  /** Which card j/k is sitting on. An index, because the list re-orders under it. */
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const setParam = (key: string, value: string | undefined): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setExpanded(null);
    setCursor(0);
  };

  const clearFilters = (): void => {
    const next = new URLSearchParams(params);
    next.delete('campaignId');
    next.delete('subjectId');
    setParams(next, { replace: true });
    setExpanded(null);
    setCursor(0);
  };

  const mark = (responseId: string, action: MarkAction, keep = false): void => {
    void inbox.mark(responseId, action, { keep });
  };

  /**
   * j/k/e/u. A queue worked with a mouse is a queue nobody works through (58 §
   * Interactions) — and every one of these is ALSO a button on the card, so the page is
   * not two products.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from something being typed into.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const card = cards[cursor];
      switch (event.key) {
        case 'j':
          event.preventDefault();
          setCursor((index) => Math.min(index + 1, Math.max(0, cards.length - 1)));
          return;
        case 'k':
          event.preventDefault();
          setCursor((index) => Math.max(0, index - 1));
          return;
        case 'e':
          if (!card) return;
          event.preventDefault();
          mark(card.id, card.archived ? 'unarchive' : 'archive');
          return;
        case 'u':
          if (!card) return;
          event.preventDefault();
          mark(card.id, card.read ? 'unread' : 'read');
          return;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The absent capability is a full-page 403, not an empty queue. The sidebar item is
  // hidden without `response.read`, so anybody here typed the address (58 § States).
  if (!can('response.read') || inbox.forbidden) {
    return (
      <div className="page">
        <PageHeader title="Inbox" />
        <EmptyState
          icon="inbox"
          title="You do not have access to this"
          body="Reading individual responses is a separate permission from seeing the numbers. Ask an administrator if you need it."
        />
      </div>
    );
  }

  const unreadBadge = state === 'unread' ? inbox.data?.meta.total ?? null : null;

  return (
    <div className="page">
      <PageHeader
        title="Inbox"
        subtitle={`Everything people wrote, one at a time. Marking is yours alone — nobody else's queue changes.`}
        {...(filtered
          ? {
              filters: [
                { label: 'Filtered', onClear: clearFilters },
              ],
            }
          : {})}
      />

      {/* Page-local, and not an inventory entry: a control used by one page is not a
          component (39 sets that precedent for its progress bar). */}
      <nav className="tabs" role="tablist" aria-label="Inbox filter">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={state === tab.id}
            className={`tab ${state === tab.id ? 'is-active' : ''}`}
            onClick={() => setParam('state', tab.id)}
          >
            {tab.label}
            {/* Only Unread carries a count. A badge on Read is a number nobody acts on. */}
            {tab.id === 'unread' && unreadBadge !== null && unreadBadge > 0 && (
              <span className="tab-count">{unreadBadge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="inbox-filters">
        <label className="field-inline">
          <span className="text-muted">{labels.campaign.one}</span>
          <select
            className="input"
            value={campaignId ?? ''}
            onChange={(event) => setParam('campaignId', event.target.value || undefined)}
          >
            <option value="">All</option>
            {(campaigns.data?.data ?? []).map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span className="text-muted">{labels.subject.one}</span>
          <select
            className="input"
            value={subjectId ?? ''}
            onChange={(event) => setParam('subjectId', event.target.value || undefined)}
          >
            <option value="">All</option>
            {(subjects.data?.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        <p className="inbox-keys text-muted">
          <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>e</kbd> archive · <kbd>u</kbd> unread
        </p>
      </div>

      {/* Above the list, and the last good page stays visible underneath (58 § States). */}
      {inbox.error && (
        <p className="form-error" role="alert">
          That did not load. {inbox.error.message}
        </p>
      )}

      {inbox.loading && cards.length === 0 ? (
        <div className="inbox-list" aria-busy="true">
          {[0, 1, 2].map((n) => <div key={n} className="skeleton-card" />)}
        </div>
      ) : cards.length === 0 ? (
        <Empty state={state} filtered={filtered} onClear={clearFilters} campaignWord={labels.campaign.many} />
      ) : (
        <div className="inbox-list" ref={listRef}>
          {cards.map((card, index) => (
            <ResponseCard
              key={`${card.id}:${card.questionId}`}
              response={card}
              read={card.read}
              archived={card.archived}
              selected={index === cursor}
              expanded={expanded === `${card.id}:${card.questionId}`}
              onToggleExpand={() => {
                const key = `${card.id}:${card.questionId}`;
                setExpanded((current) => (current === key ? null : key));
                setCursor(index);
                // Expanding marks read. Scrolling does not — a fast scroll that silently
                // emptied the queue would empty the whole feature (58 § State).
                // `keep`: reading is not triaging. The card stays where it is until the
                // reader ticks or archives it — see lib/inbox.ts.
                if (!card.read) mark(card.id, 'read', true);
              }}
              onToggleRead={() => mark(card.id, card.read ? 'unread' : 'read')}
              onArchive={() => mark(card.id, card.archived ? 'unarchive' : 'archive')}
              subjectWord={labels.subject.one}
              error={inbox.failures[card.id]}
            />
          ))}

          {inbox.data?.page.hasMore && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void inbox.loadMore()}
              disabled={inbox.loadingMore}
            >
              {inbox.loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Three different empties, because they mean three different things and the one people see
 * most is the good one (58 § States).
 */
function Empty({
  state,
  filtered,
  onClear,
  campaignWord,
}: {
  state: InboxState;
  filtered: boolean;
  onClear: () => void;
  /** Passed in, not read from useLabels() here — a hotel's is "Guest surveys" (INV-001). */
  campaignWord: string;
}): JSX.Element {
  if (filtered) {
    return (
      <EmptyState
        icon="inbox"
        title="Nothing matches those filters"
        body="Clear them to see the rest of the queue."
        action={<button type="button" className="btn btn-secondary" onClick={onClear}>Clear filters</button>}
      />
    );
  }
  if (state === 'unread') {
    return <EmptyState icon="check" title="You're up to date" body="Nothing new since you last looked." />;
  }
  if (state === 'archived') {
    return <EmptyState icon="archive" title="Nothing archived" body="Archived comments are kept, not deleted. They land here." />;
  }
  // The no-comments-anywhere case AND the everything-below-threshold case, and they are the
  // same screen on purpose. A different message for the second would announce that
  // suppressed data exists (52 §2).
  return (
    <EmptyState
      icon="inbox"
      title="No written feedback yet"
      body="Comments appear here once people start answering."
      action={<Link className="btn btn-primary" to="/app/campaigns">Go to {campaignWord.toLowerCase()}</Link>}
    />
  );
}
