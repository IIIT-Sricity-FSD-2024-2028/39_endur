// One question's numbers. 40 § Interactions, design_specs/design/08 §8.1.
//
// The rule this file exists to hold: **single-colour fill, always, with one exception.**
// Colouring rating 1 red and rating 5 green is interpretation, and interpretation is the
// Analyze layer (`43`, P3). Results states what happened; it does not judge it.
//
// The exception is NPS, and it is an exception because the instrument itself defines a 0–6
// as a detractor — the colour repeats a definition rather than making an inference. That is
// why `valence` arrives in the DTO (CONF-004) and is never derived from a number here.
//
// Named QuestionResult, not QuestionCard, because `components/form/QuestionCard.tsx` is a
// different thing entirely and two files with one name is how the wrong one gets imported.
import type { QuestionSummary } from '@endur/shared';
import { BarRow } from '../../../components/data/BarRow.js';
import { StackedBar } from '../../../components/data/StackedBar.js';
import { KIND_LABELS } from '../../../components/form/kinds.js';

export function QuestionResult({
  question,
  index,
  responseCount,
}: {
  question: QuestionSummary;
  index: number;
  responseCount: number;
}): JSX.Element {
  const distribution = question.distribution ?? [];
  // `Rating 1–5` rather than the builder's generic `Rating scale`: the distribution's own
  // length carries the max, so the label can say what was actually asked without the
  // results DTO having to carry the config.
  const type =
    question.kind === 'rating' && distribution.length > 0
      ? `Rating 1–${distribution.length}`
      : KIND_LABELS[question.kind];

  return (
    <article className="qr-card">
      <header className="qr-head">
        <h3 className="qr-title">Q{index + 1} · {question.text}</h3>
        <p className="qr-meta text-meta">
          {type}
          {question.kind === 'text' && responseCount > 0
            ? ` · ${question.answered} of ${responseCount} answered`
            : ` · ${question.answered} answer${question.answered === 1 ? '' : 's'}`}
        </p>
      </header>

      {/* Display type beside the count, no badge and no threshold colour — see CONF-016.
          <ScoreBadge> is catalogued and deliberately not built. */}
      {typeof question.average === 'number' && (
        <p className="qr-average">
          {question.average.toFixed(1)} <span className="text-meta">avg</span>
        </p>
      )}

      {question.npsMix ? (
        <div className="qr-nps">
          <StackedBar
            good={question.npsMix.promoters}
            neutral={question.npsMix.passives}
            bad={question.npsMix.detractors}
          />
          <p className="qr-score">
            NPS <strong className="num">{question.npsMix.score > 0 ? '+' : ''}{question.npsMix.score}</strong>
          </p>
        </div>
      ) : (
        distribution.length > 0 && (
          <div className="qr-bars">
            {distribution.map((bucket) => (
              <BarRow
                key={bucket.label}
                label={bucket.label}
                value={bucket.count}
                total={question.answered}
                showPercent
                // No `tone`. The default is the single accent, and there is no branch here
                // that could make it anything else — which is the point.
              />
            ))}
          </div>
        )
      )}

      {question.kind === 'text' && (
        // Free text has no distribution and never will. The words themselves are behind
        // `response.read`, a different capability, and live in the comments section below.
        <p className="text-meta qr-empty">
          {question.answered === 0
            ? 'Nobody has written anything here yet.'
            : 'What people wrote is in the comments below.'}
        </p>
      )}

      {question.answered === 0 && question.kind !== 'text' && (
        <p className="text-meta qr-empty">No answers to this one yet.</p>
      )}
    </article>
  );
}
