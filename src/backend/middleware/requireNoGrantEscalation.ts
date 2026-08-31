// Link 10b again, this time for the powers grid: you cannot give a role a power you do not hold.
// A grid cell says nothing about WHERE, and the role can later be placed at any unit, so the bound
// is strict: the saver must hold that capability EVERYWHERE in the organisation.
import type { RequestHandler } from 'express';
import { CAPABILITY_CATALOGUE, describeCapability, type Capability } from '@endur/shared';
import type { PutGrantsBody } from '@endur/shared';
import { prisma } from '../db/client.js';
import { seesNothing, visibleUnits, type Visibility } from '../authz/visibility.js';
import { UnauthenticatedError, WouldEscalateError } from '../lib/errors.js';
import { nounsOf } from '../lib/vocabulary.js';

// Marks the route as bounded, so the route test can see the guard is there.
export const GRANT_ESCALATION_TAG = Symbol.for('endur.noGrantEscalation');

// Builds the middleware that bounds what the powers grid may hand out.
export const requireNoGrantEscalation = (): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req).then(next).catch(next);
  };
  return Object.assign(handler, { [GRANT_ESCALATION_TAG]: true });
};

// The check: for each capability being raised, refuse unless the caller holds it everywhere.
async function guard(req: Parameters<RequestHandler>[0]): Promise<void> {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (principal?.kind !== 'user' || !principal.id || !orgId) throw new UnauthenticatedError();

  const { body } = req.data as { body: PutGrantsBody };

  // Only allows are bounded. A deny or a cleared cell reduces a role's power, and blocking that would be a weapon.
  const raising = body.cells.filter(
    (cell) =>
      cell.effect === 'allow' &&
      cell.scope !== null &&
      // A capability that is not in the catalogue is a bad request, not an escalation; writeMatrix reports the typo.
      cell.capability in CAPABILITY_CATALOGUE,
  );
  if (raising.length === 0) return;

  // Shared with requireCapability's lookups, so a route with both guards asks the grant tables once.
  const memo = (req.ctx.visibilityMemo ??= new Map()) as Map<string, Promise<Visibility>>;
  const authzVersion = req.ctx.authzVersion ?? 0;

  // Distinct capabilities only: the grid can save 2,000 cells over 64 capabilities.
  const capabilities = [...new Set(raising.map((cell) => cell.capability))] as Capability[];
  // A capability raised only at 'self' scope makes no unit claim - it means "each holder may do this to themselves" -
  // so "everywhere" is the wrong bound and it is allowed through.
  const selfOnly = new Set(
    capabilities.filter((capability) =>
      raising.every((cell) => cell.capability !== capability || cell.scope === 'self'),
    ),
  );
  let unitCount: number | null = null;

  for (const capability of capabilities) {
    const reach = await visibleUnits({ orgId, userId: principal.id, capability, authzVersion, memo });

    if (seesNothing(reach)) {
      throw new WouldEscalateError(
        `You cannot give a role “${describeCapability(capability, nounsOf(req))}” — ` +
          'you do not hold it yourself.',
        capability,
      );
    }
    if (reach.all) continue;
    // Held at 'all', over some units, or over themselves: any of the three is enough here.
    if (selfOnly.has(capability)) continue;

    // Counted once per request, and only when a capability really is unit-scoped.
    unitCount ??= await prisma.node.count({ where: { orgId, kind: 'unit' } });
    if (reach.unitIds.length >= unitCount) continue;

    throw new WouldEscalateError(
      `You cannot give a role “${describeCapability(capability, nounsOf(req))}” — ` +
        'a role can be given to anybody anywhere, and you do not hold that ' +
        'everywhere in this organisation.',
      capability,
    );
  }
}
