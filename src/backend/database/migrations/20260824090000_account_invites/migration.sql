-- Account provisioning. DEC-038, spec 57, 10 §5.
--
-- NOT called `invitations` — that name is taken, means campaign tokens, and two tables
-- called invitations in one schema is a mistake somebody makes at 2am.
--
-- WHAT THIS TABLE IS NOT: it is not where an account lives. A `users` row already exists
-- for every person in the graph — `createPerson()` writes one with `status = 'invited'` and
-- a NULL `password_hash`, which is precisely the state that cannot be signed in to (10 §2,
-- and the login query's `passwordHash: { not: null }` clause depends on it). This table
-- holds the one-time LINK that lets that person set the password themselves.
--
-- That separation is the whole feature. The powers came from their positions; this is only
-- the key. Handing over the key and conferring the powers are separate acts, separately
-- audited, which is what lets an administrator revoke somebody's access this morning
-- without dismantling the org chart they are still in.

CREATE TABLE "account_invites" (
    "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "org_id"      UUID NOT NULL,
    "user_id"     UUID NOT NULL,

    -- SHA-256 of the token, hex. THE PLAINTEXT IS NEVER STORED, which is what makes
    -- "shown once" true rather than decorative: we cannot recover a link, only mint a new
    -- one. Same treatment as api_keys (10 §5).
    "token_hash"  TEXT NOT NULL,

    -- 7 days. Long enough to survive a weekend, short enough that a link left in a group
    -- chat stops working.
    "expires_at"  TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_by"  UUID,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The inviter. SET NULL rather than CASCADE: when the administrator who sent an invite
-- leaves, the invite is still a fact that happened. Deleting the evidence to tidy up is
-- what 10 §9 rules out.
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "account_invites_token_hash_key" ON "account_invites" ("token_hash");

-- ONE LIVE INVITE PER PERSON, in the database rather than in a service-layer deleteMany.
--
-- Re-issuing (account.reset) deletes the outstanding row and inserts the new one INSIDE ONE
-- TRANSACTION, so a superseded link stops working in the same statement that replaces it —
-- there is no window in which two links both work. A service-layer check could be raced;
-- this cannot.
--
-- PARTIAL, on accepted_at IS NULL: accepted rows are history and there may be many of them
-- for one person over the years, each recording a real activation.
CREATE UNIQUE INDEX "account_invites_one_live_per_user"
  ON "account_invites" ("user_id") WHERE "accepted_at" IS NULL;

CREATE INDEX "account_invites_org_id_idx" ON "account_invites" ("org_id");
