-- Phase 4.3.6J — explicit per-user exercise favorites.
-- Narrow and additive: identity only, no denormalized metadata (unlike
-- user_food_favorites, where USDA foods have no local id to key on).
-- Recents are NOT stored here — they are derived from workout history.

create table if not exists public.user_exercise_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Exactly one identity is populated. Canonical favorites key by the stable
  -- exercises.id so a later rename never breaks the preference; custom
  -- favorites key by user_exercises.id. Legacy name-only rows have no stable
  -- identity and are therefore not favoritable at all — by construction.
  exercise_id uuid references public.exercises(id) on delete cascade,
  user_exercise_id uuid references public.user_exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_exercise_favorites_identity_xor check (
    (exercise_id is not null and user_exercise_id is null)
    or (exercise_id is null and user_exercise_id is not null)
  )
);

comment on table public.user_exercise_favorites is
  'Phase 4.3.6J. Explicit per-user exercise favorites, keyed by stable identity (canonical exercises.id XOR user_exercises.id). Private: owner-scoped RLS plus a same-user ownership trigger for custom references. Recents are derived from workout history and are deliberately NOT stored here.';

-- Favoriting the same exercise twice is impossible rather than merely handled
-- in the client: the partial uniques make the insert idempotent-by-conflict.
create unique index if not exists user_exercise_favorites_canonical_uq
  on public.user_exercise_favorites (user_id, exercise_id)
  where exercise_id is not null;

create unique index if not exists user_exercise_favorites_custom_uq
  on public.user_exercise_favorites (user_id, user_exercise_id)
  where user_exercise_id is not null;

-- The read path is "this user's favorites, newest first".
create index if not exists user_exercise_favorites_user_created_idx
  on public.user_exercise_favorites (user_id, created_at desc);

alter table public.user_exercise_favorites enable row level security;

drop policy if exists user_exercise_favorites_own on public.user_exercise_favorites;
create policy user_exercise_favorites_own
  on public.user_exercise_favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS alone would let a user store a favorite pointing at ANOTHER user's
-- custom exercise (the policy only constrains user_id, not the referenced row).
-- Same defence the Phase 4.2.1K enforce_pr_custom_owner trigger applies.
create or replace function public.enforce_fav_custom_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;

drop trigger if exists user_exercise_favorites_custom_owner on public.user_exercise_favorites;
create trigger user_exercise_favorites_custom_owner
  before insert or update on public.user_exercise_favorites
  for each row execute function public.enforce_fav_custom_owner();