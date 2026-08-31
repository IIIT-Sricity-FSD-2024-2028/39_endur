// T-100 / T-101 — the two affordances that used to end at the operator. DEC-100, DEC-101.
//
// ONE FILE, BECAUSE THEY ARE ONE FINDING. The operator's console had two controls that
// reported success and reached nobody: a message that wrote to `platform_audit_log` — THE
// OPERATOR'S OWN TABLE — and returned `{ sentTo: 3 }`, and an Enterprise tier the product
// calls "arranged with us" with no way for a customer to ask.
//
// THE ASSERTIONS ARE ON WHAT THE CUSTOMER CAN REACH, never on what the operator was told.
// `{ sentTo: 3 }` was true about a row nobody could read, which is exactly why a test of the
// return value would have passed throughout.
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
    // WHO ASKED, CAPTURED. The row outlives the account (`10` §5), so this is a string on the
    // request rather than a join that could come back null.
    expect(rows[0]?.askedName).toBe('Founder');

    // A PRICE IS NOT A CHECKOUT. Nothing moved and nothing was captured — the customer is not
    // on Enterprise when the dialog closes, and no `payments` row exists to suggest they paid.
    const subscription = await prisma.subscription.findUnique({ where: { orgId: founder.orgId } });
    expect(subscription?.tier).toBe('bronze');
    expect(await prisma.payment.count({ where: { orgId: founder.orgId, tier: 'enterprise' } }))
      .toBe(0);
  });

  /**
   * A SECOND ASK WHILE ONE IS OPEN IS A 409, AND THE DATABASE IS WHAT DECIDES IT.
   *
   * The two requests are fired IN PARALLEL on purpose. A read-then-write check in the handler
   * passes a sequential test and loses to two simultaneous clicks — which is the exact failure
   * the queue exists to prevent, because it leaves the owner ringing the same customer twice.
   * The partial unique index `(org_id) WHERE status = 'open'` cannot lose that race, so this
   * test is written the only way that can tell the two implementations apart.
   */
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
    // THE ROW THAT WAS UPDATED, not the first row of the new status — two requests in one
    // state would otherwise hand the page the wrong customer's name.
    expect(closed.body.data.id).toBe(row!.id);
    expect(closed.body.data.status).toBe('closed');

    // ONE **OPEN** ROW PER ORG, never one row ever. A customer whose request was closed can
    // ask again, and the index says so by keying on `status = 'open'`.
    expect((await ask(founder)).status).toBe(201);
    expect(await prisma.enterpriseRequest.count({ where: { orgId: founder.orgId } })).toBe(2);
  });
});

describe('a message from Endur reaches the customer — DEC-101', () => {
  /**
   * THE BUG, AND IT REPORTED SUCCESS. `messageAdministrators` wrote one `platform_audit_log`
   * row and returned `{ sentTo: n }`. That table is the OPERATOR'S; the customer's
   * administrators had no route that read it and no screen that rendered it.
   *
   * SO THE ASSERTION IS THE CUSTOMER'S OWN GET, driven with the customer's own session. A
   * test on the return value, or on the audit row, would have passed the whole time.
   */
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

    // AND BACK. "I will deal with this later" is a real thing to say about a message from
    // your vendor, and a read mark that cannot be undone makes the first click a decision.
    expect((await withCsrf(org, 'post', `/api/v1/inbox/messages/${id}/unread`).send()).status)
      .toBe(204);
    expect((await org.agent.get('/api/v1/inbox/messages?state=unread')).body.data).toHaveLength(1);
  });

  /**
   * THE STREAM IS THE READER'S, NOT THE ORGANISATION'S. A message addressed to one
   * administrator by name must not be readable by a colleague, and the scope is enforced in
   * the WHERE rather than checked after the read — an id is not an authorisation.
   */
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
  /**
   * THE BUG THIS CLOSES IS A NUMBER THAT WAS ALWAYS ZERO. The owner worked a request to
   * `closed`, went to the organisation's page and set the tier by hand through
   * `platform.plan.override` — and `overridePlan` deliberately writes NO `payments` row. So
   * the one tier the product charges ₹4,999 for earned nothing, and every Enterprise customer
   * was invisible to `/ops/earnings`.
   *
   * THE ASSERTION IS ON THE OWNER'S EARNINGS TOTAL, before and after, because that is the
   * number that was wrong. Asserting the `payments` row alone would pass against a ledger the
   * earnings page filters back out.
   */
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

    // THE PLAN MOVED.
    const subscription = await prisma.subscription.findUnique({ where: { orgId: founder.orgId } });
    expect(subscription?.tier).toBe('enterprise');
    expect(subscription?.status).toBe('active');

    // THE DIFFERENCE WAS CAPTURED — DEC-097, not the full ₹4,999. They already hold Gold for
    // this period, and charging the whole new price would bill the overlap twice.
    const payments = await paymentsOf(founder.orgId);
    const sale = payments[payments.length - 1];
    expect(sale?.kind).toBe('change');
    expect(sale?.tier).toBe('enterprise');
    expect(sale?.fromTier).toBe('gold');
    expect(sale?.amountMinor).toBe(changeCostMinor('gold', 'enterprise'));
    expect(sale?.amountMinor).toBe(499900 - 99900);
    // WHO BOUGHT IT IS THE PERSON WHO ASKED, off the request row — the operator did not buy it.
    expect(sale?.payerName).toBe('Founder');

    // AND IT REACHES THE PAGE THE OWNER READS.
    //
    // ASSERTED ON THIS ORGANISATION'S ROW, never on the estate total. The suite runs in
    // parallel and other files are registering organisations the whole time, so a
    // before-and-after on `lifetimeRevenueMinor` measures them too — it passed alone and
    // failed in the full run, which is the flake this comment exists to stop somebody
    // rewriting back in.
    const after = await owner.get('/api/v1/platform/earnings');
    expect(after.status).toBe(200);
    const mine = (after.body.data.recent as Array<{ orgId: string; tier: string; amountMinor: number }>)
      .find((entry) => entry.orgId === founder.orgId && entry.tier === 'enterprise');
    expect(mine, 'the Enterprise sale must appear on /ops/earnings').toBeTruthy();
    expect(mine?.amountMinor).toBe(changeCostMinor('gold', 'enterprise'));
  });

  /** A second approve is a 409, not a second capture. DEC-096's equal-rank rule, other door. */
  it('refuses to approve an organisation that is already on Enterprise', async () => {
    const founder = await registerOrg('custom', 'silver');
    expect((await ask(founder)).status).toBe(201);
    const owner = await makeOperator('owner');

    const queue = await owner.get('/api/v1/platform/enterprise-requests');
    const row = (queue.body.data as Array<{ id: string; org: { id: string } }>)
      .find((entry) => entry.org.id === founder.orgId);
    expect((await owner.post(`/api/v1/platform/enterprise-requests/${row!.id}/approve`)).status)
      .toBe(200);

    // Ask again (the closed request released the partial unique index), then approve again.
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

  /** Staff cannot approve. It is the queue's own owner-only verb, not `plan.override`. */
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

  /**
   * `overridePlan` STAYS MONEY-FREE, and that split is the point rather than an oversight: a
   * support action that moved a customer's tier is not a sale, and if it started writing
   * ledger rows an operator fixing a mistake would invent revenue every time.
   */
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

