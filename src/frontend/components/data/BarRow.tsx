// <BarRow> — 24 §3, the workhorse.
//
// Stat breakdowns, results distributions, per-subject shares, theme scores. One bar, one
// label, one number, and a `total` it is a share of — so two bars in a list are comparable
// without reading the numbers.
//
// Default tone is `accent`, a single colour. Valence tones are for when good and bad are
// genuinely the meaning (21 §8) — a colour that means "bad" on a chart where nothing is bad
// teaches the reader to ignore colour.
export type BarRowProps = {
  label: string;
  value: number;
  total: number;
  tone?: 'accent' | 'good' | 'neutral' | 'bad';
  /**
   * The results distribution shows count AND percent in separate columns
   * (design_specs/design/08 §8.1). Off by default: a four-item stat breakdown does not need
   * two numbers per row, and the second one would be the one nobody reads.
   */
  showPercent?: boolean;
};

export function BarRow({
  label, value, total, tone = 'accent', showPercent = false,
}: BarRowProps): JSX.Element {
  // Derived here rather than taken as a prop, even though `ResultsView` also carries a
  // `percent` the server computed. One source means the bar's width and the number beside
  // it cannot disagree — and a bar that disagrees with its own label is worse than no bar.
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`bar-row${showPercent ? ' has-percent' : ''}`}>
      <span className="bar-label">{label}</span>
      {/* Never colour alone (21 §8): the number is always rendered beside the bar. */}
      <span className="bar-track">
        <span
          className={`bar-fill fill-${tone === 'accent' ? 'accent' : tone}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="bar-value num">{value}</span>
      {showPercent && <span className="bar-percent num">{percent}%</span>}
    </div>
  );
}
