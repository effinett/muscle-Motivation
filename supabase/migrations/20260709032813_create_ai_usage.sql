-- Phase 4.2: per-user AI request tracking for rate/cost caps.
-- Writes happen ONLY through the service role in Vercel functions;
-- clients may read their own rows (to display remaining daily uses).
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  created_at timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "read own usage" on public.ai_usage
  for select using (auth.uid() = user_id);
-- deliberately NO insert/update/delete policies: service role only
