-- DEC-041, T-075. The audit log records refusals too.
--
-- 10 §5 has carried this column since 2026-08-23; the table did not, because nothing had
-- ever READ audit_log and a column no writer sets is a column no reader can trust. T-075
-- is the reader, so the column lands with it.
--
-- DEFAULT 'allowed' is what makes this migration safe on a table that already has rows:
-- every row written before today described something that happened, which is exactly what
-- 'allowed' means. Backfilling it any other way would be inventing history.
ALTER TABLE "audit_log" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'allowed';

-- The refusals-only view is a toggle on the page (56 § Interactions), so it is a query
-- that runs on every visit, and it is the SELECTIVE half of the table by a wide margin.
CREATE INDEX "audit_log_org_id_outcome_created_at_idx"
  ON "audit_log" ("org_id", "outcome", "created_at" DESC);
