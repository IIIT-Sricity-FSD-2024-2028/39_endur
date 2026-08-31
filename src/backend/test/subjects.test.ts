// Subjects.
// The detail payload answers with the summary plus the cycles this subject has been through, which is
// the first hint of the improve layer - and the property worth pinning is that the counts are per
// SUBJECT, not per campaign.
import { beforeAll, describe, expect, it } from 'vitest';
import { addStaff, setUpOrg, unique, unitIdByName, withCsrf, type Session } from './helpers.js';
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
    // Computed on the server in the same query: an 18-row list must be one request, not nineteen.
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
    // No second entity and no second code path: the reviewee IS a subject with a link set, which is why
    // nothing in the schema is called Reviewee.
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
    // A 403 would confirm the subject exists to somebody who cannot see it, and leak the shape of the org.
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

    // Still there: a subject with responses has to survive for the history to mean anything, and archiving
    // is how it leaves the working set without leaving the record.
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

  it('answers the detail with its cycles, oldest first, counted per subject', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Cycle Subject',
      unitId: sectionA,
    });
    const subjectId = created.body.data.id as string;

    // A second subject in the same campaigns, whose responses must NOT be counted here: that is the
    // difference between "responses about this subject" and "responses to the campaign".
    const other = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Other Subject',
      unitId: sectionA,
    });
    const otherId = other.body.data.id as string;

    const template = await prisma.template.create({
      data: { orgId: founder.orgId, name: unique('tpl'), category: 'general' },
      select: { id: true },
    });

    const spring = await prisma.campaign.create({
      data: {
        orgId: founder.orgId, templateId: template.id, name: 'Spring cycle',
        publicToken: unique('T').slice(0, 12), closedAt: new Date('2026-03-31T00:00:00Z'),
        startsAt: new Date('2026-03-01T00:00:00Z'),
        subjects: { create: [{ subjectId }, { subjectId: otherId }] },
      },
      select: { id: true },
    });
    const autumn = await prisma.campaign.create({
      data: {
        orgId: founder.orgId, templateId: template.id, name: 'Autumn cycle',
        startsAt: new Date('2026-09-01T00:00:00Z'),
        subjects: { create: [{ subjectId }] },
      },
      select: { id: true },
    });

    await prisma.response.createMany({
      data: [
        { campaignId: spring.id, subjectId },
        { campaignId: spring.id, subjectId },
        { campaignId: spring.id, subjectId: otherId },
        { campaignId: autumn.id, subjectId },
      ],
    });

    const read = await founder.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(read.status).toBe(200);

    const cycles = read.body.data.cycles as Array<{
      campaignName: string; responseCount: number; status: string;
    }>;
    expect(cycles.map((cycle) => cycle.campaignName)).toEqual(['Spring cycle', 'Autumn cycle']);
    // Two of the three responses that term were about this subject; the third was not.
    expect(cycles[0]?.responseCount).toBe(2);
    expect(cycles[0]?.status).toBe('closed');
    // Never launched, so it is a draft however its dates read.
    expect(cycles[1]?.responseCount).toBe(1);
    expect(cycles[1]?.status).toBe('draft');
    // The summary half is still there.
    expect(read.body.data.totalResponses).toBe(3);
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
    // The other section is outside their subtree entirely, so they cannot even see it: 404.
    expect(res.status).toBe(404);
  });

  it("refuses the reserved type 'organisation' — DEC-093", async () => {
    // The type is free text the client picks, and ONE value of it decides visibility - left settable,
    // creating a subject would be enough to widen the audience of your own campaign.
    const res = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Not the organisation',
      unitId: sectionA,
      type: 'organisation',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    // Named under the field that caused it, so the form can point at it.
    expect(res.body.error.details.fields[0].path).toBe('body.type');
    // And nothing was written under a different type instead: refused, not rewritten.
    expect(
      await prisma.subject.count({ where: { orgId: founder.orgId, name: 'Not the organisation' } }),
    ).toBe(0);
  });

});
