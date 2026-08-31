// The capability list sent to the UI, used by useCan() to show or hide buttons.
// A capability counts as held when the person has any live allow for it, minus anything denied org-wide,
// and each one carries its widest scope, so a menu can tell "only myself" from "a whole unit".
// This is a hint for the screen only - the server still checks every route with requireCapability().
import { SCOPE_BREADTH, type HeldCapabilities, type Scope } from '@endur/shared';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';

// Builds the capability map for one person in one organisation.
export async function heldCapabilities(
  orgId: string,
  userId: string,
  at: Date = new Date(),
  authzVersion = 0,
): Promise<HeldCapabilities> {
  let grants = getCachedGrants(orgId, userId, authzVersion);
  if (!grants) {
    grants = await collectGrants(orgId, userId, at);
    setCachedGrants(orgId, userId, authzVersion, grants);
  }

  const widest = new Map<string, Scope>();
  const deniedEverywhere = new Set<string>();

  for (const grant of grants) {
    if (grant.validFrom > at) continue;
    if (grant.validTo && grant.validTo <= at) continue;

    if (grant.effect === 'allow') {
      const held = widest.get(grant.capability);
      if (held === undefined || SCOPE_BREADTH[grant.scope] > SCOPE_BREADTH[held]) {
        widest.set(grant.capability, grant.scope);
      }
    } else if (grant.scope === 'all') {
      // A deny at 'all' scope cannot be escaped by picking another target, so drop the capability outright.
      deniedEverywhere.add(grant.capability);
    }
  }

  for (const capability of deniedEverywhere) widest.delete(capability);

  // Sorted keys, so two people's capability sets are easy to compare.
  return Object.fromEntries([...widest].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

