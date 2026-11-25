-- Assisted machine reverse progression + Assisted Dip (owner request 2026-11-24)
--
-- On an assisted pull-up / dip machine the logged weight is COUNTERWEIGHT:
-- more weight makes the movement easier. `is_assisted` tells progression.js to
-- run in reverse (lower the assist to progress, add it back to deload) and tells
-- PR detection that the record is the LOWEST assist. Every other exercise keeps
-- is_assisted = false, so nothing else changes.
--
-- Apply this BEFORE merging the code: workout.html selects `is_assisted`.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS is_assisted BOOLEAN NOT NULL DEFAULT false;

-- Existing machine station.
UPDATE public.exercises
   SET is_assisted = true, updated_at = now()
 WHERE id = '2e7fab32-3500-4687-b2ff-68117ec96654';   -- Assisted Pull-Up

-- New: Assisted Dip, the same machine used for dips.
INSERT INTO public.exercises
  (id,name,category,equipment,primary_muscle,secondary_muscles,aliases,movement_pattern,
   force_type,difficulty,is_bodyweight,is_unilateral,tracking_type,default_unit,
   instructions,tips,is_active,is_assisted)
VALUES
  ('eacdfefa-beb3-4bd5-84af-0ac023adf611', 'Assisted Dip', 'Triceps', 'Machine', 'Triceps',
   ARRAY['Chest','Shoulders']::text[],
   ARRAY['assisted dips','machine assisted dip','assisted dip machine','assisted tricep dip']::text[],
   'vertical_push', 'push', 'beginner', false, false, 'weight_reps', 'lb',
   'Kneel or stand on the assist platform, grip the dip handles with straight arms, lower until your elbows reach about 90 degrees, then press back up.',
   'More assist weight makes it easier — reduce the assist over time as you get stronger toward a full dip.',
   true, true)
ON CONFLICT (id) DO NOTHING;
