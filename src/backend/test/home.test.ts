// The home dashboard.
// Two properties decide whether this screen can be trusted: it is ONE request, and a section the caller
// cannot read is ABSENT rather than empty - which is what makes a junior user's home a coherent page.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, addStaff, roleIdByLevel, setUpOrg, unitIdByName, withCsrf, registerOrg } from './helpers.js';
import type { AudienceRule } from '@endur/shared';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';
import { config } from '../lib/config.js';

const stranger = () => request(app);

// An organisation with one launched campaign and some responses in it.
// Real people are put in a unit and the campaign's audience points at them, which is the only way to get
// a response RATE that means anything - an open link has no roll.
async function collectingOrg(responses: number, invite?: { people: number }) {
  const founder = await setUpOrg();
  const sectionA = await unitIdByName(founder.orgId, 'Section A');
  if (invite) await fillUnit(founder.orgId, 'Section A', invite.people);
  const audience: AudienceRule = invite
    ? { kind: 'unit', unitId: sectionA, includeSubtree: true }
    : { kind: 'anyone' };
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
    audience,
  });
  const launch = await withCsrf(
    founder,
    'post',
    `/api/v1/campaigns/${campaign.body.data.id}/launch`,
  ).send({});
  const token = launch.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;

  for (let i = 0; i < responses; i += 1) {
    await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({
        answers: questions.map((question) => {
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
              return {
                questionId: question.id,
                value: { kind: 'text', text: `Comment ${i + 1}` },
              };
          }
        }),
      });
  }

  return founder;
}

// People in a unit, without the cost of an account each: the audience count reads person nodes, and
// hashing ten passwords to answer that would make the suite slower for nothing.
async function fillUnit(orgId: string, unitName: string, count: number): Promise<void> {
  const unitId = await unitIdByName(orgId, unitName);
  const roleId = await roleIdByLevel(orgId, 4);
  for (let i = 0; i < count; i += 1) {
    const person = await prisma.node.create({
      data: { orgId, kind: 'person', name: `Member ${i + 1}` },
      select: { id: true },
    });
    const position = await prisma.node.create({
      data: { orgId, kind: 'position', name: `Member ${i + 1} @ ${unitName}`, roleId, unitId },
      select: { id: true },
    });
    await prisma.edge.create({
      data: { orgId, type: 'member', parentId: person.id, childId: position.id, isPrimary: true },
    });
  }
}

describe('GET /home', () => {
  it('populates the whole page in one request', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const res = await founder.agent.get('/api/v1/home');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.window).toBe('30d');
    expect(res.body.data.stats.responses).toBe(config.K_ANON_THRESHOLD);
    expect(res.body.data.stats.responsesEver).toBe(config.K_ANON_THRESHOLD);
    expect(res.body.data.stats.subjectsCovered).toBe(1);
    expect(res.body.data.stats.activeCampaigns).toBe(1);
    expect(res.body.data.activeCampaigns).toHaveLength(1);
    expect(res.body.data.activeCampaigns[0].name).toBe('Autumn feedback');
    expect(res.body.data.recentComments.length).toBeGreaterThan(0);
    expect(res.body.data.configured).toBe(true);
  });

  it('reports a brand-new org as unconfigured, so the console sends them to the wizard', async () => {
    const fresh = await registerOrg('custom');
    const res = await fresh.agent.get('/api/v1/home');

    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
    // An unconfigured organisation's home is empty and confusing, so the console sends them to the wizard -
    // and the prompt says the same thing in case somebody lands here anyway.
    expect(
      (res.body.data.prompts as Array<{ kind: string }>).some(
        (prompt) => prompt.kind === 'setup_incomplete',
      ),
    ).toBe(true);
  });

  it('shows at most two prompts', async () => {
    const founder = await setUpOrg();
    const res = await founder.agent.get('/api/v1/home');
    // A dashboard that nags with six banners is a dashboard people stop reading.
    expect((res.body.data.prompts as unknown[]).length).toBeLessThanOrEqual(2);
  });

  it('leaves a section ABSENT when the caller cannot read it — INV-003', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const junior = await addStaff(founder.orgId, {
      name: 'Reader',
      level: 3,
      unitName: 'Team A1',
    });

    // This level can read results in its own unit and nothing outside it, and that unit has no campaign.
    const roles = await founder.agent.get('/api/v1/roles');
    const tutorId = (roles.body.data as Array<{ id: string; level: number }>).find(
      (role) => role.level === 3,
    )?.id as string;
    await prisma.grant.deleteMany({
      where: { orgId: founder.orgId, subjectId: tutorId, capability: 'response.read' },
    });
    clearGrantCache();

    const res = await junior.agent.get('/api/v1/home');
    expect(res.status).toBe(200);
    // Absent, not empty: the UI never has to decide whether to grey something out.
    expect(res.body.data).not.toHaveProperty('recentComments');
    // The page still renders: a minimal-permission user sees a coherent page, not an error.
    expect(res.body.data.stats).toBeDefined();
  });

  it('applies the k-anon gate to its own numbers', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD - 1);
    const res = await founder.agent.get('/api/v1/home');

    // The raw count is fine: it says how many people answered, which identifies nobody.
    expect(res.body.data.stats.responses).toBe(config.K_ANON_THRESHOLD - 1);
    // But no comment from a suppressed campaign leaks onto the dashboard: home must not become a way to
    // read a gated campaign one aggregate at a time.
    expect(res.body.data.recentComments).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Comment 1/);
  });
});

// The response-rate bug had a SECOND reader here, on the first screen after sign-in, where the seeded
// demo organisations showed rates between 2600% and 4675%.
describe('the response rate needs a denominator that exists — 46', () => {
  it('has no rate for an open link, however many responses came back', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const res = await founder.agent.get('/api/v1/home');

    // One subject and five responses used to divide one into the other and render 500%.
    expect(res.body.data.stats.responses).toBe(config.K_ANON_THRESHOLD);
    expect(res.body.data.activeCampaigns[0].subjectCount).toBe(1);
    expect(res.body.data.stats.responseRate).toBeNull();
  });

  it('measures against PEOPLE when the audience is a real set of them', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD, { people: 10 });
    const res = await founder.agent.get('/api/v1/home');

    // Ten people asked, five answered: half, and it says half.
    expect(res.body.data.stats.responseRate).toBe(0.5);
  });

  it('measures the rate over the RANGE, not over the campaign’s whole life — DEC-031', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD, { people: 10 });

    // Move every response back six weeks: the campaign is still open and its audience is still ten people,
    // so an unwindowed rate would keep saying 50% for a month in which nothing arrived.
    await prisma.response.updateMany({
      where: { campaign: { orgId: founder.orgId } },
      data: { submittedAt: new Date(Date.now() - 42 * 86_400_000) },
    });

    const recent = await founder.agent.get('/api/v1/home?window=30d');
    expect(recent.body.data.stats.responses).toBe(0);
    expect(recent.body.data.stats.subjectsCovered).toBe(0);
    // Zero of ten, not "no data": the campaign WAS collecting, so the denominator is real.
    expect(recent.body.data.stats.responseRate).toBe(0);
    // And the org has not vanished — the page still knows it has collected before.
    expect(recent.body.data.stats.responsesEver).toBe(config.K_ANON_THRESHOLD);

    const ever = await founder.agent.get('/api/v1/home?window=all');
    expect(ever.body.data.stats.responses).toBe(config.K_ANON_THRESHOLD);
    expect(ever.body.data.stats.responseRate).toBe(0.5);
  });

  it('keeps a campaign that was never collecting OUT of the denominator', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD, { people: 10 });

    // Closed a year ago: its ten-person audience must not be charged against this week, which would be
    // a denominator from one period divided into a numerator from another.
    await prisma.campaign.updateMany({
      where: { orgId: founder.orgId },
      data: { closedAt: new Date(Date.now() - 365 * 86_400_000) },
    });

    const res = await founder.agent.get('/api/v1/home?window=7d');
    expect(res.body.data.stats.responseRate).toBeNull();
  });

  it('falls back to 30 days rather than 400ing on a junk range', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const res = await founder.agent.get('/api/v1/home?window=since-the-dawn-of-time');

    // A range is a DISPLAY preference: a stale bookmark must not break the first screen after sign-in.
    expect(res.status).toBe(200);
    expect(res.body.data.stats.window).toBe('30d');
  });

  it('hands the campaign card its share link, so the QR costs a click and not a request', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const res = await founder.agent.get('/api/v1/home');

    const card = res.body.data.activeCampaigns[0];
    expect(card.url).toMatch(/\/r\/[A-Za-z0-9]+$/);
    expect(card.anonymous).toBe(true);
  });
});
