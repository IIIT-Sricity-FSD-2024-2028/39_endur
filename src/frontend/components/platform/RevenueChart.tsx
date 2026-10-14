import { formatMoney } from '@endur/shared';

export type RevenuePoint = { period: string; revenueMinor: number; payments: number };

const W = 320;
const H = 120;
const PAD = 6;

export function RevenueChart({ series }: { series: RevenuePoint[] }): JSX.Element {
  const count = series.length;
  if (count === 0) {
    return <p className="text-muted">No periods in this window yet.</p>;
  }

  const peak = Math.max(1, ...series.map((point) => point.revenueMinor));

  const x = (index: number): number =>
    count === 1 ? W / 2 : PAD + (index * (W - PAD * 2)) / (count - 1);
  const y = (value: number): number => H - PAD - (value / peak) * (H - PAD * 2);

  const line = series.map((point, index) => `${x(index)},${y(point.revenueMinor)}`).join(' ');
  const area = `${x(0)},${H - PAD} ${line} ${x(count - 1)},${H - PAD}`;

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
        <polygon className="revenue-area" points={area} />
        <polyline
          className="trend-path revenue-path stroke-tier-revenue"
          points={line}
          vectorEffect="non-scaling-stroke"
        />
        {count === 1 && (
          <circle
            className="fill-tier-revenue"
            cx={x(0)}
            cy={y(series[0]?.revenueMinor ?? 0)}
            r={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="trend-axis" aria-hidden="true">
        <span>{series[0]?.period}</span>
        <span>Peak {formatMoney(peak)}</span>
        {count > 1 && <span>{series[count - 1]?.period}</span>}
      </div>

      <table className="sr-only">
        <caption>Revenue by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Revenue</th>
            <th scope="col">Payments</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.period}>
              <th scope="row">{point.period}</th>
              <td>{formatMoney(point.revenueMinor)}</td>
              <td>{point.payments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
