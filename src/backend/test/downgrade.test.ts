// T-098 — a downgrade is SCHEDULED, and it is applied on READ. DEC-098, 16 §7b.
//
// FOUR PROPERTIES, AND THEY ARE THE FOUR THE DECISION RESTS ON:
//
//   1 · SCHEDULING CHANGES NOTHING TODAY. `subscriptions.tier` is unmoved, no `payments` row
//       is written, and the entitlement gate answers exactly what it answered before. The
//       whole of the operation is one nullable column.
//   2 · THE FIRST READ AFTER `period_end` APPLIES IT, and the read that applies it returns the
//       NEW tier — there is no request in between where the page and the gate disagree.
//   3 · IT IS ONE-WAY TOO. Scheduling the tier they are on, or one above it, is a 409 —
//       `joinTier`'s rank rule pointed the other way, because a higher tier scheduled for
//       free next month is an upgrade nobody paid for.
//   4 · AN UPGRADE CANCELS IT. A customer who scheduled Silver -> Bronze and then paid for
//       Gold has replaced the intention, not added to it.
//
// THE CLOCK IS MOVED BY MOVING `period_end` INTO THE PAST, never by faking a timer. The
// applier reads a date off a row and compares it to today; a fake clock would test the mock.
import { describe, expect, it } from 'vitest';
import { priceOf } from '@endur/shared';
import { registerOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

const schedule = (session: Session, tier: string) =>
  withCsrf(session, 'post', '/api/v1/billing/downgrade').send({ tier });

const cancel = (session: Session) =>
  withCsrf(session, 'delete', '/api/v1/billing/downgrade').send();

const read = (session: Session) => session.agent.get('/api/v1/billing');

const rowOf = (orgId: string) => prisma.subscription.findUnique({ where: { orgId } });

const paymentsOf = (orgId: string) =>
  prisma.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });

/** Yesterday, as a DATE — `period_end` is `@db.Date` and carries no time. */
const expirePeriod = async (orgId: string): Promise<void> => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  await prisma.subscription.update({ where: { orgId }, data: { periodEnd: yesterday } });
};

describe('scheduling a move down changes nothing today — DEC-098', () => {
  it('writes the pending tier, moves no plan and captures no money', async () => {
    const founder = await registerOrg('custom', 'gold');

    const res = await schedule(founder, 'bronze');
    expect(res.status).toBe(200);
    // The summary carries BOTH: the tier in force and the one asked for. They are different
    // fields because they are different facts, and the gate only ever reads the first.
    expect(res.body.data.tier).toBe('gold');
    expect(res.body.data.pendingTier).toBe('bronze');

    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('gold');
    expect(row?.pendingTier).toBe('bronze');
    // NOTHING WAS CAPTURED. Only the signup row is there. A schedule that took money would be
    // the transaction DEC-096 refused, merely postponed.
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  /**
   * THE GATE IS UNTOUCHED. `requireEntitlement` reads `tier` and never `pending_tier`, and
   * this asserts it through a real gated route rather than by reading the middleware: an
   * organisation that has scheduled a drop to Bronze still gets the Gold surfaces it paid for
   * until the period it paid for ends.
   */
  it('leaves the entitlement gate answering exactly as it did', async () => {
    const founder = await registerOrg('custom', 'gold');
    const before = await founder.agent.get('/api/v1/improve/cycles');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    const after = await founder.agent.get('/api/v1/improve/cycles');
    expect(after.status).toBe(before.status);
    expect(after.status).not.toBe(402);
  });

  it('overwrites a previous schedule rather than refusing one', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    const second = await schedule(founder, 'silver');
    expect(second.status).toBe(200);
    expect(second.body.data.pendingTier).toBe('silver');
  });

  it('cancels, and cancelling nothing is not an error', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);

    const first = await cancel(founder);
    expect(first.status).toBe(200);
    expect(first.body.data.pendingTier).toBeNull();

    // Twice. A second tab, or a second click — and a 409 here would be the product objecting
    // to being asked for the state it is already in.
    const second = await cancel(founder);
    expect(second.status).toBe(200);
    expect(second.body.data.pendingTier).toBeNull();
  });
});

describe('the rank rule, pointed the other way — DEC-098', () => {
  it('refuses to schedule the tier they are already on', async () => {
    const founder = await registerOrg('custom', 'silver');
    const res = await schedule(founder, 'silver');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already on/i);
    expect((await rowOf(founder.orgId))?.pendingTier).toBeNull();
  });

  /**
   * A HIGHER TIER SCHEDULED IS AN UPGRADE NOBODY PAID FOR. `joinTier` charges the difference
   * at the moment of the move; this route charges nothing, so allowing it upward would be a
   * free Gold with a month's delay on it.
   */
  it('refuses to schedule a tier above the current one', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await schedule(founder, 'gold');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/above/i);
    expect((await rowOf(founder.orgId))?.pendingTier).toBeNull();
  });
});

describe('the first read after the period ends applies it — DEC-098', () => {
  /**
   * THE READ THAT APPLIES IT RETURNS THE NEW TIER. Not the next one — this one. `readBilling`
   * is the applier, so there is never a request where the page shows the old tier and the row
   * holds the new one, which is `49` § Interactions' requirement that the two be one column.
   */
  it('moves the tier, clears the column and starts a new period', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.pendingTier).toBeNull();

    // A NEW PERIOD, not the expired one left lying in the past. Leaving it there would mean
    // the next schedule fired the instant it was asked for.
    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('bronze');
    expect(row?.pendingTier).toBeNull();
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * THE MOVE IS RECORDED AND NO MONEY IS. `payments` is the one table that carries a plan
   * change with a from and a to on it, and a tier that moved with no row anywhere would be a
   * hole in an append-only ledger. Rs 0, because nothing was captured — `changeCostMinor`
   * arrives at that on its own through the clamp DEC-097 called unreachable from `joinTier`.
   */
  it('writes an expiry row for Rs 0 and leaves revenue where it was', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    await expirePeriod(founder.orgId);
    expect((await read(founder)).status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments).toHaveLength(2);
    const expiry = payments[1];
    expect(expiry?.kind).toBe('expiry');
    expect(expiry?.fromTier).toBe('gold');
    expect(expiry?.tier).toBe('bronze');
    expect(expiry?.amountMinor).toBe(0);
    // The estate holds exactly what it held. A downgrade is not revenue and not a refund.
    expect(payments.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(priceOf('gold'));
  });

  /**
   * IT FIRES ONCE. The second read finds an empty column and does nothing — a second expiry
   * row would say a plan moved when it did not, in the table `/ops/analytics` counts moves
   * out of (DEC-102).
   */
  it('does not fire twice', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    await expirePeriod(founder.orgId);
    expect((await read(founder)).status).toBe(200);
    expect((await read(founder)).status).toBe(200);
    expect(await paymentsOf(founder.orgId)).toHaveLength(2);
  });

  /** A period still running keeps the plan that was paid for. The date is the whole rule. */
  it('does nothing at all while the period is still running', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);

    const res = await read(founder);
    expect(res.body.data.tier).toBe('gold');
    expect(res.body.data.pendingTier).toBe('bronze');
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  /**
   * AN UPGRADE REPLACES THE INTENTION. Silver, scheduled down to Bronze, then paid up to
   * Gold — the customer has decided something new about the same question. Leaving the column
   * set would drop them to Bronze at the end of the period they just bought, silently, weeks
   * later, and the ledger would show them paying to go up and then falling past where they
   * started.
   */
  it('is cancelled by paying to move up', async () => {
    const founder = await registerOrg('custom', 'silver');
    expect((await schedule(founder, 'bronze')).status).toBe(200);

    const up = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(up.status).toBe(200);
    expect(up.body.data.tier).toBe('gold');
    expect(up.body.data.pendingTier).toBeNull();

    // AND WHAT THE END OF THE PERIOD PROVES CHANGED WITH DEC-113. It used to be enough to
    // assert the tier was still `gold` — nothing happened at expiry, so surviving it was the
    // evidence the column had been cleared. Expiry is real now: the plan falls to bronze
    // either way, and what separates "the abandoned schedule fired" from "the period simply
    // ran out" is HOW it fell. A scheduled move leaves `lapsedFrom` null and writes
    // `kind: 'expiry'`; this is a lapse from GOLD, which is only true if the pending bronze
    // was genuinely gone.
    await expirePeriod(founder.orgId);
    const after = (await read(founder)).body.data;
    expect(after.tier).toBe('bronze');
    expect(after.lapsedFrom).toBe('gold');
    expect(after.pendingTier).toBeNull();

    const kinds = (await paymentsOf(founder.orgId)).map((row) => row.kind);
    expect(kinds).toContain('lapse');
    expect(kinds).not.toContain('expiry');
  });
});
