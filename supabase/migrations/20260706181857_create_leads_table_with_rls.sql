-- Free-guide lead capture. store.html wrote to this table but it never existed,
-- so leads were silently dropped. Create it with RLS: anyone may INSERT (the form
-- is unauthenticated by design), but NOBODY (anon/authenticated) may SELECT/UPDATE/
-- DELETE — that blocks email harvesting and tampering. Admins read via the service
-- role (dashboard), which bypasses RLS.
CREATE TABLE IF NOT EXISTS public.leads (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  email      text        NOT NULL UNIQUE,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Insert-only for the public. No SELECT/UPDATE/DELETE policies => those are denied.
DROP POLICY IF EXISTS leads_public_insert ON public.leads;
CREATE POLICY leads_public_insert ON public.leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Lock table privileges to match: insert only for the public roles.
REVOKE ALL ON public.leads FROM anon, authenticated;
GRANT INSERT ON public.leads TO anon, authenticated;