// A cross-tenant account lockout, found on 2026-08-19 while checking T-031's acceptance
// list and reproduced end-to-end before it was touched. CONF-013.
//
// THE BUG. `users` is unique on `(org_id, email)`, not on `email` (10), and login had no
// organisation to discriminate by — it took `findFirst({ where: { email } })`. So:
//
//   1. Amara registers Org A with amara@example.test and can sign in.
//   2. ANYONE holding `person.create` in ANY other organisation adds a person with that
//      same address. Legal under the schema, and it needs no special privilege.
//   3. That creates an `invited` user row with `passwordHash: null`. `findFirst` matched
//      it, `verifyPassword` failed against a null hash, and Amara — who did nothing and
//      cannot see the other organisation — was locked out of her own account.
//
// Measured: 200 before the invite, 401 after, on one unrelated POST /people.
//
// RESOLVED 2026-08-24 BY DEC-049, which supersedes CONF-013. The address stays PER-TENANT
// and login verifies the password against every activated account on it, capped and oldest
// first. The tests below are no longer pinning a mitigation; they pin the answer.
//
// The second half of this file covers the HONEST collision, which the mitigation left open
// and which was measured rather than theorised before it was fixed: a person with a real
// account in two organisations could only ever sign in to the older one.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, setUpOrg, unique, withCsrf } from './helpers.js';
import { registerOrg } from './helpers.js';
import { prisma } from '../db/client.js';

const PASSWORD = 'a-long-enough-password';

const login = (email: string, password: string = PASSWORD, orgId?: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password, ...(orgId ? { orgId } : {}) });

const tokenFrom = (url: string) => url.split('/activate/')[1] as string;

/**
 * A SECOND, FULLY ACTIVATED account on an address that already has one, built the way a
 * real one is built: create the person, mint the link (T-072), follow it, choose a
 * password. Nothing here is adversarial and nothing needs a privilege an ordinary
 * administrator does not have.
 */
async function secondAccountFor(email: string, password: string): Promise<string> {
  const other = await setUpOrg();
  const person = await withCsrf(other, 'post', '/api/v1/people').send({ name: 'Same Person', email });
  expect(person.status).toBe(201);
  const invite = await withCsrf(other, 'post', `/api/v1/people/${person.body.data.id}/account`).send({});
  expect(invite.status).toBe(201);
  const activated = await request
    .agent(app)
    .post(`/api/v1/auth/activate/${tokenFrom(invite.body.data.url as string)}`)
    .send({ password });
  expect(activated.status).toBe(200);
  return other.orgId;
}

describe('login when one address exists in two organisations — CONF-013', () => {
  it('cannot be locked out by a stranger inviting their address elsewhere', async () => {
    const victim = `${unique('victim')}@example.test`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email: victim, password: PASSWORD, name: 'Victim',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    expect(res.status).toBe(201);
    expect((await login(victim)).status).toBe(200);

    // An unrelated tenant, with nothing but the founder's ordinary permissions.
    const stranger = await registerOrg();
    const invited = await withCsrf(stranger, 'post', '/api/v1/people')
      .send({ name: 'Whoever', email: victim });
    expect(invited.status).toBe(201);

    // Two rows now hold that address, in two organisations.
    const rows = await prisma.user.findMany({ where: { email: victim } });
    expect(rows.length).toBeGreaterThan(1);

    // And the victim can still sign in, to their own organisation.
    const after = await login(victim);
    expect(after.status).toBe(200);
  });

  it('signs the victim in to THEIR organisation, not the stranger\'s', async () => {
    const victim = `${unique('victim')}@example.test`;
    const created = await request(app).post('/api/v1/auth/register').send({
      email: victim, password: PASSWORD, name: 'Victim',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    const ownOrgId = created.body.organization.id as string;

    const stranger = await registerOrg();
    await withCsrf(stranger, 'post', '/api/v1/people').send({ name: 'Whoever', email: victim });

    const agent = request.agent(app);
    expect((await agent.post('/api/v1/auth/login').send({ email: victim, password: PASSWORD })).status)
      .toBe(200);

    // The real test of the fix: landing in the wrong tenant would be far worse than a
    // lockout, so assert the organisation and not merely the status code.
    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.organization.id).toBe(ownOrgId);
  });

  it('never matches an invited row — it has no password and never could be signed in to', async () => {
    const invitee = `${unique('invitee')}@example.test`;
    const org = await registerOrg();
    await withCsrf(org, 'post', '/api/v1/people').send({ name: 'Invitee', email: invitee });

    // Uniform failure, same as an address nobody has ever heard of.
    const attempt = await login(invitee);
    expect(attempt.status).toBe(401);
    expect(attempt.body.error.message).toBe('That email or password is not right.');
  });
});

/**
 * THE HONEST COLLISION — DEC-049, and it was a silent permanent lockout rather than the
 * "ambiguity" CONF-013 described.
 *
 * Measured 2026-08-24, through the real routes, before anything was changed: activate a
 * second account on an address that already had one, choose a password, get signed in by
 * the activation — and then never be able to log in again. The correct password returned
 * 401 forever, because `findFirst` ordered `createdAt asc` only ever compared against the
 * older row. `T-072` made reaching that state one click and a link, the day before.
 */
describe('a person with a real account in two organisations — DEC-049', () => {
  it('can sign in to the one they just activated, not only the older one', async () => {
    const shared = `${unique('both')}@example.test`;
    const OTHER = 'the-other-org-password';

    const first = await request(app).post('/api/v1/auth/register').send({
      email: shared, password: PASSWORD, name: 'Same Person',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    expect(first.status).toBe(201);
    const olderOrgId = first.body.organization.id as string;

    const newerOrgId = await secondAccountFor(shared, OTHER);

    // Two activated rows, two passwords, and BOTH open — each to its own organisation.
    // This returned 401 before DEC-049.
    const toNewer = request.agent(app);
    expect((await toNewer.post('/api/v1/auth/login').send({ email: shared, password: OTHER })).status)
      .toBe(200);
    expect((await toNewer.get('/api/v1/auth/me')).body.organization.id).toBe(newerOrgId);

    const toOlder = request.agent(app);
    expect((await toOlder.post('/api/v1/auth/login').send({ email: shared, password: PASSWORD })).status)
      .toBe(200);
    expect((await toOlder.get('/api/v1/auth/me')).body.organization.id).toBe(olderOrgId);
  });

  /**
   * The one case that needs a question, and it needs one only because the password cannot
   * tell the two apart. Costs nothing on stage: no seeded organisation shares an address.
   */
  it('asks which organisation when the SAME password opens both', async () => {
    const shared = `${unique('same')}@example.test`;

    const first = await request(app).post('/api/v1/auth/register').send({
      email: shared, password: PASSWORD, name: 'Same Person',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    const olderOrgId = first.body.organization.id as string;
    const newerOrgId = await secondAccountFor(shared, PASSWORD);

    const ambiguous = await login(shared);
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error.code).toBe('ACCOUNT_AMBIGUOUS');

    const offered = ambiguous.body.error.details.organizations as Array<{ id: string; name: string }>;
    expect(offered.map((org) => org.id).sort()).toEqual([olderOrgId, newerOrgId].sort());
    // Named, so the choice is answerable. Only ever sent to somebody who has just proved
    // the password for every organisation in the list.
    expect(offered.every((org) => typeof org.name === 'string' && org.name.length > 0)).toBe(true);

    // Answering it signs them in to the one they picked.
    const agent = request.agent(app);
    const answered = await agent
      .post('/api/v1/auth/login')
      .send({ email: shared, password: PASSWORD, orgId: newerOrgId });
    expect(answered.status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).body.organization.id).toBe(newerOrgId);
  });

  /**
   * `orgId` NARROWS, IT NEVER UNLOCKS. It is the answer to a question the server asked, so
   * a wrong one has to fail exactly like a wrong password — same status, same words. If it
   * behaved as a hint that could be tried against other rows it would be a way to probe
   * which organisations an address belongs to.
   */
  it('refuses a wrong orgId exactly as it refuses a wrong password', async () => {
    const shared = `${unique('narrow')}@example.test`;
    await request(app).post('/api/v1/auth/register').send({
      email: shared, password: PASSWORD, name: 'Same Person',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    const elsewhere = await registerOrg();

    const wrongOrg = await login(shared, PASSWORD, elsewhere.orgId);
    expect(wrongOrg.status).toBe(401);
    expect(wrongOrg.body.error.message).toBe('That email or password is not right.');

    const wrongPassword = await login(shared, 'not-the-right-password');
    expect(wrongPassword.body.error.message).toBe(wrongOrg.body.error.message);
  });

  /** A disabled account is not a candidate, so revoking one un-ambiguates the address. */
  it('does not offer a disabled account as a choice', async () => {
    const shared = `${unique('disabled')}@example.test`;
    await request(app).post('/api/v1/auth/register').send({
      email: shared, password: PASSWORD, name: 'Same Person',
      orgName: `Org A ${unique('a')}`, industry: 'custom', tier: 'bronze',
    });
    const newerOrgId = await secondAccountFor(shared, PASSWORD);
    expect((await login(shared)).status).toBe(409);

    await prisma.user.updateMany({
      where: { email: shared, orgId: newerOrgId }, data: { status: 'disabled' },
    });

    // One usable account again, so no question — and it is the one still live.
    const agent = request.agent(app);
    expect((await agent.post('/api/v1/auth/login').send({ email: shared, password: PASSWORD })).status)
      .toBe(200);
    expect((await agent.get('/api/v1/auth/me')).body.organization.id).not.toBe(newerOrgId);
  });
});
