// T-058 — the payment ledger and the earnings page. DEC-080.
//
// THREE PROPERTIES, AND THEY ARE THE THREE DEC-080 RESTS ON:
//
//   1 · A plan change writes exactly ONE capture, priced by the SERVER, with the real
//       from-tier on it. The client sends a tier and a label; it cannot send an amount, and
//       if it could, nothing would read it.
//   2 · `paymentRef` IS NOT AN AUTHORISATION INPUT. A join with no reference still joins and
//       still records a capture — because a gate on a client-generated string would be
//       INV-003 inverted, and there is no gateway to verify one against.
//   3 · `/platform/earnings` is OWNER ONLY. `staff` gets a 403 naming the capability, the
//       same shape `/platform/analytics` has had since `71`.
//
// Signup captures are covered next door in `tiers.test.ts`, beside the subscription row they
// are written with — the two are one transaction and the assertions belong together.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { priceOf } from '@endur/shared';
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

    // UNIQUE PER RUN. `payments.reference` is unique across the whole table — that is what
    // stops a double-submitted dialog billing twice — so a literal here would pass once and
    // then 500 on every later run against the same test database.
    const reference = `endur_${unique('ref')}`;
    const res = await join(founder, { tier: 'gold', paymentRef: reference });
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('gold');

    const payments = await paymentsOf(founder.orgId);
    // Two: the signup capture, then this one. The signup row is `tiers.test.ts`'s subject.
    expect(payments).toHaveLength(2);
    const change = payments[1];
    expect(change?.kind).toBe('change');
    expect(change?.tier).toBe('gold');
    expect(change?.fromTier).toBe('bronze');
    expect(change?.amountMinor).toBe(priceOf('gold'));
    expect(change?.reference).toBe(reference);
    // WHO PAID, captured rather than joined — the row has to still read correctly after the
    // user is renamed or removed.
    expect(change?.payerName).toBe('Founder');
  });

  /**
   * THE SERVER PRICES IT. There is no field on `JoinTierBody` for an amount, so this asserts
   * the property by trying to smuggle one past `validate()` — a stripped unknown key, and a
   * row that costs what Silver costs regardless.
   */
  it('ignores any amount the client tries to name', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await join(founder, { tier: 'silver', amountMinor: 1, priceMinor: 1 });
    expect(res.status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments[1]?.amountMinor).toBe(priceOf('silver'));
  });

  /**
   * A REFERENCE IS A LABEL, NOT A PROOF. A join with none is a valid join — the alternative
   * is a tier gated on a string React invented, which is exactly the decision INV-003 says
   * the client never gets to make. The row is still written, with a reference we minted.
   */
  it('joins and records without a reference at all', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await join(founder, { tier: 'silver' });
    expect(res.status).toBe(200);

    const payments = await paymentsOf(founder.orgId);
    expect(payments).toHaveLength(2);
    expect(payments[1]?.reference).toMatch(/^endur_/);
  });

  /** Enterprise is refused before anything is written — no tier change, and no capture. */
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

    const data = res.body.data;
    expect(data.currency).toBe('INR');
    // Integers all the way to the client — a float crossing the wire is a rounding error
    // waiting for somebody downstream to sum it.
    expect(Number.isInteger(data.totals.revenueMinor)).toBe(true);
    expect(data.totals.revenueMinor).toBeGreaterThanOrEqual(priceOf('gold'));
    expect(data.byTier.map((row: { tier: string }) => row.tier))
      .toEqual(['bronze', 'silver', 'gold', 'enterprise']);
    // The organisation registered a moment ago is in the window and in the ledger.
    expect(data.recent.some((row: { orgId: string }) => row.orgId === founder.orgId)).toBe(true);
  });

  /**
   * A MEAN OF NO PAYMENTS IS NOT ZERO — the same argument `71` decision 3 makes about a
   * conversion rate, and the page renders a dash for it rather than ₹0.
   */
  it('returns a null average for a window with no captures in it', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.get('/api/v1/platform/earnings?from=2019-01-01&to=2019-12-31');
    expect(res.status).toBe(200);
    expect(res.body.data.totals.payments).toBe(0);
    expect(res.body.data.totals.averageMinor).toBeNull();
    // The lifetime figure ignores the window on purpose — it is the one all-time number.
    expect(res.body.data.totals.lifetimeRevenueMinor).toBeGreaterThan(0);
  });
});
