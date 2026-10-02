-- Tier 2: Custom Workout templates.
-- Mirrors program_workouts.exercises JSONB shape so the existing workout launch
-- logic can expand a user template the same way it expands a program session.
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  -- Same shape as program_workouts.exercises:
  -- [{ name, sets, reps_low, reps_high, notes, rest_sec }]
  exercises           jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_program_slug text,          -- provenance if duplicated from a program (future AI)
  times_used          integer NOT NULL DEFAULT 0,   -- frequency signal (future AI)
  last_used_at        timestamptz,
  sort_order          integer NOT NULL DEFAULT 0,    -- manual ordering of the list
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_templates_user_idx
  ON public.workout_templates (user_id, sort_order, created_at);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

-- Own-row policy, mirrors user_exercises_own / user_programs_own.
DROP POLICY IF EXISTS workout_templates_own ON public.workout_templates;
CREATE POLICY workout_templates_own ON public.workout_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Provenance: which template (if any) launched a logged session. Nullable,
-- non-breaking; existing program/manual workouts keep template_id = NULL.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.workout_templates(id) ON DELETE SET NULL;