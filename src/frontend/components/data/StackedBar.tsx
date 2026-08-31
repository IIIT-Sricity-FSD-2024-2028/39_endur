// <StackedBar> — 24 §3, design_specs/design/08 §8.1.
//
// THREE COLOURS, AND EXACTLY ONE LEGITIMATE CALLER: the NPS mix.
//
// `40` is emphatic that results describe rather than judge — "do not colour rating 1 red and
// rating 5 green, that is interpretation". NPS is the one exception in the product and it is
// an exception for a reason that generalises: the instrument itself defines a 0–6 as a
// detractor. The colour is repeating a definition, not making an inference (CONF-004), which
// is why `Valence` arrives in the DTO rather than being derived from the number here.
//
// If a second caller ever appears, that is the moment to check it is not a rating in
// disguise.
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
