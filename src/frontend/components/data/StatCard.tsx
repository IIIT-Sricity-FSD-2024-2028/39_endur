// <StatCard> — 24 §3.
//
// One number, said once, with the words that make it mean something. `context` is where
// "of 214" or "since March" goes; `delta` is a change with a direction, and it only ever
// appears where a direction is real.
import type { Valence } from '@endur/shared';
import { BarRow, type BarRowProps } from './BarRow.js';

const TONE: Record<Valence, string> = {
  positive: 'tag-good',
  neutral: 'tag-neutral',
  negative: 'tag-bad',
};

export function StatCard({
  kicker,
  value,
  delta,
  context,
  breakdown,
}: {
  kicker: string;
  value: string | number;
  delta?: { value: number; valence: Valence } | undefined;
  context?: string | undefined;
  breakdown?: BarRowProps[] | undefined;
}): JSX.Element {
  return (
    <div className="stat-card">
      <p className="utility stat-kicker">{kicker}</p>
      <p className="kpi stat-value">{value}</p>
      {delta && (
        <span className={`tag ${TONE[delta.valence]} stat-delta`}>
          {delta.value > 0 ? '▲' : delta.value < 0 ? '▼' : '■'} {Math.abs(delta.value)}
        </span>
      )}
      {context && <p className="text-meta stat-context">{context}</p>}
      {breakdown && breakdown.length > 0 && (
        <div className="stat-breakdown">
          {breakdown.map((bar) => (
            <BarRow key={bar.label} {...bar} />
          ))}
        </div>
      )}
    </div>
  );
}
