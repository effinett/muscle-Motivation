-- Phase 3.1.1b — USDA save hardening. Additive only; existing rows/columns untouched.
-- serving_unit: the machine unit behind serving_amount (g / oz / ml / serving), to
--   complement the human serving_description.
-- gtin_upc: USDA branded barcode (GTIN/UPC) — captured now so future barcode lookup
--   can reuse it. Nullable; only populated when USDA provides it.
ALTER TABLE public.food_logs
  ADD COLUMN IF NOT EXISTS serving_unit text,
  ADD COLUMN IF NOT EXISTS gtin_upc     text;