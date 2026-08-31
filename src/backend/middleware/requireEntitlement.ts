// Link 11. Separate from requireCapability on purpose (DEC-011).
//
//   capability  -> MAY THIS PERSON?      403, remedy: ask your administrator
//   entitlement -> HAS THIS ORG PAID?    402, remedy: upgrade
//
// Different questions, different remedies, different status codes. Conflating them would
// make that distinction impossible AND pollute the grant table with billing concerns.
//
// Entitlement NEVER gates permission correctness — access control is in every tier (01 §6).
//
// Ordering: this runs AFTER requireCapability, because 403 outranks 402. Never tell
// someone to buy an upgrade for something they would not be allowed to use anyway.
import type { RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import { lowestTierFor, tierIncludes, type Tier } from '../billing/entitlements.js';
import { effectiveTier } from '../billing/effective.js';
import { AppError, UnauthenticatedError } from '../lib/errors.js';

export const requireEntitlement =
  (capability: Capability): RequestHandler =>
  (req, _res, next) => {
    void check(req.ctx.orgId, capability, req.db)
      .then(() => next())
      .catch(next);
  };

async function check(
  orgId: string | undefined,
  capability: Capability,
  db: Express.Request['db'],
): Promise<void> {
  if (!orgId) throw new UnauthenticatedError();

  // THREE COLUMNS, ONE ANSWER — DEC-113. This selected `tier` alone until 2026-08-31, and the
  // hole that left is the one the owner reported: a period ended, `tier` still said `gold`,
  // and the gate went on opening Gold surfaces for an organisation whose month had run out.
  // `period_end` was already on the row and nothing read it.
  //
  // THE GATE DOES NOT WRITE. `readBilling` is the one writer, and it moves the row the next
  // time anybody opens the plan page. Until then the two agree anyway, because both ask
  // `effectiveTier()` — deriving the answer is what keeps `49` § Interactions' rule true now
  // that a column alone cannot.
  const subscription = await db.subscription.findFirst({
    select: { tier: true, pendingTier: true, periodEnd: true },
  });
  // NO ROW MEANS BRONZE, AND THIS IS NOW A BACKSTOP RATHER THAN THE NORMAL PATH (DEC-048).
  //
  // It used to be the only path. Nothing wrote a `Subscription` — not register, not setup,
  // not the seed — so every organisation in the product fell through this line and was
  // silently bronze, and every silver or gold surface 402'd for everyone, forever. That was
  // D-012, and the comment that used to sit here called bronze "the trial default", which was
  // a THIRD answer again: 16 §7 said new orgs start on Gold, this line said bronze, and
  // neither ever happened. T-088 made `register` write the row with the tier the founder
  // chose, so a row is now the expected state.
  //
  // The fallback stays, and stays BRONZE, for organisations older than that change and for
  // any future path that creates an org without one. Failing open to the lowest tier is the
  // right direction: a missing billing row is our bookkeeping problem, and locking a customer
  // out of a product they are inside is a worse answer to it than giving them the floor.
  const tier: Tier = subscription ? effectiveTier(subscription) : 'bronze';

  if (tierIncludes(tier, capability)) return;

  throw new AppError('PAYMENT_REQUIRED', 'That feature is not included in your plan.', {
    requiredTier: lowestTierFor(capability),
    currentTier: tier,
  });
}
