// T-024 — the home dashboard. 13 § Home, 46.
//
// Two properties decide whether this screen can be trusted: it is ONE request, and a
// section the caller cannot read is absent rather than empty. The second is what makes a
// low-permission user's home a coherent page instead of a wall of locks.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, addStaff, setUpOrg, unitIdByName, withCsrf, registerOrg } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';
import { config } from '../lib/config.js';

const stranger = () => request(app);

async function collectingOrg(responses: number) {
  const founder = await setUpOrg();
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

describe('GET /home', () => {
  it('populates the whole page in one request', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const res = await founder.agent.get('/api/v1/home');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.responsesTotal).toBe(config.K_ANON_THRESHOLD);
    expect(res.body.data.stats.responsesToday).toBe(config.K_ANON_THRESHOLD);
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
    // An unconfigured org's home is empty and confusing, so /app redirects to /app/setup —
    // and the prompt says the same thing in case somebody lands here anyway (46).
    expect(
      (res.body.data.prompts as Array<{ kind: string }>).some(
        (prompt) => prompt.kind === 'setup_incomplete',
      ),
    ).toBe(true);
  });

  it('shows at most two prompts', async () => {
    const founder = await setUpOrg();
    const res = await founder.agent.get('/api/v1/home');
    // A dashboard that nags with six banners is a dashboard people stop reading (46).
    expect((res.body.data.prompts as unknown[]).length).toBeLessThanOrEqual(2);
  });

  it('leaves a section ABSENT when the caller cannot read it — INV-003', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD);
    const junior = await addStaff(founder.orgId, {
      name: 'Reader',
      level: 3,
      unitName: 'Team A1',
    });

    // Level 3 has results.read own_unit but no response.read outside their own unit, and
    // Team A1 has no campaign — so there is nothing to read there.
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
    // Absent, not empty. A section the caller cannot read must not appear at all — the UI
    // never has to decide whether to grey something out.
    expect(res.body.data).not.toHaveProperty('recentComments');
    // The page still renders. A minimal-permission user sees a coherent page, not an error.
    expect(res.body.data.stats).toBeDefined();
  });

  it('applies the k-anon gate to its own numbers', async () => {
    const founder = await collectingOrg(config.K_ANON_THRESHOLD - 1);
    const res = await founder.agent.get('/api/v1/home');

    // The raw count is fine — it says how many people answered, which identifies nobody.
    expect(res.body.data.stats.responsesTotal).toBe(config.K_ANON_THRESHOLD - 1);
    // But no comment from a suppressed campaign leaks onto the dashboard. Home must not
    // become a way to read a gated campaign one aggregate at a time (46 § Acceptance).
    expect(res.body.data.recentComments).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Comment 1/);
  });
});
