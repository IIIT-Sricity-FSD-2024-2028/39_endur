-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "node_kind" AS ENUM ('role', 'unit', 'group', 'person', 'position');

-- CreateEnum
CREATE TYPE "edge_type" AS ENUM ('reports', 'contains', 'member', 'delegates');

-- CreateEnum
CREATE TYPE "grant_scope" AS ENUM ('self', 'own_unit', 'subtree', 'all');

-- CreateEnum
CREATE TYPE "grant_effect" AS ENUM ('allow', 'deny');

-- CreateEnum
CREATE TYPE "question_kind" AS ENUM ('rating', 'single', 'multi', 'text', 'yesno', 'nps');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'scheduled', 'open', 'closed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "logo_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "avatar_file_id" UUID,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "kind" "node_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "role_id" UUID,
    "unit_id" UUID,
    "user_id" UUID,
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "ends_at" TIMESTAMPTZ(6),
    "derived" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT 'primary',
    "type" "edge_type" NOT NULL,
    "parent_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(6),
    "derived" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "scope" "grant_scope" NOT NULL DEFAULT 'own_unit',
    "effect" "grant_effect" NOT NULL DEFAULT 'allow',
    "params" JSONB NOT NULL DEFAULT '{}',
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(6),
    "derived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "unit_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "linked_user_id" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "industry" TEXT,
    "description" TEXT,
    "cloned_from_id" UUID,
    "estimated_seconds" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "kind" "question_kind" NOT NULL,
    "text" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'draft',
    "audience_rule" JSONB NOT NULL DEFAULT '{}',
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "public_token" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_subjects" (
    "campaign_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,

    CONSTRAINT "campaign_subjects_pkey" PRIMARY KEY ("campaign_id","subject_id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "subject_id" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'link',
    "duration_ms" INTEGER,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "response_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "numeric_value" DECIMAL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "org_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "decided_by" JSONB,
    "request_id" TEXT,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "org_id" UUID NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "seats" INTEGER NOT NULL DEFAULT 0,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("org_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE INDEX "nodes_org_id_kind_idx" ON "nodes"("org_id", "kind");

-- CreateIndex
CREATE INDEX "edges_org_id_dimension_type_idx" ON "edges"("org_id", "dimension", "type");

-- CreateIndex
CREATE UNIQUE INDEX "edges_org_id_dimension_type_parent_id_child_id_key" ON "edges"("org_id", "dimension", "type", "parent_id", "child_id");

-- CreateIndex
CREATE INDEX "grants_org_id_capability_idx" ON "grants"("org_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "grants_org_id_subject_id_capability_scope_effect_key" ON "grants"("org_id", "subject_id", "capability", "scope", "effect");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_public_token_key" ON "campaigns"("public_token");

-- CreateIndex
CREATE INDEX "responses_campaign_id_submitted_at_idx" ON "responses"("campaign_id", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "answers_response_id_question_id_key" ON "answers"("response_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "files_org_id_kind_idx" ON "files"("org_id", "kind");

-- CreateIndex
CREATE INDEX "audit_log_org_id_created_at_idx" ON "audit_log"("org_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_cloned_from_id_fkey" FOREIGN KEY ("cloned_from_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_subjects" ADD CONSTRAINT "campaign_subjects_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_subjects" ADD CONSTRAINT "campaign_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Everything below is hand-written: Prisma cannot express CHECK constraints,
-- partial indexes, INCLUDE indexes, GIN indexes, DEFERRABLE unique constraints,
-- or triggers. Spec: architecture/10-DATA-MODEL.md §2, §4, §7, §10.
--
-- Removing any of these is a schema-level regression even if the app still runs.
-- ===========================================================================

-- --- Constraints (10 §2.1, §10) --------------------------------------------

-- A level belongs to a role and to nothing else. Levels are ordering only; the
-- level RULE is a seeded default (§2.4, CONF-002), never the enforcement mechanism.
ALTER TABLE "nodes" ADD CONSTRAINT "node_level_only_on_role"
  CHECK ((kind = 'role') = (level IS NOT NULL));

-- A position IS a role-at-unit. Without both, INV-005 cannot be expressed, because
-- the anchor unit would have to be looked up through the person instead of read off
-- the position.
ALTER TABLE "nodes" ADD CONSTRAINT "node_position_refs"
  CHECK ((kind = 'position') = (role_id IS NOT NULL AND unit_id IS NOT NULL));

-- Single parent per dimension, for the two tree-forming edge types only (10 §10).
-- `member` and `delegates` are deliberately excluded: a person holds many positions,
-- and that multi-hat case is the whole point of the model.
CREATE UNIQUE INDEX "edges_one_parent_per_dimension"
  ON "edges" (org_id, dimension, type, child_id)
  WHERE type IN ('contains', 'reports') AND valid_to IS NULL;

-- A reorder is then one UPDATE inside a transaction, rather than a shuffle through a
-- temporary value to dodge the unique constraint mid-statement (10 §4.2).
ALTER TABLE "questions" ADD CONSTRAINT "questions_template_id_position_key"
  UNIQUE (template_id, position) DEFERRABLE INITIALLY DEFERRED;

-- --- Indexes (10 §7) -------------------------------------------------------
-- Written from the actual query patterns, not speculatively.

-- Graph traversal, both directions. The partial predicate matters: almost every read
-- wants currently-valid rows, and expired rows accumulate forever because history is
-- retained for audit.
CREATE INDEX "edges_parent_type_valid" ON "edges" (parent_id, type) WHERE valid_to IS NULL;
CREATE INDEX "edges_child_type_valid"  ON "edges" (child_id,  type) WHERE valid_to IS NULL;

-- The resolver's hot path: grants for a set of subject nodes.
CREATE INDEX "grants_subject_capability_valid"
  ON "grants" (subject_id, capability) WHERE valid_to IS NULL;

-- Positions by unit — INV-005 asks this on every capability check.
CREATE INDEX "nodes_unit_positions" ON "nodes" (unit_id) WHERE kind = 'position';

-- Results aggregation: the covering column avoids a heap fetch per answer.
CREATE INDEX "answers_question_numeric" ON "answers" (question_id) INCLUDE (numeric_value);

-- JSONB search: campaign audience rules and node meta.
CREATE INDEX "campaigns_audience_rule_gin" ON "campaigns" USING GIN (audience_rule);
CREATE INDEX "nodes_meta_gin"              ON "nodes"     USING GIN (meta);

-- --- Anonymity is enforced by the database, not by the service layer -------
-- INV-006 / 10 §4.3. Respondents were promised anonymity at submission time; letting
-- an admin flip the flag afterwards would retroactively break that promise. The service
-- layer is not the only writer — seeds, imports and the API all write too — so this
-- lives where every writer must pass through it.

CREATE OR REPLACE FUNCTION endur_anonymous_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.anonymous IS DISTINCT FROM OLD.anonymous THEN
    RAISE EXCEPTION
      'campaign.anonymous is immutable once status leaves draft (INV-006)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_anonymous_immutable
  BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION endur_anonymous_is_immutable();
