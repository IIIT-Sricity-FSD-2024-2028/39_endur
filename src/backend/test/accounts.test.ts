// Account provisioning, revocation and activation.
// Every test here is written around one property: an administrator never knows a credential that works.
// They mint a link, it is shown once, and the person chooses their own password - otherwise an
// administrator could sign in as somebody else and every audit row would name the wrong person.
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  addStaff,
  app,
  roleIdByLevel,
  setUpOrg,
  unique,
  unitIdByName,
  withCsrf,
  type Session,
} from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';
import { hashInviteToken } from '../auth/inviteToken.js';

// A person with no positions: the common case, and the one that must always work.
async function barePerson(orgId: string, name: string): Promise<{ personId: string; userId: string }> {
  const user = await prisma.user.create({
    data: { orgId, email: `${unique('invitee')}@example.test`, name, status: 'invited' },
    select: { id: true },
  });
  const person = await prisma.node.create({
    data: { orgId, kind: 'person', name, userId: user.id },
    select: { id: true },
  });
  return { personId: person.id, userId: user.id };
}

// Give them a position, so the escalation bound has something to bound.
async function positionAt(orgId: string, personId: string, level: number, unitName: string) {
  const [roleId, unitId] = await Promise.all([
    roleIdByLevel(orgId, level),
    unitIdByName(orgId, unitName),
  ]);
  const position = await prisma.node.create({
    data: { orgId, kind: 'position', name: `L${level} @ ${unitName}`, roleId, unitId },
    select: { id: true },
  });
  await prisma.edge.create({
    data: { orgId, type: 'member', parentId: personId, childId: position.id, isPrimary: true },
  });
  clearGrantCache();
}

const tokenFrom = (url: string): string => url.slice(url.lastIndexOf('/') + 1);

describe('provisioning — the key, not the powers', () => {
  let founder: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
  });

  it('mints a link for somebody with no positions at all', async () => {
    const { personId } = await barePerson(founder.orgId, 'Newcomer');

    const res = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});

    expect(res.status).toBe(201);
    expect(res.body.data.personName).toBe('Newcomer');
    expect(res.body.data.url).toMatch(/\/activate\/[0-9A-Za-z]{43}$/);
    // 7 days, asserted as a window rather than an exact millisecond.
    const days = (Date.parse(res.body.data.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  // Only the hash of the token is stored, checked by searching the whole row for the plaintext.
  it('stores only the hash, so the link cannot be recovered from the database', async () => {
    const { personId, userId } = await barePerson(founder.orgId, 'Newcomer');
    const res = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});
    const token = tokenFrom(res.body.data.url as string);

    const row = await prisma.accountInvite.findFirstOrThrow({ where: { userId } });
    expect(row.tokenHash).toBe(hashInviteToken(token));
    // The plaintext appears nowhere in the row, under any column name.
    expect(JSON.stringify(row)).not.toContain(token);

    // And no read returns it either: the person payload carries the STATE of the account, never the credential.
    const person = await founder.agent.get(`/api/v1/people/${personId}`);
    expect(JSON.stringify(person.body)).not.toContain(token);
    expect(person.body.data.account.state).toBe('invited');
  });

  it('refuses to CREATE for somebody who already signs in, and points at re-issue', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Existing', level: 3, unitName: 'Section A' });
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: staff.userId },
      select: { id: true },
    });

    const res = await withCsrf(founder, 'post', `/api/v1/people/${person.id}/account`).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/re-issue/i);
  });

  // Re-issuing invalidates the previous link, with no window where both work.
  it('re-issuing kills the first link in the statement that creates the second', async () => {
    const { personId, userId } = await barePerson(founder.orgId, 'Newcomer');
    const first = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});
    const firstToken = tokenFrom(first.body.data.url as string);

    const second = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account/reset`).send({});
    const secondToken = tokenFrom(second.body.data.url as string);
    expect(second.status).toBe(201);
    expect(secondToken).not.toBe(firstToken);

    // Exactly one live row, and it is the new one - the unique index is what makes that true.
    const live = await prisma.accountInvite.findMany({ where: { userId, acceptedAt: null } });
    expect(live).toHaveLength(1);
    expect(live[0]?.tokenHash).toBe(hashInviteToken(secondToken));

    const old = await request(app).get(`/api/v1/auth/activate/${firstToken}`);
    expect(old.status).toBe(404);
    const current = await request(app).get(`/api/v1/auth/activate/${secondToken}`);
    expect(current.status).toBe(200);
  });

  it('writes an audit row for each of the three actions, naming the person', async () => {
    const { personId } = await barePerson(founder.orgId, 'Newcomer');
    await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});
    await withCsrf(founder, 'post', `/api/v1/people/${personId}/account/reset`).send({});
    await withCsrf(founder, 'delete', `/api/v1/people/${personId}/account`).send();

    const rows = await prisma.auditLog.findMany({
      where: { orgId: founder.orgId, targetId: personId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, targetType: true, actorUserId: true },
    });
    expect(rows.map((row) => row.action)).toEqual([
      'account.create',
      'account.reset',
      'account.revoke',
    ]);
    expect(rows.every((row) => row.targetType === 'person')).toBe(true);
    // The actor is the administrator: this is not an anonymous action.
    expect(rows.every((row) => row.actorUserId === founder.userId)).toBe(true);
  });
});

describe('INV-012 — provisioning is bounded by the inviter’s own reach', () => {
  let founder: Session;
  let head: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
    // A head of department who provisions their own people and nobody else's, which is the realistic shape.
    head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    clearGrantCache();
  });

  it('lets a head provision somebody in their own department', async () => {
    const { personId } = await barePerson(founder.orgId, 'Junior');
    await positionAt(founder.orgId, personId, 3, 'Section A');

    const res = await withCsrf(head, 'post', `/api/v1/people/${personId}/account`).send({});
    expect(res.status).toBe(201);
  });

  // The hole this closes: the positions were already there and inert, and the account is what turns an
  // org-chart entry into an actor. Without the bound it is an escalation in two legal calls.
  it('refuses to hand a key to somebody who outranks the inviter, and names the power', async () => {
    const { personId } = await barePerson(founder.orgId, 'Registrar');
    // A senior position INSIDE the head's own section, so scope is not what refuses this - the power is.
    await positionAt(founder.orgId, personId, 1, 'Section A');

    const res = await withCsrf(head, 'post', `/api/v1/people/${personId}/account`).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
    expect(typeof res.body.error.details.capability).toBe('string');
    // Nothing was minted: a refusal that left a live link behind would be the whole bug.
    const live = await prisma.accountInvite.count({ where: { orgId: founder.orgId } });
    expect(live).toBe(0);
  });

  it('carries the same bound on the RE-ISSUE route, which 57’s table does not name', async () => {
    const { personId } = await barePerson(founder.orgId, 'Registrar');
    await positionAt(founder.orgId, personId, 1, 'Section A');

    const res = await withCsrf(head, 'post', `/api/v1/people/${personId}/account/reset`).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
  });

  // Order is a security property: run the bound before the visibility check and its refusal becomes a way
  // to find out who outranks you.
  it('404s for a person outside the caller’s scope rather than telling them why', async () => {
    const { personId } = await barePerson(founder.orgId, 'Elsewhere');
    await positionAt(founder.orgId, personId, 1, 'Section B');

    const res = await withCsrf(head, 'post', `/api/v1/people/${personId}/account`).send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('activation — the person sets their own password', () => {
  let founder: Session;
  let personId = '';
  let userId = '';
  let url = '';

  beforeEach(async () => {
    founder = await setUpOrg();
    const bare = await barePerson(founder.orgId, 'Priya Menon');
    personId = bare.personId;
    userId = bare.userId;
    const res = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});
    url = res.body.data.url as string;
  });

  // The page greets the person before asking for a password, because a bare password box reached from a
  // pasted link is indistinguishable from a phishing page.
  it('greets the person by name and names the organisation before asking for anything', async () => {
    const res = await request(app).get(`/api/v1/auth/activate/${tokenFrom(url)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.personName).toBe('Priya Menon');
    expect(typeof res.body.data.organizationName).toBe('string');
    expect(res.body.data.organizationName.length).toBeGreaterThan(0);
    // The email is NOT here: a leaked link must not become an address harvester.
    expect(Object.keys(res.body.data).sort()).toEqual([
      'expiresAt',
      'organizationLogoUrl',
      'organizationName',
      'personName',
    ]);
  });

  it('sets the password, signs them in, and consumes the link', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post(`/api/v1/auth/activate/${tokenFrom(url)}`)
      .send({ password: 'a-long-enough-password' });

    expect(res.status).toBe(200);
    // Signed in already, so nobody lands on a login form right after choosing a password.
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(userId);

    // The link is spent.
    const again = await request(app).get(`/api/v1/auth/activate/${tokenFrom(url)}`);
    expect(again.status).toBe(404);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.status).toBe('active');
    expect(user.passwordHash).not.toBeNull();
    // Stored as a hash, never as the password itself.
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('regenerates the session id — the fixation test, on this route too (15 §2)', async () => {
    const agent = request.agent(app);
    // Get a session cookie BEFORE activating, the way an attacker who could set one would.
    await agent.get('/api/v1/auth/csrf');
    const before = await prisma.$queryRawUnsafe<Array<{ sid: string }>>('SELECT sid FROM sessions');

    await agent
      .post(`/api/v1/auth/activate/${tokenFrom(url)}`)
      .send({ password: 'a-long-enough-password' });

    const after = await prisma.$queryRawUnsafe<Array<{ sid: string }>>(
      "SELECT sid FROM sessions WHERE sess ->> 'userId' = $1",
      userId,
    );
    expect(after).toHaveLength(1);
    expect(before.map((row) => row.sid)).not.toContain(after[0]?.sid);
  });

  // An expired token, a used token and an unknown token all return identical responses.
  it('answers identically for unknown, expired and already-used links', async () => {
    const unknown = 'z'.repeat(43);

    const usedAgent = request.agent(app);
    await usedAgent
      .post(`/api/v1/auth/activate/${tokenFrom(url)}`)
      .send({ password: 'a-long-enough-password' });

    const expiredPerson = await barePerson(founder.orgId, 'Expired');
    const expiredRes = await withCsrf(
      founder, 'post', `/api/v1/people/${expiredPerson.personId}/account`,
    ).send({});
    const expiredToken = tokenFrom(expiredRes.body.data.url as string);
    await prisma.accountInvite.updateMany({
      where: { userId: expiredPerson.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const bodies = await Promise.all(
      [unknown, tokenFrom(url), expiredToken].map(async (token) => {
        const res = await request(app).get(`/api/v1/auth/activate/${token}`);
        return { status: res.status, code: res.body.error.code, message: res.body.error.message };
      }),
    );

    expect(bodies[0]?.status).toBe(404);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  // Two activations of one token at the same moment: one succeeds and one gets the dead end.
  it('lets exactly one of two simultaneous activations through', async () => {
    const token = tokenFrom(url);
    const [a, b] = await Promise.all([
      request(app).post(`/api/v1/auth/activate/${token}`).send({ password: 'password-one-here' }),
      request(app).post(`/api/v1/auth/activate/${token}`).send({ password: 'password-two-here' }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 404]);

    const rows = await prisma.accountInvite.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.acceptedAt).not.toBeNull();
  });

  // The audit row carries no actor and no address, because there was no principal - and there could not
  // have been. The target says who activated, and the request id joins it to the request log.
  it('audits the activation with no actor and no IP, in the INVITING organisation', async () => {
    await request(app)
      .post(`/api/v1/auth/activate/${tokenFrom(url)}`)
      .send({ password: 'a-long-enough-password' });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'account.activate', targetId: personId },
      select: { orgId: true, actorUserId: true, ip: true, requestId: true },
    });
    expect(row.orgId).toBe(founder.orgId);
    expect(row.actorUserId).toBeNull();
    expect(row.ip).toBeNull();
    expect(row.requestId).toBeTruthy();
  });

  // The organisation comes from the TOKEN, ahead of any session in the browser, so a stranger signed in
  // elsewhere cannot drag the audit row into their own organisation.
  it('files the activation under the invite’s organisation even when a stranger is signed in', async () => {
    const other = await setUpOrg();

    await withCsrf(other, 'post', `/api/v1/auth/activate/${tokenFrom(url)}`).send({
      password: 'a-long-enough-password',
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'account.activate', targetId: personId },
      select: { orgId: true },
    });
    expect(row.orgId).toBe(founder.orgId);
    expect(row.orgId).not.toBe(other.orgId);
  });

  it('refuses a password shorter than the stated rule, as a field error', async () => {
    const res = await request(app)
      .post(`/api/v1/auth/activate/${tokenFrom(url)}`)
      .send({ password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.fields[0].path).toBe('body.password');
    // The link is not consumed by a failed attempt.
    const still = await request(app).get(`/api/v1/auth/activate/${tokenFrom(url)}`);
    expect(still.status).toBe(200);
  });
});

describe('revocation — immediate, and it leaves the person standing', () => {
  let founder: Session;
  let victim: Session;
  let personId = '';

  beforeEach(async () => {
    founder = await setUpOrg();
    victim = await addStaff(founder.orgId, { name: 'Leaver', level: 2, unitName: 'Section A' });
    personId = (
      await prisma.node.findFirstOrThrow({
        where: { orgId: founder.orgId, kind: 'person', userId: victim.userId },
        select: { id: true },
      })
    ).id;
  });

  // What cookie sessions buy, spent here: authenticate never reads the account status, so without deleting
  // the sessions a revoked browser would keep working until its session expired.
  it('ends a live session on the very next request', async () => {
    const before = await victim.agent.get('/api/v1/auth/me');
    expect(before.status).toBe(200);

    const res = await withCsrf(founder, 'delete', `/api/v1/people/${personId}/account`).send();
    expect(res.status).toBe(204);

    const after = await victim.agent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });

  it('leaves the person, their positions and their audit rows intact', async () => {
    await withCsrf(founder, 'delete', `/api/v1/people/${personId}/account`).send();

    const person = await founder.agent.get(`/api/v1/people/${personId}`);
    expect(person.status).toBe(200);
    expect(person.body.data.positions.length).toBeGreaterThan(0);
    expect(person.body.data.account.state).toBe('disabled');
    expect(person.body.data.account.disabledAt).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } });
    // There is no old password to restore, which is why re-enabling is a fresh invite.
    expect(user.passwordHash).toBeNull();
    expect(user.status).toBe('disabled');
  });

  it('kills any outstanding invite, because an unaccepted link is an issued credential', async () => {
    const { personId: freshId, userId: freshUserId } = await barePerson(founder.orgId, 'Pending');
    const invite = await withCsrf(founder, 'post', `/api/v1/people/${freshId}/account`).send({});
    const token = tokenFrom(invite.body.data.url as string);

    await withCsrf(founder, 'delete', `/api/v1/people/${freshId}/account`).send();

    const live = await prisma.accountInvite.count({
      where: { userId: freshUserId, acceptedAt: null },
    });
    expect(live).toBe(0);
    const res = await request(app).get(`/api/v1/auth/activate/${token}`);
    expect(res.status).toBe(404);
  });

  it('re-enables through a fresh invite, and clears the disabled date on activation', async () => {
    await withCsrf(founder, 'delete', `/api/v1/people/${personId}/account`).send();
    const again = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account/reset`).send({});
    expect(again.status).toBe(201);

    // Between the re-issue and the activation, the truthful state is "waiting for them".
    const pending = await founder.agent.get(`/api/v1/people/${personId}`);
    expect(pending.body.data.account.state).toBe('invited');

    await request(app)
      .post(`/api/v1/auth/activate/${tokenFrom(again.body.data.url as string)}`)
      .send({ password: 'a-brand-new-password' });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } });
    expect(user.status).toBe('active');
    expect(user.disabledAt).toBeNull();
  });

  // There is no password reset in this product, so an owner revoking their own sign-in would lock the
  // organisation for good.
  it('refuses to let anybody revoke their own sign-in', async () => {
    const own = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: founder.userId },
      select: { id: true },
    });

    const res = await withCsrf(founder, 'delete', `/api/v1/people/${own.id}/account`).send();

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/sign out/i);
    const still = await founder.agent.get('/api/v1/auth/me');
    expect(still.status).toBe(200);
  });

  it('needs `account.revoke`, which the seeded matrix does not give a head of department', async () => {
    const head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    clearGrantCache();

    const res = await withCsrf(head, 'delete', `/api/v1/people/${personId}/account`).send();

    expect(res.status).toBe(403);
    // And the other two verbs ARE theirs, which is the whole reason there are three.
    const junior = await barePerson(founder.orgId, 'Junior');
    await positionAt(founder.orgId, junior.personId, 3, 'Section A');
    const invite = await withCsrf(head, 'post', `/api/v1/people/${junior.personId}/account`).send({});
    expect(invite.status).toBe(201);
  });
});

// The fake revoke: setting a status through the people route was a second way to disable an account,
// behind a weaker capability, and it left live sessions and the password hash alone.
// The administrator saw "disabled" and believed access had ended; the target's browser kept working.
describe('D-024 — there is exactly one way to disable an account', () => {
  it('ignores a status on the person update, and the session survives it', async () => {
    const founder = await setUpOrg();
    const victim = await addStaff(founder.orgId, { name: 'Leaver', level: 3, unitName: 'Section A' });
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: victim.userId },
      select: { id: true },
    });

    const res = await withCsrf(founder, 'patch', `/api/v1/people/${person.id}`).send({
      name: 'Leaver Renamed',
      status: 'disabled',
    });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } });
    // The name change went through; the status did not.
    expect(user.name).toBe('Leaver Renamed');
    expect(user.status).toBe('active');
    expect(user.passwordHash).not.toBeNull();

    // And nothing about their access changed, which is exactly what the route now claims.
    const still = await victim.agent.get('/api/v1/auth/me');
    expect(still.status).toBe(200);
  });
});

describe('the surface itself', () => {
  // An administrator cannot set a password on any route, asserted by enumerating the routes rather than
  // by reading the handlers.
  it('exposes no route that accepts a password for somebody else', async () => {
    const founder = await setUpOrg();
    const { personId } = await barePerson(founder.orgId, 'Newcomer');

    for (const path of [
      `/api/v1/people/${personId}/account`,
      `/api/v1/people/${personId}/account/reset`,
    ]) {
      const res = await withCsrf(founder, 'post', path).send({ password: 'chosen-by-the-admin' });
      expect(res.status).toBe(201);
    }

    // Both calls succeeded and neither set anything: the only way in is still the link.
    const user = await prisma.node.findFirstOrThrow({
      where: { id: personId },
      select: { user: { select: { passwordHash: true } } },
    });
    expect(user.user?.passwordHash).toBeNull();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unused@example.test', password: 'chosen-by-the-admin' });
    expect(login.status).toBe(401);
  });

  it('rate limits activation, per token and per IP', async () => {
    const founder = await setUpOrg();
    const { personId } = await barePerson(founder.orgId, 'Newcomer');
    const invite = await withCsrf(founder, 'post', `/api/v1/people/${personId}/account`).send({});
    const token = tokenFrom(invite.body.data.url as string);

    // Eleven attempts against one token: the bucket is ten per quarter hour.
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await request(app)
        .post(`/api/v1/auth/activate/${token}`)
        .send({ password: 'wrong-length' });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
