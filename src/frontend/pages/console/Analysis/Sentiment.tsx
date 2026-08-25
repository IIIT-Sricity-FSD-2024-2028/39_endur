// The sentiment donut. 43 § Interactions, design_specs/design/08 §8.2.
//
// PAGE-LOCAL, not an inventory entry. `24` §1 refuses indirection without benefit and the
// inbox set the precedent for controls; this is a `<div>` with a conic gradient and three
// numbers, it has exactly one caller in the product, and a catalogued `<SentimentDonut>`
// would be a prop contract fixed around a single use. `43` § Components names two new
// components — a line chart and a theme table — and this is deliberately not a third.
//
// NEGATIVE IS THE STATUS RAMP AND NEVER THE ACCENT. The mockup was drawn against the old
// warm palette where the accent WAS terracotta and reading it as "bad" worked. In blue it
// does not: the brand colour cannot also mean somebody is unhappy (CONF-004,
// design_specs/design/08 § "corrections required").
import { ConfidenceTag } from './Confidence.js';

const TONES = ['good', 'neutral', 'bad'] as const;

export function Sentiment({
  positive,
  neutral,
  negative,
  commentCount,
  confidence,
}: {
  positive: number;
  neutral: number;
  negative: number;
  /** On the heading, every time. A split quoted off this page without it is a split
   *  somebody will read as a fact about the organisation rather than about 41 comments. */
  confidence: 'low' | 'medium' | 'high';
  /** Written answers, not responses. Two comments on one response are two readings here
   *  and one person in the reliability strip, and saying so is the difference between the
   *  two numbers looking wrong and looking like what they are. */
  commentCount: number;
}): JSX.Element {
  const total = positive + neutral + negative;
  const parts = [
    { key: 'good', label: 'Positive', value: positive },
    { key: 'neutral', label: 'Neutral', value: neutral },
    { key: 'bad', label: 'Negative', value: negative },
  ] as const;

  // Degrees, cumulative. Computed here rather than as three widths because a conic gradient
  // needs the boundaries, and rounding each slice independently leaves a hairline gap.
  // The three tokens are named EXPLICITLY rather than built from the key. Interpolating
  // `--status-${key}-500` reads well and produces `--status-neutral-500`, which does not
  // exist — a custom property that resolves to nothing paints nothing, silently. That is
  // `D-030`'s whole family of bugs, and it is one template literal away at all times.
  const TOKEN: Record<(typeof parts)[number]['key'], string> = {
    good: 'var(--status-good-500)',
    neutral: 'var(--color-neutral-400)',
    bad: 'var(--status-bad-500)',
  };

  let sweep = 0;
  const stops = parts.map((part) => {
    const from = sweep;
    sweep += total > 0 ? (part.value / total) * 360 : 0;
    return `${TOKEN[part.key]} ${from}deg ${sweep}deg`;
  });

  return (
    <section className="card analysis-card">
      <div className="analysis-card-head">
        <h3 className="analysis-card-title">Sentiment</h3>
        <ConfidenceTag level={confidence} />
      </div>
      <div className="donut-row">
        <div
          className="donut"
          aria-hidden="true"
          style={
            total > 0
              ? { background: `conic-gradient(${stops.join(', ')})` }
              : undefined
          }
        />
        {/* NEVER COLOUR ALONE (21 §8), and this is the reading the donut is decoration for.
            A ring with three wedges and no numbers is unreadable in greyscale and to about
            one man in twelve — and it is the numbers people quote anyway. */}
        <ul className="donut-legend">
          {parts.map((part, index) => (
            <li key={part.key}>
              <span className={`donut-key fill-${TONES[index]}`} aria-hidden="true" />
              <span className="donut-label">{part.label}</span>
              <span className="num">{part.value}</span>
              <span className="text-meta">
                {total > 0 ? `${Math.round((part.value / total) * 100)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-meta analysis-card-foot">
        {commentCount} written answer{commentCount === 1 ? '' : 's'} read
      </p>
    </section>
  );
}
