-- Phase 2: Stripe production readiness
-- 1. Track subscription renewal date so the dashboard can show "renews on …"
alter table public.purchases
  add column if not exists current_period_end timestamptz;

-- 2. Allow a 'past_due' status for failed-payment handling.
--    Existing rows are unaffected (all current values remain valid).
alter table public.purchases
  drop constraint if exists purchases_status_check;

alter table public.purchases
  add constraint purchases_status_check
  check (status = any (array['active'::text, 'canceled'::text, 'refunded'::text, 'past_due'::text]));