// Billing routes — the organisation's OWN plan. 13 § Billing, 49 § Route & access.
//
// `GET    /billing`            billing.read    what plan are we on
// `GET    /billing/plans`      billing.read    what could we be on
// `POST   /billing/tier`       billing.update  put us on that one
// `POST   /billing/downgrade`  billing.update  put us on a lower one when this period ends
// `DELETE /billing/downgrade`  billing.update  never mind
//
// THE LAST TWO SHARE `billing.update` WITH THE JOIN, and that is not laziness about
// granularity. `11` §3's rule is that a capability answers a question somebody would actually
// grant separately, and "may change the plan" is one question — an administrator trusted to
// buy Gold is not a different administrator from the one trusted to schedule Bronze. Splitting
// it would produce a role that can spend money but not stop spending it.
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
import {
  EnterpriseRequestDto,
  JoinTierDto,
  PLAN_OPTIONS,
  ScheduleDowngradeDto,
} from '@endur/shared';
import type {
  EnterpriseRequestBody,
  JoinTierBody,
  ScheduleDowngradeBody,
} from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  cancelDowngrade,
  joinTier,
  readBilling,
  readEnterpriseRequest,
  requestEnterprise,
  scheduleDowngrade,
} from './service.js';

export const billingRouter: Router = Router();

billingRouter.use(tenantChain);

/**
 * A GET THAT CAN WRITE, and twice over: it repairs a missing subscription row (`D-012`) and it
 * fires a scheduled downgrade whose period has ended (`DEC-098`). Both are evaluate-on-read
 * rather than a scheduler, which `OPEN-005` says nothing owns — and both write so that this
 * page and the entitlement gate agree from the NEXT request onward rather than the page
 * rendering a state the gate has never heard of.
 */
billingRouter.get('/', authenticate, requireCapability('billing.read'), (req, res, next) => {
  void readBilling(req.ctx.orgId as string, req.ctx.requestId)
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

/**
 * SCHEDULE A MOVE DOWN — DEC-098. Nothing is captured and nothing changes today, so there is
 * no `paymentRef` and no dialog in front of it: `<PaymentDialog>` exists because money is
 * taken, and here none is.
 */
billingRouter.post(
  '/downgrade',
  authenticate,
  validate(ScheduleDowngradeDto),
  requireCapability('billing.update'),
  (req, res, next) => {
    const { body } = req.data as { body: ScheduleDowngradeBody };
    void scheduleDowngrade(req, req.ctx.orgId as string, body.tier)
      .then((summary) => res.json({ data: summary }))
      .catch(next);
  },
);

/** Cancel it. No body — there is only ever one pending value (DEC-098, `13` § Billing). */
billingRouter.delete(
  '/downgrade',
  authenticate,
  requireCapability('billing.update'),
  (req, res, next) => {
    void cancelDowngrade(req, req.ctx.orgId as string)
      .then((summary) => res.json({ data: summary }))
      .catch(next);
  },
);

/**
 * ASKING FOR ENTERPRISE — DEC-100, T-100.
 *
 * `billing.update`, the same capability the join carries, and for the reason `11` §3 gives:
 * a capability answers a question somebody would grant separately, and "may change what this
 * organisation pays for" is one question. An administrator trusted to buy Gold is the person
 * who should be able to ask about Enterprise.
 *
 * NOT `requireEntitlement`. A tier gate in front of the route that asks for a higher tier is
 * the paywall-on-the-upgrade-button bug `T-088` recorded as `D-028`, in its purest form.
 */
billingRouter.get('/enterprise-request', authenticate, requireCapability('billing.read'), (req, res, next) => {
  void readEnterpriseRequest(req.ctx.orgId as string)
    .then((state) => res.json({ data: state }))
    .catch(next);
});

billingRouter.post(
  '/enterprise-request',
  authenticate,
  validate(EnterpriseRequestDto),
  requireCapability('billing.update'),
  (req, res, next) => {
    const { body } = req.data as { body: EnterpriseRequestBody };
    void requestEnterprise(req, req.ctx.orgId as string, body.note)
      .then((state) => res.status(201).json({ data: state }))
      .catch(next);
  },
);

