-- Phase 4.3.9-L — Bodyweight Fat Loss as a HIDDEN DRAFT (prepared 2026-11-18;
-- apply only on explicit owner approval).
-- Additive only: 4 Routines (is_platform, visibility='private') + 1 Program
-- (status='draft') + 4 program_routines links. No existing row is modified.
-- Creates no purchase, entitlement, enrolment, ownership, price or profile
-- state. Publishing is a separate, separately approved migration: until then
-- pcLoadCatalog (status='published' only) never returns this Program, so no
-- page, recommendation, card link or Train listing can show it.
--
-- Content: the approved Program Catalog Plan (Revision 7, content revision 1,
-- decision 1a: Mountain Climber replaces Forward Lunge in Conditioning B).
-- Exercises, sets, ranges and rests exactly as approved. The only added text is
-- the per-leg, per-side, total-reps and timing notes, plus the existing Swap
-- guidance on Push-Up and Knee Push-Up, word for word as Bodyweight
-- Foundations uses it (text only: no progression behavior changes).
-- Session lists already ship in schedules.js; equipment-free Swap and picker already treat
-- bodyweight_fat_loss as equipment-free (exercise-filters.js).
-- Equipment promise: Bodyweight. Every prescribed exercise is classified
-- Bodyweight AND is in the reviewed 38-exercise equipment-free pool
-- (20261003000515 k_pool, mirrored in exercise-filters.js).
-- Access: included with membership; standalone_purchasable stays false. The
-- approved $39 one-time price is a planning record only: no Stripe product,
-- price or checkout exists yet, so nothing here makes it purchasable.
-- Owner is derived from Bodyweight Foundations Full Body A/B/C, so no account
-- id is written here and no session setting is needed.
DO $$
DECLARE
  k_prog   constant uuid := '80f5e790-6328-4d6b-91cf-c2ef9501b412';
  k_ra     constant uuid := 'b6ee39e9-a479-40a9-a85c-b6b7ed59cb44';
  k_rca    constant uuid := '624f8411-5c05-4a57-95a8-e328b71a2da3';
  k_rb     constant uuid := '0666d8e4-9ed9-4dec-9a7b-276ab8a46068';
  k_rcb    constant uuid := '29bb1fa7-0d05-4a55-86d6-32ea9df4ac3b';
  k_la     constant uuid := '7aca0940-8ea1-42cb-8ad9-28f32fec9cff';
  k_lca    constant uuid := '8c362754-1f24-42f4-a81a-b42d4b44bd0f';
  k_lb     constant uuid := '979f02b2-9426-4137-af1a-60855aa36624';
  k_lcb    constant uuid := '97b2a27f-b0cb-4f45-88c7-d0e89be2a656';
  -- Bodyweight Foundations Full Body A/B/C (migration 20260920231151).
  k_bf_ra  constant uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_bf_rb  constant uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_bf_rc  constant uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  -- The reviewed equipment-free pool (20261003000515 k_pool, same order).
  k_pool   constant uuid[] := ARRAY[
    '784a0508-84c3-42a6-98b1-c00cc780e5cd', 'a1bb3980-ae49-48ce-a0b5-91bffd5daeda',
    'dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac', 'c3d81925-04dc-4caf-b5ef-5b42740028e8',
    'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34', 'c320bf46-9f16-4483-bd2f-9ae9e88b7ad5',
    'be4abe1a-93fa-4e87-9250-2627fe45ad3c', '9c8998ab-9713-43f4-940b-5f8feec39d3c',
    'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56', 'a224a468-28c0-4ba2-b6f9-c8a3f45d2147',
    '694c48ac-9251-4fa7-bb25-23353048963c', 'ed45d50d-5411-4e47-8309-97314b94adfb',
    'e3f12784-cf40-4aa5-ae41-6770416c4d1f', '97501496-7f81-4552-82ab-d3f326b8ff06',
    'd2812c92-d4c6-420c-b2d9-d2c5757871c9', 'a7942454-736c-4d84-980d-39b40298a1b2',
    'eee8a605-10d6-41ad-9b79-65d626b598db', 'ff15ede3-a361-415a-8e20-6a7244bad0b3',
    'da2d9535-6e82-4790-84c9-8e1a0d549718', 'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45',
    '7948f9c4-2ec1-432b-ad79-7f27c5961577', '53c57e39-51e9-42e5-991a-3357bd610b4a',
    '6962172b-18eb-4def-88d3-acc67c62f9ce', '7fae5cd2-712d-4df2-982d-850091d10329',
    '1b836b2c-af56-40a6-9afe-023c3ccd5361', '41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5',
    '6d50c3a6-0dde-46e4-bc3a-508c2f358803', 'ead731d6-bfdd-4119-bd0b-bb3092457e69',
    '44ebe984-c8e9-4842-8617-7f54f1179d2b', 'b2168db4-fb33-4dd0-a8e2-ab5fa81677e4',
    '4b0b5faa-4704-4959-a550-c01de705a540', 'fd10bcf3-a09f-41fe-aca5-7996972d496f',
    '04429fae-c385-47dd-91ec-7e1fe3a4a83c', 'a3ffb069-e0ea-4d01-a038-f9f72b1dd7fe',
    '0d28f8c9-7485-4b0a-9552-b56cf3c556bf', '0b519d3f-6a32-4883-955c-ad9c87f7385f',
    'c84d3609-cca3-4652-a1ee-b119105aac1a', 'e4015387-bed0-43e2-9129-4ca3c2b67414'
  ]::uuid[];
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
  CREATE TEMP TABLE _bfl_routine_exp (
    id uuid, user_id uuid, name text, exercises jsonb, source_program_slug text,
    times_used int, last_used_at timestamptz, sort_order int, description text,
    goal text, difficulty text, tags text[], is_platform boolean,
    visibility text, source_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _bfl_routine_exp VALUES
  (k_ra, v_owner, 'Full Body A',
   '[{"name":"Bodyweight Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"97501496-7f81-4552-82ab-d3f326b8ff06"},{"name":"Push-Up","sets":3,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","rest_sec":60,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Glute Bridge","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Superman","sets":2,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Plank","sets":2,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds.","rest_sec":45,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_rca, v_owner, 'Conditioning A',
   '[{"name":"Jumping Jack","sets":3,"reps_low":30,"reps_high":45,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5"},{"name":"Lateral Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":30,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Mountain Climber","sets":3,"reps_low":20,"reps_high":40,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"High Knees","sets":3,"reps_low":20,"reps_high":40,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"6d50c3a6-0dde-46e4-bc3a-508c2f358803"},{"name":"Dead Bug","sets":2,"reps_low":8,"reps_high":12,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_rb, v_owner, 'Full Body B',
   '[{"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Knee Push-Up","sets":3,"reps_low":8,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only.","rest_sec":60,"exercise_id":"a1bb3980-ae49-48ce-a0b5-91bffd5daeda"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":45,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Bird Dog","sets":2,"reps_low":8,"reps_high":12,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"},{"name":"Side Plank","sets":2,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_rcb, v_owner, 'Conditioning B',
   '[{"name":"Step Jack","sets":3,"reps_low":30,"reps_high":45,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"1b836b2c-af56-40a6-9afe-023c3ccd5361"},{"name":"Mountain Climber","sets":3,"reps_low":20,"reps_high":40,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"March in Place","sets":3,"reps_low":45,"reps_high":60,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"7fae5cd2-712d-4df2-982d-850091d10329"},{"name":"Bicycle Crunch","sets":2,"reps_low":10,"reps_high":16,"notes":"Reps are total, not per side.","rest_sec":45,"exercise_id":"694c48ac-9251-4fa7-bb25-23353048963c"},{"name":"Wall Sit","sets":2,"reps_low":20,"reps_high":45,"notes":"Hold time in seconds.","rest_sec":45,"exercise_id":"7948f9c4-2ec1-432b-ad79-7f27c5961577"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL);

  CREATE TEMP TABLE _bfl_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    status text, sort_order int, page_path text) ON COMMIT DROP;

  INSERT INTO _bfl_program_exp VALUES
  (k_prog, 'bodyweight_fat_loss', 'Bodyweight Fat Loss',
   'A no-equipment, four-day fat-loss plan with two full-body strength days '
   'and two conditioning circuits.',
   'fatloss', 'Beginner – Intermediate', 8, 4, 'Bodyweight',
   true, false, 'draft', 9, 'program.html?slug=bodyweight_fat_loss');

  CREATE TEMP TABLE _bfl_link_exp (
    id uuid, program_id uuid, routine_id uuid, session_key text,
    sort_order int, legacy_program_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _bfl_link_exp VALUES
  (k_la,  k_prog, k_ra,  'full_a',         1, NULL),
  (k_lca, k_prog, k_rca, 'conditioning_a', 2, NULL),
  (k_lb,  k_prog, k_rb,  'full_b',         3, NULL),
  (k_lcb, k_prog, k_rcb, 'conditioning_b', 4, NULL);

  ----------------------------------------------------------------------------
  -- Content preconditions
  ----------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.exercises) <> 159 THEN
    RAISE EXCEPTION 'ABORT: exercise catalog is not 159 rows';
  END IF;

  -- 21 prescription entries, each the canonical 7-key shape, sane numbers.
  SELECT count(*) INTO v_n FROM _bfl_routine_exp r, jsonb_array_elements(r.exercises) x;
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'ABORT: expected 21 prescription entries, found %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM _bfl_routine_exp r, jsonb_array_elements(r.exercises) x
              WHERE NOT (x ?& array['name','sets','reps_low','reps_high',
                                    'notes','rest_sec','exercise_id'])
                 OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 7
                 OR (x->>'sets')::int < 1
                 OR (x->>'reps_low')::int >= (x->>'reps_high')::int
                 OR (x->>'rest_sec')::int < 1) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is malformed or has a fixed target';
  END IF;

  -- 20 distinct exercises, every one active and named exactly as in the catalog.
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid FROM _bfl_routine_exp r,
           jsonb_array_elements(r.exercises) x) q;
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'ABORT: expected 20 distinct exercise ids, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id, x->>'name' AS name
      FROM _bfl_routine_exp r, jsonb_array_elements(r.exercises) x) q
    JOIN public.exercises e ON e.id = q.id AND e.name = q.name AND e.is_active;
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'ABORT: only % of 20 prescribed exercises are active and correctly named', v_n;
  END IF;

  -- Equipment promise (Bodyweight): classified Bodyweight AND in the reviewed
  -- equipment-free pool. Bodyweight classification alone is not enough
  -- (Pull-Up, Dips and others are stored as Bodyweight but need equipment).
  IF EXISTS (
    SELECT 1
      FROM _bfl_routine_exp r
      CROSS JOIN LATERAL jsonb_array_elements(r.exercises) x
      JOIN public.exercises e ON e.id = (x->>'exercise_id')::uuid
     WHERE e.equipment <> 'Bodyweight'
        OR NOT ((x->>'exercise_id')::uuid = ANY (k_pool))) THEN
    RAISE EXCEPTION 'ABORT: a prescribed exercise is outside the equipment-free pool';
  END IF;
  IF cardinality(k_pool) <> 38
     OR (SELECT count(*) FROM public.exercises
          WHERE id = ANY (k_pool) AND equipment = 'Bodyweight' AND is_active) <> 38 THEN
    RAISE EXCEPTION 'ABORT: the equipment-free pool differs from its reviewed record';
  END IF;

  -- The session keys must be the ones schedules.js uses for this Program.
  IF (SELECT array_agg(session_key ORDER BY sort_order) FROM _bfl_link_exp)
     <> ARRAY['full_a','conditioning_a','full_b','conditioning_b'] THEN
    RAISE EXCEPTION 'ABORT: session keys differ from schedules.js';
  END IF;

  ----------------------------------------------------------------------------
  -- Exhaustive state machine. No shared permissive branch.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_ids FROM (
    SELECT id FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb)
    UNION ALL SELECT id FROM public.programs         WHERE id = k_prog
    UNION ALL SELECT id FROM public.program_routines WHERE id IN (k_la, k_lca, k_lb, k_lcb)
    UNION ALL SELECT id FROM public.exercises        WHERE id IN
      (k_prog, k_ra, k_rca, k_rb, k_rcb, k_la, k_lca, k_lb, k_lcb)) c;

  SELECT count(*) INTO v_slug FROM public.programs WHERE slug = 'bodyweight_fat_loss';

  IF v_ids = 0 AND v_slug = 0 THEN
    v_state := 'fresh';
  ELSIF v_ids = 9 AND v_slug = 1 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: partial or conflicting state (id hits=%, slug rows=%)', v_ids, v_slug;
  END IF;

  IF v_state = 'fresh' THEN
    -- Global counts before: exactly the 2026-11-18 production state.
    IF (SELECT count(*) FROM public.programs) <> 8
       OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> 7
       OR (SELECT count(*) FROM public.program_routines) <> 72
       OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 73
    THEN RAISE EXCEPTION 'ABORT: catalog row counts differ from the approved starting state'; END IF;

    INSERT INTO public.workout_templates
      (id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
       sort_order,description,goal,difficulty,tags,is_platform,visibility,
       source_workout_id)
    SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
           sort_order,description,goal,difficulty,tags,is_platform,visibility,
           source_workout_id FROM _bfl_routine_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN RAISE EXCEPTION 'ABORT: inserted % Routines, expected 4', v_n; END IF;

    INSERT INTO public.programs
      (id,slug,name,description,goal,difficulty,duration_weeks,
       recommended_days_per_week,equipment_summary,included_with_membership,
       standalone_purchasable,status,sort_order,page_path)
    SELECT id,slug,name,description,goal,difficulty,duration_weeks,
           recommended_days_per_week,equipment_summary,included_with_membership,
           standalone_purchasable,status,sort_order,page_path
      FROM _bfl_program_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: inserted % Programs, expected 1', v_n; END IF;

    INSERT INTO public.program_routines
      (id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id)
    SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
      FROM _bfl_link_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN RAISE EXCEPTION 'ABORT: inserted % links, expected 4', v_n; END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Verification, identical for both paths.
  ----------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb)) <> 4
    THEN RAISE EXCEPTION 'ABORT: expected exactly 4 Routine rows'; END IF;
  IF (SELECT count(*) FROM public.programs WHERE id = k_prog) <> 1
    THEN RAISE EXCEPTION 'ABORT: expected exactly 1 Program row'; END IF;
  IF (SELECT count(*) FROM public.program_routines WHERE program_id = k_prog) <> 4
    THEN RAISE EXCEPTION 'ABORT: expected exactly 4 links for this Program'; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb)
     EXCEPT SELECT * FROM _bfl_routine_exp)
    UNION ALL
    (SELECT * FROM _bfl_routine_exp
     EXCEPT
     SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine rows differ from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _bfl_program_exp)
    UNION ALL
    (SELECT * FROM _bfl_program_exp
     EXCEPT
     SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program row differs from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog
     EXCEPT SELECT * FROM _bfl_link_exp)
    UNION ALL
    (SELECT * FROM _bfl_link_exp
     EXCEPT
     SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: link rows differ from approved (% diffs)', v_diff; END IF;

  -- Timestamp invariants: never compared to a literal clock value.
  IF v_state = 'fresh' THEN
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
    THEN RAISE EXCEPTION 'ABORT: fresh insert must have updated_at = created_at'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra, k_rca, k_rb, k_rcb)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id = k_prog
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
    THEN RAISE EXCEPTION 'ABORT: replay timestamp invariant violated'; END IF;
  END IF;

  -- Nothing is published, and nothing outside this Program changed.
  IF (SELECT count(*) FROM public.programs WHERE status = 'published') <> 7
     OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog AND status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.workout_templates
                 WHERE id IN (k_ra, k_rca, k_rb, k_rcb) AND visibility <> 'private')
  THEN RAISE EXCEPTION 'ABORT: something is published that must stay hidden'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 9
     OR (SELECT count(*) FROM public.program_routines) <> 76
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 77
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: collateral row-count change detected'; END IF;

  RAISE NOTICE 'phase_439l_bodyweight_fat_loss_draft: state=%', v_state;
END $$;
