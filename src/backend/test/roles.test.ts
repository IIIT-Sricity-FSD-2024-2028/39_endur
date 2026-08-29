// T-017 — roles and the powers grid. 13, 33, 11 §8.
//
// The grid is where an administrator changes what a role can do. Three properties decide
// whether it can be trusted: levels come from order and never from the client, a saved cell
// stops being `derived` so regeneration cannot revert it, and `scope: null` genuinely
// removes a power rather than storing an empty one.
import { beforeAll, describe, expect, it } from 'vitest';
import { addStaff, setUpOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

describe('GET /roles', () => {
  it('lists the wizard roles in level order with their people counts', async () => {
    const founder = await setUpOrg();
    const res = await founder.agent.get('/api/v1/roles');

    expect(res.status).toBe(200);
    const roles = res.body.data as Array<{ name: string; level: number; peopleCount: number }>;
    expect(roles.map((role) => role.name)).toEqual([
      'Principal',
      'Section Head',
      'Tutor',
      'Learner',
    ]);
    expect(roles.map((role) => role.level)).toEqual([1, 2, 3, 4]);
    expect(roles[0]?.peopleCount).toBe(1);
  });
});

describe('POST /roles and POST /roles/reorder', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg();
  });

  it('adds a role at the bottom, holding no powers at all', async () => {
    const res = await withCsrf(founder, 'post', '/api/v1/roles').send({ name: 'Visitor' });

    expect(res.status).toBe(201);
    expect(res.body.data.level).toBe(5);
    // Default deny is the floor (11 §5). Copying the level's seeded matrix here would hand
    // out powers nobody chose, and the grid is where powers are chosen.
    expect(res.body.data.grantCount).toBe(0);
  });

  it('derives levels from the order of the array, never from a sent field', async () => {
    const before = await founder.agent.get('/api/v1/roles');
    const ids = (before.body.data as Array<{ id: string; name: string }>).map((role) => role.id);
    const reversed = [...ids].reverse();

    const res = await withCsrf(founder, 'post', '/api/v1/roles/reorder').send({
      orderedIds: reversed,
      // Ignored, and that is the point: a client-supplied level and a client-supplied order
      // can disagree, and then one of them is silently wrong (33).
      levels: [9, 9, 9, 9, 9],
    });

    expect(res.status).toBe(200);
    const roles = res.body.data as Array<{ id: string; level: number }>;
    expect(roles.map((role) => role.id)).toEqual(reversed);
    expect(roles.map((role) => role.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses a partial order rather than guessing where the rest go', async () => {
    const before = await founder.agent.get('/api/v1/roles');
    const ids = (before.body.data as Array<{ id: string }>).map((role) => role.id);

    const res = await withCsrf(founder, 'post', '/api/v1/roles/reorder').send({
      orderedIds: ids.slice(0, 2),
    });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /roles/:id', () => {
  it('refuses to delete a role people hold, and says how many', async () => {
    const founder = await setUpOrg();
    await addStaff(founder.orgId, { name: 'A Head', level: 2, unitName: 'Section A' });
    const roles = await founder.agent.get('/api/v1/roles');
    const head = (roles.body.data as Array<{ id: string; level: number }>).find(
      (role) => role.level === 2,
    );

    const res = await withCsrf(founder, 'delete', `/api/v1/roles/${head?.id}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/1 person holds/);
  });
});

describe('GET and PUT /grants — the matrix', () => {
  let founder: Session;
  let principalId = '';
  let tutorId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    const roles = await founder.agent.get('/api/v1/roles');
    const list = roles.body.data as Array<{ id: string; level: number }>;
    principalId = list.find((role) => role.level === 1)?.id ?? '';
    tutorId = list.find((role) => role.level === 3)?.id ?? '';
  });

  it('returns the seeded matrix, every row derived', async () => {
    const res = await founder.agent.get('/api/v1/grants');
    expect(res.status).toBe(200);

    const cells = res.body.data as Array<{ roleId: string; capability: string; scope: string }>;
    expect(cells).toContainEqual(
      expect.objectContaining({ roleId: principalId, capability: 'grant.update', scope: 'all' }),
    );
    expect(cells).toContainEqual(
      expect.objectContaining({ roleId: tutorId, capability: 'results.read', scope: 'own_unit' }),
    );
  });

  it('clears `derived` on every cell it writes', async () => {
    const res = await withCsrf(founder, 'put', '/api/v1/grants').send({
      cells: [{ roleId: tutorId, capability: 'subject.create', scope: 'own_unit', effect: 'allow' }],
    });
    expect(res.status).toBe(200);

    const grant = await prisma.grant.findFirstOrThrow({
      where: { orgId: founder.orgId, subjectId: tutorId, capability: 'subject.create' },
      select: { derived: true, scope: true },
    });
    // Once an administrator has moved a cell, a later regeneration must not silently put
    // the seeded value back (10 §9).
    expect(grant.derived).toBe(false);
    expect(grant.scope).toBe('own_unit');
  });

  it('removes a power when the cell arrives with scope null', async () => {
    const res = await withCsrf(founder, 'put', '/api/v1/grants').send({
      cells: [{ roleId: tutorId, capability: 'results.read', scope: null }],
    });
    expect(res.status).toBe(200);

    const remaining = await prisma.grant.count({
      where: { orgId: founder.orgId, subjectId: tutorId, capability: 'results.read' },
    });
    // Absence IS the removal. Default deny means there is no "off" row to store, so the
    // grid has to be able to say "no grant" and have it mean it (11 §5).
    expect(remaining).toBe(0);
  });

  it('takes effect immediately — the cache is keyed on authzVersion, not on a timer', async () => {
    const tutor = await addStaff(founder.orgId, {
      name: 'Live Tutor',
      level: 3,
      unitName: 'Team A1',
    });
    const allowed = await tutor.agent.get('/api/v1/units');
    expect(allowed.status).toBe(200);

    await withCsrf(founder, 'put', '/api/v1/grants').send({
      cells: [{ roleId: tutorId, capability: 'unit.read', scope: null }],
    });

    // No sleep, no cache clear in the test. If authzVersion were not part of the key, this
    // would still return 200 for the length of the TTL — which is a security bug, not a
    // performance trade-off (11 §7).
    const afterwards = await tutor.agent.get('/api/v1/units');
    expect(afterwards.status).toBe(403);
  });

  it('refuses a capability that is not in the catalogue', async () => {
    const res = await withCsrf(founder, 'put', '/api/v1/grants').send({
      cells: [{ roleId: tutorId, capability: 'campaign.obliterate', scope: 'all' }],
    });
    // The catalogue is defined by the application, never by the user (11 §3). A typo here
    // would create a grant that nothing ever checks.
    expect(res.status).toBe(409);
  });
});

describe('GET /grants/warnings', () => {
  it('names the role that can change its own powers, and the deny that shadows an allow', async () => {
    const founder = await setUpOrg();
    const roles = await founder.agent.get('/api/v1/roles');
    const tutorId = (roles.body.data as Array<{ id: string; level: number }>).find(
      (role) => role.level === 3,
    )?.id;

    await prisma.grant.create({
      data: {
        orgId: founder.orgId,
        subjectId: tutorId as string,
        capability: 'subject.read',
        scope: 'all',
        effect: 'deny',
      },
    });
    clearGrantCache();

    const res = await founder.agent.get('/api/v1/grants/warnings');
    expect(res.status).toBe(200);

    const warnings = res.body.data as Array<{ kind: string; message: string }>;
    // Deny wins absolutely (INV-004), so the allow beneath it never applies — which reads
    // as a working power in the grid and is not one.
    expect(warnings.some((warning) => warning.kind === 'deny_shadows_allow')).toBe(true);
    expect(warnings.some((warning) => warning.kind === 'self_approval')).toBe(true);
    // None of these blocks the save. An administrator who is stopped from a legal
    // configuration stops trusting the tool.
    expect(warnings.every((warning) => typeof warning.message === 'string')).toBe(true);
  });
});

describe('GET /authz/capabilities', () => {
  it('returns the whole catalogue, grouped and phase-tagged', async () => {
    const founder = await setUpOrg();
    const res = await founder.agent.get('/api/v1/authz/capabilities');

    expect(res.status).toBe(200);
    const catalogue = res.body.data as Array<{ key: string; module: string; phase: string }>;
    // 73 since T-095 added the Booking module (read/create/update/delete/cancel, 11 §3);
    // 68 since T-094 added Announcements (read/create/publish/delete); 64 before that,
    // since T-072 added Accounts.
    // The number is asserted rather than derived on purpose: a capability appearing in the
    // catalogue is a permission the powers grid will render and an administrator can hand
    // out, so it should never arrive without somebody changing this line.
    expect(catalogue).toHaveLength(73);
    expect(catalogue.some((entry) => entry.key === 'campaign.launch')).toBe(true);
    expect(catalogue.some((entry) => entry.module === 'Accounts')).toBe(true);
    // Phase travels with each capability so the grid can grey out P3 rows without needing
    // a second table (T-003's note on CAPABILITY_CATALOGUE).
    expect(catalogue.some((entry) => entry.phase === 'P3')).toBe(true);
  });
});
