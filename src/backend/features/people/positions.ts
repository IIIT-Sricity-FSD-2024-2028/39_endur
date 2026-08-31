// Turns the role and unit NAMES in an import file into ids.
// Shared by the import service and by the escalation guard in front of it, so the guard can never
// check one role while the service creates another.
import type { ImportPeopleBody, ImportRow } from '@endur/shared';
import { prisma } from '../../db/client.js';
import type { RoleUnitPair } from '../../middleware/requireNoEscalation.js';

export type NameMaps = { roleByName: Map<string, string>; unitByName: Map<string, string> };

// Every role and unit name in this organisation, lower-cased, mapped to its id.
export async function nameMaps(orgId: string): Promise<NameMaps> {
  const [roles, units] = await Promise.all([
    prisma.node.findMany({ where: { orgId, kind: 'role' }, select: { id: true, name: true } }),
    prisma.node.findMany({ where: { orgId, kind: 'unit' }, select: { id: true, name: true } }),
  ]);
  return {
    roleByName: new Map(roles.map((role) => [role.name.toLowerCase(), role.id])),
    unitByName: new Map(units.map((unit) => [unit.name.toLowerCase(), unit.id])),
  };
}

// The ids one CSV row resolves to. A mapping the operator confirmed in the preview beats a name match.
export function resolveRow(
  maps: NameMaps,
  body: ImportPeopleBody,
  row: ImportRow,
): { roleId: string | undefined; unitId: string | undefined; alsoUnitId: string | undefined } {
  const unit = (name?: string) =>
    name ? (body.unitMapping[name] ?? maps.unitByName.get(name.toLowerCase())) : undefined;
  return {
    roleId: row.roleName
      ? (body.roleMapping[row.roleName] ?? maps.roleByName.get(row.roleName.toLowerCase()))
      : undefined,
    unitId: unit(row.unitName),
    // The second unit uses the same mapping, so "did you mean" is answered once for both columns.
    alsoUnitId: unit(row.alsoUnitName),
  };
}

// Every position a commit would create, for the guard to bound.
// Rows that resolve to only a role or only a unit are left out: the service skips them, so nothing is created.
export async function pairsFromImport(
  orgId: string,
  body: ImportPeopleBody,
): Promise<RoleUnitPair[]> {
  const maps = await nameMaps(orgId);
  const out: RoleUnitPair[] = [];
  for (const row of body.rows) {
    const { roleId, unitId, alsoUnitId } = resolveRow(maps, body, row);
    if (roleId && unitId) out.push({ roleId, unitId });
    // The second placement is bounded too: it is the same role at a DIFFERENT unit, and the bound is about where.
    if (roleId && alsoUnitId) out.push({ roleId, unitId: alsoUnitId });
  }
  return out;
}

// The positions a person ALREADY holds, for the guard on giving them a sign-in.
// Provisioning an account creates no position, but it wakes up the ones already there: a person with roles
// and no account is an org-chart entry, not an actor. Without this the bound could be split across two legal calls.
export async function pairsFromPerson(orgId: string, personId: string): Promise<RoleUnitPair[]> {
  const edges = await prisma.edge.findMany({
    where: { orgId, type: 'member', parentId: personId },
    select: { child: { select: { roleId: true, unitId: true } } },
  });
  return edges
    .map((edge) => edge.child)
    .filter((position): position is { roleId: string; unitId: string } =>
      Boolean(position.roleId && position.unitId),
    )
    .map((position) => ({ roleId: position.roleId, unitId: position.unitId }));
}
