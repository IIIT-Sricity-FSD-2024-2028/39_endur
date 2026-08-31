-- 13 §7 — Idempotency-Key.
--
-- Honoured on campaign.launch, template.clone, person.import and respondent submit. The
-- respondent one is why this exists at all: a phone on a flaky venue network retries, and
-- a duplicate response corrupts the demo's numbers in front of the evaluator.
--
-- The stored row carries the FIRST response, replayed verbatim for 24 h. It also carries a
-- hash of the request, because the same key sent with a different body is a client bug and
-- answering it with someone else's cached response would be worse than an error.

CREATE TABLE "idempotency_keys" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for respondent submits: a public caller has a campaign, not an organisation, and
  -- keying those on org_id would leak that the campaign belongs to one.
  "org_id"       UUID REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key"          TEXT NOT NULL,
  "endpoint"     TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status"       INTEGER NOT NULL,
  "body"         JSONB NOT NULL,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- The uniqueness IS the mechanism: two concurrent double-clicks race on this index and
-- exactly one wins, without an application-level lock.
CREATE UNIQUE INDEX "idempotency_keys_scope_key"
  ON "idempotency_keys" (COALESCE("org_id", '00000000-0000-0000-0000-000000000000'::uuid),
                         "endpoint", "key");

-- For the 24 h sweep.
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" ("created_at");
