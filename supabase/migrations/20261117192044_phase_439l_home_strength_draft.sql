-- Phase 4.3.9-L — Home Strength as a HIDDEN DRAFT (1 of 6 catalog Programs).
-- Additive only: 4 Routines (is_platform, visibility='private') + 1 Program
-- (status='draft') + 4 program_routines links. No existing row is modified.
-- Creates no purchase, entitlement, enrolment, ownership, price or profile
-- state. Publishing is a separate, separately approved migration: until then
-- pcLoadCatalog (status='published' only) never returns this Program, so no
-- page, recommendation, card link or Train listing can show it.
--
-- Content: the approved Program Catalog Plan, "1 · Home Strength" (owner
-- decisions 2026-11-17). Session lists already ship in schedules.js (#113).
-- Access: included with membership; standalone_purchasable stays false until
-- prices and Stripe products are approved (individual purchase is TBD).
-- Owner is derived from Bodyweight Foundations Full Body A/B/C, so no account
-- id is written here and no session setting is needed.
DO $$
DECLARE
  k_prog   constant uuid := 'ed50e0e1-5280-4680-a730-2a6be2a46f0b';
  k_ra     constant uuid := '7ce33308-275a-49f8-bf69-fa97866bf0ac';
  k_rb     constant uuid := '0db8dde9-4182-49e1-af9b-4f105e39f0f6';
  k_rc     constant uuid := '5b40fa88-7a44-44ab-85c1-3292ba654011';
  k_rcc    constant uuid := '33b5ff59-1f1a-4093-bcf0-f4360219563d';
  k_la     constant uuid := '282d7a66-dc5c-4bbe-b78e-deee38a26b4f';
  k_lb     constant uuid := 'ced3db9a-8002-46fa-ad78-fb890b420392';
  k_lc     constant uuid := '48756bc0-670e-4b79-9c60-08a8dc0641cd';
  k_lcc    constant uuid := '1ba5bb83-1a74-4e0d-ab56-f699b0439aa7';
  -- Bodyweight Foundations Full Body A/B/C (migration 20260920231151).
  k_bf_ra  constant uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_bf_rb  constant uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_bf_rc  constant uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  v_owner  uuid;
  v_state  text;
  v_ids    int;
  v_slug   int;
  v_n      int;
  v_diff   int;
BEGIN
  -- Dependency-safe, consistent lock order (same as earlier Program migrations).
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  ----------------------------------------------------------------------------
  -- Owner: exactly one platform owner, taken from Full Body A/B/C.
  ----------------------------------------------------------------------------
  SELECT count(DISTINCT user_id) INTO v_n FROM public.workout_templates
   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc) AND is_platform;
  IF v_n <> 1 OR (SELECT count(*) FROM public.workout_templates
                   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc) AND is_platform) <> 3 THEN
    RAISE EXCEPTION 'ABORT: Bodyweight Foundations Full Body A/B/C missing or not one owner';
  END IF;
  SELECT DISTINCT user_id INTO v_owner FROM public.workout_templates
   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc);
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
    RAISE EXCEPTION 'ABORT: platform owner account missing';
  END IF;
  IF (SELECT count(DISTINCT user_id) FROM public.workout_templates WHERE is_platform) <> 1 THEN
    RAISE EXCEPTION 'ABORT: platform Routines have more than one owner';
  END IF;

  ----------------------------------------------------------------------------
  -- Expected records, defined ONCE. Every non-clock stored column is pinned.
  ----------------------------------------------------------------------------
  CREATE TEMP TABLE _hs_routine_exp (
    id uuid, user_id uuid, name text, exercises jsonb, source_program_slug text,
    times_used int, last_used_at timestamptz, sort_order int, description text,
    goal text, difficulty text, tags text[], is_platform boolean,
    visibility text, source_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _hs_routine_exp VALUES
  (k_ra, v_owner, 'Full Body A',
   '[{"name":"Goblet Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"72f1d568-5da2-4351-8bac-9656c99f3557"},{"name":"Dumbbell Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"6107df4c-5295-4268-9dc5-46e922ca9db9"},{"name":"Push-Up","sets":3,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Dumbbell Row","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Dumbbell Shoulder Press","sets":2,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac"},{"name":"Plank","sets":2,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds.","rest_sec":45,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_rb, v_owner, 'Full Body B',
   '[{"name":"Walking Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"ebfb4a3a-28b9-4093-bcb2-d14b1d61aa88"},{"name":"Single-Leg Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"38afdd22-387a-4b76-a895-e815ea24f28c"},{"name":"Band Chest Press","sets":3,"reps_low":10,"reps_high":15,"notes":"No door anchor? Wrap the band behind your upper back.","rest_sec":60,"exercise_id":"6d7b582c-02cd-4a69-9c4d-490c15a6abc2"},{"name":"Band Row","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2c6c689e-c443-4a2f-afc7-05aae25ff549"},{"name":"Lateral Raise","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Dead Bug","sets":2,"reps_low":8,"reps_high":12,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_rc, v_owner, 'Full Body C',
   '[{"name":"Dumbbell Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"889e224a-c534-48b4-a5f8-55d8bada6af3"},{"name":"Glute Bridge","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Push-Up","sets":3,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Dumbbell Row","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Bicep Curl","sets":2,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"a3882f86-1868-4143-8a8b-494880366993"},{"name":"Overhead Tricep Extension","sets":2,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"1b4b6bf8-83df-4c8e-836a-48f1fea82d8d"},{"name":"Side Plank","sets":2,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_rcc, v_owner, 'Conditioning & Core',
   '[{"name":"Mountain Climber","sets":3,"reps_low":20,"reps_high":40,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"Step Jack","sets":3,"reps_low":30,"reps_high":45,"notes":"Work time in seconds. Low impact: one foot stays down. Swap to Jumping Jack only once this feels easy.","rest_sec":30,"exercise_id":"1b836b2c-af56-40a6-9afe-023c3ccd5361"},{"name":"March in Place","sets":2,"reps_low":45,"reps_high":60,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"7fae5cd2-712d-4df2-982d-850091d10329"},{"name":"Dead Bug","sets":2,"reps_low":8,"reps_high":12,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bicycle Crunch","sets":2,"reps_low":10,"reps_high":16,"notes":"Reps are total, not per side.","rest_sec":45,"exercise_id":"694c48ac-9251-4fa7-bb25-23353048963c"},{"name":"Side Plank","sets":2,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL);

  CREATE TEMP TABLE _hs_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    status text, sort_order int, page_path text) ON COMMIT DROP;

  INSERT INTO _hs_program_exp VALUES
  (k_prog, 'home_strength', 'Home Strength',
   'Builds muscle with dumbbells and bands, three full-body sessions a week. '
   'Each session pairs a squat and a hinge with a push, a pull, and core work.',
   'muscle', 'Beginner – Intermediate', 8, 3, 'Home Setup',
   true, false, 'draft', 5, 'program.html?slug=home_strength');

  CREATE TEMP TABLE _hs_link_exp (
    id uuid, program_id uuid, routine_id uuid, session_key text,
    sort_order int, legacy_program_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _hs_link_exp VALUES
  (k_la,  k_prog, k_ra,  'full_a',            1, NULL),
  (k_lb,  k_prog, k_rb,  'full_b',            2, NULL),
  (k_lc,  k_prog, k_rc,  'full_c',            3, NULL),
  (k_lcc, k_prog, k_rcc, 'conditioning_core', 4, NULL);

  ----------------------------------------------------------------------------
  -- Content preconditions
  ----------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.exercises) <> 159 THEN
    RAISE EXCEPTION 'ABORT: exercise catalog is not 159 rows';
  END IF;

  -- 25 prescription entries, each the canonical 7-key shape, sane numbers.
  SELECT count(*) INTO v_n FROM _hs_routine_exp r, jsonb_array_elements(r.exercises) x;
  IF v_n <> 25 THEN
    RAISE EXCEPTION 'ABORT: expected 25 prescription entries, found %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM _hs_routine_exp r, jsonb_array_elements(r.exercises) x
              WHERE NOT (x ?& array['name','sets','reps_low','reps_high',
                                    'notes','rest_sec','exercise_id'])
                 OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 7
                 OR (x->>'sets')::int < 1
                 OR (x->>'reps_low')::int >= (x->>'reps_high')::int
                 OR (x->>'rest_sec')::int < 1) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is malformed or has a fixed target';
  END IF;

  -- 21 distinct exercises, every one active, named exactly as in the catalog,
  -- and Home Setup equipment only: Dumbbell, Band or Bodyweight.
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid FROM _hs_routine_exp r,
           jsonb_array_elements(r.exercises) x) q;
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'ABORT: expected 21 distinct exercise ids, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id, x->>'name' AS name
      FROM _hs_routine_exp r, jsonb_array_elements(r.exercises) x) q
    JOIN public.exercises e
      ON e.id = q.id AND e.name = q.name AND e.is_active
     AND e.equipment IN ('Dumbbell', 'Band', 'Bodyweight');
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'ABORT: only % of 21 prescribed exercises are active, correctly named and Home Setup equipment', v_n;
  END IF;

  -- The session keys must be the ones schedules.js uses for home_strength.
  IF (SELECT array_agg(session_key ORDER BY sort_order) FROM _hs_link_exp)
     <> ARRAY['full_a','full_b','full_c','conditioning_core'] THEN
    RAISE EXCEPTION 'ABORT: session keys differ from schedules.js';
  END IF;

  ----------------------------------------------------------------------------
  -- Exhaustive state machine. No shared permissive branch.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_ids FROM (
    SELECT id FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc)
    UNION ALL SELECT id FROM public.programs         WHERE id = k_prog
    UNION ALL SELECT id FROM public.program_routines WHERE id IN (k_la,k_lb,k_lc,k_lcc)
    UNION ALL SELECT id FROM public.exercises        WHERE id IN
      (k_prog,k_ra,k_rb,k_rc,k_rcc,k_la,k_lb,k_lc,k_lcc)) c;

  SELECT count(*) INTO v_slug FROM public.programs WHERE slug = 'home_strength';

  IF v_ids = 0 AND v_slug = 0 THEN
    v_state := 'fresh';
  ELSIF v_ids = 9 AND v_slug = 1 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: partial or conflicting state (id hits=%, slug rows=%)', v_ids, v_slug;
  END IF;

  IF v_state = 'fresh' THEN
    -- Global counts before: exactly the 2026-11-17 production state.
    IF (SELECT count(*) FROM public.programs) <> 4
       OR (SELECT count(*) FROM public.program_routines) <> 56
       OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 57
    THEN RAISE EXCEPTION 'ABORT: catalog row counts differ from the approved starting state'; END IF;

    INSERT INTO public.workout_templates
      (id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
       sort_order,description,goal,difficulty,tags,is_platform,visibility,
       source_workout_id)
    SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
           sort_order,description,goal,difficulty,tags,is_platform,visibility,
           source_workout_id FROM _hs_routine_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN RAISE EXCEPTION 'ABORT: inserted % Routines, expected 4', v_n; END IF;

    INSERT INTO public.programs
      (id,slug,name,description,goal,difficulty,duration_weeks,
       recommended_days_per_week,equipment_summary,included_with_membership,
       standalone_purchasable,status,sort_order,page_path)
    SELECT id,slug,name,description,goal,difficulty,duration_weeks,
           recommended_days_per_week,equipment_summary,included_with_membership,
           standalone_purchasable,status,sort_order,page_path
      FROM _hs_program_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: inserted % Programs, expected 1', v_n; END IF;

    INSERT INTO public.program_routines
      (id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id)
    SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
      FROM _hs_link_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN RAISE EXCEPTION 'ABORT: inserted % links, expected 4', v_n; END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Verification, identical for both paths.
  ----------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc)) <> 4
    THEN RAISE EXCEPTION 'ABORT: expected exactly 4 Routine rows'; END IF;
  IF (SELECT count(*) FROM public.programs WHERE id = k_prog) <> 1
    THEN RAISE EXCEPTION 'ABORT: expected exactly 1 Program row'; END IF;
  IF (SELECT count(*) FROM public.program_routines WHERE program_id = k_prog) <> 4
    THEN RAISE EXCEPTION 'ABORT: expected exactly 4 links for this Program'; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc)
     EXCEPT SELECT * FROM _hs_routine_exp)
    UNION ALL
    (SELECT * FROM _hs_routine_exp
     EXCEPT
     SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine rows differ from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _hs_program_exp)
    UNION ALL
    (SELECT * FROM _hs_program_exp
     EXCEPT
     SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program row differs from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog
     EXCEPT SELECT * FROM _hs_link_exp)
    UNION ALL
    (SELECT * FROM _hs_link_exp
     EXCEPT
     SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: link rows differ from approved (% diffs)', v_diff; END IF;

  -- Timestamp invariants: never compared to a literal clock value.
  IF v_state = 'fresh' THEN
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
    THEN RAISE EXCEPTION 'ABORT: fresh insert must have updated_at = created_at'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra,k_rb,k_rc,k_rcc)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
    THEN RAISE EXCEPTION 'ABORT: replay timestamp invariant violated'; END IF;
  END IF;

  -- Nothing is published, and nothing outside this Program changed.
  IF (SELECT count(*) FROM public.programs WHERE status = 'published') <> 4
     OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog AND status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.workout_templates
                 WHERE id IN (k_ra,k_rb,k_rc,k_rcc) AND visibility <> 'private')
  THEN RAISE EXCEPTION 'ABORT: something is published that must stay hidden'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 5
     OR (SELECT count(*) FROM public.program_routines) <> 60
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 61
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: collateral row-count change detected'; END IF;

  RAISE NOTICE 'phase_439l_home_strength_draft: state=%', v_state;
END $$;
