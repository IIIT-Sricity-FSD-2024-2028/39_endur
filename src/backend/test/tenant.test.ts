// Tenant isolation. Needs a live database.
// The forged organisation id is the case that matters: an org id in a request body is an attack and
// not an input, and this asserts that mechanically rather than trusting every future author to remember.
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../db/client.js';
import { tenantClient } from '../db/tenant.js';

const LABELS = { unit: { one: 'U', many: 'Us' } };
const slugs = ['iso-a', 'iso-b'];

async function seed() {
  await prisma.organization.deleteMany({ where: { slug: { in: slugs } } });
  const [a, b] = await Promise.all(
    slugs.map((slug) =>
      prisma.organization.create({
        data: { name: slug, slug, industry: 'custom', labels: LABELS },
      }),
    ),
  );
  await prisma.subject.createMany({
    data: [
      { orgId: a!.id, name: 'A-only' },
      { orgId: b!.id, name: 'B-only' },
    ],
  });
  return { a: a!.id, b: b!.id };
}

describe('tenant isolation', () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { in: slugs } } });
    await prisma.$disconnect();
  });

  it('a tenant client sees only its own rows', async () => {
    const { a } = await seed();
    const rows = await tenantClient(a).subject.findMany();
    expect(rows.map((row) => row.name)).toEqual(['A-only']);
  });

  it('a FORGED orgId in the query is overwritten, not merged — INV-010', async () => {
    const { a, b } = await seed();
    const rows = await tenantClient(a).subject.findMany({ where: { orgId: b } });
    expect(rows.map((row) => row.name)).toEqual(['A-only']);
    expect(await tenantClient(a).subject.count()).toBe(1);
  });

  it('a create claiming another tenant is stamped with the real one', async () => {
    const { a, b } = await seed();
    const made = await tenantClient(a).subject.create({
      data: { name: 'stamped', orgId: b },
    });
    expect(made.orgId).toBe(a);
  });

  it('the raw client is NOT scoped — which is why lint confines it to db/', async () => {
    await seed();
    const all = await prisma.subject.findMany({ where: { name: { in: ['A-only', 'B-only'] } } });
    expect(all).toHaveLength(2);
  });
});
