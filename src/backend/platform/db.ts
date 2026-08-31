// The platform database client: an operator can read COUNTS, never CONTENT.
// Three rules - the answer table is unreachable, responses can only be counted, and only a few models are writable.
// Breaking one throws, instead of quietly returning nothing, so a forbidden question can never look answered.
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

// A programming error, not a request error: it means a handler asked this seam for content.
export class PlatformSeamViolation extends Error {
  constructor(message: string) {
    super(`INV-011: ${message}`);
    this.name = 'PlatformSeamViolation';
  }
}

// Never reachable, in any operation, nested or not.
const FORBIDDEN_MODELS = new Set(['Answer']);

// Countable only: COUNT(*) and MAX(created_at) are the entire read surface over feedback.
const AGGREGATE_ONLY_MODELS = new Set(['Response']);
const AGGREGATE_OPERATIONS = new Set(['count', 'aggregate', 'groupBy']);

// The models an operator may write: plan and suspension, our own tables, plus notifications,
// enterprise requests and payments. None of them widens what can be READ.
const WRITABLE_MODELS = new Set([
  'Organization',
  'Subscription',
  'PlatformAuditLog',
  'PlatformUser',
  'Notification',
  'EnterpriseRequest',
  'Payment',
]);
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

// Relation names that would pull content in through a select or include on an allowed model.
const CONTENT_RELATIONS = new Set(['answers', 'answer', 'responses', 'response', 'comment', 'comments']);

// Walks the query arguments and refuses any nested select that would reach feedback content.
function assertNoContentRelations(args: unknown, path = ''): void {
  if (typeof args !== 'object' || args === null) return;
  if (Array.isArray(args)) {
    for (const entry of args) assertNoContentRelations(entry, path);
    return;
  }
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    // A _count select is a count, not content, so it is allowed.
    if (path.includes('_count')) continue;
    if (CONTENT_RELATIONS.has(key) && (path.endsWith('select') || path.endsWith('include'))) {
      throw new PlatformSeamViolation(
        `the platform client cannot select \`${key}\` — an operator reads counts, never content`,
      );
    }
    assertNoContentRelations(value, `${path}.${key}`);
  }
}

export type PlatformClient = ReturnType<typeof platformClient>;

// Not tenant-bound, because looking across every organisation is the job here. In exchange it can only count.
export function platformClient() {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (model && FORBIDDEN_MODELS.has(model)) {
            throw new PlatformSeamViolation(
              `\`${model}\` is unreachable from the platform client, in any operation`,
            );
          }
          if (model && AGGREGATE_ONLY_MODELS.has(model) && !AGGREGATE_OPERATIONS.has(operation)) {
            throw new PlatformSeamViolation(
              `\`${model}.${operation}\` returns rows — the platform client may only count them`,
            );
          }
          if (model && WRITES.has(operation) && !WRITABLE_MODELS.has(model)) {
            throw new PlatformSeamViolation(
              `\`${model}.${operation}\` writes inside a customer's organisation, which no platform capability means`,
            );
          }
          assertNoContentRelations(args);
          return query(args);
        },
      },
    },
  });
}

export { Prisma };
