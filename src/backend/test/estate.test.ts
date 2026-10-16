// The operator's list of organisations, and its filters.
// The row SHOWS the tier the product is serving (effectiveTier), so the tier filter has to find rows
// by that same answer. A Gold period that ended and has not been read since is served, and shown, as
// Bronze; filtering by the stored column would list it under Gold with "Bronze" printed on it.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PlatformOrgSummary } from '@endur/shared';
import { app, registerOrg, unique, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { generateSecret, currentCode } from '../platform/totp.js';

const PASSWORD = 'an-operator-password';

async function makeOperator() {
  const email = `${unique('owner')}@endur.test`;
  const secret = generateSecret();
  await prisma.platformUser.create({
    data: {
      email,
      name: 'Test owner',
      role: 'owner',
      passwordHash: await hashPassword(PASSWORD),
      mfaSecret: secret,
    },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return agent;
}

// A period that ended yesterday, written straight to the row: the estate never writes, so nothing
// catches the row up before the list is read.
const endPeriod = async (orgId: string, pendingTier: string | null = null): Promise<void> => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  await prisma.subscription.update({ where: { orgId }, data: { periodEnd: yesterday, pendingTier } });
};

const nameOf = async (session: Session): Promise<string> =>
  (await prisma.organization.findUniqueOrThrow({ where: { id: session.orgId } })).name;

describe('the estate list — 70, DEC-113', () => {
  const list = async (
    operator: Awaited<ReturnType<typeof makeOperator>>,
    query: Record<string, string>,
  ): Promise<PlatformOrgSummary[]> => {
    const res = await operator.get('/api/v1/platform/orgs').query(query);
    expect(res.status).toBe(200);
    return res.body.data as PlatformOrgSummary[];
  };

  it('shows a running plan under its own tier', async () => {
    const operator = await makeOperator();
    const gold = await registerOrg('custom', 'gold');
    const q = await nameOf(gold);

    const rows = await list(operator, { q, tier: 'gold' });
    expect(rows.map((row) => row.id)).toEqual([gold.orgId]);
    expect(rows[0]?.tier).toBe('gold');
    expect(await list(operator, { q, tier: 'bronze' })).toEqual([]);
  });

  it('files a plan that ran out under Bronze, the tier it shows, not under Gold', async () => {
    const operator = await makeOperator();
    const lapsed = await registerOrg('custom', 'gold');
    await endPeriod(lapsed.orgId);
    const q = await nameOf(lapsed);

    const all = await list(operator, { q });
    expect(all[0]?.tier).toBe('bronze');
    expect((await list(operator, { q, tier: 'bronze' })).map((row) => row.id)).toEqual([lapsed.orgId]);
    expect(await list(operator, { q, tier: 'gold' })).toEqual([]);
  });

  it('files a scheduled downgrade that has fired under the tier it moved to', async () => {
    const operator = await makeOperator();
    const moving = await registerOrg('custom', 'gold');
    await endPeriod(moving.orgId, 'silver');
    const q = await nameOf(moving);

    expect((await list(operator, { q, tier: 'silver' })).map((row) => row.id)).toEqual([moving.orgId]);
    expect(await list(operator, { q, tier: 'gold' })).toEqual([]);
    expect(await list(operator, { q, tier: 'bronze' })).toEqual([]);
  });

  // "None" in the status filter means no subscription row at all - which the row prints as
  // status "none" and tier bronze.
  it('finds an organisation with no subscription row under status None and under Bronze', async () => {
    const operator = await makeOperator();
    const bare = await registerOrg('custom', 'silver');
    await prisma.subscription.delete({ where: { orgId: bare.orgId } });
    const q = await nameOf(bare);

    const none = await list(operator, { q, status: 'none' });
    expect(none.map((row) => row.id)).toEqual([bare.orgId]);
    expect(none[0]?.subscriptionStatus).toBe('none');
    expect((await list(operator, { q, tier: 'bronze' })).map((row) => row.id)).toEqual([bare.orgId]);
    expect(await list(operator, { q, status: 'active' })).toEqual([]);
  });

  it('pages through with the tier filter on, without dropping or repeating a row', async () => {
    const operator = await makeOperator();
    const prefix = `Paged ${unique('p')}`;
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const org = await registerOrg('custom', 'gold');
      await prisma.organization.update({ where: { id: org.orgId }, data: { name: `${prefix} ${index}` } });
      ids.push(org.orgId);
    }

    const first = await operator.get('/api/v1/platform/orgs').query({ q: prefix, tier: 'gold', limit: '2' });
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.page.hasMore).toBe(true);
    const second = await operator
      .get('/api/v1/platform/orgs')
      .query({ q: prefix, tier: 'gold', limit: '2', cursor: first.body.page.nextCursor as string });
    expect(second.status).toBe(200);

    const seen = [...first.body.data, ...second.body.data].map((row: { id: string }) => row.id);
    expect(seen.sort()).toEqual([...ids].sort());
    expect(first.body.meta.total).toBe(3);
  });
});
