// The capability set for the UI. 13 § Auth ("Session, org, labels, AND the caller's
// capability set"), consumed by useCan() (20 §6).
//
// READ THIS BEFORE TRUSTING IT. This is deliberately NOT the resolver.
//
// `resolve()` answers "may this person do X to THIS thing" — it needs a target, and the
// answer legitimately differs per target: a head of department may edit campaigns in
// their own unit and not in the one next door. The UI's question is different and much
// weaker: "is there anywhere at all this button could work?" A set computed per target
// would need one resolver call per capability per row, which is a query storm for a
// cosmetic result.
//
// So a capability is reported as held when the principal has at least one live ALLOW
// grant for it, minus any capability denied ORG-WIDE — a deny at `all` scope with no
// anchor unit, which is the only deny that cannot be escaped by choosing a different
// target. A unit-anchored deny is intentionally NOT subtracted: it would hide a button
// the person can legitimately use elsewhere.
//
// The consequence is bounded and acceptable: the caller may occasionally see an action
// that the server then refuses with a 403 carrying its decision trace. That is a
// confusing button, not a security hole — INV-003 holds because authorisation is decided
// by requireCapability() on every route, never here and never in the client.
import type { Capability } from '@endur/shared';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';

export async function heldCapabilities(
  orgId: string,
  userId: string,
  at: Date = new Date(),
  authzVersion = 0,
): Promise<Capability[]> {
  let grants = getCachedGrants(orgId, userId, authzVersion);
  if (!grants) {
    grants = await collectGrants(orgId, userId, at);
    setCachedGrants(orgId, userId, authzVersion, grants);
  }

  const allowed = new Set<string>();
  const deniedEverywhere = new Set<string>();

  for (const grant of grants) {
    if (grant.validFrom > at) continue;
    if (grant.validTo && grant.validTo <= at) continue;

    if (grant.effect === 'allow') {
      allowed.add(grant.capability);
    } else if (grant.scope === 'all' && !grant.anchorUnitId) {
      deniedEverywhere.add(grant.capability);
    }
  }

  for (const capability of deniedEverywhere) allowed.delete(capability);
  return [...allowed].sort() as Capability[];
}
