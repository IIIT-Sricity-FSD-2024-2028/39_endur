// <TrendLine> — 24 §3, new at T-082 for `43` § Interactions ("sentiment over time").
//
// INLINE SVG, AND NO CHARTING LIBRARY. `24` §10 reserved Recharts "for the P3 analysis
// dashboard only" and `43` § Components repeated it; DEC-064 supersedes both, because the
// mockup this ports (`design_specs/design/08` §8.2) is ALREADY an inline SVG polyline and a
// conic gradient. There was nothing to convert. Adding ~90KB and a dependency to draw two
// polylines is the indirection-without-benefit `24` §1 refuses, one layer down.
//
// A CHART IS NOT A PICTURE OF DATA, IT IS A SECOND RENDERING OF IT. The `<svg>` is
// `aria-hidden` and the same numbers are emitted as a real table underneath, visually
// hidden. A line chart with no text equivalent is a blank region to a screen reader, and
// the numbers exist either way — refusing to send them is a choice, not a limitation.
import type { ReactNode } from 'react';

export type TrendSeries = {
  key: string;
  label: string;
  /** Named for the ramp, never for the accent: blue is the product and cannot also mean
   *  "people are unhappy" (CONF-004, design_specs/design/08 § corrections). */
  tone: 'good' | 'neutral' | 'bad';
  points: number[];
};

/** The drawing box. Arbitrary units — the SVG scales to its container; only the RATIO
 *  matters, and a 8:3 box is the mockup's. */
const W = 320;
const H = 120;
const PAD = 6;

export function TrendLine({
  labels,
  series,
  caption,
  empty,
}: {
  /** One per point, in order. Dates, already formatted — this component does no formatting
   *  and knows no locale. */
  labels: string[];
  series: TrendSeries[];
  /** Names the chart for a screen reader, and captions the hidden table. Required: a
   *  region announced as nothing at all is worse than a wrong name. */
  caption: string;
  empty?: ReactNode;
}): JSX.Element {
  const count = labels.length;
  if (count === 0) return <>{empty ?? null}</>;

  // ONE SHARED SCALE ACROSS ALL THREE LINES. Scaling each series to its own maximum would
  // draw a negative line that ran along the top of the chart while it counted four
  // comments, which is a picture of the opposite of what happened.
  const peak = Math.max(1, ...series.flatMap((line) => line.points));

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
        {series.map((line) => (
          <g key={line.key}>
            <polyline
              className={`trend-path stroke-${line.tone}`}
              points={line.points.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
              /* Without this the non-uniform scale that lets the chart fill any width would
                 stretch the stroke with it, and a wide card would draw three fat smears. */
              vectorEffect="non-scaling-stroke"
            />
            {/* A single day is a dot, not a line. A polyline of one point draws nothing at
                all, which would render an empty chart for a campaign that closed today. */}
            {count === 1 && (
              <circle
                className={`trend-dot fill-${line.tone}`}
                cx={x(0)}
                cy={y(line.points[0] ?? 0)}
                r={3}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
      </svg>

      {/* Never colour alone (21 §8): the legend names every line in words. */}
      <ul className="trend-legend">
        {series.map((line) => (
          <li key={line.key}>
            <span className={`trend-key fill-${line.tone}`} aria-hidden="true" />
            {line.label}
          </li>
        ))}
      </ul>

      <div className="trend-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        {count > 1 && <span>{labels[count - 1]}</span>}
      </div>

      {/* THE CHART, AS NUMBERS. Visually hidden, fully readable. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((line) => (
              <th key={line.key} scope="col">{line.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {series.map((line) => (
                <td key={line.key}>{line.points[index] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
