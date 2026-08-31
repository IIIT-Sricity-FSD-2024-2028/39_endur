-- T-109 · support access. DEC-114, 19 §15.
--
-- ONE TABLE AND NO NEW COLUMN ANYWHERE ELSE, which is the shape of the argument for this
-- design: an operator inside a customer's console is not a new kind of permission, it is a
-- new kind of SESSION whose powers are minted as ordinary grants at resolve time. Nothing
-- here stores a capability, because nothing here decides one.
--
-- The synthetic member the session acts as is an ordinary `users` row with
-- `status = 'support'` — a FOURTH status value, and it needs no migration because `status`
-- is TEXT with a default and no CHECK. That is not luck; 10 §3 left it text precisely so a
-- lifecycle state could be added without a migration that locks the table.
--
--   'support' IS NOT 'active', AND THAT IS LOAD-BEARING IN TWO PLACES:
--     · billing/service.ts counts seats as users WHERE status = 'active' (16 §5), so an
--       organisation is never billed for the operator who came to help them
--     · POST /auth/login excludes it explicitly (`status: { not: 'support' }`) ON TOP of
--       the `password_hash IS NOT NULL` filter that already made it unreachable. Two
--       independent reasons it cannot be signed into, because the first one is a property
--       of a column somebody could later set by hand and the second is a property of what
--       the row IS
--   It also carries NO person node, which is what keeps it out of the people list, out of
--   every audience, and therefore out of every campaign it could otherwise be sent.

CREATE TABLE "support_sessions" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "operator_id" UUID NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id")  ON DELETE CASCADE,
  -- The synthetic `users` row. It has to be a tenant user and not the operator: an
  -- audit_log row inside the tenant can only point at `users` (DEC-033 keeps the two
  -- tables apart on purpose), so this is the column that makes a support action appear in
  -- the CUSTOMER's own activity log rather than as an unattributed gap.
  "user_id"     UUID NOT NULL REFERENCES "users"("id")          ON DELETE CASCADE,
  -- Typed by the operator before the door opens, shown to the customer verbatim.
  "reason"      TEXT NOT NULL,
  -- The express-session id this is bound to, so ending one ends it for the browser that
  -- started it and no other.
  "session_id"  TEXT NOT NULL,
  "started_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at"  TIMESTAMPTZ(6) NOT NULL,
  -- NULL = not left. Only half of "still active" — see the partial index below.
  "ended_at"    TIMESTAMPTZ(6)
);

CREATE INDEX "support_sessions_org_id_started_at_idx"
  ON "support_sessions" ("org_id", "started_at" DESC);
CREATE INDEX "support_sessions_operator_id_started_at_idx"
  ON "support_sessions" ("operator_id", "started_at" DESC);

-- `authenticate` resolves the live session on EVERY request of a support session — the same
-- property permissions get from being resolved per request rather than read from a session
-- claim, and the reason a Leave takes effect on the next request instead of at next login.
-- This is the index that read runs on, and it is PARTIAL because the overwhelming majority
-- of rows here are history: a register that grows forever should not make its own hot path
-- slower every month.
CREATE INDEX "support_sessions_live_idx"
  ON "support_sessions" ("session_id") WHERE "ended_at" IS NULL;
