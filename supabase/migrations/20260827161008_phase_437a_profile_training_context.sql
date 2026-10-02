-- Phase 4.3.7A — the two onboarding inputs that have a real product use and
-- that no column could express before: training experience and gym access.
--
-- Both are NULLABLE with NO default and NO backfill. A profile written before
-- this migration keeps NULL, which personalization-core.js reads as "no
-- signal" and never as a mismatch, so every existing user degrades gracefully
-- rather than being forced back through onboarding.
--
-- CHECK constraints pin the vocabulary that personalization-core.js maps from.
-- They accept NULL so legacy rows and partial onboarding stay valid.
-- Rollback is a plain DROP COLUMN: it removes no user data that existed before
-- this phase.

alter table public.profiles
  add column if not exists training_experience text,
  add column if not exists gym_access text;

alter table public.profiles
  drop constraint if exists profiles_training_experience_check;
alter table public.profiles
  add constraint profiles_training_experience_check
  check (training_experience is null
         or training_experience in ('beginner', 'intermediate', 'advanced'));

alter table public.profiles
  drop constraint if exists profiles_gym_access_check;
alter table public.profiles
  add constraint profiles_gym_access_check
  check (gym_access is null
         or gym_access in ('full_gym', 'home_basic', 'bodyweight'));

comment on column public.profiles.training_experience is
  'Phase 4.3.7A. Stated training experience: beginner|intermediate|advanced. NULL = not collected (legacy or partial onboarding); personalization treats NULL as no signal, never a mismatch.';
comment on column public.profiles.gym_access is
  'Phase 4.3.7A. Stated equipment access: full_gym|home_basic|bodyweight. NULL = not collected. Personalization treats NULL as no signal.';