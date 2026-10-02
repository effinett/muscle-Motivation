-- PUBLIC-REPOSITORY VARIANT of migration 20260920231151.
-- Identical to the migration applied in production except for ONE line: the
-- platform owner account id is read from the session setting
-- mm.platform_owner_id instead of being written here. Before replaying, supply it
-- from private recovery material:  SET mm.platform_owner_id = '<owner uuid>';
-- If it is not set, this migration fails immediately (fail-closed).
-- The exact applied text (md5 0fed9f100484e2bba0273e511d6e7a48) is kept in the private recovery archive.
-- MM-VARIANT-HEADER-END
-- Phase 4.3.9B — CP3c. Bodyweight Foundations as a HIDDEN DRAFT.
-- Additive only: 3 Routines (is_platform, visibility='private') + 1 Program
-- (status='draft') + 3 program_routines links. No existing row is modified.
-- Creates no purchase, entitlement, enrolment, ownership or profile state.
DO $$
DECLARE
  k_prog  constant uuid := 'e8c5a1f6-5d74-4bc9-8ea5-4a7c1b9d65d8';
  k_ra    constant uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_rb    constant uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_rc    constant uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  k_la    constant uuid := 'f9d6b2a7-6e85-4cda-9fb6-5b8d2cae76e9';
  k_lb    constant uuid := '0ae7c3b8-7f96-4deb-8ac7-6c9e3dbf87fa';
  k_lc    constant uuid := '1bf8d4c9-80a7-4efc-9bd8-7daf4ecf980b';
  k_owner constant uuid := current_setting('mm.platform_owner_id')::uuid;
  v_state text;
  v_ids   int;
  v_slug  int;
  v_n     int;
  v_diff  int;
BEGIN
  -- Dependency-safe, consistent lock order.
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  ----------------------------------------------------------------------------
  -- Expected records, defined ONCE. Every non-clock stored column is pinned,
  -- including those expected to be NULL or at their default.
  ----------------------------------------------------------------------------
  CREATE TEMP TABLE _cp3c_routine_exp (
    id uuid, user_id uuid, name text, exercises jsonb, source_program_slug text,
    times_used int, last_used_at timestamptz, sort_order int, description text,
    goal text, difficulty text, tags text[], is_platform boolean,
    visibility text, source_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _cp3c_routine_exp VALUES
  (k_ra, k_owner, 'Full Body A',
   '[{"name":"Bodyweight Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"97501496-7f81-4552-82ab-d3f326b8ff06"},{"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Push-Up","sets":2,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap to choose Knee Push-Up before logging sets. Swap applies to this workout only — repeat it next session.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Side Plank","sets":2,"reps_low":20,"reps_high":35,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_rb, k_owner, 'Full Body B',
   '[{"name":"Push-Up","sets":4,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap to choose Knee Push-Up before logging sets. Swap applies to this workout only — repeat it next session.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Pike Push-Up","sets":3,"reps_low":6,"reps_high":10,"notes":"To regress, raise your hands or shorten the range. Do not switch to Knee Push-Up — it trains a different pattern.","rest_sec":75,"exercise_id":"b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34"},{"name":"Superman","sets":3,"reps_low":10,"reps_high":12,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bird Dog","sets":2,"reps_low":8,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_rc, k_owner, 'Full Body C',
   '[{"name":"Glute Bridge","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Wall Sit","sets":2,"reps_low":30,"reps_high":45,"notes":"Hold time in seconds.","rest_sec":60,"exercise_id":"7948f9c4-2ec1-432b-ad79-7f27c5961577"},{"name":"Superman","sets":2,"reps_low":10,"reps_high":12,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Mountain Climber","sets":2,"reps_low":30,"reps_high":30,"notes":"Work time in seconds.","rest_sec":45,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"Russian Twist","sets":2,"reps_low":12,"reps_high":16,"notes":"Reps are total, not per side.","rest_sec":45,"exercise_id":"e4015387-bed0-43e2-9129-4ca3c2b67414"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL);

  CREATE TEMP TABLE _cp3c_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    status text, sort_order int, page_path text) ON COMMIT DROP;

  INSERT INTO _cp3c_program_exp VALUES
  (k_prog, 'bodyweight_foundations', 'Bodyweight Foundations',
   'An equipment-free strength foundation focused on legs, pushing, core, and '
   'training consistency. It does not replace balanced resistance training with '
   'pulling movements.',
   'muscle', 'Beginner – Intermediate', 8, 3, 'Bodyweight',
   true, false, 'draft', 4, 'program-bodyweight.html');

  CREATE TEMP TABLE _cp3c_link_exp (
    id uuid, program_id uuid, routine_id uuid, session_key text,
    sort_order int, legacy_program_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _cp3c_link_exp VALUES
  (k_la, k_prog, k_ra, 'full_a', 1, NULL),
  (k_lb, k_prog, k_rb, 'full_b', 2, NULL),
  (k_lc, k_prog, k_rc, 'full_c', 3, NULL);

  ----------------------------------------------------------------------------
  -- Referential preconditions
  ----------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = k_owner) THEN
    RAISE EXCEPTION 'ABORT: platform owner account missing';
  END IF;

  IF (SELECT count(*) FROM public.exercises) <> 144 THEN
    RAISE EXCEPTION 'ABORT: exercise catalog is not 144 rows';
  END IF;

  -- 16 prescription entries, each the canonical 7-key shape.
  SELECT count(*) INTO v_n
    FROM _cp3c_routine_exp r, jsonb_array_elements(r.exercises) x;
  IF v_n <> 16 THEN
    RAISE EXCEPTION 'ABORT: expected 16 prescription entries, found %', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM _cp3c_routine_exp r, jsonb_array_elements(r.exercises) x
              WHERE NOT (x ?& array['name','sets','reps_low','reps_high',
                                    'notes','rest_sec','exercise_id'])
                 OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 7) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is not the canonical 7-key shape';
  END IF;

  -- 14 distinct exercise ids, every one active and equipment-free. This is
  -- also the body/floor/wall contract: nothing requiring equipment can pass.
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id
      FROM _cp3c_routine_exp r, jsonb_array_elements(r.exercises) x) q;
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'ABORT: expected 14 distinct exercise ids, found %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id
      FROM _cp3c_routine_exp r, jsonb_array_elements(r.exercises) x) q
    JOIN public.exercises e
      ON e.id = q.id AND e.is_active AND e.equipment = 'Bodyweight';
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'ABORT: only % of 14 prescribed exercises are active and Bodyweight', v_n;
  END IF;

  ----------------------------------------------------------------------------
  -- Exhaustive state machine. No shared permissive branch.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_ids FROM (
    SELECT id FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc)
    UNION ALL SELECT id FROM public.programs         WHERE id = k_prog
    UNION ALL SELECT id FROM public.program_routines WHERE id IN (k_la,k_lb,k_lc)
    UNION ALL SELECT id FROM public.exercises        WHERE id IN
      (k_prog,k_ra,k_rb,k_rc,k_la,k_lb,k_lc)) c;

  SELECT count(*) INTO v_slug FROM public.programs WHERE slug = 'bodyweight_foundations';

  IF v_ids = 0 AND v_slug = 0 THEN
    v_state := 'fresh';
  ELSIF v_ids = 7 AND v_slug = 1 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: partial or conflicting state (id hits=%, slug rows=%)', v_ids, v_slug;
  END IF;

  IF v_state = 'fresh' THEN
    -- Dependency order: Routines, then Program, then the links needing both.
    INSERT INTO public.workout_templates
      (id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
       sort_order,description,goal,difficulty,tags,is_platform,visibility,
       source_workout_id)
    SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
           sort_order,description,goal,difficulty,tags,is_platform,visibility,
           source_workout_id FROM _cp3c_routine_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: inserted % Routines, expected 3', v_n; END IF;

    INSERT INTO public.programs
      (id,slug,name,description,goal,difficulty,duration_weeks,
       recommended_days_per_week,equipment_summary,included_with_membership,
       standalone_purchasable,status,sort_order,page_path)
    SELECT id,slug,name,description,goal,difficulty,duration_weeks,
           recommended_days_per_week,equipment_summary,included_with_membership,
           standalone_purchasable,status,sort_order,page_path
      FROM _cp3c_program_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: inserted % Programs, expected 1', v_n; END IF;

    INSERT INTO public.program_routines
      (id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id)
    SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
      FROM _cp3c_link_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: inserted % links, expected 3', v_n; END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Verification. Identical for the fresh and replay paths: the SAME expected
  -- relations, the SAME full predicates, executed once after the branch.
  ----------------------------------------------------------------------------
  -- Cardinality first: EXCEPT has set semantics and cannot see a duplicate.
  IF (SELECT count(*) FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc)) <> 3
    THEN RAISE EXCEPTION 'ABORT: expected exactly 3 Routine rows'; END IF;
  IF (SELECT count(*) FROM public.programs WHERE id = k_prog) <> 1
    THEN RAISE EXCEPTION 'ABORT: expected exactly 1 Program row'; END IF;
  IF (SELECT count(*) FROM public.program_routines WHERE program_id = k_prog) <> 3
    THEN RAISE EXCEPTION 'ABORT: expected exactly 3 links for this Program'; END IF;

  -- Symmetric difference over every non-clock stored column.
  SELECT count(*) INTO v_diff FROM (
    (SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc)
     EXCEPT SELECT * FROM _cp3c_routine_exp)
    UNION ALL
    (SELECT * FROM _cp3c_routine_exp
     EXCEPT
     SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine rows differ from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _cp3c_program_exp)
    UNION ALL
    (SELECT * FROM _cp3c_program_exp
     EXCEPT
     SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program row differs from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog
     EXCEPT SELECT * FROM _cp3c_link_exp)
    UNION ALL
    (SELECT * FROM _cp3c_link_exp
     EXCEPT
     SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: link rows differ from approved (% diffs)', v_diff; END IF;

  -- Timestamp invariants: never compared to a literal clock value.
  IF v_state = 'fresh' THEN
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
    THEN RAISE EXCEPTION 'ABORT: fresh insert must have updated_at = created_at'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
    THEN RAISE EXCEPTION 'ABORT: replay timestamp invariant violated'; END IF;
  END IF;

  -- Global counts: nothing outside this Program may have changed.
  IF (SELECT count(*) FROM public.programs) <> 4
     OR (SELECT count(*) FROM public.program_routines) <> 50
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 51
     OR (SELECT count(*) FROM public.exercises) <> 144
  THEN RAISE EXCEPTION 'ABORT: collateral row-count change detected'; END IF;

  RAISE NOTICE 'phase_439c_cp3c_bodyweight_foundations_program: state=%', v_state;
END $$;