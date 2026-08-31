// A plan that runs out actually runs out.
// The reported bug, in the owner's words: on plan expiration nothing happened and the customer kept
// using the features. Two separate causes, asserted separately here: the plan page only advanced a
// downgrade that had been SCHEDULED, and the gate read the tier column without ever looking at the date.
// The load-bearing test is the one where the GATE stops opening paid surfaces; the rest is bookkeeping.
// The clock is moved by putting the period end in the past, never by faking a timer.
import { describe, expect, it } from 'vitest';
import { priceOf } from '@endur/shared';
import { registerOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

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

describe('a period that ends with nobody renewing — DEC-113', () => {
  it('moves the organisation to bronze on the first read, and says what it lost', async () => {
    const founder = await registerOrg('custom', 'gold');
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.status).toBe(200);
    // The read that applies it returns the new state, so there is no request where the page and the gate disagree.
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.lapsedFrom).toBe('gold');

    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('bronze');
    expect(row?.lapsedFrom).toBe('gold');
    // The period rolls forward: left in the past it would lapse again on every read and write a ledger row each time.
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  // The reported bug, asserted where it actually lived: a paid capability must stop resolving the moment
  // the period ends, WITHOUT anybody having opened the plan page first.
  it('stops opening Gold surfaces immediately, with no read of /billing first', async () => {
    const founder = await registerOrg('custom', 'gold');

    const before = await founder.agent.get('/api/v1/analysis');
    expect(before.status).not.toBe(402);

    await expirePeriod(founder.orgId);

    const after = await founder.agent.get('/api/v1/analysis');
    expect(after.status).toBe(402);
    // The 402 still names the remedy, which is what separates it from a 403.
    expect(after.body.error.details.currentTier).toBe('bronze');

    // And the row has not been touched: the gate derives, it does not write.
    expect((await rowOf(founder.orgId))?.tier).toBe('gold');
  });

  // Bronze is the floor: expiry never means zero access.
  it('never takes bronze away — the period just rolls forward, free and unrecorded', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const beforeRows = await paymentsOf(founder.orgId);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.body.data.tier).toBe('bronze');
    // No notice, because nothing was lost: a lapse banner on an organisation that had nothing to lose
    // would be the product asking for money it decided not to charge.
    expect(res.body.data.lapsedFrom).toBeNull();

    const row = await rowOf(founder.orgId);
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
    // No ledger row: the payments table records plan MOVES, and nothing moved.
    expect(await paymentsOf(founder.orgId)).toHaveLength(beforeRows.length);
  });

  // Expiry and lapse are different kinds: same zero-rupee row, opposite facts - one customer asked to
  // spend less, the other stopped paying.
  it('records a lapse as its own kind, at zero, with an actorless audit row', async () => {
    const founder = await registerOrg('custom', 'silver');
    await expirePeriod(founder.orgId);
    await read(founder);

    const rows = await paymentsOf(founder.orgId);
    const lapse = rows.find((row) => row.kind === 'lapse');
    expect(lapse).toBeDefined();
    expect(lapse?.amountMinor).toBe(0);
    expect(lapse?.fromTier).toBe('silver');
    expect(lapse?.tier).toBe('bronze');

    const audit = await prisma.auditLog.findFirst({
      where: { orgId: founder.orgId, action: 'billing.lapse' },
    });
    expect(audit).toBeTruthy();
    // Nobody did this: a date passed, and stamping whoever loaded the page next would name a person for
    // a change they did not make.
    expect(audit?.actorUserId).toBeNull();
  });

  // The revenue hole the fix would otherwise have opened: charging the difference credits the customer
  // for the tier they are leaving BECAUSE they paid for it, and after a lapse they did not.
  it('charges the FULL price to rejoin after a lapse, not the difference', async () => {
    const founder = await registerOrg('custom', 'gold');
    await expirePeriod(founder.orgId);
    expect((await read(founder)).body.data.lapsedFrom).toBe('gold');

    const rejoin = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(rejoin.status).toBe(200);
    expect(rejoin.body.data.tier).toBe('gold');
    // And the notice is spent: they have a plan again, so there is nothing left to apologise for.
    expect(rejoin.body.data.lapsedFrom).toBeNull();

    const rows = await paymentsOf(founder.orgId);
    const capture = rows[rows.length - 1]!;
    expect(capture.kind).toBe('change');
    expect(capture.amountMinor).toBe(priceOf('gold'));
    // The move is still recorded as bronze to gold, because that is what moved. Only the PRICE is measured
    // against nothing.
    expect(capture.fromTier).toBe('bronze');
  });

  // An ordinary upgrade is untouched - the guard on the test above. If the lapse pricing leaked into the
  // normal path, every upgrade would start billing the full price.
  it('still charges the difference on an upgrade inside a running period', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const up = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(up.status).toBe(200);

    const rows = await paymentsOf(founder.orgId);
    expect(rows[rows.length - 1]?.amountMinor).toBe(priceOf('gold') - priceOf('bronze'));
  });

  /** The notice is news for one period and furniture after that. */
  it('clears the notice when the next bronze period rolls over', async () => {
    const founder = await registerOrg('custom', 'silver');
    await expirePeriod(founder.orgId);
    expect((await read(founder)).body.data.lapsedFrom).toBe('silver');

    await expirePeriod(founder.orgId);
    expect((await read(founder)).body.data.lapsedFrom).toBeNull();
  });
});
