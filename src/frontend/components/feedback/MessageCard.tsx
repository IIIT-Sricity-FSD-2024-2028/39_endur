import { formatRelative } from '../../lib/format.js';
import { Icon } from '../Icon.js';

export function MessageCard({
  subject,
  body,
  at,
  read,
  onMark,
}: {
  subject: string;
  body: string;
  at: string;
  read: boolean;
  onMark: (action: 'read' | 'unread') => void;
}): JSX.Element {
  return (
    <article className={`message-card${read ? '' : ' is-unread'}`}>
      <header className="message-head">
        <span className="message-from text-meta">
          <Icon name="inbox" size={16} /> Endur
        </span>
        <time className="text-meta" dateTime={at}>{formatRelative(at)}</time>
      </header>
      <h3 className="message-subject">{subject}</h3>
      {/* `white-space: pre-wrap` in the stylesheet — an operator typing two paragraphs into a
          textarea has written two paragraphs, and collapsing them is the product editing
          somebody's message on the way past. */}
      <p className="message-body">{body}</p>
      {/* BOTH DIRECTIONS, like the comment queue (`58`). "I will deal with this later" is a
          real thing a reader wants to say to a message from their vendor, and a read mark
          that cannot be undone makes the first click a decision. */}
      <button
        type="button"
        className="btn btn-ghost btn-sm message-mark"
        onClick={() => onMark(read ? 'unread' : 'read')}
      >
        {read ? 'Mark as unread' : 'Mark as read'}
      </button>
    </article>
  );
}
