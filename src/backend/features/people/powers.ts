// "What can this person actually do, and where?" — the one implementation.
//
// EXTRACTED BY T-051, not new. It lived inside `readPerson` from T-018, and `/profile` (47)
// asks the identical question about the caller themselves. Both docs say the same sentence
// independently — `34`: *"computed by the same resolver the middleware uses (11 §6) — never
// a second implementation"*; `47`: *"the same resolver the middleware uses, never a second
// implementation"* — and the way that promise actually breaks is not somebody writing a
// second resolver on purpose. It is a second CALLER of the resolver, drifting in which
// capabilities it walks or which unit it anchors to. So there is one caller.
//
// **It fixes a real INV-005 break on the way out.** The version inside `readPerson` had no
// unit id to work with — `personSelect` fetched position names only — so it re-found the
// unit BY NAME:
//
//     where: { orgId, kind: 'position', unit: { name: position.unitName } }
//
// Nothing stops two units sharing a name; `nodes` has no unique on `(org_id, kind, name)`
// and `POST /units` does not check. For a person holding a position in each of two
// same-named units, both loop passes resolved to whichever position node the query returned
// first, so one unit's powers were printed under the other unit's heading — on the single
// screen in the product built to demonstrate that powers do not leak between units. It also
// ran one extra query per position for an id the row already had. `T-051` put `unitId` on
// the position DTO and the lookup is gone.
import { CAPABILITY_CATALOGUE, type Capability, type Position, type PowersAtPlace } from '@endur/shared';
import { resolve } from '../../authz/index.js';

/**
 * The whole catalogue, resolved at each place the person holds a position.
 *
 * `userId` is nullable because a person in the graph need not have an account: `POST
 * /people` creates the `users` row, but a respondent-shaped person or an imported row may
 * have none. Somebody with no user has no grants to resolve, and the honest answer is an
 * empty list rather than a fabricated one.
 *
 * Sequential rather than `Promise.all` on purpose. The resolver is cached per
 * (org, user, authzVersion) and the first call is what fills that cache; firing sixty-four
 * in parallel would race every one of them into the miss path. The loop is ~64 × positions
 * cache-warm reads, and it is a detail route, not a list.
 */
export async function powersByPlace(
  orgId: string,
  userId: string | null,
  positions: Position[],
  authzVersion: number,
): Promise<PowersAtPlace[]> {
  if (!userId) return [];

  const places: PowersAtPlace[] = [];
  for (const position of positions) {
    // A position with no unit anchors nowhere, and `11` §4 is explicit that an unanchored
    // grant claims nothing — so there is no place to report, not a place with no powers.
    if (!position.unitId) continue;

    const capabilities: PowersAtPlace['capabilities'] = [];
    for (const capability of Object.keys(CAPABILITY_CATALOGUE) as Capability[]) {
      const decision = await resolve({
        orgId,
        userId,
        capability,
        authzVersion,
        target: { kind: 'unit', unitId: position.unitId },
      });
      // `decidedBy` is the grant that allowed it, and its scope is the informative half:
      // "here" and "everywhere below here" are different answers to the same question.
      if (decision.allowed && decision.decidedBy) {
        capabilities.push({ capability, scope: decision.decidedBy.scope });
      }
    }

    places.push({
      unitId: position.unitId,
      unitName: position.unitName,
      roleName: position.roleName,
      capabilities,
    });
  }
  return places;
}
