// The organisation's own plan.
// One rule runs through it: the tier the customer READS and the tier the entitlement gate DECIDES with
// are the same answer. Both sides ask effectiveTier(); the gate only reads, this file also writes the
// result back, so the row catches up while the decision never lags.
// A payment is a consequence of a join, never a condition of it: refusing a join because no payment
// reference arrived would put an authorisation decision behind a string the client made up.
import {
  PLAN_OPTIONS,
  joinPricedFrom,
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
// `lapsedFromTrial` is a fact about the PAYMENT EVENT that set `lapsedFrom`, not about the
// subscription itself - DEC-116 - so it is passed in rather than read off `row`, which carries
// no such column.
const view = (
  row: Row,
  seatBreakdown: BillingSummary['seatBreakdown'],
  lapsedFromTrial: boolean | null,
): BillingSummary => ({
  tier: row.tier as Tier,
  status: row.status as BillingStatus,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  pendingTier: (row.pendingTier as Tier | null) ?? null,
  lapsedFrom: (row.lapsedFrom as Tier | null) ?? null,
  lapsedFromTrial,
  seats: seatBreakdown.activeUsers + seatBreakdown.nonPersonSubjects,
  seatBreakdown,
});

// Was the lapse behind `lapsedFrom` a trial running out, or a paid plan nobody renewed?
// DEC-116. Not stored on the subscription - it is a fact about the ledger row written at the
// moment the lapse happened, so it is derived from there, and only ever looked up when
// `lapsedFrom` is non-null (the common case - nothing lapsed - never pays for this query).
async function lapsedFromTrialFor(orgId: string, lapsedFrom: string | null): Promise<boolean | null> {
  if (lapsedFrom === null) return null;
  const last = await prisma.payment.findFirst({
    where: { orgId, kind: { in: ['lapse', 'trial_expired'] } },
    orderBy: { createdAt: 'desc' },
    select: { kind: true },
  });
  return last?.kind === 'trial_expired';
}

// Applies a period that has ended, and returns the row as it now stands.
// Four outcomes, and which one applies is effectiveTier()'s answer plus `status`, not this function's:
//   1. a scheduled move down applies - the customer asked for it;
//   2. nobody renewed a paid plan, so the org drops to bronze and the page can say what it came down from;
//   3. a trial ran out unconverted, so the org drops to bronze the same way, but it is not a lapse -
//      DEC-116 - nothing was ever being paid for, so there is nothing that "stopped";
//   4. already on bronze - the period simply rolls forward, free, and nothing else is written.
// The audit row is written here rather than queued, because this is a date passing rather than an action
// anybody took, and the queue would stamp it with whoever happened to open the page.
async function applyExpiredPeriod(row: Row & { orgId: string }, requestId?: string) {
  if (!periodHasEnded(row.periodEnd)) return row;

  const from = row.tier as Tier;
  const next = effectiveTier(row);
  // Read BEFORE anything is written, from the one field the entitlement gate never reads -
  // this function is the one place `status` is allowed to change WHAT HAPPENS, as opposed to
  // what the gate decides with. DEC-116.
  const wasTrialing = row.status === 'trialing';

  // Outcome 4, and the only path that clears the lapse notice, so it survives exactly the one period it is news for.
  // A trial can land here too - only when `tier` was already bronze, the lowest SIGNUP_TIER, in which case a
  // bronze trial running out and bronze still being deserved is not news either.
  if (next === from) {
    return prisma.subscription.update({
      where: { orgId: row.orgId },
      data: { pendingTier: null, lapsedFrom: null, status: 'active', ...newPeriod() },
    });
  }

  // Outcomes 1, 2 and 3 differ in a few fields. 'scheduled' asks whether this is the tier the customer
  // NAMED, because a stale pending value that was not honoured is a lapse, not a downgrade anybody asked
  // for - and a trial's `pendingTier` is always null anyway (scheduleDowngrade refuses it, below), so
  // `!wasTrialing` here is defence in depth rather than the only thing preventing confusion.
  const scheduled = !wasTrialing && row.pendingTier !== null && next === row.pendingTier;

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

    // Zero rupees. For outcome 1 the pricing function arrives at that itself (same tier in and out
    // further up the ladder is never the case here, but 0 is still correct by construction for a
    // scheduled move - no money ever changes hands on a downgrade). For outcomes 2 and 3 it is NOT
    // free by construction - `changeCostMinor(from, bronze)` would return a real nonzero amount for a
    // real priced tier - so the capture is explicitly zeroed instead: a negative row in an append-only
    // ledger would be a refund, and this product has never had one, but a silently-priced one would be
    // a phantom charge nobody sees.
    await recordPayment(tx, {
      orgId: row.orgId,
      tier: next,
      fromTier: from,
      // Three kinds for one shape: "asked to spend less", "stopped paying" and "never started
      // paying" are three different facts about the business.
      kind: scheduled ? 'expiry' : wasTrialing ? 'trial_expired' : 'lapse',
      amountMinor: 0,
      // Nobody paid, and nobody is named.
      payerName: 'Endur',
      payerEmail: '',
    });

    await tx.auditLog.create({
      data: {
        orgId: row.orgId,
        actorUserId: null,
        action: scheduled ? 'billing.expire' : wasTrialing ? 'billing.trial_expire' : 'billing.lapse',
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
    const applied = await applyExpiredPeriod({ ...existing, orgId }, requestId);
    const lapsedFromTrial = await lapsedFromTrialFor(orgId, applied.lapsedFrom);
    return view(applied, seatBreakdown, lapsedFromTrial);
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
  // A freshly-repaired row has never lapsed from anything, trial or otherwise.
  return view(repaired, seatBreakdown, null);
}

// Joins a HIGHER tier, effective immediately.
// The ladder is one-way while a period is running, and that is decided HERE rather than by hiding a button:
// money is captured at the join and there are no refunds, so a mid-period downgrade would charge a customer
// again for less than they already hold. A downgrade is scheduled for the end of the period instead.
// Enterprise is refused here, because it is priced individually and stays operator-assigned.
//
// EXCEPT MID-TRIAL — DEC-116. A trial captures nothing, so the rule that protects a payment
// already made has nothing to protect: a trialing-Gold org converting to paid Bronze is making
// its FIRST purchase, not asking for a refund. `wasTrialing` is read once, before either check,
// and both checks are skipped for it.
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
  const wasTrialing = before.status === 'trialing';

  // The one-way check, before anything is written. Two messages, because "already on this" and "cannot come
  // down mid-period" are different situations with different remedies. 409, since the request itself is fine.
  // Skipped entirely mid-trial - see the DEC-116 comment above.
  if (!wasTrialing) {
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
  }

  // Who paid, taken from the session rather than the body, because the name is copied onto the ledger row.
  const payer =
    req.ctx.principal?.kind === 'user'
      ? await prisma.user.findUnique({
          where: { id: req.ctx.principal.id },
          select: { name: true, email: true },
        })
      : null;

  // It charges the DIFFERENCE between the old tier and the new one - except after a lapse, or mid-trial
  // (DEC-116), where the customer never paid for the tier they are on, so the join is priced at the
  // full amount instead of a diff from a tier nothing was ever captured for. The checkout prints its
  // amount from the same function.
  const pricedFrom = joinPricedFrom(before);

  await runInTransaction(req, async (tx) => {
    // ONLY IF THE PLAN IS STILL WHAT WAS CHECKED ABOVE. Two tabs pressing Pay together both read
    // Bronze before either writes, and a plain update let both through - five at once wrote up to
    // five captures for one Gold plan. Postgres makes the second UPDATE wait for the first to commit
    // and then re-checks this WHERE against the row as it now stands, so the loser matches nothing
    // and its transaction rolls back before any payment row is written.
    const moved = await tx.subscription.updateMany({
      where: { orgId, tier: before.tier, status: before.status },
      // The status moves with the tier, and joining also cancels any scheduled move down and clears the
      // lapse notice: somebody who has just paid for Gold should not still be told their Gold ran out.
      // A full-price join buys a full month from today. A difference only pays for the rest of the
      // period already running, so that period stays.
      data: {
        tier,
        status: 'active',
        pendingTier: null,
        lapsedFrom: null,
        ...(pricedFrom === null ? newPeriod() : {}),
      },
    });
    if (moved.count !== 1) {
      throw new ConflictError('The plan changed while this was being paid for. Reload to see where it stands.');
    }

    // The capture, in the same transaction as the tier it pays for.
    await recordPayment(tx, {
      orgId,
      tier,
      fromTier: before.tier,
      pricedFrom,
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

  // DEC-116. Nothing has been paid for during a trial, so there is nothing to schedule a move
  // down FROM. Refused outright rather than left harmless: applyExpiredPeriod's `scheduled`
  // check is hard-coded to ignore `pendingTier` while trialing (above), so a silently-accepted
  // write here would let the plan page promise a scheduled downgrade the server would never
  // honour - worse than refusing the click.
  if (before.status === 'trialing') {
    throw new ConflictError(
      'Nothing has been paid for yet, so there is nothing to schedule a move down from — ' +
        'convert to a paid plan first, or just let the trial run out.',
    );
  }

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

