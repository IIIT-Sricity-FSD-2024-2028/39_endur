// Key drivers. 43 § Interactions, design_specs/design/08 §8.2.
//
// WHAT THIS NUMBER IS, said plainly because it is the one on this page most likely to be
// over-read: the Pearson correlation between a theme appearing on a response and that
// response's own rating. Arithmetic over `numeric_value` (`10` §4.4), not inference — and
// not causation either, which is why the headings say "goes with" rather than "causes".
//
// A BAR FROM THE CENTRE, NOT `<BarRow>`. `<BarRow>` draws a share of a total: it is built
// for a quantity that starts at zero and grows. A correlation is SIGNED and lives in
// -1..+1, so zero belongs in the middle and the direction belongs on the axis. Rendering it
// in the component built for shares would put -0.4 and +0.4 at the same place with
// different colours, which is colour carrying the meaning on its own (21 §8).
//
// Page-local for the same reason as the donut: one caller, and `43` § Components names two
// new components, not four.
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
  // NEUTRAL DRIVERS ARE NOT DRIVERS. The engine reports `neutral` when the correlation sits
  // inside its deadband, which is it saying "this theme does not move the score". Listing
  // one under "Key drivers" would present a non-finding as a finding — the exact failure
  // `43` § Interactions describes for an unfalsifiable theme, one panel over.
  const up = drivers.filter((driver) => driver.valence === 'positive');
  const down = drivers.filter((driver) => driver.valence === 'negative');

  return (
    <section className="card analysis-card">
      <div className="analysis-card-head">
        <h3 className="analysis-card-title">Key drivers</h3>
        <ConfidenceTag level={confidence} />
      </div>

      {up.length === 0 && down.length === 0 ? (
        // AND THIS IS THE HONEST ANSWER, not a bug. It is what the seeded demo data
        // produces: `demo.ts` draws a comment's tone and its rating as two independent
        // throws, so every correlation lands inside the deadband and the truthful reading
        // is that none of them moves the number.
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
