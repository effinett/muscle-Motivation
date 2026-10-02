-- Phase 4.3.6J corrective. The partial unique indexes could not satisfy a plain
-- ON CONFLICT: Postgres only matches a partial index when the statement carries
-- the same WHERE predicate, which PostgREST's onConflict does not emit. Every
-- favorite insert therefore failed with 42P10.
--
-- This is the exact trap recorded in CLAUDE.md §9 ("a partial unique index with
-- WHERE doesn't satisfy a plain ON CONFLICT; drop the partial index, create a
-- plain unique index").
--
-- Plain uniques are also SEMANTICALLY correct here, and are the same shape
-- Phase 4.2.1K used on personal_records: NULLs are distinct by default, so the
-- many custom favorites (exercise_id NULL) never collide with each other, while
-- two favorites of the same canonical exercise still conflict.

drop index if exists public.user_exercise_favorites_canonical_uq;
drop index if exists public.user_exercise_favorites_custom_uq;

alter table public.user_exercise_favorites
  add constraint user_exercise_favorites_canonical_uq unique (user_id, exercise_id);

alter table public.user_exercise_favorites
  add constraint user_exercise_favorites_custom_uq unique (user_id, user_exercise_id);