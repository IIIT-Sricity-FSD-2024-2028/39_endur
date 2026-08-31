// The organisation's own plan.
// One rule runs through it: the tier the customer READS and the tier the entitlement gate DECIDES with
// are the same answer. Both sides ask effectiveTier(); the gate only reads, this file also writes the
// result back, so the row catches up while the decision never lags.
// A payment is a consequence of a join, never a condition of it: refusing a join because no payment
// reference arrived would put an authorisation decision behind a string the client made up.
import {
  PLAN_OPTIONS,
  tierRank,
  type BillingStatus,
  type BillingSummary,
  type EnterpriseRequestState,
  type Tier,
} from '@endur/shared';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { recordPayment } from '../../billing/payments.js';
import { effectiveTier } from '../../billing/effective.js';
import { newPeriod, periodHasEnded } from '../../billing/period.js';
import { ConflictError, NotFoundError, UnauthenticatedError } from '../../lib/errors.js';

// Seats, COMPUTED rather than read from the stored column, which nothing has ever written:
//   billable seats = active users + non-person subjects that are not archived.
// Respondents are never counted, because they are not accounts at all.
async function seatsFor(orgId: string): Promise<BillingSummary['seatBreakdown']> {
  const [activeUsers, nonPersonSubjects] = await Promise.all([
    prisma.user.count({ where: { orgId, status: 'active' } }),
    // A subject linked to a person is already counted as a user above; counting it twice would overstate the org.
    prisma.subject.count({ where: { orgId, linkedUserId: null, archivedAt: null } }),
  ]);
  return { activeUsers, nonPersonSubjects };
}

// The subscription fields this file works with.
type Row = {
  tier: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  pendingTier: string | null;
  lapsedFrom: string | null;
};

// Turns a subscription row into the summary the plan page reads.
const view = (row: Row, seatBreakdown: BillingSummary['seatBreakdown']): BillingSummary => ({
  tier: row.tier as Tier,
  status: row.status as BillingStatus,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  pendingTier: (row.pendingTier as Tier | null) ?? null,
  lapsedFrom: (row.lapsedFrom as Tier | null) ?? null,
  seats: seatBreakdown.activeUsers + seatBreakdown.nonPersonSubjects,
  seatBreakdown,
});

// Applies a period that has ended, and returns the row as it now stands.
// Three outcomes, and which one applies is effectiveTier()'s answer, not this function's:
//   1. a scheduled move down applies - the customer asked for it;
//   2. nobody renewed, so the org drops to bronze and the page can say what it came down from;
//   3. already on bronze - the period simply rolls forward, free, and nothing else is written.
// The audit row is written here rather than queued, because this is a date passing rather than an action
// anybody took, and the queue would stamp it with whoever happened to open the page.
async function applyExpiredPeriod(row: Row & { orgId: string }, requestId?: string) {
  if (!periodHasEnded(row.periodEnd)) return row;

  const from = row.tier as Tier;
  const next = effectiveTier(row);

  // Outcome 3, and the only path that clears the lapse notice, so it survives exactly the one period it is news for.
  if (next === from) {
    return prisma.subscription.update({
      where: { orgId: row.orgId },
      data: { pendingTier: null, lapsedFrom: null, ...newPeriod() },
    });
  }

  // Outcomes 1 and 2 differ in three fields. 'scheduled' asks whether this is the tier the customer NAMED,
  // because a stale pending value that was not honoured is a lapse, not a downgrade anybody asked for.
  const scheduled = row.pendingTier !== null && next === row.pendingTier;

  return prisma.$transaction(async (tx) => {
    const moved = await tx.subscription.update({
      where: { orgId: row.orgId },
      data: {
        tier: next,
        pendingTier: null,
        lapsedFrom: scheduled ? null : from,
        status: 'active',
        ...newPeriod(),
      },
    });

    // Zero rupees, and the pricing function arrives at that itself. A negative row in an append-only ledger
    // would be a refund, and this product has never had one.
    await recordPayment(tx, {
      orgId: row.orgId,
      tier: next,
      fromTier: from,
      // Two kinds for one shape: "asked to spend less" and "stopped paying" are opposite facts about the business.
      kind: scheduled ? 'expiry' : 'lapse',
      // Nobody paid, and nobody is named.
      payerName: 'Endur',
      payerEmail: '',
    });

    await tx.auditLog.create({
      data: {
        orgId: row.orgId,
        actorUserId: null,
        action: scheduled ? 'billing.expire' : 'billing.lapse',
        targetType: 'subscription',
        targetId: row.orgId,
        ...(requestId ? { requestId } : {}),
      },
    });

    return moved;
  });
}

// The current plan, repaired on read when the row is missing, and advanced on read when its period has ended.
// There is no scheduler in this product, so both happen on the first read after the date passes - and the
// entitlement gate does not wait for it, because it derives the same answer without writing.
export async function readBilling(orgId: string, requestId?: string): Promise<BillingSummary> {
  const [existing, seatBreakdown] = await Promise.all([
    prisma.subscription.findUnique({ where: { orgId } }),
    seatsFor(orgId),
  ]);
  if (existing) {
    return view(await applyExpiredPeriod({ ...existing, orgId }, requestId), seatBreakdown);
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundError('That organisation does not exist.');

  const repaired = await prisma.subscription.create({
    data: {
      orgId,
      tier: 'bronze',
      status: 'active',
      seats: 0,
      // One month, from the one place that decides how long a period is.
      ...newPeriod(),
    },
  });
  return view(repaired, seatBreakdown);
}

// Joins a HIGHER tier, effective immediately.
// The ladder is one-way while a period is running, and that is decided HERE rather than by hiding a button:
// money is captured at the join and there are no refunds, so a mid-period downgrade would charge a customer
// again for less than they already hold. A downgrade is scheduled for the end of the period instead.
// Enterprise is refused here, because it is priced individually and stays operator-assigned.
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

  // Read first, so a missing row is repaired before the update - and it gives us the tier being left.
  const before = await readBilling(orgId);

  // The one-way check, before anything is written. Two messages, because "already on this" and "cannot come
  // down mid-period" are different situations with different remedies. 409, since the request itself is fine.
  if (tierRank(tier) === tierRank(before.tier)) {
    throw new ConflictError(`This organisation is already on ${plan.name}.`);
  }
  if (tierRank(tier) < tierRank(before.tier)) {
    throw new ConflictError(
      `A plan can only move up while a period is running. This organisation is on ` +
        `${PLAN_OPTIONS.find((option) => option.tier === before.tier)?.name ?? before.tier} ` +
        `until ${before.periodEnd.slice(0, 10)}, and there are no refunds — ` +
        `schedule the move down for the end of the period instead.`,
    );
  }

  // Who paid, taken from the session rather than the body, because the name is copied onto the ledger row.
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
      // The status moves with the tier, and joining also cancels any scheduled move down and clears the
      // lapse notice: somebody who has just paid for Gold should not still be told their Gold ran out.
      data: { tier, status: 'active', pendingTier: null, lapsedFrom: null },
    });

    // The capture, in the same transaction as the tier it pays for.
    // It charges the DIFFERENCE between the old tier and the new one - except after a lapse, where the
    // customer never paid for the tier they are on, so the rejoin is priced at the full amount.
    await recordPayment(tx, {
      orgId,
      tier,
      fromTier: before.tier,
      pricedFrom: before.lapsedFrom ? null : before.tier,
      kind: 'change',
      payerName: payer?.name ?? 'Unknown',
      payerEmail: payer?.email ?? '',
      reference: paymentRef ?? null,
    });
    // The audit row cannot carry the from-tier yet, because the shared intent shape has no field for it.
    // The payment row records the move instead, which is why both exist: one for money, one for authority.
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  // Refetched rather than patched: a stale tier is a wrong tier.
  return readBilling(orgId, req.ctx.requestId);
}

// Schedules a move down for the end of the period.
// Nothing is captured and the tier does not move: the whole operation is one nullable column.
// Only a LOWER tier can be scheduled, and re-scheduling simply overwrites, because nothing happened either time.
export async function scheduleDowngrade(
  req: Request,
  orgId: string,
  tier: Tier,
): Promise<BillingSummary> {
  const before = await readBilling(orgId, req.ctx.requestId);
  const plan = PLAN_OPTIONS.find((option) => option.tier === tier);

  if (tierRank(tier) === tierRank(before.tier)) {
    throw new ConflictError(
      `This organisation is already on ${plan?.name ?? tier}, so there is nothing to move down to.`,
    );
  }
  if (tierRank(tier) > tierRank(before.tier)) {
    throw new ConflictError(
      `${plan?.name ?? tier} is above the current plan. Moving up applies now and is paid for ` +
        `now — only a move down waits for the end of the period.`,
    );
  }

  await runInTransaction(req, async (tx) => {
    await tx.subscription.update({ where: { orgId }, data: { pendingTier: tier } });
    // Logged as billing.update, like a join: what tells the two apart in the log is that no payment row sits beside this one.
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  return readBilling(orgId, req.ctx.requestId);
}

// Cancels whatever is scheduled. No tier in the request, because there is only ever one pending value.
// Cancelling nothing is not an error, and it still writes: a mutating request that produces no audit row
// is exactly what the audit safety net exists to catch.
export async function cancelDowngrade(req: Request, orgId: string): Promise<BillingSummary> {
  // Repairs and advances the row first, so a cancel the morning after the period ended cannot un-apply what already fired.
  await readBilling(orgId, req.ctx.requestId);

  await runInTransaction(req, async (tx) => {
    await tx.subscription.update({ where: { orgId }, data: { pendingTier: null } });
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  return readBilling(orgId, req.ctx.requestId);
}

// Asks to be sold Enterprise. Nothing about the subscription moves: this writes a work item for Endur,
// and the tier stays operator-assigned.
// A second request while one is open is a 409, decided by a unique index rather than by a read-then-write
// check, which two simultaneous clicks would beat.
export async function requestEnterprise(
  req: Request,
  orgId: string,
  note?: string,
): Promise<EnterpriseRequestState> {
  const asker =
    req.ctx.principal?.kind === 'user'
      ? await prisma.user.findUnique({
          where: { id: req.ctx.principal.id },
          select: { id: true, name: true, email: true },
        })
      : null;
  if (!asker) throw new UnauthenticatedError();

  try {
    const row = await runInTransaction(req, async (tx) => {
      const created = await tx.enterpriseRequest.create({
        data: {
          orgId,
          askedBy: asker.id,
          // The asker's name is captured beside the id, because they may have left before anybody rings back.
          askedName: asker.name,
          askedEmail: asker.email,
          ...(note?.trim() ? { note: note.trim() } : {}),
        },
      });
      req.ctx.audit.push({
        action: 'billing.update',
        targetType: 'enterprise_request',
        targetId: orgId,
      });
      return created;
    });
    return { requestedAt: row.createdAt.toISOString() };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        'We already have your request for Enterprise and will be in touch. ' +
          'There is nothing else to do.',
      );
    }
    throw error;
  }
}

// Is there an open request? One field, because that is all the page renders: Request, or Requested.
// The rest of the lifecycle belongs to Endur's own console.
export async function readEnterpriseRequest(orgId: string): Promise<EnterpriseRequestState> {
  const open = await prisma.enterpriseRequest.findFirst({
    where: { orgId, status: 'open' },
    select: { createdAt: true },
  });
  return { requestedAt: open?.createdAt.toISOString() ?? null };
}

