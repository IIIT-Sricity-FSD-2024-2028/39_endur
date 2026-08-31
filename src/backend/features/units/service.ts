// Units: the structural half of the org graph.
import { expandUnitNames } from '@endur/shared';
import type {
  CreateUnitBody,
  DeleteUnitBody,
  ReparentBody,
  UnitImpact,
  UnitComposition,
  UnitNode,
  UnitTreeTotals,
  UpdateUnitBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { unitAncestors, unitSubtree, wouldCreateCycle } from '../../db/graph.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { counted, nounsOf } from '../../lib/vocabulary.js';
import { seesNothing, visibleUnits, type Visibility } from '../../authz/index.js';
import { bumpVersion } from '../org/service.js';

// The tree, already filtered to what the caller may see.
// A unit outside their scope is ABSENT from the response, not greyed out, so the client never filters for permission.
export async function readTree(
  orgId: string,
  userId: string,
  authzVersion: number,
): Promise<{ tree: UnitNode[]; totals: UnitTreeTotals }> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'unit.read', authzVersion });
  if (seesNothing(visibility)) return { tree: [], totals: NO_TOTALS };

  const units = await prisma.node.findMany({
    where: { orgId, kind: 'unit', ...whereVisible(visibility) },
    select: { id: true, name: true, isTemporary: true, endsAt: true },
    orderBy: { name: 'asc' },
  });
  if (units.length === 0) return { tree: [], totals: NO_TOTALS };

  const ids = units.map((unit) => unit.id);
  const now = new Date();
  const [edges, assignments, subjects] = await Promise.all([
    prisma.edge.findMany({
      where: { orgId, type: 'contains', childId: { in: ids } },
      select: { parentId: true, childId: true },
    }),
    // One row per ASSIGNMENT, not per position: a position is a slot shared by everyone holding that role there,
    // so counting positions would count roles instead of people. Expired assignments are left out, using the
    // same date window the permission resolver uses.
    prisma.edge.findMany({
      where: {
        orgId,
        type: 'member',
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        child: { kind: 'position', unitId: { in: ids } },
      },
      select: { parentId: true, child: { select: { unitId: true } } },
    }),
    prisma.subject.groupBy({
      by: ['unitId'],
      where: { orgId, unitId: { in: ids }, archivedAt: null },
      _count: true,
    }),
  ]);

  const parentOf = new Map(edges.map((edge) => [edge.childId, edge.parentId]));
  const subjectCounts = new Map(subjects.map((row) => [row.unitId, row._count]));

  const peopleIn = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const unitId = assignment.child.unitId;
    if (!unitId) continue;
    const held = peopleIn.get(unitId) ?? new Set<string>();
    held.add(assignment.parentId);
    peopleIn.set(unitId, held);
  }

  const nodes = new Map<string, UnitNode>(
    units.map((unit) => [
      unit.id,
      {
        id: unit.id,
        name: unit.name,
        parentId: parentOf.get(unit.id) ?? null,
        isTemporary: unit.isTemporary,
        endsAt: unit.endsAt?.toISOString() ?? null,
        peopleCount: peopleIn.get(unit.id)?.size ?? 0,
        subjectCount: subjectCounts.get(unit.id) ?? 0,
        // Filled in by the rollup below, once the tree has a shape to walk.
        peopleTotal: 0,
        subjectTotal: 0,
        children: [],
      },
    ]),
  );

  // A unit whose parent is not visible becomes a root here: the caller's world starts at their own unit.
  const roots: UnitNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return { tree: roots, totals: rollUp(roots, peopleIn) };
}

const NO_TOTALS: UnitTreeTotals = { people: 0, subjects: 0, units: 0 };

// Fills in peopleTotal and subjectTotal on every node, and returns the forest.
// People are unioned, not added, because one person holding two roles in a branch is still one person.
// One post-order walk, so each node is visited once even on a deep tree.
function rollUp(roots: UnitNode[], peopleIn: Map<string, Set<string>>): UnitTreeTotals {
  const forest = new Set<string>();
  let subjects = 0;
  let units = 0;

  // Returns the branch's distinct people; the forest is measured in this same single traversal.
  const walk = (node: UnitNode): Set<string> => {
    const branch = new Set(peopleIn.get(node.id) ?? []);
    let below = node.subjectCount;
    units += 1;
    for (const child of node.children) {
      for (const personId of walk(child)) branch.add(personId);
      below += child.subjectTotal;
    }
    node.peopleTotal = branch.size;
    node.subjectTotal = below;
    return branch;
  };

  for (const root of roots) {
    for (const personId of walk(root)) forest.add(personId);
    subjects += root.subjectTotal;
  }
  return { people: forest.size, subjects, units };
}

// Creates one unit, or a numbered range of siblings, inside a parent.
export async function createUnit(
  req: Request,
  orgId: string,
  userId: string,
  body: CreateUnitBody,
): Promise<UnitNode[]> {
  if (body.parentId) await assertUnitInOrg(req, orgId, body.parentId);

  // "Floor 1..8" makes eight siblings in one request. The grammar and the cap live in the shared DTO,
  // so the client's preview and this loop cannot disagree.
  const names = expandUnitNames(body.name, body.repeat);

  return runInTransaction(req, async (tx) => {
    const created: UnitNode[] = [];
    for (const name of names) {
      const unit = await tx.node.create({
        data: {
          orgId,
          kind: 'unit',
          name,
          isTemporary: body.isTemporary,
          ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        },
        select: { id: true, name: true, isTemporary: true, endsAt: true },
      });
      if (body.parentId) {
        await tx.edge.create({
          data: { orgId, type: 'contains', parentId: body.parentId, childId: unit.id },
        });
      }
      created.push({
        id: unit.id,
        name: unit.name,
        parentId: body.parentId,
        isTemporary: unit.isTemporary,
        endsAt: unit.endsAt?.toISOString() ?? null,
        peopleCount: 0,
        subjectCount: 0,
        peopleTotal: 0,
        subjectTotal: 0,
        children: [],
      });
      req.ctx.audit.push({ action: 'unit.create', targetType: 'unit', targetId: unit.id });
    }

    // A new unit changes what a subtree scope reaches, so cached permission decisions must be dropped.
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    void userId;
    return created;
  });
}

// Renames a unit, or changes its temporary end date.
export async function updateUnit(
  req: Request,
  orgId: string,
  unitId: string,
  body: UpdateUnitBody,
): Promise<UnitNode> {
  await assertUnitInOrg(req, orgId, unitId);

  return runInTransaction(req, async (tx) => {
    const unit = await tx.node.update({
      where: { id: unitId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isTemporary !== undefined ? { isTemporary: body.isTemporary } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
      },
      select: { id: true, name: true, isTemporary: true, endsAt: true },
    });
    req.ctx.audit.push({ action: 'unit.update', targetType: 'unit', targetId: unitId });
    return {
      id: unit.id,
      name: unit.name,
      parentId: await parentOf(orgId, unitId),
      isTemporary: unit.isTemporary,
      endsAt: unit.endsAt?.toISOString() ?? null,
      peopleCount: 0,
      subjectCount: 0,
      peopleTotal: 0,
      subjectTotal: 0,
      children: [],
    };
  });
}

// Moving a unit is its own capability: renaming is cosmetic, moving changes the scope of everyone inside it.
export async function reparentUnit(
  req: Request,
  orgId: string,
  unitId: string,
  body: ReparentBody,
): Promise<{ ok: true }> {
  await assertUnitInOrg(req, orgId, unitId);
  if (body.newParentId) {
    await assertUnitInOrg(req, orgId, body.newParentId);
    // The client blocks the obvious drags, but the server is the authority: a loop here would hang the recursive queries.
    const inItself = `That move would put the ${nounsOf(req).unit.one.toLowerCase()} inside itself.`;
    if (await wouldCreateCycle(orgId, 'primary', body.newParentId, unitId)) {
      throw new ConflictError(inItself);
    }
    if (await wouldCreateCycle(orgId, 'contains', body.newParentId, unitId)) {
      throw new ConflictError(inItself);
    }
  }

  return runInTransaction(req, async (tx) => {
    await tx.edge.deleteMany({ where: { orgId, type: 'contains', childId: unitId } });
    if (body.newParentId) {
      await tx.edge.create({
        data: { orgId, type: 'contains', parentId: body.newParentId, childId: unitId },
      });
    }
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'unit.reparent', targetType: 'unit', targetId: unitId });
    return { ok: true as const };
  });
}

// Deletes a unit. Refuses while it still has children, and detaches its subjects rather than deleting them.
export async function deleteUnit(
  req: Request,
  orgId: string,
  unitId: string,
  body: DeleteUnitBody,
): Promise<{ ok: true }> {
  await assertUnitInOrg(req, orgId, unitId);
  const children = await childrenOf(orgId, unitId);

  const unitNoun = nounsOf(req).unit;
  if (children.length > 0 && !body.reassignChildrenTo) {
    // Deleting would orphan everything below, so it is refused with a number the dialog can show.
    // counted() uses the organisation's stored plural, because not every word just adds an s.
    throw new ConflictError(
      `That ${unitNoun.one.toLowerCase()} has ${counted(children.length, unitNoun).toLowerCase()} inside it. Say where they should go first.`,
    );
  }
  if (body.reassignChildrenTo) {
    await assertUnitInOrg(req, orgId, body.reassignChildrenTo);
    const subtree = await unitSubtree(orgId, unitId);
    if (subtree.includes(body.reassignChildrenTo)) {
      throw new ConflictError(
        `The children cannot be moved into a ${unitNoun.one.toLowerCase()} that is being deleted.`,
      );
    }
  }

  return runInTransaction(req, async (tx) => {
    if (body.reassignChildrenTo) {
      await tx.edge.updateMany({
        where: { orgId, type: 'contains', parentId: unitId },
        data: { parentId: body.reassignChildrenTo },
      });
    }
    // Subjects outlive their unit: their unit id is set to null rather than deleting the history.
    await tx.node.delete({ where: { id: unitId } });
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'unit.delete', targetType: 'unit', targetId: unitId });
    return { ok: true as const };
  });
}

// What would actually happen if this unit moved or went. The delete dialog waits for this before it lets you confirm.
export async function unitImpact(
  req: Request,
  orgId: string,
  unitId: string,
  newParentId?: string,
): Promise<UnitImpact> {
  const unit = await assertUnitInOrg(req, orgId, unitId);
  const subtree = await unitSubtree(orgId, unitId);

  const [assignments, subjects, campaigns] = await Promise.all([
    // Distinct PEOPLE, not positions: this number goes straight into a confirmation for an irreversible action.
    prisma.edge.findMany({
      where: {
        orgId,
        type: 'member',
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        child: { kind: 'position', unitId: { in: subtree } },
      },
      select: { parentId: true },
    }),
    prisma.subject.count({ where: { orgId, unitId: { in: subtree } } }),
    prisma.campaign.count({
      where: { orgId, subjects: { some: { subject: { unitId: { in: subtree } } } } },
    }),
  ]);

  const impact: UnitImpact = {
    unitId,
    unitName: unit.name,
    descendantCount: Math.max(subtree.length - 1, 0),
    peopleAffected: new Set(assignments.map((edge) => edge.parentId)).size,
    subjectsAffected: subjects,
    campaignsAffected: campaigns,
    gained: [],
    lost: [],
  };

  if (!newParentId) return impact;

  // A move changes who can reach this subtree: anyone anchored above the old parent loses it, and vice versa.
  const [oldAncestors, newAncestors] = await Promise.all([
    ancestorsAbove(orgId, unitId),
    unitAncestors(orgId, newParentId),
  ]);
  const losing = oldAncestors.filter((id) => !newAncestors.includes(id));
  const gaining = newAncestors.filter((id) => !oldAncestors.includes(id));

  impact.lost = await peopleAnchoredAt(orgId, losing);
  impact.gained = await peopleAnchoredAt(orgId, gaining);
  return impact;
}

// What the count is made of: how many of the people in a branch hold each role.
// Filtered to the same visible set the tree totals use. One person can appear in two rows, so the rows may
// sum higher than the total, and the panel says which number is the whole.
export async function unitComposition(
  orgId: string,
  userId: string,
  authzVersion: number,
  unitId: string,
): Promise<UnitComposition> {
  const [visibility, subtree] = await Promise.all([
    visibleUnits({ orgId, userId, capability: 'unit.read', authzVersion }),
    unitSubtree(orgId, unitId),
  ]);
  const visible = visibility.all
    ? subtree
    : subtree.filter((id) => visibility.unitIds.includes(id));
  if (visible.length === 0) return { unitId, total: 0, byRole: [] };

  const assignments = await prisma.edge.findMany({
    where: {
      orgId,
      type: 'member',
      // The same date window the resolver and the tree counts use, so the breakdown adds up to the figure above it.
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      child: { kind: 'position', unitId: { in: visible } },
    },
    select: {
      parentId: true,
      child: { select: { role: { select: { id: true, name: true, level: true } } } },
    },
  });

  const everyone = new Set<string>();
  const byRole = new Map<string, { name: string; level: number; people: Set<string> }>();
  for (const assignment of assignments) {
    everyone.add(assignment.parentId);
    const role = assignment.child.role;
    if (!role) continue;
    const row = byRole.get(role.id) ?? {
      name: role.name,
      level: role.level ?? 0,
      people: new Set<string>(),
    };
    row.people.add(assignment.parentId);
    byRole.set(role.id, row);
  }

  return {
    unitId,
    total: everyone.size,
    byRole: [...byRole.entries()]
      .map(([roleId, row]) => ({
        roleId,
        roleName: row.name,
        level: row.level,
        count: row.people.size,
      }))
      // Ladder order, so the panel reads the way `/app/roles` does. Name breaks a tie so
      // two roles at one level do not reorder between requests.
      .sort((a, b) => a.level - b.level || a.roleName.localeCompare(b.roleName)),
  };
}

/* ---------------------------------------------------------------- helpers */

// Checks a unit really belongs to this organisation.
// The tenant-bound client cannot add its filter to a by-id lookup, so every by-id handler checks by hand.
// It answers 404 rather than 403, because a 403 would confirm the unit exists to somebody who cannot see it.
async function assertUnitInOrg(
  req: Request,
  orgId: string,
  unitId: string,
): Promise<{ id: string; name: string }> {
  const unit = await prisma.node.findFirst({
    where: { id: unitId, orgId, kind: 'unit' },
    select: { id: true, name: true },
  });
  // In the organisation's OWN noun, because this message is rendered straight onto the page.
  if (!unit) throw new NotFoundError(`That ${nounsOf(req).unit.one.toLowerCase()} does not exist.`);
  return unit;
}

const parentOf = async (orgId: string, unitId: string): Promise<string | null> => {
  const edge = await prisma.edge.findFirst({
    where: { orgId, type: 'contains', childId: unitId },
    select: { parentId: true },
  });
  return edge?.parentId ?? null;
};

const childrenOf = async (orgId: string, unitId: string): Promise<string[]> => {
  const edges = await prisma.edge.findMany({
    where: { orgId, type: 'contains', parentId: unitId },
    select: { childId: true },
  });
  return edges.map((edge) => edge.childId);
};

/** The unit's ancestors, not counting itself — the units whose subtree scope reaches it. */
async function ancestorsAbove(orgId: string, unitId: string): Promise<string[]> {
  const all = await unitAncestors(orgId, unitId);
  return all.filter((id) => id !== unitId);
}

async function peopleAnchoredAt(
  orgId: string,
  unitIds: string[],
): Promise<UnitImpact['gained']> {
  if (unitIds.length === 0) return [];
  const positions = await prisma.node.findMany({
    where: { orgId, kind: 'position', unitId: { in: unitIds } },
    select: {
      id: true,
      role: { select: { name: true } },
      edgesAsChild: {
        where: { type: 'member' },
        select: { parent: { select: { id: true, name: true } } },
      },
    },
  });

  const out: UnitImpact['gained'] = [];
  for (const position of positions) {
    for (const edge of position.edgesAsChild) {
      out.push({
        personId: edge.parent.id,
        name: edge.parent.name,
        // The role name is what a human recognises; the exact capability list would be
        // sixty rows and unreadable in a confirmation dialog.
        capability: position.role?.name ?? 'position',
      });
    }
  }
  return out;
}

/** Turn a Visibility into a Prisma `where` fragment for unit ids. */
export const whereVisible = (visibility: Visibility): { id?: { in: string[] } } =>
  visibility.all ? {} : { id: { in: visibility.unitIds } };
