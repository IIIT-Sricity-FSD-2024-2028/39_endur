-- Staff sessions. DEC-014.
--
-- This table is OWNED BY connect-pg-simple, not by us. It is deliberately NOT modelled in
-- schema.prisma: the library defines the shape, and a Prisma model would mean two owners
-- for one table and a migration war the first time the library changed it.
-- 10 §5, and 10 §11 has an acceptance item asserting exactly this.
--
-- Do not add columns. Session CONTENTS belong in the `sess` JSON blob, and permissions
-- are never read from there anyway — they are resolved per request (15 §2).

CREATE TABLE IF NOT EXISTS "sessions" (
  sid    TEXT PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

-- The sweeper deletes by expiry, and it runs often.
CREATE INDEX IF NOT EXISTS "sessions_expire_idx" ON "sessions" (expire);
