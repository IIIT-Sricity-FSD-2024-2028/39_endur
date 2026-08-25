// T-075 — the activity log's read surface. 56 § Acceptance.
//
// Short on purpose. `audit_log` has been written since T-013 and this is its first reader,
// so what has to be asserted is not that rows exist but that reading them keeps three
// promises the writer already makes:
//
//   1. NO `ip`, FOR ANY PRINCIPAL (DEC-040, rule 2 of 56 § Anonymity). The writer NULLs it
//      where it matters; the read surface must not carry it where it does not.
//   2. A `response.submit` ROW NAMES NOBODY. It is deliberately the least informative row
//      in the table, and that is INV-006 surviving contact with a feature that wanted it.
//   3. THE LIST IS SCOPE-FILTERED BY THE API (INV-003), over the TARGET rather than the
//      actor — an owner acting on your department is your business.
//
// Plus DEC-041, which is the reason anybody opens the page: refusals are recorded and
// filterable on their own.
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

    // Two units renamed, one in each section. These are the rows the scope test divides.
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
    // INV-007. This is the whole reason the table is worth reading: not "it was allowed"
    // but WHICH GRANT allowed it, which is the same trace the simulator replays (42).
    expect(row?.decidedBy?.via).toBeTruthy();
  });

  it('carries no `ip` on any row, for any principal — DEC-040 rule 2', async () => {
    const { data } = await log(founder, '?limit=100');
    expect(data.length).toBeGreaterThan(0);
    // Belt to the writer's brace. `ip` IS written for a staff mutation and stays on the
    // row for forensics (10 §5); a field that reaches a screen is a field that reaches a
    // screenshot, so it must not be in the body at all.
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
    // The action, the campaign, the time — and nothing else. 56 § Anonymity rule 3.
    expect(row?.actor).toBeNull();
    expect(row).not.toHaveProperty('ip');

    // And the column itself is NULL, not merely omitted from the body. A reader-side
    // filter protects one screen; this is the writer keeping the promise (DEC-045).
    const stored = await prisma.auditLog.findFirstOrThrow({
      where: { orgId: founder.orgId, action: 'response.submit' },
      select: { ip: true, actorUserId: true },
    });
    expect(stored.ip).toBeNull();
    expect(stored.actorUserId).toBeNull();
  });

  it('records refusals of mutating capabilities, and they filter alone — DEC-041', async () => {
    // `role.create` is L1 and nothing else (50 §1), so a section head asking for it is a
    // refusal somebody would want to see: an attempt to create a role in this org.
    const refused = await withCsrf(sectionA, 'post', '/api/v1/roles').send({
      name: 'Invented role',
      level: 2,
    });
    expect(refused.status).toBe(403);

    const { data } = await log(founder, '?outcome=denied');
    expect(data.length).toBeGreaterThan(0);
    // The toggle is the reason the page is a security screen and not only a business
    // record, so `denied` has to mean denied and nothing else.
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
    // Thousands a day would produce a table nobody reads, which is the same reasoning that
    // keeps a 403 at `warn` rather than `error` in 18 §4.
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
    // Absent, not greyed. The founder renamed Section B and that is not this person's
    // business — and the FOUNDER did it, which is exactly the case 56 settles: the filter
    // is over the target, so an owner acting on your department IS your business.
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
    // `POST /units` answers with the whole tree rather than the new node (32 § Data
    // contract), so the id comes from the same place the tree got it.
    const unitId = await unitIdByName(founder.orgId, 'Doomed unit');
    const removed = await withCsrf(founder, 'delete', `/api/v1/units/${unitId}`).send({});
    expect(removed.status).toBe(200);

    const { data } = await log(founder, '?limit=100&action=unit.create');
    const row = data.find((entry) => entry.target?.id === unitId);
    // A record that quietly drops the rows whose subjects are gone is a record that can be
    // edited by deleting things (56 § States).
    expect(row).toBeDefined();
    expect(row?.target?.name).toBeNull();
  });
});
