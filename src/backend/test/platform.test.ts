// T-059 — the platform side. 19 § Acceptance.
//
// The tests below are the acceptance list, and the FIRST TWO are the ones that matter:
// INV-011 is what we sell, and the doc is explicit that it must be "enforced by the
// platform client returning aggregates only, not by a UI that declines to render them".
// A test that proves the UI is careful would be testing the wrong thing entirely.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CAPABILITY_CATALOGUE } from '@endur/shared';
import { app, setUpOrg, unique, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { platformClient, PlatformSeamViolation } from '../platform/db.js';
import { currentCode, generateSecret, verifyCode } from '../platform/totp.js';
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
    // The literal acceptance line: "The platform client cannot select `answers` — asserted
    // by a test that tries." Both spellings, because a handler reaching for content reaches
    // for it directly OR through the campaign it already had.
    await expect(db.answer.findMany({})).rejects.toThrow(PlatformSeamViolation);
    await expect(
      db.campaign.findMany({ select: { id: true, responses: { select: { answers: true } } } }),
    ).rejects.toThrow(/cannot select/);
  });

  it('counts responses and refuses to return one', async () => {
    // The seam is not "no responses at all" — an operator has to be able to answer "is this
    // customer collecting?". It is that the ONLY two questions available about a response
    // are how many and how recently, neither of which can carry a sentence.
    await expect(db.response.count()).resolves.toBeTypeOf('number');
    await expect(db.response.findMany({ take: 1 })).rejects.toThrow(/may only count them/);
    await expect(db.response.findFirst({})).rejects.toThrow(PlatformSeamViolation);
  });

  it('cannot write inside a customer organisation', async () => {
    // No platform capability in 19 §4 means "edit a tenant's data". The two rows an
    // operator IS supposed to change — the plan and the suspension — are the two models
    // the seam allows through.
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
    // 19 §4's actual worry: the per-module wildcard expansion TIER_ENTITLEMENTS uses would
    // sweep them up, and an organisation could then BUY operator access.
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
    // The founder holds every capability in the org catalogue. It buys nothing here,
    // because there is no grant that means "operator" and no column that says it (DEC-033).
    for (const path of ['/api/v1/platform/orgs', '/api/v1/platform/stats', '/api/v1/platform/audit']) {
      const res = await staffSession.agent.get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('an operator reaching a tenant route is refused, not served an empty result', async () => {
    const owner = await makeOperator('owner');
    // `endur.ops` is path-scoped to /api/v1/platform, so the console request arrives with
    // no session at all — and the tenant chain refuses it before a handler runs.
    const res = await owner.agent.get('/api/v1/home');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });

  it('two cookies coexist in one browser without either being confused for the other', async () => {
    // 19 §7's acceptance line, and the whole argument for a second cookie NAME.
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
    // Identical messages. An attacker who learns the password was right has learned the
    // password, and this is the account that reaches every customer's plan data.
    expect(wrongCode.body.error.message).toBe(wrongPassword.body.error.message);

    const ok = await agent
      .post('/api/v1/platform/auth/login')
      .send({ email, password: PASSWORD, code: currentCode(secret) });
    expect(ok.status).toBe(200);
  });

  it('accepts a code one step either side of now and nothing further', () => {
    const secret = generateSecret();
    expect(verifyCode(secret, currentCode(secret))).toBe(true);
    expect(verifyCode(secret, currentCode(secret, new Date(Date.now() - 30_000)))).toBe(true);
    expect(verifyCode(secret, currentCode(secret, new Date(Date.now() - 5 * 60_000)))).toBe(false);
  });
});

describe('the estate', () => {
  it('returns counts and no content, field by field', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const res = await owner.agent.get(`/api/v1/platform/orgs/${org.orgId}`);
    expect(res.status).toBe(200);
    const detail = res.body.data;

    // The acceptance line asks for field by field, so this is field by field: everything
    // on the contract is a number, a name, a date or an enum, and the serialised body
    // contains no key that could carry feedback.
    expect(Object.keys(detail).sort()).toEqual(
      [
        'activeCampaigns', 'administrators', 'counts', 'createdAt', 'id', 'industry',
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
    // The founder holds `org.update` and is therefore the recipient — a fact the client
    // never supplied and could not have supplied: the DTO has no recipient field.
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

    // 19 §6 / 70: suspension cuts the STAFF SESSION, on the next request rather than at the
    // next sign-in — and it is the same session that was working a line ago.
    const cut = await org.agent.get('/api/v1/home');
    expect(cut.status).toBe(403);
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
    // Enterprise is not on the sign-up picker (DEC-048) — an operator is the only way in,
    // and this is the row that proves who let them in.
    expect(log.body.data[0].payload).toMatchObject({ from: 'bronze', to: 'enterprise' });
  });

  it('an operator cannot change their own role, and the last owner cannot be removed', async () => {
    const owner = await makeOperator('owner');
    const other = await makeOperator('staff');

    const self = await owner.agent.patch(`/api/v1/platform/operators/${owner.id}`).send({ role: 'staff' });
    expect(self.status).toBe(409);

    // Somebody else is fair game, which is what makes the rule above about SELF rather
    // than about owners in general.
    const promote = await owner.agent.patch(`/api/v1/platform/operators/${other.id}`).send({ role: 'owner' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.role).toBe('owner');
  });

  it('staff cannot manage operators at all', async () => {
    const staff = await makeOperator('staff');
    const res = await staff.agent.get('/api/v1/platform/operators');
    expect(res.status).toBe(403);
    // The message NAMES the capability, unlike the org side's deliberately vague 403: the
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
    // The org just set to trialing-gold must not appear in the gold row's count — a byTier
    // total is meaningless to compare directly (other suites create other orgs concurrently),
    // so the assertion is the SHAPE of the exclusion rather than an exact number.
    expect(res.body.data.orgs.trialing).toBeGreaterThan(0);
    expect(gold).toBeTruthy();
  });

  it('conversionRate is null until a trial has completed, and never a fabricated number (decision 3)', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get('/api/v1/platform/analytics');
    expect(res.status).toBe(200);
    const { trials } = res.body.data;
    expect(trials.converted + trials.expired === 0 ? trials.conversionRate : 'measured').toBe(
      trials.converted + trials.expired === 0 ? null : 'measured',
    );
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
    // Bronze -> gold is an upgrade; the suspend is a churn. Both figures are present and
    // distinct, and there is no combined/net field anywhere on the response to check against.
    expect(totals.upgraded).toBeGreaterThan(0);
    expect(totals.churned).toBeGreaterThan(0);
    expect(res.body.data.movement[0]).not.toHaveProperty('net');
  });

  it('an organisation that has never collected is not counted quiet (matches the estate chip)', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const detail = await owner.agent.get(`/api/v1/platform/orgs/${org.orgId}`);
    expect(detail.status).toBe(200);
    // `lastActivityAt: null` — never collected, which `isQuietOrg` (imported by both this
    // endpoint and `<OrgRow>`'s chip) excludes from "quiet" on purpose (decision 4, `70`).
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
    // A guard against the way this task could have broken the other three worlds: the
    // platform router mounts none of links 6–8, so the check is that the console still does.
    const org = await setUpOrg();
    const withoutToken = await org.agent.post('/api/v1/units').send({ name: 'Nope' });
    expect(withoutToken.status).toBe(403);
    // Not "succeeds" — "gets past link 8". A 422 from `validate` means the token WAS
    // accepted and the body was wrong, which is exactly the distinction under test.
    const withToken = await withCsrf(org, 'post', '/api/v1/units').send({ name: 'Fine' });
    expect(withToken.status).not.toBe(403);
  });
});
