// Billing routes - the organisation's OWN plan (the operator's side lives under /platform).
//   GET    /billing            what plan are we on
//   GET    /billing/plans      what could we be on
//   POST   /billing/tier       put us on that one
//   POST   /billing/downgrade  put us on a lower one when this period ends
//   DELETE /billing/downgrade  never mind
// All the writes share billing.update, because "may change the plan" is one question:
// an administrator trusted to buy Gold is not a different person from one trusted to schedule Bronze.
// There is no plan gate here, because billing is in every tier - a paywall on the upgrade button would be a bug.
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

// A GET that can write: it repairs a missing subscription row and fires a downgrade whose period has ended.
// Both happen on read because there is no scheduler, and writing means the page and the entitlement gate
// agree from the next request onwards.
billingRouter.get('/', authenticate, requireCapability('billing.read'), (req, res, next) => {
  void readBilling(req.ctx.orgId as string, req.ctx.requestId)
    .then((summary) => res.json({ data: summary }))
    .catch(next);
});

// The plan catalogue, served from the shared package rather than derived from the entitlement map:
// the names and the pitch are copy, and the entitlement map is a decision the client must not re-implement.
billingRouter.get('/plans', authenticate, requireCapability('billing.read'), (_req, res) => {
  res.json({ data: PLAN_OPTIONS });
});

// Joins a higher tier, effective immediately.
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

// Schedules a move down. Nothing is captured and nothing changes today, so there is no payment dialog.
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

// Cancels it. No body, because there is only ever one pending value.
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

// Asking to be sold Enterprise.
// The same capability as the join, and no plan gate: a tier gate in front of the route that asks for a
// higher tier would be a paywall on the upgrade button.
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

