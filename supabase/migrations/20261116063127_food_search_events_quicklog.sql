-- Roadmap 4.5.17 follow-up: AI Quick Log outcomes in public.food_search_events.
--
-- Quick Log is the main way members log food, and it was invisible to search
-- telemetry. This replaces ONLY the insert policy so it also accepts:
--   * ql_matched / ql_chooser / ql_clarify / ql_unmatched / ql_manual — one row
--     per Quick Log item: how the shared resolver answered it, or that the
--     member abandoned the match and searched by hand. The query is the AI's
--     short per-food search term, never the member's full sentence.
--   * a pick with picked_source 'quicklog' and via 'chooser' — which chooser
--     row the member tapped.
-- Table shape, privacy rules (no user id, write-only, no SELECT policy) and
-- every existing event are unchanged. food-telemetry.js mirrors this check.
--
-- Rollback: re-run the policy block of 20261111111733_food_search_events.sql.

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
          and picked_source in ('generic', 'branded', 'own', 'quicklog')
          and via in ('row', 'add', 'chooser')
          and ((picked_source = 'quicklog') = (via = 'chooser')))
      or (event in ('ql_matched', 'ql_chooser', 'ql_clarify', 'ql_unmatched', 'ql_manual')
          and result_count between 0 and 200
          and picked_rank is null and picked_source is null and via is null)
    )
  );

comment on column public.food_search_events.picked_source is
  'Which list the pick came from: generic | branded | own | quicklog (Quick Log chooser). NULL for every other event.';
comment on column public.food_search_events.via is
  'row = the food card was opened; add = one-tap add; chooser = a Quick Log chooser row. NULL for every non-pick event.';
