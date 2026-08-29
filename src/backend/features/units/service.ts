// Units — the org graph's structural half. 13 § Structure, 32, 10 §6.
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

/**
 * The tree, scope-filtered by the API (INV-003).
 *
 * A level-2 role sees their own subtree rooted at their own unit — not the whole
 * organisation with the rest greyed out. Out-of-scope units are ABSENT, and the client
 * never filters for permission reasons.
 */
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
    // ONE ROW PER ASSIGNMENT, not a `groupBy` on positions — DEC-082.
    //
    // A position is a role-at-unit slot SHARED by everyone holding that role there
    // (§2.1 of `10`, and `createAssignment` finds one before it creates one), so counting
    // position rows counts distinct roles. Riverside's Ward C has a Head, a Nurse slot
    // with two nurses in it and a Patient slot with three: three positions, six people,
    // and the panel printed "People 3" above a list of five names.
    //
    // Expired assignments are excluded on the same predicate the GRANT resolver uses
    // (`authz/collect.ts`). `valid_to` retains history rather than deleting access, so a
    // lapsed nurse is still a row — counting them would put somebody in a ward where they
    // hold no powers at all.
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
        // Filled by the rollup below, once the tree has a shape to walk.
        peopleTotal: 0,
        subjectTotal: 0,
        children: [],
      },
    ]),
  );

  // A unit whose parent is not visible becomes a root of the returned tree. That is the
  // point of scope filtering: the caller's world starts at their own unit, and the units
  // above it do not exist as far as this response is concerned.
  const roots: UnitNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return { tree: roots, totals: rollUp(roots, peopleIn) };
}

const NO_TOTALS: UnitTreeTotals = { people: 0, subjects: 0, units: 0 };

/**
 * Fills `peopleTotal` and `subjectTotal` on every node, and answers the forest.
 *
 * People are unioned rather than added, because a person is one person however many roles
 * they hold inside the branch. Riverside's demo data has exactly one: a nurse placed in
 * both Ward F and Medicine, who a summing rollup counted twice at the root. Subjects hang
 * off one unit each, so they add — but they are carried through the same walk so there is
 * only ever one traversal to keep correct.
 *
 * Post-order, so each node is visited once: a function that re-walked its own subtree per
 * row would be O(n²) on the page whose entire purpose is deep trees.
 *
 * INV-003 SURVIVES THIS MOVE. `readTree` has already reduced `units` to what this caller
 * may see, so the walk cannot reach a unit they may not — a total here counts exactly the
 * boxes on their screen, which is the guarantee that made the rollup client-side under
 * DEC-081 and is now met on the only side that can also count people distinctly.
 */
function rollUp(roots: UnitNode[], peopleIn: Map<string, Set<string>>): UnitTreeTotals {
  const forest = new Set<string>();
  let subjects = 0;
  let units = 0;

  /** Returns the branch's distinct people; `units` is accumulated as a side effect so the
   *  whole forest is measured in this one traversal rather than a second walk per root. */
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

export async function createUnit(
  req: Request,
  orgId: string,
  userId: string,
  body: CreateUnitBody,
): Promise<UnitNode[]> {
  if (body.parentId) await assertUnitInOrg(req, orgId, body.parentId);

  // `Floor 1..8` — one request, one transaction, eight siblings. The grammar and the cap
  // live in the shared DTO so the client's preview and this loop cannot disagree, and so
  // the cap is enforced where it cannot be skipped (32).
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

    // A new unit changes what `subtree` scopes reach, so every cached decision for this
    // tenant has to stop being trusted (11 §7).
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    void userId;
    return created;
  });
}

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

/**
 * Reparenting is a separate capability from renaming for a reason worth remembering:
 * renaming a department is cosmetic, moving it changes the scope of everyone inside it.
 */
export async function reparentUnit(
  req: Request,
  orgId: string,
  unitId: string,
  body: ReparentBody,
): Promise<{ ok: true }> {
  await assertUnitInOrg(req, orgId, unitId);
  if (body.newParentId) {
    await assertUnitInOrg(req, orgId, body.newParentId);
    // The client also prevents the obvious drags, but the server is the authority. A cycle
    // here does not merely produce wrong answers — it is what the recursive queries' depth
    // guard exists to survive (10 §6).
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
    // Deleting silently orphans everything below, and the cascade would take the positions
    // with it. Refusing with a number is the honest answer; the dialog states it (32).
    //
    // `counted` takes the stored plural rather than two strings, because this line used to
    // append an "s" — and "Faculty" pluralises to "Faculty" (22 §5, §8).
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
    // Subjects survive their unit. A subject with responses attached must stay for the
    // history to mean anything (10 §9); the schema sets unit_id to NULL rather than
    // cascading, and this is where that becomes visible.
    await tx.node.delete({ where: { id: unitId } });
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'unit.delete', targetType: 'unit', targetId: unitId });
    return { ok: true as const };
  });
}

/**
 * What actually happens if this unit moves or goes. The delete dialog is not actionable
 * until this has answered, because a confirmation that says "are you sure?" without saying
 * what changes is a confirmation nobody reads (32).
 */
export async function unitImpact(
  req: Request,
  orgId: string,
  unitId: string,
  newParentId?: string,
): Promise<UnitImpact> {
  const unit = await assertUnitInOrg(req, orgId, unitId);
  const subtree = await unitSubtree(orgId, unitId);

  const [assignments, subjects, campaigns] = await Promise.all([
    // Distinct PEOPLE, not positions — DEC-082. This number goes straight into a delete
    // confirmation ("moves 64 people and 12 courses to School of Engineering"), which is
    // the one place in the product where a wrong count causes an irreversible action to be
    // taken on a false premise. It was counting role slots.
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

  // A move changes who can reach this subtree: everyone anchored above the OLD parent
  // loses it unless they are also above the new one, and the reverse for the new side.
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

/**
 * Who the count is made of — `DEC-083`.
 *
 * The owner's question was not "is 30 right" but "does 30 mean anything", asked of a
 * hospital where sixteen of the thirty are Patients. A total is honest and still unusable
 * when the mix is unknown, so the panel breaks it down and this answers that.
 *
 * SCOPE-FILTERED to the same visible set the tree's own totals use. If it were not, a
 * level-2 reader would see role counts summing past the branch figure printed above them —
 * which both leaks the size of a subtree they cannot open and makes the panel contradict
 * itself, and the second is how anybody would notice the first.
 *
 * ONE PERSON CAN APPEAR TWICE. Someone who is both a Nurse and a Head of Department is in
 * both rows, so the rows may sum higher than `total`. Each row is distinct within itself —
 * a Nurse placed in two wards of the branch is one Nurse — and the panel says which number
 * is the whole.
 */
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
      // The same window the GRANT resolver uses, and the same one `readTree` counts on —
      // a breakdown that included a lapsed nurse would not add up to the stat above it.
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

/**
 * INV-010's honest limit, applied by hand. The tenant-bound client cannot scope a by-id
 * `where` — Prisma will not accept a non-unique field there — so every by-id handler
 * checks `orgId` itself until RLS lands (D-001, 10 §8).
 *
 * The failure is 404 rather than 403 on purpose: a 403 would confirm the unit exists to
 * somebody who cannot see it, which leaks structure (13 §5).
 */
async function assertUnitInOrg(
  req: Request,
  orgId: string,
  unitId: string,
): Promise<{ id: string; name: string }> {
  const unit = await prisma.node.findFirst({
    where: { id: unitId, orgId, kind: 'unit' },
    select: { id: true, name: true },
  });
  // The ORG'S noun, not the word "unit" (22 §6). This message reaches a reader: 32's page
  // renders `error.message` inline, and a hotel being told about a "unit" is INV-001 broken
  // by the API rather than by a component.
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
