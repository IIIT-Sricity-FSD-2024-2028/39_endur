// Support access.
// The first two tests are a matched pair: one proves the operator can drive the customer's console at
// all, and the other proves the thing we sell survives it - we promise a customer that Endur cannot
// read their feedback, and a support session is the widest door in the product to walk that through.
// Everything after them is the ways in which the door closes.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SUPPORT_DENIED_CAPABILITIES } from '@endur/shared';
import { app, registerOrg, setUpOrg, unique, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { clearGrantCache } from '../authz/index.js';
import { currentCode, generateSecret } from '../platform/totp.js';

const PASSWORD = 'an-operator-password';
const REASON = 'Ticket 418 — their campaign will not launch';

type Operator = { agent: ReturnType<typeof request.agent>; id: string; name: string };

async function makeOperator(role: 'owner' | 'staff' = 'owner'): Promise<Operator> {
  const email = `${unique(role)}@endur.test`;
  const secret = generateSecret();
  const name = `Test ${role}`;
  const row = await prisma.platformUser.create({
    data: { email, name, role, passwordHash: await hashPassword(PASSWORD), mfaSecret: secret },
    select: { id: true },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return { agent, id: row.id, name };
}

// Opens a support session and hands back the SAME agent, now carrying both cookies.
// One agent for both worlds is the real shape: the two cookies are scoped to different paths, so a
// single browser holds both, which is exactly what the operator's browser does.
async function enter(operator: Operator, orgId: string, reason = REASON) {
  const res = await operator.agent
    .post(`/api/v1/platform/orgs/${orgId}/support-session`)
    .send({ reason });
  expect(res.status).toBe(201);
  // The console chain checks CSRF, so a write needs the token the enter response set.
  const csrf = /endur\.csrf=([^;]+)/.exec(
    (res.headers['set-cookie'] as unknown as string[]).join(';'),
  )?.[1];
  expect(csrf).toBeTruthy();
  return { agent: operator.agent, csrf: csrf as string, body: res.body.data };
}

describe('support access — DEC-114', () => {
  let org: Session;

  beforeAll(async () => {
    // The helper registers its own organisation: it is the fixture for "an org that is actually set up".
    org = await setUpOrg();
  });

  it('an operator inside the console can do the customer’s own work', async () => {
    // The feature, in one assertion: once the operator's powers are ordinary grants, the ordinary chain
    // lets them through without a single line anywhere special-casing support.
    const operator = await makeOperator();
    const session = await enter(operator, org.orgId);

    const me = await session.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.organization.id).toBe(org.orgId);
    expect(me.body.support.viewer).toBe('operator');
    expect(me.body.support.reason).toBe(REASON);

    // A role rather than a unit, because creating a role is the smallest complete mutation in the product:
    // one field, one capability, one audit row.
    const created = await session.agent
      .post('/api/v1/roles')
      .set('X-CSRF-Token', session.csrf)
      .send({ name: `Support made this ${unique('r')}` });
    expect(created.status).toBe(201);
  });

  it('and a STAFF operator still cannot read one line of the customer’s feedback', async () => {
    // The counts-never-content rule, restated for the wider door. It walks the deny LIST rather than a
    // hardcoded route, so a capability removed from that list fails here rather than becoming readable.
    // STAFF explicitly, since DEC-115: the list is the support job's, and the owner is not doing that job.
    const operator = await makeOperator('staff');
    const session = await enter(operator, org.orgId);

    const me = await session.agent.get('/api/v1/auth/me');
    for (const capability of SUPPORT_DENIED_CAPABILITIES) {
      expect(
        me.body.capabilities[capability],
        `${capability} must not be reported as held inside a support session`,
      ).toBeUndefined();
    }

    // And on the wire, not merely in the capability map: the map is what the UI may offer, the route decides.
    const results = await session.agent.get('/api/v1/campaigns');
    expect(results.status).toBe(200); // campaign.read is NOT denied — support needs the list

    const responses = await session.agent.get(`/api/v1/campaigns/${'0'.repeat(8)}-0000-0000-0000-000000000000/responses`);
    expect([403, 404]).toContain(responses.status);
  });

  it('refuses a denied capability as an EXPLICIT DENY, with the grant that decided it', async () => {
    // The sentence matters as much as the status code: "nobody gave you this" would send an operator
    // hunting a customer's powers grid for a row that must never exist. An explicit deny is the true answer.
    const operator = await makeOperator('staff');
    // The session is opened for its side effect and the resolver is then asked directly, because the
    // interesting thing here is the decision's reason rather than a status code.
    await enter(operator, org.orgId);
    const { resolve } = await import('../authz/index.js');
    clearGrantCache();

    const support = await prisma.supportSession.findFirst({
      where: { orgId: org.orgId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { userId: true },
    });
    expect(support).toBeTruthy();

    const denied = await resolve({
      orgId: org.orgId,
      userId: support!.userId,
      capability: 'results.read',
      target: { kind: 'org' },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('explicit_deny');
    expect(denied.decidedBy?.via).toBe('support');

    // A deny beats an allow, in one line: the allow is there too, and it loses.
    expect(denied.considered.some((entry) => entry.effect === 'allow')).toBe(true);

    const allowed = await resolve({
      orgId: org.orgId,
      userId: support!.userId,
      capability: 'unit.create',
      target: { kind: 'org' },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.decidedBy?.via).toBe('support');
  });

  it('but an ENDUR OWNER holds every capability there is, results included', async () => {
    // DEC-115, and the bug it fixes: an owner could build a customer's campaign and then not open the
    // page that campaign produced, which made the console useless for the exact person accountable for it.
    // Asserted THREE ways, because the failure was a three-layer one - the capability map the UI renders
    // tabs from, the resolver's own answer, and the route.
    const operator = await makeOperator('owner');
    const session = await enter(operator, org.orgId);

    // 1. The map: nothing is missing from it. Walked against the whole catalogue rather than against the
    // staff deny list, so a capability added tomorrow is covered by this test the day it ships.
    const { CAPABILITIES } = await import('@endur/shared');
    const me = await session.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    const missing = CAPABILITIES.filter((capability) => !me.body.capabilities[capability]);
    expect(missing, `an Endur owner should hold everything, but is missing: ${missing.join(', ')}`)
      .toEqual([]);

    // 2. The resolver: allowed, and by a support grant rather than by some accidental membership.
    clearGrantCache();
    const { resolve } = await import('../authz/index.js');
    const support = await prisma.supportSession.findFirst({
      where: { orgId: org.orgId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { userId: true },
    });
    const decision = await resolve({
      orgId: org.orgId,
      userId: support!.userId,
      capability: 'results.read',
      target: { kind: 'org' },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.decidedBy?.via).toBe('support');
    // No deny was minted at all, which is the actual change - not "an allow that happens to win".
    expect(decision.considered.some((entry) => entry.effect === 'deny')).toBe(false);

    // 3. The wire. A campaign that does not exist answers 404; the point is that it is not a 403.
    const results = await session.agent.get(
      `/api/v1/campaigns/${'0'.repeat(8)}-0000-0000-0000-000000000000/results`,
    );
    expect(results.status).not.toBe(403);
  });

  it('and the owner’s wider door is still disclosed and still recorded', async () => {
    // Widening what the owner may see does NOT widen it quietly. The customer's banner and the register
    // are what make DEC-115 defensible, so they are asserted here rather than assumed.
    const target = await setUpOrg();
    const operator = await makeOperator('owner');
    const entered = await operator.agent
      .post(`/api/v1/platform/orgs/${target.orgId}/support-session`)
      .send({ reason: REASON });
    expect(entered.status).toBe(201);
    // Empty, and empty on purpose: the owner is blocked from nothing.
    expect(entered.body.data.deniedCapabilities).toEqual([]);

    // The customer, in their own session, is still told a stranger is inside.
    const me = await target.agent.get('/api/v1/auth/me');
    expect(me.body.support.viewer).toBe('member');
    expect(me.body.support.operatorName).toBe(operator.name);
  });

  it('tells the CUSTOMER’S OWN staff that somebody from Endur is inside', async () => {
    // The half that makes the disclosure real: the customer is signed in to a different session and carries
    // no support flag, so a banner driven by the caller's own session would be visible only to the operator.
    const other = await registerOrg();
    const operator = await makeOperator();
    await enter(operator, other.orgId, 'Checking their import');

    const me = await other.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.support.viewer).toBe('member');
    expect(me.body.support.operatorName).toBe(operator.name);
    expect(me.body.support.reason).toBe('Checking their import');
  });

  it('costs the customer nothing — no seat, no person, no audience', async () => {
    // Four things the synthetic member must not be, all following from one decision: it has the support
    // status and NO person node - otherwise it would bill a seat and appear in the People list and audiences.
    const target = await setUpOrg();
    const operator = await makeOperator();
    await enter(operator, target.orgId);

    const billing = await target.agent.get('/api/v1/billing');
    expect(billing.status).toBe(200);
    const seatsBefore = billing.body.data.seatBreakdown.activeUsers;

    const supportUsers = await prisma.user.count({
      where: { orgId: target.orgId, status: 'support' },
    });
    expect(supportUsers).toBe(1);

    // The seat count reads active accounts only, so this row is invisible to it.
    const activeUsers = await prisma.user.count({
      where: { orgId: target.orgId, status: 'active' },
    });
    expect(seatsBefore).toBe(activeUsers);

    const personNodes = await prisma.node.count({
      where: { orgId: target.orgId, kind: 'person', user: { status: 'support' } },
    });
    expect(personNodes).toBe(0);
  });

  it('cannot be signed in to through the front door', async () => {
    // Two independent reasons, and the test asserts the OUTCOME rather than either mechanism: the row has
    // no password hash, AND login excludes the support status.
    const target = await registerOrg();
    const operator = await makeOperator();
    await enter(operator, target.orgId);

    const row = await prisma.user.findFirst({
      where: { orgId: target.orgId, status: 'support' },
      select: { email: true, passwordHash: true },
    });
    expect(row?.passwordHash).toBeNull();

    const attempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: row?.email, password: PASSWORD });
    expect(attempt.status).toBe(401);
  });

  it('ends on Leave, and the next request is refused', async () => {
    // What resolving the row per request buys: Leave takes effect on the NEXT request, not at the next login.
    const target = await registerOrg();
    const operator = await makeOperator();
    const session = await enter(operator, target.orgId);

    expect((await session.agent.get('/api/v1/auth/me')).status).toBe(200);

    const left = await session.agent.post('/api/v1/platform/support-session/leave').send({});
    expect(left.status).toBe(200);

    expect((await session.agent.get('/api/v1/auth/me')).status).toBe(401);

    const row = await prisma.supportSession.findFirst({
      where: { orgId: target.orgId },
      orderBy: { startedAt: 'desc' },
      select: { endedAt: true },
    });
    expect(row?.endedAt).not.toBeNull();
  });

  it('expires by itself, holding nothing afterwards', async () => {
    // "Remember to press Leave" is not a control. Wound forward by hand rather than by waiting an hour,
    // because the clock lives in the query.
    const target = await registerOrg();
    const operator = await makeOperator();
    const session = await enter(operator, target.orgId);

    await prisma.supportSession.updateMany({
      where: { orgId: target.orgId, endedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    clearGrantCache();

    expect((await session.agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('is not one of “our own people” — it cannot answer a campaign', async () => {
    // The one place holding every capability is beside the point: an operator's answers inside a customer's
    // results would be permanent and, being anonymous, impossible to find again for removal.
    const { requireMembership } = await import('../middleware/requireMembership.js');
    const { NotAMemberError } = await import('../lib/errors.js');

    const campaign = { access: 'organization', orgId: org.orgId, org: { name: 'Theirs' } };
    const run = (support?: object): unknown => {
      let passed: unknown = 'called next with nothing';
      const req = {
        ctx: { principal: { kind: 'user', id: 'u', orgId: org.orgId, ...(support ? { support } : {}) } },
        // The resolved campaign is read off the request, and the resolver has already run by the time this
        // middleware is reached.
        campaign,
      };
      requireMembership(req as never, {} as never, ((err?: unknown) => {
        if (err) passed = err;
      }) as never);
      return passed;
    };

    expect(run()).toBe('called next with nothing');
    expect(run({ viewer: 'operator', operatorName: 'Op' })).toBeInstanceOf(NotAMemberError);
  });

  it('a reason is required, and it is what the customer reads', async () => {
    // The reason field is the difference between an entry and an EXPLAINED entry, and it is enforced by
    // the request schema, so the disabled button on the operator console is a convenience, not the control.
    const target = await registerOrg();
    const operator = await makeOperator();
    const refused = await operator.agent
      .post(`/api/v1/platform/orgs/${target.orgId}/support-session`)
      .send({ reason: 'looking' });
    expect(refused.status).toBe(422);
  });

  it('writes the entry to the platform’s own register', async () => {
    const target = await registerOrg();
    const operator = await makeOperator();
    await enter(operator, target.orgId);

    const register = await operator.agent
      .get('/api/v1/platform/support-sessions')
      .query({ orgId: target.orgId });
    expect(register.status).toBe(200);
    expect(register.body.data).toHaveLength(1);
    expect(register.body.data[0].reason).toBe(REASON);
    expect(register.body.data[0].active).toBe(true);

    const audit = await prisma.platformAuditLog.findFirst({
      where: { actorId: operator.id, action: 'support.enter', targetOrgId: target.orgId },
    });
    expect(audit).toBeTruthy();
  });

  it('gets into a SUSPENDED organisation, which the customer’s own staff cannot', async () => {
    // The one carve-out in the tenant resolver: the moment a customer most needs somebody from Endur
    // inside their console is the moment they have been cut off from it.
    const target = await registerOrg();
    await prisma.organization.update({
      where: { id: target.orgId },
      data: { suspendedAt: new Date() },
    });

    const staffBlocked = await target.agent.get('/api/v1/auth/me');
    expect(staffBlocked.status).toBe(403);

    const operator = await makeOperator();
    const session = await enter(operator, target.orgId);
    expect((await session.agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('leaves the customer’s OWN audit log naming the operator', async () => {
    // The audit row across a boundary: operator accounts and customer accounts are different tables, so a
    // customer's audit row can only point at the second - which is the entire reason the synthetic member exists.
    const target = await setUpOrg();
    const operator = await makeOperator();
    const session = await enter(operator, target.orgId);

    const created = await session.agent
      .post('/api/v1/roles')
      .set('X-CSRF-Token', session.csrf)
      .send({ name: `Audited ${unique('r')}` });
    expect(created.status).toBe(201);

    const row = await prisma.auditLog.findFirst({
      where: { orgId: target.orgId, action: 'role.create' },
      orderBy: { createdAt: 'desc' },
      select: { actorUserId: true, decidedBy: true, actor: { select: { name: true, status: true } } },
    });
    expect(row?.actor?.status).toBe('support');
    expect(row?.actor?.name).toBe(operator.name);
    expect((row?.decidedBy as { via?: string } | null)?.via).toBe('support');
  });
});

describe('support access — the seam is untouched', () => {
  it('no support capability leaked into the org catalogue', async () => {
    // The same separation kept between the two catalogues: if this capability ever entered the customer
    // catalogue, the plan map's wildcard would sweep it up and an organisation could BUY it.
    const { CAPABILITY_CATALOGUE, PLATFORM_CAPABILITIES } = await import('@endur/shared');
    expect(PLATFORM_CAPABILITIES).toContain('platform.support.enter');
    expect(Object.keys(CAPABILITY_CATALOGUE).some((key) => key.startsWith('platform.'))).toBe(false);
  });

  it('the deny list names only capabilities that exist', async () => {
    // A typo here would be silent and total: a deny for a capability nobody holds denies nothing, and the
    // thing it was meant to protect would be readable with no test failing.
    const { CAPABILITY_CATALOGUE } = await import('@endur/shared');
    for (const capability of SUPPORT_DENIED_CAPABILITIES) {
      expect(CAPABILITY_CATALOGUE, `${capability} is not in the catalogue`).toHaveProperty(
        capability,
      );
    }
  });
});
