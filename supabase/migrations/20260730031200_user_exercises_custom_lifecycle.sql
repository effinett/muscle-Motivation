-- Phase 4.2.1H: custom-exercise lifecycle hardening for public.user_exercises.
-- Additive + idempotent. Adds normalization, archive, updated_at, and an
-- active-only uniqueness guard. RLS is unchanged (the existing ALL policy
-- auth.uid()=user_id already owner-scopes all four verbs); public.exercises
-- keeps its SELECT-only policy so canonical rows stay read-only to clients.

-- normalized_name mirrors ExerciseIntelligence.normalizeExerciseName in
-- exercise-core.js: lowercase -> drop apostrophes/backtick -> any non-alnum run
-- to a single space -> trim. Generated + stored so DB and client agree and the
-- uniqueness guard is authoritative regardless of client normalization.
ALTER TABLE public.user_exercises
  ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (
    btrim(regexp_replace(regexp_replace(lower(name), '[''`’‘]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
  ) STORED;

-- Soft-delete lifecycle. archived_at IS NULL => active; non-null => archived.
ALTER TABLE public.user_exercises
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.user_exercises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Active-only uniqueness: a user can hold only one ACTIVE custom per normalized
-- name. Archived rows are excluded, so same-name recreation/restore stays possible.
CREATE UNIQUE INDEX IF NOT EXISTS user_exercises_active_norm_uidx
  ON public.user_exercises (user_id, normalized_name)
  WHERE archived_at IS NULL;

-- Supports archived-list lookups + normalized reuse/restore matching.
CREATE INDEX IF NOT EXISTS user_exercises_user_norm_idx
  ON public.user_exercises (user_id, normalized_name);