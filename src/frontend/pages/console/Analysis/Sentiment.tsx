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
  confidence: 'low' | 'medium' | 'high';
  commentCount: number;
}): JSX.Element {
  const total = positive + neutral + negative;
  const parts = [
    { key: 'good', label: 'Positive', value: positive },
    { key: 'neutral', label: 'Neutral', value: neutral },
    { key: 'bad', label: 'Negative', value: negative },
  ] as const;

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
