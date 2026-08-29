// Booking routes — the console half. 13 § Booking, T-095.
//
// FIVE CAPABILITIES AND NOT ONE `booking.manage`. Four of them are the ordinary CRUD shape;
// `booking.cancel` is the one that had to be its own, because it reaches into a decision
// SOMEBODY ELSE MADE and takes it back. Folded into `booking.update` it would mean an
// organisation cannot let a receptionist add a slot without also letting them cancel a
// guest's appointment (11 §3).
//
// `requireEntitlement` sits AFTER `requireCapability` on every route including the reads,
// which is the chain's own order (app.ts links 10-11): 403 outranks 402. Unlike
// announcements, NOTHING here is bronze — the whole surface is Gold — so the reads carry the
// entitlement too. A downgraded organisation keeps its data and its PUBLIC LINK (16 §6, §7);
// what it loses is this console.
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

// TWO ROUTERS, TWO MOUNTS, and it is not an accident of prefixes.
//
// `/bookables` is the thing an organisation publishes; `/bookings` is what people did with
// it. Hanging the cancel route off the bookable's prefix would have read as "a booking
// belongs to a bookable in the URL as well as in the schema" — and the id in the path is a
// BOOKING's, which nothing about `/bookables/:id/...` would suggest. The same split
// `resultsRouter` already takes by mounting on `/campaigns` beside `campaignsRouter`.
export const bookablesRouter: Router = Router();
export const bookingsRouter: Router = Router();

// Links 6-8, router-level (12 §2), like every other console router.
bookablesRouter.use(tenantChain);
bookingsRouter.use(tenantChain);

const orgOf = (req: { ctx: { orgId?: string } }): string => req.ctx.orgId as string;

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

// THE WHOLE SET, like `PUT /templates/:id/questions`. A partial slot patch API needs a diff
// protocol both sides have to agree about, and the set is small enough to send whole.
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

// Mints the token, so it is idempotent for the reason launch is: a double-click on stage
// must not produce two links, one of which is on the projector and the other on the card.
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

// NO entitlement. Closing is how an organisation stops a link it can no longer manage, and a
// 402 in front of it would leave a downgraded customer's booking page open with no way to
// shut it — the same argument that keeps `announcement.read` in bronze (16 §7).
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

// WHO BOOKED. The one console read that returns names, and it is `booking.read` rather than
// a verb of its own because the whole surface is already Gold and already scoped `all`.
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

// `booking.cancel`, and this route is the only reason that verb exists.
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
