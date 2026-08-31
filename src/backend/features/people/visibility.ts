// "May this caller see THIS person?" - the row-level half of a person route's guard.
// A person is not anchored to a unit in the request - their positions are - so this can only be answered
// after the row is read. It answers 404 rather than 403, so ids cannot be probed to map the org chart.
import type { RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
import { NotFoundError, UnauthenticatedError } from '../../lib/errors.js';

// The one predicate, used by both the list and the detail route, so a row can never appear in a table
// and then 404 when it is clicked.
// A person is visible when one of their positions sits in a unit the caller can see, plus two additions:
// their own row always, and a person with NO positions at all, who otherwise could never be reached by anybody.
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

// Throws 404 unless this caller may see this person.
export async function assertPersonVisible(
  orgId: string,
  callerId: string,
  authzVersion: number,
  personId: string,
  capability: Capability,
): Promise<void> {
  const visibility = await visibleUnits({ orgId, userId: callerId, capability, authzVersion });
  // A caller who reaches nowhere reaches nobody, checked before the filter so the "no positions" clause cannot let them in.
  if (seesNothing(visibility)) throw new NotFoundError('That person does not exist.');

  // Evaluated by the database with the same predicate the list uses, never re-derived here.
  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person', ...personScopeFilter(visibility, callerId) },
    select: { id: true },
  });
  if (!person) throw new NotFoundError('That person does not exist.');
}

// The same check as a middleware, for routes whose whole subject is one person.
// Order is a security property here: hold the capability, then be able to SEE this person (404 if not),
// then the escalation bound. Running the bound first would turn its refusal into a way to find out who outranks you.
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
