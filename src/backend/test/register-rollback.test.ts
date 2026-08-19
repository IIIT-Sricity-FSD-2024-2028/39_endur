// T-031 — "a failed registration leaves no organisation behind" (30 § Acceptance).
//
// This is the acceptance criterion that matters most on this page and the one hardest to
// fake: a half-created org has a user who exists, cannot see anything, and cannot retry
// because their address is taken. The service comments say so; nothing proved it.
//
// THE FORCED FAILURE IS REAL, NOT INJECTED. `uniqueSlug()` runs OUTSIDE the transaction
// (features/auth/service.ts), so several registrations naming the same organisation at the
// same moment all read "that slug is free", and all but one then collide on the unique
// index INSIDE the transaction. Argon2 hashing takes ~100ms and the slug SELECT takes ~1ms,
// so every request below clears the check long before the winner commits — the collision
// is reliable rather than lucky.
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
        }),
      ),
    );

    const won = results.filter((res) => res.status === 201);
    const lost = results.filter((res) => res.status !== 201);

    // The premise. More than one CAN win — `uniqueSlug` retries with `-2`, `-3`… for
    // anything that starts after the first commit, and an organisation name is not unique.
    // What must not happen is a loser leaving wreckage. If this ever reads zero the race
    // stopped racing and every assertion below stopped meaning anything: fix the test,
    // do not delete it.
    expect(lost.length).toBeGreaterThan(0);
    expect(won.length).toBeGreaterThan(0);

    // Exactly as many organisations as succeeded. Every failure rolled all the way back.
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

    // What a loser was told. A slug collision is not the caller's fault and not their
    // problem to fix, so 500 is the honest answer — but see D-006: they deserve a retry
    // rather than an error page, and `uniqueSlug` running outside the transaction is why
    // this is reachable at all.
    for (const res of lost) expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
