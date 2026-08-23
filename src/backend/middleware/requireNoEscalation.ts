// Link 10b. INV-012 — you cannot hand out what you do not hold. 11 §5b, DEC-039.
//
// requireCapability (link 10) answers "may this caller act on this target". It does NOT
// answer "may this caller create an actor more powerful than themselves". Those are
// different questions, and until 2026-08-23 the product only asked the first one.
//
// THIS IS MIDDLEWARE AND NOT A SERVICE CHECK, and that is not a stylistic choice. INV-003
// says authorisation is decided in middleware, never inside a handler — and "may you hand
// this power out" is an authorisation decision. Written in people/service.ts it would be
// the one authorisation rule in the product you cannot see by reading the route, which is
// the property 12 §2 exists to protect.
//
// It runs AFTER requireCapability, never instead of it, and it can only ever REFUSE. Same
// posture as requireEntitlement: an extra reason to say no, composed onto a route that
// already carries its capability.
import type { Request, RequestHandler } from 'express';
import { findEscalation } from '../authz/escalation.js';
import { UnauthenticatedError, WouldEscalateError } from '../lib/errors.js';
import { prisma } from '../db/client.js';
import type { Visibility } from '../authz/visibility.js';

/** One position that would be created: this role, at this unit. */
export type RoleUnitPair = { roleId: string; unitId: string };

/**
 * Declarative for the single-assignment case, so the route still reads as its own security
 * policy; a function for the bulk case, where the pairs have to be derived from a body of
 * up to 2,000 rows.
 */
export type PairSource =
  | { role: string; unit: string }
  | ((req: Request) => Promise<RoleUnitPair[]> | RoleUnitPair[]);

/** Marks the route as bounded, so the enumeration test can SEE it rather than parse source. */
export const ESCALATION_TAG = Symbol.for('endur.noEscalation');

export const requireNoEscalation = (source: PairSource): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req, source).then(next).catch(next);
  };
  return Object.assign(handler, { [ESCALATION_TAG]: true });
};

async function guard(req: Request, source: PairSource): Promise<void> {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (principal?.kind !== 'user' || !orgId) throw new UnauthenticatedError();

  const pairs = typeof source === 'function' ? await source(req) : fromPaths(req, source);
  if (pairs.length === 0) return;

  // Shared with requireCapability's own lookups, so a route carrying both guards asks the
  // grant tables once (11 §7).
  const memo = (req.ctx.visibilityMemo ??= new Map()) as Map<string, Promise<Visibility>>;

  // Distinct pairs only. A 2,000-row import naming three roles is three checks, not two
  // thousand — and without this the bound would be the slowest thing on the route.
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
      // Names the capability on purpose. The caller can plainly see they hold
      // `assignment.create` — a bare "not allowed" reads to them as a bug rather than a
      // rule, and the answer they need is WHICH power they were about to hand out.
      unit
        ? `That position includes "${finding.capability}" on ${unit.name}, which you do not hold there yourself.`
        : `That position includes "${finding.capability}", which you do not hold yourself.`,
      finding.capability,
      unit?.name,
    );
  }
}

function fromPaths(req: Request, source: { role: string; unit: string }): RoleUnitPair[] {
  const roleId = readPath(req.data, source.role);
  const unitId = readPath(req.data, source.unit);
  // A missing id is not this guard's error to raise: validate() has already run, and the
  // handler's own not-found is a better message than anything invented here. Nothing is
  // created without both, so there is nothing to bound.
  return roleId && unitId ? [{ roleId, unitId }] : [];
}

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

/** Reads from `req.data` — the VALIDATED request — for the same reason link 10 does. */
function readPath(data: unknown, path: string): string | undefined {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}
