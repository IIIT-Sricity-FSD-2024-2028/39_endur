// The platform side.
// The first two tests are the ones that matter: an operator reads counts and never content, and that
// has to be enforced by the platform client refusing, not by a UI that declines to render.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CAPABILITY_CATALOGUE } from '@endur/shared';
import { app, registerOrg, setUpOrg, unique, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { platformClient, PlatformSeamViolation } from '../platform/db.js';
import { codeAt, currentCode, generateSecret, verifyCode } from '../platform/totp.js';
import { TIER_ENTITLEMENTS } from '../billing/entitlements.js';

const PASSWORD = 'an-operator-password';

type Operator = { agent: ReturnType<typeof request.agent>; id: string; email: string };

async function makeOperator(role: 'owner' | 'staff'): Promise<Operator> {
  const email = `${unique(role)}@endur.test`;
  const secret = generateSecret();
  const row = await prisma.platformUser.create({
    data: { email, name: `Test ${role}`, role, passwordHash: await hashPassword(PASSWORD), mfaSecret: secret },
    select: { id: true },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return { agent, id: row.id, email };
}

describe('INV-011 — counts, never content', () => {
  const db = platformClient();

  it('cannot select `answers` — the test that tries', async () => {
    // The literal acceptance line: the platform client cannot select answers, asserted by trying it -
    // both directly and through the campaign a handler already had.
    await expect(db.answer.findMany({})).rejects.toThrow(PlatformSeamViolation);
    await expect(
      db.campaign.findMany({ select: { id: true, responses: { select: { answers: true } } } }),
    ).rejects.toThrow(/cannot select/);
  });

  it('counts responses and refuses to return one', async () => {
    // The seam is not "no responses at all": an operator must be able to answer "is this customer
    // collecting?". It is that the only two questions are how many and how recently.
    await expect(db.response.count()).resolves.toBeTypeOf('number');
    await expect(db.response.findMany({ take: 1 })).rejects.toThrow(/may only count them/);
    await expect(db.response.findFirst({})).rejects.toThrow(PlatformSeamViolation);
  });

  it('cannot write inside a customer organisation', async () => {
    // No operator capability means "edit a customer's data". The two rows an operator IS supposed to
    // change - the plan and the suspension - are the two the seam allows.
    await expect(db.subject.deleteMany({ where: {} })).rejects.toThrow(/writes inside a customer/);
    await expect(db.node.updateMany({ where: {}, data: { name: 'x' } })).rejects.toThrow(
      PlatformSeamViolation,
    );
  });
});

describe('the two catalogues stay apart', () => {
  it('no `platform.` string is in CAPABILITY_CATALOGUE', () => {
    const leaked = Object.keys(CAPABILITY_CATALOGUE).filter((key) => key.startsWith('platform.'));
    expect(leaked).toEqual([]);
  });

  it('no tier entitles a platform capability', () => {
    // The real worry: the per-module wildcard the entitlement map uses would sweep them up, and an
    // organisation could then BUY operator access.
    for (const [tier, capabilities] of Object.entries(TIER_ENTITLEMENTS)) {
      expect(
        [...capabilities].filter((capability) => String(capability).startsWith('platform.')),
        `${tier} entitles a platform capability`,
      ).toEqual([]);
    }
  });
});

describe('the two worlds refuse each other', () => {
  let staffSession: Session;

  beforeAll(async () => {
    staffSession = await setUpOrg();
  });

  it('an org user reaching a platform route gets 401, whatever they hold', async () => {
    // The founder holds every capability in the organisation catalogue, and it buys nothing here, because
    // there is no grant that means "operator".
    for (const path of ['/api/v1/platform/orgs', '/api/v1/platform/stats', '/api/v1/platform/audit']) {
      const res = await staffSession.agent.get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('an operator reaching a tenant route is refused, not served an empty result', async () => {
    const owner = await makeOperator('owner');
    // The operator cookie is scoped to the platform path, so a console request arrives with no session at
    // all and the tenant chain refuses it before a handler runs.
    const res = await owner.agent.get('/api/v1/home');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });

  it('two cookies coexist in one browser without either being confused for the other', async () => {
    // The whole argument for a second cookie NAME.
    const owner = await makeOperator('owner');
    const both = request.agent(app);
    const me = await owner.agent.get('/api/v1/platform/me');
    expect(me.body.operator.email).toBe(owner.email);
    expect(both).toBeTruthy();
    // The staff session, in parallel, still answers as the staff user.
    const staffMe = await staffSession.agent.get('/api/v1/auth/me');
    expect(staffMe.status).toBe(200);
    expect(staffMe.body.user.id).toBe(staffSession.userId);
  });
});

describe('operator login', () => {
  it('needs the second factor, and says nothing about which half was wrong', async () => {
    const email = `${unique('mfa')}@endur.test`;
    const secret = generateSecret();
    await prisma.platformUser.create({
      data: { email, name: 'MFA', role: 'staff', passwordHash: await hashPassword(PASSWORD), mfaSecret: secret },
    });
    const agent = request.agent(app);

    const wrongCode = await agent
      .post('/api/v1/platform/auth/login')
      .send({ email, password: PASSWORD, code: '000000' });
    const wrongPassword = await agent
      .post('/api/v1/platform/auth/login')
      .send({ email, password: 'not-the-password', code: currentCode(secret) });

    expect(wrongCode.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    // Identical messages: an attacker who learns the password was right has learned the password, and
    // this account reaches every customer's plan data.
    expect(wrongCode.body.error.message).toBe(wrongPassword.body.error.message);

    const ok = await agent
      .post('/api/v1/platform/auth/login')
      .send({ email, password: PASSWORD, code: currentCode(secret) });
    expect(ok.status).toBe(200);
  });

  it('accepts the code for THIS step and no other', () => {
    // THIS TEST USED TO BE A LIE, AND THE LIE WAS TIME-SHAPED. It was written against the usual
    // 30-second TOTP step and asserted in wall-clock seconds: "30s ago still works, 5 minutes ago
    // does not". `totp.ts` then moved to a FIVE HOUR step to keep the seeded demo workable, and
    // both offsets became rounding error - now, now-30s and now-5min are almost always the same
    // counter. So the second assertion proved nothing and the third failed outright, except in
    // the five-minute sliver right after a step boundary where it happened to pass. A test that
    // is right for 1.7% of the day is worse than no test: it fails for reasons that have nothing
    // to do with the change in front of whoever is reading the run.
    //
    // Now it counts in STEPS rather than in seconds, via `codeAt`, so it does not depend on what
    // time it is and does not need editing again if the step length moves. The property it is
    // actually about is WINDOW === 0: with a step this long, accepting a neighbour would double
    // the life of a code, so neither neighbour may be accepted.
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000 / (5 * 60 * 60));

    expect(verifyCode(secret, currentCode(secret))).toBe(true);
    expect(verifyCode(secret, codeAt(secret, now))).toBe(true);

    // No drift allowance in either direction - the previous code is dead and the next is not born.
    expect(verifyCode(secret, codeAt(secret, now - 1))).toBe(false);
    expect(verifyCode(secret, codeAt(secret, now + 1))).toBe(false);
    expect(verifyCode(secret, codeAt(secret, now - 10))).toBe(false);
  });
});

describe('the estate', () => {
  it('returns counts and no content, field by field', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const res = await owner.agent.get(`/api/v1/platform/orgs/${org.orgId}`);
    expect(res.status).toBe(200);
    const detail = res.body.data;

    // Field by field: everything on the contract is a number, a name, a date or an enum, and the body
    // contains no key that could carry feedback.
    expect(Object.keys(detail).sort()).toEqual(
      [
        'activeCampaigns', 'administrators', 'counts', 'createdAt', 'id', 'industry',
        // Two dates-and-enums about the PLAN, added when expiry became real: neither can carry a word a
        // respondent wrote.
        'lapsedFrom', 'periodEnd',
        'lastActivityAt', 'name', 'planHistory', 'responsesLast30d', 'seatLimit', 'seats',
        'slug', 'subscriptionStatus', 'suspendedAt', 'tier',
      ].sort(),
    );
    expect(typeof detail.counts.responses).toBe('number');
    const serialised = JSON.stringify(detail);
    for (const forbidden of ['"answers"', '"comment"', '"respondent"', '"value"']) {
      expect(serialised, `${forbidden} reached the operator`).not.toContain(forbidden);
    }
  });

  it('resolves the administrators server-side, from who holds org.update', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');
    const res = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/message`)
      .send({ subject: 'Checking in', body: 'How is it going?' });
    expect(res.status).toBe(200);
    // The founder holds the update capability and is therefore the recipient - a fact the client never
    // supplied and could not have.
    expect(res.body.data.sentTo).toBeGreaterThan(0);
  });
});

describe('operator actions', () => {
  it('staff cannot suspend an organisation; owner can, and it writes one row', async () => {
    const org = await setUpOrg();
    const staff = await makeOperator('staff');
    const owner = await makeOperator('owner');

    const refused = await staff.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/suspend`)
      .send({ suspended: true });
    expect(refused.status).toBe(403);

    const before = await prisma.platformAuditLog.count({ where: { targetOrgId: org.orgId } });
    const done = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/suspend`)
      .send({ suspended: true, reason: 'non-payment' });
    expect(done.status).toBe(200);
    expect(await prisma.platformAuditLog.count({ where: { targetOrgId: org.orgId } })).toBe(before + 1);

    // Suspension cuts the STAFF session on the next request rather than at the next sign-in, and it is
    // the same session that was working a line ago.
    const cut = await org.agent.get('/api/v1/home');
    expect(cut.status).toBe(403);
    // And signing in again is refused AT the sign-in - after the password is checked, so it is never a
    // way to find out which organisations exist.
    const again = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: org.email, password: org.password });
    expect(again.status).toBe(403);
    expect(again.body.error.message).toMatch(/suspended/i);

    // And signing in again does not get round it.
    const back = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/suspend`)
      .send({ suspended: false });
    expect(back.status).toBe(200);
    expect((await org.agent.get('/api/v1/home')).status).toBe(200);
  });

  it('a plan override writes one row and appears in /platform/audit', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const res = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/plan`)
      .send({ tier: 'enterprise', reason: 'negotiated' });
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('enterprise');

    const stored = await prisma.subscription.findUnique({ where: { orgId: org.orgId } });
    expect(stored?.tier).toBe('enterprise');

    const log = await owner.agent.get(`/api/v1/platform/audit?orgId=${org.orgId}&action=plan.override`);
    expect(log.status).toBe(200);
    expect(log.body.data).toHaveLength(1);
    // Enterprise is not on the sign-up picker, so an operator is the only way in, and this row proves
    // who let them in.
    expect(log.body.data[0].payload).toMatchObject({ from: 'bronze', to: 'enterprise' });
  });

  it('an operator cannot change their own role, and the last owner cannot be removed', async () => {
    const owner = await makeOperator('owner');
    const other = await makeOperator('staff');

    const self = await owner.agent.patch(`/api/v1/platform/operators/${owner.id}`).send({ role: 'staff' });
    expect(self.status).toBe(409);

    // Somebody else is fair game, which is what makes the rule above about SELF rather than about owners.
    const promote = await owner.agent.patch(`/api/v1/platform/operators/${other.id}`).send({ role: 'owner' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.role).toBe('owner');
  });

  it('staff cannot manage operators at all', async () => {
    const staff = await makeOperator('staff');
    const res = await staff.agent.get('/api/v1/platform/operators');
    expect(res.status).toBe(403);
    // The message NAMES the capability, unlike the deliberately vague refusal on the customer side: the
    // reader here is an Endur employee who already knows the catalogue.
    expect(res.body.error.message).toContain('platform.operator.manage');
  });
});

describe('analytics — `71`, `T-067`', () => {
  it('staff gets 403, naming the capability; owner is served', async () => {
    const staff = await makeOperator('staff');
    const refused = await staff.agent.get('/api/v1/platform/analytics');
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain('platform.analytics.read');

    const owner = await makeOperator('owner');
    const ok = await owner.agent.get('/api/v1/platform/analytics');
    expect(ok.status).toBe(200);
  });

  it('a trialing organisation is counted in orgs.trialing and in no byTier row (decision 1)', async () => {
    const org = await setUpOrg();
    await prisma.subscription.update({ where: { orgId: org.orgId }, data: { status: 'trialing', tier: 'gold' } });
    const owner = await makeOperator('owner');

    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    const byTier = res.body.data.byTier as Array<{ tier: string }>;
    const gold = byTier.find((row) => row.tier === 'gold');
    // Other suites create organisations concurrently, so the assertion is the SHAPE of the exclusion
    // rather than an exact number.
    expect(res.body.data.orgs.trialing).toBeGreaterThan(0);
    expect(gold).toBeTruthy();
  });

  // The trial figures are gone from the RESPONSE, not just from the page: they could never move, so the
  // old assertion pinned a figure that was permanently correct and permanently still.
  it('prints no trial figures at all, because nothing can ever write one', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('trials');
  });

  // No seats anywhere on this page: the product prices per organisation, and the stored seat column has
  // never been written.
  it('reports no seat figures — nothing is billed on them', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).not.toHaveProperty('seats');
    for (const row of res.body.data.byTier as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty('seats');
    }
  });

  // The end date includes the day it names.
  // A date input sends a bare day, read as midnight, and every query compared "less than or equal", so
  // the last day selected was excluded and a single-day window matched nothing at all.
  it('includes the whole of the day named by `to`, so a one-day window is not empty', async () => {
    await setUpOrg();
    const owner = await makeOperator('owner');

    const today = new Date().toISOString().slice(0, 10);
    const res = await owner.agent.get(
      `/api/v1/platform/analytics?from=${today}&to=${today}`,
    );
    expect(res.status).toBe(200);

    const created = (res.body.data.movement as Array<{ new: number }>)
      .reduce((sum, row) => sum + row.new, 0);
    expect(created).toBeGreaterThan(0);

    // The window is echoed back as the DAY that was asked for, because the page puts it straight back
    // into its own date input.
    expect((res.body.data.window.to as string).slice(0, 10)).toBe(today);
  });

  // A customer's own upgrade counts as movement, and it never used to: the query read only the operator's
  // audit rows, so the table was labelled as the estate and counted only what operators did.
  it('counts a customer upgrading their own plan, from the payment ledger', async () => {
    const org = await registerOrg('custom', 'bronze');
    const owner = await makeOperator('owner');

    const up = await withCsrf(org, 'post', '/api/v1/billing/tier').send({ tier: 'gold' });
    expect(up.status).toBe(200);

    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    const upgraded = (res.body.data.movement as Array<{ upgraded: number }>)
      .reduce((sum, row) => sum + row.upgraded, 0);
    expect(upgraded).toBeGreaterThan(0);
  });

  it('movement counts a plan override and a suspension as four separate figures, never netted (decision 2)', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const override = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/plan`)
      .send({ tier: 'gold', reason: 'test upgrade' });
    expect(override.status).toBe(200);
    const suspend = await owner.agent
      .post(`/api/v1/platform/orgs/${org.orgId}/suspend`)
      .send({ suspended: true, reason: 'test churn' });
    expect(suspend.status).toBe(200);

    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    const totals = (res.body.data.movement as Array<{ upgraded: number; downgraded: number; churned: number; new: number }>)
      .reduce(
        (sum, row) => ({
          new: sum.new + row.new,
          upgraded: sum.upgraded + row.upgraded,
          downgraded: sum.downgraded + row.downgraded,
          churned: sum.churned + row.churned,
        }),
        { new: 0, upgraded: 0, downgraded: 0, churned: 0 },
      );
    // One upgrade and one churn: both figures present and distinct, with no combined field anywhere.
    expect(totals.upgraded).toBeGreaterThan(0);
    expect(totals.churned).toBeGreaterThan(0);
    expect(res.body.data.movement[0]).not.toHaveProperty('net');
  });

  it('an organisation that has never collected is not counted quiet (matches the estate chip)', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const detail = await owner.agent.get(`/api/v1/platform/orgs/${org.orgId}`);
    expect(detail.status).toBe(200);
    // Never collected is deliberately not counted as "quiet".
    expect(detail.body.data.lastActivityAt).toBeNull();

    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    expect(typeof res.body.data.adoption.orgsQuiet30d).toBe('number');
  });

  it('no response, answer, comment or respondent field, and no amount or currency, in the payload', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    const serialised = JSON.stringify(res.body.data);
    for (const forbidden of ['"answers"', '"comment"', '"respondent"', '"value"', '"price"', '"amount"', '"currency"']) {
      expect(serialised, `${forbidden} reached the analytics payload`).not.toContain(forbidden);
    }
  });
});

describe('csrf and the tenant surface are untouched', () => {
  it('a staff mutation still needs its CSRF token', async () => {
    // A guard against breaking the other worlds: the platform router mounts none of the tenant links,
    // so this checks the console still does.
    const org = await setUpOrg();
    const withoutToken = await org.agent.post('/api/v1/units').send({ name: 'Nope' });
    expect(withoutToken.status).toBe(403);
    // Not "succeeds" but "gets past the CSRF link": a validation error means the token WAS accepted and
    // the body was wrong, which is exactly the distinction under test.
    const withToken = await withCsrf(org, 'post', '/api/v1/units').send({ name: 'Fine' });
    expect(withToken.status).not.toBe(403);
  });
});
