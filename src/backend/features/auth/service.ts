// Registration builds a working organisation in ONE transaction: the org, a root unit, an Owner role,
// the founder's account and person, their position, the subscription, the payment and the level-1 grants.
// A half-created organisation is the worst outcome here, so it is all-or-nothing.
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { hashPassword } from '../../auth/password.js';
import { grantsForLevel, presetFor } from '../../presets/index.js';
import { ConflictError } from '../../lib/errors.js';
import { recordPayment } from '../../billing/payments.js';
import { newPeriod } from '../../billing/period.js';
import type { RegisterBody } from '@endur/shared';

// How many times to retry when two people register the same organisation name at the same moment.
// The retry uses a random suffix rather than scanning again, so racing callers spread out in one round.
const SLUG_ATTEMPTS = 5;

// Registers a new organisation, retrying only if the name's slug was taken in a race.
export async function register(input: RegisterBody) {
  // Hashed once, outside the loop: argon2 is deliberately slow, and a retry is no reason to pay for it twice.
  const passwordHash = await hashPassword(input.password);

  for (let attempt = 1; ; attempt += 1) {
    const slug = await uniqueSlug(input.orgName, attempt > 1);
    try {
      return await createOrganisation(input, passwordHash, slug);
    } catch (error) {
      if (attempt >= SLUG_ATTEMPTS || !isSlugCollision(error)) throw error;
      // Nothing to clean up - the transaction rolled the whole attempt back.
    }
  }
}

// Only a slug collision is safe to retry; any other unique-constraint error is a real conflict.
function isSlugCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.['target'];
  // Postgres reports the constraint columns as an array; other databases use a string.
  if (Array.isArray(target)) return target.includes('slug');
  return typeof target === 'string' && target.includes('slug');
}

// Writes every row a new organisation needs, in one transaction.
function createOrganisation(input: RegisterBody, passwordHash: string, slug: string) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName,
        slug,
        industry: input.industry,
        // The chosen preset's vocabulary from the very first request, so nothing generic is ever shown.
        labels: presetFor(input.industry).labels,
        settings: { authzVersion: 1 },
      },
    });

    const user = await tx.user.create({
      data: { orgId: org.id, email: input.email, name: input.name, passwordHash },
    });

    // meta.seededBy marks the scaffolding, so the setup wizard knows which rows it may replace.
    const scaffold = { seededBy: 'register' };
    const unit = await tx.node.create({
      data: { orgId: org.id, kind: 'unit', name: input.orgName, meta: scaffold },
    });
    const role = await tx.node.create({
      data: { orgId: org.id, kind: 'role', name: 'Owner', level: 1, meta: scaffold },
    });
    const person = await tx.node.create({
      data: { orgId: org.id, kind: 'person', name: input.name, userId: user.id },
    });
    const position = await tx.node.create({
      data: { orgId: org.id, kind: 'position', name: `Owner — ${input.orgName}`,
              roleId: role.id, unitId: unit.id, meta: scaffold },
    });
    await tx.edge.create({
      data: { orgId: org.id, type: 'member', parentId: person.id, childId: position.id,
              isPrimary: true },
    });

    // The subscription row, in the same transaction: an org without one is half-created, and the missing
    // half is what every plan check reads. Active from the first request, for one calendar month.
    await tx.subscription.create({
      data: { orgId: org.id, tier: input.tier, status: 'active', ...newPeriod() },
    });

    // The payment, also in the same transaction. The amount is priced on the server; the client's reference is only a label.
    await recordPayment(tx, {
      orgId: org.id,
      tier: input.tier,
      kind: 'signup',
      payerName: input.name,
      payerEmail: input.email,
      reference: input.paymentRef ?? null,
    });

    // The level-1 grants, placed on the ROLE. The unit comes from the position at the time the permission is checked.
    await tx.grant.createMany({
      data: grantsForLevel(1).map((grant) => ({
        orgId: org.id, subjectId: role.id, capability: grant.capability,
        scope: grant.scope, effect: 'allow' as const, derived: true, createdById: user.id,
      })),
    });

    return { org, user };
  });
}

// Turns an organisation name into a free URL slug.
// Normally it scans in order, so a second Acme becomes acme-2. After losing a race it takes a random
// suffix instead, because under contention the read everybody trusts is the thing that lies.
async function uniqueSlug(name: string, contended: boolean): Promise<string> {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';

  if (contended) return `${base}-${randomBytes(3).toString('hex')}`;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  throw new ConflictError('Could not derive a unique address for that organisation name.');
}
