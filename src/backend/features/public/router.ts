// The respondent routes. 13 §6, 39.
//
// The only two routes in the product with no capability check. Access IS the token — a
// respondent has no account, no session and no cookie that identifies them (DEC-009), so
// there is nothing for requireCapability to decide.
//
// They are listed in `PUBLIC_ROUTES` in the route-enumeration test with that reason spelled
// out, which is the mechanism that keeps the exception deliberate rather than accidental.
import { Router } from 'express';
import { PublicCampaignDto, SubmitResponseDto } from '@endur/shared';
import type { SubmitResponseBody } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { respondentChain } from '../../middleware/chains.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { idempotent } from '../../middleware/idempotency.js';
import { readPublicCampaign, submitResponse } from './service.js';

export const publicRouter: Router = Router();

// Links 6-8, router-level (12 §2), and a DIFFERENT set from every other router.
//
// publicCors is wide and without credentials: a QR scan has to work from any network, off
// any phone, with no cookie attached — which is exactly why this is a different CORS
// policy from the console's and why it is mounted here rather than globally.
//
// The tenant is optional (an invalid token must 404 like a closed campaign, not 401 —
// 13 §6) and there is NO csrfProtection, because these routes carry no ambient authority
// for a forged request to borrow. See middleware/chains.ts.
publicRouter.use(respondentChain);

publicRouter.get(
  '/campaigns/:token',
  validate(PublicCampaignDto),
  (req, res, next) => {
    const { params } = req.data as { params: { token: string } };
    void readPublicCampaign(params.token)
      .then((campaign) => res.json({ data: campaign }))
      .catch(next);
  },
);

publicRouter.post(
  '/campaigns/:token/responses',
  // Per-IP, and tight. This route writes to the database with no credential at all.
  scopedRateLimits.respondentSubmit,
  validate(SubmitResponseDto),
  // The idempotency case that matters most (13 §7): a phone on a flaky venue network
  // retries by itself, and a duplicate response corrupts the demo's numbers in front of
  // the evaluator.
  idempotent('public.submit'),
  (req, res, next) => {
    const { body, params } = req.data as {
      body: SubmitResponseBody;
      params: { token: string };
    };
    void submitResponse(req, params.token, body)
      .then((result) => res.status(201).json({ data: result }))
      .catch(next);
  },
);
