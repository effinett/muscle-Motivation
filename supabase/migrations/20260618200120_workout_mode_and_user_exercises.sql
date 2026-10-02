-- Priority 2: explicit workout start mode (progression vs optional).
-- Stored per-workout so resume and history know how the session was launched,
-- and so progression advances ONLY for mode = 'progression'.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS mode text;

-- Priority 6: user-created exercise library. Manually added exercises that are
-- not in the global `exercises` table get saved here, scoped to the user, so
-- they are reusable and searchable in future workouts.
CREATE TABLE IF NOT EXISTS public.user_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicates: same user + same name (case-insensitive) only once.
CREATE UNIQUE INDEX IF NOT EXISTS user_exercises_user_name_uniq
  ON public.user_exercises (user_id, lower(name));

ALTER TABLE public.user_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_exercises_own ON public.user_exercises;
CREATE POLICY user_exercises_own ON public.user_exercises
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
