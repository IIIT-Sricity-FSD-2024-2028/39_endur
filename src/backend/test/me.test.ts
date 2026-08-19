// T-028/T-029 — the capability set that /auth/me hands the SPA. 13 § Auth, 20 §6.
//
// The set is USABILITY, NEVER ENFORCEMENT (INV-003), and these tests are written to hold
// that line rather than blur it: the last one proves the API still refuses an action the
// set happens to advertise. If that test ever fails, the bug is in the route, not here.
import { beforeAll, describe, expect, it } from 'vitest';
import { CAPABILITIES } from '@endur/shared';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';
import { addStaff, denyPerson, setUpOrg, unitIdByName, type Session } from './helpers.js';

let founder: Session;

beforeAll(async () => {
  founder = await setUpOrg('university');
});

const capabilitiesOf = async (session: Session): Promise<string[]> => {
  const res = await session.agent.get('/api/v1/auth/me');
  expect(res.status).toBe(200);
  return res.body.capabilities as string[];
};

describe('GET /auth/me', () => {
  it('returns the whole boot payload in one call — session, org, labels, capabilities', async () => {
    const res = await founder.agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(founder.userId);
    expect(res.body.organization.id).toBe(founder.orgId);
    // The vocabulary rides along so the first paint is already in the org's own words.
    expect(res.body.labels.unit.one).toBe('Section');
    expect(Array.isArray(res.body.capabilities)).toBe(true);
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
    expect(new Set(held).size).toBe(held.length);
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
    // Subtracting a unit-anchored deny would hide a button the person can legitimately
    // use in the unit next door. The server still refuses the denied unit, with its trace.
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
  });

  it('never turns the set into an authorisation decision (INV-003)', async () => {
    const learner = await addStaff(founder.orgId, {
      name: 'Learner Two', level: 4, unitName: 'Section B',
    });
    const held = await capabilitiesOf(learner);
    expect(held).not.toContain('unit.create');

    // The route refuses because requireCapability() says so — not because the client
    // read the list above and declined to render a button.
    const unitId = await unitIdByName(founder.orgId, 'Root');
    const res = await learner.agent
      .post('/api/v1/units')
      .set('X-CSRF-Token', learner.csrf)
      .send({ name: 'Sneaky', parentId: unitId });
    expect(res.status).toBe(403);
  });
});
