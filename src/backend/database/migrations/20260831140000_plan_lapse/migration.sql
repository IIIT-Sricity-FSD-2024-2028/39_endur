-- DEC-113, 16 §7d. The tier an organisation lost when a period ended with no renewal.
--
-- NULLABLE WITH NO DEFAULT and no backfill, deliberately. Every existing row describes a
-- period that either has not ended or ended before this rule existed; writing a value into
-- them would put a notice on screens for organisations that never lapsed under any rule the
-- product was running at the time.
ALTER TABLE "subscriptions" ADD COLUMN "lapsed_from" TEXT;
