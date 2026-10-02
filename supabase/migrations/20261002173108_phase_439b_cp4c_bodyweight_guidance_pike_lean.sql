-- phase_439b_cp4c_bodyweight_guidance_pike_lean
-- Phase 4.3.9B CP4c. Bodyweight Foundations prescription content only.
--
-- Changes EXACTLY three JSON paths, on EXACTLY two platform Routines:
--   1. Full Body A {3,notes} (Push-Up): the Swap guidance now names the full
--      beginner path (Knee Push-Up, then Wall Push-Up).
--   2. Full Body B {0,notes} (Push-Up): the SAME text, so the one prescribed
--      Push-Up never gives contradictory guidance between sessions A and B.
--   3. Full Body B {1}: the Pike Push-Up prescription is replaced in place by
--      the time-tracked Pike Lean foundation (canonical exercise_id), with a
--      seconds target and guidance that says it prepares for — and does not
--      replace — the Pike Push-Up.
-- Every other key, every other entry and array order are preserved, and each
-- new array is PROVEN to differ from its old array at exactly those paths.
--
-- Out of scope and asserted unchanged: Full Body C, every other Routine, the
-- Program row and its publication state, all program_routines links, the
-- exercise catalog (159 / dec5ac37…), and all user state. No DELETE, no catalog
-- UPDATE, no DROP. Routine identity (ids), Program links and updated_at are not
-- touched (no trigger exists; matching the prior Bodyweight content migration).
--
-- Three-state machine on the two exercise arrays:
--   FRESH    A = A_OLD and B = B_OLD  → update both, verify every postcondition
--   REPLAY   A = A_NEW and B = B_NEW  → verified no-op, writes nothing
--   DIVERGED anything else (incl. one array changed, the other not) → abort
-- One DO statement: it commits or rolls back as a unit.
DO $mig$
DECLARE
  k_program  CONSTANT uuid := 'e8c5a1f6-5d74-4bc9-8ea5-4a7c1b9d65d8';
  k_slug     CONSTANT text := 'bodyweight_foundations';
  k_link_a   CONSTANT uuid := 'f9d6b2a7-6e85-4cda-9fb6-5b8d2cae76e9';
  k_link_b   CONSTANT uuid := '0ae7c3b8-7f96-4deb-8ac7-6c9e3dbf87fa';
  k_link_c   CONSTANT uuid := '1bf8d4c9-80a7-4efc-9bd8-7daf4ecf980b';
  k_routine_a CONSTANT uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_routine_b CONSTANT uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_routine_c CONSTANT uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  k_pike_lean CONSTANT uuid := 'c3d81925-04dc-4caf-b5ef-5b42740028e8';
  k_c_md5     CONSTANT text := 'a9b1d9785031b8b47799a3a2cc9d05ac';
  k_cat_n     CONSTANT int  := 159;
  k_cat_md5   CONSTANT text := 'dec5ac379151ad7d0f6463820dc76dc8';

  k_a_old CONSTANT jsonb := $a_old$[{"name":"Bodyweight Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"97501496-7f81-4552-82ab-d3f326b8ff06"},{"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Push-Up","sets":2,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap to choose Knee Push-Up before logging sets. Swap applies to this workout only — repeat it next session.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Side Plank","sets":2,"reps_low":20,"reps_high":35,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]$a_old$::jsonb;
  k_a_new CONSTANT jsonb := $a_new$[{"name":"Bodyweight Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"97501496-7f81-4552-82ab-d3f326b8ff06"},{"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Push-Up","sets":2,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Side Plank","sets":2,"reps_low":20,"reps_high":35,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]$a_new$::jsonb;
  k_b_old CONSTANT jsonb := $b_old$[{"name":"Push-Up","sets":4,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap to choose Knee Push-Up before logging sets. Swap applies to this workout only — repeat it next session.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Pike Push-Up","sets":3,"reps_low":6,"reps_high":10,"notes":"To regress, raise your hands or shorten the range. Do not switch to Knee Push-Up — it trains a different pattern.","rest_sec":75,"exercise_id":"b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34"},{"name":"Superman","sets":3,"reps_low":10,"reps_high":12,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bird Dog","sets":2,"reps_low":8,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$b_old$::jsonb;
  k_b_new CONSTANT jsonb := $b_new$[{"name":"Push-Up","sets":4,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Pike Lean","sets":3,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","rest_sec":60,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Superman","sets":3,"reps_low":10,"reps_high":12,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bird Dog","sets":2,"reps_low":8,"reps_high":10,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$b_new$::jsonb;
  k_push_note CONSTANT text := $pn$Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.$pn$;
  k_pike_entry CONSTANT jsonb := $pe${"name":"Pike Lean","sets":3,"reps_low":15,"reps_high":30,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","rest_sec":60,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"}$pe$::jsonb;

  v_a jsonb; v_b jsonb; v_c jsonb; v_state text; v_n int; v_upd int;
  v_xid xid;
  b_programs int; b_published int; b_links int; b_routines int; b_platform_pub int;
  b_platform_fp text; b_c_row text; b_program_row text; b_links_rows text;
BEGIN
  ------------------------------------------------------------- ROW LOCKS
  -- Narrowest scope PostgreSQL offers: row locks, not table locks. The three
  -- Routine rows are locked FOR UPDATE (two are written, C is held so it
  -- cannot move under the identity check); the Program and its three links are
  -- held FOR SHARE so they cannot be edited or unpublished mid-migration.
  PERFORM 1 FROM public.workout_templates
   WHERE id IN (k_routine_a, k_routine_b, k_routine_c) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.programs WHERE id = k_program FOR SHARE;
  PERFORM 1 FROM public.program_routines WHERE program_id = k_program ORDER BY id FOR SHARE;

  ------------------------------------------------- SELF-CHECK OF THE EDIT
  -- The new arrays must differ from the old ones at EXACTLY the approved paths.
  IF jsonb_set(k_a_old, '{3,notes}', to_jsonb(k_push_note)) <> k_a_new THEN
    RAISE EXCEPTION 'cp4c aborted: A_NEW is not A_OLD with only {3,notes} changed';
  END IF;
  IF jsonb_set(jsonb_set(k_b_old, '{0,notes}', to_jsonb(k_push_note)), '{1}', k_pike_entry) <> k_b_new THEN
    RAISE EXCEPTION 'cp4c aborted: B_NEW is not B_OLD with only {0,notes} and {1} changed';
  END IF;
  -- Both prescribed Push-Up entries carry the identical approved text, and are
  -- otherwise unchanged (name, id, targets, rest), differing only in sets (2 vs 4).
  IF (k_a_new->3) - 'sets' <> (k_b_new->0) - 'sets'
     OR k_a_new->3->>'notes' <> k_push_note
     OR (k_a_old->3) - 'notes' <> (k_a_new->3) - 'notes'
     OR (k_b_old->0) - 'notes' <> (k_b_new->0) - 'notes' THEN
    RAISE EXCEPTION 'cp4c aborted: the two Push-Up entries are not consistent';
  END IF;
  IF jsonb_array_length(k_a_new) <> 5 OR jsonb_array_length(k_b_new) <> 5 THEN
    RAISE EXCEPTION 'cp4c aborted: expected 5 entries in A and B';
  END IF;
  IF k_pike_entry->>'exercise_id' <> k_pike_lean::text OR k_pike_entry->>'name' <> 'Pike Lean' THEN
    RAISE EXCEPTION 'cp4c aborted: replacement entry is not canonical Pike Lean';
  END IF;

  --------------------------------------------- PROGRAM + LINK PRECONDITIONS
  -- Resolution is by canonical ids AND relationship, never by name alone.
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id = k_program AND slug = k_slug AND status = 'published';
  IF v_n <> 1 THEN RAISE EXCEPTION 'cp4c aborted: Program % is not the published %', k_program, k_slug; END IF;

  SELECT count(*) INTO v_n FROM public.program_routines WHERE program_id = k_program;
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4c aborted: Program has % links, expected 3', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.program_routines
   WHERE program_id = k_program AND (
         (id = k_link_a AND session_key = 'full_a' AND routine_id = k_routine_a AND sort_order = 1)
      OR (id = k_link_b AND session_key = 'full_b' AND routine_id = k_routine_b AND sort_order = 2)
      OR (id = k_link_c AND session_key = 'full_c' AND routine_id = k_routine_c AND sort_order = 3));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4c aborted: only % of 3 links match the approved records', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE is_platform AND visibility = 'published' AND (
         (id = k_routine_a AND name = 'Full Body A')
      OR (id = k_routine_b AND name = 'Full Body B')
      OR (id = k_routine_c AND name = 'Full Body C'));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4c aborted: only % of 3 Routines are the published platform Routines', v_n; END IF;

  ------------------------------------------------- CATALOG PRECONDITIONS
  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5 THEN
    RAISE EXCEPTION 'cp4c aborted: exercise catalog is not 159 / %', k_cat_md5;
  END IF;
  SELECT count(*) INTO v_n FROM public.exercises
   WHERE id = k_pike_lean AND name = 'Pike Lean' AND is_active
     AND tracking_type = 'time' AND default_unit = 'sec' AND equipment = 'Bodyweight';
  IF v_n <> 1 THEN RAISE EXCEPTION 'cp4c aborted: canonical Pike Lean is missing or not time/sec'; END IF;
  -- Every exercise named or prescribed by the new A/B content must exist by id.
  SELECT count(*) INTO v_n FROM public.exercises x
   WHERE x.id IN (SELECT (el->>'exercise_id')::uuid FROM jsonb_array_elements(k_a_new || k_b_new) el)
     AND x.name = (SELECT el->>'name' FROM jsonb_array_elements(k_a_new || k_b_new) el
                    WHERE (el->>'exercise_id')::uuid = x.id LIMIT 1);
  IF v_n <> 9 THEN RAISE EXCEPTION 'cp4c aborted: % of 9 prescribed exercises resolve by id + canonical name', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.exercises WHERE name IN ('Knee Push-Up', 'Wall Push-Up') AND is_active;
  IF v_n <> 2 THEN RAISE EXCEPTION 'cp4c aborted: the Swap guidance targets are not both in the catalog'; END IF;

  ------------------------------------------------- BASELINE (under locks)
  SELECT count(*) INTO b_programs  FROM public.programs;
  SELECT count(*) INTO b_published FROM public.programs WHERE status = 'published';
  SELECT count(*) INTO b_links     FROM public.program_routines;
  SELECT count(*) INTO b_routines  FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO b_platform_pub FROM public.workout_templates WHERE is_platform AND visibility = 'published';
  SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C")) INTO b_platform_fp
    FROM public.workout_templates t WHERE t.is_platform AND t.id NOT IN (k_routine_a, k_routine_b);
  SELECT row_to_json(t)::text INTO b_c_row FROM public.workout_templates t WHERE t.id = k_routine_c;
  SELECT row_to_json(p)::text INTO b_program_row FROM public.programs p WHERE p.id = k_program;
  SELECT string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C") INTO b_links_rows
    FROM public.program_routines l WHERE l.program_id = k_program;

  ---------------------------------------------------------- CLASSIFY
  SELECT exercises INTO v_a FROM public.workout_templates WHERE id = k_routine_a;
  SELECT exercises INTO v_b FROM public.workout_templates WHERE id = k_routine_b;
  SELECT exercises INTO v_c FROM public.workout_templates WHERE id = k_routine_c;
  IF md5(v_c::text) <> k_c_md5 THEN
    RAISE EXCEPTION 'cp4c aborted: Full Body C differs from its approved content (md5 %)', md5(v_c::text);
  END IF;

  IF v_a = k_a_old AND v_b = k_b_old THEN
    v_state := 'FRESH';
  ELSIF v_a = k_a_new AND v_b = k_b_new THEN
    v_state := 'REPLAY';
  ELSE
    RAISE EXCEPTION 'cp4c aborted (DIVERGED): A old=% new=%, B old=% new=%',
      v_a = k_a_old, v_a = k_a_new, v_b = k_b_old, v_b = k_b_new;
  END IF;

  ------------------------------------------------------------- WRITE
  IF v_state = 'FRESH' THEN
    -- Keyed by id AND the exact expected current array, so a concurrent edit
    -- can never be overwritten and no other row can be touched.
    UPDATE public.workout_templates SET exercises = k_a_new
     WHERE id = k_routine_a AND exercises = k_a_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'cp4c aborted: Full Body A update affected % rows', v_upd; END IF;
    UPDATE public.workout_templates SET exercises = k_b_new
     WHERE id = k_routine_b AND exercises = k_b_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'cp4c aborted: Full Body B update affected % rows', v_upd; END IF;
  END IF;

  ---------------------------------------------------- POSTCONDITIONS
  -- Identical on FRESH and REPLAY.
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_routine_a) <> k_a_new
    THEN RAISE EXCEPTION 'cp4c aborted: Full Body A post-state mismatch'; END IF;
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_routine_b) <> k_b_new
    THEN RAISE EXCEPTION 'cp4c aborted: Full Body B post-state mismatch'; END IF;
  IF (SELECT row_to_json(t)::text FROM public.workout_templates t WHERE t.id = k_routine_c) IS DISTINCT FROM b_c_row
    THEN RAISE EXCEPTION 'cp4c aborted: Full Body C changed'; END IF;

  -- A and B keep identity, name, ownership and publication; only exercises moved.
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE is_platform AND visibility = 'published' AND (
         (id = k_routine_a AND name = 'Full Body A')
      OR (id = k_routine_b AND name = 'Full Body B')
      OR (id = k_routine_c AND name = 'Full Body C'));
  IF v_n <> 3 THEN RAISE EXCEPTION 'cp4c aborted: a Routine lost its published platform state'; END IF;

  IF (SELECT row_to_json(p)::text FROM public.programs p WHERE p.id = k_program) IS DISTINCT FROM b_program_row
    THEN RAISE EXCEPTION 'cp4c aborted: the Program row changed'; END IF;
  IF (SELECT string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C")
        FROM public.program_routines l WHERE l.program_id = k_program) IS DISTINCT FROM b_links_rows
    THEN RAISE EXCEPTION 'cp4c aborted: a Program link changed'; END IF;

  IF (SELECT count(*) FROM public.programs) <> b_programs
     OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> b_published
     OR (SELECT count(*) FROM public.program_routines) <> b_links
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> b_routines
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform AND visibility = 'published') <> b_platform_pub
    THEN RAISE EXCEPTION 'cp4c aborted: a Program/link/Routine total changed'; END IF;

  IF (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C"))
        FROM public.workout_templates t WHERE t.is_platform AND t.id NOT IN (k_routine_a, k_routine_b))
     IS DISTINCT FROM b_platform_fp
    THEN RAISE EXCEPTION 'cp4c aborted: another platform Routine changed'; END IF;

  IF (SELECT count(*) FROM public.exercises) <> k_cat_n
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) FROM public.exercises) <> k_cat_md5
    THEN RAISE EXCEPTION 'cp4c aborted: exercise catalog changed'; END IF;

  -- Direct proof of write scope: the ONLY rows stamped by this transaction are
  -- Full Body A and B (FRESH) or none at all (REPLAY). Covers every user table,
  -- so no Routine, Program, prescription, enrolment, workout or record of any
  -- user can have been created or modified by this migration.
  v_xid := pg_current_xact_id()::xid;
  SELECT count(*) INTO v_n FROM public.workout_templates WHERE xmin = v_xid;
  IF v_n <> (CASE v_state WHEN 'FRESH' THEN 2 ELSE 0 END) THEN
    RAISE EXCEPTION 'cp4c aborted: % Routine row(s) written, expected %', v_n, CASE v_state WHEN 'FRESH' THEN 2 ELSE 0 END;
  END IF;
  IF v_state = 'FRESH' AND (SELECT count(*) FROM public.workout_templates
                             WHERE xmin = v_xid AND id IN (k_routine_a, k_routine_b)) <> 2 THEN
    RAISE EXCEPTION 'cp4c aborted: a Routine other than Full Body A/B was written';
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
  IF v_n <> 0 THEN RAISE EXCEPTION 'cp4c aborted: % row(s) outside Full Body A/B were written', v_n; END IF;

  RAISE NOTICE 'cp4c %: Push-Up guidance (A + B) + Full Body B Pike Push-Up -> Pike Lean. %',
    v_state, CASE v_state WHEN 'FRESH' THEN '2 Routine rows updated.' ELSE 'No write performed.' END;
END
$mig$;
