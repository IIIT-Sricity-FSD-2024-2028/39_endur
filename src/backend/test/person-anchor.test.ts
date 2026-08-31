// Where a per-person grant anchors.
// The person node used to be registered with no unit, so a per-person deny at a unit scope did
// NOTHING: an administrator blocking somebody inside their department wrote a row that looked like it
// worked. It survived four audits because every existing test used the 'all' scope, which needs no
// anchor - so these tests use the unit scopes on purpose.
import { beforeEach, describe, expect, it } from 'vitest';
import { addStaff, denyPerson, roleIdByLevel, setUpOrg, unitIdByName, unique, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache, resolve, visibleUnits } from '../authz/index.js';


describe('a per-person grant anchors at the home unit', () => {
  let founder: Session;
  let head: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
    // The helper flags the position primary, which is the ordinary shape.
    head = await addStaff(founder.orgId, { name: 'Head', level: 2, unitName: 'Section A' });
    clearGrantCache();
  });

  // The bug, as a test: before the fix this was allowed, because the deny was inert.
  it('makes a per-person deny at `subtree` actually deny', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');

    const before = await resolve({
      orgId: founder.orgId,
      userId: head.userId,
      capability: 'campaign.launch',
      target: { kind: 'unit', unitId: sectionA },
    });
    expect(before.allowed).toBe(true);

    await denyPerson(founder.orgId, head.userId, 'campaign.launch', 'subtree');

    const after = await resolve({
      orgId: founder.orgId,
      userId: head.userId,
      capability: 'campaign.launch',
      target: { kind: 'unit', unitId: sectionA },
    });
    expect(after.allowed).toBe(false);
    expect(after.reason).toBe('explicit_deny');
    // The trace names the deny that stopped it, and that it came through the PERSON.
    expect(after.decidedBy?.via).toBe('person');
  });

  // The list side has to agree with the resolver, or rows come back in a list while the same target
  // 403s on the detail route.
  it('subtracts the same deny from the list-filtering reach', async () => {
    const teamA1 = await unitIdByName(founder.orgId, 'Team A1');

    const before = await visibleUnits({
      orgId: founder.orgId,
      userId: head.userId,
      capability: 'campaign.read',
    });
    expect(before.all ? [] : before.unitIds).toContain(teamA1);

    await denyPerson(founder.orgId, head.userId, 'campaign.read', 'subtree');

    const after = await visibleUnits({
      orgId: founder.orgId,
      userId: head.userId,
      capability: 'campaign.read',
    });
    expect(after.all ? [] : after.unitIds).not.toContain(teamA1);
  });

  // 'own_unit' is the narrow half: the anchor exactly, and not the subtree below it.
  it('honours `own_unit` as the home unit exactly, not its descendants', async () => {
    const [sectionA, teamA1] = await Promise.all([
      unitIdByName(founder.orgId, 'Section A'),
      unitIdByName(founder.orgId, 'Team A1'),
    ]);
    await denyPerson(founder.orgId, head.userId, 'campaign.launch', 'own_unit');

    const here = await resolve({
      orgId: founder.orgId, userId: head.userId,
      capability: 'campaign.launch', target: { kind: 'unit', unitId: sectionA },
    });
    const below = await resolve({
      orgId: founder.orgId, userId: head.userId,
      capability: 'campaign.launch', target: { kind: 'unit', unitId: teamA1 },
    });

    expect(here.allowed).toBe(false);
    // The wider allow still reaches the unit below, so the deny stopped at its own anchor rather than
    // sweeping the branch.
    expect(below.allowed).toBe(true);
  });

  // A per-person ALLOW was inert in exactly the same way, and it is the half that would have been
  // noticed last: a grant that fails to grant looks like a mistake, a deny that fails looks like nothing.
  it('makes a per-person allow at `own_unit` actually grant', async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: head.userId },
      select: { id: true },
    });
    // This level holds no audit read anywhere in the seeded matrix.
    await prisma.grant.create({
      data: {
        orgId: founder.orgId, subjectId: person.id,
        capability: 'audit.read', scope: 'own_unit', effect: 'allow',
      },
    });
    clearGrantCache();

    const decision = await resolve({
      orgId: founder.orgId, userId: head.userId,
      capability: 'audit.read', target: { kind: 'unit', unitId: sectionA },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.decidedBy?.via).toBe('person');
  });
});

describe('the home unit when there is no primary position', () => {
  let founder: Session;

  beforeEach(async () => {
    founder = await setUpOrg();
    clearGrantCache();
  });

  // One position, deliberately NOT flagged primary, which is what the ordinary call produces.
  async function staffWithUnflaggedPosition(unitNames: string[]): Promise<string> {
    const email = `${unique('anchor')}@example.test`;
    const user = await prisma.user.create({
      data: { orgId: founder.orgId, email, name: 'Unflagged' },
      select: { id: true },
    });
    const person = await prisma.node.create({
      data: { orgId: founder.orgId, kind: 'person', name: 'Unflagged', userId: user.id },
      select: { id: true },
    });
    const roleId = await roleIdByLevel(founder.orgId, 3);
    for (const unitName of unitNames) {
      const unitId = await unitIdByName(founder.orgId, unitName);
      const position = await prisma.node.create({
        data: { orgId: founder.orgId, kind: 'position', name: `T @ ${unitName}`, roleId, unitId },
        select: { id: true },
      });
      await prisma.edge.create({
        data: {
          orgId: founder.orgId, type: 'member',
          parentId: person.id, childId: position.id,
          isPrimary: false, // the default, and the reason the anchor rule has a fallback
        },
      });
    }
    clearGrantCache();
    return user.id;
  }

  // The fallback: because primary defaults to false, the ordinary "give this person a position" call
  // produces no primary at all, and a strict primary-only rule would leave overrides inert.
  it('falls back to a LONE position when nothing is flagged primary', async () => {
    const userId = await staffWithUnflaggedPosition(['Section A']);
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    await denyPerson(founder.orgId, userId, 'campaign.read', 'own_unit');

    const decision = await resolve({
      orgId: founder.orgId, userId,
      capability: 'campaign.read', target: { kind: 'unit', unitId: sectionA },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('explicit_deny');
  });

  // Two positions and no primary is genuine ambiguity, which is what the primary flag exists to resolve:
  // picking one would anchor an override at whichever row came back first.
  it('refuses to guess between TWO unflagged positions, and says so in the trace', async () => {
    const userId = await staffWithUnflaggedPosition(['Section A', 'Section B']);
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    await denyPerson(founder.orgId, userId, 'campaign.read', 'own_unit');

    const decision = await resolve({
      orgId: founder.orgId, userId,
      capability: 'campaign.read', target: { kind: 'unit', unitId: sectionA },
    });
    // The deny does not apply — and this is the ONE case where an inert unit-scoped person
    // grant is correct rather than a bug, because there is no defensible unit to use.
    expect(decision.reason).not.toBe('explicit_deny');
    // It is not silent: the trace records why, so 42's simulator can explain it.
    const personGrant = decision.considered.find((c) => c.via === 'person');
    expect(personGrant?.rejectedBecause).toContain('anchor');
  });

  // The original rule, unchanged: no position means self-scope only.
  it('gives no anchor at all to somebody with no positions', async () => {
    const userId = await staffWithUnflaggedPosition([]);
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    await denyPerson(founder.orgId, userId, 'campaign.read', 'subtree');

    const decision = await resolve({
      orgId: founder.orgId, userId,
      capability: 'campaign.read', target: { kind: 'unit', unitId: sectionA },
    });
    expect(decision.reason).not.toBe('explicit_deny');
  });
});
