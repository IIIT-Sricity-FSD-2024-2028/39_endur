// The recent-response strip. 46 § Interactions, design_specs/design/04 §4.1.
//
// ABSENT without `response.read` — the caller never receives the key, so there is nothing
// here to hide. Everything in it has already passed the k-anonymity gate on the server: a
// comment from a three-response campaign never reaches this component, because reading one
// here would defeat the gate on `40` one dashboard at a time.
import type { HomeView } from '@endur/shared';
import { formatRelative } from '../../../lib/format.js';

export function Recent({
  comments,
  subjectWord,
}: {
  comments: NonNullable<HomeView['recentComments']>;
  subjectWord: string;
}): JSX.Element {
  return (
    <section className="card home-recent">
      <h2 className="section-title">Recent responses</h2>

      {comments.length === 0 ? (
        <p className="text-muted">Nothing has come in yet.</p>
      ) : (
        <ul className="home-recent-list">
          {comments.map((comment) => (
            <li className="home-recent-item" key={`${comment.submittedAt}:${comment.text}`}>
              <span className="home-dot" aria-hidden="true" />
              <div>
                <p className="home-recent-text">{comment.text}</p>
                <p className="text-meta">
                  {comment.subjectName ?? `No ${subjectWord.toLowerCase()}`} ·{' '}
                  {formatRelative(comment.submittedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* design_specs/design/04 §4.1 draws a "View all →" here and it is deliberately
          absent: these comments come from several campaigns, the payload does not say
          which, and a cross-campaign response inbox is P3 by name (40 § Out of scope). A
          link to the wrong page is worse than no link. */}
    </section>
  );
}
