// The drill-through. 43 § Interactions, 43 § The drill-through needs a second capability.
//
// *"Each theme drills into its source comments, which is what stops a theme from being an
// unfalsifiable label."* This panel is that sentence. Everything above it on the page is a
// number the engine produced; this is the text the number came from, unedited.
//
// IT CAN 403 ON ITS OWN, AND THAT IS THE POINT. The route carries `response.read` as well
// as `analysis.read`, because verbatim comments are what `40` already priced: *"seeing that
// the average is 4.3 and reading what one person wrote are different levels of access."*
// Somebody who can read this page and not this panel is not a bug — they are the split
// working. So the denial is rendered HERE, inside the panel, with the analysis still on
// screen behind it, exactly as `40` keeps its aggregates when the comments are refused.
import type { ThemeDetail, Valence } from '@endur/shared';
import { ScoreBadge } from '../../../components/data/ScoreBadge.js';
import { Icon } from '../../../components/Icon.js';
import { formatDate } from '../../../lib/format.js';

const WORD: Record<Valence, string> = {
  positive: 'Positive',
  neutral: 'Mixed',
  negative: 'Negative',
};
const TONE: Record<Valence, string> = {
  positive: 'tag-good',
  neutral: 'tag-neutral',
  negative: 'tag-bad',
};

export function ThemePanel({
  detail,
  loading,
  forbidden,
  error,
  onClose,
  subjectWord,
  campaignWord,
}: {
  detail: ThemeDetail | null;
  loading: boolean;
  forbidden: boolean;
  error: Error | null;
  onClose: () => void;
  /** Passed in rather than read from useLabels() here, matching <ResponseCard> — a hotel
   *  calls them something else and this panel must not decide what (INV-001). */
  subjectWord: string;
  campaignWord: string;
}): JSX.Element {
  return (
    <section className="card analysis-panel" aria-live="polite">
      <div className="analysis-panel-head">
        <h3 className="analysis-card-title">
          {detail ? detail.label : 'Source comments'}
        </h3>
        {detail && (
          <>
            <span className={`tag ${TONE[detail.valence]}`}>{WORD[detail.valence]}</span>
            <span className="text-meta">
              {detail.mentions} comment{detail.mentions === 1 ? '' : 's'} · score{' '}
              <span className="num">{detail.score}</span>
            </span>
          </>
        )}
        <button type="button" className="btn btn-ghost analysis-panel-close" onClick={onClose}>
          <Icon name="close" size={16} /> Close
        </button>
      </div>

      {forbidden ? (
        <p className="text-muted">
          You can see the themes but not the comments behind them. Reading what one person
          wrote is a separate permission from seeing the numbers — an administrator can
          change that.
        </p>
      ) : error ? (
        <p className="form-error" role="alert">{error.message}</p>
      ) : loading || !detail ? (
        <div className="analysis-panel-list" aria-busy="true">
          {[0, 1, 2].map((n) => <div key={n} className="skeleton-card" />)}
        </div>
      ) : detail.comments.length === 0 ? (
        <p className="text-muted">No comments came back for this theme.</p>
      ) : (
        <ul className="analysis-panel-list">
          {detail.comments.map((comment) => (
            <li key={`${comment.responseId}:${comment.questionId}`} className="analysis-comment">
              <div className="analysis-comment-head">
                {/* One person's own rating on the response their comment came from. Not an
                    average, so reporting it is not judging it — and the badge is colourless
                    at every value for the same reason (CONF-022). */}
                {comment.score !== null && (
                  <ScoreBadge score={comment.score} max={comment.scoreMax ?? 5} />
                )}
                <span className={`tag ${TONE[comment.valence]}`}>{WORD[comment.valence]}</span>
                <span className="text-meta">{formatDate(comment.at)}</span>
              </div>
              <p className="analysis-comment-text">{comment.comment}</p>
              <p className="text-meta analysis-comment-meta">
                {comment.questionText}
                <span aria-hidden="true"> · </span>
                {campaignWord}: {comment.campaign.name}
                {comment.subject && (
                  <>
                    <span aria-hidden="true"> · </span>
                    {subjectWord}: {comment.subject.name}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
