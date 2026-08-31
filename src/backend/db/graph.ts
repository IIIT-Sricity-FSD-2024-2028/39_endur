// The only file allowed to write raw SQL: the recursive org-graph queries, plus one row lock.
// Every query is depth-capped at 32 and filtered by org_id, so it can neither hang nor cross tenants.
import type { Prisma } from '@prisma/client';
import { prisma } from './client.js';

const MAX_DEPTH = 32;

type IdRow = { id: string };

// Every unit at or below rootId. Most permission and list code depends on this.
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

// Every unit from unitId up to the root. Used to answer "is X inside Y".
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

// Every position anchored anywhere in a unit's subtree.
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

// Would linking parent to child close a loop? Checked before any structural insert.
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

// Locks one booking slot row inside a transaction, so two phones cannot take the last place at once.
export async function lockSlot(tx: Prisma.TransactionClient, slotId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM slots WHERE id = ${slotId}::uuid FOR UPDATE`;
}

// The migrations this database has finished, read from Prisma's own bookkeeping table.
export async function appliedMigrations(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  return rows.map((row) => row.migration_name);
}
