// The tenant-bound Prisma client. Layer 1 of the two defences in 10 §8.
//
// Services call `ctx.db.subject.findMany()` and get org-scoped results without asking.
// A service CANNOT construct a cross-tenant query without importing the raw client, and
// lint forbids that outside this seam — which is what turns INV-010 from a rule people
// remember into something the type system and the linter enforce together.
//
// Layer 2 is Postgres row-level security, deliberately redundant with this. If the
// application ever forgets, the database still refuses. That is debt D-001.
import { Prisma } from '@prisma/client';
import { prisma } from './client.js';

/**
 * Models carrying `org_id` directly. Everything else — questions, responses, answers,
 * invitations, campaign_subjects — is reached only through one of these, so scoping the
 * parent scopes the child. Adding a model with `org_id` and forgetting to list it here is
 * the one way to get a tenant leak past this layer, so the list is asserted in a test.
 */
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
]);

/** Reads that take a `where`. Writes are handled separately — see below. */
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

          // Creates get the tenant stamped on rather than filtered. A caller-supplied
          // orgId is overwritten, not merged: there is no legitimate reason for one to
          // differ from the request's tenant, and honouring it would be the exact hole
          // this wrapper exists to close.
          if (operation === 'create') {
            const typed = args as { data?: Record<string, unknown> };
            typed.data = { ...typed.data, orgId };
            return query(typed as typeof args);
          }

          // findUnique / update / delete address a row by primary key, and Prisma will
          // not accept a non-unique field in that `where`. They are left alone HERE and
          // guarded by row-level security instead (D-001) — a by-id read of another
          // tenant's row is the case layer 2 exists for.
          return query(args);
        },
      },
    },
  });
}

export { Prisma };
