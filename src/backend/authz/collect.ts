// Step 1 of a permission check: gather every grant that could apply, each tagged with the unit it came through.
import { prisma } from '../db/client.js';
import { supportGrantWindow } from '../db/support.js';
import { mintSupportGrants } from './support.js';
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

// Collects every grant this person could use in this org at this moment.
export async function collectGrants(
  orgId: string,
  userId: string,
  at: Date,
): Promise<CandidateGrant[]> {
  const personNode = await prisma.node.findFirst({
    where: { orgId, kind: 'person', userId },
    select: { id: true, name: true },
  });
  // No person node means this is a support session, so its powers come from a time-limited support grant.
  if (!personNode) {
    const window = await supportGrantWindow(orgId, userId, at);
    return window ? mintSupportGrants(window.expiresAt, window.role) : [];
  }

  // The person's live memberships: the positions they hold and the groups they belong to.
  const memberships = await prisma.edge.findMany({
    where: {
      orgId,
      type: 'member',
      parentId: personNode.id,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    // isPrimary decides which unit a grant placed on the person themselves anchors at.
    select: { childId: true, isPrimary: true },
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

  // For each subject node, the anchor (unit, role level, how it was reached) to use for its grants.
  const anchors = new Map<
    string,
    // Written with an explicit undefined so "no unit" and "field missing" stay different.
    { via: Via; name: string; unitId?: string | undefined; unitName?: string | undefined; level?: number | undefined }
  >();

  for (const node of targetNodes) {
    // A position inside a unit whose end date has passed grants nothing.
    if (node.endsAt && node.endsAt <= at) continue;

    if (node.kind === 'position') {
      const anchor = {
        unitId: node.unit?.id,
        unitName: node.unit?.name,
        level: node.role?.level ?? undefined,
      };
      // Grants on the position and on its role both anchor at the position's unit.
      anchors.set(node.id, { via: 'position', name: node.name, ...anchor });
      if (node.role) anchors.set(node.role.id, { via: 'role', name: node.role.name, ...anchor });
    }

    if (node.kind === 'group') {
      // A group anchors at its scope unit if it declares one, otherwise the whole org.
      const meta = node.meta as { scopeUnitId?: string } | null;
      anchors.set(node.id, {
        via: 'group',
        name: node.name,
        ...(meta?.scopeUnitId ? { unitId: meta.scopeUnitId } : {}),
      });
    }
  }

  // Grants placed straight on the person, anchored at their home unit (see homeUnit below).
  anchors.set(personNode.id, {
    via: 'person',
    name: personNode.name,
    ...homeUnit(memberships, targetNodes),
  });

  // Delegations into positions this person holds: the delegator's grants, only while the delegation lasts.
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

// Works out the unit a per-person grant anchors at: the primary position's unit, or the only position's unit.
function homeUnit(
  memberships: Array<{ childId: string; isPrimary: boolean }>,
  targetNodes: Array<{ id: string; kind: string; unit: { id: string; name: string } | null }>,
): { unitId?: string; unitName?: string } {
  const positions = targetNodes.filter((node) => node.kind === 'position' && node.unit);
  if (positions.length === 0) return {};

  const primaryIds = new Set(
    memberships.filter((edge) => edge.isPrimary).map((edge) => edge.childId),
  );
  const primary = positions.filter((node) => primaryIds.has(node.id));

  // Two positions flagged primary is bad data, so call it ambiguous instead of guessing one.
  const chosen =
    primary.length === 1 ? primary[0] : primary.length === 0 && positions.length === 1 ? positions[0] : undefined;

  return chosen?.unit ? { unitId: chosen.unit.id, unitName: chosen.unit.name } : {};
}
