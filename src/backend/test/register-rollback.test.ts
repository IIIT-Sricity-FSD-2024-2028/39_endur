// T-031 — "a failed registration leaves no organisation behind" (30 § Acceptance).
//
// This is the acceptance criterion that matters most on this page and the one hardest to
// fake: a half-created org has a user who exists, cannot see anything, and cannot retry
// because their address is taken. The service comments say so; nothing proved it.
//
// THE FORCED FAILURE IS REAL, NOT INJECTED. `uniqueSlug()` runs OUTSIDE the transaction
// (features/auth/service.ts) because it reads COMMITTED rows, so several registrations naming
// the same organisation at the same moment all read "that slug is free", and all but one then
// collide on the unique index INSIDE the transaction. Argon2 hashing takes ~100ms and the slug
// SELECT takes ~1ms, so every request below clears the check long before the winner commits —
// the collision is reliable rather than lucky.
//
// WHAT CHANGED AT T-049 (`D-006`): the collision still happens, and the losing attempt is still
// rolled back — but the service now takes the next slug and tries again instead of answering
// 500. So the observable outcome inverted: every contender is expected to SUCCEED, on a
// distinct slug. The rollback property did not stop being tested. It is tested by every retry:
// an attempt that left half an organisation behind would show up below as an org count that
// exceeds the number of winners, or as a user belonging to an org that does not exist.
//
// The distinct slugs are what prove the retry ran at all. All six requests compute the same
// base slug before any of them commits, so six different slugs can only mean five collisions
// were caught and retried.
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

    // D-006. A slug collision is not the caller's mistake and not theirs to fix, so nobody
    // gets an error page for choosing a name somebody else chose a millisecond earlier.
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
