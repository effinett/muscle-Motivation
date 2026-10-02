-- Phase 4.0: body-fat + measurement logging. Both tables clone body_weight_logs'
-- shape: one row per (user_id, logged_on) so the client upserts on conflict,
-- plus the same descending read index. RLS mirrors the own-rows pattern used
-- by body_weight_logs / saved_meals / user_food_favorites.

create table public.body_fat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body_fat_pct numeric not null check (body_fat_pct > 0 and body_fat_pct < 75),
  logged_on date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_fat_logs_user_day_key unique (user_id, logged_on)
);
create index body_fat_logs_user_date_idx on public.body_fat_logs (user_id, logged_on desc);

alter table public.body_fat_logs enable row level security;
create policy "Users select own body fat logs" on public.body_fat_logs
  for select using (auth.uid() = user_id);
create policy "Users insert own body fat logs" on public.body_fat_logs
  for insert with check (auth.uid() = user_id);
create policy "Users update own body fat logs" on public.body_fat_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own body fat logs" on public.body_fat_logs
  for delete using (auth.uid() = user_id);

-- Wide daily row: fixed site vocabulary as nullable columns (adding a site
-- later = one additive nullable column). All values in inches.
create table public.measurement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null,
  waist_in numeric check (waist_in is null or (waist_in > 0 and waist_in < 200)),
  neck_in  numeric check (neck_in  is null or (neck_in  > 0 and neck_in  < 200)),
  chest_in numeric check (chest_in is null or (chest_in > 0 and chest_in < 200)),
  hips_in  numeric check (hips_in  is null or (hips_in  > 0 and hips_in  < 200)),
  arm_in   numeric check (arm_in   is null or (arm_in   > 0 and arm_in   < 200)),
  thigh_in numeric check (thigh_in is null or (thigh_in > 0 and thigh_in < 200)),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_logs_user_day_key unique (user_id, logged_on),
  constraint measurement_logs_not_empty check (
    coalesce(waist_in, neck_in, chest_in, hips_in, arm_in, thigh_in) is not null
  )
);
create index measurement_logs_user_date_idx on public.measurement_logs (user_id, logged_on desc);

alter table public.measurement_logs enable row level security;
create policy "Users select own measurements" on public.measurement_logs
  for select using (auth.uid() = user_id);
create policy "Users insert own measurements" on public.measurement_logs
  for insert with check (auth.uid() = user_id);
create policy "Users update own measurements" on public.measurement_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own measurements" on public.measurement_logs
  for delete using (auth.uid() = user_id);