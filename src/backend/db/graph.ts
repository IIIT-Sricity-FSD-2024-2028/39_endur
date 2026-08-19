// THE ONLY FILE IN THE APP PERMITTED TO USE $queryRaw (DEC-007), enforced by lint.
// Prisma cannot express recursive CTEs, and the org graph is nothing but recursion.
//
// Each query is wrapped in a typed function so callers never see SQL. Two guards appear
// in every one of them and neither is optional:
//
//   depth < 32     cycles are prevented on write (wouldCreateCycle), but an unbounded
//                  recursive query turns a data bug into a hung connection.
//   org_id = $1    on EVERY join. A recursive query that escapes its tenant is the worst
//                  possible bug in a multi-tenant app (INV-010).
//
// If this file grows past ~8 functions, revisit the ORM choice (DEC-007, REVISIT 2026-10-01).
import { prisma } from './client.js';

const MAX_DEPTH = 32;

type IdRow = { id: string };

/** Every unit at or below `rootId`, in the `contains` dimension. Everything depends on this. */
export async function unitSubtree(orgId: string, rootId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<IdRow[]>`
    WITH RECURSIVE subtree AS (
      SELECT n.id, 0 AS depth
        FROM nodes n
       WHERE n.id = ${rootId}::uuid AND n.org_id = ${orgId}::uuid AND n.kind = 'unit'
      UNION ALL
      SELECT c.id, s.depth + 1
        FROM subtree s
        JOIN edges e ON e.parent_id = s.id
                    AND e.type = 'contains'
                    AND e.org_id = ${orgId}::uuid
                    AND (e.valid_to IS NULL OR e.valid_to > now())
        JOIN nodes c ON c.id = e.child_id AND c.org_id = ${orgId}::uuid
       WHERE s.depth < ${MAX_DEPTH}
    )
    SELECT id FROM subtree`;
  return rows.map((row) => row.id);
}

/** Every unit from `unitId` up to its root. Used to answer "is X inside Y". */
export async function unitAncestors(orgId: string, unitId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<IdRow[]>`
    WITH RECURSIVE up AS (
      SELECT n.id, 0 AS depth
        FROM nodes n
       WHERE n.id = ${unitId}::uuid AND n.org_id = ${orgId}::uuid AND n.kind = 'unit'
      UNION ALL
      SELECT p.id, u.depth + 1
        FROM up u
        JOIN edges e ON e.child_id = u.id
                    AND e.type = 'contains'
                    AND e.org_id = ${orgId}::uuid
                    AND (e.valid_to IS NULL OR e.valid_to > now())
        JOIN nodes p ON p.id = e.parent_id AND p.org_id = ${orgId}::uuid
       WHERE u.depth < ${MAX_DEPTH}
    )
    SELECT id FROM up`;
  return rows.map((row) => row.id);
}

export type PositionRow = { id: string; roleId: string; unitId: string; name: string };

/** Every position anchored anywhere in a unit's subtree. */
export async function positionsInSubtree(orgId: string, rootId: string): Promise<PositionRow[]> {
  const units = await unitSubtree(orgId, rootId);
  if (units.length === 0) return [];
  const rows = await prisma.node.findMany({
    where: { orgId, kind: 'position', unitId: { in: units } },
    select: { id: true, roleId: true, unitId: true, name: true },
  });
  return rows.map((row) => ({
    id: row.id,
    roleId: row.roleId ?? '',
    unitId: row.unitId ?? '',
    name: row.name,
  }));
}

/**
 * Would adding parent → child close a loop? Checked BEFORE any `contains`/`reports`
 * insert (10 §10). A cycle here does not merely produce wrong answers — it makes the
 * subtree query never terminate without the depth guard.
 */
export async function wouldCreateCycle(
  orgId: string,
  dimension: string,
  parentId: string,
  childId: string,
): Promise<boolean> {
  if (parentId === childId) return true;
  const rows = await prisma.$queryRaw<IdRow[]>`
    WITH RECURSIVE down AS (
      SELECT ${childId}::uuid AS id, 0 AS depth
      UNION ALL
      SELECT e.child_id, d.depth + 1
        FROM down d
        JOIN edges e ON e.parent_id = d.id
                    AND e.org_id = ${orgId}::uuid
                    AND e.dimension = ${dimension}
                    AND (e.valid_to IS NULL OR e.valid_to > now())
       WHERE d.depth < ${MAX_DEPTH}
    )
    SELECT id FROM down WHERE id = ${parentId}::uuid LIMIT 1`;
  return rows.length > 0;
}
