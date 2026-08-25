// <GrowthChart> — `24` §6b, `71` § Components. Organisations moving, over time.
//
// NO CHARTING LIBRARY (DEC-064) — the same inline-SVG-polyline move `<TrendLine>` made at
// `T-082`, and this is a third placement of the same primitives rather than a second
// approach: shared `.trend-line*` classes, one shared scale across every line, an
// `aria-hidden` `<svg>` paired with a real `<table>` underneath.
//
// PLOTS `movement`, NOT a per-period tier mix. The catalogue placeholder this was built from
// drew `{ period, byTier }[]` — organisations-by-tier over time — but nothing in the product
// records what tier an organisation was on in a PAST period: `subscriptions` holds only the
// CURRENT tier (no history, no `updatedAt` — `schema.prisma:677`, `service.ts` analytics()
// comment) and `platform_audit_log`'s `plan.override` rows are the only tier-change record
// there is. Reconstructing "Gold orgs in March" would mean re-projecting today's audit trail
// backwards onto a month it does not describe, which is precisely what `71`'s own rule
// forbids ("historic figures must not move retroactively"). `movement` — new, upgraded,
// downgraded, churned per period — is what the estate's actual history supports, and
// plotting it here keeps decision 2 intact: four lines, never netted into a growth curve
// that implies a single trend.
export type GrowthChartPoint = {
  period: string;
  new: number;
  upgraded: number;
  downgraded: number;
  churned: number;
};

const SERIES = [
  { key: 'new', label: 'New', tone: 'new' },
  { key: 'upgraded', label: 'Upgraded', tone: 'upgraded' },
  { key: 'downgraded', label: 'Downgraded', tone: 'downgraded' },
  { key: 'churned', label: 'Churned', tone: 'churned' },
] as const;

const W = 320;
const H = 120;
const PAD = 6;

export function GrowthChart({
  series,
}: {
  series: GrowthChartPoint[];
  granularity: 'month' | 'quarter';
}): JSX.Element {
  const count = series.length;
  if (count === 0) {
    return <p className="text-muted">No periods in this window yet.</p>;
  }

  // ONE SHARED SCALE ACROSS ALL FOUR LINES — the same reason `<TrendLine>` gives: scaling
  // each line to its own maximum would draw a single churn as tall as a busy month of signups.
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
              className={`trend-path stroke-movement-${line.tone}`}
              points={series.map((point, index) => `${x(index)},${y(point[line.key])}`).join(' ')}
              vectorEffect="non-scaling-stroke"
            />
            {count === 1 && (
              <circle
                className={`fill-movement-${line.tone}`}
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
            <span className={`trend-key fill-movement-${line.tone}`} aria-hidden="true" />
            {line.label}
          </li>
        ))}
      </ul>

      <div className="trend-axis" aria-hidden="true">
        <span>{series[0]?.period}</span>
        {count > 1 && <span>{series[count - 1]?.period}</span>}
      </div>

      {/* THE CHART, AS NUMBERS — the same reason `<TrendLine>` emits a table: a chart with
          no text equivalent is a blank region to a screen reader. No net column: `71`
          decision 2 has no honest combined figure to put in one. */}
      <table className="sr-only">
        <caption>Organisation movement, over time</caption>
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
