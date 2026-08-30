// <MessageCard> — a message from Endur. 24, 58 § From Endur, DEC-101, T-101.
//
// NOT <ResponseCard>. They look alike and they are not the same card: a response card carries
// a campaign, a subject, a score and an archive verb, and every one of those is meaningless
// on a message from your vendor. Reusing it would have meant four props that are always null
// and an archive button that archives nothing — which is how one component becomes two
// components wearing one name.
//
// UNREAD IS A WEIGHT, NOT A DOT. Three messages a year means the tab is almost always empty,
// so the state that has to be legible at a glance is "there is something new here" — and a
// bold row says that without a legend.
//
// THE BODY IS ALWAYS SHOWN. `<ResponseCard>` collapses because a queue of four hundred
// comments has to be scannable; this stream is a handful of rows, and a message from your
// vendor that you have to click to read is a message half of them will not read.
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
