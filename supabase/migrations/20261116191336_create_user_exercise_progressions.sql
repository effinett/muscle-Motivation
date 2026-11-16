-- Bodyweight Exercise Progression v1 (roadmap 5.1.2 bodyweight scope; owner-approved 2026-11-16).
-- Per-client record of step-up decisions. The decision itself is computed by
-- bodyweight-progression.js; this table only remembers what the client chose.
--
-- APPEND-ONLY: one row per choice (accepted / declined / reverted). The latest
-- row per (user, program, from_exercise) is the client's current state, so the
-- full history stays readable for the AI Coach and for audit. Clients may
-- INSERT and SELECT their own rows only; there is no UPDATE or DELETE policy.
-- Rows go with the user (on delete cascade). No Program or Routine is ever edited.
--
-- Rollback: drop table public.user_exercise_progressions;

create table if not exists public.user_exercise_progressions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_slug     text not null check (char_length(program_slug) between 1 and 64),
  from_exercise_id uuid not null references public.exercises(id) on delete cascade,
  to_exercise_id   uuid not null references public.exercises(id) on delete cascade,
  state            text not null check (state in ('accepted', 'declined', 'reverted')),
  engine_version   integer not null default 1 check (engine_version >= 1),
  created_at       timestamptz not null default now(),
  constraint user_exercise_progressions_distinct check (from_exercise_id <> to_exercise_id)
);

comment on table public.user_exercise_progressions is
  'Bodyweight Exercise Progression v1 (roadmap 5.1.2). Append-only per-client step-up choices: the latest row per (user_id, program_slug, from_exercise_id) is current. Owner-scoped INSERT and SELECT only; no UPDATE or DELETE. Never edits a Program or Routine.';

create index if not exists user_exercise_progressions_user_program_idx
  on public.user_exercise_progressions (user_id, program_slug, created_at desc);

alter table public.user_exercise_progressions enable row level security;

drop policy if exists user_exercise_progressions_select_own on public.user_exercise_progressions;
create policy user_exercise_progressions_select_own
  on public.user_exercise_progressions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_exercise_progressions_insert_own on public.user_exercise_progressions;
create policy user_exercise_progressions_insert_own
  on public.user_exercise_progressions
  for insert to authenticated
  with check (auth.uid() = user_id);

revoke all on public.user_exercise_progressions from anon;
revoke update, delete, truncate on public.user_exercise_progressions from authenticated;
