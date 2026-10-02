-- The table-level UPDATE grant on profiles covers every column, so a column-level
-- REVOKE can't stop a client from writing stripe_customer_id. Enforce it with a
-- trigger instead: any non-privileged role (anon/authenticated) has its
-- stripe_customer_id write ignored (kept at the prior value / null on insert).
-- The Stripe webhook connects as service_role and is allowed through.
CREATE OR REPLACE FUNCTION public.protect_stripe_customer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Privileged roles (webhook = service_role, plus admin/postgres) may set it.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  -- Everyone else: never allow the client to set/alter the Stripe customer id.
  IF TG_OP = 'INSERT' THEN
    NEW.stripe_customer_id := NULL;
  ELSE
    NEW.stripe_customer_id := OLD.stripe_customer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_stripe_customer_id ON public.profiles;
CREATE TRIGGER trg_protect_stripe_customer_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_stripe_customer_id();