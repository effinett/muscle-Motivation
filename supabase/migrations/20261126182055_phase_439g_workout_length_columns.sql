-- Phase 4.3.9G — Workout length (owner-approved 2026-11-26)
--
-- profiles.workout_minutes: the user's usual workout length. NULL means the
--   60-minute default, so existing users see no change until they choose.
-- program_routines.length_plan: per Program session, the essentials, their
--   minimum sets and the ordered trim/add lists that workout-duration.js reads.
--   NULL means the session has no plan yet and is shown at its stored length.
--
-- Structure only: no rows are written. Existing RLS covers both tables
-- (profiles: own row only; program_routines: read-only catalog).
--
-- Applied to production 2026-11-26 (version 20261126182055).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS workout_minutes smallint;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_workout_minutes_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_workout_minutes_check
  CHECK (workout_minutes IS NULL OR workout_minutes IN (30, 45, 60, 90));
ALTER TABLE public.program_routines
  ADD COLUMN IF NOT EXISTS length_plan jsonb;
