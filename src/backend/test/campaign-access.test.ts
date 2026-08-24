// T-069 — `access`, the second axis. DEC-037, 38, 39, 15 §3, 12 §4.10c.
//
// Four properties are worth more than the rest of this file put together, and each has a
// test that fails if the property is removed:
//
//   1. RESOLVE FIRST, GATE SECOND. A bad token against a restricted campaign is
//      byte-identical to a bad token against anything else. Gating first would make a 401
//      mean "this campaign exists".
//   2. THE ANSWER STAYS ANONYMOUS on the authenticated path. This is where somebody would
//      be tempted: the member's id is in scope at the moment the response is written.
//   3. THE AUDIT ROW CARRIES NEITHER ACTOR NOR IP (DEC-045). The submitter is a signed-in
//      user here, so the ordinary rule would have written their name beside a response
//      committed in the same transaction.
//   4. ONE SUBMISSION PER MEMBER, from the PRIMARY KEY and not from a service read.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addStaff, app, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

/** A respondent has no account, no session and no cookie. This agent carries none. */
const stranger = () => request(app);

type Launched = { campaignId: string; token: string };

async function launchedCampaign(
  founder: Session,
  access: 'public' | 'organization',
): Promise<Launched> {
  const sectionA = await unitIdByName(founder.orgId, 'Section A');
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: `Subject ${access}`,
    unitId: sectionA,
  });
  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;

  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: `Feedback (${access})`,
    templateId,
    subjectIds: [subject.body.data.id],
    audience: { kind: 'anyone' },
    access,
  });
  expect(campaign.status).toBe(201);
  expect(campaign.body.data.access).toBe(access);

  const launch = await withCsrf(
    founder,
    'post',
    `/api/v1/campaigns/${campaign.body.data.id}/launch`,
  ).send({});
  expect(launch.status).toBe(200);

  return {
    campaignId: campaign.body.data.id as string,
    token: launch.body.data.publicToken as string,
  };
}

const answersFor = async (agent: request.Agent | ReturnType<typeof stranger>, token: string) => {
  const form = await agent.get(`/api/v1/public/campaigns/${token}`);
  expect(form.status).toBe(200);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;
  return questions.map((question) => {
    switch (question.kind) {
      case 'rating':
        return { questionId: question.id, value: { kind: 'rating', n: 4 } };
      case 'nps':
        return { questionId: question.id, value: { kind: 'nps', n: 9 } };
      case 'yesno':
        return { questionId: question.id, value: { kind: 'yesno', yes: true } };
      case 'single':
        return {
          questionId: question.id,
          value: { kind: 'single', option: question.config.options?.[0] ?? '' },
        };
      case 'multi':
        return {
          questionId: question.id,
          value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] },
        };
      default:
        return { questionId: question.id, value: { kind: 'text', text: 'More worked examples' } };
    }
  });
};

describe('access: the gate, and the order it runs in', () => {
  let founder: Session;
  let member: Session;
  let outsider: Session;
  let open: Launched;
  let restricted: Launched;

  beforeAll(async () => {
    founder = await setUpOrg();
    member = await addStaff(founder.orgId, {
      name: 'Priya',
      level: 3,
      unitName: 'Section A',
    });
    // A different organisation entirely — a real staff session, for somebody else's org.
    outsider = await setUpOrg();
    open = await launchedCampaign(founder, 'public');
    restricted = await launchedCampaign(founder, 'organization');
  });

  it('defaults to public, and a public campaign is unchanged by all of this', async () => {
    const res = await stranger().get(`/api/v1/public/campaigns/${open.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toBe('public');
    // DEC-009 is amended, not overturned. The default, the demo path and every seeded
    // campaign still ask a respondent for nothing at all (15 §3).
  });

  it('refuses a stranger with 401 SIGN_IN_REQUIRED, naming the organisation', async () => {
    const res = await stranger().get(`/api/v1/public/campaigns/${restricted.token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGN_IN_REQUIRED');
    // The prompt has to be able to say WHICH organisation, or "sign in" is not an
    // instruction anybody can follow (39 § States).
    expect(res.body.error.details.organizationName).toBeTruthy();
    // And nothing else. The body carries the display name and no org internals.
    expect(Object.keys(res.body.error.details)).toEqual(['organizationName']);
  });

  it('refuses somebody else\'s staff session with 403 NOT_A_MEMBER', async () => {
    const res = await outsider.agent.get(`/api/v1/public/campaigns/${restricted.token}`);

    // Signed in, genuinely — just not here. A 401 would tell them to do the one thing they
    // have already done.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('renders for a signed-in member', async () => {
    const res = await member.agent.get(`/api/v1/public/campaigns/${restricted.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.access).toBe('organization');
    // Membership is the whole check. Priya holds a level-3 role and no campaign
    // capability; holding more powers would buy her nothing here either (15 §3).
  });

  it('RESOLVES FIRST AND GATES SECOND — a bad token is a 404 either way', async () => {
    // The property the whole ordering exists for. If the gate ran before resolution, a
    // 401 on a nonsense token would mean "that campaign exists and is restricted", and the
    // restricted campaign would become an existence oracle (12 §5, 13 §6).
    const [nonsense, closed] = await Promise.all([
      stranger().get('/api/v1/public/campaigns/ZZZZZZZZ'),
      stranger().get('/api/v1/public/campaigns/QQQQQQQQ'),
    ]);

    for (const res of [nonsense, closed]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('That link is not available.');
    }
  });

  it('a restricted campaign that has CLOSED still 404s a stranger, not 401', async () => {
    // The same rule from the other side: `access` must never be consulted before the
    // campaign has been established as answerable at all. A 401 here would tell an
    // unauthenticated prober that this token is real.
    const finished = await launchedCampaign(founder, 'organization');
    await prisma.campaign.update({
      where: { publicToken: finished.token },
      data: { closedAt: new Date() },
    });

    const res = await stranger().get(`/api/v1/public/campaigns/${finished.token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('gates the SUBMIT route too, not only the form', async () => {
    // A client that ignores the gate and posts anyway is the case that matters — the form
    // being hidden is a courtesy, the submit route being closed is the control.
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${restricted.token}/responses`)
      .send({ answers: [], channel: 'link' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SIGN_IN_REQUIRED');
  });
});

describe('access: what an organization submission writes, and what it does not', () => {
  let founder: Session;
  let member: Session;
  let restricted: Launched;

  beforeAll(async () => {
    founder = await setUpOrg();
    member = await addStaff(founder.orgId, { name: 'Priya', level: 3, unitName: 'Section A' });
    restricted = await launchedCampaign(founder, 'organization');
  });

  it('accepts a member, and records THAT they answered', async () => {
    const res = await member.agent
      .post(`/api/v1/public/campaigns/${restricted.token}/responses`)
      .send({ answers: await answersFor(member.agent, restricted.token), channel: 'link' });

    expect(res.status).toBe(201);
    expect(res.body.data.responseCount).toBe(1);

    const participant = await prisma.campaignParticipant.findUnique({
      where: { campaignId_userId: { campaignId: restricted.campaignId, userId: member.userId } },
    });
    expect(participant).not.toBeNull();
  });

  it('THE ANSWER IS STILL ANONYMOUS — asserted against the live schema (INV-006)', async () => {
    // Run against the AUTHENTICATED path on purpose. This is the one place in the product
    // where the respondent's identity is in scope at the moment the response is written,
    // so it is the one place a column would ever get added.
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'responses'
    `;
    const names = columns.map((c) => c.column_name).sort();
    expect(names).toEqual([
      'campaign_id',
      'channel',
      'duration_ms',
      'id',
      'meta',
      'subject_id',
      'submitted_at',
    ]);
    // Not a user id, not a hashed email, not an IP, not a session fingerprint. The table
    // cannot identify a respondent because it has nothing to identify them with.
    expect(names.join(',')).not.toMatch(/user|respondent|email|ip|session/);
  });

  it('campaign_participants has NO third column — the one that would undo INV-006', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'campaign_participants'
    `;
    // THAT they answered, and when. Never what. A response_id here is the single migration
    // that would join the two halves of the privacy architecture (10 §4.4, 52 §1).
    expect(columns.map((c) => c.column_name).sort()).toEqual([
      'campaign_id',
      'responded_at',
      'user_id',
    ]);
  });

  it('DEC-045 — the audit row carries NEITHER an actor NOR an ip', async () => {
    // The submitter here IS a signed-in user, which is exactly what DEC-040's
    // principal-kind rule could not survive. Without DEC-045:
    //
    //   audit_log   response.submit · campaign X · 14:05:11 · priya · 203.0.113.44
    //   responses            (anon) · campaign X · 14:05:11
    //
    // Sort by time, zip, and the answers have names against them.
    const rows = await prisma.auditLog.findMany({
      where: { action: 'response.submit', targetId: restricted.campaignId },
      select: { actorUserId: true, ip: true },
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actorUserId).toBeNull();
      expect(row.ip).toBeNull();
    }
  });

  it('and the same rule does NOT blind ordinary staff work — the inverted test', async () => {
    // Or the rule above could be satisfied by never writing an actor at all, which would
    // destroy the audit log to protect it. "Who changed this, and from where" is real
    // forensics on the one table that answers it.
    await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Audited subject',
      unitId: await unitIdByName(founder.orgId, 'Section A'),
    });

    const row = await prisma.auditLog.findFirst({
      where: { action: 'subject.create', orgId: founder.orgId },
      orderBy: { createdAt: 'desc' },
      select: { actorUserId: true, ip: true },
    });
    expect(row?.actorUserId).toBe(founder.userId);
    expect(row?.ip).not.toBeNull();
  });

  it('refuses a SECOND submission — and the refusal comes from the primary key', async () => {
    const res = await member.agent
      .post(`/api/v1/public/campaigns/${restricted.token}/responses`)
      .send({ answers: await answersFor(member.agent, restricted.token), channel: 'link' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    // And the response was NOT written. The participant insert runs first inside the
    // transaction precisely so that a duplicate aborts before a response row exists — a
    // check-then-insert would have a race, and this is the one table where losing that
    // race means one person answering twice.
    const count = await prisma.response.count({ where: { campaignId: restricted.campaignId } });
    expect(count).toBe(1);
  });

  it('a public campaign writes NO participant row, even for a signed-in member', async () => {
    const openOne = await launchedCampaign(founder, 'public');
    const res = await member.agent
      .post(`/api/v1/public/campaigns/${openOne.token}/responses`)
      .send({ answers: await answersFor(member.agent, openOne.token), channel: 'link' });

    expect(res.status).toBe(201);
    // Participation privacy is the promise an open link makes (52 §1), and a staff member
    // answering one from their own browser must not quietly give it up.
    const participants = await prisma.campaignParticipant.count({
      where: { campaignId: openOne.campaignId },
    });
    expect(participants).toBe(0);
  });
});

describe('access: immutable after launch — one trigger, two columns', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('can be changed while the campaign is a draft', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Draft subject',
      unitId: sectionA,
    });
    const templates = await founder.agent.get('/api/v1/templates');
    const draft = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Still a draft',
      templateId: (templates.body.data as Array<{ id: string }>)[0]?.id,
      subjectIds: [subject.body.data.id],
      audience: { kind: 'anyone' },
    });
    expect(draft.body.data.access).toBe('public');

    const patched = await withCsrf(
      founder,
      'patch',
      `/api/v1/campaigns/${draft.body.data.id}`,
    ).send({ access: 'organization' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.access).toBe('organization');
  });

  it('cannot be changed once a token is minted — AT THE DATABASE, not the service', async () => {
    const launched = await launchedCampaign(founder, 'organization');

    // Straight past the service layer, which is the point: seeds, imports and the API all
    // write to this table, so the rule lives where every writer must pass through it.
    await expect(
      prisma.campaign.update({
        where: { id: launched.campaignId },
        data: { access: 'public' },
      }),
    ).rejects.toThrow(/access is immutable/);
  });

  it('and `anonymous` is still immutable too — the same trigger, unbroken', async () => {
    const launched = await launchedCampaign(founder, 'public');

    await expect(
      prisma.campaign.update({
        where: { id: launched.campaignId },
        data: { anonymous: false },
      }),
    ).rejects.toThrow(/anonymous is immutable/);
  });

  it('refuses an access value outside the two the product means', async () => {
    // On a DRAFT, deliberately. A launched campaign would be refused by the immutability
    // trigger before the CHECK was ever reached, and the test would pass without proving
    // the constraint exists — which is what it did until this line was fixed.
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Check subject',
      unitId: sectionA,
    });
    const templates = await founder.agent.get('/api/v1/templates');
    const draft = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Unlaunched',
      templateId: (templates.body.data as Array<{ id: string }>)[0]?.id,
      subjectIds: [subject.body.data.id],
      audience: { kind: 'anyone' },
    });

    // The CHECK constraint, not the Zod schema — a row written by a seed or a migration
    // must not be able to put a mode in front of a client switching on it.
    await expect(
      prisma.$executeRaw`UPDATE campaigns SET access = 'everyone' WHERE id = ${draft.body.data.id}::uuid`,
    ).rejects.toThrow(/campaigns_access_check/);
  });
});

describe('access: the CSRF exemption still holds, for a reason worth stating', () => {
  it('the session cookie is SameSite=Lax, which is what protects the submit route', async () => {
    // The respondent chain carries no csrfProtection, on the argument that these routes
    // hold no ambient authority. DEC-037 gave them some: an `organization` submit route
    // reads a session cookie, and a forged cross-site POST would burn a member's one
    // allowed submission with answers they did not write.
    //
    // `sameSite: 'lax'` is what stops it — a cross-site POST carries no session, so the
    // request arrives as a stranger and is refused with 401. The protection is the
    // COOKIE'S, not the chain's, so the two are coupled and this test says so: loosening
    // this flag to `none` means mounting csrfProtection on the submit route.
    const founder = await setUpOrg();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'wrong-password-entirely' });
    expect(login.status).toBe(401);

    const registered = await request.agent(app).post('/api/v1/auth/register').send({
      email: `csrf-${Date.now()}@example.test`,
      password: 'a-long-enough-password',
      name: 'Cookie Reader',
      orgName: `Org csrf-${Date.now()}`,
      tier: 'bronze',
      industry: 'custom',
    });
    const cookies = registered.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((cookie) => cookie.startsWith('endur.sid'));

    expect(session).toBeDefined();
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/HttpOnly/i);
    expect(founder.orgId).toBeTruthy();
  });
});
