-- Phase 4.3.6 CP1a — canonical Program catalog.
-- Catalog identity + browse metadata ONLY. No session/workout prescriptions,
-- no ownership, no execution state. Nothing consumes this table yet (CP1b).
create table public.programs (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  name                      text not null,
  description               text,
  goal                      text,
  difficulty                text,
  duration_weeks            integer,
  recommended_days_per_week integer,
  equipment_summary         text,
  included_with_membership  boolean not null default false,
  standalone_purchasable    boolean not null default false,
  status                    text not null default 'draft',
  sort_order                integer not null default 0,
  page_path                 text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint programs_status_check
    check (status in ('draft','published','retired')),
  -- Reuses the live profiles.goal / GOAL_LABELS vocabulary. No new taxonomy.
  constraint programs_goal_check
    check (goal is null or goal in ('fatloss','recomp','muscle')),
  constraint programs_duration_check
    check (duration_weeks is null or duration_weeks > 0),
  constraint programs_days_check
    check (recommended_days_per_week is null
           or recommended_days_per_week between 1 and 7)
);

comment on table public.programs is
  'Phase 4.3.6 CP1a. Canonical Program catalog: identity + browse metadata only. '
  'Session prescriptions stay in program_workouts (entitlement-gated). '
  'recommended_days_per_week is a MARKETING recommendation; schedules.js remains '
  'authoritative for execution schedules. Price stays authoritative in Stripe. '
  'A catalog row is NOT authorization to sell: purchases.product CHECK governs that.';

alter table public.programs enable row level security;

-- READ: authenticated users may read PUBLISHED catalog metadata only.
-- Draft/retired rows are invisible to clients; service role bypasses RLS.
create policy programs_read_published on public.programs
  for select to authenticated
  using (status = 'published');

-- WRITE: no INSERT/UPDATE/DELETE policy exists, so RLS denies all three for
-- every non-service role. Grants are revoked as defence in depth.
revoke insert, update, delete on public.programs from anon, authenticated;

-- Seed: the three shipped Programs. Access flags per owner decision R2
-- (2026-08-21) — recorded business intent only; CP2 owns enforcement.
insert into public.programs
  (slug, name, description, goal, difficulty, duration_weeks,
   recommended_days_per_week, equipment_summary,
   included_with_membership, standalone_purchasable, status, sort_order, page_path)
values
  ('fat_loss_blueprint', '90 Day Fat Loss Blueprint', '12-week fat loss system',
   'fatloss', 'Beginner – Intermediate', 12, 4, 'Any Setup',
   true, true, 'published', 1, 'program-fat-loss.html'),
  ('muscle_gain', 'Muscle Gain', '8-week hypertrophy program',
   'muscle', 'Beginner', 8, 3, 'Any Setup',
   true, true, 'published', 2, 'program-muscle-gain.html'),
  ('glute_builder', 'Glute Builder', 'Women''s lower-body program',
   'muscle', 'All Levels', 8, 3, 'Any Setup',
   true, true, 'published', 3, 'program-glute-builder.html');