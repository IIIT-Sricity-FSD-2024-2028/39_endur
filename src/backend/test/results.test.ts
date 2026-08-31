// Results, and the anonymity gate.
// The gate is the task: below the threshold the per-question data is ABSENT from the body - not
// hidden by the client, not zeroed, not rounded. Everything else here is arithmetic.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, addStaff, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { config } from '../lib/config.js';
import { prisma } from '../db/client.js';

// Export is a paid feature, so an organisation on the free tier gets 402 rather than a file.
// Tests that are about the anonymity gate buy the tier first, or they would prove the plan check and nothing else.
async function subscribeSilver(orgId: string) {
  const today = new Date();
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { orgId },
    create: { orgId, tier: 'silver', periodStart: today, periodEnd: nextYear, status: 'active' },
    update: { tier: 'silver' },
  });
}

const stranger = () => request(app);

async function campaignWithResponses(founder: Session, count: number) {
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
  });
  const campaignId = campaign.body.data.id as string;
  const launch = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});
  const token = launch.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;

  for (let i = 0; i < count; i += 1) {
    const answers = questions.map((question) => {
      switch (question.kind) {
        case 'rating':
          // A spread of scores, so an average of anything is a real average.
          return { questionId: question.id, value: { kind: 'rating', n: ((i * 2) % 5) + 1 } };
        case 'nps':
          return { questionId: question.id, value: { kind: 'nps', n: i % 2 === 0 ? 10 : 3 } };
        case 'yesno':
          return { questionId: question.id, value: { kind: 'yesno', yes: i % 2 === 0 } };
        case 'single':
          return {
            questionId: question.id,
            value: { kind: 'single', option: question.config.options?.[i % 4] ?? '' },
          };
        case 'multi':
          return {
            questionId: question.id,
            value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] },
          };
        default:
          return {
            questionId: question.id,
            value: { kind: 'text', text: `Comment number ${i + 1}` },
          };
      }
    });
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers });
    expect(res.status).toBe(201);
  }

  return { campaignId, token, questions, subjectId: subject.body.data.id as string };
}

describe('the k-anonymity gate — 52 §2', () => {
  it('returns NO per-question data below the threshold', async () => {
    const founder = await setUpOrg();
    const { campaignId } = await campaignWithResponses(founder, config.K_ANON_THRESHOLD - 1);

    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.data.suppressed).toBe(true);
    expect(res.body.data.responseCount).toBe(config.K_ANON_THRESHOLD - 1);

    // Absent from the BODY: not an empty array and not zeroes. A client cannot render what it was never sent.
    expect(res.body.data.questions).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/average|distribution|npsMix/);

    // The threshold travels with the response, so the UI can explain it rather than show an error.
    expect(res.body.data.threshold).toBe(config.K_ANON_THRESHOLD);
  });

  it('suppresses the comments too — free text is the most identifying data there is', async () => {
    const founder = await setUpOrg();
    const { campaignId } = await campaignWithResponses(founder, config.K_ANON_THRESHOLD - 1);

    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/responses`);
    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Comment number/);
  });

  it('suppresses the export, which is a results page you can email', async () => {
    const founder = await setUpOrg();
    const { campaignId } = await campaignWithResponses(founder, config.K_ANON_THRESHOLD - 1);

    // The free tier cannot export at all: a different question with a different remedy, so 402 says
    // "upgrade" where a 403 would say "ask an administrator".
    const unpaid = await founder.agent.get(`/api/v1/campaigns/${campaignId}/export`);
    expect(unpaid.status).toBe(402);

    await subscribeSilver(founder.orgId);
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/export`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Results appear once 5 people have responded/);
    expect(res.text).not.toMatch(/Comment number/);
  });

  it('opens as the threshold response lands', async () => {
    const founder = await setUpOrg();
    const { campaignId } = await campaignWithResponses(founder, config.K_ANON_THRESHOLD);

    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    expect(res.body.data.suppressed).toBe(false);
    expect(res.body.data.questions).toBeDefined();
  });
});

describe('aggregation', () => {
  let founder: Session;
  let campaignId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    ({ campaignId } = await campaignWithResponses(founder, 6));
  });

  it('averages ratings from numeric_value', async () => {
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    const rating = (res.body.data.questions as Array<{ kind: string; average?: number }>).find(
      (question) => question.kind === 'rating',
    );

    expect(rating?.average).toBeGreaterThan(0);
    expect(rating?.average).toBeLessThanOrEqual(5);
  });

  it('reports the NPS mix with valence, because there it is a definition', async () => {
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    const nps = (res.body.data.questions as Array<{
      kind: string;
      npsMix?: { promoters: number; detractors: number; score: number };
      distribution?: Array<{ label: string; valence?: string }>;
    }>).find((question) => question.kind === 'nps');

    expect(nps?.npsMix?.promoters).toBe(3);
    expect(nps?.npsMix?.detractors).toBe(3);
    expect(nps?.npsMix?.score).toBe(0);
    // Good and bad labels appear HERE because the instrument itself names these groups.
    expect(nps?.distribution?.find((row) => row.label === 'Detractors')?.valence).toBe('negative');
  });

  it('never puts valence on a rating, where it would be an inference', async () => {
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    const rating = (res.body.data.questions as Array<{
      kind: string;
      distribution?: Array<{ valence?: string }>;
    }>).find((question) => question.kind === 'rating');

    // Whether a low score is bad depends on the question, so the client must never paint it red just
    // because the arithmetic went down.
    expect(rating?.distribution?.every((row) => row.valence === undefined)).toBe(true);
  });

  it('counts yes/no and choice questions without averaging them', async () => {
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    const questions = res.body.data.questions as Array<{
      kind: string;
      average?: number;
      distribution?: Array<{ label: string; count: number; percent: number }>;
    }>;

    const yesno = questions.find((question) => question.kind === 'yesno');
    expect(yesno?.distribution?.map((row) => row.label)).toEqual(['Yes', 'No']);
    expect(yesno?.average).toBeUndefined();

    const single = questions.find((question) => question.kind === 'single');
    expect((single?.distribution?.length ?? 0)).toBeGreaterThan(1);
    expect(single?.distribution?.reduce((total, row) => total + row.count, 0)).toBe(6);
  });

  it('returns the comments once the gate is open', async () => {
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/responses`);
    expect(res.body.suppressed).toBe(false);
    expect(res.body.meta.total).toBe(6);

    const texts = (res.body.data as Array<{ answers: Array<{ text: string }> }>).flatMap((item) =>
      item.answers.map((answer) => answer.text),
    );
    expect(texts.some((text) => text.startsWith('Comment number'))).toBe(true);
  });

  it('exports a CSV with one row per response and no respondent column', async () => {
    await subscribeSilver(founder.orgId);
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/export`);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(7);
    // The organisation's OWN noun in the header: it said the generic word until this was fixed, and a
    // header that says the wrong industry's word is the vocabulary leak nobody thinks to check.
    expect(lines[0]).toMatch(/^Submitted at,Module,/);
    expect(lines[0]).not.toMatch(/Subject/);
    // There is no respondent column to export, which is the point: a CSV that could name people would
    // undo the schema's guarantee at the last step.
    expect(res.text).not.toMatch(/email|respondent|user_id/i);
  });
});

describe('the response rate needs a denominator that exists — 40', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('reports NO rate for an open link, because a link has no roll', async () => {
    const { campaignId } = await campaignWithResponses(founder, config.K_ANON_THRESHOLD);
    const res = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);

    // This used to return the SUBJECT count, which made the rate responses-per-subject and rendered
    // demo campaigns at between 1750% and 4675%.
    expect(res.body.data.audienceEstimate).toBeNull();
    expect(res.body.data.responseRate).toBeNull();
    expect(res.body.data.responseCount).toBe(config.K_ANON_THRESHOLD);
  });

  it('computes a real rate when the audience is a real set of people', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Thermodynamics',
      unitId: sectionA,
    });
    const templates = await founder.agent.get('/api/v1/templates');
    const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
      (template) => template.name === 'Course feedback',
    )?.id as string;

    const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Section A only',
      templateId,
      subjectIds: [subject.body.data.id],
      audience: { kind: 'unit', unitId: sectionA, includeSubtree: true },
    });
    const res = await founder.agent.get(
      `/api/v1/campaigns/${campaign.body.data.id}/results`,
    );

    // Zero responses, so the number is 0 - but a real 0 out of a real headcount, which is a different
    // statement from "there is no such thing as a rate here".
    expect(res.body.data.audienceEstimate).not.toBeNull();
    expect(typeof res.body.data.audienceEstimate).toBe('number');
  });
});

describe('an archived subject keeps its history — 35 § Acceptance, 10 §9', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('still appears in the results of a campaign that already ran', async () => {
    const { campaignId, subjectId } = await campaignWithResponses(founder, 6);
    const before = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    const count = before.body.data.responseCount as number;

    const archived = await withCsrf(founder, 'post', `/api/v1/subjects/${subjectId}/archive`).send({});
    expect(archived.status).toBe(200);

    // Archiving is not deleting: the numbers somebody looked at last term are the same numbers today.
    const after = await founder.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    expect(after.status).toBe(200);
    expect(after.body.data.responseCount).toBe(count);
    expect(count).toBeGreaterThan(0);
  });

  it('cannot be put into a NEW campaign', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Retired Course',
      unitId: sectionA,
    });
    const subjectId = subject.body.data.id as string;
    await withCsrf(founder, 'post', `/api/v1/subjects/${subjectId}/archive`).send({});

    const templates = await founder.agent.get('/api/v1/templates');
    const templateId = (templates.body.data as Array<{ id: string; name: string }>)[0]?.id as string;
    const res = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Next cycle',
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });

    // 404 rather than a silent drop: a campaign that quietly reviews fewer subjects than it was asked
    // to is worse than one that refuses to be created.
    expect(res.status).toBe(404);
  });
});

describe('results are scope-filtered like everything else', () => {
  it('answers 404 for a campaign outside the caller scope', async () => {
    const founder = await setUpOrg();
    const { campaignId } = await campaignWithResponses(founder, 5);
    const elsewhere = await addStaff(founder.orgId, {
      name: 'Section B Head',
      level: 2,
      unitName: 'Section B',
    });

    const res = await elsewhere.agent.get(`/api/v1/campaigns/${campaignId}/results`);
    // Every subject of this campaign lives in the other section, and a 403 would confirm it exists and
    // leak which departments are collecting feedback.
    expect(res.status).toBe(404);
  });
});
