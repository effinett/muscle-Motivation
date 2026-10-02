
create unique index purchases_stripe_session_id_uniq
  on public.purchases(stripe_session_id)
  where stripe_session_id is not null;
