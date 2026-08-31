// "What can this person actually do, and where?" - one implementation, used by both the person page
// and the profile page, so the two can never drift into describing powers differently.
// It anchors on the position's unit ID, never on the unit's name, because two units may share a name.
import { CAPABILITY_CATALOGUE, type Capability, type Position, type PowersAtPlace } from '@endur/shared';
import { resolve } from '../../authz/index.js';

// Resolves the whole capability catalogue at each place the person holds a position.
// A person with no account has no grants, so the honest answer there is an empty list.
// Sequential rather than parallel: the first call fills the resolver's cache that the rest then hit.
export async function powersByPlace(
  orgId: string,
  userId: string | null,
  positions: Position[],
  authzVersion: number,
): Promise<PowersAtPlace[]> {
  if (!userId) return [];

  const places: PowersAtPlace[] = [];
  for (const position of positions) {
    // A position with no unit anchors nowhere and confers nothing, so there is no place to report.
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
      // The scope of the deciding grant is the informative half: "here" and "everywhere below here" differ.
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
