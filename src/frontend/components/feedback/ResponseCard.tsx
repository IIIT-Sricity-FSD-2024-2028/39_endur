// <ResponseCard> — 24 §6c, 58, design_specs/design/08 §8.3.
//
// One free-text response in the inbox: the score badge, the comment, the subject tag, and
// the read state. Expanding shows the question that drew the comment and the campaign it
// came from.
//
// WHAT IS NOT A PROP HERE, AND WILL NOT BE UNTIL 43 EXISTS: sentiment, emotion, intent,
// topic. The mockup draws all four; all four need the Analyze layer. A component with four
// props nothing can fill is a component that invites a stub, and a stubbed sentiment chip
// is a confident wrong answer printed next to somebody's words.
//
// `subjectWord` is passed in rather than read from useLabels() inside — the same rule as
// <UnitTree> (INV-001, 24 §6c): a presentation component that reaches for a context is one
// that cannot be rendered in a test or a preview.
import type { InboxResponse } from '@endur/shared';
import { ScoreBadge } from '../data/ScoreBadge.js';
import { Icon } from '../Icon.js';
import { formatDate } from '../../lib/format.js';

export function ResponseCard({
  response,
  read,
  archived,
  expanded,
  onToggleExpand,
  onToggleRead,
  onArchive,
  subjectWord,
  selected = false,
  error,
}: {
  response: InboxResponse;
  read: boolean;
  archived: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleRead: () => void;
  onArchive: () => void;
  subjectWord: string;
  /** Keyboard focus, for j/k. Visual only — it does not mark anything. */
  selected?: boolean;
  /** An optimistic mark that failed, shown ON the card. Never a toast (58 § States). */
  error?: string | undefined;
}): JSX.Element {
  const classes = [
    'response-card',
    read ? 'is-read' : 'is-unread',
    archived ? 'is-archived' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} data-response-id={response.id}>
      <div className="response-card-main">
        {response.score !== null && (
          <ScoreBadge score={response.score} {...(response.scoreMax ? { max: response.scoreMax } : {})} />
        )}

        <div className="response-card-body">
          {/* Expanding is what marks it read — never scrolling. A fast scroll that silently
              emptied the queue would empty the one thing this page is for (58 § State). */}
          <button
            type="button"
            className="response-card-comment"
            onClick={onToggleExpand}
            aria-expanded={expanded}
          >
            {response.comment}
          </button>

          <div className="response-card-meta">
            {response.subject && (
              <span className="response-card-tag" title={subjectWord}>
                {response.subject.name}
              </span>
            )}
            <span className="text-muted">{formatDate(response.at)}</span>
            {!read && <span className="response-card-dot" aria-label="Unread" />}
          </div>

          {expanded && (
            <div className="response-card-detail">
              <p className="response-card-question">{response.questionText}</p>
              <p className="text-muted">{response.campaign.name}</p>
            </div>
          )}

          {error && <p className="response-card-error">{error}</p>}
        </div>

        {/* Every keyboard shortcut is also a button (26). A queue worked with a mouse is a
            queue nobody works through, but a shortcut with no visible equivalent is a
            feature only its author can use. */}
        <div className="response-card-actions">
          <button
            type="button"
            className="btn btn-secondary btn-icon response-card-btn"
            onClick={onToggleRead}
            title={read ? 'Mark unread (u)' : 'Mark read (u)'}
          >
            <Icon name={read ? 'unread' : 'check'} size={16} />
            <span className="sr-only">{read ? 'Mark unread' : 'Mark read'}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon response-card-btn"
            onClick={onArchive}
            title={archived ? 'Restore (e)' : 'Archive (e)'}
          >
            {/* No <ConfirmDialog>. It requires a `consequence` prop (24 §6), and this one
                affects only the caller and is reversible from the Archived tab. */}
            <Icon name={archived ? 'restore' : 'archive'} size={16} />
            <span className="sr-only">{archived ? 'Restore' : 'Archive'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
