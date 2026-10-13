import { useEffect, useRef, useState } from 'react';
import type { UnitNode } from '@endur/shared';
import type { ResolvedLabels } from '@endur/shared';
import { forestTotals, type Totals } from '../../../lib/unitTotals.js';

function perLevel(nodes: UnitNode[], depth = 0, into: number[] = []): number[] {
  nodes.forEach((node) => {
    into[depth] = (into[depth] ?? 0) + 1;
    perLevel(node.children, depth + 1, into);
  });
  return into;
}

function useCountUp(value: number, duration = 520): number {
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) {
      setShown(value);
      return;
    }
    done.current = true;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || value === 0) {
      setShown(value);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  const shown = useCountUp(value);
  return (
    <div className="stat-tile">
      <span className="utility">{label}</span>
      <span className="stat-value num">{shown}</span>
    </div>
  );
}

export function Overview({
  nodes,
  totals,
  labels,
}: {
  nodes: UnitNode[];
  totals: Totals | null;
  labels: ResolvedLabels;
}): JSX.Element | null {
  const levels = perLevel(nodes);
  const sums = forestTotals(nodes, totals);
  if (sums.units === 0) return null;

  const widest = Math.max(...levels, 1);

  return (
    <section className="structure-overview" aria-label="Overview">
      <div className="stat-row">
        <Stat label={labels.unit.many} value={sums.units} />
        <Stat label="Levels" value={levels.length} />
        <Stat label="People" value={sums.people} />
        <Stat label={labels.subject.many} value={sums.subjects} />
      </div>

      {/* Only worth drawing once there is more than one level to compare. */}
      {levels.length > 1 && (
        <div className="shape-chart">
          <p className="utility shape-chart-title">
            {labels.unit.many} per level
          </p>
          <ol className="shape-bars">
            {levels.map((count, depth) => (
              <li className="shape-bar-row" key={depth}>
                <span className="shape-bar-label num">{depth + 1}</span>
                <span className="shape-bar-track">
                  <span
                    className="shape-bar-fill"
                    style={{
                      width: `${(count / widest) * 100}%`,
                      animationDelay: `${depth * 90}ms`,
                    }}
                  />
                </span>
                <span className="shape-bar-count num">{count}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
