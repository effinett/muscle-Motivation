-- Master exercise schema standardization
-- Preserves all existing rows/IDs. Does not touch workout history, templates, programs, or progression.

-- 1. Add new columns (idempotent)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS aliases           TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_muscle    TEXT,
  ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS movement_pattern  TEXT,
  ADD COLUMN IF NOT EXISTS force_type        TEXT,
  ADD COLUMN IF NOT EXISTS difficulty        TEXT,
  ADD COLUMN IF NOT EXISTS is_bodyweight     BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_unilateral     BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_unit      TEXT        DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS tracking_type     TEXT        DEFAULT 'weight_reps',
  ADD COLUMN IF NOT EXISTS instructions      TEXT,
  ADD COLUMN IF NOT EXISTS tips              TEXT,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

-- 2. Backfill from existing primary_muscles[] array
--    primary_muscle  <- first element (true primary)
--    secondary_muscles <- remaining elements (supporting muscles)
--    is_bodyweight   <- derived from equipment
UPDATE public.exercises
SET primary_muscle    = primary_muscles[1],
    secondary_muscles = COALESCE(primary_muscles[2:], '{}'),
    is_bodyweight     = (equipment = 'Bodyweight');

-- 3. Enforce NOT NULL per master schema (all backfilled, no nulls exist)
ALTER TABLE public.exercises
  ALTER COLUMN name           SET NOT NULL,
  ALTER COLUMN equipment      SET NOT NULL,
  ALTER COLUMN category       SET NOT NULL,
  ALTER COLUMN primary_muscle SET NOT NULL;

-- 4. Drop the now-redundant original column (data preserved above)
ALTER TABLE public.exercises
  DROP COLUMN primary_muscles;

-- 5. Keep updated_at fresh on writes (reuse existing set_updated_at function)
DROP TRIGGER IF EXISTS exercises_set_updated_at ON public.exercises;
CREATE TRIGGER exercises_set_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();