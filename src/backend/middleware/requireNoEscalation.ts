// Link 10b. Stops a caller creating a position more powerful than they are themselves.
// It runs after requireCapability and can only ever refuse, never allow.
import type { Request, RequestHandler } from 'express';
import { findEscalation } from '../authz/escalation.js';
import { UnauthenticatedError, WouldEscalateError } from '../lib/errors.js';
import { prisma } from '../db/client.js';
import type { Visibility } from '../authz/visibility.js';

// One position that would be created: this role, at this unit.
export type RoleUnitPair = { roleId: string; unitId: string };

// Either a fixed pair of paths for the single case, or a function for a bulk import of up to 2,000 rows.
export type PairSource =
  | { role: string; unit: string }
  | ((req: Request) => Promise<RoleUnitPair[]> | RoleUnitPair[]);

// Marks the route as bounded, so the route test can see the guard is there.
export const ESCALATION_TAG = Symbol.for('endur.noEscalation');

// Builds the middleware that bounds the positions a route may create.
export const requireNoEscalation = (source: PairSource): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req, source).then(next).catch(next);
  };
  return Object.assign(handler, { [ESCALATION_TAG]: true });
};

// The check: work out the role and unit pairs, then refuse if any confers a power the caller lacks there.
async function guard(req: Request, source: PairSource): Promise<void> {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (principal?.kind !== 'user' || !orgId) throw new UnauthenticatedError();

  const pairs = typeof source === 'function' ? await source(req) : fromPaths(req, source);
  if (pairs.length === 0) return;

  // Shared with requireCapability's lookups, so a route with both guards asks the grant tables once.
  const memo = (req.ctx.visibilityMemo ??= new Map()) as Map<string, Promise<Visibility>>;

  // Distinct pairs only: a 2,000-row import naming three roles costs three checks, not two thousand.
  for (const pair of distinct(pairs)) {
    const finding = await findEscalation({
      orgId,
      actorUserId: principal.id,
      roleId: pair.roleId,
      unitId: pair.unitId,
      ...(req.ctx.authzVersion === undefined ? {} : { authzVersion: req.ctx.authzVersion }),
      memo,
    });
    if (!finding) continue;

    const unit = await prisma.node.findFirst({
      where: { orgId, id: finding.unitId, kind: 'unit' },
      select: { name: true },
    });
    throw new WouldEscalateError(
      // Name the capability, because the caller can see they hold assignment.create and needs to know WHICH power was too much.
      unit
        ? `That position includes "${finding.capability}" on ${unit.name}, which you do not hold there yourself.`
        : `That position includes "${finding.capability}", which you do not hold yourself.`,
      finding.capability,
      unit?.name,
    );
  }
}

// Pulls one role/unit pair out of the validated body.
function fromPaths(req: Request, source: { role: string; unit: string }): RoleUnitPair[] {
  const roleId = readPath(req.data, source.role);
  const unitId = readPath(req.data, source.unit);
  // A missing id is not this guard's problem: nothing is created without both, so there is nothing to bound.
  return roleId && unitId ? [{ roleId, unitId }] : [];
}

// Drops repeated role/unit pairs.
function distinct(pairs: RoleUnitPair[]): RoleUnitPair[] {
  const seen = new Set<string>();
  const out: RoleUnitPair[] = [];
  for (const pair of pairs) {
    const key = `${pair.roleId}:${pair.unitId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

// Reads from req.data, the validated request, for the same reason the capability guard does.
function readPath(data: unknown, path: string): string | undefined {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}
