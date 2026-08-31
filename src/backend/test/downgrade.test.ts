// A downgrade is SCHEDULED, and applied on READ. Four properties:
//   1. scheduling changes nothing today - the tier is unmoved, no payment is written, the gate is unchanged;
//   2. the first read after the period ends applies it, and that read returns the NEW tier;
//   3. it is one-way too: scheduling the current tier or a higher one is a 409, because a higher tier
//      scheduled for free next month is an upgrade nobody paid for;
//   4. an upgrade cancels it, because the customer has replaced the intention rather than added to it.
// The clock is moved by putting the period end in the past, never by faking a timer - a fake clock
// would only test the mock.
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

// Yesterday, as a date: the column carries no time.
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
    // The summary carries BOTH the tier in force and the one asked for, because they are different facts.
    expect(res.body.data.tier).toBe('gold');
    expect(res.body.data.pendingTier).toBe('bronze');

    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('gold');
    expect(row?.pendingTier).toBe('bronze');
    // Nothing was captured: a schedule that took money would be the very transaction this design refuses.
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  // The gate is untouched, asserted through a real gated route rather than by reading the middleware:
  // an organisation that scheduled a drop still gets what it paid for until the period ends.
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

    // Twice: a second tab, or a second click, and a 409 would be the product objecting to the state it is in.
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

  // A higher tier scheduled would be an upgrade nobody paid for, since this route charges nothing.
  it('refuses to schedule a tier above the current one', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await schedule(founder, 'gold');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/above/i);
    expect((await rowOf(founder.orgId))?.pendingTier).toBeNull();
  });
});

describe('the first read after the period ends applies it — DEC-098', () => {
  // The read that applies it returns the NEW tier - not the next read, this one - so there is never a
  // request where the page and the row disagree.
  it('moves the tier, clears the column and starts a new period', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.pendingTier).toBeNull();

    // A NEW period, not the expired one left lying in the past, or the next schedule would fire at once.
    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('bronze');
    expect(row?.pendingTier).toBeNull();
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  // The move is recorded and no money is: the payments table is the one place a plan change is written
  // with a from and a to, and the amount comes out at zero on its own.
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
    // The estate holds exactly what it held: a downgrade is not revenue and not a refund.
    expect(payments.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(priceOf('gold'));
  });

  // It fires once: a second read finds an empty column and does nothing, or the analytics page would
  // count a move that did not happen.
  it('does not fire twice', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);
    await expirePeriod(founder.orgId);
    expect((await read(founder)).status).toBe(200);
    expect((await read(founder)).status).toBe(200);
    expect(await paymentsOf(founder.orgId)).toHaveLength(2);
  });

  // A period still running keeps the plan that was paid for. The date is the whole rule.
  it('does nothing at all while the period is still running', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await schedule(founder, 'bronze')).status).toBe(200);

    const res = await read(founder);
    expect(res.body.data.tier).toBe('gold');
    expect(res.body.data.pendingTier).toBe('bronze');
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  // An upgrade replaces the intention: leaving the column set would drop the customer at the end of the
  // period they just bought, weeks later and silently.
  it('is cancelled by paying to move up', async () => {
    const founder = await registerOrg('custom', 'silver');
    expect((await schedule(founder, 'bronze')).status).toBe(200);

    const up = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(up.status).toBe(200);
    expect(up.body.data.tier).toBe('gold');
    expect(up.body.data.pendingTier).toBeNull();

    // What proves it now that expiry is real: the plan falls to bronze either way, and what separates
    // "the abandoned schedule fired" from "the period ran out" is HOW it fell.
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
