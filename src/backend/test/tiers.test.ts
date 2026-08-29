// T-088 — the tier is chosen at sign-up and it is the tier the org is on. DEC-048, 16, 49.
//
// This file did not exist before T-088, which is worth saying plainly: `requireEntitlement`
// has been mounted since T-003 and had NO TESTS AT ALL. That is how D-012 survived a month —
// every organisation silently bronze, every silver and gold surface 402ing for everyone, and
// nothing anywhere asserting that a tier a customer chose is the tier they get.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  CAPABILITIES,
  PLAN_OPTIONS,
  SIGNUP_PLAN_OPTIONS,
  SIGNUP_TIERS,
  TIERS,
  formatMoney,
  priceOf,
  type Capability,
} from '@endur/shared';
import { TIER_ENTITLEMENTS, lowestTierFor, tierIncludes } from '../billing/entitlements.js';
import { app, registerOrg, unique, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

describe('the entitlement map covers the catalogue — 16 §3', () => {
  /**
   * THE TEST THAT WOULD HAVE CAUGHT BOTH BUGS T-088 FOUND.
   *
   * `account.*` (added by T-072) and `billing.*` (added by T-003) were in no tier whatsoever,
   * so `lowestTierFor` returned `undefined` for them and `requireEntitlement` would have
   * refused them at every tier including Enterprise. Neither had fired yet — the account
   * routes are not entitlement-gated and `POST /billing/tier` does not exist — but
   * `billing.update` uncovered means a paywall in front of the upgrade button, which is the
   * one place a 402 can never be correct.
   *
   * A capability in no tier is always a bug, never a decision: the point of the map is that
   * SOMEBODY can use each thing. If a future capability is genuinely operator-only it belongs
   * in `19`'s platform catalogue, which this table does not describe.
   */
  it('leaves no capability in no tier at all', () => {
    const covered = new Set<Capability>(TIERS.flatMap((tier) => [...TIER_ENTITLEMENTS[tier]]));
    const orphans = CAPABILITIES.filter((capability) => !covered.has(capability));
    expect(orphans).toEqual([]);
  });

  /**
   * `lowestTierFor` returns the FIRST tier in `TIERS` order that includes the capability, and
   * that is only the cheapest tier if the tiers nest. A silver-only capability that bronze
   * also held would make the 402's `requiredTier` a lie — it would name a tier the caller is
   * already above.
   */
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

  /**
   * Enterprise is priced individually (`16` §4) — a sales conversation, not a button. It is
   * still a REAL tier: the entitlement map carries it and an operator can set it through
   * `platform.plan.override` (`19` §4). What it is not is self-serve.
   */
  it('shows Enterprise and refuses to let anyone choose it', () => {
    expect(PLAN_OPTIONS.find((plan) => plan.tier === 'enterprise')?.selectable).toBe(false);
    expect(SIGNUP_PLAN_OPTIONS.map((plan) => plan.tier)).toEqual([...SIGNUP_TIERS]);
    expect(SIGNUP_TIERS).not.toContain('enterprise');
  });

  /**
   * THE PRICES, ASSERTED — DEC-080, which supersedes DEC-035.
   *
   * The picker prints these before anybody has a session and the server prices every ledger
   * row from the same table, so a typo here is a wrong price quoted to a customer AND a wrong
   * amount recorded against them. That is a bigger blast radius than the pitch copy this
   * describe block already guards, and it is worth its own assertion rather than a review.
   */
  it('prices the three sellable tiers in paise, ascending', () => {
    const priced = SIGNUP_PLAN_OPTIONS.map((plan) => [plan.tier, plan.priceMinor]);
    expect(priced).toEqual([
      ['bronze', 9900],
      ['silver', 49900],
      ['gold', 99900],
    ]);
    for (const plan of PLAN_OPTIONS) {
      expect(plan.currency).toBe('INR');
      // Integers, always. A float here is a rounding error in a ledger.
      expect(Number.isInteger(plan.priceMinor)).toBe(true);
    }
  });

  /**
   * Enterprise's 0 IS NOT FREE — `16` §4 prices it individually. `selectable: false` is what
   * every reader keys off, and the picker prints "Priced with you" rather than an amount, so
   * nothing may ever render ₹0 out of this row.
   */
  it('leaves Enterprise unpriced rather than free', () => {
    const enterprise = PLAN_OPTIONS.find((plan) => plan.tier === 'enterprise');
    expect(enterprise?.priceMinor).toBe(0);
    expect(enterprise?.selectable).toBe(false);
  });

  /** One formatter, whole rupees while the paise are zero. `49`, `71` and the dialog share it. */
  it('formats money as whole rupees', () => {
    expect(formatMoney(9900)).toBe('₹99');
    expect(formatMoney(99900)).toBe('₹999');
    expect(priceOf('silver')).toBe(49900);
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
    // No trial on this path. DEC-048, and 16 §7 records that DEC-035 is what killed it.
    expect(subscription?.status).toBe('active');
    expect(subscription?.status).not.toBe('trialing');

    // THE LEDGER ROW — DEC-080 — written in the same transaction, PRICED BY THE SERVER.
    // The request above sends no amount and there is no field to send one in.
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

  /**
   * A CLIENT-SUPPLIED AMOUNT IS NOT AN AMOUNT. `paymentRef` is the only payment field the
   * DTO accepts; anything else is stripped by `validate()`, and the row is priced from
   * `PLAN_OPTIONS` regardless. This asserts the property DEC-080 rests on.
   */
  it('prices the capture itself and ignores anything the client says it paid', async () => {
    const res = await registerWith({ tier: 'gold', amountMinor: 1, priceMinor: 1 });
    expect(res.status).toBe(201);
    const payments = await prisma.payment.findMany({
      where: { orgId: res.body.organization.id as string },
    });
    expect(payments[0]?.amountMinor).toBe(99900);
  });

  /** The reference is carried when sent and minted when not — never null either way. */
  it('keeps the reference the checkout minted', async () => {
    // Unique per run — `payments.reference` is unique across the table (that is what stops a
    // double-submitted dialog billing twice), so a literal would pass once and never again.
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

  /**
   * NO DEFAULT, and the 422 is the point. A `.default()` on the DTO would have re-created
   * D-012 exactly — every organisation on one tier, chosen by nobody, looking deliberate.
   */
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

  /**
   * The row is written INSIDE register's transaction, so a registration that fails leaves no
   * subscription behind — the same property register-rollback.test.ts proves for the org. A
   * subscription with no organisation would be a billing record for a customer who does not
   * exist, which is worse than none.
   */
  it('leaves no orphan subscription when the registration fails', async () => {
    // Scoped by NAME rather than by a global count, because vitest runs these files in
    // parallel — a count of every subscription in the database is a count of what the other
    // workers happened to be doing.
    const email = `${unique('dup')}@example.test`;
    const orgName = `Orphan ${unique('n')}`;
    expect((await registerWith({ tier: 'gold', email, orgName })).status).toBe(201);
    // Same address, so the user insert conflicts and the whole transaction rolls back —
    // after the organisation row and the subscription row have both been written inside it.
    expect((await registerWith({ tier: 'gold', email, orgName })).status).toBe(409);

    const orgs = await prisma.organization.findMany({ where: { name: orgName }, select: { id: true } });
    expect(orgs).toHaveLength(1);
    const subscriptions = await prisma.subscription.findMany({
      where: { orgId: { in: orgs.map((org) => org.id) } },
    });
    expect(subscriptions).toHaveLength(1);
    // And no orphan CAPTURE either (DEC-080) — revenue recorded against an organisation
    // that does not exist is the same bug one table over.
    const payments = await prisma.payment.findMany({
      where: { orgId: { in: orgs.map((org) => org.id) } },
    });
    expect(payments).toHaveLength(1);
  });
});

describe('the gate answers with the tier that was chosen — DEC-011, 16 §4', () => {
  /**
   * `GET /campaigns/:id/export` is the one entitlement-gated route that is actually reachable
   * today, so it is where the 402 is proven. The campaign id is a real uuid that does not
   * exist: the entitlement check runs in MIDDLEWARE, before the handler ever looks the
   * campaign up, so a 402 here is the gate speaking and a 404 is the gate having let the
   * request through. That is exactly the distinction being asserted.
   */
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

  /**
   * 403 OUTRANKS 402 — `16` §4's ordering rule, and the only test of it anywhere.
   *
   * Never tell somebody to buy an upgrade for something they would not be allowed to use
   * after buying it. It is a bad experience, and for a competitor probing the API it leaks
   * which features an organisation has not bought from an unauthenticated-adjacent position.
   */
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
