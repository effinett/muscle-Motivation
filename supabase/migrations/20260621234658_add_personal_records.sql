create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  best_weight numeric,
  best_reps integer,
  best_volume numeric,
  best_estimated_1rm numeric,
  source_workout_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint personal_records_user_exercise_unique unique (user_id, exercise_name)
);

alter table public.personal_records enable row level security;

create policy "personal_records_select_own"
  on public.personal_records for select
  using (auth.uid() = user_id);

create policy "personal_records_insert_own"
  on public.personal_records for insert
  with check (auth.uid() = user_id);

create policy "personal_records_update_own"
  on public.personal_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "personal_records_delete_own"
  on public.personal_records for delete
  using (auth.uid() = user_id);

create index if not exists personal_records_user_idx
  on public.personal_records (user_id, exercise_name);