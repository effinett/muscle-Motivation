-- Nutrition logging foundation (Tier 1 Phase 5)
-- Two tables: reusable food definitions + per-entry logs.
-- Nutrition NEVER writes profiles targets — those are owned by Recalculate Goals.

create table if not exists public.foods (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  default_calories numeric,
  default_protein  numeric,
  default_carbs    numeric,
  default_fat      numeric,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One food per (user, case-insensitive name) — enables reuse/dedup + future favorites/recent.
create unique index if not exists foods_user_lower_name_uidx
  on public.foods (user_id, lower(name));

create table if not exists public.food_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid references public.foods(id) on delete set null,
  name       text not null,                       -- snapshot: log survives food rename/delete
  date       date not null default current_date,
  meal       text not null check (meal in ('breakfast','lunch','dinner','snack')),
  servings   numeric not null default 1,
  calories   numeric,                             -- snapshot = per-serving x servings
  protein    numeric,
  carbs      numeric,
  fat        numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, date);

-- RLS: own-row only, mirroring body_weight_logs.
alter table public.foods enable row level security;
alter table public.food_logs enable row level security;

create policy "Users select own foods"  on public.foods for select using (auth.uid() = user_id);
create policy "Users insert own foods"   on public.foods for insert with check (auth.uid() = user_id);
create policy "Users update own foods"   on public.foods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own foods"   on public.foods for delete using (auth.uid() = user_id);

create policy "Users select own food logs" on public.food_logs for select using (auth.uid() = user_id);
create policy "Users insert own food logs" on public.food_logs for insert with check (auth.uid() = user_id);
create policy "Users update own food logs" on public.food_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own food logs" on public.food_logs for delete using (auth.uid() = user_id);