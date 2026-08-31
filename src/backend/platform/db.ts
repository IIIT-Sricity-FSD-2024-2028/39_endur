// THE AGGREGATE-ONLY SEAM. INV-011, 19 §5 — the load-bearing constraint of the whole
// platform surface, and the thing we actually sell.
//
//   "A platform operator can read counts, never content. No operator capability, in any
//    role, resolves to a response body, an answer, a free-text comment, or a respondent
//    identity — and this is enforced by the platform client returning aggregates only, not
//    by a UI that declines to render them."
//
// The emphasis in that sentence is on the LAST clause, and it is why this file exists at
// all. A handler that carefully selects only counts is a handler somebody can carelessly
// edit; `db/tenant.ts` earned its keep by making the org-scoping mistake IMPOSSIBLE rather
// than merely discouraged, and this is the same move for a different guarantee.
//
// Three rules, in order of how much they matter:
//
//   1 · `answer` is unreachable. Not filtered, not aggregated — the model cannot be
//       addressed through this client in any operation, including a nested one.
//   2 · `response` answers COUNT(*) and MAX(created_at) and nothing else. Those two are
//       what "is this customer collecting?" needs, and neither can carry a sentence.
//   3 · Any other model is readable, and NOT writable except the two rows an operator is
//       supposed to change: `subscriptions.tier` and `organizations.suspended_at`.
//
// The failure mode is a thrown Error, not an empty result. An operator surface that
// silently returns nothing when it asks a forbidden question is a surface where the
// forbidden question looks answered.
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

/**
 * A programming error, never a request error. If this throws, a handler asked the platform
 * seam for content — which is a line of code to delete, not a 4xx to render. It is
 * deliberately NOT an AppError: an INV-011 breach must not be reachable as a tidy 403 that
 * somebody then adds to an allowlist.
 */
export class PlatformSeamViolation extends Error {
  constructor(message: string) {
    super(`INV-011: ${message}`);
    this.name = 'PlatformSeamViolation';
  }
}

/** Never, in any operation, nested or not. */
const FORBIDDEN_MODELS = new Set(['Answer']);

/** COUNT(*) and MAX(created_at). That is the entire read surface over feedback. */
const AGGREGATE_ONLY_MODELS = new Set(['Response']);
const AGGREGATE_OPERATIONS = new Set(['count', 'aggregate', 'groupBy']);

/**
 * Writes an operator is allowed to make, by model. Everything else is read-only through
 * this client — an operator who could edit a customer's units or people would be an
 * operator who can act inside a tenant, which no capability in `19` §4 means.
 *
 * TWO ADDITIONS AT `T-100`/`T-101`, AND BOTH ARE WRITES INTO A TENANT ON PURPOSE — which is
 * why they are named here rather than worked around at the call site.
 *
 * `Notification` — `DEC-101`. `platform.message.send` has always meant "contact this
 * organisation's administrators"; what it lacked was anywhere to put the message that the
 * recipient could reach, so it wrote to `platform_audit_log` and reported success. Adding the
 * model is what makes the capability mean what its name says. THE ROW CARRIES NO CUSTOMER
 * CONTENT — a subject and a body the OPERATOR typed — so nothing here is a path INTO a
 * tenant's data; it is a path out of ours into their inbox.
 *
 * `EnterpriseRequest` — `DEC-100`. The operator only ever moves `status`, `handled_by` and
 * `handled_at` on a row the CUSTOMER created. The queue would be unworkable otherwise, and
 * the alternative — a second table on our side mirroring theirs — is two records of one fact.
 *
 * `Payment` — `DEC-111`, and this is the one that deserves suspicion, so read the guard rather
 * than the allowlist. Approving an Enterprise request is a SALE and has to reach the ledger, or
 * the one tier the product charges ₹4,999 for earns nothing (which is exactly what was
 * happening). What makes it safe is not this line: it is that `billing/payments.ts` takes a
 * TIER and has no parameter for an amount, so the only number an operator can put in this table
 * is the one `PLAN_OPTIONS` says. That is the same protection the customer's own join has, and
 * it is why `OverridePlan`'s DTO still refuses an amount field — an operator who could name one
 * could invent revenue, and none of them can.
 *
 * NONE OF THE THREE WIDENS THE READ SURFACE. `Answer` is still unreachable, `Response` is still
 * count-only, and no new model has a relation that could reach either.
 */
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

/**
 * Relation keys that would pull content in through a `select` or `include` on a permitted
 * model — `campaign.findMany({ include: { responses: { include: { answers: true } } } })`
 * addresses `Answer` without ever naming the model.
 *
 * Checked by walking the args rather than by trusting the operation name, because the
 * nested case is the one a careful-looking handler actually reaches for.
 */
const CONTENT_RELATIONS = new Set(['answers', 'answer', 'responses', 'response', 'comment', 'comments']);

function assertNoContentRelations(args: unknown, path = ''): void {
  if (typeof args !== 'object' || args === null) return;
  if (Array.isArray(args)) {
    for (const entry of args) assertNoContentRelations(entry, path);
    return;
  }
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    // `_count: { select: { responses: true } }` is a COUNT and is allowed — it is the one
    // shape that names a content relation and cannot return one.
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

/**
 * NOT tenant-bound, and that is the one place this seam is deliberately WIDER than
 * `db/tenant.ts`. Cross-tenant is the entire job here (19 §1) — the estate list is a
 * question about every organisation at once, and there is no `orgId` to stamp because a
 * platform request resolves no tenant (INV-010 has nothing to say about a request with no
 * organisation in it).
 *
 * What it gives back in exchange is the aggregate rule above. Wider in tenancy, far
 * narrower in what it can read.
 */
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
