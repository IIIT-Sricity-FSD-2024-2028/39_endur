// The organisation's own plan. 13 § Billing, 49.
//
// Two operations and one rule between them: the tier the customer reads and the tier the
// entitlement gate decides with are THE SAME ROW. There is no cache, no `pending`, no
// `effectiveFrom` in the future — a join is written and the next request is answered
// differently (49 § Interactions).
//
// `pending_tier` DOES NOT BREAK THAT RULE, AND THE CARE IS IN WHERE IT IS READ — DEC-098.
// It is written by `scheduleDowngrade`, cleared by `cancelDowngrade` and by `joinTier`, and
// read by exactly ONE thing: `applyExpiredDowngrade` below, the write that retires it.
// `requireEntitlement` never sees it, `view()` passes it to the page as a sentence and
// nothing branches on it. A future-dated tier that anything else consulted would be the
// second answer this file's opening rule exists to forbid.
//
// THE PAYMENT IS A CONSEQUENCE OF THE JOIN, NEVER A CONDITION OF IT — DEC-080. The dialog
// the customer clicked through lives entirely in the client; this route does what it always
// did, and additionally writes the ledger row that `/ops/earnings` reads. Refusing a join
// because no `paymentRef` arrived would put an authorisation decision behind a
// client-generated string, which is INV-003's exact failure mode.
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
import { newPeriod, periodHasEnded } from '../../billing/period.js';
import { ConflictError, NotFoundError, UnauthenticatedError } from '../../lib/errors.js';

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

type Row = {
  tier: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  pendingTier: string | null;
};

const view = (row: Row, seatBreakdown: BillingSummary['seatBreakdown']): BillingSummary => ({
  tier: row.tier as Tier,
  status: row.status as BillingStatus,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  pendingTier: (row.pendingTier as Tier | null) ?? null,
  seats: seatBreakdown.activeUsers + seatBreakdown.nonPersonSubjects,
  seatBreakdown,
});

/**
 * THE SCHEDULED DOWNGRADE FIRING — DEC-098, 16 §7b. Returns the row as it now stands, which
 * is the unchanged row on every ordinary call.
 *
 * THIS IS THE ONLY READER OF `pending_tier` THAT ACTS ON IT, and it is deliberately the write
 * that retires it rather than a check anybody else makes. `requireEntitlement` reads `tier`
 * and only `tier`; if a second place learned to interpret a pending value, the product would
 * have two answers to what plan an organisation is on and they would disagree for exactly as
 * long as nobody opened this page (49 § Interactions).
 *
 * THREE WRITES, ONE TRANSACTION, and each is a different kind of record:
 *
 *   1 · the SUBSCRIPTION moves and the column is cleared — the state.
 *   2 · a `payments` row of `kind: 'expiry'`, Rs 0 — the MOVE. `payments` is the one table that
 *       records plan changes with a from and a to, and `/ops/analytics` counts downgrades out
 *       of it (DEC-102). A tier that changed with no row anywhere is a hole in an append-only
 *       ledger, which is worse than a zero somebody asks about.
 *   3 · an AUDIT row with NO ACTOR — the authority, which in this case is nobody's.
 *
 * WHY THE AUDIT ROW IS WRITTEN HERE AND NOT PUSHED TO `req.ctx.audit`. The intent queue is
 * flushed by `db/tx.ts`, which attributes the row to the CURRENT PRINCIPAL. This transition is
 * not an action anybody took — it is a date passing, noticed by whoever happened to open the
 * page next — and stamping their name on it would put a person's id against a change they did
 * not make, in the one table the product offers as evidence (`56`).
 *
 * THE PERIOD ROLLS FORWARD. Leaving `period_end` in the past would leave the row permanently
 * expired, so the next scheduled downgrade would fire the instant it was asked for. Nothing is
 * billed for the new period and nothing ever has been — `16` §8 has always said `period_end`
 * bills nothing when it passes, and this change does not make it start.
 */
async function applyExpiredDowngrade(row: Row & { orgId: string }, requestId?: string) {
  const pending = row.pendingTier as Tier | null;
  if (!pending || !periodHasEnded(row.periodEnd)) return row;

  // A pending tier that is no longer BELOW the current one is stale intent, not a downgrade:
  // `joinTier` clears the column on the way up, so this only fires if something wrote the row
  // another way. It is retired silently rather than applied — moving an organisation UP for
  // free because of a months-old request is the one outcome nobody asked for.
  if (tierRank(pending) >= tierRank(row.tier as Tier)) {
    return prisma.subscription.update({
      where: { orgId: row.orgId },
      data: { pendingTier: null },
    });
  }

  return prisma.$transaction(async (tx) => {
    const moved = await tx.subscription.update({
      where: { orgId: row.orgId },
      data: { tier: pending, pendingTier: null, status: 'active', ...newPeriod() },
    });

    // Rs 0, and `changeCostMinor` arrives at that on its own — the clamp DEC-097 called
    // unreachable from `joinTier` is exactly reachable from here, which is why it clamps
    // rather than recording a negative row. A negative row in an append-only ledger is a
    // refund, and this product has never had one.
    await recordPayment(tx, {
      orgId: row.orgId,
      tier: pending,
      fromTier: row.tier as Tier,
      kind: 'expiry',
      // Nobody paid, and nobody is named. The columns are captured strings rather than joins
      // (`10` §), so there is no user row this could quietly point at instead.
      payerName: 'Endur',
      payerEmail: '',
    });

    await tx.auditLog.create({
      data: {
        orgId: row.orgId,
        actorUserId: null,
        action: 'billing.expire',
        targetType: 'subscription',
        targetId: row.orgId,
        ...(requestId ? { requestId } : {}),
      },
    });

    return moved;
  });
}

/**
 * The current plan, REPAIRED ON READ when the row is missing and ADVANCED ON READ when the
 * period it names has ended.
 *
 * `D-012` left every organisation registered before `T-088` with no `subscriptions` row at
 * all, and `49` § States is explicit that a customer must never open this page and read
 * "unknown". The repair is Bronze — never zero access (`16` §7) — and it is a write, so the
 * entitlement gate and this page agree from the next request onward instead of the page
 * inventing a default the gate has never heard of.
 *
 * A SCHEDULED DOWNGRADE FIRES BY THE SAME TRICK — DEC-098. There is no scheduler in this
 * product (`OPEN-005`, and `17` is unwritten), so the transition happens on the first read
 * after the date passes, for the reason the repair above gives: the write happens on the read
 * so that the gate and the page agree from the next request onward.
 *
 * THE COST IS STATED RATHER THAN DISCOVERED. An organisation nobody opens never transitions,
 * and it keeps the higher tier until somebody does. That is harmless because a tier is only
 * ever consulted when somebody asks, and it fails in the customer's favour — the alternative
 * failure, taking a plan away from an organisation nobody was using, is the one that produces
 * a support call.
 */
export async function readBilling(orgId: string, requestId?: string): Promise<BillingSummary> {
  const [existing, seatBreakdown] = await Promise.all([
    prisma.subscription.findUnique({ where: { orgId } }),
    seatsFor(orgId),
  ]);
  if (existing) {
    return view(await applyExpiredDowngrade({ ...existing, orgId }, requestId), seatBreakdown);
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundError('That organisation does not exist.');

  const repaired = await prisma.subscription.create({
    data: {
      orgId,
      tier: 'bronze',
      status: 'active',
      seats: 0,
      // ONE MONTH, from `billing/period.ts` — DEC-096. This used to be `+ 365 * DAY` and was
      // one of four expressions that each decided the period length for themselves.
      ...newPeriod(),
    },
  });
  return view(repaired, seatBreakdown);
}

/**
 * Join a HIGHER tier. One click, effective immediately — DEC-035, narrowed by DEC-096.
 *
 * THE LADDER IS ONE-WAY WHILE A PERIOD IS RUNNING, AND THIS IS WHERE THAT IS DECIDED. The
 * button is gone from `/app/plan` and from the operator's picker, and NEITHER IS THE RULE:
 * this is a documented route (`13` § Billing) that anything can call, and INV-003 says the
 * client never decides. A UI that stops offering a downgrade while the service still performs
 * one has moved a policy into React.
 *
 * WHY A DOWNGRADE IS REFUSED RATHER THAN CONFIRMED. The product captures at the moment of the
 * join, `payments` is append-only, and there are no refunds and no invoices (`16` §8). So a
 * customer moving Gold -> Silver mid-period PAYS A SECOND TIME FOR LESS THAN THEY ALREADY
 * HOLD, and the product keeps both captures. That is not a consequence to warn about in a
 * dialog; it is a transaction that should not exist. A downgrade is SCHEDULED for the end of
 * the period instead — `scheduleDowngrade` below, `DEC-098`.
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
  // FROM-TIER, which the ledger row below records and the audit row still cannot — and,
  // since DEC-096, the rank this move is measured against.
  const before = await readBilling(orgId);

  // THE ONE-WAY CHECK, before anything is written. Two messages rather than one: "you are
  // already on this" and "you cannot come down mid-period" are different situations and a
  // reader who is told the wrong one will try the wrong remedy.
  //
  // 409 rather than 400 — the request is well formed and the tier is real; what refuses it is
  // the state the organisation is in, which is what a conflict means (`13` §5).
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
      //
      // AND IT CANCELS ANY SCHEDULED MOVE DOWN — DEC-098. A customer who scheduled Silver ->
      // Bronze and then paid to go to Gold has replaced the intention, not added to it;
      // leaving the column set would drop them to the tier they abandoned at the end of the
      // period they just bought, silently, weeks later. `pending_tier` carries no history and
      // is not meant to: it is one fact about the future, and this is a new one.
      data: { tier, status: 'active', pendingTier: null },
    });

    // THE CAPTURE — DEC-080 — in the same transaction as the tier it pays for, for the
    // reason INV-007 gives about audit rows: a ledger that disagrees with the subscription
    // table is worse than no ledger.
    //
    // IT IS THE DIFFERENCE, NOT THE NEW PRICE — DEC-097. `recordPayment` reads `fromTier`
    // and does the subtraction itself; there is still no amount on any request, and this
    // call passes one no more than it did before.
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
  return readBilling(orgId, req.ctx.requestId);
}

/**
 * SCHEDULE A MOVE DOWN, for the end of the period — DEC-098, 16 §7b, 13 § Billing.
 *
 * *"The plan can be downgraded but only when it's exhausted."* Nothing is captured, the tier
 * does not move, and the entitlement gate answers exactly what it answered before: the whole
 * of this operation is one nullable column and a date that was already on the row.
 *
 * IT IS THE REMEDY `joinTier`'s 409 NAMES, which is why the two live beside each other. A
 * customer who presses a lower tier is told the move can be scheduled instead; if that
 * sentence pointed at nothing, the refusal would be a dead end wearing an instruction.
 *
 * THE SAME RANK RULE, POINTED THE OTHER WAY. Only a LOWER tier can be scheduled — an equal one
 * is a no-op dressed as a request, and a higher one is an upgrade the customer would be
 * getting for free in a month's time. Both are 409, for `joinTier`'s reason: the request is
 * well formed and the tier is real, and what refuses it is the state the organisation is in.
 *
 * RE-SCHEDULING IS ALLOWED AND OVERWRITES. Gold -> Silver, changed to Gold -> Bronze, is one
 * customer changing their mind about one future fact. There is no history to keep because
 * nothing happened either time.
 */
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
    // `billing.update` rather than an action of its own: the capability that decided this is
    // the capability the audit reader looks for, and a scheduled change is a change to the
    // billing arrangement. What separates it from a join in the log is that no `payments` row
    // sits beside it — because no money moved.
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  return readBilling(orgId, req.ctx.requestId);
}

/**
 * CANCEL WHATEVER IS SCHEDULED — DEC-098. `DELETE /billing/downgrade`.
 *
 * NO TIER IN THE REQUEST, and `49` § Interactions asks for the same link to do both jobs. A
 * caller naming a tier could cancel a downgrade that had already been replaced by a different
 * one and be told it succeeded; there is only ever one pending value, so "cancel it" is the
 * whole of the instruction.
 *
 * CANCELLING NOTHING IS NOT AN ERROR, AND IT STILL WRITES. Two clicks on one link, or a
 * second tab, arrive here with the column already null — a 409 would be the product
 * complaining about getting the outcome the caller asked for. The write runs anyway rather
 * than short-circuiting: setting null to null is a no-op in the table, and the early return
 * that would have avoided it is a mutating request that produces no audit row, which is the
 * exact shape `middleware/auditWriter.ts` exists to catch (INV-007). The customer did perform
 * a billing action; the log says so.
 */
export async function cancelDowngrade(req: Request, orgId: string): Promise<BillingSummary> {
  // Repairs a missing row and fires an overdue downgrade before we clear the column — a
  // cancel arriving the morning after the period ended must not un-apply what already fired.
  await readBilling(orgId, req.ctx.requestId);

  await runInTransaction(req, async (tx) => {
    await tx.subscription.update({ where: { orgId }, data: { pendingTier: null } });
    req.ctx.audit.push({ action: 'billing.update', targetType: 'subscription', targetId: orgId });
  });

  return readBilling(orgId, req.ctx.requestId);
}

/**
 * ASK TO BE SOLD ENTERPRISE — `DEC-100`, `T-100`, `16` §2, `49`.
 *
 * NOTHING ABOUT THE SUBSCRIPTION MOVES. No tier, no period, no capture, no `payments` row.
 * What is written is a WORK ITEM for Endur's owner, who rings them back — the tier stays
 * operator-assigned through `platform.plan.override` exactly as `DEC-048` decided, and
 * `DEC-099`'s price is what the conversation starts from rather than a checkout.
 *
 * A SECOND REQUEST WHILE ONE IS OPEN IS A 409, AND THE DATABASE IS WHAT DECIDES THAT. The
 * partial unique index `enterprise_requests (org_id) WHERE status = 'open'` is the rule; the
 * catch below turns it into a sentence. A read-then-write check here would lose to two
 * simultaneous clicks and leave the owner ringing the same customer twice — which is the
 * failure this queue exists to make impossible, so it must not be reintroduced by the handler
 * that fills it.
 *
 * `P2002` IS CAUGHT RATHER THAN PRE-EMPTED for that reason. The check and the write are one
 * statement, so there is no window between them.
 */
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
          // CAPTURED beside the id, not joined at read time — the person may have left the
          // organisation before anybody rings back, and a queue row that forgets who asked is
          // a queue row nobody can action. `payments.payer_name`'s argument, on a longer life.
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

/**
 * Is there one open? One field, because that is all the page renders from it: the card's verb
 * is Request or "Requested", and there is no third state a customer needs to be shown. The
 * lifecycle — contacted, closed — is the OWNER'S, on `/ops`, and telling a customer their
 * request had been "closed" would raise a question the product cannot answer.
 */
export async function readEnterpriseRequest(orgId: string): Promise<EnterpriseRequestState> {
  const open = await prisma.enterpriseRequest.findFirst({
    where: { orgId, status: 'open' },
    select: { createdAt: true },
  });
  return { requestedAt: open?.createdAt.toISOString() ?? null };
}

