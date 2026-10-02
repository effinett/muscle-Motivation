-- Phase 4.3.6 CP7 — snapshot provenance for Routines created from history.
--
-- CP4 deferred this field to CP7 on the grounds that its semantics are best
-- reviewed alongside the conversion code that writes it. This is that review.
--
-- ADDITIVE AND NULLABLE. Existing Routines — user-created and platform alike —
-- keep NULL, so no row is rewritten and nothing changes for them.
--
-- ON DELETE SET NULL, never CASCADE: a Routine is a SNAPSHOT, not a view onto
-- history. Deleting the originating workout must cost the Routine its
-- provenance breadcrumb and nothing else. The prescription is already copied
-- into the row's own `exercises` JSONB and is unaffected.
--
-- No UNIQUE constraint: converting the same workout twice is permitted (CP7
-- §12). Provenance is a breadcrumb for an optional "you already saved this"
-- hint, not a deduplication key.
--
-- No index: workout_templates holds 39 rows and every lookup is already
-- owner-scoped. An index here would cost more to maintain than it saves.
alter table public.workout_templates
  add column source_workout_id uuid
    references public.workouts(id) on delete set null;

comment on column public.workout_templates.source_workout_id is
  'Phase 4.3.6 CP7. The completed workout a Routine was snapshotted from, or '
  'NULL. Provenance only — the Routine is an independent copy, never a live '
  'view. ON DELETE SET NULL so deleting history never deletes a Routine.';