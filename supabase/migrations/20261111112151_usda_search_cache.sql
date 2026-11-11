-- Roadmap 5.4 food-search speed / 4.5 USDA quota. A durable, cross-instance cache
-- of the ranked response /api/usda-search returns for a PLAIN search (no
-- correction memory, no meal context). One search fans out to 3-5 USDA requests;
-- a hit here costs none.
--
-- WHAT IT HOLDS. Public USDA-derived food data only: the same JSON body any
-- signed-in user would receive for that search text. No user id, no token, no
-- log content. The key is a fingerprint of the ranking code plus the normalized
-- search text, so a ranking change can never serve a stale ordering.
--
-- SECURITY. Server-only. RLS is enabled with NO policies and table privileges
-- are revoked from anon and authenticated, so no browser can read or write it —
-- a client-writable cache would let one user plant nutrition data for everyone.
-- Only the service role (the Vercel function) touches it.
--
-- RETENTION. Rows are valid for 24 hours (enforced by the reader) and pruned
-- opportunistically by the writer. Dropping the table loses nothing but speed.
--
-- Rollback: drop table public.usda_search_cache;

create table if not exists public.usda_search_cache (
  cache_key  text primary key,
  body       jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.usda_search_cache is
  'Durable cache of ranked /api/usda-search responses for plain searches. Public USDA-derived data only; no user data. Server-only: RLS enabled with no policies, privileges revoked from anon and authenticated. Rows valid 24h, pruned by the writer.';
comment on column public.usda_search_cache.cache_key is
  'Ranking-code fingerprint + normalized search text.';

alter table public.usda_search_cache enable row level security;

revoke all on table public.usda_search_cache from anon, authenticated;

create index if not exists usda_search_cache_created_idx
  on public.usda_search_cache (created_at);
