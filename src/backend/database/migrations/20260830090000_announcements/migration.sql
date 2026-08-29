-- Announcements. 13 § Announcements, T-094.
--
-- Two tables. The receipts table is the feature: it is written at PUBLISH time, one row per
-- resolved recipient, so "12 of 40 have read this" has an honest denominator taken when the
-- notice was sent. A row created lazily on first read could only ever count readers.

CREATE TABLE "announcements" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL,
  "title"         TEXT NOT NULL,
  -- Plain text. No HTML, so there is no sanitiser to get wrong.
  "body"          TEXT NOT NULL,
  "audience_rule" JSONB NOT NULL DEFAULT '{}',
  -- NULL until published. Publishing snapshots the audience and freezes the body.
  "published_at"  TIMESTAMPTZ(6),
  "created_by"    UUID,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX "announcements_org_published_idx"
  ON "announcements" ("org_id", "published_at" DESC);

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: when the author leaves, the notice everybody read still happened.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "announcement_receipts" (
  "announcement_id" UUID NOT NULL,
  "user_id"         UUID NOT NULL,
  "read_at"         TIMESTAMPTZ(6),

  CONSTRAINT "announcement_receipts_pkey" PRIMARY KEY ("announcement_id", "user_id")
);

-- The banner's query: my unread receipts, newest first.
CREATE INDEX "announcement_receipts_user_idx" ON "announcement_receipts" ("user_id", "read_at");

ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
