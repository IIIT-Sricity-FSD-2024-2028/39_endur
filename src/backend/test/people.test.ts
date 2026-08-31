// People, positions and the CSV import.
// The assertion that matters most is the one about two hats: somebody senior in one unit and junior
// in another must show senior powers only where the senior position sits.
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
    // Their own section and below, plus themselves. The other section's head is ABSENT, not greyed out.
    expect(names).toContain('A Head');
    expect(names).toContain('A1 Tutor');
    expect(names).not.toContain('B Head');
    // The total counts what the CALLER may see, not what exists: counting everything would leak the size
    // of the organisation.
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
    // No overlap, which is the whole reason for a cursor: offset paging duplicates and skips rows while
    // somebody else is inserting.
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
      // Ignored: no create-person request accepts a role, a level or a capability.
      roleId: await roleIdByLevel(founder.orgId, 1),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.positions).toEqual([]);

    const user = await prisma.user.findFirstOrThrow({
      where: { orgId: founder.orgId, name: 'New Person' },
      select: { passwordHash: true, status: true },
    });
    // An account nobody has activated must not be able to sign in, and the missing password hash is the
    // fact that says so.
    expect(user.passwordHash).toBeNull();
    expect(user.status).toBe('invited');

    // And the raw state does not travel. This line used to assert the database column, which is how a
    // phantom "invited" tag passed review: the list printed it beside every person an administrator added,
    // in the same row that still offered them the Invite button.
    expect(res.body.data.status).toBeUndefined();
    expect(res.body.data.account).toEqual({ state: 'none' });
  });

  // The deadlock, as a test. Creating a person makes no position, so the person had no unit, matched no
  // unit-scoped caller, and disappeared: the founder could create somebody and then not see them, open
  // them, or give them a position, because every route that could do so had first to see them.
  it('can still see somebody it just created, who has no position yet', async () => {
    const founder = await setUpOrg();
    const created = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Fresh Person',
      email: `fresh-${Date.now()}@example.test`,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    // The founder holds the read at subtree scope, not everywhere - the ordinary shape, and the shape the
    // hole was invisible in.
    const list = await founder.agent.get('/api/v1/people');
    expect((list.body.data as Array<{ id: string }>).map((row) => row.id)).toContain(id);
    expect(await founder.agent.get(`/api/v1/people/${id}`)).toMatchObject({ status: 200 });
  });

  // The other half of the same rule: having no position is not a back door. A person WITH a position
  // outside the caller's reach is still invisible.
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

    // The senior hat applies in its own section and nowhere else: this is the line the whole model turns on.
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
    // The audit row records WHICH grant decided it: without that, "access denied" is an assertion rather
    // than evidence.
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

  // Both halves of the 404-versus-403 rule, on the route where the split was being decided by accident.
  // The visibility check used to derive a read capability from the acting one, and there is no
  // "assignment.read" in the catalogue - so it asked with a capability nobody holds, and every
  // out-of-scope assignment answered 404, including at a unit the caller had just picked from a menu.
  it('says 403 when the caller can SEE the unit but may not assign there — 13 §5', async () => {
    const founder = await setUpOrg();
    const head = await addStaff(founder.orgId, {
      name: 'Scoped Head',
      level: 2,
      unitName: 'Section A',
    });
    const person = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Scoped Target',
      email: `scoped-${Date.now()}@example.test`,
    });

    // The inner unit IS visible to this caller, asserted on purpose: if that ever stops being true, the
    // test below is testing nothing.
    const teamA1 = await unitIdByName(founder.orgId, 'Team A1');
    expect((await head.agent.get(`/api/v1/units/${teamA1}/composition`)).status).toBe(200);

    const res = await withCsrf(head, 'post', `/api/v1/people/${person.body.data.id}/assignments`).send({
      roleId: await roleIdByLevel(founder.orgId, 3),
      unitId: teamA1,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // The wording is the actionable half: they hold this capability, just not here.
    expect(res.body.error.details.reason).toBe('out_of_scope');
  });

  // The other half, unchanged: a unit they cannot see must not be confirmed to exist.
  it('still says 404 for a unit outside the caller\'s reach entirely — 13 §5', async () => {
    const founder = await setUpOrg();
    const head = await addStaff(founder.orgId, {
      name: 'Sectioned Head',
      level: 2,
      unitName: 'Section A',
    });
    const person = await withCsrf(founder, 'post', '/api/v1/people').send({
      name: 'Other Section Target',
      email: `other-${Date.now()}@example.test`,
    });

    const sectionB = await unitIdByName(founder.orgId, 'Section B');
    expect((await head.agent.get(`/api/v1/units/${sectionB}/composition`)).status).toBe(404);

    const res = await withCsrf(head, 'post', `/api/v1/people/${person.body.data.id}/assignments`).send({
      roleId: await roleIdByLevel(founder.orgId, 3),
      unitId: sectionB,
    });

    expect(res.status).toBe(404);
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
    // A quoted field with a comma inside is what real exports contain.
    expect(res.body.data.sample[1].name).toBe('Grace Hopper, PhD');
    // That role does not exist in this organisation, and the import must not invent it.
    expect(res.body.data.unmatchedRoles).toEqual(['Professor']);
  });

  // The CSV arrives as a string inside a JSON body, so two caps could reject it: the schema's own limit
  // and the body parser's. The schema's is the SMALLER one, so an oversized file comes back as a field
  // error naming the CSV rather than as an unhelpful payload-too-large.
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
    // Reported, not silently imported without a position: somebody in the list with no access looks like
    // a permissions bug rather than an unfinished import.
    expect(res.body.data.skipped).toEqual(['alan@example.test']);
  });

  // The second place a person sits, taken from the file rather than added by hand.
  it('puts a person in a SECOND unit from the "Also in" column', async () => {
    const founder = await setUpOrg();
    const csvWithAlso = [
      'Name,Email,Role,Unit,Also in',
      'Ada Lovelace,ada-also@example.test,Tutor,Section A,Section B',
    ].join('\n');

    const preview = await withCsrf(founder, 'post', '/api/v1/people/import/preview').send({
      csv: csvWithAlso,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.sample[0].alsoUnitName).toBe('Section B');
    // Both units exist, so neither column asks the operator anything.
    expect(preview.body.data.unmatchedUnits).toEqual([]);

    const res = await withCsrf(founder, 'post', '/api/v1/people/import').send({
      rows: [
        {
          name: 'Ada Lovelace',
          email: 'ada-also@example.test',
          roleName: 'Tutor',
          unitName: 'Section A',
          alsoUnitName: 'Section B',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.assigned).toBe(2);

    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', user: { email: 'ada-also@example.test' } },
      select: { id: true },
    });
    const edges = await prisma.edge.findMany({
      where: { orgId: founder.orgId, type: 'member', parentId: person.id },
      select: { isPrimary: true, child: { select: { unit: { select: { name: true } } } } },
    });
    expect(edges).toHaveLength(2);
    // EXACTLY ONE PRIMARY, and it is the first column. The home unit is where a
    // person-anchored grant anchors, and a second primary makes that a guess.
    expect(edges.filter((edge) => edge.isPrimary)).toHaveLength(1);
    expect(edges.find((edge) => edge.isPrimary)?.child.unit?.name).toBe('Section A');
    expect(edges.find((edge) => !edge.isPrimary)?.child.unit?.name).toBe('Section B');
  });

  it('skips a row whose second unit resolves to nothing, rather than half-importing it', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', '/api/v1/people/import').send({
      rows: [
        {
          name: 'Grace Hopper',
          email: 'grace-also@example.test',
          roleName: 'Tutor',
          unitName: 'Section A',
          alsoUnitName: 'Nowhere Hall',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.skipped).toEqual(['grace-also@example.test']);
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
