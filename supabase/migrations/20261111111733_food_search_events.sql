-- Roadmap 4.5.17 (evidence for food-search certification). The smallest sink that
-- can answer two questions about REAL searches: which searches return nothing,
-- and which result position do people actually pick?
--
-- SHAPE. Append-only and narrow: an enum event, the search text, how many
-- database results were shown, and — for a pick — its position, its list and
-- whether it was a row tap or a one-tap add. There is NO user_id and no food
-- log content: the table measures searches, not people. The search text is the
-- one free-text field (owner-approved 2026-11-11); the client caps it at 80
-- characters and never sends text that looks like an email or a long number.
--
-- SECURITY. Same shape as public.funnel_events (phase_437g):
--   * INSERT only, and only to authenticated (food search is a signed-in surface)
--   * the WITH CHECK is the boundary — event names, value ranges and which
--     fields each event may carry are enumerated here and mirrored by
--     food-telemetry.js; the two must agree
--   * NO select, update or delete policy exists, so the table is WRITE-ONLY from
--     any browser; rows are readable with the service role only
--
-- RETENTION. Intent is 180 days. No purge machinery is installed at this volume.
--
-- Rollback: drop table public.food_search_events;

create table if not exists public.food_search_events (
  id             uuid primary key default gen_random_uuid(),
  event          text not null,
  query          text not null,
  result_count   smallint not null default 0,
  picked_rank    smallint,
  picked_source  text,
  via            text,
  schema_version integer not null default 1,
  created_at     timestamptz not null default now()
);

comment on table public.food_search_events is
  'Roadmap 4.5.17. Append-only anonymous food-search telemetry: zero-result searches and the result position picked. Contains NO user id by construction. Write-only from clients: INSERT policy only, no SELECT policy. Retention intent 180 days, no automatic purge.';
comment on column public.food_search_events.query is
  'Search text as typed, lowercased and whitespace-collapsed, 2-80 characters. The client never sends text containing @ or a run of 7+ digits.';
comment on column public.food_search_events.picked_rank is
  '0-based position of the picked row within its list (database results or the user''s own foods). NULL for zero_result.';
comment on column public.food_search_events.picked_source is
  'Which list the pick came from: generic | branded | own. NULL for zero_result.';
comment on column public.food_search_events.via is
  'row = the food card was opened; add = one-tap add. NULL for zero_result.';

alter table public.food_search_events enable row level security;

drop policy if exists food_search_events_insert on public.food_search_events;
create policy food_search_events_insert
  on public.food_search_events
  for insert
  to authenticated
  with check (
    schema_version = 1
    and char_length(query) between 2 and 80
    and (
         (event = 'zero_result'
          and result_count = 0
          and picked_rank is null and picked_source is null and via is null)
      or (event = 'pick'
          and result_count between 0 and 200
          and picked_rank between 0 and 200
          and picked_source in ('generic', 'branded', 'own')
          and via in ('row', 'add'))
    )
  );

create index if not exists food_search_events_event_created_idx
  on public.food_search_events (event, created_at desc);
