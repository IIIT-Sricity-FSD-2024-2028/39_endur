// "May this caller see THIS PERSON?" — the row-level half of a person route's guard.
//
// EXTRACTED, not new. It lived inside people/service.ts as `assertVisible` from T-033; the
// account routes (57) ask exactly the same question about exactly the same rows, and a
// second copy would be a second answer the first time either changed. That is the same
// argument positions.ts already makes for role/unit resolution.
//
// Why a person route needs this at all, when INV-003 says authorisation is decided in
// middleware: a PERSON IS NOT ANCHORED TO A UNIT IN THE REQUEST — their positions are. The
// scope question therefore cannot be answered from the path, only after the row is read.
// requireCapability runs first with `target: 'any'` and settles "do you hold this at all";
// this settles "over this person", and it answers 404 rather than 403 so a caller cannot
// map the org chart by probing ids (13 §5).
import type { RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
import { NotFoundError, UnauthenticatedError } from '../../lib/errors.js';

/**
 * THE ONE PREDICATE. Both the list and the detail route read it, so a row cannot come back
 * in a table and then 404 when somebody clicks it — the failure N-005 and N-016 are about.
 *
 * A person is visible when a position of theirs sits in a unit the caller can see. Plus two
 * additions, and the second one closed a live hole:
 *
 * THEIR OWN ROW, always. That is what the universal `person.read self` grant buys, and
 * without it a default-deny model produces an unopenable profile page (50 §1).
 *
 * A PERSON WITH NO POSITIONS AT ALL, to anybody holding `person.read` anywhere. Until
 * 2026-08-24 this clause did not exist and the consequence was a deadlock nobody had
 * noticed (D-026): `POST /people` creates a person and NO position — 14 §8 insists on that,
 * because granting a position is a permission change and must be its own audited call — so
 * the person it returned had no unit, matched no unit-scoped caller, and vanished. The
 * founder of a brand-new organisation, holding `person.read: subtree` at the root, created
 * somebody and could not then see them in the list, open them, or give them a position,
 * because every route that could do so had first to see them. Verified end to end before
 * it was fixed: `POST /people` 201, `GET /people/:id` 404, list total unchanged.
 *
 * It is the right rule and not just the unblocking one. Scope filtering exists to stop you
 * seeing people inside somebody ELSE's part of the organisation (INV-005). Somebody with no
 * position is in nobody's part of it, so no unit-scoped caller is excluded by territory —
 * and what is disclosed is a name and an address of a person who holds no powers at all.
 * The alternative was a row that exists and that nobody in the product can ever reach.
 *
 * Note the asymmetry with `11` §4, which is deliberate: for a GRANT, no anchor means no
 * claim, because an unanchored power should default to nothing. For a TARGET, no anchor
 * means nobody's territory. Different question, opposite safe answer.
 */
export function personScopeFilter(
  visibility: Visibility,
  callerId: string,
): Record<string, unknown> {
  if (visibility.all) return {};
  return {
    OR: [
      {
        edgesAsParent: {
          some: { type: 'member' as const, child: { unitId: { in: visibility.unitIds } } },
        },
      },
      { edgesAsParent: { none: { type: 'member' as const } } },
      ...(visibility.self ? [{ userId: callerId }] : []),
    ],
  };
}

export async function assertPersonVisible(
  orgId: string,
  callerId: string,
  authzVersion: number,
  personId: string,
  capability: Capability,
): Promise<void> {
  const visibility = await visibleUnits({ orgId, userId: callerId, capability, authzVersion });
  // A caller who reaches nowhere reaches nobody — including the unanchored. Checked before
  // the filter rather than inside it, because an empty `unitIds` list would otherwise leave
  // the "no positions" clause standing on its own and let them through.
  if (seesNothing(visibility)) throw new NotFoundError('That person does not exist.');

  // Evaluated by the DATABASE, with the same predicate the list uses — not re-derived here
  // from the person's edges. Two expressions of one rule is how a list and a detail route
  // come to disagree.
  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person', ...personScopeFilter(visibility, callerId) },
    select: { id: true },
  });
  if (!person) throw new NotFoundError('That person does not exist.');
}

/**
 * The same check as a MIDDLEWARE, for routes whose whole subject is one person.
 *
 * INV-003 says authorisation is decided in the chain, never inside a handler, and the
 * person routes have always been the awkward case: `requireCapability` can only ask "do you
 * hold this anywhere" (`target: 'any'`), so the row-level half ended up in the service where
 * you cannot see it by reading the route. For the account routes it has to be visible,
 * because ORDER IS A SECURITY PROPERTY here:
 *
 *   requireCapability   do you hold account.create at all
 *   requirePersonVisible   over THIS person — 404 if not, so ids cannot be probed
 *   requireNoEscalation over what THIS person would wake up holding
 *
 * Run the bound before the visibility check and `WOULD_ESCALATE` becomes an oracle: a
 * coordinator could walk person ids they cannot see and learn, from which ones refuse,
 * exactly who in the organisation outranks them. The 404 has to come first.
 */
export const requirePersonVisible = (capability: Capability): RequestHandler => {
  return (req, _res, next) => {
    const principal = req.ctx.principal;
    const orgId = req.ctx.orgId;
    if (principal?.kind !== 'user' || !orgId) return next(new UnauthenticatedError());
    const personId = (req.data as { params?: { id?: string } }).params?.id;
    if (!personId) return next(new NotFoundError('That person does not exist.'));

    void assertPersonVisible(orgId, principal.id, req.ctx.authzVersion ?? 0, personId, capability)
      .then(() => next())
      .catch(next);
  };
};
