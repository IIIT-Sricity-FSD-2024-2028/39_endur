// Step 1 — gather every grant that could possibly apply, each PAIRED WITH ITS ANCHOR UNIT.
//
// The anchor is the whole point. A grant on a ROLE has no unit of its own; the unit comes
// from the POSITION through which the grant was reached. Someone who is Director on
// Project Ayaan and Editor on Night Bus reaches the Director grants anchored at Ayaan
// only — on Night Bus those grants do not apply at all (INV-005).
//
// Without this, anyone with a senior hat somewhere quietly gains senior powers everywhere.
import { prisma } from '../db/client.js';
import type { CandidateGrant, Via } from './types.js';

type GrantRow = {
  id: string;
  capability: string;
  scope: string;
  effect: string;
  params: unknown;
  validFrom: Date;
  validTo: Date | null;
  subject: { id: string; name: string; kind: string };
};

export async function collectGrants(
  orgId: string,
  userId: string,
  at: Date,
): Promise<CandidateGrant[]> {
  const personNode = await prisma.node.findFirst({
    where: { orgId, kind: 'person', userId },
    select: { id: true, name: true },
  });
  if (!personNode) return [];

  // Active membership edges: assignments (person → position) and group membership.
  const memberships = await prisma.edge.findMany({
    where: {
      orgId,
      type: 'member',
      parentId: personNode.id,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    select: { childId: true },
  });

  const targetNodes = await prisma.node.findMany({
    where: { orgId, id: { in: memberships.map((edge) => edge.childId) } },
    select: {
      id: true,
      kind: true,
      name: true,
      roleId: true,
      unitId: true,
      endsAt: true,
      meta: true,
      role: { select: { id: true, name: true, level: true } },
      unit: { select: { id: true, name: true } },
    },
  });

  /** subjectNodeId → the anchor to use for grants found on it. */
  const anchors = new Map<
    string,
    // `| undefined` rather than optional: these are built from nullable relations, and
    // exactOptionalPropertyTypes distinguishes "absent" from "present and undefined".
    { via: Via; name: string; unitId?: string | undefined; unitName?: string | undefined; level?: number | undefined }
  >();

  // (a) direct grants on the person node — per-individual overrides, rare by design.
  anchors.set(personNode.id, { via: 'person', name: personNode.name });

  for (const node of targetNodes) {
    // A position inside a unit whose end date has passed grants nothing. Temporary units
    // cascade end dates precisely so nobody has to remember to revoke anything (10 §9).
    if (node.endsAt && node.endsAt <= at) continue;

    if (node.kind === 'position') {
      const anchor = {
        unitId: node.unit?.id,
        unitName: node.unit?.name,
        level: node.role?.level ?? undefined,
      };
      // (b) grants on the position itself, and on its role — both anchored at the
      //     position's unit, never at the role, which has no unit.
      anchors.set(node.id, { via: 'position', name: node.name, ...anchor });
      if (node.role) anchors.set(node.role.id, { via: 'role', name: node.role.name, ...anchor });
    }

    if (node.kind === 'group') {
      // (c) a group's scope unit, if it declares one; absent means the whole org.
      const meta = node.meta as { scopeUnitId?: string } | null;
      anchors.set(node.id, {
        via: 'group',
        name: node.name,
        ...(meta?.scopeUnitId ? { unitId: meta.scopeUnitId } : {}),
      });
    }
  }

  // (d) delegations INTO positions the principal holds: the delegator's grants, anchored
  //     at the delegation's unit and clipped to its validity window.
  const heldPositions = targetNodes.filter((node) => node.kind === 'position').map((n) => n.id);
  if (heldPositions.length > 0) {
    const delegations = await prisma.edge.findMany({
      where: {
        orgId,
        type: 'delegates',
        childId: { in: heldPositions },
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      select: { parentId: true, parent: { select: { id: true, name: true, unit: { select: { id: true, name: true } }, role: { select: { id: true, name: true, level: true } } } } },
    });
    for (const delegation of delegations) {
      const from = delegation.parent;
      const anchor = { unitId: from.unit?.id, unitName: from.unit?.name, level: from.role?.level ?? undefined };
      anchors.set(from.id, { via: 'delegation', name: from.name, ...anchor });
      if (from.role) anchors.set(from.role.id, { via: 'delegation', name: from.role.name, ...anchor });
    }
  }

  if (anchors.size === 0) return [];

  const grants = (await prisma.grant.findMany({
    where: { orgId, subjectId: { in: [...anchors.keys()] } },
    select: {
      id: true,
      capability: true,
      scope: true,
      effect: true,
      params: true,
      validFrom: true,
      validTo: true,
      subject: { select: { id: true, name: true, kind: true } },
    },
  })) as unknown as GrantRow[];

  return grants.map((grant): CandidateGrant => {
    const anchor = anchors.get(grant.subject.id);
    return {
      grantId: grant.id,
      capability: grant.capability,
      scope: grant.scope as CandidateGrant['scope'],
      effect: grant.effect as CandidateGrant['effect'],
      params: (grant.params ?? {}) as Record<string, number>,
      via: anchor?.via ?? 'person',
      subjectName: anchor?.name ?? grant.subject.name,
      ...(anchor?.unitId ? { anchorUnitId: anchor.unitId } : {}),
      ...(anchor?.unitName ? { anchorUnitName: anchor.unitName } : {}),
      ...(anchor?.level !== undefined ? { level: anchor.level } : {}),
      validFrom: grant.validFrom,
      ...(grant.validTo ? { validTo: grant.validTo } : {}),
    };
  });
}
