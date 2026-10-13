import type { Valence } from '@endur/shared';
import { ConfidenceTag } from './Confidence.js';

export type Driver = { id: string; label: string; impact: number; valence: Valence };

export function Drivers({
  drivers,
  confidence,
}: {
  drivers: Driver[];
  confidence: 'low' | 'medium' | 'high';
}): JSX.Element {
  const up = drivers.filter((driver) => driver.valence === 'positive');
  const down = drivers.filter((driver) => driver.valence === 'negative');

  return (
    <section className="card analysis-card">
      <div className="analysis-card-head">
        <h3 className="analysis-card-title">Key drivers</h3>
        <ConfidenceTag level={confidence} />
      </div>

      {up.length === 0 && down.length === 0 ? (
        <p className="text-muted">
          No theme moves the score much here. Every correlation is small enough that it
          could be chance, so none is worth acting on.
        </p>
      ) : (
        <div className="driver-columns">
          <DriverList
            heading="Goes with higher scores"
            drivers={up}
            tone="good"
            empty="Nothing pulls scores up on its own."
          />
          <DriverList
            heading="Goes with lower scores"
            drivers={down}
            tone="bad"
            empty="Nothing pulls scores down on its own."
          />
        </div>
      )}
    </section>
  );
}

function DriverList({
  heading,
  drivers,
  tone,
  empty,
}: {
  heading: string;
  drivers: Driver[];
  tone: 'good' | 'bad';
  empty: string;
}): JSX.Element {
  return (
    <div className="driver-column">
      <h4 className="utility driver-heading">{heading}</h4>
      {drivers.length === 0 ? (
        <p className="text-meta">{empty}</p>
      ) : (
        <ul className="driver-list">
          {drivers.map((driver) => (
            <li key={driver.id} className="driver-row">
              <span className="driver-label">{driver.label}</span>
              <span className="driver-track" aria-hidden="true">
                <span
                  className={`driver-fill fill-${tone}`}
                  style={{ width: `${Math.min(100, Math.abs(driver.impact) * 100)}%` }}
                />
              </span>
              {/* The number, always, beside the bar. Two decimals because a correlation
                  rounded to one is 0.1 and 0.1 across most of the range that matters. */}
              <span className="num driver-value">
                {driver.impact > 0 ? '+' : ''}{driver.impact.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
