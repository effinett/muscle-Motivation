-- Security fix: prevent clients from writing profiles.stripe_customer_id.
-- Only the Stripe webhook (service_role) may set it. Without this, an
-- authenticated user could set their own stripe_customer_id to another
-- customer's cus_ id and open that customer's Stripe billing portal.
-- Clients keep SELECT (RLS still scopes to their own row); only writes are revoked.
REVOKE INSERT (stripe_customer_id), UPDATE (stripe_customer_id)
  ON public.profiles FROM anon;
REVOKE INSERT (stripe_customer_id), UPDATE (stripe_customer_id)
  ON public.profiles FROM authenticated;