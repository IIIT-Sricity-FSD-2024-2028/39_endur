// Link 11. The billing gate, deliberately separate from permissions:
//   403 = you are not allowed to do this   ·   402 = your plan does not include it.
// It runs after requireCapability, so nobody is told to upgrade for something they could not do anyway.
import type { RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import { lowestTierFor, tierIncludes, type Tier } from '../billing/entitlements.js';
import { effectiveTier } from '../billing/effective.js';
import { AppError, UnauthenticatedError } from '../lib/errors.js';

// Builds the middleware that checks this org's plan includes the capability.
export const requireEntitlement =
  (capability: Capability): RequestHandler =>
  (req, _res, next) => {
    void check(req.ctx.orgId, capability, req.db)
      .then(() => next())
      .catch(next);
  };

// Looks up the org's plan and throws 402 when the capability is not in it.
async function check(
  orgId: string | undefined,
  capability: Capability,
  db: Express.Request['db'],
): Promise<void> {
  if (!orgId) throw new UnauthenticatedError();

  // Reads three columns, because a period can end with nothing writing to the row. This gate never writes.
  const subscription = await db.subscription.findFirst({
    select: { tier: true, pendingTier: true, periodEnd: true },
  });
  // No subscription row falls back to bronze: a bookkeeping gap should never lock a customer out of the product.
  const tier: Tier = subscription ? effectiveTier(subscription) : 'bronze';

  if (tierIncludes(tier, capability)) return;

  throw new AppError('PAYMENT_REQUIRED', 'That feature is not included in your plan.', {
    requiredTier: lowestTierFor(capability),
    currentTier: tier,
  });
}
