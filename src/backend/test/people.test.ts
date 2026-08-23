// T-018 — people, positions and CSV import. 13 § People, 34.
//
// The assertion that matters most here is the one about two hats. A person holding
// Section Head at Section A and Tutor at Section B must show senior powers on A and only
// junior powers on B — INV-005 in one screen, and the single most important behavioural
// detail in the model.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addStaff,
  roleIdByLevel,
  setUpOrg,
  unitIdByName,
  withCsrf,
  type Session,
} from './helpers.js';
import { CSV_MAX_CHARS } from '@endur/shared';
import { prisma } from '../db/client.js';

describe('GET /people', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
    await addStaff(founder.orgId, { name: 'A Head', level: 2, unitName: 'Section A' });
    await addStaff(founder.orgId, { name: 'B Head', level: 2, unitName: 'Section B' });
    await addStaff(founder.orgId, { name: 'A1 Tutor', level: 3, unitName: 'Team A1' });
  });

  it('returns everyone to the founder, with their positions', async () => {
    const res = await founder.agent.get('/api/v1/people');
    expect(res.status).toBe(200);

    const names = (res.body.data as Array<{ name: string }>).map((person) => person.name);
    expect(names.sort()).toEqual(['A Head', 'A1 Tutor', 'B Head', 'Founder']);
    expect(res.body.meta.total).toBe(4);
    expect(res.body.page.hasMore).toBe(false);
  });

  it('scope-filters the list, and scope-filters the count with it', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Filtering Head',
      level: 2,
      unitName: 'Section A',
    });
    const res = await head.agent.get('/api/v1/people');

    expect(res.status).toBe(200);
    const names = (res.body.data as Array<{ name: string }>).map((person) => person.name);
    // Section A and below, plus themselves. B Head is ABSENT, not greyed (INV-003).
    expect(names).toContain('A Head');
    expect(names).toContain('A1 Tutor');
    expect(names).not.toContain('B Head');
    // meta.total counts what the CALLER may see, not what exists (13 §4). A total that
    // counted everything would leak the size of the organisation.
    expect(res.body.meta.total).toBe(names.length);
  });

  it('paginates with a cursor rather than an offset', async () => {
    const first = await founder.agent.get('/api/v1/people?limit=2');
    expect(first.body.data).toHaveLength(2);
    expect(first.body.page.hasMore).toBe(true);
    expect(first.body.page.nextCursor).toBeTruthy();

    const second = await founder.agent.get(
      `/api/v1/people?limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`,
    );
    const firstIds = (first.body.data as Array<{ id: string }>).map((p) => p.id);
    const secondIds = (second.body.data as Array<{ id: string }>).map((p) => p.id);
    // No overlap. That is the whole reason for a cursor: an offset on a growing table
    // returns duplicates and skips rows while somebody else is inserting (13 §4).
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it('rejects a malformed cursor rather than silently restarting at page one', async () => {
    const res = await founder.agent.get('/api/v1/people?cursor=not-a-cursor');
    expect(res.status).toBe(400);
  });
});

describe('POST /people', () => {
  it('creates an invited account with no password hash, and no role', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'New Person',
      email: `new-${Date.now()}@example.test`,
      // Ignored: no create-person DTO accepts a role, level or capability (14 §8).
      roleId: await roleIdByLevel(founder.orgId, 1),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.positions).toEqual([]);
    expect(res.body.data.status).toBe('invited');

    const user = await prisma.user.findFirstOrThrow({
      where: { orgId: founder.orgId, name: 'New Person' },
      select: { passwordHash: true },
    });
    // An account nobody has activated must not be sign-in-able.
    expect(user.passwordHash).toBeNull();
  });

  // D-026 — THE DEADLOCK, as a test. Found while building T-072, and it was live in
  // shipped code: `POST /people` creates a person and no position (14 §8 requires that),
  // so the person it returned had no unit, matched no unit-scoped caller, and disappeared.
  // The founder of a brand-new organisation could create somebody and then not see them,
  // open them, or give them a position — every route that could do so had first to see
  // them. Before the fix this was 201, then a list that did not contain them and a 404.
  it('can still see somebody it just created, who has no position yet', async () => {
    const founder = await setUpOrg();
    const created = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Fresh Person',
      email: `fresh-${Date.now()}@example.test`,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    // The founder holds `person.read: subtree` at the root — NOT `all`. That is the
    // ordinary shape, and it is the shape the hole was invisible in.
    const list = await founder.agent.get('/api/v1/people');
    expect((list.body.data as Array<{ id: string }>).map((row) => row.id)).toContain(id);
    expect(await founder.agent.get(`/api/v1/people/${id}`)).toMatchObject({ status: 200 });
  });

  // The other half of the same rule: unanchored is not a back door into other people. A
  // person WITH a position outside the caller's reach is still invisible.
  it('does not make somebody in another section visible along with them', async () => {
    const founder = await setUpOrg();
    const head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    const outsider = await addStaff(founder.orgId, { name: 'Outsider', level: 3, unitName: 'Section B' });

    const list = await head.agent.get('/api/v1/people');
    const names = (list.body.data as Array<{ name: string }>).map((row) => row.name);
    expect(names).toContain('Head');
    expect(names).not.toContain('Outsider');

    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: outsider.userId },
      select: { id: true },
    });
    const detail = await head.agent.get(`/api/v1/people/${person.id}`);
    expect(detail.status).toBe(404);
  });
});

describe('POST /people/:id/assignments — the two-hat case', () => {
  it('gives different powers in different places — INV-005', async () => {
    const founder = await setUpOrg();
    const person = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Two Hats',
      email: `two-hats-${Date.now()}@example.test`,
    });
    const personId = person.body.data.id as string;

    const [head, tutor, sectionA, sectionB] = await Promise.all([
      roleIdByLevel(founder.orgId, 2),
      roleIdByLevel(founder.orgId, 3),
      unitIdByName(founder.orgId, 'Section A'),
      unitIdByName(founder.orgId, 'Section B'),
    ]);

    const senior = await withCsrf(founder, 'post', `/api/v1/people/${personId}/assignments`).send({
      roleId: head,
      unitId: sectionA,
      isPrimary: true,
    });
    expect(senior.status).toBe(201);

    const junior = await withCsrf(founder, 'post', `/api/v1/people/${personId}/assignments`).send({
      roleId: tutor,
      unitId: sectionB,
    });
    expect(junior.status).toBe(201);
    expect(junior.body.data.positions).toHaveLength(2);

    const detail = await founder.agent.get(`/api/v1/people/${personId}`);
    const places = detail.body.data.powersByPlace as Array<{
      unitName: string;
      capabilities: Array<{ capability: string }>;
    }>;
    const atA = places.find((place) => place.unitName === 'Section A');
    const atB = places.find((place) => place.unitName === 'Section B');

    const can = (place: typeof atA, capability: string) =>
      place?.capabilities.some((entry) => entry.capability === capability) ?? false;

    // The senior hat applies at Section A and nowhere else. A senior hat somewhere does
    // not become senior powers everywhere — this is the line the whole model turns on.
    expect(can(atA, 'person.create')).toBe(true);
    expect(can(atB, 'person.create')).toBe(false);
    expect(can(atB, 'results.read')).toBe(true);
  });

  it('writes an audit row for every assignment', async () => {
    const founder = await setUpOrg();
    const person = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Audited',
      email: `audited-${Date.now()}@example.test`,
    });
    const before = await prisma.auditLog.count({
      where: { orgId: founder.orgId, action: 'assignment.create' },
    });

    await withCsrf(founder, 'post', `/api/v1/people/${person.body.data.id}/assignments`).send({
      roleId: await roleIdByLevel(founder.orgId, 3),
      unitId: await unitIdByName(founder.orgId, 'Section A'),
    });

    const after = await prisma.auditLog.findMany({
      where: { orgId: founder.orgId, action: 'assignment.create' },
      select: { decidedBy: true },
    });
    expect(after.length).toBe(before + 1);
    // INV-007: the row records WHICH GRANT decided it. Without that, "access denied" is an
    // assertion rather than evidence.
    expect(after.at(-1)?.decidedBy).not.toBeNull();
  });

  it('refuses a duplicate of the same position', async () => {
    const founder = await setUpOrg();
    const person = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Duplicate',
      email: `dup-${Date.now()}@example.test`,
    });
    const body = {
      roleId: await roleIdByLevel(founder.orgId, 3),
      unitId: await unitIdByName(founder.orgId, 'Section A'),
    };
    const path = `/api/v1/people/${person.body.data.id}/assignments`;

    expect((await withCsrf(founder, 'post', path).send(body)).status).toBe(201);
    expect((await withCsrf(founder, 'post', path).send(body)).status).toBe(409);
  });
});

describe('CSV import', () => {
  const csv = [
    'Name,Email,Role,Unit',
    'Ada Lovelace,ada@example.test,Tutor,Section A',
    '"Grace Hopper, PhD",grace@example.test,Tutor,Section A',
    'Alan Turing,alan@example.test,Professor,Section A',
  ].join('\n');

  it('previews columns, five rows, and every name it could not match', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', '/api/v1/people/import/preview').send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual(['Name', 'Email', 'Role', 'Unit']);
    expect(res.body.data.rowCount).toBe(3);
    // A quoted field with an embedded comma is what real exports contain.
    expect(res.body.data.sample[1].name).toBe('Grace Hopper, PhD');
    // "Professor" is not a role in this organisation. The import must not invent it — the
    // capability catalogue and the org structure are things people map onto (11 §3).
    expect(res.body.data.unmatchedRoles).toEqual(['Professor']);
  });

  /**
   * D-016 / T-065. The import is a string inside a JSON body, so two caps could reject it:
   * CSV_MAX_CHARS in validate(), and express.json's 256 kb in the body parser. The DTO's cap
   * is the SMALLER one, so an oversized CSV must come back as a field error naming the CSV —
   * never as PAYLOAD_TOO_LARGE, which is what a caller used to get between 256 kb and the
   * old 1 MB cap and which says nothing about what to fix.
   */
  it('rejects an oversized CSV with a FIELD error, not a payload error — D-016', async () => {
    const founder = await setUpOrg();
    const row = 'Ada Lovelace,ada@example.test,Tutor,Section A\n';
    const huge = 'Name,Email,Role,Unit\n' + row.repeat(Math.ceil(CSV_MAX_CHARS / row.length) + 20);
    expect(huge.length).toBeGreaterThan(CSV_MAX_CHARS);
    // Still inside the parser's byte limit, which is the whole point of the ordering.
    expect(Buffer.byteLength(JSON.stringify({ csv: huge }))).toBeLessThan(256 * 1024);

    const res = await withCsrf(founder, 'post', '/api/v1/people/import/preview').send({ csv: huge });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields[0].path).toBe('body.csv');
  });

  it('imports the rows it can resolve and reports the ones it skipped', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', '/api/v1/people/import').send({
      rows: [
        { name: 'Ada Lovelace', email: 'ada@example.test', roleName: 'Tutor', unitName: 'Section A' },
        { name: 'Alan Turing', email: 'alan@example.test', roleName: 'Professor', unitName: 'Section A' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.assigned).toBe(1);
    // Reported, not silently imported without a position: somebody who appears in the list
    // with no access looks like a permissions bug rather than an unfinished import.
    expect(res.body.data.skipped).toEqual(['alan@example.test']);
  });

  it('a repeated import updates rather than duplicating', async () => {
    const founder = await setUpOrg();
    const rows = [
      { name: 'Ada Lovelace', email: 'ada@example.test', roleName: 'Tutor', unitName: 'Section A' },
    ];

    await withCsrf(founder, 'post', '/api/v1/people/import').send({ rows });
    const second = await withCsrf(founder, 'post', '/api/v1/people/import').send({
      rows: [{ ...rows[0], name: 'Ada L' } as (typeof rows)[number]],
    });

    expect(second.body.data.created).toBe(0);
    expect(second.body.data.updated).toBe(1);
    const people = await prisma.node.count({
      where: { orgId: founder.orgId, kind: 'person', name: { startsWith: 'Ada' } },
    });
    expect(people).toBe(1);
  });

  it('replays the first response when the same Idempotency-Key comes back', async () => {
    const founder = await setUpOrg();
    const rows = [
      { name: 'Retry Person', email: `retry-${Date.now()}@example.test`, roleName: 'Tutor', unitName: 'Section A' },
    ];
    const key = `import-${Date.now()}`;

    const first = await withCsrf(founder, 'post', '/api/v1/people/import')
      .set('Idempotency-Key', key)
      .send({ rows });
    const replay = await withCsrf(founder, 'post', '/api/v1/people/import')
      .set('Idempotency-Key', key)
      .send({ rows });

    expect(first.body.data.created).toBe(1);
    // The FIRST response, replayed verbatim. A second 200 reporting "0 created" would look
    // idempotent and would not be — the caller cannot tell a retry from a no-op.
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replay']).toBe('true');
  });
});
