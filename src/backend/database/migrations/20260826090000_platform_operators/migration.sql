-- T-059 · the platform side. 19 §10.
--
-- Three tables with NO org_id, which is the one thing every other table in this schema
-- has. That absence is the design (DEC-033): an operator hosted in `users` would need a
-- fake home organisation, and that fake org would appear in the estate list it exists to
-- read.

ALTER TABLE "organizations" ADD COLUMN "suspended_at" TIMESTAMPTZ(6);

CREATE TABLE "platform_users" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"         CITEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "role"          TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'active',
  -- NOT NULL. There is no "MFA not configured yet" state for a login to fall through.
  "mfa_secret"    TEXT NOT NULL,
  "last_login_at" TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Unique on email ALONE, unlike users(org_id, email): there is no tenant to disambiguate by.
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users" ("email");

CREATE TABLE "platform_sessions" (
  "id"          TEXT PRIMARY KEY,
  "operator_id" UUID NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "expires_at"  TIMESTAMPTZ(6) NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "platform_sessions_operator_id_idx" ON "platform_sessions" ("operator_id");

CREATE TABLE "platform_audit_log" (
  "id"            BIGSERIAL PRIMARY KEY,
  "actor_id"      UUID NOT NULL REFERENCES "platform_users"("id"),
  "action"        TEXT NOT NULL,
  "target_org_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL,
  "payload"       JSONB,
  "request_id"    TEXT,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log" ("created_at" DESC);
CREATE INDEX "platform_audit_log_target_org_id_created_at_idx"
  ON "platform_audit_log" ("target_org_id", "created_at" DESC);
