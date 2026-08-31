-- DEC-037 — `access`: WHO GETS IN, as opposed to who is expected.
--
-- A second axis, not a kind of audience_rule (10 §4.3, 38). audience_rule describes who is
-- EXPECTED to answer and is a denominator, enforced nowhere; access decides who GETS IN and
-- is a gate, enforced on every request to the public route.
--
-- TEXT with a CHECK rather than a PG enum, matching `users.status` and `nodes.kind` usage
-- in this schema: adding a third mode later is one migration instead of an ALTER TYPE that
-- cannot run inside a transaction on older servers.

ALTER TABLE "campaigns" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'public';

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_access_check"
  CHECK ("access" IN ('public', 'organization'));

-- --- The organization-access counterpart to `invitations` ------------------
-- 10 §4.4, INV-006, 52 §1. DELIBERATELY THE SAME SHAPE: it records THAT a member responded,
-- never WHAT they said.
--
-- There is no response_id column here and there never will be. It is the one column that
-- would undo INV-006 in a single migration. The PRIMARY KEY is what prevents a second
-- submission; the ABSENCE OF A THIRD COLUMN is what keeps the first one anonymous.
--
--   invitations            records THAT a token was used
--   campaign_participants  records THAT a member responded
--   responses              records WHAT was said
--   nothing joins them
CREATE TABLE "campaign_participants" (
    "campaign_id"  UUID NOT NULL,
    "user_id"      UUID NOT NULL,
    "responded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "campaign_participants_pkey" PRIMARY KEY ("campaign_id","user_id")
);

ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --- ONE TRIGGER, TWO COLUMNS, ONE REASON ---------------------------------
-- 10 §4.3. `access` joins the anonymity trigger rather than getting a softer rule of its
-- own. Both are promises made at the moment the QR code was printed on a table card:
--
--   loosening access mid-flight  -> people told "only your colleagues can answer this" are
--                                   answered alongside strangers
--   tightening it mid-flight     -> a link already handed out stops working
--
-- Neither is a promise the product should be able to take back, so neither is editable
-- after `public_token` is minted — which is exactly what "has left draft" means (DEC-016).
--
-- The function is renamed because its name was a lie the moment it guarded two columns.
DROP TRIGGER IF EXISTS "campaigns_anonymous_immutable" ON "campaigns";
DROP FUNCTION IF EXISTS endur_anonymous_is_immutable();

CREATE OR REPLACE FUNCTION endur_campaign_promises_are_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.public_token IS NOT NULL AND NEW.anonymous IS DISTINCT FROM OLD.anonymous THEN
    RAISE EXCEPTION
      'campaign.anonymous is immutable once a public token has been minted (INV-006)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.public_token IS NOT NULL AND NEW.access IS DISTINCT FROM OLD.access THEN
    RAISE EXCEPTION
      'campaign.access is immutable once a public token has been minted (DEC-037)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_promises_immutable
  BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION endur_campaign_promises_are_immutable();
