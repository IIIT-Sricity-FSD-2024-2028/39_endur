// "What can this person do, and where?" — 24 §4, one implementation, two placements.
//
// `/app/profile` (47) and `/app/people/:id` (34) both specify this block, in the same words,
// down to the sample output. It is the INV-009 rule: the second placement extends, it never
// forks. The only thing the two screens disagree about is the closing sentence, which is why
// `emptyHint` is a prop.
//
// **This is INV-005 made visible.** The whole scoping model — that powers are boxed to the
// place the position sits, so Director-of-Project-A gets nothing on Project B — is a
// paragraph of documentation everywhere else in the product and a rendered fact here.
import type { PowersAtPlace } from '@endur/shared';
import { CAPABILITY_CATALOGUE, isCapability } from '@endur/shared';

/**
 * The catalogue's own grouping, read straight from `packages/shared` — no fetch, and no
 * second opinion about which module a capability belongs to.
 *
 * An unknown key falls into "Other" rather than being dropped. The client and server ship
 * from one repository so it should never happen; if it ever does, a capability the caller
 * genuinely holds must not vanish off the one screen built to enumerate them.
 */
const moduleOf = (capability: string): string =>
  isCapability(capability) ? CAPABILITY_CATALOGUE[capability].module : 'Other';

export function PowersByPlace({
  places,
  emptyHint,
  onWhy,
}: {
  places: PowersAtPlace[];
  /** The closing line. See below — it is a sentence, not a row. */
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
            // A position that grants nothing is a real and confusing state — somebody was
            // given a role whose powers were all revoked — and an empty area under a heading
            // would read as a loading fault rather than an answer.
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

/** Catalogue order within a module, catalogue order between them. Stable, so two people's
 *  powers can be compared by eye without the rows moving. */
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
