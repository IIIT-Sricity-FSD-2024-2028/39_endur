// T-071 — INV-012, the escalation bound. 11 §5b, DEC-039, D-018.
//
// The hole this closes was live in shipped code and there was no bug to point at: the
// resolver worked exactly as specified, because nobody had specified that CREATING AN
// ACTOR is a different question from ACTING. Every test here is written so that removing
// the guard fails it.
//
// Seeded levels (helpers.SETUP_ROLES): 1 Principal · 2 Section Head · 3 Tutor · 4 Learner.
// The seeded matrix (presets/grant-matrix.ts) is strictly nested by level, so a Section
// Head legitimately outranks a Tutor and legitimately does NOT outrank a Principal.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addStaff,
  denyPerson,
  roleIdByLevel,
  setUpOrg,
  unitIdByName,
  unique,
  withCsrf,
  type Session,
} from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache, visibleUnits } from '../authz/index.js';

/** Somebody with no positions, so there is always a person to assign TO. */
async function barePerson(orgId: string, name: string): Promise<string> {
  const user = await prisma.user.create({
    data: { orgId, email: `${unique('subject')}@example.test`, name },
    select: { id: true },
  });
  const person = await prisma.node.create({
    data: { orgId, kind: 'person', name, userId: user.id },
    select: { id: true },
  });
  return person.id;
}

describe('INV-012 — you cannot hand out what you do not hold', () => {
  let founder: Session;
  let head: Session;
  let target = '';

  beforeEach(async () => {
    founder = await setUpOrg();
    // A Section Head anchored at Section A. At level 2 the seeded matrix gives
    // `assignment.create: own_unit`, so their assigning reaches SECTION A EXACTLY —
    // Team A1 is already out of scope at link 10 and never reaches this guard.
    head = await addStaff(founder.orgId, {
      name: 'Head',
      level: 2,
      unitName: 'Section A',
    });
    target = await barePerson(founder.orgId, 'Newcomer');
    clearGrantCache();
  });

  // THE HOLE, and note the unit: SECTION A, which the head may legitimately assign at.
  // Before the guard this returned 201, and the new position carried the Principal role's
  // `grant.update: all` — a scope that ignores the anchor entirely, so a position created
  // inside one section handed over THE WHOLE ORGANISATION. Every check passed.
  it('refuses a caller who would assign a role more powerful than their own', async () => {
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(founder.orgId, 1), // Principal
      unitIdByName(founder.orgId, 'Section A'),
    ]);

    // The takeover this prevents is real and not hypothetical: that role, at that unit,
    // confers org-wide control of the grant tables.
    const orgWide = await prisma.grant.findFirst({
      where: { orgId: founder.orgId, subjectId: roleId, capability: 'grant.update', scope: 'all' },
      select: { id: true },
    });
    expect(orgWide).not.toBeNull();

    const res = await withCsrf(head, 'post', `/api/v1/people/${target}/assignments`).send({
      roleId,
      unitId,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');

    // It NAMES the power. A bare refusal reads as a bug to somebody who can see they hold
    // `assignment.create` and just used it on the row above (11 §5b).
    const named = res.body.error.details.capability as string;
    expect(typeof named).toBe('string');
    expect(res.body.error.message).toContain(named);

    // And the named power is genuinely beyond the head AT THE UNIT NAMED. Asserted through
    // the resolver rather than by looking for a missing grant row, because the bound is
    // about REACH, not possession: the first thing it catches here is the Principal role
    // widening `assignment.create` from `own_unit` to `subtree`, which is a capability the
    // head does hold — just not as far.
    const reach = await visibleUnits({
      orgId: founder.orgId,
      userId: head.userId,
      capability: named as never,
    });
    const namedUnit = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'unit', name: res.body.error.details.unitName as string },
      select: { id: true },
    });
    expect(reach.all).toBe(false);
    expect(reach.all ? [] : reach.unitIds).not.toContain(namedUnit.id);
  });

  // The other half, and it is not padding: a guard that refused everything would pass the
  // test above. Over-refusal would make the product unusable for exactly the delegation
  // the org graph exists to express.
  it('allows a caller to assign a role weaker than their own, inside their scope', async () => {
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(founder.orgId, 3), // Tutor
      unitIdByName(founder.orgId, 'Section A'), // the head's own unit — where they may assign
    ]);

    const res = await withCsrf(head, 'post', `/api/v1/people/${target}/assignments`).send({
      roleId,
      unitId,
    });

    expect(res.status).toBe(201);
  });

  // The founder holds everything at `all`, so no candidate reach can exceed theirs. If this
  // broke, every seeded organisation would be unable to staff itself.
  it('does not stand in the way of an owner assigning the most senior role', async () => {
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(founder.orgId, 1),
      unitIdByName(founder.orgId, 'Root'),
    ]);

    const res = await withCsrf(founder, 'post', `/api/v1/people/${target}/assignments`).send({
      roleId,
      unitId,
    });

    expect(res.status).toBe(201);
  });

  // THE DENY COROLLARY. Without it a deny is escapable by proxy — you cannot launch a
  // campaign, so you appoint somebody who can — and INV-004 becomes a suggestion.
  it('refuses when a capability the caller is DENIED would be conferred', async () => {
    // A per-person deny at a UNIT scope, which is the shape an administrator would actually
    // reach for — "block this person here". It did nothing at all until D-020 was repaid
    // (collect.ts now anchors a person-node grant at their home unit), and this test was
    // written against scope `all` for exactly one afternoon because of it.
    await denyPerson(founder.orgId, head.userId, 'campaign.launch', 'subtree');

    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(founder.orgId, 3), // Tutor — allowed a moment ago, in the test above
      unitIdByName(founder.orgId, 'Section A'),
    ]);

    const res = await withCsrf(head, 'post', `/api/v1/people/${target}/assignments`).send({
      roleId,
      unitId,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
    // Tutor carries `campaign.launch: own_unit` at Section A; the head's deny is anchored at
    // Section A too, so `subtree` removes Section A and Team A1 from their reach for it.
    // The subset test then fails on that capability by itself — there is no special case
    // for denies anywhere in the bound, which is the property being asserted.
    expect(res.body.error.details.capability).toBe('campaign.launch');
  });

  // 11 §5b: computed from resolve(), NEVER from Node.level. A level comparison would say
  // "4 is below 2, allow it" and hand over a capability the caller does not have.
  it('is computed from grants and not from the role level', async () => {
    const learner = await roleIdByLevel(founder.orgId, 4);
    // The LOWEST role now carries the most dangerous capability in the system. Nothing
    // about its level changed.
    await prisma.grant.create({
      data: {
        orgId: founder.orgId,
        subjectId: learner,
        capability: 'grant.update',
        scope: 'all',
        effect: 'allow',
      },
    });
    clearGrantCache();

    const unitId = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(head, 'post', `/api/v1/people/${target}/assignments`).send({
      roleId: learner,
      unitId,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
    expect(res.body.error.details.capability).toBe('grant.update');
  });
});

// The import creates positions too, behind `person.import` alone. Without a bound here the
// guard on /:id/assignments is bypassable in ONE call by naming a senior role in a one-row
// CSV — which is worse than no guard, because the board would say the hole was repaid.
describe('INV-012 — the bulk path carries the same bound', () => {
  let founder: Session;
  let head: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
    head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    // Level 2 does not hold `person.import` in the seeded matrix (it is level 1 only), so
    // the head is granted it explicitly. That is the realistic shape of this hole: an
    // administrator hands out one bulk-entry capability and nothing else.
    await prisma.grant.create({
      data: {
        orgId: founder.orgId,
        subjectId: await roleIdByLevel(founder.orgId, 2),
        capability: 'person.import',
        scope: 'subtree',
        effect: 'allow',
      },
    });
    clearGrantCache();
  });

  it('refuses an import row that would create a position above the importer', async () => {
    const res = await withCsrf(head, 'post', '/api/v1/people/import').send({
      rows: [
        { name: 'Smuggled In', email: `${unique('smuggle')}@example.test`,
          roleName: 'Principal', unitName: 'Section A' },
      ],
      roleMapping: {},
      unitMapping: {},
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');

    // And nothing was written. The guard runs before the handler, so the refusal is not a
    // rollback of a partial import.
    const created = await prisma.user.count({
      where: { orgId: founder.orgId, name: 'Smuggled In' },
    });
    expect(created).toBe(0);
  });

  it('still imports rows that stay within what the importer holds', async () => {
    const res = await withCsrf(head, 'post', '/api/v1/people/import').send({
      rows: [
        { name: 'Ordinary Hire', email: `${unique('ok')}@example.test`,
          roleName: 'Tutor', unitName: 'Section A' },
      ],
      roleMapping: {},
      unitMapping: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.assigned).toBe(1);
  });

  // An explicit mapping from the preview step is the operator answering "did you mean",
  // and the guard has to read it — otherwise a CSV whose column says "Staff" while the
  // mapping points at Principal would be bounded against a role nobody was creating.
  it('bounds the role the MAPPING points at, not the name in the file', async () => {
    const res = await withCsrf(head, 'post', '/api/v1/people/import').send({
      rows: [
        { name: 'Mapped In', email: `${unique('mapped')}@example.test`,
          roleName: 'Some External Title', unitName: 'Section A' },
      ],
      roleMapping: { 'Some External Title': await roleIdByLevel(founder.orgId, 1) },
      unitMapping: {},
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
  });
});
