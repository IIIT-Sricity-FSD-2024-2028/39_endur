// The respondent routes: what a phone reaches after scanning a QR code.
// The only routes with no capability check, because the token IS the access - a respondent has no account,
// no session and no cookie. The route test lists them with that reason, so the exception stays deliberate.
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

// A different chain from every other router: wide CORS with no credentials, so a scan works from any network,
// an optional organisation, and no CSRF, because there is no cookie here for a forged request to borrow.
publicRouter.use(respondentChain);

// Resolve first, gate second - and the ORDER is the security property.
// The resolver 404s an unknown, unlaunched, closed or expired token, so the membership gate is only
// reachable with a working token. Swapping the two would let a probe tell a real campaign from a fake one.
// The form a respondent sees.
publicRouter.get(
  '/campaigns/:token',
  validate(PublicCampaignDto),
  resolveCampaign,
  requireMembership,
  (req, res) => {
    res.json({ data: readPublicCampaign(campaignOf(req)) });
  },
);

// Submitting answers.
publicRouter.post(
  '/campaigns/:token/responses',
  // Per IP, and tight: this route writes to the database with no credential at all.
  scopedRateLimits.respondentSubmit,
  validate(SubmitResponseDto),
  // Same order, same reason. It also runs before idempotency, so a refused request does not consume a key.
  resolveCampaign,
  requireMembership,
  // The idempotency case that matters most: a phone on a weak network retries by itself, and a duplicate
  // response would corrupt the numbers during the demo.
  idempotent('public.submit'),
  (req, res, next) => {
    const { body } = req.data as { body: SubmitResponseBody };
    void submitResponse(req, campaignOf(req), body, memberOf(req))
      .then((result) => res.status(201).json({ data: result }))
      .catch(next);
  },
);

// Booking, on THIS router rather than a fourth one: a booking link has every property the respondent
// surface exists for, and mounting it here inherits the one already-justified public exemption.
// Not plan-gated either: a guest holding a link did not choose the organisation's plan.

// The public booking page for a bookable's open slots.
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

// Making a booking.
publicRouter.post(
  '/bookables/:token/bookings',
  // Per IP and tight, like submit: this writes with no credential. The same bucket, because it is the same threat.
  scopedRateLimits.respondentSubmit,
  validate(PublicBookDto),
  // Resolve first, gate second. There is no membership gate here yet; the order is kept so adding one is safe.
  resolveBookable,
  // A retry on a weak network must not take two places out of a slot for one person.
  idempotent('public.book'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateBookingBody };
    // The account id when a signed-in member happens to be booking, otherwise null. It is not authorisation:
    // the token is the access, and this only records that the booker had an account.
    const principal = req.ctx.principal;
    const userId = principal?.kind === 'user' && principal.id ? principal.id : null;
    void book(bookableOf(req), body, userId)
      .then((receipt) => res.status(201).json({ data: receipt }))
      .catch(next);
  },
);

// The booker's own cancellation. The cancel token authorises exactly one row, which is why this is not
// the booking.cancel capability - that verb is for reaching into somebody else's booking.
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
