-- phase_439b_cp4e_publish_bodyweight_frequency_routines
-- Phase 4.3.9B CP4e-1. Publishes the six Bodyweight Foundations frequency
-- Routines that CP4d (migration 20261003000515) created as private drafts.
--
-- The ONLY write is one UPDATE that changes visibility 'private' -> 'published'
-- on exactly these six platform Routines, and nothing else on them:
--   4 push_core_a        Push & Core A          7 push_core_b       Push & Core B
--   5 lower_a            Lower Body A           8 lower_b           Lower Body B
--   6 conditioning_core  Conditioning & Core    9 mobility_recovery Mobility & Recovery
-- No INSERT, DELETE or DDL; no link, Program, schedule, catalog, enrolment,
-- workout, history, PR, favourite or purchase change; no updated_at write.
-- Every other platform Routine — including the private CP6 validation Routine —
-- is fingerprinted and must be byte-identical afterwards.
--
-- Publishing is safe before the CP4e-2 mapping ships: no frequency maps these
-- keys yet, and the CP4a containment keeps an unmapped linked Routine off the
-- Program page. The mapping must ship AFTER this, never before, or 4-6 day
-- users would see the schedule-unavailable state.
--
-- Guards: the Program, Full Body A/B/C and all nine Bodyweight Foundations links
-- must be exactly the approved state; each of the six must match its CP4d
-- record exactly (id, name, owner, metadata, md5 of its exercises, link); every
-- exercise they prescribe must be in the reviewed equipment-free pool, whose
-- catalog fingerprint must be unchanged; and the catalog keeps its 159 rows and
-- id checksum. The owner is DERIVED from Full Body A/B/C, so this file carries
-- no account identifier.
--
-- Three-state machine:
--   FRESH    all six exact and private, totals 57/50/7 and 56 links -> publish
--   REPLAY   all six exact and published, totals 57/56/1 and 56 links -> no-op
--   DIVERGED anything else -> abort
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
  k_keys      CONSTANT text[] := ARRAY['full_a','full_b','full_c','push_core_a','lower_a','conditioning_core','push_core_b','lower_b','mobility_recovery'];

  -- The reviewed equipment-free pool (CP4d k_pool) and its catalog fingerprint.
  k_pool      CONSTANT uuid[] := ARRAY['784a0508-84c3-42a6-98b1-c00cc780e5cd','a1bb3980-ae49-48ce-a0b5-91bffd5daeda','dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac','c3d81925-04dc-4caf-b5ef-5b42740028e8','b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34','c320bf46-9f16-4483-bd2f-9ae9e88b7ad5','be4abe1a-93fa-4e87-9250-2627fe45ad3c','9c8998ab-9713-43f4-940b-5f8feec39d3c','d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56','a224a468-28c0-4ba2-b6f9-c8a3f45d2147','694c48ac-9251-4fa7-bb25-23353048963c','ed45d50d-5411-4e47-8309-97314b94adfb','e3f12784-cf40-4aa5-ae41-6770416c4d1f','97501496-7f81-4552-82ab-d3f326b8ff06','d2812c92-d4c6-420c-b2d9-d2c5757871c9','a7942454-736c-4d84-980d-39b40298a1b2','eee8a605-10d6-41ad-9b79-65d626b598db','ff15ede3-a361-415a-8e20-6a7244bad0b3','da2d9535-6e82-4790-84c9-8e1a0d549718','c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45','7948f9c4-2ec1-432b-ad79-7f27c5961577','53c57e39-51e9-42e5-991a-3357bd610b4a','6962172b-18eb-4def-88d3-acc67c62f9ce','7fae5cd2-712d-4df2-982d-850091d10329','1b836b2c-af56-40a6-9afe-023c3ccd5361','41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5','6d50c3a6-0dde-46e4-bc3a-508c2f358803','ead731d6-bfdd-4119-bd0b-bb3092457e69','44ebe984-c8e9-4842-8617-7f54f1179d2b','b2168db4-fb33-4dd0-a8e2-ab5fa81677e4','4b0b5faa-4704-4959-a550-c01de705a540','fd10bcf3-a09f-41fe-aca5-7996972d496f','04429fae-c385-47dd-91ec-7e1fe3a4a83c','a3ffb069-e0ea-4d01-a038-f9f72b1dd7fe','0d28f8c9-7485-4b0a-9552-b56cf3c556bf','0b519d3f-6a32-4883-955c-ad9c87f7385f','c84d3609-cca3-4652-a1ee-b119105aac1a','e4015387-bed0-43e2-9129-4ca3c2b67414']::uuid[];
  k_pool_fp   CONSTANT text := 'a0afad4c9d6badf377a15afee96168ea';

  -- THE six records, exactly as CP4d created them (md5 = md5(exercises::text)).
  k_six CONSTANT jsonb := $six$[
    {"id":"b654c396-08a2-5ec9-bf7a-f901e797c77b","link_id":"bc291137-42de-5f96-b493-d1b50aab7fd6","session_key":"push_core_a","sort_order":4,"name":"Push & Core A","md5":"1fd033cb535f92f49efb299694e9efc7"},
    {"id":"f1699018-7e10-5d31-97f9-91b2555d1f29","link_id":"34d87501-141f-5e60-a62a-d6a0c3f4cc12","session_key":"lower_a","sort_order":5,"name":"Lower Body A","md5":"cc6c42773382618ddaf5948f3f637249"},
    {"id":"645bd86b-c15c-5096-9103-5da1d418bf2c","link_id":"7aafce9c-27a3-5bae-959d-ec94066d4f5d","session_key":"conditioning_core","sort_order":6,"name":"Conditioning & Core","md5":"4da538974f36e1dfc0ed7b1946a49ec6"},
    {"id":"7fb1a573-1ff3-59a5-ae72-e4c91a0e2a78","link_id":"db2d039d-5da0-569d-9abe-505094259168","session_key":"push_core_b","sort_order":7,"name":"Push & Core B","md5":"1204717d06d7387b716e23d575b99c04"},
    {"id":"50081b09-7f82-591c-842f-1792f2cb4b27","link_id":"279de6f6-2a95-5f6b-820a-769c8bb5519e","session_key":"lower_b","sort_order":8,"name":"Lower Body B","md5":"a8d01e5178027dd0fbe4e23574c072c2"},
    {"id":"58d0f941-51e4-5485-831b-a99521bf9c14","link_id":"b95ad56d-5cca-5a14-82de-832b87716f15","session_key":"mobility_recovery","sort_order":9,"name":"Mobility & Recovery","md5":"4fab45bb31c74309b62cbba170cdd69c"}
  ]$six$::jsonb;

  v_owner uuid; v_state text; v_n int; v_m int; v_upd int; v_xid xid;
  v_exact int; v_priv6 int; v_pub6 int;
  v_plat int; v_pub int; v_priv int; v_links int;
  b_other_fp text; b_links_fp text; b_six_fp text;
BEGIN
  ------------------------------------------------------------- ROW LOCKS
  -- Row locks only. The six are locked FOR UPDATE because this transaction
  -- writes them; everything they depend on is held FOR SHARE.
  PERFORM 1 FROM public.programs WHERE id = k_program FOR SHARE;
  PERFORM 1 FROM public.workout_templates
   WHERE id IN (k_routine_a, k_routine_b, k_routine_c) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.program_routines WHERE program_id = k_program ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.workout_templates
   WHERE id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.exercises WHERE id = ANY (k_pool) ORDER BY id FOR SHARE;
  SELECT count(DISTINCT id) INTO v_n FROM public.exercises WHERE id = ANY (k_pool);
  IF v_n <> 38 OR cardinality(k_pool) <> 38 THEN
    RAISE EXCEPTION 'cp4e aborted: % of 38 reviewed pool exercises locked', v_n;
  END IF;
  IF (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_pool)) IS DISTINCT FROM k_pool_fp THEN
    RAISE EXCEPTION 'cp4e aborted: a reviewed equipment-free pool exercise changed';
  END IF;

  ------------------------------------------- SELF-CHECKS ON THE RECORDS
  IF jsonb_array_length(k_six) <> 6
     OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(k_six) r) <> 6
     OR (SELECT array_agg(r->>'session_key' ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_six) r) <> k_keys[4:9]
     OR (SELECT array_agg((r->>'sort_order')::int ORDER BY (r->>'sort_order')::int) FROM jsonb_array_elements(k_six) r) <> ARRAY[4,5,6,7,8,9] THEN
    RAISE EXCEPTION 'cp4e aborted: the six records are not the approved CP4d set';
  END IF;

  --------------------------------------- CATALOG + PROGRAM PRECONDITIONS
  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5 THEN
    RAISE EXCEPTION 'cp4e aborted: exercise catalog is not % / %', k_cat_n, k_cat_md5;
  END IF;
  IF (SELECT md5(row_to_json(p)::text) FROM public.programs p WHERE p.id = k_program AND p.slug = k_slug AND p.status = 'published')
     IS DISTINCT FROM k_program_md5 THEN
    RAISE EXCEPTION 'cp4e aborted: the Bodyweight Foundations Program row is not the approved published record';
  END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE is_platform AND visibility = 'published' AND (
         (id = k_routine_a AND name = 'Full Body A' AND md5(exercises::text) = k_md5_a)
      OR (id = k_routine_b AND name = 'Full Body B' AND md5(exercises::text) = k_md5_b)
      OR (id = k_routine_c AND name = 'Full Body C' AND md5(exercises::text) = k_md5_c));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4e aborted: Full Body A/B/C differ from their approved content (% of 3)', v_n; END IF;
  SELECT count(DISTINCT user_id), min(user_id::text)::uuid INTO v_n, v_owner
    FROM public.workout_templates WHERE id IN (k_routine_a, k_routine_b, k_routine_c);
  IF v_n <> 1 OR v_owner IS NULL THEN
    RAISE EXCEPTION 'cp4e aborted: Full Body A/B/C do not share exactly one owner';
  END IF;

  -- All nine links, exactly: A/B/C at 1-3 and the six at 4-9, nothing else.
  SELECT count(*) INTO v_n FROM public.program_routines
   WHERE program_id = k_program AND legacy_program_workout_id IS NULL AND (
         (id = k_link_a AND session_key = 'full_a' AND routine_id = k_routine_a AND sort_order = 1)
      OR (id = k_link_b AND session_key = 'full_b' AND routine_id = k_routine_b AND sort_order = 2)
      OR (id = k_link_c AND session_key = 'full_c' AND routine_id = k_routine_c AND sort_order = 3));
  SELECT count(*) INTO v_m
    FROM public.program_routines l
    JOIN jsonb_to_recordset(k_six) AS r(id uuid, link_id uuid, session_key text, sort_order int) ON r.link_id = l.id
   WHERE l.program_id = k_program AND l.routine_id = r.id AND l.session_key = r.session_key
     AND l.sort_order = r.sort_order AND l.legacy_program_workout_id IS NULL;
  IF v_n <> 3 OR v_m <> 6
     OR (SELECT array_agg(session_key ORDER BY sort_order) FROM public.program_routines WHERE program_id = k_program) <> k_keys THEN
    RAISE EXCEPTION 'cp4e aborted: Bodyweight Foundations links are not exactly A/B/C plus the six (A/B/C %, six %)', v_n, v_m;
  END IF;

  -- Every exercise the six prescribe is in the reviewed equipment-free pool.
  SELECT count(*) INTO v_n
    FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r)
     AND (e->>'exercise_id' IS NULL OR NOT ((e->>'exercise_id')::uuid = ANY (k_pool)));
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4e aborted: % prescribed exercise(s) outside the equipment-free pool', v_n; END IF;

  ---------------------------------------------------------- CLASSIFY
  -- THE exact-record predicate: every field CP4d set, except visibility.
  SELECT count(*),
         count(*) FILTER (WHERE t.visibility = 'private'),
         count(*) FILTER (WHERE t.visibility = 'published')
    INTO v_exact, v_priv6, v_pub6
    FROM public.workout_templates t
    JOIN jsonb_to_recordset(k_six) AS r(id uuid, name text, md5 text) ON r.id = t.id
   WHERE t.user_id = v_owner AND t.name = r.name AND md5(t.exercises::text) = r.md5
     AND t.is_platform AND t.goal = 'muscle'
     AND t.sort_order = 0 AND t.tags = '{}'::text[] AND t.times_used = 0
     AND t.description IS NULL AND t.difficulty IS NULL AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL AND t.last_used_at IS NULL;
  SELECT count(*), count(*) FILTER (WHERE visibility = 'published'), count(*) FILTER (WHERE visibility = 'private')
    INTO v_plat, v_pub, v_priv FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO v_links FROM public.program_routines;

  IF v_exact = 6 AND v_priv6 = 6 AND v_plat = 57 AND v_pub = 50 AND v_priv = 7 AND v_links = 56 THEN
    v_state := 'FRESH';
  ELSIF v_exact = 6 AND v_pub6 = 6 AND v_plat = 57 AND v_pub = 56 AND v_priv = 1 AND v_links = 56 THEN
    v_state := 'REPLAY';
  ELSE
    RAISE EXCEPTION 'cp4e aborted (DIVERGED): exact % private % published % platform %/%/% links %',
      v_exact, v_priv6, v_pub6, v_plat, v_pub, v_priv, v_links;
  END IF;

  -- Baselines: every other platform Routine, every link, and the six themselves
  -- with visibility removed — the one field this migration may change.
  SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C")) INTO b_other_fp
    FROM public.workout_templates t
   WHERE t.is_platform AND t.id NOT IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r);
  SELECT md5(string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C")) INTO b_links_fp
    FROM public.program_routines l;
  SELECT md5(string_agg((to_jsonb(t) - 'visibility')::text, '|' ORDER BY t.id::text COLLATE "C")) INTO b_six_fp
    FROM public.workout_templates t
   WHERE t.id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r);

  ------------------------------------------------------------- WRITE
  IF v_state = 'FRESH' THEN
    UPDATE public.workout_templates SET visibility = 'published'
     WHERE id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r)
       AND is_platform AND visibility = 'private';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 6 THEN RAISE EXCEPTION 'cp4e aborted: published % Routines, expected 6', v_upd; END IF;
  END IF;

  ---------------------------------------------------- POSTCONDITIONS
  -- Identical on FRESH and REPLAY.
  SELECT count(*) INTO v_n
    FROM public.workout_templates t
    JOIN jsonb_to_recordset(k_six) AS r(id uuid, name text, md5 text) ON r.id = t.id
   WHERE t.user_id = v_owner AND t.name = r.name AND md5(t.exercises::text) = r.md5
     AND t.is_platform AND t.visibility = 'published' AND t.goal = 'muscle'
     AND t.sort_order = 0 AND t.tags = '{}'::text[] AND t.times_used = 0
     AND t.description IS NULL AND t.difficulty IS NULL AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL AND t.last_used_at IS NULL;
  IF v_n <> 6 THEN RAISE EXCEPTION 'cp4e aborted: post-state exact match failed (% of 6 published)', v_n; END IF;

  SELECT count(*), count(*) FILTER (WHERE visibility = 'published'), count(*) FILTER (WHERE visibility = 'private')
    INTO v_plat, v_pub, v_priv FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO v_links FROM public.program_routines;
  IF v_plat <> 57 OR v_pub <> 56 OR v_priv <> 1 OR v_links <> 56 THEN
    RAISE EXCEPTION 'cp4e aborted: post totals platform %/%/% links %, expected 57/56/1 and 56', v_plat, v_pub, v_priv, v_links;
  END IF;

  IF (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C"))
        FROM public.workout_templates t
       WHERE t.is_platform AND t.id NOT IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r))
     IS DISTINCT FROM b_other_fp THEN
    RAISE EXCEPTION 'cp4e aborted: another platform Routine changed';
  END IF;
  IF (SELECT md5(string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C")) FROM public.program_routines l)
     IS DISTINCT FROM b_links_fp THEN
    RAISE EXCEPTION 'cp4e aborted: a Program link changed';
  END IF;
  IF (SELECT md5(string_agg((to_jsonb(t) - 'visibility')::text, '|' ORDER BY t.id::text COLLATE "C"))
        FROM public.workout_templates t
       WHERE t.id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r))
     IS DISTINCT FROM b_six_fp THEN
    RAISE EXCEPTION 'cp4e aborted: a field other than visibility changed on the six';
  END IF;
  IF (SELECT md5(row_to_json(p)::text) FROM public.programs p WHERE p.id = k_program) IS DISTINCT FROM k_program_md5 THEN
    RAISE EXCEPTION 'cp4e aborted: the Program row changed';
  END IF;
  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5
     OR (SELECT md5(string_agg(jsonb_build_array(x.id, x.name, x.category, x.equipment, x.aliases, x.primary_muscle,
            x.secondary_muscles, x.movement_pattern, x.force_type, x.difficulty, x.is_bodyweight, x.is_unilateral,
            x.default_unit, x.tracking_type, x.instructions, x.tips, x.is_active)::text, '|' ORDER BY x.id::text COLLATE "C"))
        FROM public.exercises x WHERE x.id = ANY (k_pool)) IS DISTINCT FROM k_pool_fp THEN
    RAISE EXCEPTION 'cp4e aborted: the exercise catalog changed during the migration';
  END IF;

  -- Direct proof of write scope: the ONLY rows stamped by this transaction are
  -- the six published Routines (FRESH) or none at all (REPLAY).
  v_xid := pg_current_xact_id()::xid;
  IF v_state = 'FRESH' THEN v_m := 6; ELSE v_m := 0; END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE xmin = v_xid AND id IN (SELECT (r->>'id')::uuid FROM jsonb_array_elements(k_six) r);
  IF v_n <> v_m OR (SELECT count(*) FROM public.workout_templates WHERE xmin = v_xid) <> v_m THEN
    RAISE EXCEPTION 'cp4e aborted: Routine write scope % (of %), expected exactly the six', v_n, v_m;
  END IF;
  SELECT (SELECT count(*) FROM public.programs WHERE xmin = v_xid)
       + (SELECT count(*) FROM public.program_routines WHERE xmin = v_xid)
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
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4e aborted: % row(s) outside the six were written', v_n; END IF;

  RAISE NOTICE 'cp4e %: % Bodyweight Foundations Routines published (platform %/%/%, links %).',
    v_state, v_m, v_plat, v_pub, v_priv, v_links;
END
$mig$;