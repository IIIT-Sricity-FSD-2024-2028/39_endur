// T-019 — subjects. 13 § Subjects, 35, 10 §9.
import { beforeAll, describe, expect, it } from 'vitest';
import { addStaff, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

describe('subjects', () => {
  let founder: Session;
  let sectionA = '';
  let sectionB = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    [sectionA, sectionB] = await Promise.all([
      unitIdByName(founder.orgId, 'Section A'),
      unitIdByName(founder.orgId, 'Section B'),
    ]);
  });

  it('creates one, and reports counts the list would otherwise need a second request for', async () => {
    const res = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Data Structures',
      unitId: sectionA,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.unitName).toBe('Section A');
    // Computed server-side, in the same query. An 18-row list must be one request, not
    // nineteen (35).
    expect(res.body.data.activeCampaigns).toBe(0);
    expect(res.body.data.totalResponses).toBe(0);
    expect(res.body.data.lastResponseAt).toBeNull();
  });

  it('links a subject to a person, so "review the thing" becomes "review the person"', async () => {
    const tutor = await addStaff(founder.orgId, {
      name: 'Linked Tutor',
      level: 3,
      unitName: 'Section A',
    });
    const res = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Linked Tutor',
      unitId: sectionA,
      linkedUserId: tutor.userId,
    });

    expect(res.status).toBe(201);
    // No second entity, no second code path. The reviewee IS a subject with a link set —
    // which is why nothing in the schema is called Reviewee.
    expect(res.body.data.linkedUserName).toBe('Linked Tutor');
  });

  it('scope-filters the list — a Section A head never sees Section B', async () => {
    await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'B-only Module',
      unitId: sectionB,
    });
    const head = await addStaff(founder.orgId, {
      name: 'Scoped Head',
      level: 2,
      unitName: 'Section A',
    });

    const res = await head.agent.get('/api/v1/subjects');
    expect(res.status).toBe(200);
    const names = (res.body.data as Array<{ name: string }>).map((subject) => subject.name);
    expect(names).toContain('Data Structures');
    expect(names).not.toContain('B-only Module');
    expect(res.body.meta.total).toBe(names.length);
  });

  it('answers 404, not 403, for a subject outside the caller scope', async () => {
    const bOnly = await prisma.subject.findFirstOrThrow({
      where: { orgId: founder.orgId, name: 'B-only Module' },
      select: { id: true },
    });
    const head = await addStaff(founder.orgId, {
      name: 'Probing Head',
      level: 2,
      unitName: 'Section A',
    });

    const res = await head.agent.get(`/api/v1/subjects/${bOnly.id}`);
    // A 403 would confirm the subject exists to somebody who cannot see it, which leaks
    // the shape of the organisation (13 §5).
    expect(res.status).toBe(404);
  });

  it('archives rather than deletes, and archived rows leave the default list', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Retired Module',
      unitId: sectionA,
    });
    const id = created.body.data.id as string;

    const archived = await withCsrf(founder, 'post', `/api/v1/subjects/${id}/archive`).send({});
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).not.toBeNull();

    // Still there. A subject with responses attached has to survive for the history to
    // mean anything (10 §9) — archiving is how it leaves the working set without leaving
    // the record.
    const row = await prisma.subject.findUnique({ where: { id }, select: { id: true } });
    expect(row).not.toBeNull();

    const list = await founder.agent.get('/api/v1/subjects');
    expect((list.body.data as Array<{ id: string }>).map((s) => s.id)).not.toContain(id);

    const archivedList = await founder.agent.get('/api/v1/subjects?archived=true');
    expect((archivedList.body.data as Array<{ id: string }>).map((s) => s.id)).toContain(id);
  });

  it('refuses to archive the same subject twice', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Double Archive',
      unitId: sectionA,
    });
    const path = `/api/v1/subjects/${created.body.data.id}/archive`;
    expect((await withCsrf(founder, 'post', path).send({})).status).toBe(200);
    expect((await withCsrf(founder, 'post', path).send({})).status).toBe(409);
  });

  it('refuses to create in a unit the caller cannot reach', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Wrong Section Head',
      level: 2,
      unitName: 'Section A',
    });
    const res = await withCsrf(head, 'post', '/api/v1/subjects').send({
      name: 'Trespassing Module',
      unitId: sectionB,
    });
    // Section B is outside their subtree entirely, so they cannot even see it: 404.
    expect(res.status).toBe(404);
  });
});
