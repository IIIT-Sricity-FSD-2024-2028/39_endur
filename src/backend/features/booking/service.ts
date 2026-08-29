// Booking. 13 § Booking, T-095, DEC-090.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// A BOOKING IS IDENTIFIED. A RESPONSE IS ANONYMOUS. THEY MUST NEVER MEET.
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// This is the first identified non-staff data in the product: a booker types a name and an
// email, because a booking that cannot be honoured is not a booking. `features/inbox/
// service.ts` states its own version of this rule from the other side; here is ours.
//
// INV-006 says an anonymous response has no retrievable link to a respondent. That promise
// is kept by `responses` having no respondent column at all — and it would be undone not by
// deleting the promise but by building a SECOND identified table that can be joined to it.
// So: there is no `responseId` on a booking, no `bookingId` on a response, no shared table,
// and NO QUERY IN THIS FILE READS `responses`. A test greps this directory for the word,
// which is a blunt instrument and the right one — the rule has to survive somebody who has
// not read this comment.
//
// ─── The other thing this file is about: CAPACITY ─────────────────────────────────────
//
// Two phones taking the last place at the same instant both read `capacity - 1` and both
// succeed, and the demo has a double-booked room. `book()` takes a ROW LOCK on the slot
// before it counts, so the read and the write are serialised per slot — and only per slot,
// so two different slots never wait on each other.
//
// The loser gets 409 and not 400. The request was well-formed and lost a race; those are
// different things to say to a caller, and a client that treats "you're wrong" and "you were
// too slow" the same way tells the booker to fix a form that has nothing wrong with it.
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
// THE SAME GENERATOR CAMPAIGNS USE. Not a second one: DEC-017 settled the alphabet and the
// length once, and a token minted here that reads differently aloud is a token somebody
// cannot dictate across a reception desk.
import { mintToken } from '../campaigns/token.js';

/**
 * 409, and its own class so the route layer never has to guess.
 *
 * A slot that filled between the render and the press is the ONE failure this feature
 * expects to happen in front of an audience, so it gets a sentence a booker can act on
 * rather than the generic conflict wording.
 */
export class SlotFullError extends ConflictError {
  constructor() {
    super('That slot just filled. Pick another one.');
  }
}

/** `/book/:token`, beside `publicUrlFor`'s `/r/:token`. One base URL, two respondent doors. */
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
      // COUNTED, NEVER STORED. `remaining` is `capacity` minus this, and a `taken` column
      // would be a second source of truth that drifts the first time somebody cancels.
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
    // Clamped at zero. Capacity can be lowered under bookings that already exist, and a
    // negative number on a card reads as a bug rather than as "this is oversubscribed".
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
    // No token means no reachable address, and null rather than a URL that 404s.
    url: row.publicToken ? bookingUrlFor(config.PUBLIC_BASE_URL, row.publicToken) : null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    slots,
    booked: row.slots.reduce((total, slot) => total + slot._count.bookings, 0),
  };
}

export async function listBookables(orgId: string): Promise<BookableSummary[]> {
  const rows = await prisma.bookable.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: bookableSelect,
  });
  return rows.map(toSummary);
}

export async function readBookable(orgId: string, id: string): Promise<BookableSummary> {
  const row = await prisma.bookable.findFirst({ where: { id, orgId }, select: bookableSelect });
  // 404 and not 403 for anything outside the tenant (13 §5).
  if (!row) throw new NotFoundError('That bookable does not exist.');
  return toSummary(row);
}

export async function createBookable(
  req: Request,
  orgId: string,
  body: CreateBookableBody,
): Promise<BookableSummary> {
  // Checked here rather than trusted from the body: a subjectId from another tenant would
  // otherwise cross the boundary through a foreign key that knows nothing about orgs.
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

/**
 * REPLACE THE WHOLE SET, the same shape `putQuestions` takes for a template.
 *
 * A slot with live bookings on it is NOT deletable, and the refusal is the point: the
 * cascade would silently drop somebody's appointment, and the person who loses it is not in
 * the room to notice. Cancel the bookings first — deliberately, one at a time, through the
 * verb that exists for taking back somebody else's decision (`booking.cancel`).
 */
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

/**
 * OPEN. Mints the public token, and it is irreversible in the sense a launch is.
 *
 * Idempotent by STATE as well as by key: a bookable that already has a token returns the
 * same one. Once a link is printed on a card it is out of the product's hands, so it is
 * never re-minted and never cleared — `close()` stops it working without changing what it is.
 */
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
  // A link to nothing is worse than no link: somebody scans it and sees an empty page with
  // no way to tell whether the times are coming or the product is broken.
  if (existing.slots.length === 0) {
    throw new ConflictError('Add at least one slot before you open this for booking.');
  }

  await runInTransaction(req, async (tx) => {
    await tx.bookable.update({ where: { id }, data: { publicToken: mintToken(), closedAt: null } });
    req.ctx.audit.push({ action: 'booking.open', targetType: 'bookable', targetId: id });
  });
  return readBookable(orgId, id);
}

/** Close. The link stops answering; every booking already taken stays exactly as it was. */
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

export async function deleteBookable(req: Request, orgId: string, id: string): Promise<void> {
  const existing = await prisma.bookable.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!existing) throw new NotFoundError('That bookable does not exist.');

  await runInTransaction(req, async (tx) => {
    // Slots and bookings go with it, by the migration's ON DELETE CASCADE. That is the one
    // place a live booking IS destroyed without being cancelled first, and it is deliberate:
    // deleting the thing itself is an explicit act on a screen that says what it removes,
    // where editing its times is not.
    await tx.bookable.delete({ where: { id } });
    req.ctx.audit.push({ action: 'booking.delete', targetType: 'bookable', targetId: id });
  });
}

/** Who has booked — the console's view, where names are allowed to exist. */
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

/**
 * Cancel SOMEBODY ELSE'S booking. `booking.cancel`, and the whole reason that verb exists.
 *
 * Cancelling is idempotent: a second call returns rather than throwing, because the caller
 * wanted the appointment gone and it is.
 */
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// The public half. No capability, no session — the token IS the access (DEC-009).
// ─────────────────────────────────────────────────────────────────────────────────────────

export type LiveBookable = {
  id: string;
  name: string;
  description: string | null;
  orgName: string;
};

/**
 * Resolve a `/book/:token` link, or 404.
 *
 * ONE 404 FOR EVERY REASON IT MIGHT NOT WORK — unknown, unopened, closed — exactly as
 * `uniform404` does for a campaign. Different answers here would make the endpoint an
 * existence oracle: probe a token, and the wording tells you whether the bookable is real.
 */
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

/**
 * The public payload. SMALLER than the console's, and the omissions are the specification
 * (13 §6): no capacity, no names, no ids beyond the slots'.
 *
 * A stranger is told how many places are LEFT. Telling them how many there were, or who has
 * taken the rest, would turn a booking link into a roster of who is coming to the clinic on
 * Tuesday — a worse leak than anything the campaign payload could make.
 */
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

/**
 * TAKE A SLOT. The one write in this product with real contention.
 *
 * ```
 * SELECT ... FROM slots WHERE id = $1 FOR UPDATE     <- the lock, FIRST
 * SELECT count(*) FROM bookings WHERE slot_id = $1   <- now nobody else can be counting
 * INSERT INTO bookings ...
 * ```
 *
 * The order is the property. Counting before locking is the bug: two phones both read
 * `capacity - 1`, both pass the check, and the room is double-booked in front of the
 * evaluator. Locking the SLOT and not the table is what keeps that serialisation to the one
 * row that is actually contended — two different slots never wait on each other.
 *
 * READ COMMITTED — THE DEFAULT — AND **NOT** `Serializable`, and that is a correction rather
 * than an omission. This transaction was written with `isolationLevel: 'Serializable'` on the
 * belt-and-braces argument that it costs nothing, and the concurrency test refused it: on a
 * capacity-2 slot, one of the two winners came back `40001 could not serialize access`
 * instead of `201`. Postgres's SSI sees the `count(*)` as a predicate read that the other
 * transaction's insert conflicts with, and aborts one of them — even though `FOR UPDATE` had
 * already made the two strictly sequential and neither was going to overfill anything.
 *
 * So the isolation level did not add safety; it converted a correct booking into a 500. The
 * LOCK is the whole mechanism, and under READ COMMITTED a locked row is re-read at the lock,
 * so the count behind it is the current one. `Serializable` would be the right tool if there
 * were no lock — the two are alternatives, and taking both is how a caller who did nothing
 * wrong is turned away.
 */
export async function book(
  bookable: LiveBookable,
  body: CreateBookingBody,
  userId: string | null,
): Promise<BookingReceipt> {
  return prisma.$transaction(async (tx) => {
    // The slot must belong to THIS bookable. Without the join a caller could book any slot
    // in the database through any open link they happen to hold.
    const slot = await tx.slot.findFirst({
      where: { id: body.slotId, bookableId: bookable.id },
      select: { id: true, capacity: true, startsAt: true, endsAt: true },
    });
    if (!slot) throw new NotFoundError('That time is not available.');

    // The lock, from `db/graph.ts` — the one file permitted raw SQL (DEC-007). Prisma has
    // no expression for FOR UPDATE, and a row it returns is a row no other transaction can
    // be counting against.
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

/**
 * The booker cancels THEIR OWN, with no account.
 *
 * The token is the authorisation and it reaches exactly one row, which is why this is not
 * `booking.cancel`: that verb is for reaching into a decision somebody ELSE made, and this
 * caller is the person who made it.
 */
export async function cancelWithToken(cancelToken: string): Promise<void> {
  const row = await prisma.booking.findUnique({
    where: { cancelToken },
    select: { id: true, cancelledAt: true },
  });
  // Uniform 404, as everywhere else a token is the credential.
  if (!row) throw new NotFoundError('That link is not available.');
  if (row.cancelledAt) return;
  await prisma.booking.update({ where: { id: row.id }, data: { cancelledAt: new Date() } });
}

/**
 * The linked subject must belong to THIS tenant.
 *
 * Checked here rather than trusted from the body: the foreign key knows nothing about
 * organisations, so a subjectId from another one would otherwise cross the boundary
 * silently. The refusal is a 404 and not a 403, for 13 §5's reason — something out of scope
 * must not be distinguishable from something that does not exist.
 *
 * INV-001: the noun comes from the organisation's own vocabulary. A hotel links a bookable
 * to a Restaurant, not to a "subject", and `npm run audit:vocab` fails on the literal.
 */
async function assertSubject(req: Request, orgId: string, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, orgId },
    select: { id: true },
  });
  if (!subject) {
    throw new NotFoundError(`That ${nounsOf(req).subject.one.toLowerCase()} does not exist.`);
  }
}
