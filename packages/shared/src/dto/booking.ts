// Booking DTOs. 13 § Booking, T-095, DEC-090.
//
// TWO THINGS ARE NOT IN THIS FILE AND BOTH ABSENCES ARE DELIBERATE:
//
//   1. NO `remaining` ON ANY BODY. The client never sends availability and the server never
//      trusts one. Remaining places are derived under a row lock at the moment of writing
//      (`features/booking/service.ts`), so a picker rendering a stale "1 left" is refused
//      with a 409 rather than allowed to double-book.
//
//   2. NO `responseId`, AND NO FIELD THAT COULD HOLD ONE. A booking is IDENTIFIED — it
//      carries a name and an email, because a booking that cannot be honoured is not a
//      booking — and a response is anonymous forever (INV-006). DEC-090 keeps the two apart
//      at every layer, and this file is the layer a client can see.
import { z } from 'zod';
import { dto, Id } from './common.js';

/** The public token in a `/book/:token` link, and the booker's own cancel key. Both are
 *  8 characters of the campaign alphabet (DEC-017), so both validate the same way. */
export const BookingToken = z.string().min(6).max(64);

export const CreateBookableBody = z.object({
  name: z.string().min(1).max(140),
  description: z.string().max(2000).optional(),
  /** A bookable often IS a subject — a room, a machine, a person. Optional, never required:
   *  plenty of bookable things are nobody's reviewee. */
  subjectId: Id.optional(),
});
export type CreateBookableBody = z.infer<typeof CreateBookableBody>;

export const UpdateBookableBody = z.object({
  name: z.string().min(1).max(140).optional(),
  description: z.string().max(2000).nullable().optional(),
  subjectId: Id.nullable().optional(),
});
export type UpdateBookableBody = z.infer<typeof UpdateBookableBody>;

/**
 * One slot, as the editor sends it. No id: `PUT /slots` replaces THE WHOLE SET, exactly as
 * `PutQuestions` does for a template — a partial slot patch API would need a diff protocol
 * that both sides have to agree about, and the set is small enough that sending it whole is
 * cheaper to get right.
 */
export const SlotInput = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    /** 10 is not a limit on the product; it is a limit on ONE SLOT, and a slot that fits
     *  more than ten people is a room, which is a different bookable. */
    capacity: z.number().int().min(1).max(100).default(1),
  })
  .refine((slot) => slot.endsAt > slot.startsAt, {
    message: 'A slot has to end after it starts.',
    path: ['endsAt'],
  });
export type SlotInput = z.infer<typeof SlotInput>;

export const PutSlotsBody = z.object({
  // Empty is legal — clearing the set is how somebody starts a week over. 60 is a fortnight
  // of half-hour appointments and comfortably past anything the console can render usefully.
  slots: z.array(SlotInput).max(60),
});
export type PutSlotsBody = z.infer<typeof PutSlotsBody>;

/**
 * What a BOOKER sends. A name and an email, and nothing that identifies them further.
 *
 * The email is what makes the booking honourable — somebody has to be reachable when the
 * appointment moves — and it is the first identified non-staff data in the product
 * (`DEC-090`). It is stored on `bookings` and nowhere else, and it never reaches `responses`.
 */
export const CreateBookingBody = z.object({
  slotId: Id,
  name: z.string().min(1).max(140),
  email: z.string().email().max(200),
});
export type CreateBookingBody = z.infer<typeof CreateBookingBody>;

export const BookableListDto = dto({});
export const BookableIdDto = dto({ params: z.object({ id: Id }) });
export const CreateBookableDto = dto({ body: CreateBookableBody });
export const UpdateBookableDto = dto({
  params: z.object({ id: Id }),
  body: UpdateBookableBody,
});
export const PutSlotsDto = dto({ params: z.object({ id: Id }), body: PutSlotsBody });
export const CancelBookingDto = dto({ params: z.object({ id: Id }) });

export const PublicBookableDto = dto({ params: z.object({ token: BookingToken }) });
export const PublicBookDto = dto({
  params: z.object({ token: BookingToken }),
  body: CreateBookingBody,
});
export const PublicCancelDto = dto({ params: z.object({ cancelToken: BookingToken }) });

/**
 * One slot as EVERY screen reads it — the console's editor and the public picker both.
 *
 * `remaining` is the server's number and the only availability figure that exists; there is
 * no stored counter behind it (`10` § Slot). The PUBLIC payload carries `remaining` and
 * omits `capacity`: a stranger is told how many places are left, never how many there were
 * or who took the rest (`13` §6).
 */
export type SlotView = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  remaining: number;
};

/** The console's view of a bookable. */
export type BookableSummary = {
  id: string;
  name: string;
  description: string | null;
  subjectId: string | null;
  subjectName: string | null;
  /** Null until it is opened. Null is the ONLY thing that means "not open yet". */
  publicToken: string | null;
  /** The reachable `/book/:token` address, or null while there is no token. */
  url: string | null;
  closedAt: string | null;
  createdAt: string;
  slots: SlotView[];
  /** Live bookings across every slot. The list's one number. */
  booked: number;
};

/** A booking, in the console, where it is allowed to have a name on it. */
export type BookingSummary = {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  name: string;
  email: string;
  cancelledAt: string | null;
  createdAt: string;
};

/**
 * What the PUBLIC picker gets. Deliberately smaller than `BookableSummary`: no ids beyond
 * the slots', no subject, no counts of who has booked, no capacity.
 */
export type PublicBookable = {
  name: string;
  description: string | null;
  orgName: string;
  slots: Array<Omit<SlotView, 'capacity'>>;
};

/** What a booker is handed back: their cancel key, and nothing about anybody else. */
export type BookingReceipt = {
  cancelToken: string;
  startsAt: string;
  endsAt: string;
};
