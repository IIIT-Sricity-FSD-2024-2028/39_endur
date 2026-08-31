// What people actually wrote. 40 § Interactions, design_specs/design/08 §8.1.
//
// This section is ABSENT without `response.read`, not greyed and not empty — the aggregates
// render and this is simply not there. Seeing that the average is 4.3 and reading what one
// person wrote are different levels of access, and a head of department may reasonably have
// the first without the second (40 § Capabilities).
//
// The comments are also the most identifying data in the product: people write in their own
// voice. Below the k-anonymity threshold the server sends none, and this renders the reason
// rather than an empty list.
import { useState } from 'react';
import type { ResponseItem } from '@endur/shared';
import { formatRelative } from '../../../lib/format.js';
import { newSince } from './stats.js';

/** Three, then expand in place (design_specs/design/08 §8.1). Never a second page. */
const PREVIEW = 3;

export function Comments({
  items,
  total,
  hasMore,
  onMore,
  seenBefore,
  subjectWord,
}: {
  items: ResponseItem[];
  total: number;
  hasMore: boolean;
  onMore: () => void;
  /** Timestamp of the first load. Anything after it arrived while the reader watched. */
  seenBefore: string | null;
  /** The org's own noun, from useLabels() — this side of the app has a store. */
  subjectWord: string;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const comments = items.flatMap((item) =>
    item.answers
      .filter((answer) => answer.text.trim().length > 0)
      .map((answer) => ({
        id: `${item.id}:${answer.questionId}`,
        responseId: item.id,
        submittedAt: item.submittedAt,
        subjectName: item.subjectName,
        text: answer.text,
      })),
  );

  const fresh = newSince(
    comments.map((comment) => ({ id: comment.id, submittedAt: comment.submittedAt })),
    seenBefore,
  );
  const shown = expanded ? comments : comments.slice(0, PREVIEW);

  if (comments.length === 0) {
    return (
      <section className="card results-comments">
        <h2 className="section-title">Comments</h2>
        <p className="text-muted">Nobody has written anything yet.</p>
      </section>
    );
  }

  return (
    <section className="card results-comments">
      <h2 className="section-title">Comments</h2>
      <ul className="comment-list">
        {shown.map((comment) => (
          // `.is-new` fades over 600ms. This is what the evaluator sees after scanning, and
          // it should visibly land rather than appear as if it had always been there.
          <li className={`comment${fresh.has(comment.id) ? ' is-new' : ''}`} key={comment.id}>
            <p className="comment-text">{comment.text}</p>
            <p className="comment-meta text-meta">
              {comment.subjectName ?? `No ${subjectWord.toLowerCase()}`} ·{' '}
              {formatRelative(comment.submittedAt)}
            </p>
          </li>
        ))}
      </ul>

      {!expanded && comments.length > PREVIEW && (
        <button type="button" className="btn btn-ghost" onClick={() => setExpanded(true)}>
          Show all {total} comments →
        </button>
      )}
      {expanded && hasMore && (
        // Expanding shows what is loaded; the rest is a cursor away. Two controls rather
        // than one because they answer different questions — "show me the rest of this
        // page" and "fetch the next page" — and merging them would make the second one
        // silently do the first.
        <button type="button" className="btn btn-secondary" onClick={onMore}>
          Load more
        </button>
      )}
    </section>
  );
}
