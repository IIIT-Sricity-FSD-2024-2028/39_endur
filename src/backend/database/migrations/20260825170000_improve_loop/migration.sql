-- The improve loop. 44, T-083.
--
-- Three tables and two triggers. The triggers are the point: 44 says finalised records are
-- immutable and says it must be enforced "by a database trigger, not by service-layer
-- discipline", because the Enterprise tier sells these records as evidence and a record
-- that can be rewritten after the conversation is not evidence.

CREATE TABLE "reflections" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL,
  "campaign_id"    UUID NOT NULL,
  "subject_id"     UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "answers"        JSONB NOT NULL,
  "submitted_at"   TIMESTAMPTZ(6) NOT NULL
);

-- ONE PER (campaign, subject). The constraint IS the mechanism: the self-assessment is
-- recorded once, before results are seen. A second row would be a rewrite after the fact.
CREATE UNIQUE INDEX "reflections_campaign_subject_key"
  ON "reflections" ("campaign_id", "subject_id");
CREATE INDEX "reflections_org_author_idx" ON "reflections" ("org_id", "author_user_id");

ALTER TABLE "reflections" ADD CONSTRAINT "reflections_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "action_plans" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL,
  "reflection_id" UUID NOT NULL,
  "items"        JSONB NOT NULL,
  "finalised_at" TIMESTAMPTZ(6),
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "action_plans_reflection_id_key" ON "action_plans" ("reflection_id");

ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_reflection_id_fkey"
  FOREIGN KEY ("reflection_id") REFERENCES "reflections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "checkins" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             UUID NOT NULL,
  "action_plan_id"     UUID NOT NULL,
  "supervisor_user_id" UUID NOT NULL,
  "notes"              TEXT,
  "held_at"            TIMESTAMPTZ(6),
  "finalised_at"       TIMESTAMPTZ(6),
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX "checkins_org_plan_idx" ON "checkins" ("org_id", "action_plan_id");

ALTER TABLE "checkins" ADD CONSTRAINT "checkins_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_action_plan_id_fkey"
  FOREIGN KEY ("action_plan_id") REFERENCES "action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_supervisor_user_id_fkey"
  FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── IMMUTABILITY, IN THE DATABASE ──────────────────────────────────────────────────────
--
-- Same posture as endur_campaign_promises_are_immutable(): a promise the product made to a
-- person is not something a later code path gets to quietly undo. Finalising is allowed
-- (NULL -> a timestamp); everything after it is refused, including un-finalising.
CREATE OR REPLACE FUNCTION endur_finalised_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.finalised_at IS NOT NULL THEN
    RAISE EXCEPTION 'endur: % % is finalised and cannot be changed', TG_TABLE_NAME, OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER action_plans_finalised_immutable
  BEFORE UPDATE ON "action_plans"
  FOR EACH ROW EXECUTE FUNCTION endur_finalised_is_immutable();

CREATE TRIGGER checkins_finalised_immutable
  BEFORE UPDATE ON "checkins"
  FOR EACH ROW EXECUTE FUNCTION endur_finalised_is_immutable();

-- A reflection has no finalised_at because SUBMITTING IS FINALISING — the row exists only
-- once it is submitted. Nothing may update one at all.
CREATE OR REPLACE FUNCTION endur_reflections_are_write_once()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'endur: reflection % is write-once', OLD.id USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reflections_write_once
  BEFORE UPDATE ON "reflections"
  FOR EACH ROW EXECUTE FUNCTION endur_reflections_are_write_once();
