// T-022 — the respondent surface. 13 §6, 39, DEC-009, INV-006.
//
// This is the only payload in the product a stranger can reach, so the tests here are
// mostly about what is NOT in it and what cannot be told apart from what.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

/** A respondent has no account, no session and no cookie. This agent carries none. */
const stranger = () => request(app);

async function launchedCampaign(founder: Session, opts: { anonymous?: boolean } = {}) {
  const sectionA = await unitIdByName(founder.orgId, 'Section A');
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: 'Data Structures',
    unitId: sectionA,
  });
  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;

  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: 'Autumn feedback',
    templateId,
    subjectIds: [subject.body.data.id],
    audience: { kind: 'anyone' },
    anonymous: opts.anonymous ?? true,
  });
  const launch = await withCsrf(
    founder,
    'post',
    `/api/v1/campaigns/${campaign.body.data.id}/launch`,
  ).send({});

  return {
    campaignId: campaign.body.data.id as string,
    subjectId: subject.body.data.id as string,
    token: launch.body.data.publicToken as string,
  };
}

describe('GET /public/campaigns/:token', () => {
  let founder: Session;
  let token = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    ({ token } = await launchedCampaign(founder));
  });

  it('is reachable with no credential at all', async () => {
    const res = await stranger().get(`/api/v1/public/campaigns/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe('Autumn feedback');
  });

  it('returns the whole form in ONE payload', async () => {
    const res = await stranger().get(`/api/v1/public/campaigns/${token}`);
    // No lazy loading, no per-question request. On a venue network a second request is a
    // second chance to fail (39).
    expect(res.body.data.questions).toHaveLength(8);
    expect(res.body.data.estimatedSeconds).toBeGreaterThan(0);
    expect(res.body.data.labels.subject.one).toBe('Module');
  });

  it('contains NO org internals — an explicit key allowlist', async () => {
    const res = await stranger().get(`/api/v1/public/campaigns/${token}`);

    // The allowlist itself, asserted. Adding a key to the payload without adding it here
    // fails the test — which is the whole point of listing rather than excluding (13 §6).
    expect(Object.keys(res.body.data).sort()).toEqual([
      // DEC-037, and it was added HERE first: the allowlist refused the payload until it
      // was, which is the whole point of listing rather than excluding. `access` discloses
      // nothing — reaching this payload means the gate already let you in — and
      // <AccessNotice> needs the anonymous x access PAIR to say which promise is being
      // made (52 §1).
      'access',
      'anonymous',
      'campaignName',
      'estimatedSeconds',
      'labels',
      'organizationName',
      'questions',
      'subjects',
    ]);

    const serialised = JSON.stringify(res.body);
    // No unit names, no role names, no people, no counts, no other campaigns.
    //
    // The org's LABELS are here and belong here — "Module", "Tutor", "Learner" are the
    // words the form is written in, and the whole vocabulary system exists to put them in
    // front of a respondent (INV-001). What must never appear is the structure behind
    // them: which section this sits in, who runs it, how many people have answered.
    expect(serialised).not.toMatch(/Section A|Section B|Founder|Principal/);
    expect(serialised).not.toMatch(/responseCount|orgId|unitId|createdBy/);
  });

  it('answers the same 404 for unknown, unlaunched, closed and expired tokens', async () => {
    const draft = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Never launched',
      templateId: (await founder.agent.get('/api/v1/templates')).body.data[0].id,
      subjectIds: [
        (await founder.agent.get('/api/v1/subjects')).body.data[0].id as string,
      ],
      audience: { kind: 'anyone' },
    });
    expect(draft.status).toBe(201);

    const closed = await launchedCampaign(await setUpOrg());
    await prisma.campaign.update({
      where: { publicToken: closed.token },
      data: { closedAt: new Date() },
    });

    const expired = await launchedCampaign(await setUpOrg());
    await prisma.campaign.update({
      where: { publicToken: expired.token },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });

    const responses = await Promise.all([
      stranger().get('/api/v1/public/campaigns/ZZZZZZZZ'),
      stranger().get(`/api/v1/public/campaigns/${closed.token}`),
      stranger().get(`/api/v1/public/campaigns/${expired.token}`),
    ]);

    // Byte-identical apart from the request id. An existence probe must not be able to
    // tell "wrong token" from "closed campaign" (13 §6).
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('That link is not available.');
    }
  });

  it('allows a cross-origin scan, without credentials', async () => {
    const res = await stranger()
      .get(`/api/v1/public/campaigns/${token}`)
      .set('Origin', 'http://some-phone.example');

    // A QR scan has to work from any network, off any phone. The console's CORS policy
    // refuses unknown origins; this one deliberately does not.
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('POST /public/campaigns/:token/responses', () => {
  let founder: Session;
  let token = '';
  let campaignId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    ({ token, campaignId } = await launchedCampaign(founder));
  });

  const answersFor = async () => {
    const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
    const questions = form.body.data.questions as Array<{
      id: string;
      kind: string;
      config: { options?: string[]; max?: number };
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

  it('accepts a submission from a client holding nothing but the token', async () => {
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers: await answersFor(), channel: 'qr', durationMs: 41_000 });

    expect(res.status).toBe(201);
    // The count the thank-you page shows, read inside the transaction that wrote the row
    // so it agrees with the results page (39).
    expect(res.body.data.responseCount).toBe(1);
  });

  it('stores nothing that could identify the respondent — INV-006', async () => {
    const response = await prisma.response.findFirstOrThrow({
      where: { campaignId },
      select: { id: true, meta: true, channel: true },
    });

    // Straight at the row. There is no respondent column to null out and never will be:
    // the table cannot identify who answered because it has nothing to identify them with.
    const raw = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'select * from responses where id = $1::uuid',
      response.id,
    );
    expect(Object.keys(raw[0] ?? {}).sort()).toEqual([
      'campaign_id',
      'channel',
      'duration_ms',
      'id',
      'meta',
      'subject_id',
      'submitted_at',
    ]);
    expect(response.meta).toEqual({});
  });

  // DEC-040 / D-019. THIS TEST IS THE ONE THAT WOULD HAVE CAUGHT THE LEAK.
  //
  // The response row above has nothing to identify a respondent with, and that was true
  // before this test existed. The link was in a table INV-006 never mentions: flushAudit
  // wrote `ip` for every principal alike, and a submission writes an audit row in the same
  // transaction as the response. Sorting both by time and zipping them gave IPs against
  // answers.
  //
  // Dormant only because nothing read audit_log. 56 is the reader that makes it live.
  it('writes an audit row for the submission that carries NO ip — DEC-040', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'response.submit', targetId: campaignId },
      select: { ip: true, actorUserId: true, action: true, targetId: true },
    });

    // INV-007 still holds: the submission IS recorded. It is deliberately the least
    // informative row in the table.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.ip).toBeNull();
      expect(row.actorUserId).toBeNull();
    }
  });

  // The same rule inverted, and it is not padding: without it, `ip: null` for everybody
  // would pass the test above, and "we never write an IP" is a different (and worse)
  // decision than "we write it only for a principal we can name". 56 renders these rows.
  it('still writes ip for a STAFF mutation, so the rule is narrow and not a blanket', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const created = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Audit IP probe',
      unitId: sectionA,
    });
    expect(created.status).toBe(201);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { orgId: founder.orgId, targetId: created.body.data.id as string },
      select: { ip: true, actorUserId: true },
      orderBy: { id: 'desc' },
    });
    expect(row.ip).not.toBeNull();
    expect(row.actorUserId).not.toBeNull();
  });

  it('writes numeric_value alongside value, not instead of it', async () => {
    const answer = await prisma.answer.findFirstOrThrow({
      where: { response: { campaignId }, question: { kind: 'rating' } },
      select: { value: true, numericValue: true },
    });
    // The results page aggregates on this column rather than extracting
    // (value->>'n')::numeric per row — and it cannot be backfilled honestly later (10 §4.4).
    expect(Number(answer.numericValue)).toBe(4);
    expect(answer.value).toEqual({ kind: 'rating', n: 4 });
  });

  it('refuses an answer that does not fit its own question', async () => {
    const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
    const rating = (form.body.data.questions as Array<{ id: string; kind: string }>).find(
      (question) => question.kind === 'rating',
    );

    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers: [{ questionId: rating?.id, value: { kind: 'rating', n: 9 } }] });

    // Structurally valid — 9 is inside the union's 1..10 — but this question's max is 5.
    // Only the service can know that, because the schema has never seen the question row
    // (14 §4). Same 422 shape either way, so the form renders both identically.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields[0].message).toMatch(/1 to 5/);
  });

  it('names a required question that was left unanswered', async () => {
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers: [] });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/needs an answer/);
  });

  it('creates ONE response when a flaky network retries with the same key', async () => {
    const key = `submit-${Date.now()}`;
    const answers = await answersFor();
    const before = await prisma.response.count({ where: { campaignId } });

    const first = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .set('Idempotency-Key', key)
      .send({ answers });
    const retry = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .set('Idempotency-Key', key)
      .send({ answers });

    expect(first.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    // The case this whole mechanism exists for: a phone on a venue network retries by
    // itself, and a duplicate would corrupt the numbers in front of the evaluator.
    expect(await prisma.response.count({ where: { campaignId } })).toBe(before + 1);
  });

  // The ordering the test above depends on, asserted directly instead of by timing. The row
  // used to be written fire-and-forget AFTER the response went out, so a retry arriving in
  // that gap missed it, ran the handler again and created a second response — the exact
  // duplicate this middleware exists to prevent. It failed intermittently, which is the worst
  // way to own a bug on the one path a phone takes.
  it('has committed the key before the caller is told the submission worked', async () => {
    const key = `commit-${Date.now()}`;
    const answers = await answersFor();

    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .set('Idempotency-Key', key)
      .send({ answers });
    expect(res.status).toBe(201);

    // No waiting, no polling: by the time the response is in hand, the row is readable.
    const row = await prisma.idempotencyKey.findFirst({ where: { key } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe(201);
  });

  it('refuses a submission to a closed campaign, with the same 404 as a bad token', async () => {
    const other = await setUpOrg();
    const closed = await launchedCampaign(other);
    await prisma.campaign.update({
      where: { publicToken: closed.token },
      data: { closedAt: new Date() },
    });

    const res = await stranger()
      .post(`/api/v1/public/campaigns/${closed.token}/responses`)
      .send({ answers: [] });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('That link is not available.');
  });
});

describe('tenant resolution from a public path — N-017', () => {
  it('reads the token after the full prefix, not the segment after /public/', async () => {
    const founder = await setUpOrg();
    const { token } = await launchedCampaign(founder);

    // The earlier pattern captured the literal word "campaigns" and resolved no tenant at
    // all, which was invisible until a public route existed. A 200 here is the fix.
    const res = await stranger().get(`/api/v1/public/campaigns/${token}`);
    expect(res.status).toBe(200);
  });
});
