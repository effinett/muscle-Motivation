-- Body weight tracking log. One entry per user per day (latest wins via upsert).
create table if not exists public.body_weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  weight_lbs  numeric not null,
  logged_on   date not null default current_date,
  note        text,
  created_at  timestamp with time zone default now(),
  updated_at  timestamp with time zone default now()
);

-- Plain unique constraint (no WHERE) so ON CONFLICT / upsert works cleanly.
create unique index if not exists body_weight_logs_user_day_uidx
  on public.body_weight_logs (user_id, logged_on);

create index if not exists body_weight_logs_user_date_idx
  on public.body_weight_logs (user_id, logged_on desc);

alter table public.body_weight_logs enable row level security;

drop policy if exists "Users select own body weight logs" on public.body_weight_logs;
create policy "Users select own body weight logs"
  on public.body_weight_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own body weight logs" on public.body_weight_logs;
create policy "Users insert own body weight logs"
  on public.body_weight_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own body weight logs" on public.body_weight_logs;
create policy "Users update own body weight logs"
  on public.body_weight_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own body weight logs" on public.body_weight_logs;
create policy "Users delete own body weight logs"
  on public.body_weight_logs for delete
  using (auth.uid() = user_id);