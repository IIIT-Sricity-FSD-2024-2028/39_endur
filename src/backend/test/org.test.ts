// T-015 — the organisation surface and the wizard's single commit. 13 § Organisation, 31.
//
// The property worth testing here is not "setup returns 201". It is that ONE request
// produces a WHOLE working organisation: the chosen roles at the right levels, the chosen
// tree wired with `contains` edges, the derived grant matrix, the founder re-anchored onto
// the new structure, the starter templates, and no leftovers from registration.
//
// A half-applied setup is the failure mode 31 exists to prevent, so the assertions below
// deliberately look at the database rather than at the response body.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

const app = createApp();

const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Registration signs the caller in, so the agent carries the session and CSRF cookies. */
async function registerOrg(industry: string) {
  const agent = request.agent(app);
  const email = `${unique('org')}@example.test`;
  const res = await agent.post('/api/v1/auth/register').send({
    email,
    password: 'a-long-enough-password',
    name: 'Founder',
    orgName: `Test Org ${unique('n')}`,
    industry,
    tier: 'bronze',
  });
  expect(res.status).toBe(201);
  const csrf = await agent.get('/api/v1/auth/csrf');
  return {
    agent,
    orgId: res.body.organization.id as string,
    csrfToken: csrf.body.token as string,
  };
}

/** supertest types set-cookie loosely; every assertion below wants the raw header lines. */
const setCookies = (res: { headers: Record<string, unknown> }): string[] => {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
};

const post = (agent: Agent, path: string, token: string) =>
  agent.post(path).set('X-CSRF-Token', token);
const patch = (agent: Agent, path: string, token: string) =>
  agent.patch(path).set('X-CSRF-Token', token);

const SETUP = {
  industry: 'university' as const,
  roles: [
    { name: 'Principal' },
    { name: 'Head of Section' },
    { name: 'Tutor' },
    { name: 'Learner' },
  ],
  units: [
    { tempId: 'root', name: 'Northfield', parentTempId: null },
    { tempId: 'a', name: 'Section A', parentTempId: 'root' },
    { tempId: 'b', name: 'Section B', parentTempId: 'root' },
    { tempId: 'a1', name: 'Team A1', parentTempId: 'a' },
  ],
  labels: {
    unit: { one: 'Section', many: 'Sections' },
    subject: { one: 'Module', many: 'Modules' },
    respondent: { one: 'Learner', many: 'Learners' },
    reviewee: { one: 'Tutor', many: 'Tutors' },
    campaign: { one: 'Review round', many: 'Review rounds' },
  },
};

describe('GET /org', () => {
  it('returns resolved labels and reports a fresh org as unconfigured', async () => {
    const { agent } = await registerOrg('hotel');
    const res = await agent.get('/api/v1/org');

    expect(res.status).toBe(200);
    // Registration already applied the preset's vocabulary, so the console never renders
    // generic words to someone who has already said what kind of organisation this is.
    expect(res.body.data.labels.unit.one).toBe('Property');
    expect(res.body.data.labels.respondent.many).toBe('Guests');
    // No wizard has run: /app must redirect to /app/setup rather than render an empty home.
    expect(res.body.data.configured).toBe(false);
  });
});

describe('GET /org/presets', () => {
  it('ships five presets, each with roles, a tree, labels and starter templates', async () => {
    const { agent } = await registerOrg('custom');
    const res = await agent.get('/api/v1/org/presets');

    expect(res.status).toBe(200);
    const presets = res.body.data as Array<{
      key: string;
      roles: unknown[];
      units: unknown[];
      templates: Array<{ questionCount: number }>;
    }>;
    expect(presets.map((preset) => preset.key)).toEqual([
      'university',
      'hotel',
      'hospital',
      'company',
      'custom',
    ]);

    for (const preset of presets) {
      expect(preset.roles.length).toBeGreaterThanOrEqual(2);
      expect(preset.units.length).toBeGreaterThanOrEqual(1);
      // Short forms are the product thesis, not a preference (01 §5, 50 §2).
      for (const template of preset.templates) {
        expect(template.questionCount).toBeLessThanOrEqual(10);
      }
      // Every preset ships a one-question form, which is what makes "a poll is a
      // one-question template" concrete rather than theoretical (DEC-010).
      expect(preset.templates.some((template) => template.questionCount === 1)).toBe(true);
    }
  });
});

describe('POST /org/setup — one request, one transaction', () => {
  let orgId = '';

  beforeAll(async () => {
    const session = await registerOrg('custom');
    orgId = session.orgId;
    const res = await post(session.agent, '/api/v1/org/setup', session.csrfToken).send(SETUP);
    expect(res.status).toBe(201);
    expect(res.body.data.configured).toBe(true);
    clearGrantCache();
  });

  it('writes the roles with levels derived from array order, never from the client', async () => {
    const roles = await prisma.node.findMany({
      where: { orgId, kind: 'role' },
      select: { name: true, level: true },
      orderBy: { level: 'asc' },
    });
    expect(roles).toEqual([
      { name: 'Principal', level: 1 },
      { name: 'Head of Section', level: 2 },
      { name: 'Tutor', level: 3 },
      { name: 'Learner', level: 4 },
    ]);
  });

  it('wires the unit tree with contains edges', async () => {
    const units = await prisma.node.findMany({
      where: { orgId, kind: 'unit' },
      select: { id: true, name: true },
    });
    expect(units.map((unit) => unit.name).sort()).toEqual([
      'Northfield',
      'Section A',
      'Section B',
      'Team A1',
    ]);

    const byName = new Map(units.map((unit) => [unit.name, unit.id]));
    const edges = await prisma.edge.findMany({
      where: { orgId, type: 'contains' },
      select: { parentId: true, childId: true },
    });
    const pairs = edges.map(
      (edge) =>
        `${[...byName].find(([, id]) => id === edge.parentId)?.[0]} > ${
          [...byName].find(([, id]) => id === edge.childId)?.[0]
        }`,
    );
    expect(pairs.sort()).toEqual([
      'Northfield > Section A',
      'Northfield > Section B',
      'Section A > Team A1',
    ]);
  });

  it('seeds the derived grant matrix — including the self grants a profile page needs', async () => {
    const roles = await prisma.node.findMany({
      where: { orgId, kind: 'role' },
      select: { id: true, level: true },
    });

    for (const role of roles) {
      const grants = await prisma.grant.findMany({
        where: { orgId, subjectId: role.id },
        select: { capability: true, scope: true, effect: true, derived: true },
      });

      // 50 §1 is blunt about this row: without the universal self grants, a default-deny
      // model silently produces an unopenable profile page for everyone.
      expect(grants).toContainEqual({
        capability: 'person.read',
        scope: 'self',
        effect: 'allow',
        derived: true,
      });
      expect(grants).toContainEqual({
        capability: 'person.update',
        scope: 'self',
        effect: 'allow',
        derived: true,
      });
      // Presets ship NO deny grants. A deny is a deliberate administrator act, and seeding
      // one would teach the wrong lesson about a rule that is absolute (INV-004).
      expect(grants.every((grant) => grant.effect === 'allow')).toBe(true);
      // Every seeded row is derived, so an administrator's later edit cannot be silently
      // reverted by a regeneration (10 §9).
      expect(grants.every((grant) => grant.derived)).toBe(true);
    }

    const top = roles.find((role) => role.level === 1);
    const topGrants = await prisma.grant.findMany({
      where: { orgId, subjectId: top?.id ?? "" },
      select: { capability: true, scope: true },
    });
    expect(topGrants).toContainEqual({ capability: 'grant.update', scope: 'all' });
    expect(topGrants).toContainEqual({ capability: 'campaign.launch', scope: 'subtree' });

    const bottom = roles.find((role) => role.level === 4);
    const bottomGrants = await prisma.grant.findMany({
      where: { orgId, subjectId: bottom?.id ?? "" },
      select: { capability: true },
    });
    // L4 is the respondent-level role: org.read so the vocabulary loads, `subject.read` so
    // the one list they should see is reachable (T-086, closing half of OPEN-009), the two
    // self rows so their profile opens, and nothing else. This list is deliberately exact —
    // it is what EVERY organisation gets by default, and a row added here without a reason
    // should fail rather than pass quietly.
    expect(bottomGrants.map((grant) => grant.capability).sort()).toEqual([
      'org.read',
      'person.read',
      'person.update',
      'subject.read',
    ]);
  });

  it('re-anchors the founder onto the new structure and leaves no scaffolding behind', async () => {
    const scaffolding = await prisma.node.findMany({
      where: { orgId, meta: { path: ['seededBy'], equals: 'register' } },
      select: { id: true },
    });
    expect(scaffolding).toEqual([]);

    const positions = await prisma.node.findMany({
      where: { orgId, kind: 'position' },
      select: { name: true, role: { select: { name: true } }, unit: { select: { name: true } } },
    });
    expect(positions).toHaveLength(1);
    // The anchor is the crux of INV-005: the founder's powers apply at Northfield and
    // below because their POSITION sits there, not because their role is senior.
    expect(positions[0]?.role?.name).toBe('Principal');
    expect(positions[0]?.unit?.name).toBe('Northfield');

    const edges = await prisma.edge.findMany({
      where: { orgId, type: 'member' },
      select: { isPrimary: true },
    });
    expect(edges).toEqual([{ isPrimary: true }]);
  });

  it('copies the preset starter templates with derived completion times', async () => {
    const templates = await prisma.template.findMany({
      where: { orgId },
      select: { name: true, estimatedSeconds: true, industry: true, _count: { select: { questions: true } } },
      orderBy: { name: 'asc' },
    });

    expect(templates.map((template) => template.name)).toEqual([
      'Course feedback',
      'Facilities pulse',
      'Quick pulse',
      'Semester review',
    ]);
    for (const template of templates) {
      expect(template.industry).toBe('university');
      expect(template._count.questions).toBeGreaterThan(0);
      expect(template._count.questions).toBeLessThanOrEqual(10);
      // Derived from the question kinds, never entered by hand — a template cannot claim
      // to be shorter than it is (36).
      expect(template.estimatedSeconds).toBeGreaterThan(0);
    }
  });

  it('applies the wizard vocabulary over the preset default', async () => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { labels: true, industry: true, settings: true },
    });
    expect(org.industry).toBe('university');
    expect((org.labels as { unit: { one: string } }).unit.one).toBe('Section');
    // The grant cache is keyed on authzVersion, so a setup that did not raise it would
    // leave the founder's first click resolving against the pre-setup grants (11 §7).
    expect((org.settings as { authzVersion: number }).authzVersion).toBeGreaterThan(1);
  });

  it('refuses a structure that loops back on itself, before writing anything', async () => {
    const session = await registerOrg('custom');
    const res = await post(session.agent, '/api/v1/org/setup', session.csrfToken).send({
      ...SETUP,
      units: [
        { tempId: 'root', name: 'Root', parentTempId: null },
        { tempId: 'a', name: 'A', parentTempId: 'b' },
        { tempId: 'b', name: 'B', parentTempId: 'a' },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    // Nothing was written: the check runs before the transaction opens, so the failure is
    // about the form rather than about a foreign key.
    const units = await prisma.node.findMany({
      where: { orgId: session.orgId, kind: 'unit' },
      select: { name: true },
    });
    expect(units.map((unit) => unit.name)).not.toContain('A');
  });

  it('refuses a second top-level unit', async () => {
    const session = await registerOrg('custom');
    const res = await post(session.agent, '/api/v1/org/setup', session.csrfToken).send({
      ...SETUP,
      units: [
        { tempId: 'root', name: 'Root', parentTempId: null },
        { tempId: 'other', name: 'Other root', parentTempId: null },
      ],
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /org/labels', () => {
  it('merges per key rather than replacing the set', async () => {
    const session = await registerOrg('hotel');
    const res = await patch(session.agent, '/api/v1/org/labels', session.csrfToken).send({
      labels: { subject: { one: 'Venue', many: 'Venues' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.labels.subject.one).toBe('Venue');
    // The renames the org already had survive a single-key edit. A whole-set write would
    // silently discard them (22 §3).
    expect(res.body.data.labels.unit.one).toBe('Property');
  });
});

describe('the guards are real', () => {
  it('refuses an unauthenticated caller before it refuses anything else', async () => {
    const res = await request(app).get('/api/v1/org');
    expect(res.status).toBe(401);
  });

  it('refuses a mutation with no CSRF token', async () => {
    const session = await registerOrg('custom');
    const res = await session.agent.patch('/api/v1/org').send({ name: 'Renamed' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  // D-009. The CSRF cookie had no lifetime while the session cookie had seven days, so
  // closing the browser left a signed-in caller with no token and no way back: the error
  // says "reload", a reload is all GETs, and nothing but login re-issued the cookie.
  it('gives the CSRF cookie a lifetime, so it does not die with the browser', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({
      email: `${unique('ttl')}@example.test`,
      password: 'a-long-enough-password',
      name: 'Founder',
      orgName: `Test Org ${unique('n')}`,
      industry: 'custom',
      tier: 'bronze',
    });
    expect(res.status).toBe(201);

    const csrfCookie = setCookies(res).find((c) => c.startsWith('endur.csrf='));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toMatch(/Max-Age=/i);
  });

  it('re-issues the CSRF cookie on a plain GET when only the session survived', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({
      email: `${unique('heal')}@example.test`,
      password: 'a-long-enough-password',
      name: 'Founder',
      orgName: `Test Org ${unique('n')}`,
      industry: 'custom',
      tier: 'bronze',
    });
    expect(res.status).toBe(201);
    const session = setCookies(res)
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.startsWith('endur.sid='));
    expect(session).toBeDefined();

    // Exactly what a reopened browser sends: the persistent session, and nothing else.
    const reload = await request(app).get('/api/v1/auth/me').set('Cookie', session as string);
    expect(reload.status).toBe(200);
    const reissued = setCookies(reload).find((c) => c.startsWith('endur.csrf='));
    expect(reissued).toBeDefined();

    // And the token it hands back actually works, so "reload and try again" is now true.
    const token = decodeURIComponent((reissued as string).split('=')[1]?.split(';')[0] ?? '');
    const mutation = await request(app)
      .patch('/api/v1/org/labels')
      .set('Cookie', [session as string, `endur.csrf=${token}`])
      .set('X-CSRF-Token', token)
      .send({ labels: { subject: { one: 'Venue', many: 'Venues' } } });
    expect(mutation.status).toBe(200);
  });
});
