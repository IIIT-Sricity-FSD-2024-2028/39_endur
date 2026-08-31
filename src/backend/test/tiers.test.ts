// The tier is chosen at sign-up, and it is the tier the organisation is on.
// This file did not exist before: the entitlement gate had been mounted for a long time with NO tests
// at all, which is how every organisation stayed silently on the free tier for a month.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  CAPABILITIES,
  PLAN_OPTIONS,
  SIGNUP_PLAN_OPTIONS,
  SIGNUP_TIERS,
  TIERS,
  changeCostMinor,
  formatMoney,
  priceOf,
  type Capability,
} from '@endur/shared';
import { TIER_ENTITLEMENTS, lowestTierFor, tierIncludes } from '../billing/entitlements.js';
import { periodEndFrom } from '../billing/period.js';
import { app, registerOrg, unique, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

describe('the entitlement map covers the catalogue — 16 §3', () => {
  // The test that would have caught both bugs found here: two whole modules were in NO tier, so the gate
  // would have refused them at every tier including the highest - and an uncovered billing capability
  // means a paywall in front of the upgrade button.
  // A capability in no tier is always a bug, never a decision.
  it('leaves no capability in no tier at all', () => {
    const covered = new Set<Capability>(TIERS.flatMap((tier) => [...TIER_ENTITLEMENTS[tier]]));
    const orphans = CAPABILITIES.filter((capability) => !covered.has(capability));
    expect(orphans).toEqual([]);
  });

  // The cheapest tier only means anything if the tiers nest: a capability held by a lower tier but
  // reported as needing a higher one would make the 402's advice a lie.
  it('nests: every tier includes everything the tier below it does', () => {
    for (let index = 1; index < TIERS.length; index += 1) {
      const lower = TIER_ENTITLEMENTS[TIERS[index - 1]!];
      const higher = TIER_ENTITLEMENTS[TIERS[index]!];
      expect([...lower].filter((capability) => !higher.has(capability))).toEqual([]);
    }
  });

  it('keeps the whole permission surface in bronze — 01 §6', () => {
    for (const capability of CAPABILITIES) {
      if (/^(org|unit|role|grant|person|assignment|group|delegation|account)\./.test(capability)) {
        expect(tierIncludes('bronze', capability)).toBe(true);
      }
    }
    // Selling privacy as an upgrade would be indefensible, and this is that sentence as code.
    expect(tierIncludes('bronze', 'simulator.run')).toBe(true);
  });

  it('names silver as the remedy for an export and gold for the improve loop', () => {
    expect(lowestTierFor('results.export')).toBe('silver');
    expect(lowestTierFor('analysis.read')).toBe('silver');
    expect(lowestTierFor('reflection.create')).toBe('gold');
  });
});

describe('the picker offers three tiers and not four — DEC-048', () => {
  it('describes every tier once, in tier order', () => {
    expect(PLAN_OPTIONS.map((plan) => plan.tier)).toEqual([...TIERS]);
  });

  // Enterprise is priced individually - a conversation, not a button - but it is still a real tier that
  // an operator can assign.
  it('shows Enterprise and refuses to let anyone choose it', () => {
    expect(PLAN_OPTIONS.find((plan) => plan.tier === 'enterprise')?.selectable).toBe(false);
    expect(SIGNUP_PLAN_OPTIONS.map((plan) => plan.tier)).toEqual([...SIGNUP_TIERS]);
    expect(SIGNUP_TIERS).not.toContain('enterprise');
  });

  // The prices, asserted: the picker prints these before anybody has a session and the server prices
  // every ledger row from the same table, so a typo is both a wrong quote and a wrong charge.
  it('prices the three sellable tiers in paise, ascending', () => {
    const priced = SIGNUP_PLAN_OPTIONS.map((plan) => [plan.tier, plan.priceMinor]);
    expect(priced).toEqual([
      ['bronze', 9900],
      ['silver', 49900],
      ['gold', 99900],
    ]);
    for (const plan of PLAN_OPTIONS) {
      expect(plan.currency).toBe('INR');
      // Whole numbers always: a decimal here is a rounding error in a ledger.
      expect(Number.isInteger(plan.priceMinor)).toBe(true);
    }
  });

  // Enterprise has a price and still cannot be chosen by a customer.
  // This used to assert a price of zero under a comment explaining that zero did not mean free - a
  // sentinel every reader had to be told about, which leaked into the copy. Now they are two facts.
  it('prices Enterprise and still refuses to let a customer assign it', () => {
    const enterprise = PLAN_OPTIONS.find((plan) => plan.tier === 'enterprise');
    expect(enterprise?.priceMinor).toBe(499900);
    expect(formatMoney(enterprise?.priceMinor ?? 0)).toBe('₹4,999');
    // A price is not a checkout.
    expect(enterprise?.selectable).toBe(false);
    expect(SIGNUP_PLAN_OPTIONS.some((plan) => plan.tier === 'enterprise')).toBe(false);
  });

  // One formatter, whole rupees while the paise are zero, shared by the plan page, the dialog and the
  // earnings page.
  it('formats money as whole rupees', () => {
    expect(formatMoney(9900)).toBe('₹99');
    expect(formatMoney(99900)).toBe('₹999');
    expect(priceOf('silver')).toBe(49900);
  });

  // What a move costs: one formula, called by both the checkout dialog and the ledger writer, which is
  // the only reason the two cannot disagree about a customer's bill.
  it('prices an upgrade as the difference and a signup at full price', () => {
    expect(changeCostMinor(null, 'gold')).toBe(priceOf('gold'));
    expect(changeCostMinor('bronze', 'gold')).toBe(90000);
    expect(changeCostMinor('silver', 'gold')).toBe(50000);
    // Standing still costs nothing, which is why the join route refuses it rather than writing a free row.
    expect(changeCostMinor('gold', 'gold')).toBe(0);
    // Clamped, and the clamp should be unreachable: a negative row in an append-only ledger is a refund.
    expect(changeCostMinor('gold', 'bronze')).toBe(0);
  });

  // The period, as arithmetic: one calendar month, and it CLAMPS, because adding a month to 31 January
  // would otherwise roll forward into March.
  it('runs a period for one calendar month, clamped to the last day', () => {
    const on = (iso: string) => periodEndFrom(new Date(iso)).toISOString().slice(0, 10);
    expect(on('2026-08-31T00:00:00.000Z')).toBe('2026-09-30');
    expect(on('2026-01-31T00:00:00.000Z')).toBe('2026-02-28');
    // A leap year takes the 29th: the clamp finds the end of the month rather than subtracting fixed days.
    expect(on('2028-01-31T00:00:00.000Z')).toBe('2028-02-29');
    // An ordinary date is untouched, and December rolls the year.
    expect(on('2026-03-15T00:00:00.000Z')).toBe('2026-04-15');
    expect(on('2026-12-15T00:00:00.000Z')).toBe('2027-01-15');
  });
});

const registerWith = (body: Record<string, unknown>) =>
  request(app)
    .post('/api/v1/auth/register')
    .send({
      email: `${unique('tier')}@example.test`,
      password: 'a-long-enough-password',
      name: 'Founder',
      orgName: `Org ${unique('n')}`,
      industry: 'custom',
      ...body,
    });

describe('register writes the subscription — D-012 repaid', () => {
  it.each([...SIGNUP_TIERS])('puts a new organisation on %s because that is what it picked', async (tier) => {
    const res = await registerWith({ tier });
    expect(res.status).toBe(201);

    const subscription = await prisma.subscription.findUnique({
      where: { orgId: res.body.organization.id as string },
    });
    expect(subscription?.tier).toBe(tier);
    // No trial on this path.
    expect(subscription?.status).toBe('active');
    expect(subscription?.status).not.toBe('trialing');

    // One calendar month, asserted here because registration is one of the places that used to decide
    // the period length for itself. A range rather than an exact figure, because months differ in length.
    const days =
      (subscription!.periodEnd.getTime() - subscription!.periodStart.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);

    // The ledger row, written in the same transaction and priced by the SERVER: the request sends no
    // amount and there is no field to send one in.
    const payments = await prisma.payment.findMany({
      where: { orgId: res.body.organization.id as string },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.kind).toBe('signup');
    expect(payments[0]?.tier).toBe(tier);
    expect(payments[0]?.fromTier).toBeNull();
    expect(payments[0]?.amountMinor).toBe(priceOf(tier));
    expect(payments[0]?.currency).toBe('INR');
  });

  // A client-supplied amount is not an amount: anything but the reference is stripped by validation,
  // and the row is priced from the plan catalogue regardless.
  it('prices the capture itself and ignores anything the client says it paid', async () => {
    const res = await registerWith({ tier: 'gold', amountMinor: 1, priceMinor: 1 });
    expect(res.status).toBe(201);
    const payments = await prisma.payment.findMany({
      where: { orgId: res.body.organization.id as string },
    });
    expect(payments[0]?.amountMinor).toBe(99900);
  });

  // The reference is carried when sent and minted when not - never null either way.
  it('keeps the reference the checkout minted', async () => {
    // Unique per run, because the reference column is unique across the table - which is what stops a
    // double-submitted dialog billing twice.
    const reference = `endur_${unique('ref')}`;
    const res = await registerWith({ tier: 'bronze', paymentRef: reference });
    const payments = await prisma.payment.findMany({
      where: { orgId: res.body.organization.id as string },
    });
    expect(payments[0]?.reference).toBe(reference);

    const without = await registerWith({ tier: 'bronze' });
    const minted = await prisma.payment.findMany({
      where: { orgId: without.body.organization.id as string },
    });
    expect(minted[0]?.reference).toMatch(/^endur_/);
  });

  // No default, and the 422 is the point: a default would have re-created the bug where every
  // organisation sat on one tier chosen by nobody, looking deliberate.
  it('refuses a registration that names no tier', async () => {
    const res = await registerWith({ tier: undefined });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.fields as Array<{ path: string }>;
    expect(fields.map((field) => field.path)).toContain('body.tier');
  });

  it('refuses enterprise from the picker, since nobody may assign themselves it', async () => {
    const res = await registerWith({ tier: 'enterprise' });
    expect(res.status).toBe(422);
  });

  it('refuses a tier that is not a tier', async () => {
    expect((await registerWith({ tier: 'platinum' })).status).toBe(422);
  });

  // The row is written INSIDE registration's transaction, so a failed registration leaves no subscription
  // behind: a billing record for a customer who does not exist is worse than none.
  it('leaves no orphan subscription when the registration fails', async () => {
    // Scoped by NAME rather than a global count, because the suite runs in parallel and other workers
    // are creating organisations at the same time.
    const email = `${unique('dup')}@example.test`;
    const orgName = `Orphan ${unique('n')}`;
    expect((await registerWith({ tier: 'gold', email, orgName })).status).toBe(201);
    // The same address, so the user insert conflicts and the whole transaction rolls back - after the
    // organisation and subscription rows have both been written inside it.
    expect((await registerWith({ tier: 'gold', email, orgName })).status).toBe(409);

    const orgs = await prisma.organization.findMany({ where: { name: orgName }, select: { id: true } });
    expect(orgs).toHaveLength(1);
    const subscriptions = await prisma.subscription.findMany({
      where: { orgId: { in: orgs.map((org) => org.id) } },
    });
    expect(subscriptions).toHaveLength(1);
    // And no orphan capture either: revenue recorded against an organisation that does not exist is the
    // same bug one table over.
    const payments = await prisma.payment.findMany({
      where: { orgId: { in: orgs.map((org) => org.id) } },
    });
    expect(payments).toHaveLength(1);
  });
});

describe('the gate answers with the tier that was chosen — DEC-011, 16 §4', () => {
  // The export route is the one plan-gated route reachable today, so it is where the 402 is proven.
  // The campaign id is a real uuid that does not exist: the gate runs in MIDDLEWARE, before the handler
  // looks anything up, so a 402 here is the gate speaking and a 404 would mean it let the request past.
  const NOWHERE = '00000000-0000-0000-0000-0000000000ee';
  const exportOf = (session: Session) =>
    session.agent.get(`/api/v1/campaigns/${NOWHERE}/export`);

  it('402s a bronze organisation and names silver as the remedy', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const res = await exportOf(founder);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
    expect(res.body.error.details.requiredTier).toBe('silver');
    expect(res.body.error.details.currentTier).toBe('bronze');
  });

  it('lets a silver organisation past the gate', async () => {
    const founder = await registerOrg('custom', 'silver');
    // 404, not 402: the gate opened and the handler could not find a campaign that is not
    // there. Anything other than 402 proves entitlement passed; 404 proves it precisely.
    expect((await exportOf(founder)).status).toBe(404);
  });

  it('lets gold past too, because the tiers nest', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await exportOf(founder)).status).toBe(404);
  });

  // 403 outranks 402, and this is the only test of that ordering anywhere.
  // Never tell somebody to buy an upgrade for something they would not be allowed to use after buying it -
  // besides the bad experience, it tells a prober which features an organisation has not bought.
  it('answers 403 before 402 for a caller who may not export at any price', async () => {
    const founder = await registerOrg('custom', 'bronze');
    await prisma.grant.updateMany({
      where: { orgId: founder.orgId, capability: 'results.export' },
      data: { effect: 'deny' },
    });
    clearGrantCache();
    const res = await exportOf(founder);
    expect(res.status).toBe(403);
  });
});
