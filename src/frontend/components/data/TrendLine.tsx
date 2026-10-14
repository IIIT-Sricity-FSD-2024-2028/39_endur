import type { ReactNode } from 'react';

export type TrendSeries = {
  key: string;
  label: string;
  tone: 'good' | 'neutral' | 'bad';
  points: number[];
};

const W = 320;
const H = 120;
const PAD = 6;

export function TrendLine({
  labels,
  series,
  caption,
  empty,
}: {
  labels: string[];
  series: TrendSeries[];
  caption: string;
  empty?: ReactNode;
}): JSX.Element {
  const count = labels.length;
  if (count === 0) return <>{empty ?? null}</>;

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
