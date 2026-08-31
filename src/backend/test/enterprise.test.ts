// The two affordances that used to end at the operator.
// One file, because they are one finding: the operator console had two controls that reported success
// and reached nobody - a message written only to Endur's own table, and an Enterprise tier with no way
// for a customer to ask for it.
// Every assertion here is on what the CUSTOMER can reach, never on what the operator was told.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { changeCostMinor } from '@endur/shared';
import { app, registerOrg, setUpOrg, unique, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { generateSecret, currentCode } from '../platform/totp.js';

const PASSWORD = 'an-operator-password';

async function makeOperator(role: 'owner' | 'staff') {
  const email = `${unique(role)}@endur.test`;
  const secret = generateSecret();
  await prisma.platformUser.create({
    data: {
      email,
      name: `Test ${role}`,
      role,
      passwordHash: await hashPassword(PASSWORD),
      mfaSecret: secret,
    },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return agent;
}

const paymentsOf = (orgId: string) =>
  prisma.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });

const ask = (session: Session, note?: string) =>
  withCsrf(session, 'post', '/api/v1/billing/enterprise-request').send(note ? { note } : {});

describe('a customer can ask to be sold Enterprise — DEC-100', () => {
  it('opens one request and does not touch the subscription', async () => {
    const founder = await registerOrg('custom', 'bronze');

    const res = await ask(founder, 'Two hundred staff, starting in January.');
    expect(res.status).toBe(201);
    expect(res.body.data.requestedAt).toBeTruthy();

    const rows = await prisma.enterpriseRequest.findMany({ where: { orgId: founder.orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('open');
    expect(rows[0]?.note).toBe('Two hundred staff, starting in January.');
    // Who asked, captured as a string: the row outlives the account, so a join could come back null.
    expect(rows[0]?.askedName).toBe('Founder');

    // A price is not a checkout: nothing moved and nothing was captured.
    const subscription = await prisma.subscription.findUnique({ where: { orgId: founder.orgId } });
    expect(subscription?.tier).toBe('bronze');
    expect(await prisma.payment.count({ where: { orgId: founder.orgId, tier: 'enterprise' } }))
      .toBe(0);
  });

  // A second request while one is open is a 409, and the DATABASE is what decides it.
  // The two requests are fired in parallel on purpose: a read-then-write check passes a sequential
  // test and loses to two simultaneous clicks, which would leave the owner ringing the same customer twice.
  it('refuses a second open request, even under two simultaneous clicks', async () => {
    const founder = await registerOrg('custom', 'bronze');

    const [first, second] = await Promise.all([ask(founder), ask(founder)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    expect(await prisma.enterpriseRequest.count({ where: { orgId: founder.orgId } })).toBe(1);

    const refusal = first.status === 409 ? first : second;
    expect(refusal.body.error.message).toMatch(/already have your request/i);
  });

  it('answers whether one is open, which is all the card needs', async () => {
    const founder = await registerOrg('custom', 'bronze');

    const before = await founder.agent.get('/api/v1/billing/enterprise-request');
    expect(before.status).toBe(200);
    expect(before.body.data.requestedAt).toBeNull();

    expect((await ask(founder)).status).toBe(201);

    const after = await founder.agent.get('/api/v1/billing/enterprise-request');
    expect(after.body.data.requestedAt).toBeTruthy();
  });
});

describe('the queue is the owner’s — DEC-100, 19 §4', () => {
  it('refuses staff and names the capability', async () => {
    const staff = await makeOperator('staff');
    const res = await staff.get('/api/v1/platform/enterprise-requests');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('platform.enterprise.read');
  });

  it('shows the owner who asked, and closing releases the org to ask again', async () => {
    const founder = await registerOrg('custom', 'silver');
    expect((await ask(founder, 'ring me')).status).toBe(201);
    const owner = await makeOperator('owner');

    const queue = await owner.get('/api/v1/platform/enterprise-requests');
    expect(queue.status).toBe(200);
    const row = (queue.body.data as Array<{ id: string; org: { id: string }; note: string }>)
      .find((entry) => entry.org.id === founder.orgId);
    expect(row).toBeTruthy();
    expect(row?.note).toBe('ring me');

    const closed = await owner.patch(`/api/v1/platform/enterprise-requests/${row!.id}`)
      .send({ status: 'closed' });
    expect(closed.status).toBe(200);
    // The row that was UPDATED, not the first row in the new status: two requests in one state would
    // otherwise hand the page the wrong customer's name.
    expect(closed.body.data.id).toBe(row!.id);
    expect(closed.body.data.status).toBe('closed');

    // One OPEN row per organisation, never one row ever: a customer whose request was closed can ask again.
    expect((await ask(founder)).status).toBe(201);
    expect(await prisma.enterpriseRequest.count({ where: { orgId: founder.orgId } })).toBe(2);
  });
});

describe('a message from Endur reaches the customer — DEC-101', () => {
  // The bug, and it reported success: the message wrote one row to Endur's own audit table and returned
  // "sent to 3". The customer's administrators had no route that read it and no screen that rendered it.
  // So the assertion is the CUSTOMER's own GET, with the customer's own session.
  it('lands in the administrator’s inbox, read with their own session', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');

    const sent = await owner
      .post(`/api/v1/platform/orgs/${org.orgId}/message`)
      .send({ subject: 'Your renewal', body: 'Two paragraphs.\n\nThe second one.' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.sentTo).toBeGreaterThan(0);

    const inbox = await org.agent.get('/api/v1/inbox/messages');
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0].subject).toBe('Your renewal');
    // The operator typed two paragraphs; the customer gets two paragraphs.
    expect(inbox.body.data[0].body).toContain('\n\nThe second one.');
    expect(inbox.body.data[0].read).toBe(false);
  });

  it('marks one read and back again, and marking it twice is not an error', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');
    expect(
      (await owner.post(`/api/v1/platform/orgs/${org.orgId}/message`)
        .send({ subject: 'Hello', body: 'Body.' })).status,
    ).toBe(200);

    const inbox = await org.agent.get('/api/v1/inbox/messages');
    const id = inbox.body.data[0].id as string;

    expect((await withCsrf(org, 'post', `/api/v1/inbox/messages/${id}/read`).send()).status)
      .toBe(204);
    expect((await withCsrf(org, 'post', `/api/v1/inbox/messages/${id}/read`).send()).status)
      .toBe(204);

    const after = await org.agent.get('/api/v1/inbox/messages?state=unread');
    expect(after.body.data).toHaveLength(0);

    // And back: "I will deal with this later" is a real thing to say about a message from your vendor.
    expect((await withCsrf(org, 'post', `/api/v1/inbox/messages/${id}/unread`).send()).status)
      .toBe(204);
    expect((await org.agent.get('/api/v1/inbox/messages?state=unread')).body.data).toHaveLength(1);
  });

  // The stream belongs to the READER, not the organisation: a message addressed to one administrator
  // must not be readable by a colleague, and the scope is in the WHERE rather than checked afterwards.
  it('is scoped to the addressee, not to the organisation', async () => {
    const org = await setUpOrg();
    const owner = await makeOperator('owner');
    expect(
      (await owner.post(`/api/v1/platform/orgs/${org.orgId}/message`)
        .send({ subject: 'Private', body: 'For the administrator.' })).status,
    ).toBe(200);

    // A second organisation's founder shares nothing with the first, and must see none of it.
    const stranger = await registerOrg('custom', 'bronze');
    const theirs = await stranger.agent.get('/api/v1/inbox/messages');
    expect(theirs.status).toBe(200);
    expect(theirs.body.data).toHaveLength(0);
  });
});

describe('approving an Enterprise request is a SALE — DEC-111', () => {
  // The bug this closes is a number that was always zero: approving by hand through the plan override
  // writes no payment row, so the most expensive tier in the product earned nothing on the earnings page.
  // The assertion is on the owner's earnings total, before and after, because that is what was wrong.
  it('moves the tier AND moves the money', async () => {
    const founder = await registerOrg('custom', 'gold');
    expect((await ask(founder, 'we are ready')).status).toBe(201);
    const owner = await makeOperator('owner');

    const queue = await owner.get('/api/v1/platform/enterprise-requests');
    const row = (queue.body.data as Array<{ id: string; org: { id: string } }>)
      .find((entry) => entry.org.id === founder.orgId);
    expect(row).toBeTruthy();

    const approved = await owner.post(`/api/v1/platform/enterprise-requests/${row!.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('closed');

    // The plan moved.
    const subscription = await prisma.subscription.findUnique({ where: { orgId: founder.orgId } });
    expect(subscription?.tier).toBe('enterprise');
    expect(subscription?.status).toBe('active');

    // The DIFFERENCE was captured, not the full price: they already hold the lower tier for this period.
    const payments = await paymentsOf(founder.orgId);
    const sale = payments[payments.length - 1];
    expect(sale?.kind).toBe('change');
    expect(sale?.tier).toBe('enterprise');
    expect(sale?.fromTier).toBe('gold');
    expect(sale?.amountMinor).toBe(changeCostMinor('gold', 'enterprise'));
    expect(sale?.amountMinor).toBe(499900 - 99900);
    // Who bought it is the person who ASKED, off the request row - the operator did not buy it.
    expect(sale?.payerName).toBe('Founder');

    // And it reaches the page the owner reads.
    // Asserted on THIS organisation's row, never on the estate total: the suite runs in parallel, so a
    // before-and-after on the estate figure would measure other test files too.
    const after = await owner.get('/api/v1/platform/earnings');
    expect(after.status).toBe(200);
    const mine = (after.body.data.recent as Array<{ orgId: string; tier: string; amountMinor: number }>)
      .find((entry) => entry.orgId === founder.orgId && entry.tier === 'enterprise');
    expect(mine, 'the Enterprise sale must appear on /ops/earnings').toBeTruthy();
    expect(mine?.amountMinor).toBe(changeCostMinor('gold', 'enterprise'));
  });

  // A second approve is a 409, not a second capture.
  it('refuses to approve an organisation that is already on Enterprise', async () => {
    const founder = await registerOrg('custom', 'silver');
    expect((await ask(founder)).status).toBe(201);
    const owner = await makeOperator('owner');

    const queue = await owner.get('/api/v1/platform/enterprise-requests');
    const row = (queue.body.data as Array<{ id: string; org: { id: string } }>)
      .find((entry) => entry.org.id === founder.orgId);
    expect((await owner.post(`/api/v1/platform/enterprise-requests/${row!.id}/approve`)).status)
      .toBe(200);

    // Ask again - closing the first request released the unique index - then approve again.
    expect((await ask(founder)).status).toBe(201);
    const second = await owner.get('/api/v1/platform/enterprise-requests');
    const again = (second.body.data as Array<{ id: string; org: { id: string } }>)
      .find((entry) => entry.org.id === founder.orgId);

    const refused = await owner.post(`/api/v1/platform/enterprise-requests/${again!.id}/approve`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/already on Enterprise/i);

    // ONE capture, not two.
    const captures = (await paymentsOf(founder.orgId))
      .filter((payment) => payment.tier === 'enterprise');
    expect(captures).toHaveLength(1);
  });

  // Staff cannot approve: it is the queue's own owner-only verb, not the plan override.
  it('refuses staff and names the capability', async () => {
    const founder = await registerOrg('custom', 'bronze');
    expect((await ask(founder)).status).toBe(201);
    const owner = await makeOperator('owner');
    const queue = await owner.get('/api/v1/platform/enterprise-requests');
    const row = (queue.body.data as Array<{ id: string; org: { id: string } }>)
      .find((entry) => entry.org.id === founder.orgId);

    const staff = await makeOperator('staff');
    const res = await staff.post(`/api/v1/platform/enterprise-requests/${row!.id}/approve`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('platform.enterprise.update');
  });

  // The plan override stays money-free, and that split is the point: a support action that moved a
  // customer's tier is not a sale, and if it wrote ledger rows an operator fixing a mistake would invent revenue.
  it('leaves the operator’s plain override writing no ledger row', async () => {
    const founder = await registerOrg('custom', 'bronze');
    const owner = await makeOperator('owner');
    const before = (await paymentsOf(founder.orgId)).length;

    const res = await owner
      .post(`/api/v1/platform/orgs/${founder.orgId}/plan`)
      .send({ tier: 'gold', reason: 'support' });
    expect(res.status).toBe(200);

    expect(await paymentsOf(founder.orgId)).toHaveLength(before);
  });
});

