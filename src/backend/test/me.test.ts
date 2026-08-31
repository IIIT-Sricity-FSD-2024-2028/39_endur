// The capability set /auth/me hands the app.
// The set is USABILITY, never enforcement: the last test proves the API still refuses an action the
// set happens to advertise. If that one fails, the bug is in the route rather than here.
// It is a map of capability to widest-held scope, so a menu can tell "only myself" from "a whole unit",
// and the tests written before the scope existed read unchanged, which is itself the point.
import { beforeAll, describe, expect, it } from 'vitest';
import { CAPABILITIES, SCOPES, type HeldCapabilities } from '@endur/shared';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';
import { addStaff, denyPerson, setUpOrg, unitIdByName, type Session } from './helpers.js';

let founder: Session;

beforeAll(async () => {
  founder = await setUpOrg('university');
});

const heldOf = async (session: Session): Promise<HeldCapabilities> => {
  const res = await session.agent.get('/api/v1/auth/me');
  expect(res.status).toBe(200);
  return res.body.capabilities as HeldCapabilities;
};

// The verbs alone: the right question for every test about WHICH capabilities are reported rather
// than how far they reach.
const capabilitiesOf = async (session: Session): Promise<string[]> =>
  Object.keys(await heldOf(session));

describe('GET /auth/me', () => {
  it('returns the whole boot payload in one call — session, org, labels, capabilities', async () => {
    const res = await founder.agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(founder.userId);
    expect(res.body.organization.id).toBe(founder.orgId);
    // The vocabulary rides along, so the first paint is already in the organisation's own words.
    expect(res.body.labels.unit.one).toBe('Section');
    expect(typeof res.body.capabilities).toBe('object');
    expect(Array.isArray(res.body.capabilities)).toBe(false);
  });

  it('reports only capabilities that exist in the catalogue', async () => {
    const known = new Set<string>(CAPABILITIES);
    for (const capability of await capabilitiesOf(founder)) {
      expect(known.has(capability)).toBe(true);
    }
  });

  it('gives the founder a working set, not an empty one', async () => {
    const held = await capabilitiesOf(founder);
    expect(held).toContain('campaign.create');
    expect(held).toContain('unit.create');
  });

  it('gives a junior far fewer than the founder', async () => {
    const learner = await addStaff(founder.orgId, {
      name: 'Learner One', level: 4, unitName: 'Section A',
    });
    const [senior, junior] = [await capabilitiesOf(founder), await capabilitiesOf(learner)];
    expect(junior.length).toBeLessThan(senior.length);
    expect(junior).not.toContain('org.update');
  });

  it('is sorted and free of duplicates, so a diff between two sets is readable', async () => {
    const held = await capabilitiesOf(founder);
    expect([...held].sort()).toEqual(held);
    // Now structural, because map keys cannot repeat - but the assertion stays, since it is the property
    // being promised rather than the mechanism.
    expect(new Set(held).size).toBe(held.length);
  });
});

// The map exists so a menu can ask "does this reach past myself".
describe('scope', () => {
  it('names a scope from the catalogue for every capability it reports', async () => {
    const known = new Set<string>(SCOPES);
    const held = await heldOf(founder);
    expect(Object.keys(held).length).toBeGreaterThan(0);
    for (const scope of Object.values(held)) expect(known.has(scope as string)).toBe(true);
  });

  it('separates the universal `person.read: self` from a real one — the whole of D-027', async () => {
    // Every role is seeded the self-scope read so the profile page opens, which is why the VERB alone is
    // useless as a menu gate: the founder and a junior account both hold it.
    const learner = await addStaff(founder.orgId, {
      name: 'Scope Learner', level: 4, unitName: 'Section A',
    });
    const [senior, junior] = [await heldOf(founder), await heldOf(learner)];

    expect(junior['person.read']).toBe('self');
    expect(senior['person.read']).toBe('subtree');
    // The verb alone cannot tell these two apart, which is exactly the bug.
    expect(Object.keys(junior)).toContain('person.read');
    expect(Object.keys(senior)).toContain('person.read');
  });

  it('reports the WIDEST allow when a capability is held more than once', async () => {
    const staff = await addStaff(founder.orgId, {
      name: 'Two Hats', level: 3, unitName: 'Section A',
    });
    expect((await heldOf(staff))['campaign.read']).toBe('own_unit');

    // A second, wider grant on the person themselves. The narrow one is still live, and the question the
    // map answers is "is there anywhere this reaches further".
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: staff.userId },
      select: { id: true },
    });
    await prisma.grant.create({
      data: {
        orgId: founder.orgId, subjectId: person.id,
        capability: 'campaign.read', scope: 'subtree', effect: 'allow',
      },
    });
    clearGrantCache();

    expect((await heldOf(staff))['campaign.read']).toBe('subtree');
  });

  it('gives the lowest level `subject.read` and nothing else in `organize`', async () => {
    // The owner's ask, translated out of the university preset: the most junior role sees the subjects
    // list and nothing else. This asserts what EVERY organisation gets, not a fixture.
    const learner = await addStaff(founder.orgId, {
      name: 'Organize Learner', level: 4, unitName: 'Section B',
    });
    const held = await heldOf(learner);

    expect(held['subject.read']).toBe('own_unit');
    expect(held['unit.read']).toBeUndefined();
    expect(held['role.read']).toBeUndefined();
    // The self-scope read stays, because the profile page needs it: hiding a menu item is the gate's job,
    // never a reason to remove the grant.
    expect(held['person.read']).toBe('self');
  });
});

describe('denies', () => {
  it('drops a capability denied ORG-WIDE — the one deny no target can escape', async () => {
    const staff = await addStaff(founder.orgId, {
      name: 'Denied Head', level: 1, unitName: 'Section A',
    });
    expect(await capabilitiesOf(staff)).toContain('subject.create');

    await denyPerson(founder.orgId, staff.userId, 'subject.create', 'all');
    expect(await capabilitiesOf(staff)).not.toContain('subject.create');
  });

  it('KEEPS a capability denied only at one unit — deliberately', async () => {
    // Subtracting a unit-scoped deny would hide a button the person can legitimately use next door.
    // The server still refuses the denied unit, with its trace.
    const staff = await addStaff(founder.orgId, {
      name: 'Partly Denied', level: 1, unitName: 'Section A',
    });
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: staff.userId },
      select: { id: true },
    });
    const edge = await prisma.edge.findFirstOrThrow({
      where: { orgId: founder.orgId, type: 'member', parentId: person.id },
      select: { childId: true },
    });
    await prisma.grant.create({
      data: {
        orgId: founder.orgId, subjectId: edge.childId,
        capability: 'subject.create', scope: 'own_unit', effect: 'deny',
      },
    });
    clearGrantCache();

    expect(await capabilitiesOf(staff)).toContain('subject.create');
    // And it does not narrow the reported scope either: a deny on one section is no reason to tell the
    // client that a wider allow stops there.
    expect((await heldOf(staff))['subject.create']).toBe('subtree');
  });

  it('never turns the set into an authorisation decision (INV-003)', async () => {
    const learner = await addStaff(founder.orgId, {
      name: 'Learner Two', level: 4, unitName: 'Section B',
    });
    const held = await capabilitiesOf(learner);
    expect(held).not.toContain('unit.create');

    // The route refuses because the middleware says so, not because the client read this list and
    // declined to render a button.
    const unitId = await unitIdByName(founder.orgId, 'Root');
    const res = await learner.agent
      .post('/api/v1/units')
      .set('X-CSRF-Token', learner.csrf)
      .send({ name: 'Sneaky', parentId: unitId });
    expect(res.status).toBe(403);
  });
});
