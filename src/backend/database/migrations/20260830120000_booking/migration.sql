-- Booking. 13 § Booking, T-095, DEC-090.
--
-- Three tables, and the third is a DIFFERENT PRIVACY CONTRACT from `responses`. A booking
-- names a person because a booking that cannot be honoured is not a booking; a response
-- names nobody and never will (INV-006). There is no responseId here, no bookingId there,
-- and no column in either that could be made to point at the other.
--
-- There is deliberately NO `taken` COUNTER on `slots`. Remaining places are derived by
-- counting live bookings under a row lock; a stored counter is a second source of truth and
-- it drifts the first time somebody cancels.

CREATE TABLE "bookables" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "subject_id"   UUID,
  -- NULL until opened. Minted by the same generator campaigns use (DEC-017).
  "public_token" TEXT UNIQUE,
  -- Closing stops the link and nothing else; bookings already taken stay.
  "closed_at"    TIMESTAMPTZ(6),
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX "bookables_org_idx" ON "bookables" ("org_id");

ALTER TABLE "bookables" ADD CONSTRAINT "bookables_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: archiving a room must not delete the appointments in it.
ALTER TABLE "bookables" ADD CONSTRAINT "bookables_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "slots" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookable_id" UUID NOT NULL,
  "starts_at"   TIMESTAMPTZ(6) NOT NULL,
  "ends_at"     TIMESTAMPTZ(6) NOT NULL,
  "capacity"    INTEGER NOT NULL DEFAULT 1,

  -- A slot with no places is not a slot, and a slot that ends before it starts is a typo
  -- that would render as a negative duration on a phone. Both refused here as well as in
  -- the DTO: the database is the layer no future caller can route around.
  CONSTRAINT "slots_capacity_positive" CHECK ("capacity" > 0),
  CONSTRAINT "slots_ends_after_starts" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "slots_bookable_starts_idx" ON "slots" ("bookable_id", "starts_at");

ALTER TABLE "slots" ADD CONSTRAINT "slots_bookable_id_fkey"
  FOREIGN KEY ("bookable_id") REFERENCES "bookables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bookings" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "slot_id"      UUID NOT NULL,
  "name"         TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  -- Set when a signed-in member books; NULL for a public one.
  "user_id"      UUID,
  -- The booker's own key. Cancelling with it needs no account.
  "cancel_token" TEXT NOT NULL UNIQUE,
  -- Cancelled, never deleted: the place frees at once and the withdrawal is still history.
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- The capacity query's index: live bookings for one slot.
CREATE INDEX "bookings_slot_idx" ON "bookings" ("slot_id");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL: when a member leaves, the appointment they made still happened.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
