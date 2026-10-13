export function StackedBar({
  good,
  neutral,
  bad,
  showLegend = true,
}: {
  good: number;
  neutral: number;
  bad: number;
  showLegend?: boolean;
}): JSX.Element {
  const total = good + neutral + bad;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const parts = [
    { key: 'good', label: 'Promoters', value: good },
    { key: 'neutral', label: 'Passives', value: neutral },
    { key: 'bad', label: 'Detractors', value: bad },
  ] as const;

  return (
    <div className="stacked">
      <div className="stacked-track">
        {parts.map((part) => (
          <span
            key={part.key}
            className={`stacked-part fill-${part.key}`}
            style={{ width: `${share(part.value)}%` }}
          />
        ))}
      </div>
      {/* NEVER COLOUR ALONE (21 §8). The legend is the default rather than an opt-in
          because a bar whose only content is three colours is unreadable in greyscale, on a
          projector, and to about one man in twelve. */}
      {showLegend && (
        <ul className="stacked-legend">
          {parts.map((part) => (
            <li key={part.key}>
              <span className={`stacked-key fill-${part.key}`} aria-hidden="true" />
              {part.label} <span className="num">{part.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
