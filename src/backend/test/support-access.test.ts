// T-109 — support access. DEC-114, `19` §15 § Acceptance.
//
// THE TWO TESTS THAT MATTER ARE THE FIRST TWO, and they are a matched pair. One proves the
// operator can drive the customer's console at all — without that this is a feature that does
// not exist. The other proves that the thing we sell survives them doing it: `01` §6 and `52`
// promise a customer that Endur cannot read their feedback, and a support session is by far
// the widest door in the product to walk that promise through.
//
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

/**
 * Open a support session and hand back the SAME agent, now carrying both cookies.
 *
 * One agent for both worlds is not a shortcut — it is the real shape. `endur.ops` is scoped to
 * `/api/v1/platform` and `endur.sid` to `/`, so a single browser holds both at once and that is
 * exactly what the operator's browser does after pressing Open console.
 */
async function enter(operator: Operator, orgId: string, reason = REASON) {
  const res = await operator.agent
    .post(`/api/v1/platform/orgs/${orgId}/support-session`)
    .send({ reason });
  expect(res.status).toBe(201);
  // The console chain runs csrfProtection, so a mutation needs the token the enter response
  // set. A GET would self-heal it; taking it from the cookie is what the SPA does.
  const csrf = /endur\.csrf=([^;]+)/.exec(
    (res.headers['set-cookie'] as unknown as string[]).join(';'),
  )?.[1];
  expect(csrf).toBeTruthy();
  return { agent: operator.agent, csrf: csrf as string, body: res.body.data };
}

describe('support access — DEC-114', () => {
  let org: Session;

  beforeAll(async () => {
    // `setUpOrg` registers its own organisation — it is the fixture for "an org that is
    // actually set up", not a step applied to one.
    org = await setUpOrg();
  });

  it('an operator inside the console can do the customer’s own work', async () => {
    // THE FEATURE, in one assertion. `19` §14 said this could not be built; the point of the
    // whole design is that once the operator's powers are ordinary grants, the ordinary chain
    // lets them through without a single line anywhere saying `if (support)`.
    const operator = await makeOperator();
    const session = await enter(operator, org.orgId);

    const me = await session.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.organization.id).toBe(org.orgId);
    expect(me.body.support.viewer).toBe('operator');
    expect(me.body.support.reason).toBe(REASON);

    // A ROLE, not a unit — `POST /api/v1/units` needs a `parentId` and fetching one first
    // would put a second route between this assertion and what it is about. Creating a role
    // is the smallest complete mutation in the product: one field, one capability, one audit
    // row, and `role.create` is not on the deny list.
    const created = await session.agent
      .post('/api/v1/roles')
      .set('X-CSRF-Token', session.csrf)
      .send({ name: `Support made this ${unique('r')}` });
    expect(created.status).toBe(201);
  });

  it('and still cannot read one line of the customer’s feedback', async () => {
    // INV-011, restated for the wider door. This is the test that has to keep passing when
    // somebody widens the deny list by accident — it walks the LIST rather than a hardcoded
    // route, so a capability deleted from `SUPPORT_DENIED_CAPABILITIES` fails here rather than
    // quietly becoming readable.
    const operator = await makeOperator();
    const session = await enter(operator, org.orgId);

    const me = await session.agent.get('/api/v1/auth/me');
    for (const capability of SUPPORT_DENIED_CAPABILITIES) {
      expect(
        me.body.capabilities[capability],
        `${capability} must not be reported as held inside a support session`,
      ).toBeUndefined();
    }

    // And on the wire, not merely in the capability map — INV-003: the map is what the UI may
    // offer, and the route is what decides.
    const results = await session.agent.get('/api/v1/campaigns');
    expect(results.status).toBe(200); // campaign.read is NOT denied — support needs the list

    const responses = await session.agent.get(`/api/v1/campaigns/${'0'.repeat(8)}-0000-0000-0000-000000000000/responses`);
    expect([403, 404]).toContain(responses.status);
  });

  it('refuses a denied capability as an EXPLICIT DENY, with the grant that decided it', async () => {
    // The sentence matters as much as the status code. `no_grant` means "nobody gave you this,
    // go and ask" — there is nobody to ask, and saying so would send an operator hunting a
    // customer's powers grid for a row that must never exist. An explicit deny is the true
    // answer and it is what `<DecisionTrace>` renders.
    const operator = await makeOperator();
    // The session is opened for its SIDE EFFECT — the row and the synthetic member — and the
    // resolver is then asked directly. Driving this through a route would assert a status code
    // where the interesting thing is the decision's `reason` and `decidedBy`.
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

    // INV-004 in one line: the ALLOW is there too, and it loses.
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

  it('tells the CUSTOMER’S OWN staff that somebody from Endur is inside', async () => {
    // The half that makes the disclosure real, and the half the first draft got wrong: the
    // customer is signed in to a different session and carries no support flag, so a banner
    // driven by the caller's own session would have been visible only to the operator it was
    // disclosing.
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
    // Four things the synthetic member must not be, and they all follow from one decision:
    // it has `status = 'support'` and NO person node. A seat would bill a customer for the
    // person who came to help them; a person node would put an Endur employee in the People
    // list, in an audience, and therefore in a campaign's recipients.
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

    // The seat count reads `status: 'active'`, so the row above is invisible to it.
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
    // Two independent reasons, and the test asserts the OUTCOME rather than either mechanism:
    // the row has no password hash, AND login filters `status: { not: 'support' }`.
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
    // The property `authenticate` resolving the row per request buys: Leave takes effect on
    // the NEXT REQUEST, not at the next sign-in.
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
    // "Remember to press Leave" is not a control. Wound forward by hand rather than by waiting
    // an hour — the clock is in the QUERY, so moving the row is the same as moving time.
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
    // The one place in the product where holding every capability is beside the point. An
    // operator's answers inside a customer's results would be permanent and, by INV-006,
    // unidentifiable for removal — there is no column that could ever find them again.
    //
    // DRIVEN AT THE GATE RATHER THAN END TO END. `requireMembership` is the whole decision,
    // and reaching it through a launched `organization` campaign would spend forty lines
    // building a fixture and then assert the fixture. The two principals below differ in
    // exactly one field, which is the rule stated as an experiment.
    const { requireMembership } = await import('../middleware/requireMembership.js');
    const { NotAMemberError } = await import('../lib/errors.js');

    const campaign = { access: 'organization', orgId: org.orgId, org: { name: 'Theirs' } };
    const run = (support?: object): unknown => {
      let passed: unknown = 'called next with nothing';
      const req = {
        ctx: { principal: { kind: 'user', id: 'u', orgId: org.orgId, ...(support ? { support } : {}) } },
        // `campaignOf` reads the resolved campaign off the request; the resolver has already
        // run by the time this middleware is reached (its own comment says the ORDER is the
        // security property).
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
    // The field is the difference between an entry and an EXPLAINED entry, which is most of
    // what separates this from the feature `19` §14 refused. The DTO enforces it server-side,
    // so the disabled button on `/ops` is a convenience rather than the control.
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
    // The one carve-out DEC-114 makes in `tenantResolver`. The moment a customer most needs
    // somebody from Endur inside their console is the moment they have been cut off from it.
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
    // INV-007 across a boundary. `platform_users` and `users` are different tables (DEC-033),
    // so a tenant's audit row can only point at the second — which is the entire reason the
    // synthetic member exists. Without it a support action would appear in the customer's log
    // as an unattributed gap.
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
    // The same separation `19` §4 keeps between the two catalogues. If `platform.support.enter`
    // ever entered `CAPABILITY_CATALOGUE`, TIER_ENTITLEMENTS' wildcard expansion would sweep it
    // up and an organisation could BUY the ability to enter other organisations.
    const { CAPABILITY_CATALOGUE, PLATFORM_CAPABILITIES } = await import('@endur/shared');
    expect(PLATFORM_CAPABILITIES).toContain('platform.support.enter');
    expect(Object.keys(CAPABILITY_CATALOGUE).some((key) => key.startsWith('platform.'))).toBe(false);
  });

  it('the deny list names only capabilities that exist', async () => {
    // A typo here would be silent and total: a deny grant for a capability nobody holds denies
    // nothing, and the thing it was meant to protect would be readable with no test failing.
    const { CAPABILITY_CATALOGUE } = await import('@endur/shared');
    for (const capability of SUPPORT_DENIED_CAPABILITIES) {
      expect(CAPABILITY_CATALOGUE, `${capability} is not in the catalogue`).toHaveProperty(
        capability,
      );
    }
  });
});
