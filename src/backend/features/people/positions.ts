// Role/unit name resolution for the CSV import, shared by the import SERVICE and the
// INV-012 guard that runs in front of it.
//
// It is shared rather than written twice on purpose. The guard has to know which positions
// an import would create in order to bound them (11 §5b), and the service has to know the
// same thing in order to create them. Two copies of "which role does this row mean" would
// eventually disagree, and the failure mode of that disagreement is a row the guard did not
// check and the service did create — which is the hole the guard exists to close.
import type { ImportPeopleBody, ImportRow } from '@endur/shared';
import { prisma } from '../../db/client.js';
import type { RoleUnitPair } from '../../middleware/requireNoEscalation.js';

export type NameMaps = { roleByName: Map<string, string>; unitByName: Map<string, string> };

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

/**
 * The ids one row resolves to. An explicit mapping from the preview step wins over a name
 * match, because that mapping is the operator answering "did you mean" and their answer
 * outranks a coincidence of spelling (34 § Interactions).
 */
export function resolveRow(
  maps: NameMaps,
  body: ImportPeopleBody,
  row: ImportRow,
): { roleId: string | undefined; unitId: string | undefined } {
  return {
    roleId: row.roleName
      ? (body.roleMapping[row.roleName] ?? maps.roleByName.get(row.roleName.toLowerCase()))
      : undefined,
    unitId: row.unitName
      ? (body.unitMapping[row.unitName] ?? maps.unitByName.get(row.unitName.toLowerCase()))
      : undefined,
  };
}

/**
 * Every position a commit would create, for the guard.
 *
 * Rows that resolve to only a role or only a unit are omitted: the service skips them and
 * reports them (`result.skipped`), so no position is created and there is nothing to bound.
 * Bounding them anyway would refuse an import for a row that was never going to grant
 * anybody anything.
 */
export async function pairsFromImport(
  orgId: string,
  body: ImportPeopleBody,
): Promise<RoleUnitPair[]> {
  const maps = await nameMaps(orgId);
  const out: RoleUnitPair[] = [];
  for (const row of body.rows) {
    const { roleId, unitId } = resolveRow(maps, body, row);
    if (roleId && unitId) out.push({ roleId, unitId });
  }
  return out;
}

/**
 * The positions a person ALREADY HOLDS, for the account guard (57, 11 §5b).
 *
 * Provisioning a sign-in creates no position, so at first glance the escalation bound has
 * nothing to bound. It has exactly one thing: the positions were already there and were
 * inert — a `person` node with roles and no account is an org chart entry, not an actor.
 * The account is what turns it into one, so the bound is checked against what the person
 * would WAKE UP HOLDING.
 *
 * Without it the guard on `POST /:id/assignments` is composable into an escalation in two
 * legal calls: assign the senior role to somebody while you still may (or find somebody the
 * founder already made a Registrar), then hand them the key. Each call passes its own
 * check; the pair does not.
 *
 * Positions with no role or no unit are skipped for the same reason the import version
 * skips them — a position that anchors nowhere confers nothing, so there is nothing to
 * compare against the actor's reach.
 */
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
