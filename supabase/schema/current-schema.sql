-- Muscle Motivation — current database structure snapshot (schema only, NO data).
-- Covers schema "public" (tables, columns, constraints, indexes, RLS, policies,
-- functions, triggers, grants, comments), the auth.users sign-up trigger and the
-- ensure_rls event trigger.
-- Generated from a throwaway rebuild verified IDENTICAL to production by catalog
-- fingerprint (Checkpoint 3B, 2026-10-01). Target: a NEW, empty Supabase project
-- (Supabase provides roles, the auth schema and extensions itself).
-- Contains no rows, no users, no secrets.
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ── Functions ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_fav_custom_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.user_exercise_id is not null then
    if not exists (
      select 1 from public.user_exercises ue
      where ue.id = new.user_exercise_id and ue.user_id = new.user_id
    ) then
      raise exception 'user_exercise_id % is not owned by user %', new.user_exercise_id, new.user_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_pr_custom_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.user_exercise_id is not null then
    if not exists (
      select 1 from public.user_exercises ue
      where ue.id = new.user_exercise_id and ue.user_id = new.user_id
    ) then
      raise exception 'user_exercise_id % is not owned by user %', new.user_exercise_id, new.user_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_we_custom_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.user_exercise_id is not null then
    if not exists (
      select 1 from public.user_exercises ue
      join public.workouts w on w.id = new.workout_id
      where ue.id = new.user_exercise_id and ue.user_id = w.user_id
    ) then
      raise exception 'user_exercise_id % is not owned by the workout owner', new.user_exercise_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.protect_stripe_customer_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

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

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ── Tables ─────────────────────────────────────────────────
CREATE TABLE public."ai_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "route" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."body_fat_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "body_fat_pct" numeric NOT NULL,
  "logged_on" date NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."body_weight_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "weight_lbs" numeric NOT NULL,
  "logged_on" date DEFAULT CURRENT_DATE NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."exercises" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "equipment" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "aliases" text[] DEFAULT '{}'::text[],
  "primary_muscle" text NOT NULL,
  "secondary_muscles" text[] DEFAULT '{}'::text[],
  "movement_pattern" text,
  "force_type" text,
  "difficulty" text,
  "is_bodyweight" boolean DEFAULT false,
  "is_unilateral" boolean DEFAULT false,
  "default_unit" text DEFAULT 'lb'::text,
  "tracking_type" text DEFAULT 'weight_reps'::text,
  "instructions" text,
  "tips" text,
  "is_active" boolean DEFAULT true,
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."food_corrections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "raw_query" text,
  "norm_query" text NOT NULL,
  "intent_key" text,
  "incorrect_key" text,
  "corrected_key" text NOT NULL,
  "incorrect_meta" jsonb,
  "corrected_meta" jsonb,
  "source_surface" text,
  "provenance" text,
  "confidence_before" text,
  "ambiguity" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reinforcement_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."food_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "food_id" uuid,
  "name" text NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "meal" text NOT NULL,
  "servings" numeric DEFAULT 1 NOT NULL,
  "calories" numeric,
  "protein" numeric,
  "carbs" numeric,
  "fat" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "brand" text,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "usda_fdc_id" text,
  "serving_description" text,
  "serving_amount" numeric,
  "grams" numeric,
  "fiber" numeric,
  "sugar" numeric,
  "raw_source_data" jsonb,
  "serving_unit" text,
  "gtin_upc" text
);
CREATE TABLE public."foods" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "default_calories" numeric,
  "default_protein" numeric,
  "default_carbs" numeric,
  "default_fat" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "brand" text,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "usda_fdc_id" text,
  "serving_description" text,
  "default_fiber" numeric,
  "default_sugar" numeric
);
CREATE TABLE public."funnel_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event" text NOT NULL,
  "funnel_id" text NOT NULL,
  "route" text,
  "detail" text,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."leads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."measurement_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "logged_on" date NOT NULL,
  "waist_in" numeric,
  "neck_in" numeric,
  "chest_in" numeric,
  "hips_in" numeric,
  "arm_in" numeric,
  "thigh_in" numeric,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."personal_records" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "exercise_name" text NOT NULL,
  "best_weight" numeric,
  "best_reps" integer,
  "best_volume" numeric,
  "best_estimated_1rm" numeric,
  "source_workout_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "exercise_id" uuid,
  "user_exercise_id" uuid
);
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "full_name" text,
  "age" integer,
  "gender" text,
  "height_cm" numeric,
  "weight_kg" numeric,
  "goal_type" text,
  "goal_calories" integer,
  "goal_protein" integer,
  "goal_steps" integer,
  "goal_water" numeric,
  "goal_sleep" numeric,
  "tier" text DEFAULT 'free'::text,
  "stripe_customer_id" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "weight_lbs" numeric,
  "body_fat_pct" numeric,
  "goal" text,
  "activity_level" numeric,
  "training_days" integer,
  "timeline" text,
  "maintenance_calories" integer,
  "target_calories" integer,
  "protein_target" integer,
  "fat_target" integer,
  "carb_target" integer,
  "training_split" text,
  "goal_summary" text,
  "onboarding_complete" boolean DEFAULT false,
  "active_program" text,
  "goal_weight_lbs" numeric,
  "training_experience" text,
  "gym_access" text
);
CREATE TABLE public."program_routines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid NOT NULL,
  "routine_id" uuid NOT NULL,
  "session_key" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "legacy_program_workout_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."program_workouts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "program_slug" text NOT NULL,
  "session_key" text NOT NULL,
  "session_name" text NOT NULL,
  "exercises" jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."programs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "goal" text,
  "difficulty" text,
  "duration_weeks" integer,
  "recommended_days_per_week" integer,
  "equipment_summary" text,
  "included_with_membership" boolean DEFAULT false NOT NULL,
  "standalone_purchasable" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "page_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."purchases" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "product" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "stripe_session_id" text,
  "stripe_subscription_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "current_period_end" timestamp with time zone,
  "stripe_payment_intent_id" text,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."saved_meals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "items" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_exercise_favorites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "exercise_id" uuid,
  "user_exercise_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_exercises" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "normalized_name" text GENERATED ALWAYS AS (btrim(regexp_replace(regexp_replace(lower(name), '[''`’‘]'::text, ''::text, 'g'::text), '[^a-z0-9]+'::text, ' '::text, 'g'::text))) STORED,
  "archived_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."user_food_favorites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "food_key" text NOT NULL,
  "food_name" text NOT NULL,
  "brand_name" text,
  "source" text,
  "fdc_id" bigint,
  "gtin_upc" text,
  "serving_unit" text,
  "serving_qty" numeric,
  "calories" numeric,
  "protein_g" numeric,
  "carbs_g" numeric,
  "fat_g" numeric,
  "raw_food" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_programs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "program_slug" text NOT NULL,
  "training_days" integer DEFAULT 3 NOT NULL,
  "schedule_keys" text[] NOT NULL,
  "current_index" integer DEFAULT 0 NOT NULL,
  "started_at" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."workout_exercises" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workout_id" uuid NOT NULL,
  "exercise_name" text NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "exercise_id" uuid,
  "user_exercise_id" uuid
);
CREATE TABLE public."workout_sets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workout_exercise_id" uuid NOT NULL,
  "set_number" integer NOT NULL,
  "weight_lbs" numeric,
  "reps" integer,
  "completed" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_warmup" boolean DEFAULT false
);
CREATE TABLE public."workout_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_program_slug" text,
  "times_used" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "description" text,
  "goal" text,
  "difficulty" text,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_platform" boolean DEFAULT false NOT NULL,
  "visibility" text DEFAULT 'private'::text NOT NULL,
  "source_workout_id" uuid
);
CREATE TABLE public."workouts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "notes" text,
  "duration_minutes" integer,
  "completed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "program_slug" text,
  "session_key" text,
  "mode" text,
  "template_id" uuid
);

-- ── Primary keys, unique, check and exclusion constraints ────
ALTER TABLE public."ai_usage" ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."body_fat_logs" ADD CONSTRAINT "body_fat_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."body_fat_logs" ADD CONSTRAINT "body_fat_logs_user_day_key" UNIQUE (user_id, logged_on);
ALTER TABLE public."body_fat_logs" ADD CONSTRAINT "body_fat_logs_body_fat_pct_check" CHECK (((body_fat_pct > (0)::numeric) AND (body_fat_pct < (75)::numeric)));
ALTER TABLE public."body_weight_logs" ADD CONSTRAINT "body_weight_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."exercises" ADD CONSTRAINT "exercises_pkey" PRIMARY KEY (id);
ALTER TABLE public."exercises" ADD CONSTRAINT "exercises_name_key" UNIQUE (name);
ALTER TABLE public."food_corrections" ADD CONSTRAINT "food_corrections_pkey" PRIMARY KEY (id);
ALTER TABLE public."food_corrections" ADD CONSTRAINT "food_corrections_user_query_food_uniq" UNIQUE (user_id, norm_query, corrected_key);
ALTER TABLE public."food_corrections" ADD CONSTRAINT "food_corrections_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'deactivated'::text])));
ALTER TABLE public."food_logs" ADD CONSTRAINT "food_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."food_logs" ADD CONSTRAINT "food_logs_meal_check" CHECK ((meal = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text])));
ALTER TABLE public."foods" ADD CONSTRAINT "foods_pkey" PRIMARY KEY (id);
ALTER TABLE public."funnel_events" ADD CONSTRAINT "funnel_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_email_key" UNIQUE (email);
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_user_day_key" UNIQUE (user_id, logged_on);
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_arm_in_check" CHECK (((arm_in IS NULL) OR ((arm_in > (0)::numeric) AND (arm_in < (200)::numeric))));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_chest_in_check" CHECK (((chest_in IS NULL) OR ((chest_in > (0)::numeric) AND (chest_in < (200)::numeric))));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_hips_in_check" CHECK (((hips_in IS NULL) OR ((hips_in > (0)::numeric) AND (hips_in < (200)::numeric))));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_neck_in_check" CHECK (((neck_in IS NULL) OR ((neck_in > (0)::numeric) AND (neck_in < (200)::numeric))));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_not_empty" CHECK ((COALESCE(waist_in, neck_in, chest_in, hips_in, arm_in, thigh_in) IS NOT NULL));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_thigh_in_check" CHECK (((thigh_in IS NULL) OR ((thigh_in > (0)::numeric) AND (thigh_in < (200)::numeric))));
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_waist_in_check" CHECK (((waist_in IS NULL) OR ((waist_in > (0)::numeric) AND (waist_in < (200)::numeric))));
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_pkey" PRIMARY KEY (id);
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_user_canon_uniq" UNIQUE (user_id, exercise_id);
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_user_custom_uniq" UNIQUE (user_id, user_exercise_id);
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_identity_excl" CHECK (((exercise_id IS NULL) OR (user_exercise_id IS NULL)));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_gym_access_check" CHECK (((gym_access IS NULL) OR (gym_access = ANY (ARRAY['full_gym'::text, 'home_basic'::text, 'bodyweight'::text]))));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_training_experience_check" CHECK (((training_experience IS NULL) OR (training_experience = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))));
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_pkey" PRIMARY KEY (id);
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_legacy_uniq" UNIQUE (legacy_program_workout_id);
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_program_session_uniq" UNIQUE (program_id, session_key);
ALTER TABLE public."program_workouts" ADD CONSTRAINT "program_workouts_pkey" PRIMARY KEY (id);
ALTER TABLE public."program_workouts" ADD CONSTRAINT "program_workouts_program_slug_session_key_key" UNIQUE (program_slug, session_key);
ALTER TABLE public."programs" ADD CONSTRAINT "programs_pkey" PRIMARY KEY (id);
ALTER TABLE public."programs" ADD CONSTRAINT "programs_slug_key" UNIQUE (slug);
ALTER TABLE public."programs" ADD CONSTRAINT "programs_days_check" CHECK (((recommended_days_per_week IS NULL) OR ((recommended_days_per_week >= 1) AND (recommended_days_per_week <= 7))));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_duration_check" CHECK (((duration_weeks IS NULL) OR (duration_weeks > 0)));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_goal_check" CHECK (((goal IS NULL) OR (goal = ANY (ARRAY['fatloss'::text, 'recomp'::text, 'muscle'::text]))));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text])));
ALTER TABLE public."purchases" ADD CONSTRAINT "purchases_pkey" PRIMARY KEY (id);
ALTER TABLE public."purchases" ADD CONSTRAINT "purchases_product_check" CHECK ((product = ANY (ARRAY['fat_loss_blueprint'::text, 'muscle_gain'::text, 'glute_builder'::text, 'ai_membership'::text])));
ALTER TABLE public."purchases" ADD CONSTRAINT "purchases_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'refunded'::text, 'past_due'::text])));
ALTER TABLE public."saved_meals" ADD CONSTRAINT "saved_meals_pkey" PRIMARY KEY (id);
ALTER TABLE public."saved_meals" ADD CONSTRAINT "saved_meals_user_name_key" UNIQUE (user_id, name);
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_canonical_uq" UNIQUE (user_id, exercise_id);
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_custom_uq" UNIQUE (user_id, user_exercise_id);
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_identity_xor" CHECK ((((exercise_id IS NOT NULL) AND (user_exercise_id IS NULL)) OR ((exercise_id IS NULL) AND (user_exercise_id IS NOT NULL))));
ALTER TABLE public."user_exercises" ADD CONSTRAINT "user_exercises_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_food_favorites" ADD CONSTRAINT "user_food_favorites_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_food_favorites" ADD CONSTRAINT "user_food_favorites_user_id_food_key_key" UNIQUE (user_id, food_key);
ALTER TABLE public."user_programs" ADD CONSTRAINT "user_programs_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_programs" ADD CONSTRAINT "user_programs_user_id_program_slug_key" UNIQUE (user_id, program_slug);
ALTER TABLE public."workout_exercises" ADD CONSTRAINT "workout_exercises_pkey" PRIMARY KEY (id);
ALTER TABLE public."workout_exercises" ADD CONSTRAINT "workout_exercises_identity_excl" CHECK (((exercise_id IS NULL) OR (user_exercise_id IS NULL)));
ALTER TABLE public."workout_sets" ADD CONSTRAINT "workout_sets_pkey" PRIMARY KEY (id);
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_pkey" PRIMARY KEY (id);
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_goal_check" CHECK (((goal IS NULL) OR (goal = ANY (ARRAY['fatloss'::text, 'recomp'::text, 'muscle'::text]))));
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_publish_requires_platform" CHECK (((visibility = 'private'::text) OR (is_platform = true)));
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_visibility_check" CHECK ((visibility = ANY (ARRAY['private'::text, 'published'::text])));
ALTER TABLE public."workouts" ADD CONSTRAINT "workouts_pkey" PRIMARY KEY (id);

-- ── Indexes (not backing a constraint) ─────────────────────
CREATE INDEX ai_usage_user_created_idx ON public.ai_usage USING btree (user_id, created_at DESC);
CREATE INDEX body_fat_logs_user_date_idx ON public.body_fat_logs USING btree (user_id, logged_on DESC);
CREATE INDEX body_weight_logs_user_date_idx ON public.body_weight_logs USING btree (user_id, logged_on DESC);
CREATE UNIQUE INDEX body_weight_logs_user_day_uidx ON public.body_weight_logs USING btree (user_id, logged_on);
CREATE INDEX food_corrections_user_intent_idx ON public.food_corrections USING btree (user_id, intent_key) WHERE ((status = 'active'::text) AND (intent_key IS NOT NULL));
CREATE INDEX food_corrections_user_normq_idx ON public.food_corrections USING btree (user_id, norm_query) WHERE (status = 'active'::text);
CREATE INDEX food_logs_user_date_idx ON public.food_logs USING btree (user_id, date);
CREATE INDEX food_logs_user_fdc_idx ON public.food_logs USING btree (user_id, usda_fdc_id) WHERE (usda_fdc_id IS NOT NULL);
CREATE UNIQUE INDEX foods_user_name_uidx ON public.foods USING btree (user_id, name);
CREATE UNIQUE INDEX foods_user_source_fdc_uidx ON public.foods USING btree (user_id, usda_fdc_id) WHERE ((source = 'usda'::text) AND (usda_fdc_id IS NOT NULL));
CREATE INDEX funnel_events_event_created_idx ON public.funnel_events USING btree (event, created_at DESC);
CREATE INDEX funnel_events_funnel_idx ON public.funnel_events USING btree (funnel_id);
CREATE INDEX measurement_logs_user_date_idx ON public.measurement_logs USING btree (user_id, logged_on DESC);
CREATE INDEX personal_records_user_idx ON public.personal_records USING btree (user_id, exercise_name);
CREATE UNIQUE INDEX personal_records_user_legacy_uidx ON public.personal_records USING btree (user_id, exercise_name) WHERE ((exercise_id IS NULL) AND (user_exercise_id IS NULL));
CREATE INDEX purchases_payment_intent_idx ON public.purchases USING btree (stripe_payment_intent_id);
CREATE UNIQUE INDEX purchases_stripe_session_id_uniq ON public.purchases USING btree (stripe_session_id);
CREATE INDEX purchases_stripe_subscription_id_idx ON public.purchases USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);
CREATE INDEX purchases_user_id_idx ON public.purchases USING btree (user_id);
CREATE INDEX user_exercise_favorites_user_created_idx ON public.user_exercise_favorites USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX user_exercises_active_norm_uidx ON public.user_exercises USING btree (user_id, normalized_name) WHERE (archived_at IS NULL);
CREATE INDEX user_exercises_user_norm_idx ON public.user_exercises USING btree (user_id, normalized_name);
CREATE INDEX user_food_favorites_user_created_idx ON public.user_food_favorites USING btree (user_id, created_at DESC);
CREATE INDEX workout_exercises_exercise_id_idx ON public.workout_exercises USING btree (exercise_id);
CREATE INDEX workout_exercises_user_exercise_id_idx ON public.workout_exercises USING btree (user_exercise_id) WHERE (user_exercise_id IS NOT NULL);
CREATE INDEX workout_templates_user_idx ON public.workout_templates USING btree (user_id, sort_order, created_at);

-- ── Foreign keys ───────────────────────────────────────────
ALTER TABLE public."ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."body_fat_logs" ADD CONSTRAINT "body_fat_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."body_weight_logs" ADD CONSTRAINT "body_weight_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."food_corrections" ADD CONSTRAINT "food_corrections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."food_logs" ADD CONSTRAINT "food_logs_food_id_fkey" FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE SET NULL;
ALTER TABLE public."food_logs" ADD CONSTRAINT "food_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."foods" ADD CONSTRAINT "foods_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."measurement_logs" ADD CONSTRAINT "measurement_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL;
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_user_exercise_id_fkey" FOREIGN KEY (user_exercise_id) REFERENCES public.user_exercises(id) ON DELETE SET NULL;
ALTER TABLE public."personal_records" ADD CONSTRAINT "personal_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_legacy_program_workout_id_fkey" FOREIGN KEY (legacy_program_workout_id) REFERENCES public.program_workouts(id) ON DELETE SET NULL;
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE public."program_routines" ADD CONSTRAINT "program_routines_routine_id_fkey" FOREIGN KEY (routine_id) REFERENCES public.workout_templates(id) ON DELETE RESTRICT;
ALTER TABLE public."purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."saved_meals" ADD CONSTRAINT "saved_meals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_user_exercise_id_fkey" FOREIGN KEY (user_exercise_id) REFERENCES public.user_exercises(id) ON DELETE CASCADE;
ALTER TABLE public."user_exercise_favorites" ADD CONSTRAINT "user_exercise_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_exercises" ADD CONSTRAINT "user_exercises_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_food_favorites" ADD CONSTRAINT "user_food_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_programs" ADD CONSTRAINT "user_programs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL;
ALTER TABLE public."workout_exercises" ADD CONSTRAINT "workout_exercises_user_exercise_id_fkey" FOREIGN KEY (user_exercise_id) REFERENCES public.user_exercises(id) ON DELETE SET NULL;
ALTER TABLE public."workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;
ALTER TABLE public."workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_id_fkey" FOREIGN KEY (workout_exercise_id) REFERENCES public.workout_exercises(id) ON DELETE CASCADE;
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_source_workout_id_fkey" FOREIGN KEY (source_workout_id) REFERENCES public.workouts(id) ON DELETE SET NULL;
ALTER TABLE public."workout_templates" ADD CONSTRAINT "workout_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."workouts" ADD CONSTRAINT "workouts_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.workout_templates(id) ON DELETE SET NULL;
ALTER TABLE public."workouts" ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── Row-level security, comments, table and column grants ──
ALTER TABLE public."ai_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ai_usage" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."ai_usage" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."ai_usage" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."ai_usage" TO "service_role";
ALTER TABLE public."body_fat_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."body_fat_logs" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_fat_logs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_fat_logs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_fat_logs" TO "service_role";
ALTER TABLE public."body_weight_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."body_weight_logs" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_weight_logs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_weight_logs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."body_weight_logs" TO "service_role";
ALTER TABLE public."exercises" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."exercises" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."exercises" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."exercises" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."exercises" TO "service_role";
ALTER TABLE public."food_corrections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."food_corrections" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_corrections" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_corrections" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_corrections" TO "service_role";
ALTER TABLE public."food_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."food_logs" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_logs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_logs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."food_logs" TO "service_role";
ALTER TABLE public."foods" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."foods" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."foods" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."foods" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."foods" TO "service_role";
ALTER TABLE public."funnel_events" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."funnel_events" IS 'Phase 4.3.7G. Append-only anonymous funnel telemetry. Contains NO user id and no profile data by construction. Write-only from clients: INSERT policy only, no SELECT policy. Retention intent 180 days, no automatic purge.';
COMMENT ON COLUMN public."funnel_events"."funnel_id" IS 'Opaque ephemeral id from sessionStorage, minted at onboarding start and cleared with the draft. Never persisted to profiles and never joined to a user.';
COMMENT ON COLUMN public."funnel_events"."detail" IS 'ONE categorical value, allowlisted PER EVENT by the insert policy.';
REVOKE ALL ON TABLE public."funnel_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."funnel_events" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."funnel_events" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."funnel_events" TO "service_role";
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."leads" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE public."leads" TO "anon";
GRANT INSERT ON TABLE public."leads" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."leads" TO "service_role";
ALTER TABLE public."measurement_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."measurement_logs" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."measurement_logs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."measurement_logs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."measurement_logs" TO "service_role";
ALTER TABLE public."personal_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."personal_records" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."personal_records" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."personal_records" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."personal_records" TO "service_role";
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN public."profiles"."training_experience" IS 'Phase 4.3.7A. Stated training experience: beginner|intermediate|advanced. NULL = not collected (legacy or partial onboarding); personalization treats NULL as no signal, never a mismatch.';
COMMENT ON COLUMN public."profiles"."gym_access" IS 'Phase 4.3.7A. Stated equipment access: full_gym|home_basic|bodyweight. NULL = not collected. Personalization treats NULL as no signal.';
REVOKE ALL ON TABLE public."profiles" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "service_role";
ALTER TABLE public."program_routines" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."program_routines" IS 'Phase 4.3.6 CP8. Program ↔ canonical Routine placement. Ordering lives here so a Routine can be reused across Programs. session_key is the linkage that schedules.js and program execution key on. Routine FK is ON DELETE RESTRICT so a live Program cannot lose its structure silently.';
REVOKE ALL ON TABLE public."program_routines" FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."program_routines" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."program_routines" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."program_routines" TO "service_role";
ALTER TABLE public."program_workouts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."program_workouts" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."program_workouts" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."program_workouts" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."program_workouts" TO "service_role";
ALTER TABLE public."programs" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."programs" IS 'Phase 4.3.6 CP1a. Canonical Program catalog: identity + browse metadata only. Session prescriptions stay in program_workouts (entitlement-gated). recommended_days_per_week is a MARKETING recommendation; schedules.js remains authoritative for execution schedules. Price stays authoritative in Stripe. A catalog row is NOT authorization to sell: purchases.product CHECK governs that.';
REVOKE ALL ON TABLE public."programs" FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."programs" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."programs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."programs" TO "service_role";
ALTER TABLE public."purchases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."purchases" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."purchases" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."purchases" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."purchases" TO "service_role";
ALTER TABLE public."saved_meals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."saved_meals" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."saved_meals" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."saved_meals" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."saved_meals" TO "service_role";
ALTER TABLE public."user_exercise_favorites" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."user_exercise_favorites" IS 'Phase 4.3.6J. Explicit per-user exercise favorites, keyed by stable identity (canonical exercises.id XOR user_exercises.id). Private: owner-scoped RLS plus a same-user ownership trigger for custom references. Recents are derived from workout history and are deliberately NOT stored here.';
REVOKE ALL ON TABLE public."user_exercise_favorites" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercise_favorites" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercise_favorites" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercise_favorites" TO "service_role";
ALTER TABLE public."user_exercises" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user_exercises" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercises" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercises" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_exercises" TO "service_role";
ALTER TABLE public."user_food_favorites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user_food_favorites" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_food_favorites" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_food_favorites" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_food_favorites" TO "service_role";
ALTER TABLE public."user_programs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user_programs" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_programs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_programs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_programs" TO "service_role";
ALTER TABLE public."workout_exercises" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workout_exercises" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_exercises" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_exercises" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_exercises" TO "service_role";
ALTER TABLE public."workout_sets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workout_sets" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_sets" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_sets" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_sets" TO "service_role";
ALTER TABLE public."workout_templates" ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public."workout_templates" IS 'Phase 4.3.6 CP4. The canonical Routine entity, evolved additively from workout templates. is_platform + visibility are the security fields: a user-owned row can never be published (CHECK), and clients can never write a platform row (RLS). Lifecycle status arrives with CP6 publishing. The exercises JSONB contract is owned by routine-core.js (CP3).';
COMMENT ON COLUMN public."workout_templates"."source_workout_id" IS 'Phase 4.3.6 CP7. The completed workout a Routine was snapshotted from, or NULL. Provenance only — the Routine is an independent copy, never a live view. ON DELETE SET NULL so deleting history never deletes a Routine.';
REVOKE ALL ON TABLE public."workout_templates" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_templates" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_templates" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workout_templates" TO "service_role";
ALTER TABLE public."workouts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workouts" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workouts" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workouts" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."workouts" TO "service_role";

-- ── Policies ───────────────────────────────────────────────
CREATE POLICY "read own usage" ON public."ai_usage" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users delete own body fat logs" ON public."body_fat_logs" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own body fat logs" ON public."body_fat_logs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own body fat logs" ON public."body_fat_logs" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own body fat logs" ON public."body_fat_logs" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users delete own body weight logs" ON public."body_weight_logs" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own body weight logs" ON public."body_weight_logs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own body weight logs" ON public."body_weight_logs" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own body weight logs" ON public."body_weight_logs" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "exercises_select" ON public."exercises" AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY "Users delete own food corrections" ON public."food_corrections" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own food corrections" ON public."food_corrections" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own food corrections" ON public."food_corrections" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own food corrections" ON public."food_corrections" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users delete own food logs" ON public."food_logs" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own food logs" ON public."food_logs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own food logs" ON public."food_logs" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own food logs" ON public."food_logs" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users delete own foods" ON public."foods" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own foods" ON public."foods" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own foods" ON public."foods" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own foods" ON public."foods" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "funnel_events_public_insert" ON public."funnel_events" AS PERMISSIVE FOR INSERT TO "anon", "authenticated"
  WITH CHECK (((schema_version = 1) AND ((char_length(funnel_id) >= 8) AND (char_length(funnel_id) <= 24)) AND ((route IS NULL) OR (route = ANY (ARRAY['landing'::text, 'onboarding'::text, 'auth'::text, 'app'::text, 'other'::text]))) AND (((event = 'landing_cta_clicked'::text) AND (detail = ANY (ARRAY['hero'::text, 'create_account'::text]))) OR ((event = 'onboarding_started'::text) AND (detail = ANY (ARRAY['anonymous'::text, 'authenticated'::text]))) OR ((event = 'onboarding_step_completed'::text) AND (detail = ANY (ARRAY['1'::text, '2'::text, '3'::text, '4'::text]))) OR ((event = 'personalized_plan_viewed'::text) AND (detail = ANY (ARRAY['ready'::text, 'partial'::text, 'needs_input'::text]))) OR ((event = 'save_plan_clicked'::text) AND (detail IS NULL)) OR ((event = 'signup_completed'::text) AND (detail = ANY (ARRAY['email'::text, 'google'::text]))) OR ((event = 'onboarding_completed'::text) AND (detail = ANY (ARRAY['anonymous_claim'::text, 'authenticated_wizard'::text]))) OR ((event = 'onboarding_claim_failed'::text) AND (detail = ANY (ARRAY['compute'::text, 'merge_empty'::text, 'field_write'::text, 'flag_write'::text, 'confirm'::text]))))));
CREATE POLICY "leads_public_insert" ON public."leads" AS PERMISSIVE FOR INSERT TO "anon", "authenticated"
  WITH CHECK (((name IS NOT NULL) AND ((char_length(name) >= 1) AND (char_length(name) <= 200)) AND (email IS NOT NULL) AND ((char_length(email) >= 3) AND (char_length(email) <= 320)) AND (POSITION(('@'::text) IN (email)) > 1) AND (source IS NOT NULL) AND (char_length(source) <= 64)));
CREATE POLICY "Users delete own measurements" ON public."measurement_logs" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own measurements" ON public."measurement_logs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own measurements" ON public."measurement_logs" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own measurements" ON public."measurement_logs" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "personal_records_delete_own" ON public."personal_records" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "personal_records_insert_own" ON public."personal_records" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "personal_records_select_own" ON public."personal_records" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "personal_records_update_own" ON public."personal_records" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own profile" ON public."profiles" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));
CREATE POLICY "program_routines_read_entitled" ON public."program_routines" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.programs g
     JOIN public.purchases p ON (((p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::text, 'past_due'::text])))))
  WHERE ((g.id = program_routines.program_id) AND ((p.product = g.slug) OR ((p.product = 'ai_membership'::text) AND g.included_with_membership AND (g.status = 'published'::text)))))));
CREATE POLICY "program_workouts_read" ON public."program_workouts" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.purchases p
  WHERE ((p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::text, 'past_due'::text])) AND ((p.product = program_workouts.program_slug) OR ((p.product = 'ai_membership'::text) AND (EXISTS ( SELECT 1
           FROM public.programs g
          WHERE ((g.slug = program_workouts.program_slug) AND g.included_with_membership AND (g.status = 'published'::text))))))))));
CREATE POLICY "programs_read_published" ON public."programs" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((status = 'published'::text));
CREATE POLICY "programs_read_published_anon" ON public."programs" AS PERMISSIVE FOR SELECT TO "anon"
  USING ((status = 'published'::text));
CREATE POLICY "programs_read_purchased" ON public."programs" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.purchases p
  WHERE ((p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::text, 'past_due'::text])) AND (p.product = programs.slug)))));
CREATE POLICY "Users can view own purchases" ON public."purchases" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users delete own saved meals" ON public."saved_meals" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own saved meals" ON public."saved_meals" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own saved meals" ON public."saved_meals" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own saved meals" ON public."saved_meals" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_exercise_favorites_own" ON public."user_exercise_favorites" AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_exercises_own" ON public."user_exercises" AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users delete own food favorites" ON public."user_food_favorites" AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own food favorites" ON public."user_food_favorites" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users select own food favorites" ON public."user_food_favorites" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users update own food favorites" ON public."user_food_favorites" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_programs_own" ON public."user_programs" AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "workout_exercises_own" ON public."workout_exercises" AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))));
CREATE POLICY "workout_sets_own" ON public."workout_sets" AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (public.workout_exercises we
     JOIN public.workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = workout_sets.workout_exercise_id) AND (w.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_exercises we
     JOIN public.workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = workout_sets.workout_exercise_id) AND (w.user_id = auth.uid())))));
CREATE POLICY "workout_templates_delete" ON public."workout_templates" AS PERMISSIVE FOR DELETE TO "authenticated"
  USING (((auth.uid() = user_id) AND (is_platform = false)));
CREATE POLICY "workout_templates_insert" ON public."workout_templates" AS PERMISSIVE FOR INSERT TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND (is_platform = false) AND (visibility = 'private'::text)));
CREATE POLICY "workout_templates_select" ON public."workout_templates" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (((auth.uid() = user_id) OR ((is_platform = true) AND (visibility = 'published'::text) AND (EXISTS ( SELECT 1
   FROM ((public.program_routines pr
     JOIN public.programs g ON ((g.id = pr.program_id)))
     JOIN public.purchases p ON (((p.user_id = auth.uid()) AND (p.status = ANY (ARRAY['active'::text, 'past_due'::text])))))
  WHERE ((pr.routine_id = workout_templates.id) AND ((p.product = g.slug) OR ((p.product = 'ai_membership'::text) AND g.included_with_membership AND (g.status = 'published'::text)))))))));
CREATE POLICY "workout_templates_update" ON public."workout_templates" AS PERMISSIVE FOR UPDATE TO "authenticated"
  USING (((auth.uid() = user_id) AND (is_platform = false)))
  WITH CHECK (((auth.uid() = user_id) AND (is_platform = false) AND (visibility = 'private'::text)));
CREATE POLICY "workouts_own" ON public."workouts" AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

-- ── Function grants ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.enforce_fav_custom_owner() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_fav_custom_owner() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_fav_custom_owner() TO "anon";
GRANT EXECUTE ON FUNCTION public.enforce_fav_custom_owner() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.enforce_fav_custom_owner() TO "service_role";
REVOKE ALL ON FUNCTION public.enforce_pr_custom_owner() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_pr_custom_owner() TO "service_role";
REVOKE ALL ON FUNCTION public.enforce_we_custom_owner() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_we_custom_owner() TO "service_role";
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "service_role";
REVOKE ALL ON FUNCTION public.protect_stripe_customer_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_stripe_customer_id() TO "service_role";
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "service_role";
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "anon";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "service_role";

-- ── Triggers (public tables + auth.users sign-up trigger) ──
CREATE TRIGGER exercises_set_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER personal_records_custom_owner BEFORE INSERT OR UPDATE ON public.personal_records FOR EACH ROW EXECUTE FUNCTION public.enforce_pr_custom_owner();
CREATE TRIGGER trg_protect_stripe_customer_id BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_stripe_customer_id();
CREATE TRIGGER purchases_set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER user_exercise_favorites_custom_owner BEFORE INSERT OR UPDATE ON public.user_exercise_favorites FOR EACH ROW EXECUTE FUNCTION public.enforce_fav_custom_owner();
CREATE TRIGGER workout_exercises_custom_owner BEFORE INSERT OR UPDATE ON public.workout_exercises FOR EACH ROW EXECUTE FUNCTION public.enforce_we_custom_owner();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Event trigger (created last so it does not fire during this script) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;
