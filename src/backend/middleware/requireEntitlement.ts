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

  const subscription = await db.subscription.findFirst({ select: { tier: true } });
  // No subscription row means the trial default, not a lockout. An org that has not been
  // billed yet must still be able to use the product.
  const tier = (subscription?.tier ?? 'bronze') as Tier;

  if (tierIncludes(tier, capability)) return;

  throw new AppError('PAYMENT_REQUIRED', 'That feature is not included in your plan.', {
    requiredTier: lowestTierFor(capability),
    currentTier: tier,
  });
}
