// The tenant-bound Prisma client: every query it runs is limited to one organisation automatically.
// Postgres row-level security is the deliberate second layer behind it.
import { Prisma } from '@prisma/client';
import { prisma } from './client.js';

// Models that carry org_id themselves. Everything else is reached through one of these, so scoping the parent is enough.
const TENANT_MODELS = new Set([
  'User',
  'Node',
  'Edge',
  'Grant',
  'Subject',
  'Campaign',
  'File',
  'AuditLog',
  'ApiKey',
  'Subscription',
  'Announcement',
]);

// Read operations that take a where clause, so the orgId filter can be added to them.
const SCOPED_READS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

export type TenantClient = ReturnType<typeof tenantClient>;

// Builds a Prisma client bound to one org: reads get filtered, creates get stamped.
export function tenantClient(orgId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);

          if (SCOPED_READS.has(operation)) {
            const typed = args as { where?: Record<string, unknown> };
            typed.where = { ...typed.where, orgId };
            return query(typed);
          }

          // Creates get the orgId stamped on. Any orgId the caller sent is overwritten, never merged.
          if (operation === 'create') {
            const typed = args as { data?: Record<string, unknown> };
            typed.data = { ...typed.data, orgId };
            return query(typed as typeof args);
          }

          // findUnique / update / delete find a row by primary key, so row-level security guards those.
          return query(args);
        },
      },
    },
  });
}

export { Prisma };
