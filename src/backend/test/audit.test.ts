// The activity log's read surface.
// Short on purpose: the rows have been written for a long time, so what needs asserting is that
// READING them keeps three promises - no IP address for any principal, a response submission names
// nobody, and the list is scope-filtered over the TARGET rather than the actor.
// Plus the reason anybody opens the page: refusals are recorded and can be filtered on their own.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addStaff, app, roleIdByLevel, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

const stranger = () => request(app);

type Entry = {
  id: string;
  actor: { id: string; name: string } | null;
  action: string;
  target: { type: string; id: string | null; name: string | null } | null;
  outcome: 'allowed' | 'denied';
  decidedBy: { via: string; scope?: string } | null;
};

const log = async (session: Session, query = ''): Promise<{ data: Entry[]; total: number }> => {
  const res = await session.agent.get(`/api/v1/audit${query}`);
  expect(res.status).toBe(200);
  return { data: res.body.data as Entry[], total: res.body.meta.total as number };
};

describe('GET /audit — the organisation reads its own record', () => {
  let founder: Session;
  let sectionA: Session;
  let unitAId: string;
  let unitBId: string;

  beforeAll(async () => {
    founder = await setUpOrg();
    unitAId = await unitIdByName(founder.orgId, 'Section A');
    unitBId = await unitIdByName(founder.orgId, 'Section B');
    sectionA = await addStaff(founder.orgId, { name: 'Head A', level: 2, unitName: 'Section A' });

    // Two units renamed, one in each section: these are the rows the scope test divides.
    await withCsrf(founder, 'patch', `/api/v1/units/${unitAId}`).send({ name: 'Section A' });
    await withCsrf(founder, 'patch', `/api/v1/units/${unitBId}`).send({ name: 'Section B' });
  });

  it('records what happened, with the grant that allowed it', async () => {
    const { data } = await log(founder, '?action=unit.update');
    const row = data.find((entry) => entry.target?.id === unitAId);
    expect(row).toBeDefined();
    expect(row?.outcome).toBe('allowed');
    expect(row?.actor?.id).toBe(founder.userId);
    expect(row?.target?.name).toBe('Section A');
    // Not just "it was allowed" but WHICH grant allowed it, which is the same trace the simulator replays.
    expect(row?.decidedBy?.via).toBeTruthy();
  });

  it('carries no `ip` on any row, for any principal — DEC-040 rule 2', async () => {
    const { data } = await log(founder, '?limit=100');
    expect(data.length).toBeGreaterThan(0);
    // The IP IS written for a staff mutation and stays on the row for forensics, but it must not reach
    // the body: a field that reaches a screen reaches a screenshot.
    for (const row of data) expect(row).not.toHaveProperty('ip');
  });

  it('shows a response submission as the least informative row in the table', async () => {
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Audited thing',
      unitId: unitAId,
    });
    const templates = await founder.agent.get('/api/v1/templates');
    const templateId = (templates.body.data as Array<{ id: string; name: string }>)[0]?.id as string;
    const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Audited campaign',
      templateId,
      subjectIds: [subject.body.data.id as string],
      audience: { kind: 'anyone' },
    });
    const campaignId = campaign.body.data.id as string;
    const launch = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});
    const token = launch.body.data.publicToken as string;

    const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
    const answers = (form.body.data.questions as Array<{ id: string; kind: string; config: { options?: string[] } }>)
      .map((question) => {
        switch (question.kind) {
          case 'rating': return { questionId: question.id, value: { kind: 'rating', n: 4 } };
          case 'nps': return { questionId: question.id, value: { kind: 'nps', n: 8 } };
          case 'yesno': return { questionId: question.id, value: { kind: 'yesno', yes: true } };
          case 'choice':
            return { questionId: question.id, value: { kind: 'choice', option: question.config.options?.[0] ?? '' } };
          default: return { questionId: question.id, value: { kind: 'text', text: 'fine' } };
        }
      });
    const submit = await stranger().post(`/api/v1/public/campaigns/${token}/responses`).send({ answers });
    expect(submit.status).toBe(201);

    const { data } = await log(founder, '?action=response.submit');
    const row = data.find((entry) => entry.target?.id === campaignId);
    expect(row).toBeDefined();
    // The action, the campaign, the time - and nothing else.
    expect(row?.actor).toBeNull();
    expect(row).not.toHaveProperty('ip');

    // And the column itself is NULL, not merely left out of the body: the writer keeps the promise.
    const stored = await prisma.auditLog.findFirstOrThrow({
      where: { orgId: founder.orgId, action: 'response.submit' },
      select: { ip: true, actorUserId: true },
    });
    expect(stored.ip).toBeNull();
    expect(stored.actorUserId).toBeNull();
  });

  it('records refusals of mutating capabilities, and they filter alone — DEC-041', async () => {
    // Creating a role is a top-level power, so a section head asking for it is a refusal worth seeing.
    const refused = await withCsrf(sectionA, 'post', '/api/v1/roles').send({
      name: 'Invented role',
      level: 2,
    });
    expect(refused.status).toBe(403);

    const { data } = await log(founder, '?outcome=denied');
    expect(data.length).toBeGreaterThan(0);
    // The refusal filter is what makes this a security screen and not only a business record.
    expect(data.every((row) => row.outcome === 'denied')).toBe(true);
    const row = data.find((entry) => entry.action === 'role.create');
    expect(row?.actor?.id).toBe(sectionA.userId);
  });

  it('does not record a refused READ — a 403 on a GET is the system working', async () => {
    const before = await prisma.auditLog.count({
      where: { orgId: founder.orgId, outcome: 'denied', action: 'audit.read' },
    });
    const refused = await sectionA.agent.get('/api/v1/audit');
    expect(refused.status).toBe(403);
    const now = await prisma.auditLog.count({
      where: { orgId: founder.orgId, outcome: 'denied', action: 'audit.read' },
    });
    // Thousands a day would produce a table nobody reads.
    expect(now).toBe(before);
  });

  it('scope-filters over the TARGET, and meta.total counts only what the caller may see', async () => {
    await withCsrf(founder, 'put', '/api/v1/grants').send({
      cells: [
        {
          roleId: await roleIdByLevel(founder.orgId, 2),
          capability: 'audit.read',
          scope: 'own_unit',
          effect: 'allow',
        },
      ],
    });

    const mine = await log(sectionA, '?limit=100&action=unit.update');
    expect(mine.data.some((row) => row.target?.id === unitAId)).toBe(true);
    // Absent, not greyed out. The founder renamed the other section and that is not this person's business -
    // and the filter is over the target, so an owner acting on YOUR department is.
    expect(mine.data.some((row) => row.target?.id === unitBId)).toBe(false);

    const everything = await log(founder, '?limit=100&action=unit.update');
    expect(everything.total).toBeGreaterThan(mine.total);
  });

  it('still renders a row whose target has since been deleted', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Doomed unit',
      parentId: unitAId,
    });
    expect(created.status).toBe(201);
    // Creating a unit answers with the whole tree rather than the new node, so the id comes from there.
    const unitId = await unitIdByName(founder.orgId, 'Doomed unit');
    const removed = await withCsrf(founder, 'delete', `/api/v1/units/${unitId}`).send({});
    expect(removed.status).toBe(200);

    const { data } = await log(founder, '?limit=100&action=unit.create');
    const row = data.find((entry) => entry.target?.id === unitId);
    // A record that quietly drops rows whose subjects are gone is a record that can be edited by deleting things.
    expect(row).toBeDefined();
    expect(row?.target?.name).toBeNull();
  });
});
