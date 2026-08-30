// Registration builds a WORKING organisation in ONE transaction: org, root unit, an
// Owner role, the founder's user + person node, their position, the membership edge, and
// the level-1 grants. Partially-created orgs are the worst possible failure here — a user
// who exists but cannot see anything, with no way to retry because their email is taken.
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { hashPassword } from '../../auth/password.js';
import { grantsForLevel, presetFor } from '../../presets/index.js';
import { ConflictError } from '../../lib/errors.js';
import { recordPayment } from '../../billing/payments.js';
import { newPeriod } from '../../billing/period.js';
import type { RegisterBody } from '@endur/shared';

/**
 * D-006. `uniqueSlug()` cannot run inside the transaction — it reads COMMITTED rows, and a
 * transaction cannot see the ones it is racing. So two people naming their organisation the
 * same thing in the same second both read "that slug is free", and the loser collides on the
 * unique index.
 *
 * The collision is correct and the rollback is correct; the 500 was not. A slug is derived
 * from a name the caller is allowed to reuse — it is not their mistake and not theirs to fix,
 * so the fix is to take the next slug and try again rather than to hand them an error page.
 *
 * Five attempts, and the RETRY MUST NOT SCAN. Retrying the sequential search turns one
 * collision into a queue: six contenders all re-read, all find `acme-2` free, and five collide
 * again — the loser needs as many attempts as there are contenders, which is exactly how the
 * first version of this failed. A retry takes a random suffix instead, so the field spreads out
 * in one round however many are racing.
 */
const SLUG_ATTEMPTS = 5;

export async function register(input: RegisterBody) {
  // Hashed ONCE, outside the loop. Argon2 is ~100ms by design and a retry is not a reason
  // to pay it again.
  const passwordHash = await hashPassword(input.password);

  for (let attempt = 1; ; attempt += 1) {
    const slug = await uniqueSlug(input.orgName, attempt > 1);
    try {
      return await createOrganisation(input, passwordHash, slug);
    } catch (error) {
      if (attempt >= SLUG_ATTEMPTS || !isSlugCollision(error)) throw error;
      // Nothing to clean up: the transaction rolled the whole attempt back, which is the
      // property register-rollback.test.ts exists to prove.
    }
  }
}

/**
 * A P2002 on `slug` and a P2002 on anything else are different events. Only this one is safe
 * to retry — retrying a genuine conflict would just fail five times more slowly, and hide
 * what actually happened.
 */
function isSlugCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.['target'];
  // Postgres reports the constraint's columns as an array; other providers use a string.
  if (Array.isArray(target)) return target.includes('slug');
  return typeof target === 'string' && target.includes('slug');
}

function createOrganisation(input: RegisterBody, passwordHash: string, slug: string) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName,
        slug,
        industry: input.industry,
        // The chosen preset's vocabulary from the very first request, so the console
        // never shows generic words to somebody who already said what kind of organisation
        // this is. The wizard can still change every one of them (50 §1).
        labels: presetFor(input.industry).labels,
        settings: { authzVersion: 1 },
      },
    });

    const user = await tx.user.create({
      data: { orgId: org.id, email: input.email, name: input.name, passwordHash },
    });

    // meta.seededBy marks the scaffolding. POST /org/setup replaces this structure with
    // the one the wizard chose, and it has to know which rows it may remove — identifying
    // them by name would delete a real unit the moment somebody called theirs "Owner".
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

    // THE SUBSCRIPTION ROW — D-012 repaid, DEC-048. IN THE SAME TRANSACTION as everything
    // else, for the reason this whole function exists: an organisation that exists without one
    // is a half-created organisation, and the half that is missing is the one every
    // entitlement decision reads. `requireEntitlement` would answer for it by falling back to
    // bronze, which is precisely how D-012 stayed invisible for a month — a default that looks
    // like an answer.
    //
    // `status: 'active'` FROM THE FIRST REQUEST. There is no `trialing` on this path: DEC-048
    // removed it, and 16 §7 records why — both arguments for a 14-day Gold trial were
    // arguments about PRICE. DEC-080 has given the product prices back, and the trial STAYS
    // deleted: expiring one needs a scheduler OPEN-005 still says nobody owns, and a
    // countdown nothing enforces is a promise the product cannot keep.
    //
    // THE PERIOD IS A MONTH, AND THE MONTH IS WHAT WAS PAID FOR — DEC-096, and it was a year
    // until 31 Aug. `periodStart`/`periodEnd` are NOT NULL in the schema (10, `subscriptions`)
    // and a subscription genuinely has a period. Nothing still happens when it ends — there is
    // no renewal and no dunning (DEC-080 § not) — but the dates are no longer decorative: they
    // are the span the capture below covers, the plan picker prices "/ month" against them,
    // and DEC-098 is about to make `period_end` the date a scheduled downgrade fires on.
    //
    // THE LENGTH COMES FROM `billing/period.ts` AND NOWHERE ELSE. It used to be
    // `setFullYear(+1)` here and `+ 365 * DAY` in two other services, which already disagreed
    // by a day in a leap year — nothing read the difference, which is exactly why it survived.
    //
    // `seats` stays at its default 0 because D-013's meter does not exist yet, and a number
    // nothing recomputes is worse than a zero that is obviously unbuilt.
    await tx.subscription.create({
      data: { orgId: org.id, tier: input.tier, status: 'active', ...newPeriod() },
    });

    // THE CAPTURE, IN THE SAME TRANSACTION as the subscription it pays for — DEC-080, and
    // the same argument the subscription row itself makes one paragraph up. A payment that
    // survived a rolled-back registration would be revenue attributed to an organisation
    // that does not exist, and `/ops/earnings` sums this table without asking whether each
    // org_id resolves.
    //
    // `fromTier` IS NULL AND THAT IS A FACT, not a gap: there was no plan before this one.
    // The amount is not passed — `recordPayment` prices the tier server-side, and the
    // client's `paymentRef` is carried as a label rather than trusted as a proof.
    await recordPayment(tx, {
      orgId: org.id,
      tier: input.tier,
      kind: 'signup',
      payerName: input.name,
      payerEmail: input.email,
      reference: input.paymentRef ?? null,
    });

    // Level-1 grants, on the ROLE. Anchoring comes from the position at resolve time —
    // that is INV-005, and it is why these rows carry no unit of their own.
    await tx.grant.createMany({
      data: grantsForLevel(1).map((grant) => ({
        orgId: org.id, subjectId: role.id, capability: grant.capability,
        scope: grant.scope, effect: 'allow' as const, derived: true, createdById: user.id,
      })),
    });

    return { org, user };
  });
}

/**
 * `contended` means the caller just lost a race for this name.
 *
 * The uncontended path scans in order, so the ordinary case — somebody registering "Acme"
 * next week when `acme` already exists — still gets the readable `acme-2`. That path involves
 * no race at all: the row it read is committed and is not going anywhere.
 *
 * The contended path deliberately does NOT read first. Under a race that read is precisely
 * the thing that lies, and everyone who believes it picks the same answer. A random suffix is
 * unguessable by the other contenders, which is what makes them spread out. It is not verified
 * either — 16.7M values, and the unique index plus the retry loop are a better guard than a
 * SELECT that was already proven to be stale.
 */
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
