// People, positions and the CSV import.
// A person is two rows: a users row (the account) and a person node (what the graph hangs grants off).
// They are separate because a person can exist in the structure long before anyone activates an account.
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
import { involvementFor } from './involvement.js';
import { accountStatusOf } from '../accounts/status.js';

// The list, already filtered to what this caller may see.
// The filter itself lives in visibility.ts, because the detail route must apply exactly the same rule -
// a row that appears in the list and then 404s when clicked is the bug that shares causes.
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

  // One shared predicate. Written twice, the two copies drifted and hid every person who had no position yet.
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
      // limit + 1: the extra row is how "is there more" is known without a second count query.
      take: query.limit + 1,
      orderBy: CURSOR_ORDER,
      select: personSelect,
    }),
    // Also scope-filtered, so the total counts what the caller may see, not what exists.
    prisma.node.count({ where }),
  ]);

  return pageOf(rows, query.limit, total, toSummary);
}

// One person: their details, positions, and what those positions let them do where.
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
  // One shared implementation with the profile page, so the two can never describe powers differently.
  const places = await powersByPlace(orgId, person.userId, summary.positions, authzVersion);

  // What they are being ASKED for, which for a respondent is the only thing on the page:
  // they hold no account and therefore no powers, so before this the most populated people
  // in the organisation had the emptiest page in it (N-079).
  //
  // 'self' is not a shortcut past INV-003. Reading somebody else's list is bounded by the
  // caller's own campaign.read scope; reading your own is the `self` scope this route
  // already resolves under, and gating that on an administrative capability would hide
  // "what am I supposed to fill in" from everybody who is not an administrator.
  const isSelf = person.userId !== null && person.userId === callerId;
  const involvement = await involvementFor(
    orgId,
    { userId: person.userId, positions: summary.positions, canSignIn: summary.account.state === 'active' },
    isSelf
      ? 'self'
      : await visibleUnits({ orgId, userId: callerId, capability: 'campaign.read', authzVersion }),
  );

  return { ...summary, powersByPlace: places, involvement };
}

// Creates a person, plus an invited account when an email was given.
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
    // Created as 'invited' with no password hash, which is the state that means "cannot sign in yet".
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

// Renames a person or changes their email address.
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
    // Name and email only. Status is not settable here: that would be a fake revoke, under a weaker capability.
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

// Removes a person, their positions and their account, but not their history in the audit log.
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
    // The account row goes too, but audit rows survive it: a log that forgets people who left is not a log.
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

// Giving somebody a position is a permission change, which is why it has its own capability and audit row.
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
    // The position node is shared by everyone holding the same role at the same unit, so it is found before
    // it is created. Two identical positions would mean two places to attach a grant, and only one checked.
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

// Removes one assignment, and the powers that came with it.
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

// CSV import.

// The preview step, so nothing is guessed: it reports the columns found, a few real rows, and every
// role or unit name in the file that this organisation does not have. Missing ones are never invented.
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
    // The second unit column shares the same list, so a name in both columns is answered once.
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

// The commit. Idempotent by email, so a retried import updates people rather than duplicating them.
export async function commitImport(
  req: Request,
  orgId: string,
  body: ImportPeopleBody,
): Promise<{ created: number; updated: number; assigned: number; skipped: string[] }> {
  // The same name resolution the escalation guard ran in front of this route, so the two cannot disagree.
  const maps = await nameMaps(orgId);

  const result = { created: 0, updated: 0, assigned: 0, skipped: [] as string[] };

  await runInTransaction(req, async (tx) => {
    for (const row of body.rows) {
      const { roleId, unitId, alsoUnitId } = resolveRow(maps, body, row);

      // A row naming a role or unit nobody could resolve is skipped and reported, never imported without its position.
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

      // The optional second placement, marked not-primary: the home unit is where a person-level grant anchors.
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

// A deliberately small CSV reader: quoted fields are handled because real exports have them, and nothing more exotic is.
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
  // The header words people actually write for "they are also here": a student in a department and a hostel.
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

// Splits one CSV line, respecting quoted cells.
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

// Shared helpers.

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
      // Read only to answer "can this person sign in", reduced to a boolean below and never returned.
      passwordHash: true,
      // At most one row: a unique index allows only one open invite per user.
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
      // validTo is the assignment's expiry; unitId stops two same-named units collapsing into one row;
      // level is used for ordering only, never for comparing power.
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

// Turns a person row into the summary shape the client reads.
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
      // Left nullable rather than made an empty string: an id can end up in a URL, and an empty one 404s quietly.
      unitId: edge.child.unitId,
      unitName: edge.child.unit?.name ?? '',
      isPrimary: edge.isPrimary,
      validTo: edge.validTo?.toISOString() ?? null,
    })),
    createdAt: person.createdAt.toISOString(),
    // The account's state, worked out in one place and shared, with the password hash reduced to a boolean here.
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
