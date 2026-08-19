// Units — the org graph's structural half. 13 § Structure, 32, 10 §6.
import { expandUnitNames } from '@endur/shared';
import type {
  CreateUnitBody,
  DeleteUnitBody,
  ReparentBody,
  UnitImpact,
  UnitNode,
  UpdateUnitBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { unitAncestors, unitSubtree, wouldCreateCycle } from '../../db/graph.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
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
): Promise<UnitNode[]> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'unit.read', authzVersion });
  if (seesNothing(visibility)) return [];

  const units = await prisma.node.findMany({
    where: { orgId, kind: 'unit', ...whereVisible(visibility) },
    select: { id: true, name: true, isTemporary: true, endsAt: true },
    orderBy: { name: 'asc' },
  });
  if (units.length === 0) return [];

  const ids = units.map((unit) => unit.id);
  const [edges, people, subjects] = await Promise.all([
    prisma.edge.findMany({
      where: { orgId, type: 'contains', childId: { in: ids } },
      select: { parentId: true, childId: true },
    }),
    prisma.node.groupBy({
      by: ['unitId'],
      where: { orgId, kind: 'position', unitId: { in: ids } },
      _count: true,
    }),
    prisma.subject.groupBy({
      by: ['unitId'],
      where: { orgId, unitId: { in: ids }, archivedAt: null },
      _count: true,
    }),
  ]);

  const parentOf = new Map(edges.map((edge) => [edge.childId, edge.parentId]));
  const peopleCounts = new Map(people.map((row) => [row.unitId, row._count]));
  const subjectCounts = new Map(subjects.map((row) => [row.unitId, row._count]));

  const nodes = new Map<string, UnitNode>(
    units.map((unit) => [
      unit.id,
      {
        id: unit.id,
        name: unit.name,
        parentId: parentOf.get(unit.id) ?? null,
        isTemporary: unit.isTemporary,
        endsAt: unit.endsAt?.toISOString() ?? null,
        peopleCount: peopleCounts.get(unit.id) ?? 0,
        subjectCount: subjectCounts.get(unit.id) ?? 0,
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
  return roots;
}

export async function createUnit(
  req: Request,
  orgId: string,
  userId: string,
  body: CreateUnitBody,
): Promise<UnitNode[]> {
  if (body.parentId) await assertUnitInOrg(orgId, body.parentId);

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
  await assertUnitInOrg(orgId, unitId);

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
  await assertUnitInOrg(orgId, unitId);
  if (body.newParentId) {
    await assertUnitInOrg(orgId, body.newParentId);
    // The client also prevents the obvious drags, but the server is the authority. A cycle
    // here does not merely produce wrong answers — it is what the recursive queries' depth
    // guard exists to survive (10 §6).
    if (await wouldCreateCycle(orgId, 'primary', body.newParentId, unitId)) {
      throw new ConflictError('That move would put the unit inside itself.');
    }
    if (await wouldCreateCycle(orgId, 'contains', body.newParentId, unitId)) {
      throw new ConflictError('That move would put the unit inside itself.');
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
  await assertUnitInOrg(orgId, unitId);
  const children = await childrenOf(orgId, unitId);

  if (children.length > 0 && !body.reassignChildrenTo) {
    // Deleting silently orphans everything below, and the cascade would take the positions
    // with it. Refusing with a number is the honest answer; the dialog states it (32).
    throw new ConflictError(
      `That unit has ${children.length} unit${children.length === 1 ? '' : 's'} inside it. Say where they should go first.`,
    );
  }
  if (body.reassignChildrenTo) {
    await assertUnitInOrg(orgId, body.reassignChildrenTo);
    const subtree = await unitSubtree(orgId, unitId);
    if (subtree.includes(body.reassignChildrenTo)) {
      throw new ConflictError('The children cannot be moved into a unit that is being deleted.');
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
  orgId: string,
  unitId: string,
  newParentId?: string,
): Promise<UnitImpact> {
  const unit = await assertUnitInOrg(orgId, unitId);
  const subtree = await unitSubtree(orgId, unitId);

  const [people, subjects, campaigns] = await Promise.all([
    prisma.node.count({ where: { orgId, kind: 'position', unitId: { in: subtree } } }),
    prisma.subject.count({ where: { orgId, unitId: { in: subtree } } }),
    prisma.campaign.count({
      where: { orgId, subjects: { some: { subject: { unitId: { in: subtree } } } } },
    }),
  ]);

  const impact: UnitImpact = {
    unitId,
    unitName: unit.name,
    descendantCount: Math.max(subtree.length - 1, 0),
    peopleAffected: people,
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

/* ---------------------------------------------------------------- helpers */

/**
 * INV-010's honest limit, applied by hand. The tenant-bound client cannot scope a by-id
 * `where` — Prisma will not accept a non-unique field there — so every by-id handler
 * checks `orgId` itself until RLS lands (D-001, 10 §8).
 *
 * The failure is 404 rather than 403 on purpose: a 403 would confirm the unit exists to
 * somebody who cannot see it, which leaks structure (13 §5).
 */
async function assertUnitInOrg(orgId: string, unitId: string): Promise<{ id: string; name: string }> {
  const unit = await prisma.node.findFirst({
    where: { id: unitId, orgId, kind: 'unit' },
    select: { id: true, name: true },
  });
  if (!unit) throw new NotFoundError('That unit does not exist.');
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
