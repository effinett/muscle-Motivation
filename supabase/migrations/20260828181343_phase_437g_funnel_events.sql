-- Phase 4.3.7G. The minimum sink that can answer "of everyone who started
-- onboarding, how many finished?".
--
-- WHY A TABLE AND NOT LOGS. api/client-error.js (4.3.5J) writes one line to
-- stdout and needs no storage at all, which is right for errors: you grep
-- within hours of a break. It cannot work here. Vercel runtime logs are a
-- ~24-hour window scoped PER DEPLOYMENT, and every push mints a new deployment
-- and resets the view (verified 2026-08-28 — querying the live production
-- deployment returned no logs). A funnel is an aggregate over days and across
-- deployments, so it needs durable rows.
--
-- SHAPE. Append-only and deliberately narrow: an enum event, an opaque
-- ephemeral funnel id, a coarse route, ONE categorical detail, a schema
-- version. There is no user_id and no profile data of any kind — the funnel
-- measures counts, not individuals, so identity is not merely omitted, it is
-- unnecessary.
--
-- SECURITY. Modelled on public.leads (leads_public_insert), which is this
-- repo's established shape for "anyone may write a narrow validated row and
-- nobody may read it back":
--   * INSERT only, to anon and authenticated
--   * the WITH CHECK is the allowlist — every event name AND its permitted
--     detail values are enumerated here, so the database rejects anything the
--     client vocabulary does not know. Validation exists in both places on
--     purpose; the client one is for correctness, this one is the boundary.
--   * NO select, update or delete policy exists, so the table is WRITE-ONLY
--     from any browser. One user cannot read another's events because nobody
--     can read events at all without the service role.
--
-- RETENTION. Intent is 180 days. No purge machinery is installed: at current
-- volume (<= 8 rows per completed funnel) it would be more moving parts than
-- the problem justifies. Revisit with pg_cron when row count warrants it.
--
-- Rollback: drop table public.funnel_events;

create table if not exists public.funnel_events (
  id             uuid primary key default gen_random_uuid(),
  event          text not null,
  funnel_id      text not null,
  route          text,
  detail         text,
  schema_version integer not null default 1,
  created_at     timestamptz not null default now()
);

comment on table public.funnel_events is
  'Phase 4.3.7G. Append-only anonymous funnel telemetry. Contains NO user id and no profile data by construction. Write-only from clients: INSERT policy only, no SELECT policy. Retention intent 180 days, no automatic purge.';
comment on column public.funnel_events.funnel_id is
  'Opaque ephemeral id from sessionStorage, minted at onboarding start and cleared with the draft. Never persisted to profiles and never joined to a user.';
comment on column public.funnel_events.detail is
  'ONE categorical value, allowlisted PER EVENT by the insert policy.';

alter table public.funnel_events enable row level security;

-- Per-event detail allowlist. Adding an event means adding a branch here AND
-- to FUNNEL_EVENTS in analytics-core.js — the two must agree.
drop policy if exists funnel_events_public_insert on public.funnel_events;
create policy funnel_events_public_insert
  on public.funnel_events
  for insert
  to anon, authenticated
  with check (
    schema_version = 1
    and char_length(funnel_id) between 8 and 24
    and (route is null or route in ('landing', 'onboarding', 'auth', 'app', 'other'))
    and (
         (event = 'landing_cta_clicked'       and detail in ('hero', 'create_account'))
      or (event = 'onboarding_started'        and detail in ('anonymous', 'authenticated'))
      or (event = 'onboarding_step_completed' and detail in ('1', '2', '3', '4'))
      or (event = 'personalized_plan_viewed'  and detail in ('ready', 'partial', 'needs_input'))
      or (event = 'save_plan_clicked'         and detail is null)
      or (event = 'signup_completed'          and detail in ('email', 'google'))
      or (event = 'onboarding_completed'      and detail in ('anonymous_claim', 'authenticated_wizard'))
      or (event = 'onboarding_claim_failed'
          and detail in ('compute', 'merge_empty', 'field_write', 'flag_write', 'confirm'))
    )
  );

-- Per-event counts over a window, and stitching one journey. Two indexes; the
-- volume does not justify more.
create index if not exists funnel_events_event_created_idx
  on public.funnel_events (event, created_at desc);
create index if not exists funnel_events_funnel_idx
  on public.funnel_events (funnel_id);