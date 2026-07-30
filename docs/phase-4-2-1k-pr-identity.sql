-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4.2.1K — Personal Records & Custom Exercise Identity Hardening
--
-- Migration 1 (ADDITIVE — safe to run while the Phase-J frontend is still live):
--   • Adds a stable CUSTOM identity column (user_exercise_id) to workout_exercises
--     and personal_records, alongside the existing canonical exercise_id.
--   • Enforces canonical XOR custom mutual exclusivity (CHECK) on both tables.
--   • Adds identity-aware uniqueness to personal_records:
--       - unique (user_id, exercise_id)        → canonical PRs   (NULLs distinct)
--       - unique (user_id, user_exercise_id)    → custom PRs      (NULLs distinct)
--       - partial unique (user_id, exercise_name) WHERE both ids null → legacy guard
--     The OLD plain unique (user_id, exercise_name) is intentionally KEPT here so
--     the currently-deployed Phase-J PR upsert (onConflict user_id,exercise_name)
--     keeps working. It is dropped in Migration 2 AFTER the new frontend ships.
--   • Conservative, UNAMBIGUOUS backfill only (81 canonical + 99 custom of 189);
--     the 8 canonical/custom name-collision rows and any un-attributable rows are
--     LEFT legacy (both ids null) — never guessed.
--   • FK delete behavior is ON DELETE SET NULL on BOTH id columns so a custom's
--     permanent deletion (Phase 4.2.1H, unreferenced only) or account deletion can
--     NEVER erase logged workout history — a row degrades to legacy, it never
--     cascades away.
--   • Server-enforced same-user ownership via BEFORE triggers: User A can never
--     reference User B's custom exercise from a workout_exercise or a PR.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. workout_exercises: stable custom identity ─────────────────────────────
alter table public.workout_exercises
  add column if not exists user_exercise_id uuid
    references public.user_exercises(id) on delete set null;

create index if not exists workout_exercises_user_exercise_id_idx
  on public.workout_exercises(user_exercise_id) where user_exercise_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workout_exercises_identity_excl') then
    alter table public.workout_exercises
      add constraint workout_exercises_identity_excl
      check (exercise_id is null or user_exercise_id is null);
  end if;
end $$;

-- ── 2. personal_records: stable canonical + custom identity ──────────────────
alter table public.personal_records
  add column if not exists exercise_id uuid
    references public.exercises(id) on delete set null,
  add column if not exists user_exercise_id uuid
    references public.user_exercises(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personal_records_identity_excl') then
    alter table public.personal_records
      add constraint personal_records_identity_excl
      check (exercise_id is null or user_exercise_id is null);
  end if;
end $$;

-- ── 3. Conservative backfill (unambiguous only) ──────────────────────────────
-- Canonical: exact (case-insensitive) name of exactly ONE catalog exercise, no
-- same-user custom shares the name, and this user has exactly one PR row for the
-- name (guards the old case-sensitive unique against creating a dup identity).
update public.personal_records p
set exercise_id = e.id
from public.exercises e
where lower(e.name) = lower(p.exercise_name)
  and p.exercise_id is null and p.user_exercise_id is null
  and (select count(*) from public.exercises e2 where lower(e2.name) = lower(p.exercise_name)) = 1
  and not exists (select 1 from public.user_exercises u
                   where u.user_id = p.user_id and lower(u.name) = lower(p.exercise_name))
  and (select count(*) from public.personal_records p2
        where p2.user_id = p.user_id and lower(p2.exercise_name) = lower(p.exercise_name)) = 1;

-- Custom: no canonical collision, exactly ONE of the user's customs matches the
-- name, and exactly one PR row for the name. Renamed/recreated customs whose
-- snapshot name no longer matches simply stay legacy (never guessed).
update public.personal_records p
set user_exercise_id = u.id
from public.user_exercises u
where u.user_id = p.user_id
  and lower(u.name) = lower(p.exercise_name)
  and p.exercise_id is null and p.user_exercise_id is null
  and not exists (select 1 from public.exercises e where lower(e.name) = lower(p.exercise_name))
  and (select count(*) from public.user_exercises u2
        where u2.user_id = p.user_id and lower(u2.name) = lower(p.exercise_name)) = 1
  and (select count(*) from public.personal_records p2
        where p2.user_id = p.user_id and lower(p2.exercise_name) = lower(p.exercise_name)) = 1;

-- ── 4. Identity-aware uniqueness (NULLs distinct → legacy/custom never collide)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personal_records_user_canon_uniq') then
    alter table public.personal_records
      add constraint personal_records_user_canon_uniq unique (user_id, exercise_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'personal_records_user_custom_uniq') then
    alter table public.personal_records
      add constraint personal_records_user_custom_uniq unique (user_id, user_exercise_id);
  end if;
end $$;

-- Legacy dedupe guard (passive; never an upsert arbiter): one legacy name-only
-- PR per user for a given name.
create unique index if not exists personal_records_user_legacy_uidx
  on public.personal_records(user_id, exercise_name)
  where exercise_id is null and user_exercise_id is null;

-- ── 5. Server-enforced same-user ownership of custom references ───────────────
create or replace function public.enforce_we_custom_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_exercise_id is not null then
    if not exists (
      select 1 from public.user_exercises ue
      join public.workouts w on w.id = new.workout_id
      where ue.id = new.user_exercise_id and ue.user_id = w.user_id
    ) then
      raise exception 'user_exercise_id % is not owned by the workout owner', new.user_exercise_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists workout_exercises_custom_owner on public.workout_exercises;
create trigger workout_exercises_custom_owner
before insert or update on public.workout_exercises
for each row execute function public.enforce_we_custom_owner();

create or replace function public.enforce_pr_custom_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_exercise_id is not null then
    if not exists (
      select 1 from public.user_exercises ue
      where ue.id = new.user_exercise_id and ue.user_id = new.user_id
    ) then
      raise exception 'user_exercise_id % is not owned by user %', new.user_exercise_id, new.user_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists personal_records_custom_owner on public.personal_records;
create trigger personal_records_custom_owner
before insert or update on public.personal_records
for each row execute function public.enforce_pr_custom_owner();

-- Trigger-only functions: triggers fire regardless of caller EXECUTE privilege,
-- so revoke the default PUBLIC EXECUTE to remove the PostgREST /rpc exposure
-- (Supabase advisor 0028/0029) without affecting trigger enforcement.
revoke execute on function public.enforce_pr_custom_owner() from public, anon, authenticated;
revoke execute on function public.enforce_we_custom_owner() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 2 (run AFTER the new frontend is live in production) — drops the old
-- name-only unique so ambiguous-name canonical PRs can insert cleanly:
--   alter table public.personal_records drop constraint personal_records_user_exercise_unique;
-- (kept as a separate tracked migration; see phase-4-2-1k-drop-legacy-unique)
-- ─────────────────────────────────────────────────────────────────────────────
