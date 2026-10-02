-- Per-user favorite foods for the nutrition logger.
-- food_key is the stable identity: 'usda:<fdcId>' for USDA/barcode foods,
-- 'custom:<normalized name>' for manual foods (matches foods' (user_id, name) identity).
-- raw_food keeps the trimmed USDA payload so tapping a favorite reopens the full
-- serving-aware food card. PLAIN unique constraint (not partial) so client-side
-- upsert onConflict('user_id,food_key') works.
create table public.user_food_favorites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  food_key      text not null,
  food_name     text not null,
  brand_name    text,
  source        text,
  fdc_id        bigint,
  gtin_upc      text,
  serving_unit  text,
  serving_qty   numeric,
  calories      numeric,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  raw_food      jsonb,
  created_at    timestamptz not null default now(),
  unique (user_id, food_key)
);

create index user_food_favorites_user_created_idx
  on public.user_food_favorites (user_id, created_at desc);

alter table public.user_food_favorites enable row level security;

create policy "Users select own food favorites" on public.user_food_favorites
  for select using (auth.uid() = user_id);
create policy "Users insert own food favorites" on public.user_food_favorites
  for insert with check (auth.uid() = user_id);
create policy "Users update own food favorites" on public.user_food_favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own food favorites" on public.user_food_favorites
  for delete using (auth.uid() = user_id);