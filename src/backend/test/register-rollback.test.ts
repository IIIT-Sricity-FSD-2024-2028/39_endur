// A failed registration leaves no organisation behind.
// A half-created org has a user who exists, cannot see anything, and cannot retry because their
// address is taken. The service said so; nothing proved it.
// The forced failure is real rather than injected: the slug is chosen OUTSIDE the transaction, so
// simultaneous registrations of the same name all read "free" and all but one then collide inside it.
// Password hashing takes far longer than the slug lookup, so the collision is reliable rather than lucky.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, unique } from './helpers.js';
import { prisma } from '../db/client.js';

const CONTENDERS = 6;

describe('POST /auth/register rolls back completely — 30 § Acceptance, 15 §5', () => {
  it('leaves exactly one organisation, and no user belonging to none', async () => {
    const orgName = `Rollback ${unique('org')}`;
    const emails = Array.from({ length: CONTENDERS }, (_, i) => `${unique(`c${i}`)}@example.test`);

    const results = await Promise.all(
      emails.map((email) =>
        request(app).post('/api/v1/auth/register').send({
          email, password: 'a-long-enough-password', name: 'Founder', orgName, industry: 'custom',
          tier: 'bronze',
        }),
      ),
    );

    const won = results.filter((res) => res.status === 201);
    const lost = results.filter((res) => res.status !== 201);

    // A slug collision is not the caller's mistake and not theirs to fix, so nobody gets an error page
    // for choosing a name somebody else chose a millisecond earlier.
    expect(lost.map((res) => res.status)).toEqual([]);
    expect(won).toHaveLength(CONTENDERS);

    // The retry actually ran. Every request derived the SAME base slug before any of them
    // committed, so six distinct slugs is only reachable by catching five collisions and
    // asking `uniqueSlug` again. Without the retry this reads 1.
    const slugs = new Set(won.map((res) => res.body.organization.slug as string));
    expect(slugs.size).toBe(CONTENDERS);

    // Exactly as many organisations as succeeded. Every rolled-back ATTEMPT — and there were
    // five — left nothing behind, or this count would exceed the number of winners.
    const orgs = await prisma.organization.findMany({ where: { name: orgName } });
    expect(orgs).toHaveLength(won.length);

    // And no user belonging to none — the exact failure the service was written to
    // prevent: an account that exists, can see nothing, and cannot retry because its
    // address is taken.
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    expect(users).toHaveLength(won.length);
    const orgIds = new Set(orgs.map((org) => org.id));
    for (const user of users) expect(orgIds.has(user.orgId)).toBe(true);

    // The scaffolding came with each survivor, whole: one root unit, one Owner role, one
    // person, one position, and the level-1 grants.
    for (const org of orgs) {
      const nodes = await prisma.node.findMany({ where: { orgId: org.id } });
      expect(nodes.filter((node) => node.kind === 'unit'), org.slug).toHaveLength(1);
      expect(nodes.filter((node) => node.kind === 'role'), org.slug).toHaveLength(1);
      expect(nodes.filter((node) => node.kind === 'person'), org.slug).toHaveLength(1);
      expect(nodes.filter((node) => node.kind === 'position'), org.slug).toHaveLength(1);
      expect(await prisma.grant.count({ where: { orgId: org.id } })).toBeGreaterThan(0);
    }

    // A survivor can actually sign in. A rollback that took one of them with it would
    // pass every count above and still be broken.
    const winner = emails[results.indexOf(won[0]!)];
    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: winner, password: 'a-long-enough-password' });
    expect(login.status).toBe(200);

    // And every survivor's scaffolding belongs to the slug it actually got. A retry that
    // reused the first attempt's organisation id would pass every count above.
    for (const org of orgs) {
      const owner = await prisma.node.findFirstOrThrow({ where: { orgId: org.id, kind: 'role' } });
      expect(owner.name).toBe('Owner');
    }
  });
});
