// The organisation's own plan. 13 § Billing, 49.
//
// Two operations and one rule between them: the tier the customer reads and the tier the
// entitlement gate decides with are THE SAME ROW. There is no cache, no `pending`, no
// `effectiveFrom` in the future — a join is written and the next request is answered
// differently (49 § Interactions).
//
// THE PAYMENT IS A CONSEQUENCE OF THE JOIN, NEVER A CONDITION OF IT — DEC-080. The dialog
// the customer clicked through lives entirely in the client; this route does what it always
// did, and additionally writes the ledger row that `/ops/earnings` reads. Refusing a join
// because no `paymentRef` arrived would put an authorisation decision behind a
// client-generated string, which is INV-003's exact failure mode.
import { PLAN_OPTIONS, type BillingStatus, type BillingSummary, type Tier } from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { recordPayment } from '../../billing/payments.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Seats, COMPUTED from `16` §5 rather than read from `subscriptions.seats`.
 *
 *   billable_seats = active users + non-person subjects that are not archived
 *
 * The cached column is `T-057`'s and nothing has ever written it, so reading it would show
 * 0 for every organisation — the same argument `features/platform/service.ts` makes for the
 * estate list, and the same two counts. Respondents are never counted: they are not `users`
 * in the schema, which is the seat model and the privacy model pointing the same way.
 */
async function seatsFor(orgId: string): Promise<BillingSummary['seatBreakdown']> {
  const [activeUsers, nonPersonSubjects] = await Promise.all([
    prisma.user.count({ where: { orgId, status: 'active' } }),
    // `linkedUserId: null` — a person-subject is already counted as a user above, and
    // counting it twice would overstate the organisation's size.
    prisma.subject.count({ where: { orgId, linkedUserId: null, archivedAt: null } }),
  ]);
  return { activeUsers, nonPersonSubjects };
}

const view = (
  row: { tier: string; status: string; periodStart: Date; periodEnd: Date },
  seatBreakdown: BillingSummary['seatBreakdown'],
): BillingSummary => ({
  tier: row.tier as Tier,
  status: row.status as BillingStatus,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  seats: seatBreakdown.activeUsers + seatBreakdown.nonPersonSubjects,
  seatBreakdown,
});

/**
 * The current plan, REPAIRED ON READ when the row is missing.
 *
 * `D-012` left every organisation registered before `T-088` with no `subscriptions` row at
 * all, and `49` § States is explicit that a customer must never open this page and read
 * "unknown". The repair is Bronze — never zero access (`16` §7) — and it is a write, so the
 * entitlement gate and this page agree from the next request onward instead of the page
 * inventing a default the gate has never heard of.
 */
export async function readBilling(orgId: string): Promise<BillingSummary> {
  const [existing, seatBreakdown] = await Promise.all([
    prisma.subscription.findUnique({ where: { orgId } }),
    seatsFor(orgId),
  ]);
  if (existing) return view(existing, seatBreakdown);

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundError('That organisation does not exist.');

  const today = new Date();
  const repaired = await prisma.subscription.create({
    data: {
      orgId,
      tier: 'bronze',
      status: 'active',
      seats: 0,
      periodStart: today,
      periodEnd: new Date(today.getTime() + 365 * DAY),
    },
  });
  return view(repaired, seatBreakdown);
}

/**
 * Join a tier. One click, effective immediately — DEC-035.
 *
 * ENTERPRISE IS REFUSED HERE rather than in the DTO. `16` §4 prices it individually, so it
 * is a sales conversation and stays operator-assigned through `platform.plan.override`
 * (`19` §4). A schema rejection would have said "not a valid tier" about a tier the page is
 * showing the reader; this says the true thing.
 *
 * The write and its audit row are ONE transaction (INV-007). With no invoice and no
 * receipt, `audit_log` is the only record that the change happened at all, which makes it
 * more load-bearing here than on a route that also produces a document (49 § Interactions).
 */
export async function joinTier(
  req: Request,
  orgId: string,
  tier: Tier,
  paymentRef?: string,
): Promise<BillingSummary> {
  const plan = PLAN_OPTIONS.find((option) => option.tier === tier);
  if (!plan?.selectable) {
    throw new ConflictError('Enterprise is arranged with us — talk to sales.');
  }

  // Read first, so a missing row is repaired before the update rather than throwing
  // `P2025` at an organisation that predates `T-088` (`D-012`). It also gives us the
  // FROM-TIER, which the ledger row below records and the audit row still cannot.
  const before = await readBilling(orgId);

  // WHO PAID, resolved from the session rather than the body. `payerName` is captured onto
  // the ledger row and never joined back, so it has to be right at write time.
  const payer =
    req.ctx.principal?.kind === 'user'
      ? await prisma.user.findUnique({
          where: { id: req.ctx.principal.id },
          select: { name: true, email: true },
        })
      : null;

  await runInTransaction(req, async (tx) => {
    await tx.subscription.update({
      where: { orgId },
      // `status` moves with the tier: joining is how a `trialing` or `cancelled`
      // organisation becomes active again, and `49` § State says the server decides the
      // resulting state rather than the client patching the tier locally.
      data: { tier, status: 'active' },
    });

    // THE CAPTURE — DEC-080 — in the same transaction as the tier it pays for, for the
    // reason INV-007 gives about audit rows: a ledger that disagrees with the subscription
    // table is worse than no ledger.
    //
    // THIS ROW RECORDS THE FROM-TIER, and the audit row still does not. The gap noted below
    // is unchanged and is still `AuditIntent`'s to close; what has changed is that a plan
    // MOVE is now legible somewhere — `/ops/earnings` reads `from_tier` and `kind` to show
    // the owner who is upgrading. That is a second record of the same event, deliberately:
    // one for money, one for authority.
    await recordPayment(tx, {
      orgId,
      tier,
      fromTier: before.tier,
      kind: 'change',
      payerName: payer?.name ?? 'Unknown',
      payerEmail: payer?.email ?? '',
      reference: paymentRef ?? null,
    });
    // THE FROM-TIER IS NOT ON THE ROW, and that is a known gap rather than an oversight.
    // `49` § Interactions asks the audit row to name from-tier and to-tier; `AuditIntent`
    // (middleware/context.ts) carries `action`, `targetType` and `targetId` and nothing
    // else, and `audit_log` has no metadata column for an org-side write — the operator's
    // side uses `writeAudit`'s own path (`platform/service.ts`). Widening the intent shape
    // is a change to the one table every feature writes to and belongs in `T-058` with the
    // rest of the billing work, not smuggled in beside a nav item.
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  // Refetched, never patched (49 § State). A stale tier is a wrong tier.
  return readBilling(orgId);
}
