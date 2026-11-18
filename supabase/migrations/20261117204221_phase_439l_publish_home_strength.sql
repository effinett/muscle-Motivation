-- Phase 4.3.9-L — Publish Home Strength (owner-approved 2026-11-17).
-- The ONLY writes: the four Home Strength Routines private -> published, then
-- the Home Strength Program draft -> published, in that dependency order,
-- inside one transaction. No other column on these rows, and no other row in
-- any table, may change. Creates no price, purchase, entitlement or enrolment;
-- access stays exactly as 20261117192044 set it (included with membership,
-- not standalone-purchasable).
--
-- Every target is named by id (20261117192044), never by "private platform
-- Routines": the catalog also holds an unrelated private validation Routine,
-- which this migration cannot reach.
DO $$
DECLARE
  k_prog  constant uuid := 'ed50e0e1-5280-4680-a730-2a6be2a46f0b';
  k_ra    constant uuid := '7ce33308-275a-49f8-bf69-fa97866bf0ac';
  k_rb    constant uuid := '0db8dde9-4182-49e1-af9b-4f105e39f0f6';
  k_rc    constant uuid := '5b40fa88-7a44-44ab-85c1-3292ba654011';
  k_rcc   constant uuid := '33b5ff59-1f1a-4093-bcf0-f4360219563d';
  k_links constant uuid[] := ARRAY['282d7a66-dc5c-4bbe-b78e-deee38a26b4f',
                                   'ced3db9a-8002-46fa-ad78-fb890b420392',
                                   '48756bc0-670e-4b79-9c60-08a8dc0641cd',
                                   '1ba5bb83-1a74-4e0d-ab56-f699b0439aa7']::uuid[];
  v_state text;
  v_n     int;
  v_diff  int;
  -- Fingerprints of everything OUTSIDE the five target rows, taken under lock.
  b_other_programs text; b_other_routines text; b_links text; b_exercises text;
  b_pub_programs int; b_pub_platform int;
BEGIN
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY p.id), '')) INTO b_other_programs
    FROM public.programs p WHERE p.id <> k_prog;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) INTO b_other_routines
    FROM public.workout_templates t WHERE t.id NOT IN (k_ra, k_rb, k_rc, k_rcc);
  SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY l.id), '')) INTO b_links
    FROM public.program_routines l;
  SELECT md5(coalesce(string_agg(e::text, '|' ORDER BY e.id), '')) INTO b_exercises
    FROM public.exercises e;
  SELECT count(*) INTO b_pub_programs FROM public.programs WHERE status = 'published';
  SELECT count(*) INTO b_pub_platform FROM public.workout_templates
   WHERE is_platform AND visibility = 'published';

  ----------------------------------------------------------------------------
  -- The five rows must be exactly what 20261117192044 created. Every non-clock
  -- column is pinned; Routine contents by md5 of the reviewed exercises JSON.
  ----------------------------------------------------------------------------
  CREATE TEMP TABLE _hsp_routine_exp (
    id uuid, name text, ex_md5 text, source_program_slug text, times_used int,
    last_used_at timestamptz, sort_order int, description text, goal text,
    difficulty text, tags text[], is_platform boolean, source_workout_id uuid)
    ON COMMIT DROP;
  INSERT INTO _hsp_routine_exp VALUES
  (k_ra,  'Full Body A',         'd5baa5ce7dde2578c022d4402b21f47e', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_rb,  'Full Body B',         '1bd0c24a3f9382595cdea50fb2d50914', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_rc,  'Full Body C',         'c9061e3615be690921867ba1c2b60c57', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_rcc, 'Conditioning & Core', '15a7813f984fa9ee22e4f52f0e1516b6', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL);

  CREATE TEMP TABLE _hsp_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    sort_order int, page_path text) ON COMMIT DROP;
  INSERT INTO _hsp_program_exp VALUES
  (k_prog, 'home_strength', 'Home Strength',
   'Builds muscle with dumbbells and bands, three full-body sessions a week. '
   'Each session pairs a squat and a hinge with a push, a pull, and core work.',
   'muscle', 'Beginner – Intermediate', 8, 3, 'Home Setup',
   true, false, 5, 'program.html?slug=home_strength');

  -- Owner: one platform owner, and the four Routines belong to it.
  IF (SELECT count(DISTINCT user_id) FROM public.workout_templates WHERE is_platform) <> 1
     OR (SELECT count(DISTINCT user_id) FROM public.workout_templates
          WHERE id IN (k_ra, k_rb, k_rc, k_rcc)) <> 1
     OR (SELECT DISTINCT user_id FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc))
        <> (SELECT DISTINCT user_id FROM public.workout_templates WHERE is_platform)
  THEN RAISE EXCEPTION 'ABORT: Routine ownership is not the single platform owner'; END IF;

  -- Content and access identical to the approved draft (status/visibility aside).
  SELECT count(*) INTO v_diff FROM (
    (SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc)
     EXCEPT SELECT * FROM _hsp_routine_exp)
    UNION ALL
    (SELECT * FROM _hsp_routine_exp
     EXCEPT
     SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routines differ from the approved draft (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _hsp_program_exp)
    UNION ALL
    (SELECT * FROM _hsp_program_exp
     EXCEPT
     SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program differs from the approved draft (% diffs)', v_diff; END IF;

  -- Links: exactly the four, to exactly these Routines and session keys.
  IF (SELECT count(*) FROM public.program_routines WHERE program_id = k_prog) <> 4
     OR (SELECT count(*) FROM public.program_routines
          WHERE id = ANY (k_links) AND program_id = k_prog
            AND (routine_id, session_key, sort_order) IN
                ((k_ra, 'full_a', 1), (k_rb, 'full_b', 2), (k_rc, 'full_c', 3),
                 (k_rcc, 'conditioning_core', 4))) <> 4
  THEN RAISE EXCEPTION 'ABORT: Home Strength links differ from the approved draft'; END IF;

  -- The Routines are used by no other Program.
  IF EXISTS (SELECT 1 FROM public.program_routines
              WHERE routine_id IN (k_ra, k_rb, k_rc, k_rcc) AND program_id <> k_prog)
  THEN RAISE EXCEPTION 'ABORT: a Home Strength Routine is linked to another Program'; END IF;

  ----------------------------------------------------------------------------
  -- Exhaustive state machine.
  ----------------------------------------------------------------------------
  IF (SELECT status FROM public.programs WHERE id = k_prog) = 'draft'
     AND (SELECT count(*) FROM public.workout_templates
           WHERE id IN (k_ra, k_rb, k_rc, k_rcc) AND visibility = 'private') = 4 THEN
    v_state := 'fresh';
  ELSIF (SELECT status FROM public.programs WHERE id = k_prog) = 'published'
     AND (SELECT count(*) FROM public.workout_templates
           WHERE id IN (k_ra, k_rb, k_rc, k_rcc) AND visibility = 'published') = 4 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION 'ABORT: partial or unexpected publish state';
  END IF;

  IF v_state = 'fresh' THEN
    IF b_pub_programs <> 4 OR b_pub_platform <> 56
    THEN RAISE EXCEPTION 'ABORT: published counts differ from the approved starting state'; END IF;

    -- Routines first: a published Program must never point at private Routines.
    UPDATE public.workout_templates SET visibility = 'published'
     WHERE id IN (k_ra, k_rb, k_rc, k_rcc) AND visibility = 'private';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN RAISE EXCEPTION 'ABORT: published % Routines, expected 4', v_n; END IF;

    UPDATE public.programs SET status = 'published'
     WHERE id = k_prog AND status = 'draft';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: published % Programs, expected 1', v_n; END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Verification, identical for both paths.
  ----------------------------------------------------------------------------
  IF (SELECT status FROM public.programs WHERE id = k_prog) <> 'published'
     OR (SELECT count(*) FROM public.workout_templates
          WHERE id IN (k_ra, k_rb, k_rc, k_rcc) AND visibility = 'published') <> 4
  THEN RAISE EXCEPTION 'ABORT: Home Strength is not fully published'; END IF;

  -- Content and access still identical (the UPDATEs touched only status/visibility).
  SELECT count(*) INTO v_diff FROM (
    (SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc)
     EXCEPT SELECT * FROM _hsp_routine_exp)
    UNION ALL
    (SELECT * FROM _hsp_routine_exp
     EXCEPT
     SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine content changed during publish (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _hsp_program_exp)
    UNION ALL
    (SELECT * FROM _hsp_program_exp
     EXCEPT
     SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program content or access changed during publish'; END IF;

  IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_ra, k_rb, k_rc, k_rcc)
              AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
     OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
              AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
  THEN RAISE EXCEPTION 'ABORT: timestamp invariant violated'; END IF;

  -- Nothing outside the five target rows changed, in any of the four tables.
  IF (SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY p.id), ''))
        FROM public.programs p WHERE p.id <> k_prog) <> b_other_programs
     OR (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), ''))
        FROM public.workout_templates t WHERE t.id NOT IN (k_ra, k_rb, k_rc, k_rcc)) <> b_other_routines
     OR (SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY l.id), ''))
        FROM public.program_routines l) <> b_links
     OR (SELECT md5(coalesce(string_agg(e::text, '|' ORDER BY e.id), ''))
        FROM public.exercises e) <> b_exercises
  THEN RAISE EXCEPTION 'ABORT: a row outside Home Strength changed'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 5
     OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> 5
     OR (SELECT count(*) FROM public.program_routines) <> 60
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 61
     OR (SELECT count(*) FROM public.workout_templates
          WHERE is_platform AND visibility = 'published') <> 60
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: catalog counts differ from the approved end state'; END IF;

  RAISE NOTICE 'phase_439l_publish_home_strength: state=%', v_state;
END $$;
