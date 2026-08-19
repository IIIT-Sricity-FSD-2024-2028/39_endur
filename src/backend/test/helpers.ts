// Shared test fixtures. 51 §4.
//
// Every integration test needs the same three things: an organisation that is actually set
// up, a signed-in agent with a CSRF token, and a way to add a second person at a chosen
// unit so scope filtering can be observed rather than assumed.
//
// The second person is created through Prisma rather than through the people API on
// purpose — these fixtures must not depend on the feature under test in the file that uses
// them, or a broken endpoint makes its own test pass by never running.
import request from 'supertest';
import type { Agent } from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { clearGrantCache } from '../authz/index.js';

export const app = createApp();

export const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export type Session = {
  agent: Agent;
  orgId: string;
  userId: string;
  csrf: string;
};

export const withCsrf = (session: Session, method: 'post' | 'patch' | 'put' | 'delete', path: string) =>
  session.agent[method](path).set('X-CSRF-Token', session.csrf);

/** Register an organisation and sign in as its founder. */
export async function registerOrg(industry = 'custom'): Promise<Session> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({
    email: `${unique('founder')}@example.test`,
    password: 'a-long-enough-password',
    name: 'Founder',
    orgName: `Org ${unique('n')}`,
    industry,
  });
  expect(res.status).toBe(201);
  const csrf = await agent.get('/api/v1/auth/csrf');
  const me = await agent.get('/api/v1/auth/me');
  return {
    agent,
    orgId: res.body.organization.id as string,
    userId: me.body.user.id as string,
    csrf: csrf.body.token as string,
  };
}

export const SETUP_ROLES = [
  { name: 'Principal' },
  { name: 'Section Head' },
  { name: 'Tutor' },
  { name: 'Learner' },
];

/**
 * A three-level tree, which is the smallest shape that can tell the two scope kinds apart:
 * `own_unit` reaches Section A alone, `subtree` reaches Section A and Team A1, and neither
 * reaches Section B.
 *
 *   Root
 *    ├── Section A ── Team A1
 *    └── Section B
 */
export const SETUP_UNITS = [
  { tempId: 'root', name: 'Root', parentTempId: null },
  { tempId: 'a', name: 'Section A', parentTempId: 'root' },
  { tempId: 'a1', name: 'Team A1', parentTempId: 'a' },
  { tempId: 'b', name: 'Section B', parentTempId: 'root' },
];

export const SETUP_LABELS = {
  unit: { one: 'Section', many: 'Sections' },
  subject: { one: 'Module', many: 'Modules' },
  respondent: { one: 'Learner', many: 'Learners' },
  reviewee: { one: 'Tutor', many: 'Tutors' },
  campaign: { one: 'Review round', many: 'Review rounds' },
};

/** Register, then run the wizard's single commit. The org that comes out is usable. */
export async function setUpOrg(industry = 'university'): Promise<Session> {
  const session = await registerOrg(industry);
  const res = await withCsrf(session, 'post', '/api/v1/org/setup').send({
    industry,
    roles: SETUP_ROLES,
    units: SETUP_UNITS,
    labels: SETUP_LABELS,
  });
  expect(res.status).toBe(201);
  clearGrantCache();
  return session;
}

export const unitIdByName = async (orgId: string, name: string): Promise<string> => {
  const unit = await prisma.node.findFirstOrThrow({
    where: { orgId, kind: 'unit', name },
    select: { id: true },
  });
  return unit.id;
};

export const roleIdByLevel = async (orgId: string, level: number): Promise<string> => {
  const role = await prisma.node.findFirstOrThrow({
    where: { orgId, kind: 'role', level },
    select: { id: true },
  });
  return role.id;
};

/**
 * Add a second staff member holding one position, and sign them in.
 *
 * The unit is the ANCHOR — the crux of INV-005. Their powers apply where the position
 * sits, not everywhere their role's name suggests.
 */
export async function addStaff(
  orgId: string,
  opts: { name: string; level: number; unitName: string },
): Promise<Session> {
  const email = `${unique('staff')}@example.test`;
  const password = 'a-long-enough-password';
  const [roleId, unitId] = await Promise.all([
    roleIdByLevel(orgId, opts.level),
    unitIdByName(orgId, opts.unitName),
  ]);

  const user = await prisma.user.create({
    data: { orgId, email, name: opts.name, passwordHash: await hashPassword(password) },
    select: { id: true },
  });
  const person = await prisma.node.create({
    data: { orgId, kind: 'person', name: opts.name, userId: user.id },
    select: { id: true },
  });
  const position = await prisma.node.create({
    data: { orgId, kind: 'position', name: `${opts.name} @ ${opts.unitName}`, roleId, unitId },
    select: { id: true },
  });
  await prisma.edge.create({
    data: { orgId, type: 'member', parentId: person.id, childId: position.id, isPrimary: true },
  });
  clearGrantCache();

  const agent = request.agent(app);
  const login = await agent.post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  const csrf = await agent.get('/api/v1/auth/csrf');
  return { agent, orgId, userId: user.id, csrf: csrf.body.token as string };
}

/** Give one person an explicit deny. INV-004 says it beats everything, and tests say so too. */
export async function denyPerson(
  orgId: string,
  userId: string,
  capability: string,
  scope: 'self' | 'own_unit' | 'subtree' | 'all',
): Promise<void> {
  const person = await prisma.node.findFirstOrThrow({
    where: { orgId, kind: 'person', userId },
    select: { id: true },
  });
  await prisma.grant.create({
    data: { orgId, subjectId: person.id, capability, scope, effect: 'deny' },
  });
  clearGrantCache();
}
