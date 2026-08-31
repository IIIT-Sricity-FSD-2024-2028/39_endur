// The escalation bound: you cannot create somebody more powerful than you are.
// The hole it closes was live in shipped code with no bug to point at - the resolver worked exactly as
// specified, because nobody had specified that CREATING AN ACTOR is a different question from ACTING.
// Every test here is written so that removing the guard fails it.
// The seeded ladder is Principal, Section Head, Tutor, Learner, and it is strictly nested.
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

// Somebody with no positions, so there is always a person to assign TO.
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
    // A Section Head anchored at Section A, whose assigning reaches exactly that unit - anything below
    // is already out of scope at the capability check and never reaches this guard.
    head = await addStaff(founder.orgId, {
      name: 'Head',
      level: 2,
      unitName: 'Section A',
    });
    target = await barePerson(founder.orgId, 'Newcomer');
    clearGrantCache();
  });

  // The hole, and note the unit: Section A, which the head may legitimately assign at.
  // Before the guard this returned 201, and the new position carried an org-wide power.
  it('refuses a caller who would assign a role more powerful than their own', async () => {
    const [roleId, unitId] = await Promise.all([
      roleIdByLevel(founder.orgId, 1), // Principal
      unitIdByName(founder.orgId, 'Section A'),
    ]);

    // The takeover this prevents is real: that role, at that unit, confers control of the grant tables.
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

    // It NAMES the power, because a bare refusal reads as a bug to somebody who can see they hold the
    // capability and just used it on the row above.
    const named = res.body.error.details.capability as string;
    expect(typeof named).toBe('string');
    expect(res.body.error.message).toContain(named);

    // And the named power really is beyond the head AT THAT UNIT. Asserted through the resolver, because
    // the bound is about REACH rather than possession.
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

  // The other half, and it is not padding: a guard that refused everything would pass the test above,
  // while making the product unusable for exactly the delegation the org graph exists to express.
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

  // The founder holds everything everywhere, so no candidate can exceed them - if this broke, no seeded
  // organisation could staff itself.
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

  // The deny corollary: without it, a deny is escapable by proxy - you cannot launch a campaign, so you
  // appoint somebody who can.
  it('refuses when a capability the caller is DENIED would be conferred', async () => {
    // A per-person deny at a UNIT scope, which is the shape an administrator would actually reach for.
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
    // The denied capability is removed from the head's reach at that unit, so the subset test fails on
    // that capability by itself - there is no special case for denies anywhere in the bound.
    expect(res.body.error.details.capability).toBe('campaign.launch');
  });

  // Computed from the resolver, NEVER from a role's level number: a level comparison would say "4 is
  // below 2, allow it" and hand over a capability the caller does not have.
  it('is computed from grants and not from the role level', async () => {
    const learner = await roleIdByLevel(founder.orgId, 4);
    // The LOWEST role now carries the most dangerous capability, and nothing about its level changed.
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

// The import creates positions too, so without a bound here the guard on the single-assignment route
// is bypassable in ONE call by naming a senior role in a one-row CSV.
describe('INV-012 — the bulk path carries the same bound', () => {
  let founder: Session;
  let head: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
    head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    // This level does not hold the import capability by default, so it is granted explicitly: that is the
    // realistic shape of the hole - an administrator hands out one bulk-entry capability and nothing else.
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

    // And nothing was written: the guard runs before the handler, so the refusal is not a partial import rolled back.
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

  // A mapping confirmed in the preview is the operator answering "did you mean", and the guard has to
  // read it, or it would bound against a role nobody was creating.
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
