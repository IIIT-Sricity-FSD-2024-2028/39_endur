// T-108 — A PLAN THAT RUNS OUT ACTUALLY RUNS OUT. DEC-113, 16 §7d.
//
// THE BUG THIS FILE PINS, in the owner's words: *"on plan expiration, nothing happens for the
// client, they are able to continue to use the features granted by the plan."* Both halves
// were true and they had different causes, so both are asserted separately here:
//
//   · `readBilling` returned early unless a downgrade had been SCHEDULED, so the row kept
//     saying `gold` with `period_end` in the past, forever.
//   · `requireEntitlement` selected `tier` alone and never looked at the date, so even a
//     correct row would not have closed the hole for an organisation that never opens
//     `/app/plan` — which is most of them, most of the time.
//
// SO THE LOAD-BEARING TEST IN HERE IS `the gate stops opening Gold surfaces`. Everything else
// is bookkeeping; that one is the reported bug.
//
// THE CLOCK IS MOVED BY MOVING `period_end` INTO THE PAST, never by faking a timer — the same
// rule `downgrade.test.ts` follows, and for the same reason: the applier compares a column
// against today, and a fake clock would be testing the mock.
import { describe, expect, it } from 'vitest';
import { priceOf } from '@endur/shared';
import { registerOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

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

describe('a period that ends with nobody renewing — DEC-113', () => {
  it('moves the organisation to bronze on the first read, and says what it lost', async () => {
    const founder = await registerOrg('custom', 'gold');
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.status).toBe(200);
    // THE READ THAT APPLIES IT RETURNS THE NEW STATE. There is no request in between where
    // the page shows one tier and the gate enforces another.
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.lapsedFrom).toBe('gold');

    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('bronze');
    expect(row?.lapsedFrom).toBe('gold');
    // THE PERIOD ROLLS FORWARD. Left in the past it would lapse again on the next read, and
    // write a ledger row every time somebody loaded a page.
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * THE REPORTED BUG, ASSERTED WHERE IT ACTUALLY LIVED. A Gold capability behind
   * `requireEntitlement` must stop resolving the moment the period ends — WITHOUT anybody
   * having opened the plan page first, because the gate is what an ordinary user meets and
   * the plan page is a screen most of them cannot even see.
   */
  it('stops opening Gold surfaces immediately, with no read of /billing first', async () => {
    const founder = await registerOrg('custom', 'gold');

    const before = await founder.agent.get('/api/v1/analysis');
    expect(before.status).not.toBe(402);

    await expirePeriod(founder.orgId);

    const after = await founder.agent.get('/api/v1/analysis');
    expect(after.status).toBe(402);
    // The 402 still names the remedy, which is what separates it from a 403 (DEC-011).
    expect(after.body.error.details.currentTier).toBe('bronze');

    // AND THE ROW HAS NOT BEEN TOUCHED. The gate derives; it does not write. This is the
    // property that keeps a GET off the write path, and it is why the two readers have to
    // share `effectiveTier()` rather than each deciding for themselves.
    expect((await rowOf(founder.orgId))?.tier).toBe('gold');
  });

  /** Bronze IS the floor. `16` §7 has said "never to zero access" since before it was built. */
  it('never takes bronze away — the period just rolls forward, free and unrecorded', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const beforeRows = await paymentsOf(founder.orgId);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.body.data.tier).toBe('bronze');
    // NO NOTICE, because nothing was lost. A lapse banner on an organisation that never had
    // anything to lose is the product asking for money it has decided not to charge.
    expect(res.body.data.lapsedFrom).toBeNull();

    const row = await rowOf(founder.orgId);
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());
    // NO LEDGER ROW. `payments` records plan MOVES; nothing moved, and an append-only ledger
    // that fills with rows saying "nothing happened" stops being readable.
    expect(await paymentsOf(founder.orgId)).toHaveLength(beforeRows.length);
  });

  /**
   * `expiry` AND `lapse` ARE DIFFERENT KINDS. Same ₹0 row, opposite facts: one customer asked
   * to spend less, the other stopped paying. If these collapse into one kind, *"how many
   * organisations lapsed last month"* stops being answerable from the only table that records
   * plan moves.
   */
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
    // NOBODY DID THIS. A date passed, and whoever happened to load the page next did not
    // perform it — stamping their id here would put a person's name against a change they
    // did not make, in the one table the product offers as evidence (`56`).
    expect(audit?.actorUserId).toBeNull();
  });

  /**
   * THE REVENUE HOLE THE FIX WOULD OTHERWISE HAVE OPENED, and it is the reason `pricedFrom`
   * exists. `DEC-097` charges the DIFFERENCE because the customer already paid for the tier
   * they are leaving. After a lapse they did not — the bronze they sit on was free — so
   * crediting ₹99 against a rejoin would charge ₹900 for a ₹999 plan, every month, making a
   * deliberate lapse permanently cheaper than staying on the plan.
   */
  it('charges the FULL price to rejoin after a lapse, not the difference', async () => {
    const founder = await registerOrg('custom', 'gold');
    await expirePeriod(founder.orgId);
    expect((await read(founder)).body.data.lapsedFrom).toBe('gold');

    const rejoin = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(rejoin.status).toBe(200);
    expect(rejoin.body.data.tier).toBe('gold');
    // AND THE NOTICE IS SPENT. They have a plan again; there is nothing left to apologise for.
    expect(rejoin.body.data.lapsedFrom).toBeNull();

    const rows = await paymentsOf(founder.orgId);
    const capture = rows[rows.length - 1]!;
    expect(capture.kind).toBe('change');
    expect(capture.amountMinor).toBe(priceOf('gold'));
    // THE MOVE IS STILL RECORDED AS BRONZE -> GOLD, because that is what moved. Only the
    // PRICE is measured against nothing, which is what keeps /ops/analytics counting the
    // upgrade it actually was.
    expect(capture.fromTier).toBe('bronze');
  });

  /**
   * AN ORDINARY UPGRADE IS UNTOUCHED — the guard on the test above. If `pricedFrom` leaked
   * into the normal path, every upgrade in the product would start billing the full price and
   * `/ops/earnings` would overstate exactly the customers who upgrade most (DEC-097).
   */
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
