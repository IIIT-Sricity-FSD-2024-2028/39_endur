// Stops privilege escalation: nobody may create a position more powerful than they are themselves.
// It compares real grants, never role level numbers, so editing the powers grid cannot fool it.
import type { Capability } from '@endur/shared';
import { prisma } from '../db/client.js';
import { unitSubtree } from '../db/graph.js';
import { visibleUnits, type Visibility } from './visibility.js';

export type EscalationFinding = {
  capability: Capability;
  unitId: string;
};

export type BoundInput = {
  orgId: string;
  // The caller. What they already hold is the ceiling.
  actorUserId: string;
  // The position being created: this role, at this unit.
  roleId: string;
  unitId: string;
  at?: Date;
  authzVersion?: number;
  // Per-request memo, shared with the rest of the permission code.
  memo?: Map<string, Promise<Visibility>>;
};

// Returns the first power the new position would give that the caller lacks there, or null if all is well.
export async function findEscalation(input: BoundInput): Promise<EscalationFinding | null> {
  const at = input.at ?? new Date();
  const confer = await positionWouldConfer(input.orgId, input.roleId, input.unitId, at);
  if (confer.size === 0) return null;

  const memo = input.memo ?? new Map<string, Promise<Visibility>>();

  for (const [capability, reach] of confer) {
    const held = await visibleUnits({
      orgId: input.orgId,
      userId: input.actorUserId,
      capability,
      at,
      ...(input.authzVersion === undefined ? {} : { authzVersion: input.authzVersion }),
      memo,
    });

    // The caller holds this capability everywhere, so nothing the new position confers can beat it.
    if (held.all) continue;

    if (reach === 'all') return { capability, unitId: input.unitId };

    const heldUnits = new Set(held.unitIds);
    for (const unitId of reach) {
      // A unit the caller is denied is already missing here, so a deny cannot be dodged by proxy.
      if (!heldUnits.has(unitId)) return { capability, unitId };
    }
  }

  return null;
}

// Works out what a position of this role at this unit would confer: each capability and the units it reaches.
async function positionWouldConfer(
  orgId: string,
  roleId: string,
  unitId: string,
  at: Date,
): Promise<Map<Capability, Set<string> | 'all'>> {
  const position = await prisma.node.findFirst({
    where: { orgId, kind: 'position', roleId, unitId },
    select: { id: true },
  });

  const subjectIds = position ? [roleId, position.id] : [roleId];
  const grants = await prisma.grant.findMany({
    where: {
      orgId,
      subjectId: { in: subjectIds },
      effect: 'allow',
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    select: { capability: true, scope: true },
  });

  const out = new Map<Capability, Set<string> | 'all'>();
  let subtree: string[] | null = null;

  for (const grant of grants) {
    const capability = grant.capability as Capability;

    // A 'self' grant only lets a person act on themselves, so handing it over is never escalation.
    if (grant.scope === 'self') continue;

    if (grant.scope === 'all') {
      out.set(capability, 'all');
      continue;
    }

    const existing = out.get(capability);
    if (existing === 'all') continue;

    const units = existing ?? new Set<string>();
    if (grant.scope === 'own_unit') {
      units.add(unitId);
    } else {
      // 'subtree' scope: one subtree query for the whole role, not one per grant.
      subtree ??= await unitSubtree(orgId, unitId);
      for (const id of subtree) units.add(id);
    }
    out.set(capability, units);
  }

  return out;
}
