-- Phase 3.1.1 — USDA Search Foundation
-- Additive only. Existing manual-logger columns (date, meal, name, servings,
-- calories, protein, carbs, fat) are untouched. RLS policies are row-level on
-- user_id, so they already cover these new columns — no policy changes needed.

ALTER TABLE public.food_logs
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS source              text   NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS usda_fdc_id         text,
  ADD COLUMN IF NOT EXISTS serving_description text,
  ADD COLUMN IF NOT EXISTS serving_amount      numeric,
  ADD COLUMN IF NOT EXISTS grams               numeric,
  ADD COLUMN IF NOT EXISTS fiber               numeric,
  ADD COLUMN IF NOT EXISTS sugar               numeric,
  ADD COLUMN IF NOT EXISTS raw_source_data     jsonb;

-- Mirror source provenance onto reusable food definitions so a saved food
-- remembers its USDA origin (future barcode/AI reuse). default macros stay.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS source              text   NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS usda_fdc_id         text,
  ADD COLUMN IF NOT EXISTS serving_description text,
  ADD COLUMN IF NOT EXISTS default_fiber       numeric,
  ADD COLUMN IF NOT EXISTS default_sugar       numeric;

-- Light index to look up / de-dupe by USDA id per user (nullable-safe).
CREATE INDEX IF NOT EXISTS food_logs_user_fdc_idx
  ON public.food_logs (user_id, usda_fdc_id)
  WHERE usda_fdc_id IS NOT NULL;