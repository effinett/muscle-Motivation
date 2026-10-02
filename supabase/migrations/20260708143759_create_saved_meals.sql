-- Saved meals: snapshot of one logged meal's items, re-loggable in two taps.
-- items jsonb = array of per-food snapshots (per-serving macros + servings +
-- USDA identity + raw_food when available). PLAIN unique (user_id, name) so the
-- client can upsert onConflict:'user_id,name' — re-saving a name updates it
-- (v1's "edit"). Mirrors user_food_favorites' RLS exactly.
create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_meals_user_name_key unique (user_id, name)
);

alter table public.saved_meals enable row level security;

create policy "Users select own saved meals" on public.saved_meals
  for select using (auth.uid() = user_id);
create policy "Users insert own saved meals" on public.saved_meals
  for insert with check (auth.uid() = user_id);
create policy "Users update own saved meals" on public.saved_meals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own saved meals" on public.saved_meals
  for delete using (auth.uid() = user_id);