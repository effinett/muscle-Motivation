-- USDA foods are identified by (user_id, usda_fdc_id), never by name alone, so
-- future barcode/voice/photo/saved-meal/AI matching reuse one record per FDC id
-- instead of creating name-keyed duplicates.
--
-- Partial UNIQUE index (not used with ON CONFLICT — the app does select-then-write
-- for USDA foods, sidestepping the "no matching constraint" pitfall). It only
-- enforces integrity for source='usda' rows; manual foods keep their (user_id,name)
-- unique index untouched.
CREATE UNIQUE INDEX IF NOT EXISTS foods_user_source_fdc_uidx
  ON public.foods (user_id, usda_fdc_id)
  WHERE source = 'usda' AND usda_fdc_id IS NOT NULL;