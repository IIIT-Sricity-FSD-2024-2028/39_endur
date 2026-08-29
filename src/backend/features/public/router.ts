// The respondent routes. 13 §6, 39.
//
// The only two routes in the product with no capability check. Access IS the token — a
// respondent has no account, no session and no cookie that identifies them (DEC-009), so
// there is nothing for requireCapability to decide.
//
// They are listed in `PUBLIC_ROUTES` in the route-enumeration test with that reason spelled
// out, which is the mechanism that keeps the exception deliberate rather than accidental.
import { Router } from 'express';
import {
  PublicBookDto,
  PublicBookableDto,
  PublicCampaignDto,
  PublicCancelDto,
  SubmitResponseDto,
} from '@endur/shared';
import type { CreateBookingBody, SubmitResponseBody } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { respondentChain } from '../../middleware/chains.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { idempotent } from '../../middleware/idempotency.js';
import { memberOf, requireMembership } from '../../middleware/requireMembership.js';
import { bookableOf, campaignOf, resolveBookable, resolveCampaign } from './resolve.js';
import { book, cancelWithToken, readPublicBookable } from '../booking/service.js';
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

// RESOLVE FIRST, GATE SECOND, AND THE ORDER IS THE SECURITY PROPERTY (12 §4.10c).
//
// resolveCampaign 404s an invalid, unlaunched, not-yet-open, closed or expired token
// exactly as this route always has, so requireMembership is reachable ONLY with a working
// token. Its 401 therefore discloses nothing the token in the caller's hand did not.
// Swapping these two lines turns a restricted campaign into an existence oracle — probe a
// token, and a 401 instead of a 404 tells you the campaign is real.
publicRouter.get(
  '/campaigns/:token',
  validate(PublicCampaignDto),
  resolveCampaign,
  requireMembership,
  (req, res) => {
    res.json({ data: readPublicCampaign(campaignOf(req)) });
  },
);

publicRouter.post(
  '/campaigns/:token/responses',
  // Per-IP, and tight. This route writes to the database with no credential at all.
  scopedRateLimits.respondentSubmit,
  validate(SubmitResponseDto),
  // Same order, same reason. The gate also runs BEFORE idempotency: a refused request
  // should not consume a key, and a caller who is turned away and then signs in must not
  // be replayed their own 401.
  resolveCampaign,
  requireMembership,
  // The idempotency case that matters most (13 §7): a phone on a flaky venue network
  // retries by itself, and a duplicate response corrupts the demo's numbers in front of
  // the evaluator.
  idempotent('public.submit'),
  (req, res, next) => {
    const { body } = req.data as { body: SubmitResponseBody };
    void submitResponse(req, campaignOf(req), body, memberOf(req))
      .then((result) => res.status(201).json({ data: result }))
      .catch(next);
  },
);

// ─────────────────────────────────────────────────────────────────────────────────────────
// BOOKING — T-095. On THIS router and not on a fourth one, which is the whole decision.
//
// A booking link has every property the respondent surface exists for: no account, a phone,
// a venue network, a token that is the access. Mounting it here inherits the wide CORS, the
// absent CSRF, the per-IP rate limit and the ONE `PUBLIC_ROUTES` allowlist entry that is
// already justified in 13 §6 — a separate router would have needed a second exemption, and
// a second exemption is how the first one stops being deliberate.
//
// NOT entitlement-gated, unlike everything in the console half. A guest holding a link did
// not choose the plan and must not be punished for it — 16 §6 already says exactly this
// about a suspended organisation's QR code, and a downgrade is the milder case.
// ─────────────────────────────────────────────────────────────────────────────────────────

publicRouter.get(
  '/bookables/:token',
  validate(PublicBookableDto),
  resolveBookable,
  (req, res, next) => {
    void readPublicBookable(bookableOf(req))
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

publicRouter.post(
  '/bookables/:token/bookings',
  // Per-IP and tight, as the submit route is: this writes to the database with no credential
  // at all. Same bucket, because it is the same threat and a second one would be a second
  // number to keep in step.
  scopedRateLimits.respondentSubmit,
  validate(PublicBookDto),
  // Resolve first, gate second — the order is the security property (12 §4.10c). There is no
  // membership gate here yet; the order is kept anyway so that adding one cannot get it wrong.
  resolveBookable,
  // A phone on a flaky network retries by itself, and a duplicate booking takes two places
  // out of a slot for one person — the same failure a duplicate response is, with a seat
  // attached (13 §7).
  idempotent('public.book'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateBookingBody };
    // The user id when a signed-in member happens to be booking, NULL otherwise. It is not
    // authorisation and nothing reads it as such — the token is the access, exactly as on the
    // response routes; this only records that the booker had an account.
    const principal = req.ctx.principal;
    const userId = principal?.kind === 'user' && principal.id ? principal.id : null;
    void book(bookableOf(req), body, userId)
      .then((receipt) => res.status(201).json({ data: receipt }))
      .catch(next);
  },
);

// The booker's own, with no account. The cancel token authorises exactly one row, which is
// why this is not `booking.cancel` — that verb is for reaching into somebody ELSE's decision.
publicRouter.post(
  '/bookings/:cancelToken/cancel',
  scopedRateLimits.respondentSubmit,
  validate(PublicCancelDto),
  (req, res, next) => {
    const { params } = req.data as { params: { cancelToken: string } };
    void cancelWithToken(params.cancelToken)
      .then(() => res.status(204).end())
      .catch(next);
  },
);
