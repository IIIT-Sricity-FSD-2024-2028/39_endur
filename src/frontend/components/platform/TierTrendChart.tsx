// <TierTrendChart> — `71` § Revenue, DEC-080. Which plans people are buying, over time.
//
// IT PLOTS PURCHASES, NOT A TIER CENSUS, and the distinction is load-bearing. `subscriptions`
// holds only the CURRENT tier with no history — `<GrowthChart>`'s header records the same
// limit at length — so "how many organisations were on Gold in March" cannot be answered
// without re-projecting today's rows onto a month they do not describe, which `71`'s own rule
// ("historic figures must not move retroactively") forbids. What the ledger genuinely knows
// is what was BOUGHT, and when. The caption says so, in those words, on the page.
//
// THREE LINES, NOT FOUR. Enterprise is never purchased — `16` §4 prices it individually and
// `joinTier` refuses it — so a fourth line would be structurally flat at zero forever, which
// reads as "nobody wants it" rather than "it is not on sale".
//
// ONE SHARED SCALE, the same reason `<GrowthChart>` gives: scaling each line to its own
// maximum would draw one bronze signup as tall as a busy month of gold.
const SERIES = [
  { key: 'bronze', label: 'Bronze' },
  { key: 'silver', label: 'Silver' },
  { key: 'gold', label: 'Gold' },
] as const;

export type TierTrendPoint = { period: string; bronze: number; silver: number; gold: number };

const W = 320;
const H = 120;
const PAD = 6;

export function TierTrendChart({ series }: { series: TierTrendPoint[] }): JSX.Element {
  const count = series.length;
  if (count === 0) {
    return <p className="text-muted">No periods in this window yet.</p>;
  }

  const peak = Math.max(1, ...series.flatMap((point) => SERIES.map((line) => point[line.key])));

  const x = (index: number): number =>
    count === 1 ? W / 2 : PAD + (index * (W - PAD * 2)) / (count - 1);
  const y = (value: number): number => H - PAD - (value / peak) * (H - PAD * 2);

  return (
    <div className="trend-line">
      <svg
        className="trend-line-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        {SERIES.map((line) => (
          <g key={line.key}>
            <polyline
              className={`trend-path stroke-tier-${line.key}`}
              points={series.map((point, index) => `${x(index)},${y(point[line.key])}`).join(' ')}
              vectorEffect="non-scaling-stroke"
            />
            {count === 1 && (
              <circle
                className={`fill-tier-${line.key}`}
                cx={x(0)}
                cy={y(series[0]?.[line.key] ?? 0)}
                r={3}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
      </svg>

      <ul className="trend-legend">
        {SERIES.map((line) => (
          <li key={line.key}>
            <span className={`trend-key fill-tier-${line.key}`} aria-hidden="true" />
            {line.label}
          </li>
        ))}
      </ul>

      <div className="trend-axis" aria-hidden="true">
        <span>{series[0]?.period}</span>
        {count > 1 && <span>{series[count - 1]?.period}</span>}
      </div>

      <table className="sr-only">
        <caption>Plans purchased per period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {SERIES.map((line) => (
              <th key={line.key} scope="col">{line.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.period}>
              <th scope="row">{point.period}</th>
              {SERIES.map((line) => (
                <td key={line.key}>{point[line.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
