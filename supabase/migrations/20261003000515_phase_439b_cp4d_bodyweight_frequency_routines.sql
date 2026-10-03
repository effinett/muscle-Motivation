-- phase_439b_cp4d_bodyweight_frequency_routines
-- Phase 4.3.9B CP4d. Bodyweight Foundations frequency content, PRIVATE drafts.
--
-- Inserts EXACTLY six platform Routines (is_platform=true, visibility='private')
-- and EXACTLY six Bodyweight Foundations program_routines links, for the later
-- CP4e 4/5/6-day mapping:
--   4 push_core_a  Push & Core A          7 push_core_b       Push & Core B
--   5 lower_a      Lower Body A           8 lower_b           Lower Body B
--   6 conditioning_core  Conditioning & Core   9 mobility_recovery  Mobility & Recovery
-- Nothing is published and no schedule mapping changes: until CP4e, the access
-- policy hides private platform Routines from members (owner QA only) and the
-- CP4a containment keeps unmapped keys off the Program page.
--
-- No equipment: every prescribed exercise is in the approved equipment-free
-- pool (verified against live instructions) and none is in the explicit
-- exclusion list. There is no Pull session and no pulling wording.
--
-- Catalog guard: the 38 pool rows and 14 excluded rows are locked FOR SHARE and
-- fingerprinted over every non-audit column (all except created_at/updated_at),
-- before classification and again after the write. Any change to a name,
-- activity, equipment, tracking, laterality, instructions, tips, aliases or
-- other reviewed field aborts the migration before anything is inserted.
--
-- Inserts only. No UPDATE, DELETE, DROP, publication, mapping, enrolment,
-- workout, history, PR, favourite or purchase change, and no updated_at write.
-- The owner is DERIVED from Full Body A/B/C (all three must share it), so this
-- file carries no account identifier.
--
-- Three-state machine:
--   FRESH    none of the 12 ids, 6 names, 6 keys or sort slots 4-9 exist, and the
--            exact pre-CP4d totals hold -> insert 12 rows, verify every postcondition
--   REPLAY   all 12 rows exist and match the approved records exactly, with the
--            exact post-CP4d totals -> verified no-op, writes nothing
--   DIVERGED anything else (partial, mismatched, or moved on) -> abort
-- One DO statement: it commits or rolls back as a unit.
DO $mig$
DECLARE
  k_program   CONSTANT uuid := 'e8c5a1f6-5d74-4bc9-8ea5-4a7c1b9d65d8';
  k_slug      CONSTANT text := 'bodyweight_foundations';
  k_program_md5 CONSTANT text := '54f16021713151bdf654eeed5ac76115';
  k_routine_a CONSTANT uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_routine_b CONSTANT uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_routine_c CONSTANT uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  k_md5_a     CONSTANT text := '3325d7ae57f6c007d99c9db69d9cb311';
  k_md5_b     CONSTANT text := '04d6831d81623921fe8ead42f44e311a';
  k_md5_c     CONSTANT text := 'a9b1d9785031b8b47799a3a2cc9d05ac';
  k_link_a    CONSTANT uuid := 'f9d6b2a7-6e85-4cda-9fb6-5b8d2cae76e9';
  k_link_b    CONSTANT uuid := '0ae7c3b8-7f96-4deb-8ac7-6c9e3dbf87fa';
  k_link_c    CONSTANT uuid := '1bf8d4c9-80a7-4efc-9bd8-7daf4ecf980b';
  k_cat_n     CONSTANT int  := 159;
  k_cat_md5   CONSTANT text := 'dec5ac379151ad7d0f6463820dc76dc8';
  k_squat     CONSTANT uuid := '97501496-7f81-4552-82ab-d3f326b8ff06';
  k_superman  CONSTANT uuid := 'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45';
  k_climber   CONSTANT uuid := 'ed45d50d-5411-4e47-8309-97314b94adfb';
  k_superman_note CONSTANT text := $sn$Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.$sn$;
  k_keys  CONSTANT text[] := ARRAY['push_core_a','lower_a','conditioning_core','push_core_b','lower_b','mobility_recovery'];
  k_names CONSTANT text[] := ARRAY['Push & Core A','Lower Body A','Conditioning & Core','Push & Core B','Lower Body B','Mobility & Recovery'];
  k_counts CONSTANT int[] := ARRAY[5,5,5,5,5,6];
  k_entry_keys CONSTANT text[] := ARRAY['exercise_id','name','notes','reps_high','reps_low','rest_sec','sets'];

  -- Approved equipment-free pool (38) and explicit exclusions (14).
  k_pool CONSTANT uuid[] := ARRAY['784a0508-84c3-42a6-98b1-c00cc780e5cd','a1bb3980-ae49-48ce-a0b5-91bffd5daeda','dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac','c3d81925-04dc-4caf-b5ef-5b42740028e8','b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34','c320bf46-9f16-4483-bd2f-9ae9e88b7ad5','be4abe1a-93fa-4e87-9250-2627fe45ad3c','9c8998ab-9713-43f4-940b-5f8feec39d3c','d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56','a224a468-28c0-4ba2-b6f9-c8a3f45d2147','694c48ac-9251-4fa7-bb25-23353048963c','ed45d50d-5411-4e47-8309-97314b94adfb','e3f12784-cf40-4aa5-ae41-6770416c4d1f','97501496-7f81-4552-82ab-d3f326b8ff06','d2812c92-d4c6-420c-b2d9-d2c5757871c9','a7942454-736c-4d84-980d-39b40298a1b2','eee8a605-10d6-41ad-9b79-65d626b598db','ff15ede3-a361-415a-8e20-6a7244bad0b3','da2d9535-6e82-4790-84c9-8e1a0d549718','c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45','7948f9c4-2ec1-432b-ad79-7f27c5961577','53c57e39-51e9-42e5-991a-3357bd610b4a','6962172b-18eb-4def-88d3-acc67c62f9ce','7fae5cd2-712d-4df2-982d-850091d10329','1b836b2c-af56-40a6-9afe-023c3ccd5361','41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5','6d50c3a6-0dde-46e4-bc3a-508c2f358803','ead731d6-bfdd-4119-bd0b-bb3092457e69','44ebe984-c8e9-4842-8617-7f54f1179d2b','b2168db4-fb33-4dd0-a8e2-ab5fa81677e4','4b0b5faa-4704-4959-a550-c01de705a540','fd10bcf3-a09f-41fe-aca5-7996972d496f','04429fae-c385-47dd-91ec-7e1fe3a4a83c','a3ffb069-e0ea-4d01-a038-f9f72b1dd7fe','0d28f8c9-7485-4b0a-9552-b56cf3c556bf','0b519d3f-6a32-4883-955c-ad9c87f7385f','c84d3609-cca3-4652-a1ee-b119105aac1a','e4015387-bed0-43e2-9129-4ca3c2b67414']::uuid[];
  k_forbidden CONSTANT uuid[] := ARRAY['9d60b74a-91d4-4059-89fa-ac53160ca767','b0c178b6-bd81-477d-ae23-2a9aa40d67b4','b3661213-09f8-45bf-83fa-72edebca5001','0d298f82-6688-46ab-82e1-2ea3e914fc84','9daedcaa-e007-488f-8a4d-17957361b10e','eecf2677-57d4-4bc1-a0e9-bd3ffe59ab15','d609a511-99d8-46a2-8dad-674b03c7f1ec','5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5','d06aa93c-276f-4b9e-ad8f-3477c96f4f4e','c6b852dd-8773-4417-9244-b51989a308b1','d75c33fa-5435-47f5-93fc-e796ad22322e','8a56a474-29e1-47b1-a68f-8cb98718223e','39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481','db9208d9-0190-40dd-849b-38724ec9e09d']::uuid[];
  -- md5 over rows ordered by id (COLLATE "C") of jsonb_build_array(id, name,
  -- category, equipment, aliases, primary_muscle, secondary_muscles,
  -- movement_pattern, force_type, difficulty, is_bodyweight, is_unilateral,
  -- default_unit, tracking_type, instructions, tips, is_active)::text, joined by '|'.
  k_pool_fp      CONSTANT text := 'a0afad4c9d6badf377a15afee96168ea';
  k_forbidden_fp CONSTANT text := '4a50ecd4b343cb0a414bf1ede1b1ab83';

  -- THE approved records: six Routines with their deterministic Routine and
  -- link ids. Every check, the insert and both exact-match predicates read this.
  k_new CONSTANT jsonb := $new$[
    {"id":"b654c396-08a2-5ec9-bf7a-f901e797c77b","link_id":"bc291137-42de-5f96-b493-d1b50aab7fd6","session_key":"push_core_a","sort_order":4,"name":"Push & Core A","exercises":[{"name":"Wall Push-Up","sets":3,"reps_low":10,"reps_high":15,"notes":"Ready for more? Use Swap before logging sets: Knee Push-Up, then Push-Up. Swap applies to this workout only.","rest_sec":60,"exercise_id":"784a0508-84c3-42a6-98b1-c00cc780e5cd"},{"name":"Pike Lean","sets":3,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","rest_sec":60,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Dead Bug","sets":3,"reps_low":8,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Plank","sets":3,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds, on your forearms.","rest_sec":45,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"},{"name":"Wall Slide","sets":2,"reps_low":30,"reps_high":45,"notes":"Work time in seconds. Keep your lower back against the wall.","rest_sec":30,"exercise_id":"e3f12784-cf40-4aa5-ae41-6770416c4d1f"}]},
    {"id":"f1699018-7e10-5d31-97f9-91b2555d1f29","link_id":"34d87501-141f-5e60-a62a-d6a0c3f4cc12","session_key":"lower_a","sort_order":5,"name":"Lower Body A","exercises":[{"name":"Bodyweight Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"97501496-7f81-4552-82ab-d3f326b8ff06"},{"name":"Reverse Lunge","sets":3,"reps_low":6,"reps_high":10,"notes":"Reps are per leg. Rest a hand on a wall for balance if needed.","rest_sec":75,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Glute Bridge","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Wall Sit","sets":2,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds. Sit higher on the wall to make it easier.","rest_sec":60,"exercise_id":"7948f9c4-2ec1-432b-ad79-7f27c5961577"},{"name":"Standing Ankle Rock","sets":2,"reps_low":30,"reps_high":45,"notes":"Work time in seconds, per side.","rest_sec":30,"exercise_id":"53c57e39-51e9-42e5-991a-3357bd610b4a"}]},
    {"id":"645bd86b-c15c-5096-9103-5da1d418bf2c","link_id":"7aafce9c-27a3-5bae-959d-ec94066d4f5d","session_key":"conditioning_core","sort_order":6,"name":"Conditioning & Core","exercises":[{"name":"March in Place","sets":2,"reps_low":45,"reps_high":60,"notes":"Work time in seconds, at an easy warm-up pace.","rest_sec":30,"exercise_id":"7fae5cd2-712d-4df2-982d-850091d10329"},{"name":"Step Jack","sets":3,"reps_low":30,"reps_high":45,"notes":"Work time in seconds. Low impact: one foot stays down. Swap to Jumping Jack only once this feels easy.","rest_sec":45,"exercise_id":"1b836b2c-af56-40a6-9afe-023c3ccd5361"},{"name":"High Knees","sets":3,"reps_low":20,"reps_high":30,"notes":"Work time in seconds. Keep one foot down and drive your knees only as high as comfortable for a low-impact option.","rest_sec":45,"exercise_id":"6d50c3a6-0dde-46e4-bc3a-508c2f358803"},{"name":"Bicycle Crunch","sets":2,"reps_low":10,"reps_high":16,"notes":"Reps are total, not per side.","rest_sec":45,"exercise_id":"694c48ac-9251-4fa7-bb25-23353048963c"},{"name":"Plank","sets":2,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds, on your forearms.","rest_sec":45,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"}]},
    {"id":"7fb1a573-1ff3-59a5-ae72-e4c91a0e2a78","link_id":"db2d039d-5da0-569d-9abe-505094259168","session_key":"push_core_b","sort_order":7,"name":"Push & Core B","exercises":[{"name":"Knee Push-Up","sets":3,"reps_low":8,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only.","rest_sec":75,"exercise_id":"a1bb3980-ae49-48ce-a0b5-91bffd5daeda"},{"name":"Pike Lean","sets":3,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","rest_sec":60,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Side Plank","sets":2,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, per side. Drop your bottom knee to make it easier.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"},{"name":"Reverse Crunch","sets":3,"reps_low":8,"reps_high":12,"notes":"Curl your hips up with control, without swinging.","rest_sec":45,"exercise_id":"a224a468-28c0-4ba2-b6f9-c8a3f45d2147"},{"name":"Bird Dog","sets":2,"reps_low":6,"reps_high":8,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]},
    {"id":"50081b09-7f82-591c-842f-1792f2cb4b27","link_id":"279de6f6-2a95-5f6b-820a-769c8bb5519e","session_key":"lower_b","sort_order":8,"name":"Lower Body B","exercises":[{"name":"Split Squat","sets":3,"reps_low":6,"reps_high":10,"notes":"Reps are per leg. Lower only as far as you can control.","rest_sec":75,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Lateral Lunge","sets":2,"reps_low":6,"reps_high":8,"notes":"Reps are per leg. Sit back only as deep as is comfortable.","rest_sec":60,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Superman","sets":3,"reps_low":10,"reps_high":12,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Kneeling Hip Flexor Stretch","sets":2,"reps_low":30,"reps_high":45,"notes":"Hold time in seconds, per side.","rest_sec":30,"exercise_id":"6962172b-18eb-4def-88d3-acc67c62f9ce"}]},
    {"id":"58d0f941-51e4-5485-831b-a99521bf9c14","link_id":"b95ad56d-5cca-5a14-82de-832b87716f15","session_key":"mobility_recovery","sort_order":9,"name":"Mobility & Recovery","exercises":[{"name":"Cat-Cow","sets":2,"reps_low":45,"reps_high":60,"notes":"Work time in seconds. Move slowly with your breath.","rest_sec":15,"exercise_id":"ead731d6-bfdd-4119-bd0b-bb3092457e69"},{"name":"Quadruped Thoracic Rotation","sets":2,"reps_low":30,"reps_high":45,"notes":"Work time in seconds, per side.","rest_sec":15,"exercise_id":"44ebe984-c8e9-4842-8617-7f54f1179d2b"},{"name":"90/90 Hip Rotation","sets":2,"reps_low":30,"reps_high":45,"notes":"Work time in seconds, per side.","rest_sec":15,"exercise_id":"b2168db4-fb33-4dd0-a8e2-ab5fa81677e4"},{"name":"Supine Hamstring Stretch","sets":2,"reps_low":30,"reps_high":45,"notes":"Hold time in seconds, per side.","rest_sec":15,"exercise_id":"4b0b5faa-4704-4959-a550-c01de705a540"},{"name":"Supine Spinal Twist","sets":2,"reps_low":30,"reps_high":45,"notes":"Hold time in seconds, per side.","rest_sec":15,"exercise_id":"fd10bcf3-a09f-41fe-aca5-7996972d496f"},{"name":"Diaphragmatic Breathing","sets":1,"reps_low":60,"reps_high":120,"notes":"Time in seconds. Slow, relaxed breaths.","rest_sec":15,"exercise_id":"04429fae-c385-47dd-91ec-7e1fe3a4a83c"}]}
  ]$new$::jsonb;

  v_owner uuid; v_state text; v_n int; v_m int; v_ins int; v_xid xid;
  v_rt_ids int; v_ln_ids int; v_keys int; v_sorts int; v_names int;
  v_exact_rt int; v_exact_ln int; v_bwf_links int;
  v_plat int; v_pub int; v_priv int; v_links int;
  b_plat_fp text; b_links_fp text;
BEGIN
  ------------------------------------------------------------- ROW LOCKS
  -- Row locks only (no table lock): the Program, Full Body A/B/C and their three
  -- links are held FOR SHARE so they cannot change or be unpublished meanwhile.
  -- Concurrent duplicate keys are additionally impossible by the unique
  -- constraint (program_id, session_key) and the primary keys.
  PERFORM 1 FROM public.programs WHERE id = k_program FOR SHARE;
  PERFORM 1 FROM public.workout_templates
   WHERE id IN (k_routine_a, k_routine_b, k_routine_c) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.program_routines WHERE program_id = k_program ORDER BY id FOR SHARE;
  -- The 52 reviewed catalog rows (38 pool + 14 excluded) are held FOR SHARE so
  -- their reviewed fields cannot change between this check and the insert.
  IF k_pool && k_forbidden THEN
    RAISE EXCEPTION 'cp4d aborted: the approved pool and the exclusion list overlap';
  END IF;
  PERFORM 1 FROM public.exercises WHERE id = ANY (k_pool || k_forbidden) ORDER BY id FOR SHARE;
  SELECT count(DISTINCT id) INTO v_n FROM public.exercises WHERE id = ANY (k_pool || k_forbidden);
  IF v_n <> 52 OR cardinality(k_pool || k_forbidden) <> 52 THEN
    RAISE EXCEPTION 'cp4d aborted: % of 52 reviewed catalog rows locked', v_n;
  END IF;
  IF (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_pool)) IS DISTINCT FROM k_pool_fp THEN
    RAISE EXCEPTION 'cp4d aborted: a reviewed equipment-free pool exercise changed';
  END IF;
  IF (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_forbidden)) IS DISTINCT FROM k_forbidden_fp THEN
    RAISE EXCEPTION 'cp4d aborted: a reviewed excluded exercise changed';
  END IF;

  ------------------------------------------- SELF-CHECKS ON THE RECORDS
  IF jsonb_array_length(k_new) <> 6 THEN
    RAISE EXCEPTION 'cp4d aborted: expected 6 Routines in the approved records';
  END IF;
  IF (SELECT array_agg(r->>'session_key' ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_new) r) <> k_keys
     OR (SELECT array_agg(r->>'name' ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_new) r) <> k_names
     OR (SELECT array_agg((r->>'sort_order')::int ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_new) r) <> ARRAY[4,5,6,7,8,9]
     OR (SELECT array_agg(jsonb_array_length(r->'exercises') ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_new) r) <> k_counts THEN
    RAISE EXCEPTION 'cp4d aborted: keys, names, sort orders or entry counts differ from the approved design';
  END IF;
  SELECT count(DISTINCT x) INTO v_n FROM (
    SELECT r->>'id' AS x FROM jsonb_array_elements(k_new) r
    UNION ALL SELECT r->>'link_id' FROM jsonb_array_elements(k_new) r) s;
  IF v_n <> 12 THEN RAISE EXCEPTION 'cp4d aborted: the 12 Routine and link ids are not distinct (% distinct)', v_n; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(k_new) r WHERE r->>'name' ~* 'pull') <> 0 THEN
    RAISE EXCEPTION 'cp4d aborted: a Routine name uses pull wording';
  END IF;
  IF k_pool && k_forbidden OR cardinality(k_pool) <> 38 OR cardinality(k_forbidden) <> 14 THEN
    RAISE EXCEPTION 'cp4d aborted: the approved pool and exclusion list are inconsistent';
  END IF;

  -- Every prescription entry: canonical seven-key shape, sane integers, short
  -- trimmed notes, pool-only exercises, no exclusions, no Mountain Climber,
  -- Bodyweight Squat without guidance, and pull wording only as Superman's
  -- approved denial.
  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(k_new) r, jsonb_array_elements(r->'exercises') e
   WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) <> k_entry_keys
      OR jsonb_typeof(e->'sets') <> 'number' OR jsonb_typeof(e->'reps_low') <> 'number'
      OR jsonb_typeof(e->'reps_high') <> 'number' OR jsonb_typeof(e->'rest_sec') <> 'number'
      OR jsonb_typeof(e->'notes') <> 'string' OR jsonb_typeof(e->'name') <> 'string'
      OR (e->>'sets')::int < 1 OR (e->>'reps_low')::int < 1
      OR (e->>'reps_high')::int < (e->>'reps_low')::int
      OR (e->>'rest_sec')::int < 1
      OR length(e->>'notes') > 140 OR e->>'notes' <> btrim(e->>'notes')
      OR NOT ((e->>'exercise_id')::uuid = ANY (k_pool))
      OR (e->>'exercise_id')::uuid = ANY (k_forbidden)
      OR (e->>'exercise_id')::uuid = k_climber
      OR ((e->>'exercise_id')::uuid = k_squat AND e->>'notes' <> '')
      OR ((e->>'exercise_id')::uuid = k_superman AND e->>'notes' <> k_superman_note)
      OR (e->>'notes' ~* 'pull' AND (e->>'exercise_id')::uuid <> k_superman);
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4d aborted: % prescription entr(ies) violate the approved rules', v_n; END IF;

  ------------------------------------------------- CATALOG PRECONDITIONS
  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5 THEN
    RAISE EXCEPTION 'cp4d aborted: exercise catalog is not % / %', k_cat_n, k_cat_md5;
  END IF;
  SELECT count(*) INTO v_n FROM public.exercises WHERE id = ANY (k_pool) AND is_active;
  SELECT count(*) INTO v_m FROM public.exercises WHERE id = ANY (k_forbidden);
  IF v_n <> 38 OR v_m <> 14 THEN
    RAISE EXCEPTION 'cp4d aborted: % of 38 pool exercises active, % of 14 exclusions present', v_n, v_m;
  END IF;
  -- Each entry matches its canonical row: name, active, seconds wording for
  -- timed work, per leg/side wording for unilateral work.
  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(k_new) r, jsonb_array_elements(r->'exercises') e
    LEFT JOIN public.exercises x ON x.id = (e->>'exercise_id')::uuid
   WHERE x.id IS NULL OR NOT x.is_active OR x.name <> e->>'name'
      OR (x.tracking_type = 'time' AND e->>'notes' !~ 'seconds')
      OR (x.is_unilateral AND e->>'notes' !~ 'per (leg|side)')
      OR x.tracking_type NOT IN ('time', 'bodyweight_reps');
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4d aborted: % entr(ies) disagree with the canonical catalog', v_n; END IF;

  ------------------------------------------- PROGRAM + ROUTINE PRECONDITIONS
  -- Resolved by canonical ids and relationship, never by name alone.
  IF (SELECT md5(row_to_json(p)::text) FROM public.programs p WHERE p.id = k_program AND p.slug = k_slug AND p.status = 'published')
     IS DISTINCT FROM k_program_md5 THEN
    RAISE EXCEPTION 'cp4d aborted: the Bodyweight Foundations Program row is not the approved published record';
  END IF;
  SELECT count(*) INTO v_n FROM public.program_routines
   WHERE program_id = k_program AND (
         (id = k_link_a AND session_key = 'full_a' AND routine_id = k_routine_a AND sort_order = 1)
      OR (id = k_link_b AND session_key = 'full_b' AND routine_id = k_routine_b AND sort_order = 2)
      OR (id = k_link_c AND session_key = 'full_c' AND routine_id = k_routine_c AND sort_order = 3));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4d aborted: the Full Body A/B/C links differ (% of 3)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE is_platform AND visibility = 'published' AND (
         (id = k_routine_a AND name = 'Full Body A' AND md5(exercises::text) = k_md5_a)
      OR (id = k_routine_b AND name = 'Full Body B' AND md5(exercises::text) = k_md5_b)
      OR (id = k_routine_c AND name = 'Full Body C' AND md5(exercises::text) = k_md5_c));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4d aborted: Full Body A/B/C differ from their approved content (% of 3)', v_n; END IF;
  SELECT count(DISTINCT user_id), min(user_id::text)::uuid INTO v_n, v_owner
    FROM public.workout_templates WHERE id IN (k_routine_a, k_routine_b, k_routine_c);
  IF v_n <> 1 OR v_owner IS NULL THEN
    RAISE EXCEPTION 'cp4d aborted: Full Body A/B/C do not share exactly one owner';
  END IF;

  ---------------------------------------------------------- CLASSIFY
  SELECT count(*) INTO v_rt_ids FROM public.workout_templates t
   WHERE t.id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_new) r);
  SELECT count(*) INTO v_ln_ids FROM public.program_routines l
   WHERE l.id IN (SELECT (r->>'link_id')::uuid FROM jsonb_array_elements(k_new) r);
  SELECT count(*) INTO v_keys FROM public.program_routines
   WHERE program_id = k_program AND session_key = ANY (k_keys);
  SELECT count(*) INTO v_sorts FROM public.program_routines
   WHERE program_id = k_program AND sort_order BETWEEN 4 AND 9;
  SELECT count(*) INTO v_names FROM public.workout_templates
   WHERE is_platform AND name = ANY (k_names);
  SELECT count(*) INTO v_bwf_links FROM public.program_routines WHERE program_id = k_program;
  SELECT count(*), count(*) FILTER (WHERE visibility = 'published'), count(*) FILTER (WHERE visibility = 'private')
    INTO v_plat, v_pub, v_priv FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO v_links FROM public.program_routines;

  -- THE exact-record predicates (shared by REPLAY and POSTCONDITIONS).
  SELECT count(*) INTO v_exact_rt
    FROM public.workout_templates t
    JOIN jsonb_to_recordset(k_new) AS r(id uuid, name text, exercises jsonb) ON r.id = t.id
   WHERE t.user_id = v_owner AND t.name = r.name AND t.exercises = r.exercises
     AND t.is_platform AND t.visibility = 'private' AND t.goal = 'muscle'
     AND t.sort_order = 0 AND t.tags = '{}'::text[] AND t.times_used = 0
     AND t.description IS NULL AND t.difficulty IS NULL AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL AND t.last_used_at IS NULL;
  SELECT count(*) INTO v_exact_ln
    FROM public.program_routines l
    JOIN jsonb_to_recordset(k_new) AS r(id uuid, link_id uuid, session_key text, sort_order int) ON r.link_id = l.id
   WHERE l.program_id = k_program AND l.routine_id = r.id AND l.session_key = r.session_key
     AND l.sort_order = r.sort_order AND l.legacy_program_workout_id IS NULL;

  IF v_rt_ids = 0 AND v_ln_ids = 0 AND v_keys = 0 AND v_sorts = 0 AND v_names = 0
     AND v_bwf_links = 3 AND v_plat = 51 AND v_pub = 50 AND v_priv = 1 AND v_links = 50 THEN
    v_state := 'FRESH';
  ELSIF v_rt_ids = 6 AND v_ln_ids = 6 AND v_exact_rt = 6 AND v_exact_ln = 6
     AND v_keys = 6 AND v_sorts = 6 AND v_names = 6
     AND v_bwf_links = 9 AND v_plat = 57 AND v_pub = 50 AND v_priv = 7 AND v_links = 56 THEN
    v_state := 'REPLAY';
  ELSE
    RAISE EXCEPTION 'cp4d aborted (DIVERGED): ids %/% exact %/% keys % sorts % names % bwf_links % platform %/%/% links %',
      v_rt_ids, v_ln_ids, v_exact_rt, v_exact_ln, v_keys, v_sorts, v_names, v_bwf_links, v_plat, v_pub, v_priv, v_links;
  END IF;

  -- Baselines of everything that must not change (pre-existing rows only).
  SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C")) INTO b_plat_fp
    FROM public.workout_templates t
   WHERE t.is_platform AND t.id NOT IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_new) r);
  SELECT md5(string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C")) INTO b_links_fp
    FROM public.program_routines l
   WHERE l.id NOT IN (SELECT (r->>'link_id')::uuid FROM jsonb_array_elements(k_new) r);

  ------------------------------------------------------------- WRITE
  IF v_state = 'FRESH' THEN
    INSERT INTO public.workout_templates
      (id, user_id, name, exercises, source_program_slug, times_used, last_used_at, sort_order,
       description, goal, difficulty, tags, is_platform, visibility, source_workout_id)
    SELECT r.id, v_owner, r.name, r.exercises, NULL, 0, NULL, 0,
           NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL
      FROM jsonb_to_recordset(k_new) AS r(id uuid, name text, exercises jsonb);
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    IF v_ins <> 6 THEN RAISE EXCEPTION 'cp4d aborted: inserted % Routines, expected 6', v_ins; END IF;

    INSERT INTO public.program_routines
      (id, program_id, routine_id, session_key, sort_order, legacy_program_workout_id)
    SELECT r.link_id, k_program, r.id, r.session_key, r.sort_order, NULL
      FROM jsonb_to_recordset(k_new) AS r(id uuid, link_id uuid, session_key text, sort_order int);
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    IF v_ins <> 6 THEN RAISE EXCEPTION 'cp4d aborted: inserted % links, expected 6', v_ins; END IF;
  END IF;

  ---------------------------------------------------- POSTCONDITIONS
  -- Identical on FRESH and REPLAY.
  SELECT count(*) INTO v_exact_rt
    FROM public.workout_templates t
    JOIN jsonb_to_recordset(k_new) AS r(id uuid, name text, exercises jsonb) ON r.id = t.id
   WHERE t.user_id = v_owner AND t.name = r.name AND t.exercises = r.exercises
     AND t.is_platform AND t.visibility = 'private' AND t.goal = 'muscle'
     AND t.sort_order = 0 AND t.tags = '{}'::text[] AND t.times_used = 0
     AND t.description IS NULL AND t.difficulty IS NULL AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL AND t.last_used_at IS NULL;
  SELECT count(*) INTO v_exact_ln
    FROM public.program_routines l
    JOIN jsonb_to_recordset(k_new) AS r(id uuid, link_id uuid, session_key text, sort_order int) ON r.link_id = l.id
   WHERE l.program_id = k_program AND l.routine_id = r.id AND l.session_key = r.session_key
     AND l.sort_order = r.sort_order AND l.legacy_program_workout_id IS NULL;
  IF v_exact_rt <> 6 OR v_exact_ln <> 6 THEN
    RAISE EXCEPTION 'cp4d aborted: post-state exact match failed (Routines %, links %)', v_exact_rt, v_exact_ln;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE visibility = 'published'), count(*) FILTER (WHERE visibility = 'private')
    INTO v_plat, v_pub, v_priv FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO v_links FROM public.program_routines;
  IF v_plat <> 57 OR v_pub <> 50 OR v_priv <> 7 OR v_links <> 56 THEN
    RAISE EXCEPTION 'cp4d aborted: post totals platform %/%/% links %, expected 57/50/7 and 56', v_plat, v_pub, v_priv, v_links;
  END IF;
  IF (SELECT array_agg(session_key ORDER BY sort_order) FROM public.program_routines WHERE program_id = k_program)
     <> ARRAY['full_a','full_b','full_c'] || k_keys THEN
    RAISE EXCEPTION 'cp4d aborted: Bodyweight Foundations links are not exactly A/B/C plus the six new keys';
  END IF;

  IF (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C"))
        FROM public.workout_templates t
       WHERE t.is_platform AND t.id NOT IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_new) r))
     IS DISTINCT FROM b_plat_fp THEN
    RAISE EXCEPTION 'cp4d aborted: a pre-existing platform Routine changed';
  END IF;
  IF (SELECT md5(string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C"))
        FROM public.program_routines l
       WHERE l.id NOT IN (SELECT (r->>'link_id')::uuid FROM jsonb_array_elements(k_new) r))
     IS DISTINCT FROM b_links_fp THEN
    RAISE EXCEPTION 'cp4d aborted: a pre-existing Program link changed';
  END IF;
  IF (SELECT md5(row_to_json(p)::text) FROM public.programs p WHERE p.id = k_program) IS DISTINCT FROM k_program_md5 THEN
    RAISE EXCEPTION 'cp4d aborted: the Program row changed';
  END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE (id = k_routine_a AND md5(exercises::text) = k_md5_a)
      OR (id = k_routine_b AND md5(exercises::text) = k_md5_b)
      OR (id = k_routine_c AND md5(exercises::text) = k_md5_c);
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4d aborted: Full Body A/B/C changed'; END IF;
  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5 THEN
    RAISE EXCEPTION 'cp4d aborted: exercise catalog changed';
  END IF;
  IF (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_pool)) IS DISTINCT FROM k_pool_fp
     OR (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_forbidden)) IS DISTINCT FROM k_forbidden_fp THEN
    RAISE EXCEPTION 'cp4d aborted: a reviewed catalog exercise changed during the migration';
  END IF;

  -- Direct proof of write scope: the ONLY rows stamped by this transaction are
  -- the six new Routines and six new links (FRESH) or none at all (REPLAY).
  v_xid := pg_current_xact_id()::xid;
  IF v_state = 'FRESH' THEN v_m := 6; ELSE v_m := 0; END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE xmin = v_xid AND id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_new) r);
  IF v_n <> v_m OR (SELECT count(*) FROM public.workout_templates WHERE xmin = v_xid) <> v_m THEN
    RAISE EXCEPTION 'cp4d aborted: Routine write scope % (of %), expected exactly the six new rows', v_n, v_m;
  END IF;
  SELECT count(*) INTO v_n FROM public.program_routines
   WHERE xmin = v_xid AND id IN (SELECT (r->>'link_id')::uuid FROM jsonb_array_elements(k_new) r);
  IF v_n <> v_m OR (SELECT count(*) FROM public.program_routines WHERE xmin = v_xid) <> v_m THEN
    RAISE EXCEPTION 'cp4d aborted: link write scope % (of %), expected exactly the six new rows', v_n, v_m;
  END IF;
  SELECT (SELECT count(*) FROM public.programs WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.program_workouts WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.exercises WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.user_programs WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.workouts WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.workout_exercises WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.workout_sets WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.personal_records WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.user_exercise_favorites WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.user_exercises WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.purchases WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.profiles WHERE xmin = v_xid)
    INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4d aborted: % row(s) outside the 12 new rows were written', v_n; END IF;

  RAISE NOTICE 'cp4d %: % Bodyweight Foundations private Routines and links (platform %/%/%, links %).',
    v_state, v_m, v_plat, v_pub, v_priv, v_links;
END
$mig$;