-- Phase 4.3.6 CP4 — evolve workout_templates into the canonical Routine.
--
-- ADDITIVE ONLY. No row is rewritten, no column dropped or retyped, no data
-- migrated. Every existing row keeps its exact current meaning: user-owned and
-- private, enforced by defaults and a CHECK rather than by application code.
--
-- This checkpoint adds CAPABILITY, not behaviour: no platform Routine rows are
-- created and READ exposure is deliberately unchanged (see the SELECT policy).

alter table public.workout_templates
  -- Routine catalog metadata. All nullable: existing rows stay null rather
  -- than being guessed. Consumed by CP6 authoring and CP8 composition.
  add column description text,
  -- Reuses the live profiles.goal / GOAL_LABELS vocabulary. No new taxonomy.
  add column goal text,
  add column difficulty text,
  -- Smallest practical representation. Metadata only — never entitlement or
  -- execution input.
  add column tags text[] not null default '{}',

  -- Authorship and exposure. These two are the security-relevant fields.
  --   is_platform : false = a user's own Routine, true = platform-authored
  --   visibility  : read exposure only. Lifecycle (draft/published/retired)
  --                 deliberately NOT modelled here — it would duplicate
  --                 'published' across two columns and allow contradictory
  --                 states. It arrives with the CP6 publishing workflow.
  add column is_platform boolean not null default false,
  add column visibility text not null default 'private';

alter table public.workout_templates
  add constraint workout_templates_visibility_check
    check (visibility in ('private', 'published')),
  add constraint workout_templates_goal_check
    check (goal is null or goal in ('fatloss', 'recomp', 'muscle')),
  -- Structural guarantee: a user-owned Routine can never be published. This is
  -- what makes the write policies below sufficient — publication is impossible
  -- for a non-platform row even if a policy were later loosened by mistake.
  add constraint workout_templates_publish_requires_platform
    check (visibility = 'private' or is_platform = true);

comment on table public.workout_templates is
  'Phase 4.3.6 CP4. The canonical Routine entity, evolved additively from '
  'workout templates. is_platform + visibility are the security fields: a '
  'user-owned row can never be published (CHECK), and clients can never write '
  'a platform row (RLS). Lifecycle status arrives with CP6 publishing. '
  'The exercises JSONB contract is owned by routine-core.js (CP3).';

-- ── RLS: replace the single ALL policy with four explicit ones ─────────────
-- The old policy (auth.uid() = user_id, ALL) is dropped and re-expressed. It
-- is NOT widened: SELECT stays owner-only, so this checkpoint changes read
-- exposure for nobody. Platform-read arrives deliberately in CP6/CP8.
drop policy workout_templates_own on public.workout_templates;

-- READ — owner only. Unchanged from the old policy.
create policy workout_templates_select on public.workout_templates
  for select to authenticated
  using (auth.uid() = user_id);

-- INSERT — own private, non-platform rows only. A client cannot create
-- platform content or publish at creation time.
create policy workout_templates_insert on public.workout_templates
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_platform = false
    and visibility = 'private'
  );

-- UPDATE — a client may edit only its own non-platform row, and the result
-- must still be its own, non-platform and private. The USING clause stops it
-- touching platform rows; the WITH CHECK stops it promoting a row it owns.
create policy workout_templates_update on public.workout_templates
  for update to authenticated
  using (auth.uid() = user_id and is_platform = false)
  with check (
    auth.uid() = user_id
    and is_platform = false
    and visibility = 'private'
  );

-- DELETE — own non-platform rows only.
create policy workout_templates_delete on public.workout_templates
  for delete to authenticated
  using (auth.uid() = user_id and is_platform = false);