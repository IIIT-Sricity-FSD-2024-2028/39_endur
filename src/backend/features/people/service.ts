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
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { nounsOf } from '../../lib/vocabulary.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';
import { seesNothing, visibleUnits, clearGrantCache } from '../../authz/index.js';
import { bumpVersion } from '../org/service.js';
import { nameMaps, resolveRow } from './positions.js';
import { assertPersonVisible as assertVisible, personScopeFilter } from './visibility.js';
import { powersByPlace } from './powers.js';
import { accountStatusOf } from '../accounts/status.js';

/**
 * The list, scope-filtered by the API (INV-003).
 *
 * The rule itself lives in `visibility.ts`, because the detail route has to apply exactly
 * the same one — a row that appears in this table and then 404s when somebody clicks it is
 * the failure N-005 and N-016 are about.
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

  // ONE predicate, shared with the detail route (visibility.ts). It used to be written out
  // here and again inside assertVisible, and the two had already drifted: neither admitted
  // a person with NO positions, which made everybody `POST /people` creates invisible to
  // the caller who created them (D-026).
  const scopeFilter = personScopeFilter(visibility, userId);

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
  // ONE implementation, shared with `/profile` (powers.ts). It used to be written out here,
  // and the copy that would have appeared in 47's route is exactly the drift N-005 is about.
  const places = await powersByPlace(orgId, person.userId, summary.positions, authzVersion);

  return { ...summary, powersByPlace: places };
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
    // NAME AND EMAIL ONLY. `status` used to be settable here and it was a fake revoke —
    // it blocked new sign-ins while leaving live sessions and the password hash intact,
    // under a weaker capability than `account.revoke`. D-024, and 57 § Revocation owns the
    // real one.
    if (person.userId && (body.name || body.email)) {
      await tx.user.update({
        where: { id: person.userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email } : {}),
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
  if (!unit) throw new NotFoundError(`That ${nounsOf(req).unit.one.toLowerCase()} does not exist.`);

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
    // The second unit column goes in the SAME list. It is mapped by the same control in the
    // preview, so a name that appears in both columns is answered once.
    if (row.alsoUnitName && !unitNames.has(row.alsoUnitName.toLowerCase())) {
      unmatchedUnits.add(row.alsoUnitName);
    }
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
  // The SAME resolution the INV-012 guard ran in front of this route (positions.ts). Two
  // copies of "which role does this row mean" would eventually disagree, and the failure
  // mode of that disagreement is a row the guard did not check and this loop did create.
  const maps = await nameMaps(orgId);

  const result = { created: 0, updated: 0, assigned: 0, skipped: [] as string[] };

  await runInTransaction(req, async (tx) => {
    for (const row of body.rows) {
      const { roleId, unitId, alsoUnitId } = resolveRow(maps, body, row);

      // A row naming a role or unit nobody resolved is SKIPPED and reported, never
      // silently imported without its position. Somebody who appears in the list with no
      // access looks like a permissions bug rather than an unfinished import.
      if ((row.roleName && !roleId) || (row.unitName && !unitId) || (row.alsoUnitName && !alsoUnitId)) {
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

      // THE SECOND PLACE (N-071), and it is `isPrimary: false` — the home unit is where a
      // person-anchored grant anchors, and a student's home unit is their department, not
      // their hostel. A second primary would make that ambiguous, which `person-anchor`
      // refuses to guess at.
      if (!alsoUnitId || alsoUnitId === unitId) continue;

      const alsoPosition =
        (await tx.node.findFirst({
          where: { orgId, kind: 'position', roleId, unitId: alsoUnitId },
          select: { id: true },
        })) ??
        (await tx.node.create({
          data: {
            orgId,
            kind: 'position',
            name: `${row.roleName ?? 'Position'} — ${row.alsoUnitName ?? ''}`.trim(),
            roleId,
            unitId: alsoUnitId,
          },
          select: { id: true },
        }));

      const alsoHeld = await tx.edge.findFirst({
        where: { orgId, type: 'member', parentId: person.id, childId: alsoPosition.id },
        select: { id: true },
      });
      if (!alsoHeld) {
        await tx.edge.create({
          data: {
            orgId,
            type: 'member',
            parentId: person.id,
            childId: alsoPosition.id,
            isPrimary: false,
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
  // N-071. The header words a person actually writes for "and they are also here": a
  // student in a department AND a hostel, a nurse on a ward AND a rota.
  const alsoAt = index('also in', 'also', 'second unit', 'additional unit', 'other unit');

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
      ...(alsoAt >= 0 && cells[alsoAt]?.trim() ? { alsoUnitName: cells[alsoAt].trim() } : {}),
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
  user: {
    select: {
      email: true,
      status: true,
      lastLoginAt: true,
      disabledAt: true,
      // READ, REDUCED TO A BOOLEAN IN toSummary(), AND NEVER RETURNED. `status` alone
      // cannot answer "can this person sign in": `PATCH /people/:id` can set a status and
      // the login query trusts the HASH, not the string (features/auth/router.ts). The
      // panel must agree with the door, so it asks the same column the door asks.
      passwordHash: true,
      // At most one row — a partial unique index on (user_id) WHERE accepted_at IS NULL.
      accountInvites: {
        where: { acceptedAt: null },
        select: { expiresAt: true, createdAt: true },
        take: 1,
      },
    },
  },
  edgesAsParent: {
    where: { type: 'member' as const },
    select: {
      id: true,
      isPrimary: true,
      // T-051. `validTo` is 47's "any expiry date"; `unitId` is what stopped powersByPlace
      // re-finding the unit by NAME, which collapsed two same-named units onto one row
      // (powers.ts has the full account). `level` is 24's `<PersonChip>` rule that a role
      // is always shown with its level — ORDERING ONLY (DEC-002), never a comparison.
      validTo: true,
      child: {
        select: {
          unitId: true,
          roleId: true,
          role: { select: { name: true, level: true } },
          unit: { select: { name: true } },
        },
      },
    },
  },
};

type PersonRow = {
  id: string;
  name: string;
  userId: string | null;
  createdAt: Date;
  user: {
    email: string;
    status: string;
    lastLoginAt: Date | null;
    disabledAt: Date | null;
    passwordHash: string | null;
    accountInvites: Array<{ expiresAt: Date; createdAt: Date }>;
  } | null;
  edgesAsParent: Array<{
    id: string;
    isPrimary: boolean;
    validTo: Date | null;
    child: {
      unitId: string | null;
      roleId: string | null;
      role: { name: string; level: number | null } | null;
      unit: { name: string } | null;
    };
  }>;
};

function toSummary(person: PersonRow): PersonSummary & { createdAt: string } {
  return {
    id: person.id,
    userId: person.userId,
    name: person.name,
    email: person.user?.email ?? null,
    positions: person.edgesAsParent.map((edge) => ({
      edgeId: edge.id,
      roleId: edge.child.roleId,
      roleName: edge.child.role?.name ?? '',
      roleLevel: edge.child.role?.level ?? null,
      // Nullable rather than coalesced to '', unlike the names beside it: a name is only
      // ever printed, and an id can end up in a URL. An empty one would 404 quietly.
      unitId: edge.child.unitId,
      unitName: edge.child.unit?.name ?? '',
      isPrimary: edge.isPrimary,
      validTo: edge.validTo?.toISOString() ?? null,
    })),
    createdAt: person.createdAt.toISOString(),
    // 57. Derived in ONE place, shared with the detail route, and the hash is reduced to a
    // boolean HERE so it cannot travel any further than this expression.
    account: person.user
      ? accountStatusOf({
          hasPassword: person.user.passwordHash !== null,
          status: person.user.status,
          lastLoginAt: person.user.lastLoginAt,
          disabledAt: person.user.disabledAt,
          liveInvite: person.user.accountInvites[0] ?? null,
        })
      : { state: 'none' },
  };
}
