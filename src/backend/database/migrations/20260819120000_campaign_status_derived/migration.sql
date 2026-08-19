-- DEC-016 — campaign status is DERIVED ON READ.
--
-- A stored status column needs something to write it, and that something is a scheduler:
-- a timer that can be late, be down, or leave a row stuck between states on the one
-- morning it matters. Deriving it from the dates cannot drift from the dates, because it
-- IS the dates. See 17-BACKGROUND-JOBS.md and features/campaigns/status.ts.
--
--   closed_at IS NOT NULL  ->  closed
--   public_token IS NULL   ->  draft
--   starts_at > now()      ->  scheduled
--   ends_at   < now()      ->  closed
--   otherwise              ->  open

ALTER TABLE "campaigns" ADD COLUMN "closed_at" TIMESTAMPTZ(6);

-- Anything already open keeps its meaning: it has a token, no closed_at, and its dates
-- decide the rest. Anything already closed gets the timestamp it should always have had.
UPDATE "campaigns" SET "closed_at" = now() WHERE "status" = 'closed' AND "closed_at" IS NULL;

-- The trigger has to move BEFORE the column it reads disappears.
--
-- Re-keyed from `status <> 'draft'` to `public_token IS NOT NULL`. That is the same
-- statement said against the column that now carries the truth: minting the token is the
-- irreversible act, and it is exactly what "leaving draft" means (INV-006, 10 §4.3).
CREATE OR REPLACE FUNCTION endur_anonymous_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.public_token IS NOT NULL AND NEW.anonymous IS DISTINCT FROM OLD.anonymous THEN
    RAISE EXCEPTION
      'campaign.anonymous is immutable once a public token has been minted (INV-006)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "campaigns" DROP COLUMN "status";
DROP TYPE "campaign_status";

-- Reading a campaign always asks "is it open right now", so the dates are the filter.
CREATE INDEX "campaigns_org_window_idx" ON "campaigns" ("org_id", "starts_at", "ends_at");
