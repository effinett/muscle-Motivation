-- Muscle Motivation — baseline of objects created BEFORE migration tracking began
-- (project created 2026-05-06; first tracked migration 20260609175932).
--
-- These four objects exist in production but are created by none of the 64
-- tracked migrations, so replaying the migrations alone cannot rebuild them:
--   1. public.rls_auto_enable()      event-trigger function
--   2. event trigger ensure_rls       (auto-enables RLS on new public tables)
--   3. public.profiles                table, policies
--   4. public.handle_new_user()       + trigger on_auth_user_created on auth.users
--
-- Reconstructed 2026-10-01 from the production catalog (read-only) as of their
-- state BEFORE the first tracked migration: later migrations add profiles
-- columns (active_program, goal_weight_lbs, training_experience, gym_access),
-- profiles CHECK constraints, the stripe-guard trigger, handle_new_user's
-- search_path, and EXECUTE revokes — those are left to the migrations.
--
-- Apply ONCE, before the first migration, on a fresh Supabase project.
-- Idempotent where Postgres allows. Not tracked in supabase_migrations.

-- 1. Event-trigger function (definition exactly as in production)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- 2. Event trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;

-- 3. profiles (pre-migration column set, in production column order)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid NOT NULL,
  full_name            text,
  age                  integer,
  gender               text,
  height_cm            numeric,
  weight_kg            numeric,
  goal_type            text,
  goal_calories        integer,
  goal_protein         integer,
  goal_steps           integer,
  goal_water           numeric,
  goal_sleep           numeric,
  tier                 text DEFAULT 'free'::text,
  stripe_customer_id   text,
  created_at           timestamp with time zone DEFAULT now(),
  updated_at           timestamp with time zone DEFAULT now(),
  weight_lbs           numeric,
  body_fat_pct         numeric,
  goal                 text,
  activity_level       numeric,
  training_days        integer,
  timeline             text,
  maintenance_calories integer,
  target_calories      integer,
  protein_target       integer,
  fat_target           integer,
  carb_target          integer,
  training_split       text,
  goal_summary         text,
  onboarding_complete  boolean DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 4. Sign-up trigger: create a profile row for every new auth user.
--    (Migration 20260609181216 later pins search_path = '' and revokes EXECUTE.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, full_name, onboarding_complete)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
