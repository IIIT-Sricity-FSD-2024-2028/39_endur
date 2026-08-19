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
// These tests pin the mitigation, not the eventual fix. Whether an email address is global
// or per-tenant is still open; if it is later made globally unique, step 2 starts failing
// with a 409 and the first test below should be rewritten to assert THAT.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, unique, withCsrf } from './helpers.js';
import { registerOrg } from './helpers.js';
import { prisma } from '../db/client.js';

const PASSWORD = 'a-long-enough-password';

const login = (email: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });

describe('login when one address exists in two organisations — CONF-013', () => {
  it('cannot be locked out by a stranger inviting their address elsewhere', async () => {
    const victim = `${unique('victim')}@example.test`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email: victim, password: PASSWORD, name: 'Victim',
      orgName: `Org A ${unique('a')}`, industry: 'custom',
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
      orgName: `Org A ${unique('a')}`, industry: 'custom',
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
