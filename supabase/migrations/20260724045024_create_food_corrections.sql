-- Phase 4.2.4 Correction Memory: persistent, user-specific food corrections.
-- Identity columns store nuFoodKey strings ('usda:<id>' / 'custom:<name>'), the
-- same identity favorites and saved-meal items use. Data-minimal: name+brand
-- snapshots only, never full candidate payloads. Written client-side under RLS
-- (like user_food_favorites); read at ranking time under the user's RLS token.

create table if not exists public.food_corrections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  schema_version     int  not null default 1,
  status             text not null default 'active'
                       check (status in ('active','superseded','deactivated')),
  raw_query          text,
  norm_query         text not null,
  intent_key         text,
  incorrect_key      text,
  corrected_key      text not null,
  incorrect_meta     jsonb,
  corrected_meta     jsonb,
  source_surface     text,
  provenance         text,
  confidence_before  text,
  ambiguity          jsonb not null default '[]'::jsonb,
  reinforcement_count int  not null default 1,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  updated_at         timestamptz not null default now(),
  -- One row per (user, normalized query, corrected food): repeated identical
  -- corrections REINFORCE this row rather than duplicating it.
  constraint food_corrections_user_query_food_uniq
    unique (user_id, norm_query, corrected_key)
);

-- Primary ranking-time lookup: a user's active corrections for a normalized query.
create index if not exists food_corrections_user_normq_idx
  on public.food_corrections (user_id, norm_query)
  where status = 'active';

-- Conservative generalization lookup: active anchored (brand/product) corrections.
create index if not exists food_corrections_user_intent_idx
  on public.food_corrections (user_id, intent_key)
  where status = 'active' and intent_key is not null;

alter table public.food_corrections enable row level security;

-- Ownership is enforced by RLS, never by client-supplied ids (same pattern as
-- user_food_favorites / foods): a user may only ever see or change their own rows.
create policy "Users select own food corrections"
  on public.food_corrections for select using (auth.uid() = user_id);
create policy "Users insert own food corrections"
  on public.food_corrections for insert with check (auth.uid() = user_id);
create policy "Users update own food corrections"
  on public.food_corrections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own food corrections"
  on public.food_corrections for delete using (auth.uid() = user_id);