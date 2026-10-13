import type { PowersAtPlace } from '@endur/shared';
import { CAPABILITY_CATALOGUE, isCapability } from '@endur/shared';

const moduleOf = (capability: string): string =>
  isCapability(capability) ? CAPABILITY_CATALOGUE[capability].module : 'Other';

export function PowersByPlace({
  places,
  emptyHint,
  onWhy,
}: {
  places: PowersAtPlace[];
  emptyHint: string;
  onWhy?: ((capability: string, unitId: string) => void) | undefined;
}): JSX.Element {
  if (places.length === 0) {
    return <p className="text-muted powers-none">{emptyHint}</p>;
  }

  return (
    <div className="powers-places">
      {places.map((place) => (
        <section className="powers-place" key={place.unitId}>
          <header className="powers-place-head">
            <h4 className="powers-place-unit">{place.unitName}</h4>
            <span className="text-meta">{place.roleName}</span>
          </header>

          {place.capabilities.length === 0 ? (
            <p className="text-meta">No powers here.</p>
          ) : (
            <dl className="powers-modules">
              {group(place).map(([module, held]) => (
                <div className="powers-module" key={module}>
                  <dt className="utility">{module}</dt>
                  <dd>
                    {held.map((entry) => (
                      <span className="power" key={entry.capability}>
                        <code>{entry.capability}</code>
                        {/* The scope, always. `person.read · self` and `person.read ·
                            subtree` are different answers to the only question this block
                            exists to answer, and the verb alone cannot tell them apart —
                            which is the whole of T-086 and D-027. */}
                        <span className="power-scope">{entry.scope}</span>
                        {onWhy && (
                          <button
                            type="button"
                            className="power-why"
                            onClick={() => onWhy(entry.capability, place.unitId)}
                          >
                            Why?
                          </button>
                        )}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}

      {/*
        "Anywhere else — nothing", and it is a SENTENCE rather than a third place.
        47 § Interactions draws it as a row; making it one would mean inventing a
        null-unit entry, which puts a place in the data that the organisation does not
        have. It is also the half people forget: knowing where you have powers is only
        half of knowing you have none anywhere else.
      */}
      <p className="text-meta powers-elsewhere">{emptyHint}</p>
    </div>
  );
}

function group(place: PowersAtPlace): Array<[string, PowersAtPlace['capabilities']]> {
  const modules = new Map<string, PowersAtPlace['capabilities']>();
  for (const entry of place.capabilities) {
    const key = moduleOf(entry.capability);
    const existing = modules.get(key);
    if (existing) existing.push(entry);
    else modules.set(key, [entry]);
  }
  return [...modules];
}
