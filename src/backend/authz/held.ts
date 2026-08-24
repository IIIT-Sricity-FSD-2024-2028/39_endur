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
// grant for it, minus any capability denied ORG-WIDE — a deny at `all` SCOPE, which is the
// only deny that cannot be escaped by choosing a different target. A unit-SCOPED deny
// (`own_unit`, `subtree`) is intentionally NOT subtracted: it would hide a button the
// person can legitimately use elsewhere.
//
// Scope is the whole test, and the ANCHOR is irrelevant here: scopeCovers() returns
// covers:true for `all` before it ever looks at one.
//
// SINCE T-086 EACH CAPABILITY ALSO CARRIES ITS WIDEST ALLOW SCOPE, and that changed nothing
// about WHICH capabilities are reported — the key set of the map returned here is exactly
// the array this function used to return, which `me.test.ts` asserts on purpose. What it
// adds is the one fact a nav gate needs and the verb alone could never carry.
//
// `person.read: self` is why. Every role gets it, without exception, so that `/app/profile`
// opens (50 §1, and 11 §10 tests that it is never omitted) — which meant the old array
// reported `person.read` for EVERY ACCOUNT IN THE PRODUCT, and a sidebar gated on the bare
// verb showed a People page listing exactly one person: the reader. That was D-027, and it
// could not be fixed on the client, because the client was never told the difference.
//
// THE WIDEST ALLOW, NOT THE NARROWEST AND NOT A COMBINATION. The question is the same
// existential one as before — "is there anywhere at all this button could work" — so the
// widest reach is the honest answer to it. Two `own_unit` grants at two different units
// report `own_unit` once; the map cannot say WHICH units and does not pretend to. Ask the
// resolver if the answer has to be about a particular thing.
//
// A unit-scoped DENY does not narrow the reported scope either, for the same reason it does
// not subtract the capability: an `own_unit` deny on one section is no reason to tell the
// client that a `subtree` allow stops there. The server still refuses that section, with its
// trace, which is where that decision belongs.
//
// The consequence is bounded and acceptable: the caller may occasionally see an action
// that the server then refuses with a 403 carrying its decision trace. That is a
// confusing button, not a security hole — INV-003 holds because authorisation is decided
// by requireCapability() on every route, never here and never in the client.
import { SCOPE_BREADTH, type HeldCapabilities, type Scope } from '@endur/shared';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';

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
      // ANY deny at `all` scope, anchored or not. scopeCovers() returns covers:true for
      // `all` before it ever looks at an anchor, so an anchored `all` deny is every bit as
      // inescapable as an unanchored one — this used to read `&& !grant.anchorUnitId`,
      // which silently failed to subtract a deny reached through a ROLE (role grants are
      // anchored at the position's unit) and, after DEC-044, through a person node too.
      // The rule here has to match the resolver's or the UI hides the wrong buttons.
      deniedEverywhere.add(grant.capability);
    }
  }

  for (const capability of deniedEverywhere) widest.delete(capability);

  // Sorted keys, so a diff between two callers' sets is readable — the property the old
  // array had, kept. JSON preserves insertion order for keys that are not array indices,
  // and no capability is one, so the order survives the wire.
  return Object.fromEntries([...widest].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

