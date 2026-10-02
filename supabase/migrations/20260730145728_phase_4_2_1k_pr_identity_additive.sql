-- Phase 4.2.1K Migration 1 (additive). See docs/phase-4-2-1k-pr-identity.sql.

-- 1. workout_exercises: stable custom identity
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

-- 2. personal_records: stable canonical + custom identity
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

-- 3. Conservative backfill (unambiguous only)
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

-- 4. Identity-aware uniqueness
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

create unique index if not exists personal_records_user_legacy_uidx
  on public.personal_records(user_id, exercise_name)
  where exercise_id is null and user_exercise_id is null;

-- 5. Server-enforced same-user ownership of custom references
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