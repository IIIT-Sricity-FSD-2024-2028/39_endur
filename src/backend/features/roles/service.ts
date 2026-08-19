// Roles and the powers grid. 13, 33, 11 §8, 50 §1.
//
// Two things live here that look similar and are not. A ROLE is a node with an ordering
// number. A GRANT is a row saying that node may do something at some scope. Levels order
// roles for the seeded defaults and for nothing else — the enforcement is always the grant
// (DEC-002, CONF-002).
import { CAPABILITY_CATALOGUE, type Capability } from '@endur/shared';
import type {
  CapabilityMeta,
  CreateRoleBody,
  DeleteRoleBody,
  GrantCell,
  GrantWarning,
  PutGrantsBody,
  ReorderRolesBody,
  RoleView,
  UpdateRoleBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { clearGrantCache } from '../../authz/index.js';
import { bumpVersion } from '../org/service.js';

export async function listRoles(orgId: string): Promise<RoleView[]> {
  const roles = await prisma.node.findMany({
    where: { orgId, kind: 'role' },
    select: {
      id: true,
      name: true,
      level: true,
      _count: { select: { positionsWithRole: true, grants: true } },
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    level: role.level ?? 0,
    peopleCount: role._count.positionsWithRole,
    grantCount: role._count.grants,
  }));
}

export async function createRole(
  req: Request,
  orgId: string,
  body: CreateRoleBody,
): Promise<RoleView> {
  return runInTransaction(req, async (tx) => {
    const last = await tx.node.findFirst({
      where: { orgId, kind: 'role' },
      select: { level: true },
      orderBy: { level: 'desc' },
    });
    // A new role lands at the bottom. Anywhere else would silently re-rank everyone above
    // it, and re-ranking is what POST /roles/reorder is for.
    const role = await tx.node.create({
      data: { orgId, kind: 'role', name: body.name, level: (last?.level ?? 0) + 1 },
      select: { id: true, name: true, level: true },
    });
    // A new role starts with NO grants. Default deny is the floor (11 §5): copying the
    // level's seeded matrix here would hand out powers nobody asked for, and the grid is
    // where powers are chosen.
    req.ctx.audit.push({ action: 'role.create', targetType: 'role', targetId: role.id });
    return { id: role.id, name: role.name, level: role.level ?? 0, peopleCount: 0, grantCount: 0 };
  });
}

export async function updateRole(
  req: Request,
  orgId: string,
  roleId: string,
  body: UpdateRoleBody,
): Promise<RoleView> {
  await assertRole(orgId, roleId);
  return runInTransaction(req, async (tx) => {
    const role = await tx.node.update({
      where: { id: roleId },
      data: { name: body.name },
      select: { id: true, name: true, level: true },
    });
    // Renaming a role is the vocabulary claim in miniature: "Dean" becomes "General
    // Manager" and nothing else in the system moves.
    req.ctx.audit.push({ action: 'role.update', targetType: 'role', targetId: roleId });
    return {
      id: role.id,
      name: role.name,
      level: role.level ?? 0,
      peopleCount: 0,
      grantCount: 0,
    };
  });
}

/** Levels are derived from the order of the array. They are never sent (33). */
export async function reorderRoles(
  req: Request,
  orgId: string,
  body: ReorderRolesBody,
): Promise<RoleView[]> {
  const existing = await prisma.node.findMany({
    where: { orgId, kind: 'role' },
    select: { id: true },
  });
  const known = new Set(existing.map((role) => role.id));
  if (body.orderedIds.length !== known.size || body.orderedIds.some((id) => !known.has(id))) {
    // A partial order is ambiguous about everything it leaves out, and guessing would
    // quietly re-rank a role nobody mentioned.
    throw new ConflictError('The order must list every role exactly once.');
  }

  await runInTransaction(req, async (tx) => {
    for (const [index, id] of body.orderedIds.entries()) {
      await tx.node.update({ where: { id }, data: { level: index + 1 } });
    }
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'role.update', targetType: 'role' });
  });
  clearGrantCache();
  return listRoles(orgId);
}

export async function deleteRole(
  req: Request,
  orgId: string,
  roleId: string,
  body: DeleteRoleBody,
): Promise<{ ok: true }> {
  await assertRole(orgId, roleId);
  const held = await prisma.node.count({ where: { orgId, kind: 'position', roleId } });

  if (held > 0 && !body.reassignTo) {
    // Deleting cascades the positions away, and with them everyone's access. Refusing with
    // the number is the honest answer.
    throw new ConflictError(
      `${held} ${held === 1 ? 'person holds' : 'people hold'} that role. Say which role they should hold instead.`,
    );
  }
  if (body.reassignTo) await assertRole(orgId, body.reassignTo);

  await runInTransaction(req, async (tx) => {
    if (body.reassignTo) {
      await tx.node.updateMany({
        where: { orgId, kind: 'position', roleId },
        data: { roleId: body.reassignTo },
      });
    }
    await tx.node.delete({ where: { id: roleId } });
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'role.delete', targetType: 'role', targetId: roleId });
  });
  clearGrantCache();
  return { ok: true };
}

/* -------------------------------------------------------------- the grid */

export async function readMatrix(orgId: string): Promise<GrantCell[]> {
  const grants = await prisma.grant.findMany({
    where: { orgId, subject: { kind: 'role' } },
    select: { subjectId: true, capability: true, scope: true, effect: true, params: true },
  });

  return grants.map((grant) => ({
    roleId: grant.subjectId,
    capability: grant.capability,
    scope: grant.scope,
    effect: grant.effect,
    params: (grant.params ?? {}) as Record<string, number>,
  }));
}

/**
 * The whole matrix, one transaction (13 §3).
 *
 * Two properties matter more than the write itself:
 *
 *  - a cell with `scope: null` REMOVES the grant. Default deny means an absent row is the
 *    way to take a power away, so the grid needs to be able to express absence.
 *  - every cell this touches has `derived` cleared. A derived row is one the seed wrote;
 *    once an administrator has moved it, a later regeneration must not silently put it
 *    back (10 §9).
 */
export async function writeMatrix(
  req: Request,
  orgId: string,
  userId: string,
  body: PutGrantsBody,
): Promise<GrantCell[]> {
  const roles = await prisma.node.findMany({
    where: { orgId, kind: 'role' },
    select: { id: true },
  });
  const known = new Set(roles.map((role) => role.id));

  for (const cell of body.cells) {
    if (!known.has(cell.roleId)) throw new NotFoundError('That role does not exist.');
    if (!(cell.capability in CAPABILITY_CATALOGUE)) {
      // The catalogue is defined by the application, never by the user (11 §3).
      // Administrators assign existing verbs to their own role names; they never invent
      // verbs, and a typo here would create a grant nothing ever checks.
      throw new ConflictError(`"${cell.capability}" is not a capability.`);
    }
  }

  await runInTransaction(req, async (tx) => {
    for (const cell of body.cells) {
      if (cell.scope === null) {
        await tx.grant.deleteMany({
          where: { orgId, subjectId: cell.roleId, capability: cell.capability },
        });
        continue;
      }
      await tx.grant.deleteMany({
        where: { orgId, subjectId: cell.roleId, capability: cell.capability },
      });
      await tx.grant.create({
        data: {
          orgId,
          subjectId: cell.roleId,
          capability: cell.capability,
          scope: cell.scope,
          effect: cell.effect,
          params: cell.params ?? {},
          // Cleared, always. This row is now an administrator's choice.
          derived: false,
          createdById: userId,
        },
      });
    }

    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'grant.update', targetType: 'organization', targetId: orgId });
  });

  clearGrantCache();
  return readMatrix(orgId);
}

/**
 * What the grid warns about. None of these is an error — they are all legal states that
 * are usually mistakes, and the difference matters: an administrator who is blocked from a
 * legal configuration stops trusting the tool.
 */
export async function grantWarnings(orgId: string): Promise<GrantWarning[]> {
  const [roles, grants] = await Promise.all([
    prisma.node.findMany({ where: { orgId, kind: 'role' }, select: { id: true, name: true } }),
    prisma.grant.findMany({
      where: { orgId, subject: { kind: 'role' } },
      select: { subjectId: true, capability: true, scope: true, effect: true },
    }),
  ]);

  const warnings: GrantWarning[] = [];
  const roleName = new Map(roles.map((role) => [role.id, role.name]));

  // 1 · a capability nobody holds. Usually harmless; occasionally it means the one role
  //     that could launch a campaign was renamed into a role that cannot.
  const held = new Set(grants.filter((g) => g.effect === 'allow').map((g) => g.capability));
  for (const [capability, meta] of Object.entries(CAPABILITY_CATALOGUE)) {
    if (meta.phase !== 'P1' && meta.phase !== 'P2') continue;
    if (held.has(capability)) continue;
    warnings.push({
      kind: 'nobody_can',
      capability,
      message: `Nobody in this organisation can ${describe(capability)}.`,
    });
  }

  // 2 · a deny sitting on top of that role's own allow. Deny wins absolutely (INV-004), so
  //     the allow beneath it never applies — which reads as a working power in the grid and
  //     is not one.
  for (const grant of grants.filter((g) => g.effect === 'deny')) {
    const shadowed = grants.some(
      (other) =>
        other.effect === 'allow' &&
        other.subjectId === grant.subjectId &&
        other.capability === grant.capability,
    );
    if (!shadowed) continue;
    warnings.push({
      kind: 'deny_shadows_allow',
      capability: grant.capability,
      roleId: grant.subjectId,
      message: `${roleName.get(grant.subjectId) ?? 'A role'} is both allowed and denied ${describe(grant.capability)}. The deny wins.`,
    });
  }

  // 3 · a role that can change its own powers. Legal, and the top role has to be able to,
  //     but worth saying out loud when it is true of someone further down.
  for (const grant of grants) {
    if (grant.capability !== 'grant.update' || grant.effect !== 'allow') continue;
    warnings.push({
      kind: 'self_approval',
      capability: grant.capability,
      roleId: grant.subjectId,
      message: `${roleName.get(grant.subjectId) ?? 'A role'} can change any role's powers, including its own.`,
    });
  }

  return warnings;
}

/** The catalogue, for the grid. Grouped exactly as 11 §3 groups it. */
export const capabilityCatalogue = (): CapabilityMeta[] =>
  Object.entries(CAPABILITY_CATALOGUE).map(([key, meta]) => ({
    key,
    module: meta.module,
    label: describe(key),
    phase: meta.phase,
  }));

/** "campaign.launch" -> "launch campaigns". Readable in a sentence, which is where it goes. */
function describe(capability: string): string {
  const [object = '', verb = ''] = capability.split('.');
  return `${verb} ${object}s`.replace(/ss$/, 'ses');
}

async function assertRole(orgId: string, roleId: string): Promise<void> {
  // D-001 again: the tenant client cannot scope a by-id where, so this is checked by hand
  // until RLS lands (10 §8).
  const role = await prisma.node.findFirst({
    where: { id: roleId, orgId, kind: 'role' },
    select: { id: true },
  });
  if (!role) throw new NotFoundError('That role does not exist.');
}

export type { Capability };
