// Roles and the powers grid. 13, 33, 11 §8, 50 §1.
//
// Two things live here that look similar and are not. A ROLE is a node with an ordering
// number. A GRANT is a row saying that node may do something at some scope. Levels order
// roles for the seeded defaults and for nothing else — the enforcement is always the grant
// (DEC-002, CONF-002).
import { CAPABILITY_CATALOGUE, describeCapability, type Capability } from '@endur/shared';
import type { ResolvedLabels } from '@endur/shared';
import type {
  CapabilityMeta,
  CreateRoleBody,
  DeleteRoleBody,
  GrantCell,
  GrantWarning,
  PutGrantsBody,
  ReorderRolesBody,
  RoleView,
  SimulateBody,
  UpdateRoleBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { clearGrantCache, simulate, type Decision, type Target } from '../../authz/index.js';
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

  await assertSomebodyCanStillEditPowers(orgId, body);

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
 * THE LOCKOUT GUARD — 33 § "The lockout guard". `409`, never a warning.
 *
 * A grid that leaves no role holding `grant.update` is the one unrecoverable mistake on that
 * screen: the organisation can still be used and can never be re-configured, because the
 * capability that would fix it is the capability nobody holds any more. There is no undo,
 * because undo is a grid edit.
 *
 * It is the ONLY place in the product where an administrator's explicit intent is overridden,
 * and 33 argues the exception rather than assuming it: everything else the grid can express
 * is a legal configuration somebody might mean, and blocking on a judgement call is how
 * administrators learn to fight the tool. This one is not a judgement call — it is a state
 * from which the tool cannot be operated at all.
 *
 * COMPUTED ON THE RESULTING MATRIX, NOT ON THE SUBMITTED CELLS. `PUT /grants` writes the
 * cells it is given and leaves the rest alone, so a body that merely does not MENTION
 * `grant.update` is fine, and a body that removes the last holder is not. Checking the body
 * would refuse the first and allow the second, which is exactly backwards.
 *
 * Not middleware, unlike the escalation bound next to it, and the difference is real: this is
 * not an authorisation question. The caller is permitted to make this change; the resulting
 * state is the thing that is refused. `409`, the same shape as "that is not a capability".
 */
async function assertSomebodyCanStillEditPowers(
  orgId: string,
  body: PutGrantsBody,
): Promise<void> {
  // Only a body that TOUCHES grant.update can remove the last holder. Every other save skips
  // the query entirely, which matters because the grid saves the whole visible matrix.
  const touches = body.cells.some((cell) => cell.capability === 'grant.update');
  if (!touches) return;

  const current = await prisma.grant.findMany({
    where: { orgId, capability: 'grant.update', subject: { kind: 'role' } },
    select: { subjectId: true, effect: true },
  });

  const after = new Map<string, 'allow' | 'deny' | 'none'>();
  for (const grant of current) after.set(grant.subjectId, grant.effect);
  for (const cell of body.cells) {
    if (cell.capability !== 'grant.update') continue;
    after.set(cell.roleId, cell.scope === null ? 'none' : cell.effect);
  }

  // INV-004: a deny beats an allow, so a role holding both holds nothing. A holder is a
  // role whose resulting cell is an allow and nothing else.
  const holders = [...after.values()].filter((effect) => effect === 'allow');
  if (holders.length > 0) return;

  throw new ConflictError(
    'That would leave no role able to change powers, and nobody could undo it. ' +
      'Keep at least one role with “change what every role is allowed to do”.',
  );
}

/**
 * What the grid warns about. None of these is an error — they are all legal states that
 * are usually mistakes, and the difference matters: an administrator who is blocked from a
 * legal configuration stops trusting the tool.
 */
export async function grantWarnings(
  orgId: string,
  labels: ResolvedLabels,
): Promise<GrantWarning[]> {
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
      message: `Nobody in this organisation can ${describeCapability(capability, labels)}.`,
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
      message: `${roleName.get(grant.subjectId) ?? 'A role'} is both allowed and denied “${describeCapability(grant.capability, labels)}”. The deny wins.`,
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

/**
 * The catalogue, for the grid. Grouped exactly as 11 §3 groups it.
 *
 * TAKES THE TENANT'S NOUNS SINCE T-052 (`D-008`). The row labels of the powers grid are
 * user-facing domain nouns, so INV-001 applies to them exactly as it applies to a component:
 * a hotel's grid reads *"open guest surveys for answers"*, not *"launch campaigns"*.
 */
export const capabilityCatalogue = (labels: ResolvedLabels): CapabilityMeta[] =>
  Object.entries(CAPABILITY_CATALOGUE).map(([key, meta]) => ({
    key,
    module: meta.module,
    label: describeCapability(key, labels),
    phase: meta.phase,
  }));

/**
 * `POST /authz/simulate` — 42. Resolves the DTO's target into the resolver's own `Target`
 * and calls `simulate()`, which is `resolve()` itself (`authz/simulate.ts`). Nothing here
 * touches the algorithm; it only turns a subject or campaign id into the unit `resolve()`
 * already knows how to scope against.
 */
export async function runSimulation(
  orgId: string,
  authzVersion: number,
  body: SimulateBody,
): Promise<Decision> {
  return simulate({
    orgId,
    userId: body.principalUserId,
    capability: body.capability as never,
    target: await resolveSimTarget(orgId, body.target),
    at: body.at,
    authzVersion,
  });
}

async function resolveSimTarget(orgId: string, target: SimulateBody['target']): Promise<Target> {
  if (target.kind === 'org') return { kind: 'org' };
  if (target.kind === 'unit') return { kind: 'unit', unitId: target.unitId };
  if (target.kind === 'person') return { kind: 'person', userId: target.userId };

  if (target.kind === 'subject') {
    const subject = await prisma.subject.findFirst({
      where: { id: target.subjectId, orgId },
      select: { unitId: true },
    });
    if (!subject) throw new NotFoundError('That subject does not exist.');
    return { kind: 'subject', unitId: subject.unitId ?? undefined };
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: target.campaignId, orgId },
    select: { audienceRule: true },
  });
  if (!campaign) throw new NotFoundError('That campaign does not exist.');
  const rule = campaign.audienceRule as { unitId?: string } | null;
  return { kind: 'campaign', unitId: rule?.unitId };
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
