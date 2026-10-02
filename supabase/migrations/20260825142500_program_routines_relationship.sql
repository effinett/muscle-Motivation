-- Phase 4.3.6 CP8a — the Program ↔ canonical Routine relationship.
--
-- Placement and ordering live HERE, never on the Routine, so one Routine can
-- appear in more than one Program (or more than once in a Program) without
-- either owning the other.
--
-- session_key is the real linkage, not sort_order: it is unique per program
-- (16/15/16 distinct keys) and is what startProgramSession() and the
-- schedules.js training_days → session-key mapping both key on. sort_order is
-- a non-unique display hint (only 10/4/10 distinct values) and is carried
-- across verbatim rather than reinterpreted.
create table public.program_routines (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  -- RESTRICT, never CASCADE: removing a Routine must not silently delete a
  -- live Program's session structure. An assigned Routine has to be detached
  -- deliberately first.
  routine_id  uuid not null references public.workout_templates(id) on delete restrict,
  session_key text not null,
  sort_order  integer not null default 0,
  -- Provenance + idempotency in one field: the legacy row this was migrated
  -- from. UNIQUE, so re-running the migration cannot duplicate content.
  legacy_program_workout_id uuid references public.program_workouts(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Mirrors program_workouts' own unique(program_slug, session_key).
  constraint program_routines_program_session_uniq unique (program_id, session_key),
  constraint program_routines_legacy_uniq unique (legacy_program_workout_id)
);

comment on table public.program_routines is
  'Phase 4.3.6 CP8. Program ↔ canonical Routine placement. Ordering lives here '
  'so a Routine can be reused across Programs. session_key is the linkage that '
  'schedules.js and program execution key on. Routine FK is ON DELETE RESTRICT '
  'so a live Program cannot lose its structure silently.';

alter table public.program_routines enable row level security;

-- CP8a deliberately grants NO client policy at all: nothing in the app reads
-- or writes this table yet, and the entitlement-scoped read policy is CP8b's
-- reviewed decision. With RLS on and no policy, every non-service role is
-- denied — the safe default while the runtime still uses program_workouts.
revoke insert, update, delete on public.program_routines from anon, authenticated;