-- Track a scheduled "cancel at period end" so the dashboard can show
-- "Canceled — access ends on <date>" while access continues until then.
alter table public.purchases
  add column if not exists cancel_at_period_end boolean not null default false;