-- Refund handling: store the one-time payment's PaymentIntent so charge.refunded
-- events can be matched back to the exact purchase row. Subscriptions leave this
-- NULL (they are matched via stripe_subscription_id instead).
alter table public.purchases
  add column if not exists stripe_payment_intent_id text;

create index if not exists purchases_payment_intent_idx
  on public.purchases (stripe_payment_intent_id);