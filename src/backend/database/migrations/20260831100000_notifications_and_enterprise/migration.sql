-- Two tables the customer can actually reach. DEC-100, DEC-101, T-100, T-101, 10 §5.
--
-- THEY ARE IN ONE MIGRATION BECAUSE THEY ARE ONE FINDING: the operator's console had two
-- affordances that ended at the operator. A message returned `{ sentTo: 3 }` and wrote a row
-- to `platform_audit_log` -- THE OPERATOR'S OWN TABLE -- while the customer's administrators
-- had no route and no screen; and Enterprise, the one tier the product says is arranged
-- rather than bought, had no way for a customer to ask.
--
-- NEITHER IS `63-FEATURE-NOTIFICATIONS`. That document is outbound multichannel delivery and
-- is P3 behind a provider and `17` (CONF-006). Nothing here leaves the product.

CREATE TABLE "notifications" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     UUID NOT NULL,
  -- ONE ROW PER RECIPIENT, not one row with a list: read state is the READER'S (58), and a
  -- shared row cannot be read by one administrator and unread by another.
  "user_id"    UUID NOT NULL,
  -- 'platform_message' today. The column is here so the second kind is a value rather than a
  -- migration.
  "kind"       TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  -- CAPTURED, never joined back to the audit row. The audit payload is the operator's record
  -- of what they sent; this is the customer's copy of what they were sent.
  "body"       TEXT NOT NULL,
  "read_at"    TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- The inbox's only query: this reader's rows, unread first. `58`'s tab count reads the same
-- index rather than a second counter column, for the reason `bookings` has no `taken`.
CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_requests" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL,
  -- SET NULL rather than CASCADE: the person who asked may leave before anybody rings back,
  -- and deleting the request with them would delete the reason for the call.
  "asked_by"    UUID,
  -- Captured beside the id for that exact reason -- `payments.payer_name`'s argument, on a
  -- row with a much longer life than a receipt.
  "asked_name"  TEXT NOT NULL,
  "asked_email" TEXT NOT NULL,
  "note"        TEXT,
  -- 'open' | 'contacted' | 'closed'. READING THE QUEUE CHANGES NONE OF THEM, which is the
  -- whole difference between this and the bell the directive first suggested.
  "status"      TEXT NOT NULL DEFAULT 'open',
  "handled_by"  UUID,
  "handled_at"  TIMESTAMPTZ(6),
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- ONE OPEN ROW PER ORGANISATION, ENFORCED HERE AND NOT IN THE HANDLER. A read-then-write
-- check in the service loses to two simultaneous clicks and leaves the owner ringing the same
-- customer twice; a partial unique index cannot. Prisma's schema language cannot express the
-- WHERE, so this index exists only in SQL -- which is why the model carries a comment saying
-- so, and why the test drives two parallel requests rather than two sequential ones.
CREATE UNIQUE INDEX "enterprise_requests_one_open_per_org"
  ON "enterprise_requests" ("org_id") WHERE "status" = 'open';

CREATE INDEX "enterprise_requests_status_idx"
  ON "enterprise_requests" ("status", "created_at");

ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_asked_by_fkey"
  FOREIGN KEY ("asked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_handled_by_fkey"
  FOREIGN KEY ("handled_by") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
