
-- Replace the partial unique index with a plain one so the webhook's
-- ON CONFLICT (stripe_session_id) upsert has a matching constraint.
DROP INDEX IF EXISTS public.purchases_stripe_session_id_uniq;
CREATE UNIQUE INDEX purchases_stripe_session_id_uniq
  ON public.purchases (stripe_session_id);
