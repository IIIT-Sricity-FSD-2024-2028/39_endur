import { useState } from 'react';
import type { ResponseItem } from '@endur/shared';
import { formatRelative } from '../../../lib/format.js';
import { newSince } from './stats.js';

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
  seenBefore: string | null;
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
        <button type="button" className="btn btn-secondary" onClick={onMore}>
          Load more
        </button>
      )}
    </section>
  );
}
