// Booking routes - the console half.
// Five capabilities rather than one: cancel is its own, because it reaches into a decision somebody
// ELSE made and takes it back, and an organisation should be able to let a receptionist add a slot
// without also letting them cancel a guest's appointment.
// The whole surface is Gold, so even the reads carry the plan check. A downgraded organisation keeps
// its data and its public link; what it loses is this console.
import { Router } from 'express';
import {
  BookableIdDto,
  BookableListDto,
  CancelBookingDto,
  CreateBookableDto,
  PutSlotsDto,
  UpdateBookableDto,
} from '@endur/shared';
import type { CreateBookableBody, PutSlotsBody, UpdateBookableBody } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  cancelBooking,
  closeBookable,
  createBookable,
  deleteBookable,
  listBookables,
  listBookings,
  openBookable,
  putSlots,
  readBookable,
  updateBookable,
} from './service.js';

// Two routers, two mounts: /bookables is what the organisation publishes, /bookings is what people did
// with it. The id in the cancel path is a BOOKING's, which nothing under /bookables/:id would suggest.
export const bookablesRouter: Router = Router();
export const bookingsRouter: Router = Router();

// Links 6 to 8 for every route below, like every other console router.
bookablesRouter.use(tenantChain);
bookingsRouter.use(tenantChain);

const orgOf = (req: { ctx: { orgId?: string } }): string => req.ctx.orgId as string;

// Everything this organisation offers for booking.
bookablesRouter.get(
  '/',
  authenticate,
  validate(BookableListDto),
  requireCapability('booking.read', { target: 'any' }),
  requireEntitlement('booking.read'),
  (req, res, next) => {
    void listBookables(orgOf(req))
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// Creates a bookable.
bookablesRouter.post(
  '/',
  authenticate,
  validate(CreateBookableDto),
  requireCapability('booking.create', { target: 'any' }),
  requireEntitlement('booking.create'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateBookableBody };
    void createBookable(req, orgOf(req), body)
      .then((data) => res.status(201).json({ data }))
      .catch(next);
  },
);

// One bookable, with its slots.
bookablesRouter.get(
  '/:id',
  authenticate,
  validate(BookableIdDto),
  requireCapability('booking.read', { target: 'any' }),
  requireEntitlement('booking.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void readBookable(orgOf(req), params.id)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// Renames a bookable or edits its details.
bookablesRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateBookableDto),
  requireCapability('booking.update', { target: 'any' }),
  requireEntitlement('booking.update'),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateBookableBody; params: { id: string } };
    void updateBookable(req, orgOf(req), params.id, body)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// The whole set at once, like a template's questions: a partial patch would need a diff protocol both
// sides have to agree about, and the set is small enough to send whole.
bookablesRouter.put(
  '/:id/slots',
  authenticate,
  validate(PutSlotsDto),
  requireCapability('booking.update', { target: 'any' }),
  requireEntitlement('booking.update'),
  (req, res, next) => {
    const { body, params } = req.data as { body: PutSlotsBody; params: { id: string } };
    void putSlots(req, orgOf(req), params.id, body)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// Mints the public link, so it is idempotent like a campaign launch: a double-click must not produce
// two links, one on the projector and one on the card.
bookablesRouter.post(
  '/:id/open',
  authenticate,
  validate(BookableIdDto),
  requireCapability('booking.update', { target: 'any' }),
  requireEntitlement('booking.update'),
  idempotent('booking.open'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void openBookable(req, orgOf(req), params.id)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// No plan check: closing is how an organisation stops a link it can no longer manage, and a 402 here
// would leave a downgraded customer's booking page open with no way to shut it.
bookablesRouter.post(
  '/:id/close',
  authenticate,
  validate(BookableIdDto),
  requireCapability('booking.update', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void closeBookable(req, orgOf(req), params.id)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// Deletes a bookable, its slots and its bookings.
bookablesRouter.delete(
  '/:id',
  authenticate,
  validate(BookableIdDto),
  requireCapability('booking.delete', { target: 'any' }),
  requireEntitlement('booking.delete'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void deleteBookable(req, orgOf(req), params.id)
      .then(() => res.status(204).end())
      .catch(next);
  },
);

// Who booked. The one console read that returns names.
bookablesRouter.get(
  '/:id/bookings',
  authenticate,
  validate(BookableIdDto),
  requireCapability('booking.read', { target: 'any' }),
  requireEntitlement('booking.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void listBookings(orgOf(req), params.id)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// booking.cancel, and this route is the only reason that capability exists.
bookingsRouter.post(
  '/:id/cancel',
  authenticate,
  validate(CancelBookingDto),
  requireCapability('booking.cancel', { target: 'any' }),
  requireEntitlement('booking.cancel'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void cancelBooking(req, orgOf(req), params.id)
      .then(() => res.status(204).end())
      .catch(next);
  },
);
