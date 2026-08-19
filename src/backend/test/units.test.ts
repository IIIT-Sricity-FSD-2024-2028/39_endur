// T-016 — units, and the invariant that makes the whole product trustworthy. 13, 32.
//
// The tree is scope-filtered BY THE API (INV-003). Out-of-scope units are absent, not
// greyed, and the client never filters for permission reasons. That is the property these
// tests exist for; the CRUD around it is almost incidental by comparison.
import { beforeAll, describe, expect, it } from 'vitest';
import { addStaff, denyPerson, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

type Tree = Array<{ id: string; name: string; children: Tree }>;

const flatten = (tree: Tree): string[] =>
  tree.flatMap((node) => [node.name, ...flatten(node.children)]);

describe('GET /units — scope filtering is the API, not the UI', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('gives the founder the whole tree, nested', async () => {
    const res = await founder.agent.get('/api/v1/units');
    expect(res.status).toBe(200);

    const tree = res.body.data as Tree;
    expect(flatten(tree).sort()).toEqual(['Root', 'Section A', 'Section B', 'Team A1']);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe('Root');
  });

  it('roots a level-2 caller at their own unit and omits the rest entirely', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Section A Head',
      level: 2,
      unitName: 'Section A',
    });
    const res = await head.agent.get('/api/v1/units');

    expect(res.status).toBe(200);
    const names = flatten(res.body.data as Tree);
    // `subtree` from the anchor: Section A and everything below it.
    expect(names.sort()).toEqual(['Section A', 'Team A1']);
    // Section B is ABSENT — not present-and-greyed, not present-with-a-flag. A senior hat
    // somewhere does not become senior powers everywhere (INV-005).
    expect(names).not.toContain('Section B');
    expect(names).not.toContain('Root');
    // Their own unit is the root of what they see, so the tree renders without a gap.
    expect((res.body.data as Tree)[0]?.name).toBe('Section A');
  });

  it('gives a level-3 caller their own unit only', async () => {
    const tutor = await addStaff(founder.orgId, {
      name: 'A1 Tutor',
      level: 3,
      unitName: 'Team A1',
    });
    const res = await tutor.agent.get('/api/v1/units');
    expect(flatten(res.body.data as Tree)).toEqual(['Team A1']);
  });

  it('returns nothing at all to someone explicitly denied — INV-004', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Denied Head',
      level: 2,
      unitName: 'Section A',
    });
    await denyPerson(founder.orgId, head.userId, 'unit.read', 'all');

    const res = await head.agent.get('/api/v1/units');
    // A deny at scope `all` is not "one fewer unit" — it is the end of the question. No
    // scope, level or membership overrides it.
    expect(res.status).toBe(403);
  });

  it('counts people and subjects per unit so the tree needs no second request', async () => {
    const res = await founder.agent.get('/api/v1/units');
    const root = (res.body.data as Array<{ name: string; peopleCount: number }>)[0];
    expect(root?.peopleCount).toBe(1);
  });
});

describe('POST /units', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('creates a child unit and wires the contains edge', async () => {
    const parentId = await unitIdByName(founder.orgId, 'Section B');
    const res = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Team B1',
      parentId,
    });

    expect(res.status).toBe(201);
    const edge = await prisma.edge.findFirst({
      where: { orgId: founder.orgId, type: 'contains', parentId, child: { name: 'Team B1' } },
    });
    expect(edge).not.toBeNull();
  });

  it('expands `Floor 1..8` into eight siblings in one request', async () => {
    const parentId = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Floor',
      parentId,
      repeat: { from: 1, to: 8 },
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(8);
    const names = (res.body.data as Array<{ name: string }>).map((unit) => unit.name);
    expect(names).toEqual([
      'Floor 1',
      'Floor 2',
      'Floor 3',
      'Floor 4',
      'Floor 5',
      'Floor 6',
      'Floor 7',
      'Floor 8',
    ]);
  });

  it('expands `Wing A..F` into six lettered siblings', async () => {
    const parentId = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Wing',
      parentId,
      repeat: { from: 0, to: 5, letters: true },
    });

    expect(res.status).toBe(201);
    const names = (res.body.data as Array<{ name: string }>).map((unit) => unit.name);
    expect(names).toEqual(['Wing A', 'Wing B', 'Wing C', 'Wing D', 'Wing E', 'Wing F']);
  });

  it('refuses a letter range past Z', async () => {
    const parentId = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Wing',
      parentId,
      repeat: { from: 0, to: 26, letters: true },
    });
    expect(res.status).toBe(422);
  });

  it('refuses `1..10000` — the cap is server-side, where it cannot be skipped', async () => {
    const parentId = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'post', '/api/v1/units').send({
      name: 'Floor',
      parentId,
      repeat: { from: 1, to: 10000 },
    });
    expect(res.status).toBe(422);
  });

  it('raises authzVersion, so no cached decision survives a structural change', async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: founder.orgId },
      select: { settings: true },
    });
    const parentId = await unitIdByName(founder.orgId, 'Root');
    await withCsrf(founder, 'post', '/api/v1/units').send({ name: 'Section C', parentId });
    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: founder.orgId },
      select: { settings: true },
    });

    // A new unit changes what every `subtree` scope reaches. Without the bump, the grant
    // cache would answer from before the change for the length of its TTL (11 §7).
    expect((after.settings as { authzVersion: number }).authzVersion).toBeGreaterThan(
      (before.settings as { authzVersion: number }).authzVersion,
    );
  });
});

describe('POST /units/:id/reparent', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('moves a unit under a new parent', async () => {
    const [teamA1, sectionB] = await Promise.all([
      unitIdByName(founder.orgId, 'Team A1'),
      unitIdByName(founder.orgId, 'Section B'),
    ]);
    const res = await withCsrf(founder, 'post', `/api/v1/units/${teamA1}/reparent`).send({
      newParentId: sectionB,
    });

    expect(res.status).toBe(200);
    const edges = await prisma.edge.findMany({
      where: { orgId: founder.orgId, type: 'contains', childId: teamA1 },
      select: { parentId: true },
    });
    // Exactly one parent within a dimension — the old edge is replaced, not accompanied.
    expect(edges).toEqual([{ parentId: sectionB }]);
  });

  it('refuses a move into its own descendant, with no data change', async () => {
    const [sectionB, teamA1] = await Promise.all([
      unitIdByName(founder.orgId, 'Section B'),
      unitIdByName(founder.orgId, 'Team A1'),
    ]);
    const res = await withCsrf(founder, 'post', `/api/v1/units/${sectionB}/reparent`).send({
      newParentId: teamA1,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    // Nothing moved. A cycle here does not merely produce wrong answers — it is what the
    // recursive queries' depth guard exists to survive (10 §6).
    const edges = await prisma.edge.findMany({
      where: { orgId: founder.orgId, type: 'contains', childId: sectionB },
      select: { parent: { select: { name: true } } },
    });
    expect(edges.map((edge) => edge.parent.name)).toEqual(['Root']);
  });

  it('refuses a unit moving under itself', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'post', `/api/v1/units/${sectionA}/reparent`).send({
      newParentId: sectionA,
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /units/:id/impact', () => {
  it('states real numbers, so the delete dialog can be honest', async () => {
    const founder = await setUpOrg();
    await addStaff(founder.orgId, { name: 'A Head', level: 2, unitName: 'Section A' });
    const sectionA = await unitIdByName(founder.orgId, 'Section A');

    const res = await founder.agent.get(`/api/v1/units/${sectionA}/impact`);
    expect(res.status).toBe(200);
    expect(res.body.data.unitName).toBe('Section A');
    expect(res.body.data.descendantCount).toBe(1);
    expect(res.body.data.peopleAffected).toBe(1);
  });
});

describe('DELETE /units/:id', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('refuses to orphan children silently, and says how many there are', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'delete', `/api/v1/units/${sectionA}`).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/1 unit/);
  });

  it('reassigns children when told where they go', async () => {
    const [sectionA, sectionB] = await Promise.all([
      unitIdByName(founder.orgId, 'Section A'),
      unitIdByName(founder.orgId, 'Section B'),
    ]);
    const res = await withCsrf(founder, 'delete', `/api/v1/units/${sectionA}`).send({
      reassignChildrenTo: sectionB,
    });

    expect(res.status).toBe(200);
    const teamA1 = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'unit', name: 'Team A1' },
      select: { id: true },
    });
    const edge = await prisma.edge.findFirstOrThrow({
      where: { orgId: founder.orgId, type: 'contains', childId: teamA1.id },
      select: { parentId: true },
    });
    expect(edge.parentId).toBe(sectionB);
  });
});

describe('tenant isolation on by-id routes — D-001 until RLS lands', () => {
  it('a unit from another organisation is 404, not 403', async () => {
    const [mine, theirs] = await Promise.all([setUpOrg(), setUpOrg()]);
    clearGrantCache();
    const theirUnit = await unitIdByName(theirs.orgId, 'Section A');

    const res = await withCsrf(mine, 'patch', `/api/v1/units/${theirUnit}`).send({ name: 'Taken' });
    // 404 rather than 403: a 403 would confirm the unit exists to someone who cannot see
    // it, which leaks the other organisation's structure (13 §5).
    expect(res.status).toBe(404);

    const untouched = await prisma.node.findUniqueOrThrow({
      where: { id: theirUnit },
      select: { name: true },
    });
    expect(untouched.name).toBe('Section A');
  });
});
