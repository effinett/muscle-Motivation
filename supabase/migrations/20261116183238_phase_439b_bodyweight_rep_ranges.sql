-- phase_439b_bodyweight_rep_ranges
-- Bodyweight Foundations prescription content only (owner-approved 2026-11-16).
--
-- Gives every listed bodyweight slot room to progress, so no slot is a fixed
-- target and the top of each range can serve as its step-up ceiling:
--   Full Body B {2} Superman: 10-12 -> 10-15
--   Full Body B {3} Dead Bug: 10-10 -> 8-12
--   Full Body B {4} Bird Dog: 8-10 -> 8-12
--   Full Body C {3} Superman: 10-12 -> 10-15
--   Full Body C {4} Mountain Climber: 30-30 -> 20-40
--   Lower Body B {2} Lateral Lunge: 6-8 -> 8-12
--   Lower Body B {3} Superman: 10-12 -> 10-15
--   Push & Core A {2} Dead Bug: 8-10 -> 8-12
--   Push & Core B {4} Bird Dog: 6-8 -> 8-12
-- Changes ONLY reps_low / reps_high at those 9 paths on five platform Routines.
-- Every other key, entry and array order is preserved, and each new array is PROVEN
-- (below) to equal its old array with only those paths changed. Names, sets, rest,
-- notes, exercise ids, Routine identity, publication, the Program, its links,
-- schedules and the exercise catalog are untouched. No INSERT, DELETE or DDL.
--
-- Three-state machine over the five arrays:
--   FRESH    all five = OLD  -> update all five, verify
--   REPLAY   all five = NEW  -> verified no-op
--   DIVERGED anything else   -> abort (nothing written)
-- One DO statement: it commits or rolls back as a unit.
DO $mig$
DECLARE
  k_slug CONSTANT text := 'bodyweight_foundations';
  k_fb_b_id  CONSTANT uuid  := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_fb_b_old CONSTANT jsonb := $fb_b_old$[{"name":"Push-Up","sets":4,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","reps_low":6,"rest_sec":75,"reps_high":12,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":15,"rest_sec":60,"reps_high":30,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Superman","sets":3,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":12,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Dead Bug","sets":3,"notes":"Reps are per side.","reps_low":10,"rest_sec":45,"reps_high":10,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bird Dog","sets":2,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":10,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$fb_b_old$::jsonb;
  k_fb_b_new CONSTANT jsonb := $fb_b_new$[{"name":"Push-Up","sets":4,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.","reps_low":6,"rest_sec":75,"reps_high":12,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":15,"rest_sec":60,"reps_high":30,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Superman","sets":3,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":15,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Dead Bug","sets":3,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Bird Dog","sets":2,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$fb_b_new$::jsonb;
  k_fb_c_id  CONSTANT uuid  := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  k_fb_c_old CONSTANT jsonb := $fb_c_old$[{"name":"Glute Bridge","sets":3,"notes":"","reps_low":12,"rest_sec":60,"reps_high":15,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Split Squat","sets":3,"notes":"Reps are per leg.","reps_low":8,"rest_sec":75,"reps_high":12,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Wall Sit","sets":2,"notes":"Hold time in seconds.","reps_low":30,"rest_sec":60,"reps_high":45,"exercise_id":"7948f9c4-2ec1-432b-ad79-7f27c5961577"},{"name":"Superman","sets":2,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":12,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Mountain Climber","sets":2,"notes":"Work time in seconds.","reps_low":30,"rest_sec":45,"reps_high":30,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"Russian Twist","sets":2,"notes":"Reps are total, not per side.","reps_low":12,"rest_sec":45,"reps_high":16,"exercise_id":"e4015387-bed0-43e2-9129-4ca3c2b67414"}]$fb_c_old$::jsonb;
  k_fb_c_new CONSTANT jsonb := $fb_c_new$[{"name":"Glute Bridge","sets":3,"notes":"","reps_low":12,"rest_sec":60,"reps_high":15,"exercise_id":"ff15ede3-a361-415a-8e20-6a7244bad0b3"},{"name":"Split Squat","sets":3,"notes":"Reps are per leg.","reps_low":8,"rest_sec":75,"reps_high":12,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Wall Sit","sets":2,"notes":"Hold time in seconds.","reps_low":30,"rest_sec":60,"reps_high":45,"exercise_id":"7948f9c4-2ec1-432b-ad79-7f27c5961577"},{"name":"Superman","sets":2,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":15,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Mountain Climber","sets":2,"notes":"Work time in seconds.","reps_low":20,"rest_sec":45,"reps_high":40,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"Russian Twist","sets":2,"notes":"Reps are total, not per side.","reps_low":12,"rest_sec":45,"reps_high":16,"exercise_id":"e4015387-bed0-43e2-9129-4ca3c2b67414"}]$fb_c_new$::jsonb;
  k_lower_b_id  CONSTANT uuid  := '50081b09-7f82-591c-842f-1792f2cb4b27';
  k_lower_b_old CONSTANT jsonb := $lower_b_old$[{"name":"Split Squat","sets":3,"notes":"Reps are per leg. Lower only as far as you can control.","reps_low":6,"rest_sec":75,"reps_high":10,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Single-Leg Glute Bridge","sets":3,"notes":"Reps are per leg.","reps_low":8,"rest_sec":60,"reps_high":12,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Lateral Lunge","sets":2,"notes":"Reps are per leg. Sit back only as deep as is comfortable.","reps_low":6,"rest_sec":60,"reps_high":8,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Superman","sets":3,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":12,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Kneeling Hip Flexor Stretch","sets":2,"notes":"Hold time in seconds, per side.","reps_low":30,"rest_sec":30,"reps_high":45,"exercise_id":"6962172b-18eb-4def-88d3-acc67c62f9ce"}]$lower_b_old$::jsonb;
  k_lower_b_new CONSTANT jsonb := $lower_b_new$[{"name":"Split Squat","sets":3,"notes":"Reps are per leg. Lower only as far as you can control.","reps_low":6,"rest_sec":75,"reps_high":10,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Single-Leg Glute Bridge","sets":3,"notes":"Reps are per leg.","reps_low":8,"rest_sec":60,"reps_high":12,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Lateral Lunge","sets":2,"notes":"Reps are per leg. Sit back only as deep as is comfortable.","reps_low":8,"rest_sec":60,"reps_high":12,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Superman","sets":3,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","reps_low":10,"rest_sec":45,"reps_high":15,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Kneeling Hip Flexor Stretch","sets":2,"notes":"Hold time in seconds, per side.","reps_low":30,"rest_sec":30,"reps_high":45,"exercise_id":"6962172b-18eb-4def-88d3-acc67c62f9ce"}]$lower_b_new$::jsonb;
  k_push_core_a_id  CONSTANT uuid  := 'b654c396-08a2-5ec9-bf7a-f901e797c77b';
  k_push_core_a_old CONSTANT jsonb := $push_core_a_old$[{"name":"Wall Push-Up","sets":3,"notes":"Ready for more? Use Swap before logging sets: Knee Push-Up, then Push-Up. Swap applies to this workout only.","reps_low":10,"rest_sec":60,"reps_high":15,"exercise_id":"784a0508-84c3-42a6-98b1-c00cc780e5cd"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":15,"rest_sec":60,"reps_high":30,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Dead Bug","sets":3,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":10,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Plank","sets":3,"notes":"Hold time in seconds, on your forearms.","reps_low":20,"rest_sec":45,"reps_high":40,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"},{"name":"Wall Slide","sets":2,"notes":"Work time in seconds. Keep your lower back against the wall.","reps_low":30,"rest_sec":30,"reps_high":45,"exercise_id":"e3f12784-cf40-4aa5-ae41-6770416c4d1f"}]$push_core_a_old$::jsonb;
  k_push_core_a_new CONSTANT jsonb := $push_core_a_new$[{"name":"Wall Push-Up","sets":3,"notes":"Ready for more? Use Swap before logging sets: Knee Push-Up, then Push-Up. Swap applies to this workout only.","reps_low":10,"rest_sec":60,"reps_high":15,"exercise_id":"784a0508-84c3-42a6-98b1-c00cc780e5cd"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":15,"rest_sec":60,"reps_high":30,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Dead Bug","sets":3,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"},{"name":"Plank","sets":3,"notes":"Hold time in seconds, on your forearms.","reps_low":20,"rest_sec":45,"reps_high":40,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"},{"name":"Wall Slide","sets":2,"notes":"Work time in seconds. Keep your lower back against the wall.","reps_low":30,"rest_sec":30,"reps_high":45,"exercise_id":"e3f12784-cf40-4aa5-ae41-6770416c4d1f"}]$push_core_a_new$::jsonb;
  k_push_core_b_id  CONSTANT uuid  := '7fb1a573-1ff3-59a5-ae72-e4c91a0e2a78';
  k_push_core_b_old CONSTANT jsonb := $push_core_b_old$[{"name":"Knee Push-Up","sets":3,"notes":"Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only.","reps_low":8,"rest_sec":75,"reps_high":12,"exercise_id":"a1bb3980-ae49-48ce-a0b5-91bffd5daeda"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":20,"rest_sec":60,"reps_high":40,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Side Plank","sets":2,"notes":"Hold time in seconds, per side. Drop your bottom knee to make it easier.","reps_low":15,"rest_sec":45,"reps_high":30,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"},{"name":"Reverse Crunch","sets":3,"notes":"Curl your hips up with control, without swinging.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"a224a468-28c0-4ba2-b6f9-c8a3f45d2147"},{"name":"Bird Dog","sets":2,"notes":"Reps are per side.","reps_low":6,"rest_sec":45,"reps_high":8,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$push_core_b_old$::jsonb;
  k_push_core_b_new CONSTANT jsonb := $push_core_b_new$[{"name":"Knee Push-Up","sets":3,"notes":"Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only.","reps_low":8,"rest_sec":75,"reps_high":12,"exercise_id":"a1bb3980-ae49-48ce-a0b5-91bffd5daeda"},{"name":"Pike Lean","sets":3,"notes":"Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.","reps_low":20,"rest_sec":60,"reps_high":40,"exercise_id":"c3d81925-04dc-4caf-b5ef-5b42740028e8"},{"name":"Side Plank","sets":2,"notes":"Hold time in seconds, per side. Drop your bottom knee to make it easier.","reps_low":15,"rest_sec":45,"reps_high":30,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"},{"name":"Reverse Crunch","sets":3,"notes":"Curl your hips up with control, without swinging.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"a224a468-28c0-4ba2-b6f9-c8a3f45d2147"},{"name":"Bird Dog","sets":2,"notes":"Reps are per side.","reps_low":8,"rest_sec":45,"reps_high":12,"exercise_id":"d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56"}]$push_core_b_new$::jsonb;
  v_cur jsonb; v_old_n int := 0; v_new_n int := 0; v_n int; v_upd int;
  b_program_row text; b_links_rows text; b_other_fp text;
BEGIN
  PERFORM 1 FROM public.workout_templates
   WHERE id IN (k_fb_b_id, k_fb_c_id, k_lower_b_id, k_push_core_a_id, k_push_core_b_id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.programs WHERE slug = k_slug FOR SHARE;

  ------------------------------------------------- SELF-CHECK OF THE EDIT
  IF jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(k_fb_b_old, '{2,reps_low}', '10'), '{2,reps_high}', '15'), '{3,reps_low}', '8'), '{3,reps_high}', '12'), '{4,reps_low}', '8'), '{4,reps_high}', '12') <> k_fb_b_new THEN
    RAISE EXCEPTION 'rep ranges aborted: Full Body B NEW is not OLD with only the approved ranges changed';
  END IF;
  IF jsonb_set(jsonb_set(jsonb_set(jsonb_set(k_fb_c_old, '{3,reps_low}', '10'), '{3,reps_high}', '15'), '{4,reps_low}', '20'), '{4,reps_high}', '40') <> k_fb_c_new THEN
    RAISE EXCEPTION 'rep ranges aborted: Full Body C NEW is not OLD with only the approved ranges changed';
  END IF;
  IF jsonb_set(jsonb_set(jsonb_set(jsonb_set(k_lower_b_old, '{2,reps_low}', '8'), '{2,reps_high}', '12'), '{3,reps_low}', '10'), '{3,reps_high}', '15') <> k_lower_b_new THEN
    RAISE EXCEPTION 'rep ranges aborted: Lower Body B NEW is not OLD with only the approved ranges changed';
  END IF;
  IF jsonb_set(jsonb_set(k_push_core_a_old, '{2,reps_low}', '8'), '{2,reps_high}', '12') <> k_push_core_a_new THEN
    RAISE EXCEPTION 'rep ranges aborted: Push & Core A NEW is not OLD with only the approved ranges changed';
  END IF;
  IF jsonb_set(jsonb_set(k_push_core_b_old, '{4,reps_low}', '8'), '{4,reps_high}', '12') <> k_push_core_b_new THEN
    RAISE EXCEPTION 'rep ranges aborted: Push & Core B NEW is not OLD with only the approved ranges changed';
  END IF;

  --------------------------------------------- PROGRAM + ROUTINE PRECONDITIONS
  SELECT count(*) INTO v_n FROM public.programs WHERE slug = k_slug AND status = 'published';
  IF v_n <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: % is not a single published Program', k_slug; END IF;
  SELECT count(*) INTO v_n FROM public.program_routines pr JOIN public.programs p ON p.id = pr.program_id
   WHERE p.slug = k_slug AND (
         (pr.routine_id = k_fb_b_id AND pr.session_key = 'full_b')
      OR          (pr.routine_id = k_fb_c_id AND pr.session_key = 'full_c')
      OR          (pr.routine_id = k_lower_b_id AND pr.session_key = 'lower_b')
      OR          (pr.routine_id = k_push_core_a_id AND pr.session_key = 'push_core_a')
      OR          (pr.routine_id = k_push_core_b_id AND pr.session_key = 'push_core_b'));
  IF v_n <> 5 THEN RAISE EXCEPTION 'rep ranges aborted: only % of 5 Routine links match', v_n; END IF;
  -- These Routines are linked to no other Program.
  SELECT count(*) INTO v_n FROM public.program_routines pr JOIN public.programs p ON p.id = pr.program_id
   WHERE p.slug <> k_slug AND pr.routine_id IN (k_fb_b_id, k_fb_c_id, k_lower_b_id, k_push_core_a_id, k_push_core_b_id);
  IF v_n <> 0 THEN RAISE EXCEPTION 'rep ranges aborted: a Routine is shared with another Program'; END IF;
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE is_platform AND visibility = 'published' AND (
         (id = k_fb_b_id AND name = 'Full Body B')
      OR          (id = k_fb_c_id AND name = 'Full Body C')
      OR          (id = k_lower_b_id AND name = 'Lower Body B')
      OR          (id = k_push_core_a_id AND name = 'Push & Core A')
      OR          (id = k_push_core_b_id AND name = 'Push & Core B'));
  IF v_n <> 5 THEN RAISE EXCEPTION 'rep ranges aborted: only % of 5 Routines are the published platform Routines', v_n; END IF;

  ------------------------------------------------- BASELINE (under locks)
  SELECT row_to_json(p)::text INTO b_program_row FROM public.programs p WHERE p.slug = k_slug;
  SELECT string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C") INTO b_links_rows
    FROM public.program_routines l JOIN public.programs p ON p.id = l.program_id WHERE p.slug = k_slug;
  SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C")) INTO b_other_fp
    FROM public.workout_templates t WHERE t.is_platform AND t.id NOT IN (k_fb_b_id, k_fb_c_id, k_lower_b_id, k_push_core_a_id, k_push_core_b_id);

  ---------------------------------------------------------- CLASSIFY
  SELECT exercises INTO v_cur FROM public.workout_templates WHERE id = k_fb_b_id;
  IF v_cur = k_fb_b_old THEN v_old_n := v_old_n + 1; ELSIF v_cur = k_fb_b_new THEN v_new_n := v_new_n + 1; END IF;
  SELECT exercises INTO v_cur FROM public.workout_templates WHERE id = k_fb_c_id;
  IF v_cur = k_fb_c_old THEN v_old_n := v_old_n + 1; ELSIF v_cur = k_fb_c_new THEN v_new_n := v_new_n + 1; END IF;
  SELECT exercises INTO v_cur FROM public.workout_templates WHERE id = k_lower_b_id;
  IF v_cur = k_lower_b_old THEN v_old_n := v_old_n + 1; ELSIF v_cur = k_lower_b_new THEN v_new_n := v_new_n + 1; END IF;
  SELECT exercises INTO v_cur FROM public.workout_templates WHERE id = k_push_core_a_id;
  IF v_cur = k_push_core_a_old THEN v_old_n := v_old_n + 1; ELSIF v_cur = k_push_core_a_new THEN v_new_n := v_new_n + 1; END IF;
  SELECT exercises INTO v_cur FROM public.workout_templates WHERE id = k_push_core_b_id;
  IF v_cur = k_push_core_b_old THEN v_old_n := v_old_n + 1; ELSIF v_cur = k_push_core_b_new THEN v_new_n := v_new_n + 1; END IF;

  IF v_old_n = 5 THEN
    ------------------------------------------------------------- WRITE (FRESH)
    UPDATE public.workout_templates SET exercises = k_fb_b_new WHERE id = k_fb_b_id AND exercises = k_fb_b_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: Full Body B update affected % rows', v_upd; END IF;
    UPDATE public.workout_templates SET exercises = k_fb_c_new WHERE id = k_fb_c_id AND exercises = k_fb_c_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: Full Body C update affected % rows', v_upd; END IF;
    UPDATE public.workout_templates SET exercises = k_lower_b_new WHERE id = k_lower_b_id AND exercises = k_lower_b_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: Lower Body B update affected % rows', v_upd; END IF;
    UPDATE public.workout_templates SET exercises = k_push_core_a_new WHERE id = k_push_core_a_id AND exercises = k_push_core_a_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: Push & Core A update affected % rows', v_upd; END IF;
    UPDATE public.workout_templates SET exercises = k_push_core_b_new WHERE id = k_push_core_b_id AND exercises = k_push_core_b_old;
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    IF v_upd <> 1 THEN RAISE EXCEPTION 'rep ranges aborted: Push & Core B update affected % rows', v_upd; END IF;
  ELSIF v_new_n <> 5 THEN
    RAISE EXCEPTION 'rep ranges aborted (DIVERGED): % at OLD, % at NEW of 5', v_old_n, v_new_n;
  END IF;

  ---------------------------------------------------- POSTCONDITIONS (FRESH and REPLAY)
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_fb_b_id) <> k_fb_b_new
    THEN RAISE EXCEPTION 'rep ranges aborted: Full Body B post-state mismatch'; END IF;
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_fb_c_id) <> k_fb_c_new
    THEN RAISE EXCEPTION 'rep ranges aborted: Full Body C post-state mismatch'; END IF;
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_lower_b_id) <> k_lower_b_new
    THEN RAISE EXCEPTION 'rep ranges aborted: Lower Body B post-state mismatch'; END IF;
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_push_core_a_id) <> k_push_core_a_new
    THEN RAISE EXCEPTION 'rep ranges aborted: Push & Core A post-state mismatch'; END IF;
  IF (SELECT exercises FROM public.workout_templates WHERE id = k_push_core_b_id) <> k_push_core_b_new
    THEN RAISE EXCEPTION 'rep ranges aborted: Push & Core B post-state mismatch'; END IF;
  IF (SELECT row_to_json(p)::text FROM public.programs p WHERE p.slug = k_slug) IS DISTINCT FROM b_program_row
    THEN RAISE EXCEPTION 'rep ranges aborted: the Program row changed'; END IF;
  IF (SELECT string_agg(row_to_json(l)::text, '|' ORDER BY l.id::text COLLATE "C")
        FROM public.program_routines l JOIN public.programs p ON p.id = l.program_id WHERE p.slug = k_slug) IS DISTINCT FROM b_links_rows
    THEN RAISE EXCEPTION 'rep ranges aborted: a Program link changed'; END IF;
  IF (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY t.id::text COLLATE "C"))
        FROM public.workout_templates t WHERE t.is_platform AND t.id NOT IN (k_fb_b_id, k_fb_c_id, k_lower_b_id, k_push_core_a_id, k_push_core_b_id)) IS DISTINCT FROM b_other_fp
    THEN RAISE EXCEPTION 'rep ranges aborted: another platform Routine changed'; END IF;
  -- No bodyweight slot anywhere in the Program is a fixed target any more.
  SELECT count(*) INTO v_n FROM public.program_routines pr JOIN public.programs p ON p.id = pr.program_id
    JOIN public.workout_templates t ON t.id = pr.routine_id, jsonb_array_elements(t.exercises) e
   WHERE p.slug = k_slug AND (e->>'reps_low')::int >= (e->>'reps_high')::int;
  IF v_n <> 0 THEN RAISE EXCEPTION 'rep ranges aborted: % fixed or inverted ranges remain', v_n; END IF;
END
$mig$;
