import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { InboxMessage, InboxState } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ResponseCard } from '../../../components/feedback/ResponseCard.js';
import { MessageCard } from '../../../components/feedback/MessageCard.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import {
  useInbox,
  useMessages,
  type MarkAction,
  type MessagesController,
} from '../../../lib/inbox.js';
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

const MESSAGES_TAB = 'endur';

export default function Inbox(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const raw = params.get('state');
  const showingMessages = raw === MESSAGES_TAB;
  const state: InboxState = isState(raw) ? raw : 'unread';
  const campaignId = params.get('campaignId') ?? undefined;
  const subjectId = params.get('subjectId') ?? undefined;
  const filtered = Boolean(campaignId ?? subjectId);

  const inbox = useInbox(
    {
      state,
      ...(campaignId ? { campaignId } : {}),
      ...(subjectId ? { subjectId } : {}),
    },
    can('response.read') && !showingMessages,
  );

  const messages = useMessages(showingMessages);
  const messageRows = messages.data?.data ?? [];
  const unreadMessages = messageRows.filter((row) => !row.read).length;
  const campaigns = useCampaignList();
  const subjects = useSubjectList({});

  const cards = useMemo(() => inbox.data?.data ?? [], [inbox.data]);

  const [expanded, setExpanded] = useState<string | null>(null);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
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
        {/* A DIFFERENT STREAM, IN THE SAME ROW — DEC-101. Last, because it is the one people
            open least; and with its own count, for the reason Unread has one. */}
        <button
          type="button"
          role="tab"
          aria-selected={showingMessages}
          className={`tab ${showingMessages ? 'is-active' : ''}`}
          onClick={() => setParam('state', MESSAGES_TAB)}
        >
          From Endur
          {unreadMessages > 0 && <span className="tab-count">{unreadMessages}</span>}
        </button>
      </nav>

      {/* THE FILTERS BELONG TO THE COMMENT QUEUE AND GO WITH IT. A campaign selector above a
          message from your vendor is a control that cannot do anything to what is under it,
          and the keyboard legend is about a queue this tab does not have. */}
      {!showingMessages && (
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
      )}

      {showingMessages ? (
        <MessageStream messages={messages} rows={messageRows} />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

function MessageStream({
  messages,
  rows,
}: {
  messages: MessagesController;
  rows: InboxMessage[];
}): JSX.Element {
  if (messages.loading && rows.length === 0) {
    return (
      <div className="message-list" aria-busy="true">
        {[0, 1].map((n) => <div key={n} className="skeleton-card" />)}
      </div>
    );
  }

  if (messages.error) {
    return (
      <p className="form-error" role="alert">
        That did not load. {messages.error.message}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="inbox"
        title="Nothing from Endur"
        body="Messages from us about your account land here. There are none."
      />
    );
  }

  return (
    <div className="message-list">
      {rows.map((row) => (
        <MessageCard
          key={row.id}
          subject={row.subject}
          body={row.body}
          at={row.at}
          read={row.read}
          onMark={(action) => void messages.mark(row.id, action)}
        />
      ))}
    </div>
  );
}

function Empty({
  state,
  filtered,
  onClear,
  campaignWord,
}: {
  state: InboxState;
  filtered: boolean;
  onClear: () => void;
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
  return (
    <EmptyState
      icon="inbox"
      title="No written feedback yet"
      body="Comments appear here once people start answering."
      action={<Link className="btn btn-primary" to="/app/campaigns">Go to {campaignWord.toLowerCase()}</Link>}
    />
  );
}
