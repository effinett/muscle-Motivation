-- Phase 4.3.7B. Anonymous onboarding must be able to build the Program
-- recommendation BEFORE an account exists, so the published catalog needs to
-- be readable without a session.
--
-- Scoped `to anon` ONLY. The two existing policies are `to authenticated` and
-- are untouched; policies are OR'd per role, so authenticated behaviour is
-- bit-for-bit identical.
--
-- DISCLOSURE NOTE (recorded deliberately): RLS is row-level, not column-level,
-- so this exposes all 16 columns of a PUBLISHED row to the anon key — not only
-- the columns program-catalog.js selects. All 16 were audited and are catalog
-- metadata: id, slug, name, description, goal, difficulty, duration_weeks,
-- recommended_days_per_week, equipment_summary, included_with_membership,
-- standalone_purchasable, status, sort_order, page_path, created_at,
-- updated_at. No pricing (Stripe owns it), no prescriptions, no user data.
-- store.html is a public page that already hardcodes the names, descriptions
-- and prices, so nothing new is disclosed.
--
-- What this does NOT grant: program_workouts, program_routines,
-- workout_templates, purchases, user_programs and profiles have no anon policy
-- and stay closed. Unpublished Programs are excluded by the predicate. There is
-- no anon INSERT/UPDATE/DELETE policy anywhere, so anonymous writes remain
-- impossible.
--
-- Rollback: drop policy programs_read_published_anon on public.programs;

create policy programs_read_published_anon
  on public.programs
  for select
  to anon
  using (status = 'published');