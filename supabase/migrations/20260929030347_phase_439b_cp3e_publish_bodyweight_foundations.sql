-- PUBLIC-REPOSITORY VARIANT of migration 20260929030347.
-- Identical to the migration applied in production except for ONE line: the
-- platform owner account id is read from the session setting
-- mm.platform_owner_id instead of being written here. Before replaying, supply it
-- from private recovery material:  SET mm.platform_owner_id = '<owner uuid>';
-- If it is not set, this migration fails immediately (fail-closed).
-- The exact applied text (md5 a046a5a74f4fd65210b48cca23c3b56a) is kept in the private recovery archive.
-- MM-VARIANT-HEADER-END
-- Phase 4.3.9B — CP3e. Guarded publication of Bodyweight Foundations.
-- Publishes exactly one Program (draft -> published) and exactly its three
-- linked platform Routines (private -> published), in that dependency order,
-- inside one transaction. No other field on any row may change.
--
-- The Program is resolved by its UNIQUE slug and its Routines strictly through
-- its own program_routines relationships, so no generated id is hardcoded.
-- That scoping is essential: the catalog contains a FOURTH private platform
-- Routine ("CP6 VALIDATION — DELETE / UNPUBLISH", linked to no Program), so a
-- migration that published "private platform Routines" would publish an
-- unrelated validation artifact. This one cannot reach it.
DO $$
DECLARE
  k_slug  constant text := 'bodyweight_foundations';
  k_owner constant uuid := current_setting('mm.platform_owner_id')::uuid;

  v_prog_id uuid;
  v_ra uuid; v_rb uuid; v_rc uuid;
  v_state text;
  v_n int; v_diff int; v_updated int;

  -- Baselines captured UNDER LOCK, so the deltas are measured against a state
  -- no concurrent writer can have moved.
  b_programs int; b_published_programs int; b_links int;
  b_platform int; b_platform_published int; b_exercises int;
BEGIN
  ------------------------------------------------------------------------------
  -- Locks, parents before children. Blocks concurrent writers; readers unaffected.
  ------------------------------------------------------------------------------
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO b_programs           FROM public.programs;
  SELECT count(*) INTO b_published_programs FROM public.programs WHERE status='published';
  SELECT count(*) INTO b_links              FROM public.program_routines;
  SELECT count(*) INTO b_platform           FROM public.workout_templates WHERE is_platform;
  SELECT count(*) INTO b_platform_published FROM public.workout_templates
                                            WHERE is_platform AND visibility='published';
  SELECT count(*) INTO b_exercises          FROM public.exercises;

  ------------------------------------------------------------------------------
  -- Resolve the target Program by slug. Exactly one row is required.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.programs WHERE slug = k_slug;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 Program for slug %, found %', k_slug, v_n;
  END IF;
  SELECT id INTO v_prog_id FROM public.programs WHERE slug = k_slug;

  ------------------------------------------------------------------------------
  -- Every NON-STATUS Program field must match the approved CP3c record. status
  -- is deliberately excluded here and asserted by the state machine below.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id = v_prog_id
     AND slug = k_slug
     AND name = 'Bodyweight Foundations'
     AND description = 'An equipment-free strength foundation focused on legs, pushing, core, and '
                       'training consistency. It does not replace balanced resistance training with '
                       'pulling movements.'
     AND goal = 'muscle'
     AND difficulty = 'Beginner – Intermediate'
     AND duration_weeks = 8
     AND recommended_days_per_week = 3
     AND equipment_summary = 'Bodyweight'
     AND included_with_membership IS TRUE
     AND standalone_purchasable IS FALSE
     AND sort_order = 4
     AND page_path = 'program-bodyweight.html';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORT: Program non-status fields diverge from the approved CP3c record';
  END IF;

  ------------------------------------------------------------------------------
  -- Exactly three links, exact session keys and sort order, no extras, no
  -- duplicates, each belonging to THIS Program, legacy pointer still NULL.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.program_routines WHERE program_id = v_prog_id;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 3 links, found %', v_n;
  END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT session_key, sort_order, legacy_program_workout_id
       FROM public.program_routines WHERE program_id = v_prog_id
     EXCEPT
     SELECT * FROM (VALUES ('full_a',1,NULL::uuid),('full_b',2,NULL::uuid),('full_c',3,NULL::uuid))
       AS x(session_key, sort_order, legacy_program_workout_id))
    UNION ALL
    (SELECT * FROM (VALUES ('full_a',1,NULL::uuid),('full_b',2,NULL::uuid),('full_c',3,NULL::uuid))
       AS x(session_key, sort_order, legacy_program_workout_id)
     EXCEPT
     SELECT session_key, sort_order, legacy_program_workout_id
       FROM public.program_routines WHERE program_id = v_prog_id)) d;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'ABORT: link set diverges from full_a/1, full_b/2, full_c/3 (% diffs)', v_diff;
  END IF;

  -- Resolve the three Routines strictly through this Program's own links.
  SELECT routine_id INTO v_ra FROM public.program_routines
   WHERE program_id = v_prog_id AND session_key = 'full_a';
  SELECT routine_id INTO v_rb FROM public.program_routines
   WHERE program_id = v_prog_id AND session_key = 'full_b';
  SELECT routine_id INTO v_rc FROM public.program_routines
   WHERE program_id = v_prog_id AND session_key = 'full_c';

  IF v_ra IS NULL OR v_rb IS NULL OR v_rc IS NULL THEN
    RAISE EXCEPTION 'ABORT: a session key did not resolve to a Routine';
  END IF;
  IF v_ra = v_rb OR v_rb = v_rc OR v_ra = v_rc THEN
    RAISE EXCEPTION 'ABORT: the three links must reference three DISTINCT Routines';
  END IF;

  ------------------------------------------------------------------------------
  -- Every NON-VISIBILITY Routine field must match the approved CP3c records.
  -- visibility is excluded here and asserted by the state machine below.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n
    FROM public.workout_templates t
    JOIN (VALUES (v_ra,'Full Body A',5),(v_rb,'Full Body B',5),(v_rc,'Full Body C',6))
      AS x(id, name, entries) ON t.id = x.id
   WHERE t.name = x.name
     AND jsonb_array_length(t.exercises) = x.entries
     AND t.user_id = k_owner
     AND t.is_platform IS TRUE
     AND t.goal = 'muscle'
     AND t.difficulty IS NULL
     AND t.description IS NULL
     AND t.tags = '{}'::text[]
     AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL
     AND t.times_used = 0
     AND t.last_used_at IS NULL
     AND t.sort_order = 0;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'ABORT: Routine non-visibility fields diverge (matched % of 3)', v_n;
  END IF;

  ------------------------------------------------------------------------------
  -- Prescription integrity: 16 entries, 14 distinct exercises, canonical shape,
  -- every reference resolving to an ACTIVE Bodyweight exercise, and the CP3d-2c
  -- guidance still present and unmutated.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc);
  IF v_n <> 16 THEN RAISE EXCEPTION 'ABORT: expected 16 entries, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (e->>'exercise_id')::uuid AS id
      FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
     WHERE t.id IN (v_ra, v_rb, v_rc)) q;
  IF v_n <> 14 THEN RAISE EXCEPTION 'ABORT: expected 14 distinct exercises, found %', v_n; END IF;

  IF EXISTS (SELECT 1 FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
              WHERE t.id IN (v_ra, v_rb, v_rc)
                AND (NOT (e ?& array['name','sets','reps_low','reps_high',
                                     'notes','rest_sec','exercise_id'])
                     OR (SELECT count(*) FROM jsonb_object_keys(e)) <> 7)) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is not the canonical 7-key shape';
  END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (e->>'exercise_id')::uuid AS id
      FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
     WHERE t.id IN (v_ra, v_rb, v_rc)) q
    JOIN public.exercises ex
      ON ex.id = q.id AND ex.is_active IS TRUE AND ex.equipment = 'Bodyweight';
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'ABORT: only % of 14 exercises are active and Bodyweight', v_n;
  END IF;

  -- Guidance the published experience depends on (CP3d-2c).
  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc) AND e->>'notes' LIKE '%Use Swap to choose Knee Push-Up%';
  IF v_n <> 2 THEN RAISE EXCEPTION 'ABORT: Push-Up Swap guidance count is %, expected 2', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc) AND e->>'notes' LIKE '%raise your hands or shorten the range%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: Pike regression guidance count is %, expected 1', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc)
     AND e->>'notes' LIKE '%Not a pulling exercise and not a substitute for rows%';
  IF v_n <> 2 THEN RAISE EXCEPTION 'ABORT: Superman non-pulling guidance count is %, expected 2', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc) AND e->>'notes' = 'Reps are total, not per side.';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: Russian Twist total-rep guidance count is %, expected 1', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc) AND e->>'notes' LIKE '%per leg%';
  IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: per-leg guidance count is %, expected 3', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
   WHERE t.id IN (v_ra, v_rb, v_rc) AND e->>'notes' LIKE '%seconds%';
  IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: timed guidance count is %, expected 3', v_n; END IF;

  ------------------------------------------------------------------------------
  -- No premature user state may exist for this Program.
  ------------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.user_programs WHERE program_slug = k_slug) <> 0
     OR (SELECT count(*) FROM public.workouts WHERE program_slug = k_slug) <> 0
     OR (SELECT count(*) FROM public.workouts WHERE template_id IN (v_ra, v_rb, v_rc)) <> 0
     OR (SELECT count(*) FROM public.program_workouts WHERE program_slug = k_slug) <> 0
     OR (SELECT count(*) FROM public.workout_templates WHERE source_program_slug = k_slug) <> 0
  THEN
    RAISE EXCEPTION 'ABORT: unexpected pre-existing state references this Program';
  END IF;

  ------------------------------------------------------------------------------
  -- Explicit three-state machine. No shared permissive branch.
  ------------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.workout_templates
   WHERE id IN (v_ra, v_rb, v_rc) AND visibility = 'private';

  IF (SELECT status FROM public.programs WHERE id = v_prog_id) = 'draft' AND v_n = 3 THEN
    v_state := 'fresh';
  ELSIF (SELECT status FROM public.programs WHERE id = v_prog_id) = 'published' AND v_n = 0
    AND (SELECT count(*) FROM public.workout_templates
          WHERE id IN (v_ra, v_rb, v_rc) AND visibility = 'published') = 3 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: not a clean FRESH or exact REPLAY state (program status=%, private routines=%)',
      (SELECT status FROM public.programs WHERE id = v_prog_id), v_n;
  END IF;

  IF v_state = 'fresh' THEN
    -- Routines FIRST, so the Program is never deliberately made live ahead of
    -- the sessions it promises.
    UPDATE public.workout_templates SET visibility = 'published'
     WHERE id IN (v_ra, v_rb, v_rc) AND visibility = 'private' AND is_platform IS TRUE;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 3 THEN
      RAISE EXCEPTION 'ABORT: Routine publish affected % rows, expected 3', v_updated;
    END IF;

    IF (SELECT count(*) FROM public.workout_templates
         WHERE id IN (v_ra, v_rb, v_rc) AND visibility = 'published' AND is_platform IS TRUE) <> 3
    THEN RAISE EXCEPTION 'ABORT: the three Routines are not all published'; END IF;

    UPDATE public.programs SET status = 'published'
     WHERE id = v_prog_id AND slug = k_slug AND status = 'draft';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'ABORT: Program publish affected % rows, expected 1', v_updated;
    END IF;
  END IF;

  ------------------------------------------------------------------------------
  -- Final postconditions. Identical on both paths.
  ------------------------------------------------------------------------------
  IF (SELECT count(*) FROM public.programs WHERE slug = k_slug) <> 1
    THEN RAISE EXCEPTION 'ABORT: post-state slug is not unique'; END IF;

  IF (SELECT status FROM public.programs WHERE id = v_prog_id) <> 'published'
    THEN RAISE EXCEPTION 'ABORT: post-state Program is not published'; END IF;

  -- Non-status Program fields must be untouched.
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id = v_prog_id AND slug = k_slug AND name = 'Bodyweight Foundations'
     AND description = 'An equipment-free strength foundation focused on legs, pushing, core, and '
                       'training consistency. It does not replace balanced resistance training with '
                       'pulling movements.'
     AND goal = 'muscle' AND difficulty = 'Beginner – Intermediate'
     AND duration_weeks = 8 AND recommended_days_per_week = 3
     AND equipment_summary = 'Bodyweight' AND included_with_membership IS TRUE
     AND standalone_purchasable IS FALSE AND sort_order = 4
     AND page_path = 'program-bodyweight.html';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: a non-status Program field changed'; END IF;

  IF (SELECT count(*) FROM public.program_routines WHERE program_id = v_prog_id) <> 3
    THEN RAISE EXCEPTION 'ABORT: post-state link count changed'; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT session_key, sort_order, routine_id
       FROM public.program_routines WHERE program_id = v_prog_id
     EXCEPT
     SELECT * FROM (VALUES ('full_a',1,v_ra),('full_b',2,v_rb),('full_c',3,v_rc))
       AS x(session_key, sort_order, routine_id))
    UNION ALL
    (SELECT * FROM (VALUES ('full_a',1,v_ra),('full_b',2,v_rb),('full_c',3,v_rc))
       AS x(session_key, sort_order, routine_id)
     EXCEPT
     SELECT session_key, sort_order, routine_id
       FROM public.program_routines WHERE program_id = v_prog_id)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: post-state links changed'; END IF;

  -- Non-visibility Routine fields must be untouched, and all three published.
  SELECT count(*) INTO v_n
    FROM public.workout_templates t
    JOIN (VALUES (v_ra,'Full Body A',5),(v_rb,'Full Body B',5),(v_rc,'Full Body C',6))
      AS x(id, name, entries) ON t.id = x.id
   WHERE t.name = x.name AND jsonb_array_length(t.exercises) = x.entries
     AND t.visibility = 'published' AND t.is_platform IS TRUE
     AND t.user_id = k_owner AND t.goal = 'muscle'
     AND t.difficulty IS NULL AND t.description IS NULL
     AND t.tags = '{}'::text[] AND t.source_program_slug IS NULL
     AND t.source_workout_id IS NULL AND t.times_used = 0
     AND t.last_used_at IS NULL AND t.sort_order = 0;
  IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: post-state Routines diverge (matched % of 3)', v_n; END IF;

  -- Prescriptions unchanged.
  IF (SELECT count(*) FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
       WHERE t.id IN (v_ra, v_rb, v_rc)) <> 16
    THEN RAISE EXCEPTION 'ABORT: post-state entry count changed'; END IF;

  IF (SELECT count(*) FROM (SELECT DISTINCT (e->>'exercise_id')::uuid AS id
        FROM public.workout_templates t, jsonb_array_elements(t.exercises) e
       WHERE t.id IN (v_ra, v_rb, v_rc)) q
      JOIN public.exercises ex ON ex.id = q.id
       AND ex.is_active IS TRUE AND ex.equipment = 'Bodyweight') <> 14
    THEN RAISE EXCEPTION 'ABORT: post-state exercise references changed'; END IF;

  -- Global totals: only the two publication counters may move, and only when
  -- this run actually published. Measured against the locked baseline.
  IF (SELECT count(*) FROM public.programs) <> b_programs
    THEN RAISE EXCEPTION 'ABORT: Program total changed'; END IF;
  IF (SELECT count(*) FROM public.program_routines) <> b_links
    THEN RAISE EXCEPTION 'ABORT: link total changed'; END IF;
  IF (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> b_platform
    THEN RAISE EXCEPTION 'ABORT: platform Routine total changed'; END IF;
  IF (SELECT count(*) FROM public.exercises) <> b_exercises
    THEN RAISE EXCEPTION 'ABORT: exercise total changed'; END IF;

  IF v_state = 'fresh' THEN
    IF (SELECT count(*) FROM public.programs WHERE status='published') <> b_published_programs + 1
      THEN RAISE EXCEPTION 'ABORT: published Program count did not increase by exactly 1'; END IF;
    IF (SELECT count(*) FROM public.workout_templates WHERE is_platform AND visibility='published')
       <> b_platform_published + 3
      THEN RAISE EXCEPTION 'ABORT: published platform Routine count did not increase by exactly 3'; END IF;
  ELSE
    IF (SELECT count(*) FROM public.programs WHERE status='published') <> b_published_programs
      THEN RAISE EXCEPTION 'ABORT: replay must not change the published Program count'; END IF;
    IF (SELECT count(*) FROM public.workout_templates WHERE is_platform AND visibility='published')
       <> b_platform_published
      THEN RAISE EXCEPTION 'ABORT: replay must not change the published Routine count'; END IF;
  END IF;

  -- No user-facing state may have been created by publication.
  IF (SELECT count(*) FROM public.user_programs WHERE program_slug = k_slug) <> 0
     OR (SELECT count(*) FROM public.workouts WHERE program_slug = k_slug) <> 0
     OR (SELECT count(*) FROM public.workouts WHERE template_id IN (v_ra, v_rb, v_rc)) <> 0
     OR (SELECT count(*) FROM public.purchases WHERE product = k_slug) <> 0
  THEN
    RAISE EXCEPTION 'ABORT: publication must not create enrolment, workout or purchase state';
  END IF;

  RAISE NOTICE 'phase_439b_cp3e_publish_bodyweight_foundations: state=%', v_state;
END $$;