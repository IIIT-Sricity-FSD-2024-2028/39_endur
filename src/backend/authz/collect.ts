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
    // isPrimary decides where a PERSON-node grant anchors (11 §4, DEC-044). Without it
    // every per-person override at a unit scope is silently inert -- see below.
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

  /** subjectNodeId → the anchor to use for grants found on it. */
  const anchors = new Map<
    string,
    // `| undefined` rather than optional: these are built from nullable relations, and
    // exactOptionalPropertyTypes distinguishes "absent" from "present and undefined".
    { via: Via; name: string; unitId?: string | undefined; unitName?: string | undefined; level?: number | undefined }
  >();

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

  // (a) direct grants on the person node — per-individual overrides, rare by design.
  //
  // ANCHORED AT THE PERSON'S HOME UNIT, and getting this wrong was D-020: until
  // 2026-08-23 this line set no unit at all, so scopeCovers() correctly refused every
  // unit-scoped person grant a claim ("no anchor means no claim") and A PER-PERSON DENY AT
  // own_unit OR subtree DID NOTHING. INV-004 says a deny beats an allow unconditionally; a
  // deny that never applies never beats anything, and an administrator using 33's
  // per-person override to block somebody in their department was writing a row that
  // looked like it worked. Every existing test used scope `all`, which needs no anchor,
  // which is why four audits missed it.
  //
  // It is computed AFTER targetNodes because it reads the positions those rows describe.
  anchors.set(personNode.id, {
    via: 'person',
    name: personNode.name,
    ...homeUnit(memberships, targetNodes),
  });

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

/**
 * The unit a per-person grant anchors at. DEC-044, extending 11 §4.
 *
 * The primary position's unit, and failing that a lone position's unit:
 *
 *   1 primary position          -> its unit. This is 11 §4 as originally written.
 *   no primary, exactly ONE     -> that one's unit. `isPrimary` defaults to FALSE on
 *                                  CreateAssignmentBody, so the ordinary "give this person
 *                                  a position" call produces no primary at all — a strict
 *                                  primary-only rule would leave per-person overrides inert
 *                                  for the commonest case in the product, which is the very
 *                                  bug this function exists to fix.
 *   no primary, TWO OR MORE     -> NO ANCHOR, and therefore no unit-scoped claim.
 *                                  `isPrimary` exists to resolve exactly this ambiguity.
 *                                  Picking one arbitrarily would anchor somebody's override
 *                                  at whichever row the database happened to return first,
 *                                  and a permission system that is non-deterministic is
 *                                  worse than one that is narrow.
 *   no positions                -> no anchor. 11 §4's "absent => self only", unchanged.
 *
 * The last two cases still reach `self` and `all` grants, which need no anchor. What they
 * cannot reach is a unit scope — and scopeCovers() records "the grant has no anchor unit"
 * in the decision trace, so the simulator (42) says why rather than leaving it a mystery.
 */
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

  // More than one position flagged primary is a data error, not a tie to break. Treat it
  // as ambiguous rather than picking: the alternative is a silent, order-dependent answer.
  const chosen =
    primary.length === 1 ? primary[0] : primary.length === 0 && positions.length === 1 ? positions[0] : undefined;

  return chosen?.unit ? { unitId: chosen.unit.id, unitName: chosen.unit.name } : {};
}
