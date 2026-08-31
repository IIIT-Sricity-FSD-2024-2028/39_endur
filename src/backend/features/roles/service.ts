// Roles and the powers grid.
// A ROLE is a node with an order number. A GRANT is a row saying that role may do something at some scope.
// The order only decides the seeded defaults; what is enforced is always the grant.
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
import { grantsForLevel, levelForRole } from '../../presets/grant-matrix.js';

// Every role in the organisation, with how many people hold each.
export async function listRoles(orgId: string): Promise<RoleView[]> {
  const roles = await prisma.node.findMany({
    where: { orgId, kind: 'role' },
    select: {
      id: true,
      name: true,
      level: true,
      _count: { select: { grants: true } },
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
  });
  if (roles.length === 0) return [];

  // Distinct PEOPLE per role, not role-at-unit slots: the delete dialog decides what to ask on this number.
  const assignments = await prisma.edge.findMany({
    where: {
      orgId,
      type: 'member',
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      child: { kind: 'position', roleId: { in: roles.map((role) => role.id) } },
    },
    select: { parentId: true, child: { select: { roleId: true } } },
  });

  const holders = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const roleId = assignment.child.roleId;
    if (!roleId) continue;
    const held = holders.get(roleId) ?? new Set<string>();
    held.add(assignment.parentId);
    holders.set(roleId, held);
  }

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    level: role.level ?? 0,
    peopleCount: holders.get(role.id)?.size ?? 0,
    grantCount: role._count.grants,
  }));
}

// Creates a role at the bottom of the ladder.
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
    // A new role lands at the bottom; anywhere else would silently re-rank everything above it.
    const role = await tx.node.create({
      data: { orgId, kind: 'role', name: body.name, level: (last?.level ?? 0) + 1 },
      select: { id: true, name: true, level: true },
    });
    // A new role starts with NO grants. Default deny is the floor, and the grid is where powers are chosen.
    req.ctx.audit.push({ action: 'role.create', targetType: 'role', targetId: role.id });
    return { id: role.id, name: role.name, level: role.level ?? 0, peopleCount: 0, grantCount: 0 };
  });
}

// Renames a role.
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
    // Renaming a role is the vocabulary claim in miniature: "Dean" becomes "General Manager" and nothing else moves.
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

// Reorders the roles. The level comes from the array order and is never sent by the client.
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
    // A partial list is ambiguous, and guessing would quietly re-rank a role nobody mentioned.
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

// Deletes a role. Refuses while people still hold it, unless the caller names where to move them.
export async function deleteRole(
  req: Request,
  orgId: string,
  roleId: string,
  body: DeleteRoleBody,
): Promise<{ ok: true }> {
  await assertRole(orgId, roleId);
  // Distinct people again: counting slots would overcount holders and refuse to delete a role nobody holds.
  const assignments = await prisma.edge.findMany({
    where: {
      orgId,
      type: 'member',
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      child: { kind: 'position', roleId },
    },
    select: { parentId: true },
  });
  const held = new Set(assignments.map((edge) => edge.parentId)).size;

  if (held > 0 && !body.reassignTo) {
    // Deleting cascades the positions away, and everyone's access with them, so it refuses with the number.
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

// The grid.

// The grid as it stands: one cell per role and capability.
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

// Saves the whole matrix in one transaction.
// A cell with no scope REMOVES the grant, because with default deny an absent row is how a power is taken away.
// Every cell touched stops being "derived", so a later regeneration cannot silently undo the change.
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
      // The catalogue is fixed by the application: administrators map existing verbs onto their own role names.
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
          // Always cleared: this row is now an administrator's own choice.
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

// The lockout guard: refuses a save that would leave NO role able to edit the powers grid.
// It is the one unrecoverable state on that screen, because fixing it needs the very capability nobody holds.
// Checked against the RESULTING matrix, not against the submitted cells.
async function assertSomebodyCanStillEditPowers(
  orgId: string,
  body: PutGrantsBody,
): Promise<void> {
  // Only a save that touches grant.update can remove the last holder, so every other save skips this query.
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

  // A deny beats an allow, so a role holding both holds nothing.
  const holders = [...after.values()].filter((effect) => effect === 'allow');
  if (holders.length > 0) return;

  throw new ConflictError(
    'That would leave no role able to change powers, and nobody could undo it. ' +
      'Keep at least one role with “change what every role is allowed to do”.',
  );
}

// What the grid warns about. None of these is an error: they are legal states that are usually mistakes.
export async function grantWarnings(
  orgId: string,
  labels: ResolvedLabels,
): Promise<GrantWarning[]> {
  const [roles, grants] = await Promise.all([
    prisma.node.findMany({
      where: { orgId, kind: 'role' },
      select: { id: true, name: true, level: true },
      orderBy: { level: 'asc' },
    }),
    prisma.grant.findMany({
      where: { orgId, subject: { kind: 'role' } },
      select: { subjectId: true, capability: true, scope: true, effect: true },
    }),
  ]);

  const warnings: GrantWarning[] = [];
  const roleName = new Map(roles.map((role) => [role.id, role.name]));

  // 1. A capability no role holds at all.
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

  // 2. A deny sitting on top of that same role's allow, which looks like a working power and is not.
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

  // 3. A role that can change its own powers. Expected at the top, worth saying further down.
  for (const grant of grants) {
    if (grant.capability !== 'grant.update' || grant.effect !== 'allow') continue;
    warnings.push({
      kind: 'self_approval',
      capability: grant.capability,
      roleId: grant.subjectId,
      message: `${roleName.get(grant.subjectId) ?? 'A role'} can change any role's powers, including its own.`,
    });
  }

  // 4. The bottom role still holding only its thin starter row, which is worth checking rather than discovering.
  const clamped = roles.filter(
    (role) => role.level !== null && levelForRole(role.level - 1, roles.length) === MATRIX_LEVELS,
  );
  const untouched = clamped.filter((role) =>
    grants.every((grant) => grant.subjectId !== role.id || DERIVED_L4.has(grant.capability)),
  );
  for (const role of untouched) {
    warnings.push({
      kind: 'thin_starter_row',
      roleId: role.id,
      message:
        `${role.name} is the bottom of the ladder, so it starts with the powers of somebody ` +
        'who answers rather than runs — read, and their own profile. Review this row and ' +
        'give it what the job needs.',
    });
  }

  return warnings;
}

// How many rows the seeded matrix describes.
const MATRIX_LEVELS = 4;


// The capabilities that bottom row hands out; a role holding only these has never been edited.
const DERIVED_L4 = new Set<string>(grantsForLevel(MATRIX_LEVELS).map((grant) => grant.capability));

// The catalogue for the grid, in the tenant's own words: a hotel reads "open guest surveys", not "launch campaigns".
export const capabilityCatalogue = (labels: ResolvedLabels): CapabilityMeta[] =>
  Object.entries(CAPABILITY_CATALOGUE).map(([key, meta]) => ({
    key,
    module: meta.module,
    label: describeCapability(key, labels),
    phase: meta.phase,
  }));

// The simulator: turns the request's target into the resolver's own target and calls resolve(). It never re-implements the rules.
export async function runSimulation(
  orgId: string,
  authzVersion: number,
  body: SimulateBody,
  labels: ResolvedLabels,
): Promise<Decision> {
  return simulate({
    orgId,
    userId: body.principalUserId,
    capability: body.capability,
    target: await resolveSimTarget(orgId, body.target, labels),
    // Spread rather than passed as at: body.at - an explicit undefined is not the same as an absent key,
    // and only the absent key means "now".
    ...(body.at ? { at: body.at } : {}),
    authzVersion,
  });
}

// Takes the tenant's nouns, because these messages are sentences shown to an administrator:
// a hotel operator told "that subject does not exist" is being shown a column name.
async function resolveSimTarget(
  orgId: string,
  target: SimulateBody['target'],
  labels: ResolvedLabels,
): Promise<Target> {
  if (target.kind === 'org') return { kind: 'org' };
  if (target.kind === 'unit') return { kind: 'unit', unitId: target.unitId };
  if (target.kind === 'person') return { kind: 'person', userId: target.userId };

  if (target.kind === 'subject') {
    const subject = await prisma.subject.findFirst({
      where: { id: target.subjectId, orgId },
      select: { unitId: true },
    });
    if (!subject) throw new NotFoundError(`That ${labels.subject.one.toLowerCase()} does not exist.`);
    // An absent `unitId` is how `Target` says ORG-WIDE — a subject hung off the org root
    // rather than any unit. Setting the key to `undefined` would say the same thing to
    // JavaScript and a different thing to the type, so the key is omitted instead.
    return subject.unitId ? { kind: 'subject', unitId: subject.unitId } : { kind: 'subject' };
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: target.campaignId, orgId },
    select: { audienceRule: true },
  });
  if (!campaign) throw new NotFoundError(`That ${labels.campaign.one.toLowerCase()} does not exist.`);
  const rule = campaign.audienceRule as { unitId?: string } | null;
  // Same rule as above: a campaign whose audience names no unit is org-wide.
  return rule?.unitId ? { kind: 'campaign', unitId: rule.unitId } : { kind: 'campaign' };
}

async function assertRole(orgId: string, roleId: string): Promise<void> {
  // The tenant-bound client cannot filter a by-id lookup, so the organisation is checked by hand here.
  const role = await prisma.node.findFirst({
    where: { id: roleId, orgId, kind: 'role' },
    select: { id: true },
  });
  if (!role) throw new NotFoundError('That role does not exist.');
}

export type { Capability };
