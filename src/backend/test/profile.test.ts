// The profile routes.
// Most of what matters here is what the route CANNOT do: it cannot change an email, it cannot be
// pointed at somebody else, and it cannot fail to open for the most junior role - each of which
// would fail silently until somebody at that level actually signed in.
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../db/client.js';
import request from 'supertest';
import { clearGrantCache } from '../authz/index.js';
import { addStaff, app, denyPerson, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';

let founder: Session;

beforeAll(async () => {
  founder = await setUpOrg('university');
});

const profileOf = async (session: Session) => {
  const res = await session.agent.get('/api/v1/profile');
  expect(res.status).toBe(200);
  return res.body.data as {
    user: { id: string; name: string; email: string; avatarUrl: string | null; lastLoginAt: string | null };
    positions: Array<{ roleName: string; roleLevel: number | null; unitId: string | null; unitName: string; validTo: string | null }>;
    powersByPlace: Array<{ unitId: string; unitName: string; roleName: string; capabilities: Array<{ capability: string; scope: string }> }>;
  };
};

describe('GET /profile', () => {
  it('answers with the caller, their positions and their powers', async () => {
    const profile = await profileOf(founder);
    expect(profile.user.id).toBe(founder.userId);
    expect(profile.positions.length).toBeGreaterThan(0);
    expect(profile.powersByPlace.length).toBeGreaterThan(0);
  });

  it('OPENS FOR SOMEBODY WITH NO ADMINISTRATIVE CAPABILITY AT ALL — 47 § Acceptance', async () => {
    // The lowest role holds only a handful of grants, including the two universal self ones. If this ever
    // 403s, the seed has lost the self read and a whole page becomes unopenable.
    const learner = await addStaff(founder.orgId, {
      name: 'Profile Learner', level: 4, unitName: 'Section A',
    });
    const profile = await profileOf(learner);
    expect(profile.user.id).toBe(learner.userId);
    expect(profile.positions).toHaveLength(1);
  });

  it('carries the level and the expiry on every position — 47 § Interactions', async () => {
    const [position] = (await profileOf(founder)).positions;
    expect(position?.roleLevel).toBe(1);
    expect(position?.unitId).toBeTruthy();
    // Open ended, and null rather than absent: "no end date" is an answer.
    expect(position?.validTo).toBeNull();
  });

  it('COMES FROM THE RESOLVER — a deny takes a power off the page (INV-004)', async () => {
    // The strongest available proof that this list comes from the resolver rather than from the role's
    // grants: a person-level DENY is invisible to anything reading the seeded matrix, and it wins absolutely.
    const staff = await addStaff(founder.orgId, {
      name: 'Denied Powers', level: 1, unitName: 'Section A',
    });
    const held = (profile: Awaited<ReturnType<typeof profileOf>>) =>
      new Set((profile.powersByPlace[0]?.capabilities ?? []).map((c) => c.capability));

    expect(held(await profileOf(staff)).has('campaign.launch')).toBe(true);

    await denyPerson(founder.orgId, staff.userId, 'campaign.launch', 'all');
    const after = await profileOf(staff);
    expect(held(after).has('campaign.launch')).toBe(false);
    // And only that one went: a page that emptied would prove nothing about the deny.
    expect(held(after).size).toBeGreaterThan(1);
  });

  it('carries the SCOPE beside each capability, and it is the seeded one', async () => {
    // "You hold this here" and "you hold it everywhere below here" are different answers, and the scope
    // is the half that lets somebody answer "why can I not see that?" for themselves.
    const head = await addStaff(founder.orgId, {
      name: 'Scoped Head', level: 3, unitName: 'Section A',
    });
    const capabilities = (await profileOf(head)).powersByPlace[0]?.capabilities ?? [];
    const byName = new Map(capabilities.map((c) => [c.capability, c.scope]));
    // The read capability is the one to assert, because every role also holds it at self scope - a self
    // here would mean the page was reporting the universal grant and hiding the real one.
    expect(byName.get('campaign.read')).toBe('own_unit');
    expect(byName.get('person.read')).toBe('own_unit');
    expect(byName.get('template.read')).toBe('all');
  });

  it('PROVES INV-005 — powers on one unit do not appear under another', async () => {
    // Two positions at two DIFFERENT units, the second more junior, so its power list is strictly smaller -
    // identical rows would mean the powers were resolved against one unit twice.
    const twoHats = await addStaff(founder.orgId, {
      name: 'Two Places', level: 1, unitName: 'Section A',
    });
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: twoHats.userId },
      select: { id: true },
    });
    const [roleId, unitId] = await Promise.all([
      prisma.node.findFirstOrThrow({
        where: { orgId: founder.orgId, kind: 'role', level: 4 }, select: { id: true },
      }).then((role) => role.id),
      unitIdByName(founder.orgId, 'Section B'),
    ]);
    const position = await prisma.node.create({
      data: { orgId: founder.orgId, kind: 'position', name: 'second', roleId, unitId },
      select: { id: true },
    });
    await prisma.edge.create({
      data: { orgId: founder.orgId, type: 'member', parentId: person.id, childId: position.id },
    });
    // A new position is new grants, and the resolver caches per person and permission version.
    clearGrantCache();

    const profile = await profileOf(twoHats);
    expect(profile.powersByPlace).toHaveLength(2);
    const [a, b] = profile.powersByPlace;
    expect(a?.unitId).not.toBe(b?.unitId);
    // The unit ids are distinct AND the answers differ: distinct ids alone would still pass if the
    // resolver had been handed the same unit twice.
    expect(a?.capabilities.length).not.toBe(b?.capabilities.length);
  });

  it('KEEPS TWO SAME-NAMED UNITS APART — the bug T-051 fixed, and the only test that sees it', async () => {
    // Two units CAN share a name - "Year 1" under two faculties is the ordinary case.
    // The old code re-found the unit BY NAME, so for a person holding a position in each, both passes
    // resolved to whichever row came back first, and one unit's powers printed under the other's heading -
    // on the one screen built to show that powers do not leak between units.
    const root = await unitIdByName(founder.orgId, 'Root');
    const [twinA, twinB] = await Promise.all([
      prisma.node.create({
        data: { orgId: founder.orgId, kind: 'unit', name: 'Twin' }, select: { id: true },
      }),
      prisma.node.create({
        data: { orgId: founder.orgId, kind: 'unit', name: 'Twin' }, select: { id: true },
      }),
    ]);
    // Both hang off the root, so the founder can see them and the graph is well formed.
    await prisma.edge.createMany({
      data: [
        { orgId: founder.orgId, type: 'contains', parentId: root, childId: twinA.id },
        { orgId: founder.orgId, type: 'contains', parentId: root, childId: twinB.id },
      ],
    });

    const staff = await addStaff(founder.orgId, { name: 'Twinned', level: 4, unitName: 'Section A' });
    const person = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: staff.userId },
      select: { id: true },
    });
    // Two DIFFERENT roles, so the two places must come back with different power counts - the assertion
    // the old code could not satisfy.
    const [high, low] = await Promise.all([
      prisma.node.findFirstOrThrow({ where: { orgId: founder.orgId, kind: 'role', level: 1 }, select: { id: true } }),
      prisma.node.findFirstOrThrow({ where: { orgId: founder.orgId, kind: 'role', level: 4 }, select: { id: true } }),
    ]);
    for (const [role, unit] of [[high, twinA], [low, twinB]] as const) {
      const position = await prisma.node.create({
        data: { orgId: founder.orgId, kind: 'position', name: 'twin position', roleId: role.id, unitId: unit.id },
        select: { id: true },
      });
      await prisma.edge.create({
        data: { orgId: founder.orgId, type: 'member', parentId: person.id, childId: position.id },
      });
    }
    clearGrantCache();

    const places = (await profileOf(staff)).powersByPlace.filter((p) => p.unitName === 'Twin');
    expect(places).toHaveLength(2);
    // Two distinct units, addressed by id and not by the name they share.
    expect(new Set(places.map((p) => p.unitId)).size).toBe(2);
    expect([...new Set(places.map((p) => p.unitId))].sort()).toEqual([twinA.id, twinB.id].sort());
    // And they carry different answers, not merely different labels.
    expect(places[0]?.capabilities.length).not.toBe(places[1]?.capabilities.length);
  });
});

describe('PATCH /profile', () => {
  it('renames the caller in BOTH tables, so the list does not keep the old name', async () => {
    const staff = await addStaff(founder.orgId, {
      name: 'Before Rename', level: 2, unitName: 'Section A',
    });
    const res = await withCsrf(staff, 'patch', '/api/v1/profile').send({ name: 'After Rename' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('After Rename');

    // The name lives in two tables: writing one is the bug where somebody renames themselves and the
    // people page never notices.
    const user = await prisma.user.findFirstOrThrow({
      where: { id: staff.userId }, select: { name: true },
    });
    const node = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: staff.userId }, select: { name: true },
    });
    expect([user.name, node.name]).toEqual(['After Rename', 'After Rename']);
  });

  it('IGNORES AN EMAIL — the key does not exist on the DTO — 47 § Data contract', async () => {
    // Changing an address is an identity change and belongs to an administrator with an audit trail, so
    // the schema has no email field and it is stripped before the handler sees it.
    // Ignored rather than refused, matching the people route: being inconsistent about which unknown keys
    // are refused would be worse. What matters is that the address cannot change.
    const before = (await profileOf(founder)).user.email;
    const res = await withCsrf(founder, 'patch', '/api/v1/profile')
      .send({ name: 'Founder', email: 'somewhere-else@example.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(before);
    expect((await profileOf(founder)).user.email).toBe(before);
  });
});

describe('POST /profile/password', () => {
  const CURRENT = 'a-long-enough-password';

  it('changes it, and the new one signs in while the old one does not', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Rotator', level: 2, unitName: 'Section A' });
    const email = (await profileOf(staff)).user.email;

    const res = await withCsrf(staff, 'post', '/api/v1/profile/password')
      .send({ currentPassword: CURRENT, newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(200);

    // One agent each: a second login on an agent that just signed in carries a session, and the CSRF link
    // would then answer 403, which says nothing about the password.
    const withNew = await request.agent(app).post('/api/v1/auth/login')
      .send({ email, password: 'a-brand-new-password' });
    expect(withNew.status).toBe(200);
    const withOld = await request.agent(app).post('/api/v1/auth/login')
      .send({ email, password: CURRENT });
    expect(withOld.status).toBe(401);
  });

  it('REQUIRES THE CURRENT PASSWORD — an unattended session must not lock the owner out', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Guarded', level: 2, unitName: 'Section A' });
    const res = await withCsrf(staff, 'post', '/api/v1/profile/password')
      .send({ currentPassword: 'not-their-password', newPassword: 'a-brand-new-password' });

    // A field error, not a 401: a 401 from inside the console would sign the person out for a typo.
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields[0].path).toBe('body.currentPassword');

    // And it really did not change: the original password still works.
    const email = (await profileOf(staff)).user.email;
    const fresh = request.agent(app);
    expect((await fresh.post('/api/v1/auth/login').send({ email, password: CURRENT })).status).toBe(200);
  });

  it('REGENERATES THE SESSION ID — 15 § Session hygiene, on this route too', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Regen', level: 2, unitName: 'Section A' });
    const before = await prisma.$queryRawUnsafe<Array<{ sid: string }>>(
      'SELECT sid FROM sessions WHERE sess::text LIKE $1', `%${staff.userId}%`,
    );
    expect(before.length).toBeGreaterThan(0);

    const res = await withCsrf(staff, 'post', '/api/v1/profile/password')
      .send({ currentPassword: CURRENT, newPassword: 'another-long-password' });
    expect(res.status).toBe(200);

    const after = await prisma.$queryRawUnsafe<Array<{ sid: string }>>(
      'SELECT sid FROM sessions WHERE sess::text LIKE $1', `%${staff.userId}%`,
    );
    const olds = new Set(before.map((row) => row.sid));
    expect(after.every((row) => !olds.has(row.sid))).toBe(true);

    // And the caller is still signed in: regenerating empties the session, so a route that forgets to put
    // the ids back would sign somebody out of their own password change.
    expect((await staff.agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('holds the same length floor as registration', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Shorty', level: 2, unitName: 'Section A' });
    const res = await withCsrf(staff, 'post', '/api/v1/profile/password')
      .send({ currentPassword: CURRENT, newPassword: 'short' });
    expect(res.status).toBe(422);
  });

  it('says so when the new password is the old one', async () => {
    const staff = await addStaff(founder.orgId, { name: 'Same Again', level: 2, unitName: 'Section A' });
    const res = await withCsrf(staff, 'post', '/api/v1/profile/password')
      .send({ currentPassword: CURRENT, newPassword: CURRENT });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields[0].path).toBe('body.newPassword');
  });

  it('EXPOSES NO WAY TO NAME SOMEBODY ELSE — the whole of `self` scope', async () => {
    // There is no id parameter to supply, so this asserts the SHAPE of the surface: a route that took a
    // target would be a route an administrator could point at a subordinate.
    const staff = await addStaff(founder.orgId, { name: 'No Target', level: 2, unitName: 'Section A' });
    const res = await withCsrf(staff, 'post', `/api/v1/profile/password/${founder.userId}`)
      .send({ currentPassword: CURRENT, newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(404);
  });
});
