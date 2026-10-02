-- Stop name-drift from splitting progression history: capture a stable library
-- exercise id on each logged exercise going forward. Nullable & additive —
-- existing rows and free-text custom exercises keep exercise_id = NULL.
-- Progression continues to match by exercise_name for now; a later pass switches
-- the join to this id.
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS exercise_id uuid
  REFERENCES public.exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_exercises_exercise_id_idx
  ON public.workout_exercises (exercise_id);