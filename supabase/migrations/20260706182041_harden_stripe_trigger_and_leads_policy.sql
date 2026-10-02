-- (1) Recreate the guard as SECURITY INVOKER so current_user is the ACTUAL caller
-- (authenticated/anon/service_role), making the privilege check deterministic, and
-- revoke RPC EXECUTE so it can't be called as an endpoint (it's a trigger only).
CREATE OR REPLACE FUNCTION public.protect_stripe_customer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.stripe_customer_id := NULL;
  ELSE
    NEW.stripe_customer_id := OLD.stripe_customer_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_stripe_customer_id() FROM PUBLIC, anon, authenticated;

-- (2) Replace the always-true leads INSERT check with real validation: a plausible,
-- size-bounded email + name. Still public (lead form is unauthenticated) but no
-- longer an unrestricted write.
DROP POLICY IF EXISTS leads_public_insert ON public.leads;
CREATE POLICY leads_public_insert ON public.leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name  IS NOT NULL AND char_length(name)  BETWEEN 1 AND 200
    AND email IS NOT NULL AND char_length(email) BETWEEN 3 AND 320
    AND position('@' IN email) > 1
    AND source IS NOT NULL AND char_length(source) <= 64
  );