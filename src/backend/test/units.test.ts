// T-016 — units, and the invariant that makes the whole product trustworthy. 13, 32.
//
// The tree is scope-filtered BY THE API (INV-003). Out-of-scope units are absent, not
// greyed, and the client never filters for permission reasons. That is the property these
// tests exist for; the CRUD around it is almost incidental by comparison.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addStaff,
  denyPerson,
  roleIdByLevel,
  setUpOrg,
  unitIdByName,
  withCsrf,
  type Session,
} from './helpers.js';
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

/**
 * DEC-082. A `position` is a role-at-unit SLOT shared by everyone holding that role there
 * (`10` §2.1), so `count(kind='position')` answers "how many distinct roles are present"
 * — and every people-count in the product was reading it as "how many people".
 *
 * These tests exist at this level because the rollup moved here from the client under the
 * same decision: people have to be counted DISTINCT across a branch, which per-unit
 * scalars cannot express however they are added up.
 */
describe('GET /units — what a people count counts, DEC-082', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  type Row = {
    id: string;
    name: string;
    peopleCount: number;
    peopleTotal: number;
    subjectTotal: number;
    children: Row[];
  };

  const rows = async (session: Session): Promise<Map<string, Row>> => {
    const res = await session.agent.get('/api/v1/units');
    expect(res.status).toBe(200);
    const into = new Map<string, Row>();
    const walk = (list: Row[]): void => {
      for (const row of list) {
        into.set(row.name, row);
        walk(row.children);
      }
    };
    walk(res.body.data as Row[]);
    return into;
  };

  /** Places a person in a unit, REUSING the role-at-unit slot the way `createAssignment`
   *  does. `addStaff` makes a fresh position per person and so cannot reach this bug. */
  const place = async (
    name: string,
    unitName: string,
    over: { validTo?: Date } = {},
  ): Promise<string> => {
    const orgId = founder.orgId;
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(orgId, 3),
      unitIdByName(orgId, unitName),
    ]);
    const person = await prisma.node.create({
      data: { orgId, kind: 'person', name },
      select: { id: true },
    });
    const position =
      (await prisma.node.findFirst({
        where: { orgId, kind: 'position', roleId, unitId },
        select: { id: true },
      })) ??
      (await prisma.node.create({
        data: { orgId, kind: 'position', name: `Tutor — ${unitName}`, roleId, unitId },
        select: { id: true },
      }));
    await prisma.edge.create({
      data: { orgId, type: 'member', parentId: person.id, childId: position.id, ...over },
    });
    clearGrantCache();
    return person.id;
  };

  it('counts PEOPLE, not the role slots they share', async () => {
    await place('Tutor One', 'Team A1');
    await place('Tutor Two', 'Team A1');
    await place('Tutor Three', 'Team A1');

    // One "Tutor at Team A1" position node, three people in it. The old count said 1.
    const slots = await prisma.node.count({
      where: { orgId: founder.orgId, kind: 'position', unit: { name: 'Team A1' } },
    });
    expect(slots).toBe(1);
    expect((await rows(founder)).get('Team A1')?.peopleCount).toBe(3);
  });

  it('rolls a branch up to its ancestors, so adding somebody deep moves every row above', async () => {
    const before = await rows(founder);
    const rootBefore = before.get('Root')?.peopleTotal ?? 0;

    await place('Tutor Four', 'Team A1');

    const after = await rows(founder);
    expect(after.get('Team A1')?.peopleTotal).toBe(4);
    expect(after.get('Section A')?.peopleTotal).toBe(4);
    expect(after.get('Root')?.peopleTotal).toBe(rootBefore + 1);
    // The unit's OWN count is untouched by anything below it — it stays the primitive.
    expect(after.get('Section A')?.peopleCount).toBe(0);
  });

  it('counts one person once, however many units of the branch they are in', async () => {
    const orgId = founder.orgId;
    const before = (await rows(founder)).get('Root')?.peopleTotal ?? 0;

    // The same person, placed a second time in a DIFFERENT unit of the same branch. A
    // rollup that adds per-unit counts reports them twice; Riverside's demo data has
    // exactly one such nurse, which is what made a summed total wrong at the root.
    const personId = await place('Tutor Five', 'Team A1');
    const [roleId, sectionA] = await Promise.all([
      roleIdByLevel(orgId, 2),
      unitIdByName(orgId, 'Section A'),
    ]);
    const position = await prisma.node.create({
      data: { orgId, kind: 'position', name: 'Head — Section A', roleId, unitId: sectionA },
      select: { id: true },
    });
    await prisma.edge.create({
      data: { orgId, type: 'member', parentId: personId, childId: position.id },
    });
    clearGrantCache();

    const after = await rows(founder);
    expect(after.get('Section A')?.peopleCount).toBe(1);
    expect(after.get('Team A1')?.peopleTotal).toBe(5);
    // Five in Team A1 plus the one on Section A, who is one of the five: six, not seven.
    expect(after.get('Section A')?.peopleTotal).toBe(5);
    expect(after.get('Root')?.peopleTotal).toBe(before + 1);
  });

  it('leaves out an assignment that has already expired', async () => {
    const before = (await rows(founder)).get('Section B')?.peopleTotal ?? 0;
    await place('Departed Tutor', 'Section B', { validTo: new Date(Date.now() - 60_000) });

    // `valid_to` retains history rather than deleting access (`10` §2.2), and the GRANT
    // resolver already ignores a lapsed edge. A count that did not would put somebody in a
    // unit where they hold no powers at all.
    expect((await rows(founder)).get('Section B')?.peopleTotal).toBe(before);
  });

  it('puts the forest total on the envelope rather than leaving it to be summed', async () => {
    const res = await founder.agent.get('/api/v1/units');
    const distinct = await prisma.edge.findMany({
      where: { orgId: founder.orgId, type: 'member', child: { kind: 'position' } },
      select: { parentId: true, validTo: true },
    });
    const live = distinct.filter((edge) => !edge.validTo || edge.validTo > new Date());
    expect(res.body.meta.people).toBe(new Set(live.map((edge) => edge.parentId)).size);
    expect(res.body.meta.units).toBe(4);
  });

  it('never totals a unit the caller may not see — INV-003 survives the move', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Scoped Head',
      level: 2,
      unitName: 'Section A',
    });

    const scoped = await rows(head);
    // Their world starts at Section A, so Root is absent and their total is their own
    // branch. A total computed over the WHOLE tree would disclose the size of Section B.
    expect(scoped.has('Root')).toBe(false);
    expect(scoped.has('Section B')).toBe(false);
    const whole = await rows(founder);
    expect(scoped.get('Section A')?.peopleTotal).toBeLessThan(
      whole.get('Root')?.peopleTotal ?? 0,
    );
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

/** DEC-083 — the owner's second question: not "is the number right" but "does it mean
 *  anything", asked of a hospital where sixteen of thirty people are Patients. */
describe('GET /units/:id/composition', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  const hold = async (personId: string, unitName: string, level: number): Promise<void> => {
    const orgId = founder.orgId;
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(orgId, level),
      unitIdByName(orgId, unitName),
    ]);
    const position =
      (await prisma.node.findFirst({
        where: { orgId, kind: 'position', roleId, unitId },
        select: { id: true },
      })) ??
      (await prisma.node.create({
        data: { orgId, kind: 'position', name: `${level} @ ${unitName}`, roleId, unitId },
        select: { id: true },
      }));
    await prisma.edge.create({
      data: { orgId, type: 'member', parentId: personId, childId: position.id },
    });
    clearGrantCache();
  };

  const person = async (name: string): Promise<string> => {
    const row = await prisma.node.create({
      data: { orgId: founder.orgId, kind: 'person', name },
      select: { id: true },
    });
    return row.id;
  };

  it('breaks the branch down by role, in ladder order', async () => {
    const root = await unitIdByName(founder.orgId, 'Root');
    await hold(await person('Learner One'), 'Team A1', 4);
    await hold(await person('Learner Two'), 'Team A1', 4);
    await hold(await person('Tutor One'), 'Section A', 3);

    const res = await founder.agent.get(`/api/v1/units/${root}/composition`);
    expect(res.status).toBe(200);
    const rows = res.body.data.byRole as Array<{ roleName: string; count: number; level: number }>;
    // Level ascending, so the panel reads the way /app/roles does rather than by size.
    expect(rows.map((row) => row.level)).toEqual([...rows.map((row) => row.level)].sort());
    expect(rows.find((row) => row.roleName === 'Learner')?.count).toBe(2);
    expect(rows.find((row) => row.roleName === 'Tutor')?.count).toBe(1);
  });

  it('counts a person once per role however many units they hold it in', async () => {
    const root = await unitIdByName(founder.orgId, 'Root');
    const busy = await person('Busy Tutor');
    await hold(busy, 'Team A1', 3);
    await hold(busy, 'Section B', 3);

    const res = await founder.agent.get(`/api/v1/units/${root}/composition`);
    const tutors = (res.body.data.byRole as Array<{ roleName: string; count: number }>).find(
      (row) => row.roleName === 'Tutor',
    );
    // Two positions, one Tutor. The row is distinct within itself.
    expect(tutors?.count).toBe(2);
  });

  it('lets the rows exceed the total rather than pretending they partition it', async () => {
    const root = await unitIdByName(founder.orgId, 'Root');
    const both = await person('Wears Two Hats');
    await hold(both, 'Team A1', 3);
    await hold(both, 'Team A1', 4);

    const res = await founder.agent.get(`/api/v1/units/${root}/composition`);
    const { total, byRole } = res.body.data as {
      total: number;
      byRole: Array<{ count: number }>;
    };
    // Somebody holding two roles is honestly in both rows, so the sum may pass the total.
    // The panel says so out loud; what must never happen is the total being inflated.
    expect(byRole.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(total);
    const distinct = await prisma.edge.findMany({
      where: { orgId: founder.orgId, type: 'member', child: { kind: 'position' } },
      select: { parentId: true },
    });
    expect(total).toBe(new Set(distinct.map((edge) => edge.parentId)).size);
  });

  it('never counts past the caller’s own scope — INV-003', async () => {
    const head = await addStaff(founder.orgId, {
      name: 'Composition Head',
      level: 2,
      unitName: 'Section A',
    });
    const root = await unitIdByName(founder.orgId, 'Root');
    const sectionA = await unitIdByName(founder.orgId, 'Section A');

    // Root is outside their subtree entirely, so it is a 404 — not a 403, which would
    // confirm it exists (13 §5).
    expect((await head.agent.get(`/api/v1/units/${root}/composition`)).status).toBe(404);

    const mine = await head.agent.get(`/api/v1/units/${sectionA}/composition`);
    const whole = await founder.agent.get(`/api/v1/units/${root}/composition`);
    // And their own branch's breakdown is smaller than the org's — a composition that
    // walked the real subtree would leak the size of Section B through its role rows.
    expect(mine.body.data.total).toBeLessThan(whole.body.data.total);
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
    // In the ORG'S noun. This line asserted `/1 unit/` until T-044, which is to say it was
    // pinning the bug in place: the message said "unit" because the code hardcoded it, and
    // the test agreed. The count and the word have to agree too — see vocabulary-server
    // for the full assertion (22 §5, §6).
    expect(res.body.error.message).toMatch(/1 section/);
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
