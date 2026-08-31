// Booking.
// A BOOKING IS IDENTIFIED. A RESPONSE IS ANONYMOUS. THEY MUST NEVER MEET.
// A booker types a name and an email, because a booking that cannot be honoured is not a booking.
// The anonymity promise is kept by responses having no respondent column - and it would be undone by
// building a second identified table that could be joined to it. So nothing here has a response id,
// nothing there has a booking id, and no query in this file reads responses. A test greps for it.
// The other subject of this file is CAPACITY: two phones taking the last place at once would both read
// "one left" and both succeed, so book() locks the slot row BEFORE it counts. The loser gets 409, not
// 400 - the request was fine, it simply lost a race.
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type {
  BookableSummary,
  BookingReceipt,
  BookingSummary,
  CreateBookableBody,
  CreateBookingBody,
  PublicBookable,
  PutSlotsBody,
  SlotView,
  UpdateBookableBody,
} from '@endur/shared';
import { prisma } from '../../db/client.js';
import { lockSlot } from '../../db/graph.js';
import { runInTransaction } from '../../db/tx.js';
import { config } from '../../lib/config.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { nounsOf } from '../../lib/vocabulary.js';
// The same token generator campaigns use, so a booking link reads aloud the same way one does.
import { mintToken } from '../campaigns/token.js';

// 409 with its own class, so the route layer never has to guess.
// A slot filling between the render and the press is the one failure expected in front of an audience.
export class SlotFullError extends ConflictError {
  constructor() {
    super('That slot just filled. Pick another one.');
  }
}

// /book/:token, beside the feedback link's /r/:token: one base URL, two respondent doors.
export const bookingUrlFor = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/book/${token}`;

const bookableSelect = {
  id: true,
  name: true,
  description: true,
  subjectId: true,
  subject: { select: { name: true } },
  publicToken: true,
  closedAt: true,
  createdAt: true,
  slots: {
    orderBy: { startsAt: 'asc' as const },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      // Counted, never stored: a 'taken' column would be a second source of truth that drifts on the first cancellation.
      _count: { select: { bookings: { where: { cancelledAt: null } } } },
    },
  },
} satisfies Prisma.BookableSelect;

type Row = Prisma.BookableGetPayload<{ select: typeof bookableSelect }>;

const slotViews = (row: Row): SlotView[] =>
  row.slots.map((slot) => ({
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    capacity: slot.capacity,
    // Clamped at zero, because capacity can be lowered under existing bookings and a negative number reads as a bug.
    remaining: Math.max(0, slot.capacity - slot._count.bookings),
  }));

function toSummary(row: Row): BookableSummary {
  const slots = slotViews(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subjectId: row.subjectId,
    subjectName: row.subject?.name ?? null,
    publicToken: row.publicToken,
    // No token means no reachable address, so null rather than a URL that 404s.
    url: row.publicToken ? bookingUrlFor(config.PUBLIC_BASE_URL, row.publicToken) : null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    slots,
    booked: row.slots.reduce((total, slot) => total + slot._count.bookings, 0),
  };
}

// Every bookable in the organisation.
export async function listBookables(orgId: string): Promise<BookableSummary[]> {
  const rows = await prisma.bookable.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: bookableSelect,
  });
  return rows.map(toSummary);
}

// One bookable, or 404.
export async function readBookable(orgId: string, id: string): Promise<BookableSummary> {
  const row = await prisma.bookable.findFirst({ where: { id, orgId }, select: bookableSelect });
  // 404 and not 403 for anything outside this organisation.
  if (!row) throw new NotFoundError('That bookable does not exist.');
  return toSummary(row);
}

// Creates a bookable, optionally linked to a subject.
export async function createBookable(
  req: Request,
  orgId: string,
  body: CreateBookableBody,
): Promise<BookableSummary> {
  // Checked here rather than trusted from the body: a foreign key knows nothing about organisations.
  if (body.subjectId) await assertSubject(req, orgId, body.subjectId);

  const id = await runInTransaction(req, async (tx) => {
    const row = await tx.bookable.create({
      data: {
        orgId,
        name: body.name,
        description: body.description ?? null,
        subjectId: body.subjectId ?? null,
      },
      select: { id: true },
    });
    req.ctx.audit.push({ action: 'booking.create', targetType: 'bookable', targetId: row.id });
    return row.id;
  });
  return readBookable(orgId, id);
}

// Renames a bookable or edits its details.
export async function updateBookable(
  req: Request,
  orgId: string,
  id: string,
  body: UpdateBookableBody,
): Promise<BookableSummary> {
  await readBookable(orgId, id);
  if (body.subjectId) await assertSubject(req, orgId, body.subjectId);

  await runInTransaction(req, async (tx) => {
    await tx.bookable.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
      },
    });
    req.ctx.audit.push({ action: 'booking.update', targetType: 'bookable', targetId: id });
  });
  return readBookable(orgId, id);
}

// Replaces the whole set of slots.
// A slot with live bookings cannot be deleted, and the refusal is the point: the cascade would silently
// drop somebody's appointment, and that person is not in the room to notice. Cancel the bookings first.
export async function putSlots(
  req: Request,
  orgId: string,
  id: string,
  body: PutSlotsBody,
): Promise<BookableSummary> {
  const existing = await prisma.bookable.findFirst({
    where: { id, orgId },
    select: {
      slots: {
        select: { id: true, _count: { select: { bookings: { where: { cancelledAt: null } } } } },
      },
    },
  });
  if (!existing) throw new NotFoundError('That bookable does not exist.');

  const booked = existing.slots.filter((slot) => slot._count.bookings > 0);
  if (booked.length > 0) {
    throw new ConflictError(
      'Some of these slots have bookings. Cancel those first, then change the times.',
    );
  }

  await runInTransaction(req, async (tx) => {
    await tx.slot.deleteMany({ where: { bookableId: id } });
    if (body.slots.length > 0) {
      await tx.slot.createMany({
        data: body.slots.map((slot) => ({
          bookableId: id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          capacity: slot.capacity,
        })),
      });
    }
    req.ctx.audit.push({ action: 'booking.update', targetType: 'bookable', targetId: id });
  });

  return readBookable(orgId, id);
}

// Open: mints the public token, and it is irreversible in the sense a launch is.
// Idempotent by state as well as by key. Once a link is printed on a card it is out of our hands, so it
// is never re-minted; closing stops it working without changing what it is.
export async function openBookable(
  req: Request,
  orgId: string,
  id: string,
): Promise<BookableSummary> {
  const existing = await prisma.bookable.findFirst({
    where: { id, orgId },
    select: { publicToken: true, slots: { select: { id: true }, take: 1 } },
  });
  if (!existing) throw new NotFoundError('That bookable does not exist.');
  if (existing.publicToken) return readBookable(orgId, id);
  // A link to nothing is worse than no link: somebody scans it and cannot tell whether times are coming
  // or the product is broken.
  if (existing.slots.length === 0) {
    throw new ConflictError('Add at least one slot before you open this for booking.');
  }

  await runInTransaction(req, async (tx) => {
    await tx.bookable.update({ where: { id }, data: { publicToken: mintToken(), closedAt: null } });
    req.ctx.audit.push({ action: 'booking.open', targetType: 'bookable', targetId: id });
  });
  return readBookable(orgId, id);
}

// Close: the link stops answering, and every booking already taken stays exactly as it was.
export async function closeBookable(
  req: Request,
  orgId: string,
  id: string,
): Promise<BookableSummary> {
  const row = await readBookable(orgId, id);
  if (row.closedAt) return row;

  await runInTransaction(req, async (tx) => {
    await tx.bookable.update({ where: { id }, data: { closedAt: new Date() } });
    req.ctx.audit.push({ action: 'booking.close', targetType: 'bookable', targetId: id });
  });
  return readBookable(orgId, id);
}

// Deletes a bookable, and its slots and bookings with it.
export async function deleteBookable(req: Request, orgId: string, id: string): Promise<void> {
  const existing = await prisma.bookable.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!existing) throw new NotFoundError('That bookable does not exist.');

  await runInTransaction(req, async (tx) => {
    // Slots and bookings go with it, by the database's cascade. This is the one place a live booking is
    // destroyed without being cancelled first, and it is deliberate: deleting the thing itself is explicit.
    await tx.bookable.delete({ where: { id } });
    req.ctx.audit.push({ action: 'booking.delete', targetType: 'bookable', targetId: id });
  });
}

// Who has booked - the console's view, where names are allowed to exist.
export async function listBookings(orgId: string, id: string): Promise<BookingSummary[]> {
  await readBookable(orgId, id);
  const rows = await prisma.booking.findMany({
    where: { slot: { bookableId: id } },
    orderBy: [{ slot: { startsAt: 'asc' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      slotId: true,
      name: true,
      email: true,
      cancelledAt: true,
      createdAt: true,
      slot: { select: { startsAt: true, endsAt: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    slotId: row.slotId,
    startsAt: row.slot.startsAt.toISOString(),
    endsAt: row.slot.endsAt.toISOString(),
    name: row.name,
    email: row.email,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

// Cancels SOMEBODY ELSE'S booking, which is the whole reason that capability exists.
// Idempotent: a second call returns quietly, because the caller wanted the appointment gone and it is.
export async function cancelBooking(req: Request, orgId: string, id: string): Promise<void> {
  const row = await prisma.booking.findFirst({
    where: { id, slot: { bookable: { orgId } } },
    select: { id: true, cancelledAt: true },
  });
  if (!row) throw new NotFoundError('That booking does not exist.');
  if (row.cancelledAt) return;

  await runInTransaction(req, async (tx) => {
    await tx.booking.update({ where: { id }, data: { cancelledAt: new Date() } });
    req.ctx.audit.push({ action: 'booking.cancel', targetType: 'booking', targetId: id });
  });
}

// The public half. No capability and no session - the token IS the access.

export type LiveBookable = {
  id: string;
  name: string;
  description: string | null;
  orgName: string;
};

// Resolves a /book/:token link, or 404. One 404 for every reason it might not work - unknown, unopened,
// closed - so the wording cannot tell a probe whether the bookable is real.
export async function resolveBookable(token: string): Promise<LiveBookable> {
  const row = await prisma.bookable.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      description: true,
      closedAt: true,
      org: { select: { name: true } },
    },
  });
  if (!row || row.closedAt) throw new NotFoundError('That link is not available.');
  return { id: row.id, name: row.name, description: row.description, orgName: row.org.name };
}

// The public payload, SMALLER than the console's, and the omissions are the specification:
// no capacity, no names, no ids beyond the slots'. A stranger is told how many places are LEFT,
// because how many there were, or who took the rest, would be a roster of who is coming on Tuesday.
export async function readPublicBookable(bookable: LiveBookable): Promise<PublicBookable> {
  const row = await prisma.bookable.findUnique({
    where: { id: bookable.id },
    select: bookableSelect,
  });
  if (!row) throw new NotFoundError('That link is not available.');
  return {
    name: bookable.name,
    description: bookable.description,
    orgName: bookable.orgName,
    slots: slotViews(row).map(({ capacity: _capacity, ...slot }) => slot),
  };
}

// Takes a slot. The one write in this product with real contention:
//   lock the slot row, THEN count the bookings, THEN insert.
// The order is the property - counting before locking is the bug that double-books a room.
// Locking the SLOT and not the table keeps the waiting to the one row that is contended.
// Deliberately the default isolation level and NOT serializable: with the lock already in place,
// serializable turns one of two legitimate bookings into a serialisation failure.
export async function book(
  bookable: LiveBookable,
  body: CreateBookingBody,
  userId: string | null,
): Promise<BookingReceipt> {
  return prisma.$transaction(async (tx) => {
    // The slot must belong to THIS bookable, or any open link would reach any slot in the database.
    const slot = await tx.slot.findFirst({
      where: { id: body.slotId, bookableId: bookable.id },
      select: { id: true, capacity: true, startsAt: true, endsAt: true },
    });
    if (!slot) throw new NotFoundError('That time is not available.');

    // The lock, from the one file allowed raw SQL: Prisma has no expression for SELECT ... FOR UPDATE.
    await lockSlot(tx, slot.id);

    const taken = await tx.booking.count({ where: { slotId: slot.id, cancelledAt: null } });
    if (taken >= slot.capacity) throw new SlotFullError();

    const booking = await tx.booking.create({
      data: {
        slotId: slot.id,
        name: body.name,
        email: body.email,
        userId,
        cancelToken: mintToken(),
      },
      select: { cancelToken: true },
    });

    return {
      cancelToken: booking.cancelToken,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    };
  });
}

// The booker cancels their OWN, with no account.
// The token authorises exactly one row, which is why this is not the cancel capability: that verb is
// for reaching into a decision somebody else made, and this caller made it.
export async function cancelWithToken(cancelToken: string): Promise<void> {
  const row = await prisma.booking.findUnique({
    where: { cancelToken },
    select: { id: true, cancelledAt: true },
  });
  // The same uniform 404 used everywhere a token is the credential.
  if (!row) throw new NotFoundError('That link is not available.');
  if (row.cancelledAt) return;
  await prisma.booking.update({ where: { id: row.id }, data: { cancelledAt: new Date() } });
}

// The linked subject must belong to THIS organisation, checked rather than trusted, because the foreign
// key knows nothing about tenants. 404 and not 403, and the noun comes from the organisation's own words.
async function assertSubject(req: Request, orgId: string, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, orgId },
    select: { id: true },
  });
  if (!subject) {
    throw new NotFoundError(`That ${nounsOf(req).subject.one.toLowerCase()} does not exist.`);
  }
}
