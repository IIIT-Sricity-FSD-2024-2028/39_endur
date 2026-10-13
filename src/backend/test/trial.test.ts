// DEC-116 — a trial, reversing the earlier removal. This file is the ONE place a trial is
// exercised end to end; tiers.test.ts covers creation, lapse.test.ts stays untouched because a
// PAID lapse must keep behaving exactly as it did before a trial existed.
import { describe, expect, it } from 'vitest';
import { priceOf } from '@endur/shared';
import { registerOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

const read = (session: Session) => session.agent.get('/api/v1/billing');
const rowOf = (orgId: string) => prisma.subscription.findUnique({ where: { orgId } });
const paymentsOf = (orgId: string) =>
  prisma.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });

const expirePeriod = async (orgId: string): Promise<void> => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  await prisma.subscription.update({ where: { orgId }, data: { periodEnd: yesterday } });
};

describe('the entitlement gate needs no change for a trial — DEC-116', () => {
  it('opens a Gold surface immediately for an organisation trialing Gold', async () => {
    const founder = await registerOrg('custom', 'gold', true);
    const res = await founder.agent.get('/api/v1/analysis');
    expect(res.status).not.toBe(402);
  });

  it('still 402s a bronze trial for a Gold surface, exactly as a paid bronze org would', async () => {
    const founder = await registerOrg('custom', 'bronze', true);
    const res = await founder.agent.get('/api/v1/analysis');
    expect(res.status).toBe(402);
    expect(res.body.error.details.currentTier).toBe('bronze');
  });
});

describe('a trial that ends unconverted — DEC-116', () => {
  it('moves to bronze, names the trial it lost, and is told apart from a paid lapse', async () => {
    const founder = await registerOrg('custom', 'gold', true);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.lapsedFrom).toBe('gold');
    expect(res.body.data.lapsedFromTrial).toBe(true);

    const row = await rowOf(founder.orgId);
    expect(row?.tier).toBe('bronze');
    expect(row?.status).toBe('active');
    expect(row!.periodEnd.getTime()).toBeGreaterThan(Date.now());

    const rows = await paymentsOf(founder.orgId);
    const expiry = rows.find((payment) => payment.kind === 'trial_expired');
    expect(expiry).toBeDefined();
    expect(expiry?.amountMinor).toBe(0);
    expect(expiry?.fromTier).toBe('gold');
    expect(expiry?.tier).toBe('bronze');

    const audit = await prisma.auditLog.findFirst({
      where: { orgId: founder.orgId, action: 'billing.trial_expire' },
    });
    expect(audit).toBeTruthy();
    expect(audit?.actorUserId).toBeNull();
  });

  // The explicit "these must never be confused" case: a paid lapse, run right next to a trial
  // expiry, must still produce the OLD kind and OLD flag.
  it('is never confused with a paid lapse in the same shape', async () => {
    const paid = await registerOrg('custom', 'gold', false);
    await expirePeriod(paid.orgId);
    const res = await read(paid);
    expect(res.body.data.lapsedFromTrial).toBe(false);

    const rows = await paymentsOf(paid.orgId);
    expect(rows.find((payment) => payment.kind === 'lapse')).toBeDefined();
    expect(rows.find((payment) => payment.kind === 'trial_expired')).toBeUndefined();
  });

  it('rolls a bronze trial forward free, the same way a bronze plan does', async () => {
    const founder = await registerOrg('custom', 'bronze', true);
    await expirePeriod(founder.orgId);

    const res = await read(founder);
    expect(res.body.data.tier).toBe('bronze');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.lapsedFrom).toBeNull();
  });
});

describe('converting mid-trial charges full price — DEC-116', () => {
  it('charges the full destination price, not a diff from the trial tier', async () => {
    const founder = await registerOrg('custom', 'silver', true);
    const converted = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(converted.status).toBe(200);
    expect(converted.body.data.tier).toBe('gold');
    expect(converted.body.data.status).toBe('active');

    const rows = await paymentsOf(founder.orgId);
    const capture = rows[rows.length - 1]!;
    expect(capture.kind).toBe('change');
    expect(capture.amountMinor).toBe(priceOf('gold'));
  });

  it('allows paying for the exact tier being trialed, at full price', async () => {
    const founder = await registerOrg('custom', 'gold', true);
    const converted = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(converted.status).toBe(200);

    const rows = await paymentsOf(founder.orgId);
    expect(rows[rows.length - 1]?.amountMinor).toBe(priceOf('gold'));
  });

  it('allows converting down to a lower tier than the one being trialed', async () => {
    const founder = await registerOrg('custom', 'gold', true);
    const converted = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'bronze' });
    expect(converted.status).toBe(200);
    expect(converted.body.data.tier).toBe('bronze');

    const rows = await paymentsOf(founder.orgId);
    expect(rows[rows.length - 1]?.amountMinor).toBe(priceOf('bronze'));
  });

  // The guard on the guard: an ORDINARY paid org still cannot move down or sideways mid-period.
  it('still refuses an equal or lower tier for a PAID organisation', async () => {
    const founder = await registerOrg('custom', 'gold', false);
    const res = await withCsrf(founder, 'post', '/api/v1/billing/tier').send({ tier: 'bronze' });
    expect(res.status).toBe(409);
  });
});

describe('scheduling a downgrade mid-trial is refused — DEC-116', () => {
  it('409s rather than accepting a promise the server would never honour', async () => {
    const founder = await registerOrg('custom', 'gold', true);
    const res = await withCsrf(founder, 'post', '/api/v1/billing/downgrade').send({ tier: 'bronze' });
    expect(res.status).toBe(409);
  });
});
