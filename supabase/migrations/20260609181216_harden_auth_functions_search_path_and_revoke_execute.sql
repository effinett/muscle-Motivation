
-- Pin search_path on the signup trigger
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- Remove REST/RPC exposure from both special-purpose functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user()  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()  FROM public, anon, authenticated;
