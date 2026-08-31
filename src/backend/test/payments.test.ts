// The payment ledger and the earnings page. Three properties:
//   1. a plan change writes exactly ONE capture, priced by the SERVER, with the real from-tier on it,
//      and the amount is the DIFFERENCE between the two tiers;
//   2. a payment reference is a label, not an authorisation input - a join with none still joins;
//   3. the earnings page is owner-only, and staff get a 403 naming the capability.
// Signup captures are covered next door, beside the subscription row they are written with.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { changeCostMinor, priceOf, type PlatformEarnings } from '@endur/shared';
import { app, registerOrg, unique, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { generateSecret, currentCode } from '../platform/totp.js';

const PASSWORD = 'an-operator-password';

async function makeOperator(role: 'owner' | 'staff') {
  const email = `${unique(role)}@endur.test`;
  const secret = generateSecret();
  await prisma.platformUser.create({
    data: {
      email,
      name: `Test ${role}`,
      role,
      passwordHash: await hashPassword(PASSWORD),
      mfaSecret: secret,
    },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return agent;
}

const join = (session: Session, body: Record<string, unknown>) =>
  withCsrf(session, 'post', '/api/v1/billing/tier').send(body);

const paymentsOf = (orgId: string) =>
  prisma.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });

describe('a plan change writes one capture — DEC-080', () => {
  it('records the move, priced by the server, with the tier they came from', async () => {
    const founder = await registerOrg('custom', 'bronze');

    // Unique per run: the reference column is unique across the whole table, which is what stops a
    // double-submitted dialog billing twice - so a literal here would pass once and then fail forever.
    const reference = `endur_${unique('ref')}`;
    const res = await join(founder, { tier: 'gold', paymentRef: reference });
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('gold');

    const payments = await paymentsOf(founder.orgId);
    // Two rows: the signup capture, then this one.
    expect(payments).toHaveLength(2);
    const change = payments[1];
    expect(change?.kind).toBe('change');
    expect(change?.tier).toBe('gold');
    expect(change?.fromTier).toBe('bronze');
    // The DIFFERENCE, not the destination. Asserted against the shared formula AND against the literal,
    // because a test that only calls the formula would agree with a broken formula.
    expect(change?.amountMinor).toBe(changeCostMinor('bronze', 'gold'));
    expect(change?.amountMinor).toBe(priceOf('gold') - priceOf('bronze'));
    expect(change?.amountMinor).toBe(90000);
    expect(change?.reference).toBe(reference);
    // Who paid, captured rather than joined: the row has to read correctly after the user is renamed or removed.
    expect(change?.payerName).toBe('Founder');
  });

  // The server prices it: there is no field for an amount, so this tries to smuggle one past validation
  // and asserts the row costs what the tier costs regardless.
  it('ignores any amount the client tries to name', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await join(founder, { tier: 'silver', amountMinor: 1, priceMinor: 1 });
    expect(res.status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments[1]?.amountMinor).toBe(changeCostMinor('bronze', 'silver'));
  });

  // The ledger stops overstating: walking up two tiers used to contribute all three prices for a customer
  // holding one plan. Asserted as a SUM, because the sum is what the earnings page reads.
  it('sums to the plan they end on, however many steps they took to get there', async () => {
    const founder = await registerOrg('custom', 'bronze');
    expect((await join(founder, { tier: 'silver' })).status).toBe(200);
    expect((await join(founder, { tier: 'gold' })).status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments).toHaveLength(3);
    expect(payments.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(priceOf('gold'));
  });

  // The ladder is one-way, and the SERVER is where that is decided.
  // This calls the route directly rather than driving the page: a rule the client enforces is not enforced.
  it('refuses a move DOWN, writes nothing, and says why', async () => {
    const founder = await registerOrg('custom', 'gold');
    const res = await join(founder, { tier: 'silver' });

    expect(res.status).toBe(409);
    // The message names where they are and what to do instead - "invalid tier" would be untrue about a
    // tier the page is showing them.
    expect(res.body.error.message).toMatch(/only move up/i);
    expect(res.body.error.message).toMatch(/no refunds/i);

    // Nothing was written: a refusal that had already moved the tier or captured money would be worse
    // than allowing the move.
    const after = await prisma.subscription.findUnique({ where: { orgId: founder.orgId } });
    expect(after?.tier).toBe('gold');
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  // Standing still is not a purchase: pressing the card you are already on must not capture again.
  it('refuses a move to the tier they are already on', async () => {
    const founder = await registerOrg('custom', 'silver');
    const res = await join(founder, { tier: 'silver' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already on/i);
    expect(await paymentsOf(founder.orgId)).toHaveLength(1);
  });

  // A reference is a label, not a proof: a join with none is a valid join, and the row is still written
  // with a reference we minted.
  it('joins and records without a reference at all', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await join(founder, { tier: 'silver' });
    expect(res.status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments).toHaveLength(2);
    expect(payments[1]?.reference).toMatch(/^endur_/);
  });

  // Enterprise is refused before anything is written: no tier change, and no capture.
  it('writes nothing when the tier is refused', async () => {
    const founder = await registerOrg('custom', 'bronze');
    expect((await join(founder, { tier: 'enterprise' })).status).toBe(409);

    const payments = await paymentsOf(founder.orgId);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.kind).toBe('signup');
  });
});

describe('the earnings page is the owner’s — DEC-080, 19 §4', () => {
  it('refuses staff and names the capability', async () => {
    const staff = await makeOperator('staff');
    const res = await staff.get('/api/v1/platform/earnings');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('platform.revenue.read');
  });

  it('answers the owner with money in minor units', async () => {
    const founder = await registerOrg('custom', 'gold');
    const owner = await makeOperator('owner');

    const res = await owner.get('/api/v1/platform/earnings');
    expect(res.status).toBe(200);

    // Typed rather than loose, because the assertions below walk into arrays.
    const data = res.body.data as PlatformEarnings;
    expect(data.currency).toBe('INR');
    // Whole numbers all the way to the client: a decimal crossing the wire is a rounding error waiting
    // for somebody to sum it.
    expect(Number.isInteger(data.totals.revenueMinor)).toBe(true);
    expect(data.totals.revenueMinor).toBeGreaterThanOrEqual(priceOf('gold'));
    expect(data.byTier.map((row) => row.tier))
      .toEqual(['bronze', 'silver', 'gold', 'enterprise']);
    // The organisation registered a moment ago is in the window and in the ledger.
    expect(data.recent.some((row) => row.orgId === founder.orgId)).toBe(true);
  });

  // A mean of no payments is not zero, so the page renders a dash rather than a zero amount.
  it('returns a null average for a window with no captures in it', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.get('/api/v1/platform/earnings?from=2019-01-01&to=2019-12-31');
    expect(res.status).toBe(200);
    expect(res.body.data.totals.payments).toBe(0);
    expect(res.body.data.totals.averageMinor).toBeNull();
    // The lifetime figure ignores the window on purpose: it is the one all-time number.
    expect(res.body.data.totals.lifetimeRevenueMinor).toBeGreaterThan(0);
  });
});
