// F1 and N6 of Mithil/demo_college_run.md, as tests. D-047, N-068.
//
// A quick poll and a suggestion box hang off the per-organisation singleton subject, which
// has NO unit (DEC-089). `features/campaigns/visibility.ts` says what that means and every
// campaign reader is supposed to ask it. `features/results/service.ts` carried its OWN copy
// of the predicate, missing the organisation-subject clause, and the two `select`s feeding
// it did not even fetch `subject.type` — so the clause could not have been evaluated had it
// been written there.
//
// The effect was not a corner case. No seeded role holds `results.read` or `response.read`
// at `all` — the widest seeded scope is `subtree` — so `visibility.all` is false for
// EVERYBODY, and the copy's single clause matched nothing. A poll with nine votes answered
// 404 on its own results to the founder of the organisation that created it, while
// `GET /campaigns/:id` answered 200 on the same id one line earlier.
//
// These tests are therefore written as the founder. If they ever need a special role to
// pass, the bug is back.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, setUpOrg, withCsrf, type Session } from './helpers.js';
import { config } from '../lib/config.js';
import { prisma } from '../db/client.js';

const stranger = () => request(app);

/** Analysis is a Silver surface (16 §3), so a test about visibility buys the tier first. */
async function subscribeSilver(orgId: string): Promise<void> {
  const today = new Date();
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { orgId },
    create: { orgId, tier: 'silver', periodStart: today, periodEnd: nextYear, status: 'active' },
    update: { tier: 'silver' },
  });
}

/** A quick campaign with `count` answers through the public link, as a room would. */
async function quickWithResponses(
  founder: Session,
  purpose: 'poll' | 'suggestion',
  count: number,
): Promise<string> {
  const created = await withCsrf(founder, 'post', '/api/v1/campaigns/quick').send({
    purpose,
    name: purpose === 'poll' ? 'Which menu should we keep?' : 'What should we fix first?',
    ...(purpose === 'poll' ? { options: ['North', 'South', 'Both'] } : {}),
  });
  expect(created.status).toBe(201);
  const token = created.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;

  for (let i = 0; i < count; i += 1) {
    const answers = questions.map((question) =>
      question.kind === 'single'
        ? {
            questionId: question.id,
            value: { kind: 'single', option: question.config.options?.[i % 3] ?? '' },
          }
        : { questionId: question.id, value: { kind: 'text', text: `Suggestion ${i + 1}` } },
    );
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers });
    expect(res.status).toBe(201);
  }

  return created.body.data.id as string;
}

describe('a quick poll can be read back by the organisation that created it — F1', () => {
  let founder: Session;
  let pollId: string;

  beforeAll(async () => {
    founder = await setUpOrg();
    pollId = await quickWithResponses(founder, 'poll', config.K_ANON_THRESHOLD + 4);
  });

  it('answers 200 on results, and the counts are the votes that were cast', async () => {
    const detail = await founder.agent.get(`/api/v1/campaigns/${pollId}`);
    expect(detail.status).toBe(200);

    // The exact pair that disagreed: same reader, same id, one second apart.
    const results = await founder.agent.get(`/api/v1/campaigns/${pollId}/results`);
    expect(results.status).toBe(200);
    expect(results.body.data.responseCount).toBe(config.K_ANON_THRESHOLD + 4);
    expect(results.body.data.suppressed).toBe(false);
  });

  it('answers 200 on responses', async () => {
    const responses = await founder.agent.get(`/api/v1/campaigns/${pollId}/responses`);
    expect(responses.status).toBe(200);
  });
});

describe('a suggestion box reaches the inbox — the quieter half of F1', () => {
  let founder: Session;
  let boxId: string;

  beforeAll(async () => {
    founder = await setUpOrg();
    await subscribeSilver(founder.orgId);
    boxId = await quickWithResponses(founder, 'suggestion', config.K_ANON_THRESHOLD + 3);
  });

  it('puts its free-text answers in the comment queue', async () => {
    // Reading comments is the whole stated purpose of the inbox, and a suggestion box is
    // nothing BUT comments. It contributed zero of them.
    const inbox = await founder.agent.get('/api/v1/inbox');
    expect(inbox.status).toBe(200);
    const items = inbox.body.data as Array<{ campaign?: { id?: string } }>;
    expect(items.some((item) => item.campaign?.id === boxId)).toBe(true);
  });

  it('reports its real size to the analysis corpus, not an empty one', async () => {
    const analysis = await founder.agent.get(`/api/v1/analysis?campaignId=${boxId}`);
    expect(analysis.status).toBe(200);
    expect(analysis.body.data.suppressed).toBe(false);
  });
});

describe('/analysis on a campaign the caller may not see answers 404 — N6', () => {
  it('does not report "no data" for "not allowed to see the data"', async () => {
    const one = await setUpOrg();
    const two = await setUpOrg();
    await subscribeSilver(one.orgId);
    await subscribeSilver(two.orgId);
    const pollId = await quickWithResponses(one, 'poll', config.K_ANON_THRESHOLD + 1);

    // `responseCount: 0` for an invisible campaign is a lie about a corpus that exists,
    // and it is the answer that hid F1 for most of a demo run. Every other by-id read in
    // the product answers 404 here, so this one does too.
    const foreign = await two.agent.get(`/api/v1/analysis?campaignId=${pollId}`);
    expect(foreign.status).toBe(404);

    const stillFine = await one.agent.get(`/api/v1/analysis?campaignId=${pollId}`);
    expect(stillFine.status).toBe(200);
  });

  it('keeps "below the threshold" distinct from "not yours" for the reader who owns it', async () => {
    const founder = await setUpOrg();
    await subscribeSilver(founder.orgId);
    const thin = await quickWithResponses(founder, 'poll', 1);
    const res = await founder.agent.get(`/api/v1/analysis?campaignId=${thin}`);
    // Visible, and suppressed. A 404 here would tell the owner their own poll had vanished.
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(true);
    expect(await prisma.campaign.count({ where: { id: thin } })).toBe(1);
  });
});
