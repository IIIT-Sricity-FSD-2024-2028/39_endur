-- Per-caller inbox triage. 58, 10 §5.
--
-- Keyed by (user_id, response_id): read state belongs to the READER, not the organisation,
-- so two administrators triaging one campaign never mark each other's queue.
--
-- It holds no response CONTENT. Nothing here is a second path to a comment (INV-006).
CREATE TABLE "inbox_state" (
  "org_id"      UUID NOT NULL,
  "user_id"     UUID NOT NULL,
  "response_id" UUID NOT NULL,
  "read_at"     TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6),

  CONSTRAINT "inbox_state_pkey" PRIMARY KEY ("user_id", "response_id")
);

-- org_id rides along for the tenant seam and for a cascade that needs no join.
CREATE INDEX "inbox_state_user_id_org_id_idx" ON "inbox_state" ("user_id", "org_id");

ALTER TABLE "inbox_state" ADD CONSTRAINT "inbox_state_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_state" ADD CONSTRAINT "inbox_state_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_state" ADD CONSTRAINT "inbox_state_response_id_fkey"
  FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
