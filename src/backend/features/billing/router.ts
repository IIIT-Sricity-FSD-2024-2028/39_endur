// Billing routes — the organisation's OWN plan. 13 § Billing, 49 § Route & access.
//
// `GET /billing`        billing.read    what plan are we on
// `GET /billing/plans`  billing.read    what could we be on
// `POST /billing/tier`  billing.update  put us on that one
//
// `billing.update` WRITES THE TIER, deliberately and on the record. `DEC-034` once split
// that capability so the write happened after a checkout; `DEC-035` deleted the checkout,
// so the split had nothing left to hang on. What protects it is what always did the real
// work: `billing.update` is a capability, so it is grantable, denyable and audited like
// every other, and the seeded matrix gives it to administrators and nobody else (11 §8).
//
// NO `requireEntitlement`. `billing.*` is in Bronze (billing/entitlements.ts), so a gate
// here could only ever pass — and if it could fail it would be a paywall in front of the
// upgrade button, which is the exact bug `T-088` recorded as `D-028`.
import { Router } from 'express';
import { JoinTierDto, PLAN_OPTIONS } from '@endur/shared';
import type { JoinTierBody } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { joinTier, readBilling } from './service.js';

export const billingRouter: Router = Router();

billingRouter.use(tenantChain);

billingRouter.get('/', authenticate, requireCapability('billing.read'), (req, res, next) => {
  void readBilling(req.ctx.orgId as string)
    .then((summary) => res.json({ data: summary }))
    .catch(next);
});

/**
 * The catalogue. It is served from `packages/shared` rather than derived from
 * `TIER_ENTITLEMENTS`, because the names and the pitch are advertising copy and the
 * entitlement map is a DECISION — shipping the second one would invite a client-side
 * re-implementation of the 402 (INV-003, tiers.ts's own note).
 *
 * Guarded by `billing.read` like the summary, not left open: `/start` needs the same list
 * with no session and reads it from the shared package directly, so this route has no
 * reason to answer a stranger.
 */
billingRouter.get('/plans', authenticate, requireCapability('billing.read'), (_req, res) => {
  res.json({ data: PLAN_OPTIONS });
});

billingRouter.post(
  '/tier',
  authenticate,
  validate(JoinTierDto),
  requireCapability('billing.update'),
  (req, res, next) => {
    const { body } = req.data as { body: JoinTierBody };
    void joinTier(req, req.ctx.orgId as string, body.tier, body.paymentRef)
      .then((summary) => res.json({ data: summary }))
      .catch(next);
  },
);
