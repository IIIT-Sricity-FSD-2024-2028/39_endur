-- T-058 · the payment ledger. DEC-080, which supersedes DEC-035.
--
-- ONE TABLE, APPEND ONLY. Every column here describes a capture Endur performed itself:
-- there is no gateway id, no payment-method id and no webhook payload, because there was no
-- third party to have told us one. `reference` is minted by us and is UNIQUE so a
-- double-submitted payment dialog cannot bill twice.
--
-- `amount_minor` IS AN INTEGER IN PAISE and not NUMERIC(10,2). The amount is priced
-- server-side from PLAN_OPTIONS on both write paths, so there is exactly one integer to
-- store and nothing that can round differently in two places.

CREATE TABLE "payments" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Captured at the time, deliberately NOT a foreign key to users: the person who paid must
  -- still read correctly after they are renamed, disabled or deleted.
  "payer_name"   TEXT NOT NULL,
  "payer_email"  TEXT NOT NULL,

  "tier"         TEXT NOT NULL,
  -- NULL on a signup — there was no plan before it.
  "from_tier"    TEXT,
  -- signup | change
  "kind"         TEXT NOT NULL,

  "amount_minor" INTEGER NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'INR',
  "status"       TEXT NOT NULL DEFAULT 'succeeded',
  "reference"    TEXT NOT NULL,

  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "payments_reference_key" ON "payments" ("reference");

-- The earnings page reads by period across the whole estate, and one org's history on the
-- org detail page. Two indexes, one per question.
CREATE INDEX "payments_created_at_idx" ON "payments" ("created_at");
CREATE INDEX "payments_org_id_idx" ON "payments" ("org_id");
