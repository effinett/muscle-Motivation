-- Phase 4.3.9-L — Publish Advanced Fat Loss (prepared 2026-11-18; apply only on
-- explicit owner approval).
-- The ONLY writes: the four Advanced Fat Loss Routines private -> published, then
-- the Advanced Fat Loss Program draft -> published, in that dependency order,
-- inside one transaction. No other column on these rows, and no other row in
-- any table, may change. Creates no price, purchase, entitlement or enrolment;
-- access stays exactly as 20261118005437 set it (included with membership,
-- not standalone-purchasable). Advanced Muscle stays published (20261118044157)
-- and Advanced Home Strength stays a hidden draft.
--
-- Every target is named by id (20261118005437), never by "private platform
-- Routines": the catalog also holds the four Advanced Home Strength draft
-- Routines and an unrelated private validation Routine, none of which this migration
-- can reach.
DO $$
DECLARE
  k_prog  constant uuid := '4299697c-b0f2-5cd2-a4a0-2d28ba2e8022';
  k_r1    constant uuid := 'ac0b375a-be54-52d6-a182-16f786584584';
  k_r2    constant uuid := '01437cdd-e1a7-555e-ac7d-7222a539f231';
  k_r3    constant uuid := '2227ef5f-67e4-5d43-a1c2-88055a74e749';
  k_r4    constant uuid := '6646d270-a178-5f58-ac0d-4acb0bcfab2c';
  k_l1    constant uuid := '4d842fe6-f348-538a-a1a3-cee2d0c7af1c';
  k_l2    constant uuid := '245610a5-9dbd-55a1-a9cc-d0c167c3c0f3';
  k_l3    constant uuid := '4c5e7a66-41ce-5811-a452-3dad635fa9c7';
  k_l4    constant uuid := '12dd51c6-784c-5d94-aa97-ec274cc5d663';
  v_state text;
  v_n     int;
  v_diff  int;
  -- Fingerprints of everything OUTSIDE the five target rows, taken under lock.
  b_other_programs text; b_other_routines text; b_links text; b_exercises text;
  b_purchases text; b_user_programs text; b_profiles text;
  b_pub_programs int; b_pub_platform int;
BEGIN
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;
  -- Read-only here; locked so their fingerprints cannot move mid-transaction.
  LOCK TABLE public.purchases         IN SHARE MODE;
  LOCK TABLE public.user_programs     IN SHARE MODE;
  LOCK TABLE public.profiles          IN SHARE MODE;

  SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY p.id), '')) INTO b_other_programs
    FROM public.programs p WHERE p.id <> k_prog;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) INTO b_other_routines
    FROM public.workout_templates t WHERE t.id NOT IN (k_r1, k_r2, k_r3, k_r4);
  SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY l.id), '')) INTO b_links
    FROM public.program_routines l;
  SELECT md5(coalesce(string_agg(e::text, '|' ORDER BY e.id), '')) INTO b_exercises
    FROM public.exercises e;
  SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) INTO b_purchases
    FROM public.purchases x;
  SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) INTO b_user_programs
    FROM public.user_programs x;
  SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) INTO b_profiles
    FROM public.profiles x;
  SELECT count(*) INTO b_pub_programs FROM public.programs WHERE status = 'published';
  SELECT count(*) INTO b_pub_platform FROM public.workout_templates
   WHERE is_platform AND visibility = 'published';

  ----------------------------------------------------------------------------
  -- The five rows must be exactly what 20261118005437 created. Every non-clock
  -- column is pinned; Routine contents by md5 of the reviewed exercises JSON
  -- (computed from that migration's literals, ::jsonb::text).
  ----------------------------------------------------------------------------
  CREATE TEMP TABLE _afp_routine_exp (
    id uuid, name text, ex_md5 text, source_program_slug text, times_used int,
    last_used_at timestamptz, sort_order int, description text, goal text,
    difficulty text, tags text[], is_platform boolean, source_workout_id uuid)
    ON COMMIT DROP;
  INSERT INTO _afp_routine_exp VALUES
  (k_r1, 'Lower', '8b9106ff6367362aafb935e9be2edab6', NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, NULL),
  (k_r2, 'Upper', '671ce32e3f1480d4d7418a30139c3047', NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, NULL),
  (k_r3, 'Full Body', '31dd7c19daefd0f31dc50b9430a53d1a', NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, NULL),
  (k_r4, 'Conditioning & Core', '7857d2e3f7763b13e09f376dc0a24e23', NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, NULL);

  CREATE TEMP TABLE _afp_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    sort_order int, page_path text) ON COMMIT DROP;
  INSERT INTO _afp_program_exp VALUES
  (k_prog, 'advanced_fat_loss', 'Advanced Fat Loss',
   'Four full-gym sessions that build strength while you lose fat: lower, upper, full body, and a conditioning and core day.',
   'fatloss', 'Intermediate – Advanced', 12, 4, 'Full Gym',
   true, false, 7, 'program.html?slug=advanced_fat_loss');

  -- Owner: one platform owner, and the four Routines belong to it.
  IF (SELECT count(DISTINCT user_id) FROM public.workout_templates WHERE is_platform) <> 1
     OR (SELECT count(DISTINCT user_id) FROM public.workout_templates
          WHERE id IN (k_r1, k_r2, k_r3, k_r4)) <> 1
     OR (SELECT DISTINCT user_id FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4))
        <> (SELECT DISTINCT user_id FROM public.workout_templates WHERE is_platform)
  THEN RAISE EXCEPTION 'ABORT: Routine ownership is not the single platform owner'; END IF;

  -- Content and access identical to the approved draft (status/visibility aside).
  SELECT count(*) INTO v_diff FROM (
    (SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4)
     EXCEPT SELECT * FROM _afp_routine_exp)
    UNION ALL
    (SELECT * FROM _afp_routine_exp
     EXCEPT
     SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routines differ from the approved draft (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _afp_program_exp)
    UNION ALL
    (SELECT * FROM _afp_program_exp
     EXCEPT
     SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program differs from the approved draft (% diffs)', v_diff; END IF;

  -- Links: exactly the four, to exactly these Routines and session keys.
  IF (SELECT count(*) FROM public.program_routines WHERE program_id = k_prog) <> 4
     OR (SELECT count(*) FROM public.program_routines
          WHERE program_id = k_prog AND legacy_program_workout_id IS NULL
            AND (id, routine_id, session_key, sort_order) IN
                ((k_l1, k_r1, 'lower', 1), (k_l2, k_r2, 'upper', 2),
                 (k_l3, k_r3, 'full_body', 3), (k_l4, k_r4, 'conditioning_core', 4))) <> 4
  THEN RAISE EXCEPTION 'ABORT: Advanced Fat Loss links differ from the approved draft'; END IF;

  -- The Routines are used by no other Program.
  IF EXISTS (SELECT 1 FROM public.program_routines
              WHERE routine_id IN (k_r1, k_r2, k_r3, k_r4) AND program_id <> k_prog)
  THEN RAISE EXCEPTION 'ABORT: an Advanced Fat Loss Routine is linked to another Program'; END IF;

  ----------------------------------------------------------------------------
  -- Exhaustive state machine.
  ----------------------------------------------------------------------------
  IF (SELECT status FROM public.programs WHERE id = k_prog) = 'draft'
     AND (SELECT count(*) FROM public.workout_templates
           WHERE id IN (k_r1, k_r2, k_r3, k_r4) AND visibility = 'private') = 4 THEN
    v_state := 'fresh';
  ELSIF (SELECT status FROM public.programs WHERE id = k_prog) = 'published'
     AND (SELECT count(*) FROM public.workout_templates
           WHERE id IN (k_r1, k_r2, k_r3, k_r4) AND visibility = 'published') = 4 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION 'ABORT: partial or unexpected publish state';
  END IF;

  IF v_state = 'fresh' THEN
    IF b_pub_programs <> 6 OR b_pub_platform <> 64
    THEN RAISE EXCEPTION 'ABORT: published counts differ from the approved starting state'; END IF;

    -- Routines first: a published Program must never point at private Routines.
    UPDATE public.workout_templates SET visibility = 'published'
     WHERE id IN (k_r1, k_r2, k_r3, k_r4) AND visibility = 'private';
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
          WHERE id IN (k_r1, k_r2, k_r3, k_r4) AND visibility = 'published') <> 4
  THEN RAISE EXCEPTION 'ABORT: Advanced Fat Loss is not fully published'; END IF;

  -- Content and access still identical (the UPDATEs touched only status/visibility).
  SELECT count(*) INTO v_diff FROM (
    (SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4)
     EXCEPT SELECT * FROM _afp_routine_exp)
    UNION ALL
    (SELECT * FROM _afp_routine_exp
     EXCEPT
     SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine content changed during publish (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog
     EXCEPT SELECT * FROM _afp_program_exp)
    UNION ALL
    (SELECT * FROM _afp_program_exp
     EXCEPT
     SELECT id, slug, name, description, goal, difficulty, duration_weeks,
            recommended_days_per_week, equipment_summary, included_with_membership,
            standalone_purchasable, sort_order, page_path
       FROM public.programs WHERE id = k_prog)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program content or access changed during publish'; END IF;

  IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4)
              AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
     OR EXISTS (SELECT 1 FROM public.programs WHERE id = k_prog
              AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
  THEN RAISE EXCEPTION 'ABORT: timestamp invariant violated'; END IF;

  -- Nothing outside the five target rows changed: catalog, links, purchases
  -- (incl. Stripe ids), enrolments, profiles (incl. Stripe customer / membership).
  IF (SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY p.id), ''))
        FROM public.programs p WHERE p.id <> k_prog) <> b_other_programs
     OR (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), ''))
        FROM public.workout_templates t WHERE t.id NOT IN (k_r1, k_r2, k_r3, k_r4)) <> b_other_routines
     OR (SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY l.id), ''))
        FROM public.program_routines l) <> b_links
     OR (SELECT md5(coalesce(string_agg(e::text, '|' ORDER BY e.id), ''))
        FROM public.exercises e) <> b_exercises
     OR (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), ''))
        FROM public.purchases x) <> b_purchases
     OR (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), ''))
        FROM public.user_programs x) <> b_user_programs
     OR (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), ''))
        FROM public.profiles x) <> b_profiles
  THEN RAISE EXCEPTION 'ABORT: a row outside Advanced Fat Loss changed'; END IF;

  -- Advanced Muscle is still published; Advanced Home Strength is still a hidden draft.
  IF (SELECT count(*) FROM public.programs
       WHERE slug = 'advanced_muscle' AND status = 'published') <> 1
     OR (SELECT count(*) FROM public.programs
       WHERE slug = 'advanced_home_strength' AND status = 'draft') <> 1
  THEN RAISE EXCEPTION 'ABORT: another Advanced Program changed state'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 8
     OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> 7
     OR (SELECT count(*) FROM public.program_routines) <> 72
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 73
     OR (SELECT count(*) FROM public.workout_templates
          WHERE is_platform AND visibility = 'published') <> 68
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: catalog counts differ from the approved end state'; END IF;

  RAISE NOTICE 'phase_439l_publish_advanced_fat_loss: state=%', v_state;
END $$;
