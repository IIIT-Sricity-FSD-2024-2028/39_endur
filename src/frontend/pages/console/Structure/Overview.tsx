// The band above the map: four counts, and the shape of the tree as a chart. 32.
//
// Every number here is derived from the tree the API already returned — nothing is fetched,
// and nothing is computed that the page could not have counted anyway. It exists because a
// nine-row indented list does not answer "how big is this and how deep does it go" without
// the reader doing the counting themselves.
//
// The bars are units-per-level. That is the one fact about an organisation's shape that the
// list genuinely hides: a flat structure of nine and a chain of nine look identical until
// you count the indents.
import { useEffect, useRef, useState } from 'react';
import type { UnitNode } from '@endur/shared';
import type { ResolvedLabels } from '@endur/shared';

/** Counts every unit at each depth, so index 0 is the roots. */
function perLevel(nodes: UnitNode[], depth = 0, into: number[] = []): number[] {
  nodes.forEach((node) => {
    into[depth] = (into[depth] ?? 0) + 1;
    perLevel(node.children, depth + 1, into);
  });
  return into;
}

function totals(nodes: UnitNode[]): { units: number; people: number; subjects: number } {
  return nodes.reduce(
    (sum, node) => {
      const child = totals(node.children);
      return {
        units: sum.units + 1 + child.units,
        people: sum.people + (node.peopleCount ?? 0) + child.people,
        subjects: sum.subjects + (node.subjectCount ?? 0) + child.subjects,
      };
    },
    { units: 0, people: 0, subjects: 0 },
  );
}

/**
 * Counts up to `value` once, on mount.
 *
 * A number that lands by ticking up reads as a number that was just measured. It is 500ms
 * and it never re-runs on a data change — a count that re-animates every time a unit is
 * renamed is a distraction sitting on top of the thing you are editing.
 *
 * Under reduced-motion it returns the final value immediately. That is the same rule the
 * CSS follows, but `prefers-reduced-motion` cannot reach a JS interpolation, so it is
 * checked here as well.
 */
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
      // Ease-out cubic: fast first, settling. Linear counting looks like a stopwatch.
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
  labels,
}: {
  nodes: UnitNode[];
  labels: ResolvedLabels;
}): JSX.Element | null {
  const levels = perLevel(nodes);
  const sums = totals(nodes);
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
