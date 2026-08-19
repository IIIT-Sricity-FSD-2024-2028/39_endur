// People, positions and CSV import. 13 § People, 34.
//
// A "person" here is two rows: a `users` row (the account) and a `person` node (the thing
// the graph hangs grants off). They are separate because respondents are never users
// (DEC-009) and because a person can exist in the graph before anyone activates an
// account for them.
import type {
  CreateAssignmentBody,
  CreatePersonBody,
  ImportPeopleBody,
  ImportPreview,
  ImportRow,
  PersonDetail,
  PersonListQuery,
  PersonSummary,
  UpdatePersonBody,
} from '@endur/shared';
import { CAPABILITY_CATALOGUE, type Capability } from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { resolve, seesNothing, visibleUnits, clearGrantCache } from '../../authz/index.js';
import { bumpVersion } from '../org/service.js';

/**
 * The list, scope-filtered by the API (INV-003).
 *
 * A person is visible when one of their positions sits in a unit the caller can see. Their
 * own row is always visible, which is what the universal `person.read self` grant is for —
 * without it a default-deny model produces an unopenable profile page (50 §1).
 */
export async function listPeople(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: PersonListQuery,
): Promise<Paged<PersonSummary & { createdAt: string }>> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'person.read', authzVersion });
  if (seesNothing(visibility)) {
    return { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } };
  }

  const scopeFilter = visibility.all
    ? {}
    : {
        OR: [
          // Reachable through a position in a visible unit...
          {
            edgesAsParent: {
              some: {
                type: 'member' as const,
                child: { unitId: { in: visibility.unitIds } },
              },
            },
          },
          // ...or it is the caller themselves.
          ...(visibility.self ? [{ userId }] : []),
        ],
      };

  const where = {
    orgId,
    kind: 'person' as const,
    ...scopeFilter,
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    ...(query.unitId
      ? { edgesAsParent: { some: { type: 'member' as const, child: { unitId: query.unitId } } } }
      : {}),
    ...(query.roleId
      ? { edgesAsParent: { some: { type: 'member' as const, child: { roleId: query.roleId } } } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.node.findMany({
      where: { ...where, ...afterCursor(query.cursor) },
      // limit + 1: the extra row is how `hasMore` is known without a second count query.
      take: query.limit + 1,
      orderBy: CURSOR_ORDER,
      select: personSelect,
    }),
    // Scope-filtered, so meta.total counts what the CALLER may see, not what exists (13 §4).
    prisma.node.count({ where }),
  ]);

  return pageOf(rows, query.limit, total, toSummary);
}

/**
 * The row-level half of the person guard.
 *
 * requireCapability can only ask "do you hold this anywhere" for a person route, because a
 * person is not anchored to a unit in the request — their POSITIONS are, and those are only
 * known once the row is read. This closes that gap, and it answers 404 rather than 403 for
 * the same reason every out-of-scope read does: a 403 would confirm the person exists to
 * somebody who cannot see them (13 §5).
 */
async function assertVisible(
  orgId: string,
  callerId: string,
  authzVersion: number,
  personId: string,
  capability: 'person.read' | 'person.update' | 'person.delete' | 'assignment.delete',
): Promise<void> {
  const visibility = await visibleUnits({ orgId, userId: callerId, capability, authzVersion });
  if (visibility.all) return;

  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person' },
    select: {
      userId: true,
      edgesAsParent: {
        where: { type: 'member' },
        select: { child: { select: { unitId: true } } },
      },
    },
  });
  if (!person) throw new NotFoundError('That person does not exist.');

  // Their own row, always. That is what the universal `person.read self` grant buys, and
  // without it a default-deny model produces an unopenable profile page (50 §1).
  if (visibility.self && person.userId === callerId) return;

  const units = person.edgesAsParent
    .map((edge) => edge.child.unitId)
    .filter((unitId): unitId is string => Boolean(unitId));
  if (units.some((unitId) => visibility.unitIds.includes(unitId))) return;

  throw new NotFoundError('That person does not exist.');
}

export async function readPerson(
  orgId: string,
  personId: string,
  callerId: string,
  authzVersion: number,
): Promise<PersonDetail> {
  await assertVisible(orgId, callerId, authzVersion, personId, 'person.read');

  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person' },
    select: personSelect,
  });
  if (!person) throw new NotFoundError('That person does not exist.');

  const summary = toSummary(person);
  const powersByPlace: PersonDetail['powersByPlace'] = [];

  // Powers come from the SHARED resolver. A second implementation here would be a second
  // permission model, and the two would disagree the first time either changed (N-005).
  if (person.userId) {
    for (const position of summary.positions) {
      const unit = await prisma.node.findFirst({
        where: { orgId, kind: 'position', unit: { name: position.unitName } },
        select: { unitId: true },
      });
      if (!unit?.unitId) continue;

      const capabilities: PersonDetail['powersByPlace'][number]['capabilities'] = [];
      for (const capability of Object.keys(CAPABILITY_CATALOGUE) as Capability[]) {
        const decision = await resolve({
          orgId,
          userId: person.userId,
          capability,
          authzVersion,
          target: { kind: 'unit', unitId: unit.unitId },
        });
        if (decision.allowed && decision.decidedBy) {
          capabilities.push({ capability, scope: decision.decidedBy.scope });
        }
      }
      powersByPlace.push({
        unitId: unit.unitId,
        unitName: position.unitName,
        roleName: position.roleName,
        capabilities,
      });
    }
  }

  return { ...summary, powersByPlace };
}

export async function createPerson(
  req: Request,
  orgId: string,
  body: CreatePersonBody,
): Promise<PersonSummary> {
  const taken = await prisma.user.findFirst({
    where: { orgId, email: body.email },
    select: { id: true },
  });
  if (taken) throw new ConflictError('Somebody with that email address is already here.');

  return runInTransaction(req, async (tx) => {
    // `invited`, with no password hash. An account nobody has activated must not be
    // sign-in-able, and a null hash is the state that says so (10 §2).
    const user = await tx.user.create({
      data: { orgId, email: body.email, name: body.name, status: 'invited' },
      select: { id: true },
    });
    const person = await tx.node.create({
      data: { orgId, kind: 'person', name: body.name, userId: user.id },
      select: personSelect,
    });
    req.ctx.audit.push({ action: 'person.create', targetType: 'person', targetId: person.id });
    return toSummary(person);
  });
}

export async function updatePerson(
  req: Request,
  orgId: string,
  personId: string,
  callerId: string,
  authzVersion: number,
  body: UpdatePersonBody,
): Promise<PersonSummary> {
  await assertVisible(orgId, callerId, authzVersion, personId, 'person.update');

  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person' },
    select: { id: true, userId: true },
  });
  if (!person) throw new NotFoundError('That person does not exist.');

  return runInTransaction(req, async (tx) => {
    if (body.name) await tx.node.update({ where: { id: personId }, data: { name: body.name } });
    if (person.userId && (body.name || body.email || body.status)) {
      await tx.user.update({
        where: { id: person.userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email } : {}),
          ...(body.status ? { status: body.status } : {}),
        },
      });
    }
    const updated = await tx.node.findFirstOrThrow({ where: { id: personId }, select: personSelect });
    req.ctx.audit.push({ action: 'person.update', targetType: 'person', targetId: personId });
    return toSummary(updated);
  });
}

export async function deletePerson(
  req: Request,
  orgId: string,
  personId: string,
  callerId: string,
  authzVersion: number,
): Promise<{ ok: true }> {
  await assertVisible(orgId, callerId, authzVersion, personId, 'person.delete');

  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person' },
    select: { id: true, userId: true },
  });
  if (!person) throw new NotFoundError('That person does not exist.');

  await runInTransaction(req, async (tx) => {
    await tx.node.delete({ where: { id: personId } });
    // The user row goes too — but audit rows survive it, because an audit log that loses
    // its history when somebody leaves is not an audit log (52 § Acceptance).
    if (person.userId) {
      await tx.user.update({ where: { id: person.userId }, data: { status: 'disabled' } });
    }
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'person.delete', targetType: 'person', targetId: personId });
  });
  clearGrantCache();
  return { ok: true };
}

/**
 * Giving somebody a position is a PERMISSION CHANGE, which is why it is its own endpoint
 * with its own capability and its own audit row (34, 14 §8).
 */
export async function addAssignment(
  req: Request,
  orgId: string,
  personId: string,
  body: CreateAssignmentBody,
): Promise<PersonSummary> {
  const [person, role, unit] = await Promise.all([
    prisma.node.findFirst({ where: { id: personId, orgId, kind: 'person' }, select: { id: true, name: true } }),
    prisma.node.findFirst({ where: { id: body.roleId, orgId, kind: 'role' }, select: { id: true, name: true } }),
    prisma.node.findFirst({ where: { id: body.unitId, orgId, kind: 'unit' }, select: { id: true, name: true } }),
  ]);
  if (!person) throw new NotFoundError('That person does not exist.');
  if (!role) throw new NotFoundError('That role does not exist.');
  if (!unit) throw new NotFoundError('That unit does not exist.');

  return runInTransaction(req, async (tx) => {
    // The position node is shared by everyone holding the same role at the same unit, so
    // it is found before it is created. Two "Tutor at Team A1" nodes would mean two places
    // to attach a position-level grant, and only one of them would ever be checked.
    const position =
      (await tx.node.findFirst({
        where: { orgId, kind: 'position', roleId: role.id, unitId: unit.id },
        select: { id: true },
      })) ??
      (await tx.node.create({
        data: {
          orgId,
          kind: 'position',
          name: `${role.name} — ${unit.name}`,
          roleId: role.id,
          unitId: unit.id,
        },
        select: { id: true },
      }));

    const existing = await tx.edge.findFirst({
      where: { orgId, type: 'member', parentId: person.id, childId: position.id },
      select: { id: true },
    });
    if (existing) throw new ConflictError('They already hold that position.');

    if (body.isPrimary) {
      await tx.edge.updateMany({
        where: { orgId, type: 'member', parentId: person.id },
        data: { isPrimary: false },
      });
    }
    await tx.edge.create({
      data: {
        orgId,
        type: 'member',
        parentId: person.id,
        childId: position.id,
        isPrimary: body.isPrimary,
        ...(body.validFrom ? { validFrom: body.validFrom } : {}),
        ...(body.validTo ? { validTo: body.validTo } : {}),
      },
    });

    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({
      action: 'assignment.create',
      targetType: 'person',
      targetId: personId,
    });

    const updated = await tx.node.findFirstOrThrow({ where: { id: personId }, select: personSelect });
    return toSummary(updated);
  }).then((result) => {
    clearGrantCache();
    return result;
  });
}

export async function removeAssignment(
  req: Request,
  orgId: string,
  personId: string,
  edgeId: string,
  callerId: string,
  authzVersion: number,
): Promise<{ ok: true }> {
  await assertVisible(orgId, callerId, authzVersion, personId, 'assignment.delete');

  const edge = await prisma.edge.findFirst({
    where: { id: edgeId, orgId, type: 'member', parentId: personId },
    select: { id: true },
  });
  if (!edge) throw new NotFoundError('That assignment does not exist.');

  await runInTransaction(req, async (tx) => {
    await tx.edge.delete({ where: { id: edgeId } });
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'assignment.delete', targetType: 'person', targetId: personId });
  });
  clearGrantCache();
  return { ok: true };
}

/* ------------------------------------------------------------------ import */

/**
 * The preview step exists so nothing is guessed. The operator sees which columns were
 * found, five real rows, and — the important part — every role and unit name in the file
 * that this organisation does not have.
 *
 * Inventing the missing ones is not an option: the capability catalogue and the org
 * structure are things administrators map onto, never things a CSV defines (11 §3).
 */
export async function previewImport(orgId: string, csv: string): Promise<ImportPreview> {
  const { columns, rows } = parseCsv(csv);

  const [roles, units, users] = await Promise.all([
    prisma.node.findMany({ where: { orgId, kind: 'role' }, select: { name: true } }),
    prisma.node.findMany({ where: { orgId, kind: 'unit' }, select: { name: true } }),
    prisma.user.findMany({ where: { orgId }, select: { email: true } }),
  ]);

  const roleNames = new Set(roles.map((role) => role.name.toLowerCase()));
  const unitNames = new Set(units.map((unit) => unit.name.toLowerCase()));
  const emails = new Set(users.map((user) => user.email.toLowerCase()));

  const unmatchedRoles = new Set<string>();
  const unmatchedUnits = new Set<string>();
  const existingEmails: string[] = [];

  for (const row of rows) {
    if (row.roleName && !roleNames.has(row.roleName.toLowerCase())) unmatchedRoles.add(row.roleName);
    if (row.unitName && !unitNames.has(row.unitName.toLowerCase())) unmatchedUnits.add(row.unitName);
    if (emails.has(row.email.toLowerCase())) existingEmails.push(row.email);
  }

  return {
    columns,
    sample: rows.slice(0, 5),
    rowCount: rows.length,
    unmatchedRoles: [...unmatchedRoles],
    unmatchedUnits: [...unmatchedUnits],
    existingEmails,
  };
}

/**
 * The commit. Idempotent by email within the organisation, so a retried import updates
 * rather than duplicates — which matters because the caller most likely to retry is
 * somebody whose first attempt appeared to fail and did not.
 */
export async function commitImport(
  req: Request,
  orgId: string,
  body: ImportPeopleBody,
): Promise<{ created: number; updated: number; assigned: number; skipped: string[] }> {
  const [roles, units] = await Promise.all([
    prisma.node.findMany({ where: { orgId, kind: 'role' }, select: { id: true, name: true } }),
    prisma.node.findMany({ where: { orgId, kind: 'unit' }, select: { id: true, name: true } }),
  ]);
  const roleByName = new Map(roles.map((role) => [role.name.toLowerCase(), role.id]));
  const unitByName = new Map(units.map((unit) => [unit.name.toLowerCase(), unit.id]));

  const result = { created: 0, updated: 0, assigned: 0, skipped: [] as string[] };

  await runInTransaction(req, async (tx) => {
    for (const row of body.rows) {
      const roleId = row.roleName
        ? (body.roleMapping[row.roleName] ?? roleByName.get(row.roleName.toLowerCase()))
        : undefined;
      const unitId = row.unitName
        ? (body.unitMapping[row.unitName] ?? unitByName.get(row.unitName.toLowerCase()))
        : undefined;

      // A row naming a role or unit nobody resolved is SKIPPED and reported, never
      // silently imported without its position. Somebody who appears in the list with no
      // access looks like a permissions bug rather than an unfinished import.
      if ((row.roleName && !roleId) || (row.unitName && !unitId)) {
        result.skipped.push(row.email);
        continue;
      }

      const existing = await tx.user.findFirst({
        where: { orgId, email: row.email },
        select: { id: true },
      });

      let userId = existing?.id;
      if (existing) {
        await tx.user.update({ where: { id: existing.id }, data: { name: row.name } });
        await tx.node.updateMany({
          where: { orgId, kind: 'person', userId: existing.id },
          data: { name: row.name },
        });
        result.updated += 1;
      } else {
        const user = await tx.user.create({
          data: { orgId, email: row.email, name: row.name, status: 'invited' },
          select: { id: true },
        });
        userId = user.id;
        await tx.node.create({ data: { orgId, kind: 'person', name: row.name, userId: user.id } });
        result.created += 1;
      }

      if (!roleId || !unitId) continue;

      const person = await tx.node.findFirstOrThrow({
        where: { orgId, kind: 'person', userId: userId as string },
        select: { id: true },
      });
      const position =
        (await tx.node.findFirst({
          where: { orgId, kind: 'position', roleId, unitId },
          select: { id: true },
        })) ??
        (await tx.node.create({
          data: {
            orgId,
            kind: 'position',
            name: `${row.roleName ?? 'Position'} — ${row.unitName ?? ''}`.trim(),
            roleId,
            unitId,
          },
          select: { id: true },
        }));

      const held = await tx.edge.findFirst({
        where: { orgId, type: 'member', parentId: person.id, childId: position.id },
        select: { id: true },
      });
      if (!held) {
        await tx.edge.create({
          data: {
            orgId,
            type: 'member',
            parentId: person.id,
            childId: position.id,
            isPrimary: true,
          },
        });
        result.assigned += 1;
      }
    }

    await tx.organization.update({
      where: { id: orgId },
      data: { settings: (await bumpVersion(tx, orgId)) as never },
    });
    req.ctx.audit.push({ action: 'person.import', targetType: 'organization', targetId: orgId });
  });

  clearGrantCache();
  return result;
}

/**
 * A deliberately small CSV reader. Quoted fields with embedded commas are handled because
 * real exports contain them; everything more exotic is not, because an import that half
 * understands a file is worse than one that says it cannot read it.
 */
function parseCsv(csv: string): { columns: string[]; rows: ImportRow[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = splitLine(lines[0] as string).map((column) => column.trim());
  const index = (...names: string[]) =>
    columns.findIndex((column) => names.includes(column.toLowerCase()));

  const nameAt = index('name', 'full name');
  const emailAt = index('email', 'email address', 'e-mail');
  const roleAt = index('role', 'title', 'position');
  const unitAt = index('unit', 'department', 'team', 'ward', 'property');

  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const email = (cells[emailAt] ?? '').trim();
    const name = (cells[nameAt] ?? '').trim();
    if (!email || !name) continue;
    rows.push({
      name,
      email,
      ...(roleAt >= 0 && cells[roleAt]?.trim() ? { roleName: cells[roleAt].trim() } : {}),
      ...(unitAt >= 0 && cells[unitAt]?.trim() ? { unitName: cells[unitAt].trim() } : {}),
    });
  }
  return { columns, rows };
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

/* ----------------------------------------------------------------- shared */

const personSelect = {
  id: true,
  name: true,
  userId: true,
  createdAt: true,
  user: { select: { email: true, status: true } },
  edgesAsParent: {
    where: { type: 'member' as const },
    select: {
      id: true,
      isPrimary: true,
      child: { select: { role: { select: { name: true } }, unit: { select: { name: true } } } },
    },
  },
};

type PersonRow = {
  id: string;
  name: string;
  userId: string | null;
  createdAt: Date;
  user: { email: string; status: string } | null;
  edgesAsParent: Array<{
    id: string;
    isPrimary: boolean;
    child: { role: { name: string } | null; unit: { name: string } | null };
  }>;
};

function toSummary(person: PersonRow): PersonSummary & { createdAt: string } {
  return {
    id: person.id,
    userId: person.userId,
    name: person.name,
    email: person.user?.email ?? null,
    status: person.user?.status ?? 'active',
    positions: person.edgesAsParent.map((edge) => ({
      edgeId: edge.id,
      roleName: edge.child.role?.name ?? '',
      unitName: edge.child.unit?.name ?? '',
      isPrimary: edge.isPrimary,
    })),
    createdAt: person.createdAt.toISOString(),
  };
}
