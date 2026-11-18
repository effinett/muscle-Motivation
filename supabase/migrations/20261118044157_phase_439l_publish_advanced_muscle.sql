-- Phase 4.3.9-L — Publish Advanced Muscle (prepared 2026-11-17; apply only on
-- explicit owner approval).
-- The ONLY writes: the four Advanced Muscle Routines private -> published, then
-- the Advanced Muscle Program draft -> published, in that dependency order,
-- inside one transaction. No other column on these rows, and no other row in
-- any table, may change. Creates no price, purchase, entitlement or enrolment;
-- access stays exactly as 20261118005437 set it (included with membership,
-- not standalone-purchasable). Advanced Fat Loss and Advanced Home Strength
-- stay hidden drafts.
--
-- Every target is named by id (20261118005437), never by "private platform
-- Routines": the catalog also holds the other eight Advanced draft Routines
-- and an unrelated private validation Routine, none of which this migration
-- can reach.
DO $$
DECLARE
  k_prog  constant uuid := '13c8ee8a-dc10-5858-afa5-cf2402300268';
  k_r1    constant uuid := 'f70d7306-dbca-5b80-adaa-161d7d2c57e8';
  k_r2    constant uuid := '19c09b00-2482-554f-aa08-1a9c1c2f626a';
  k_r3    constant uuid := '1e854b64-3232-551e-a467-db886b141915';
  k_r4    constant uuid := 'e40f5cb9-d978-55e8-aad5-acac4e14ca01';
  k_l1    constant uuid := '39393c74-3a1e-5e02-af19-ec7d5066bd4e';
  k_l2    constant uuid := '382063e5-2238-59fb-a14a-6594dbff8adf';
  k_l3    constant uuid := 'd60ef23f-9e7f-5b4e-ac54-93065df06241';
  k_l4    constant uuid := 'f558bb4c-c4be-55c8-a7aa-681e360174de';
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
  CREATE TEMP TABLE _amp_routine_exp (
    id uuid, name text, ex_md5 text, source_program_slug text, times_used int,
    last_used_at timestamptz, sort_order int, description text, goal text,
    difficulty text, tags text[], is_platform boolean, source_workout_id uuid)
    ON COMMIT DROP;
  INSERT INTO _amp_routine_exp VALUES
  (k_r1, 'Upper A', '9e66030d6b9be1dbdd914ee39f3e7609', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_r2, 'Lower A', '3ebeabc0bb00de4bc805f03545721b0d', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_r3, 'Upper B', 'a839a40d5f62342ad5a6b1c27eb77bbd', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL),
  (k_r4, 'Lower B', 'b3761dca9aa1705e9a1432040cd3e140', NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, NULL);

  CREATE TEMP TABLE _amp_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    sort_order int, page_path text) ON COMMIT DROP;
  INSERT INTO _amp_program_exp VALUES
  (k_prog, 'advanced_muscle', 'Advanced Muscle',
   'Builds muscle with a four-day upper/lower split. Each session starts with heavy compound lifts, then adds machine and cable work for volume.',
   'muscle', 'Intermediate – Advanced', 12, 4, 'Full Gym',
   true, false, 6, 'program.html?slug=advanced_muscle');

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
     EXCEPT SELECT * FROM _amp_routine_exp)
    UNION ALL
    (SELECT * FROM _amp_routine_exp
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
     EXCEPT SELECT * FROM _amp_program_exp)
    UNION ALL
    (SELECT * FROM _amp_program_exp
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
                ((k_l1, k_r1, 'upper_a', 1), (k_l2, k_r2, 'lower_a', 2),
                 (k_l3, k_r3, 'upper_b', 3), (k_l4, k_r4, 'lower_b', 4))) <> 4
  THEN RAISE EXCEPTION 'ABORT: Advanced Muscle links differ from the approved draft'; END IF;

  -- The Routines are used by no other Program.
  IF EXISTS (SELECT 1 FROM public.program_routines
              WHERE routine_id IN (k_r1, k_r2, k_r3, k_r4) AND program_id <> k_prog)
  THEN RAISE EXCEPTION 'ABORT: an Advanced Muscle Routine is linked to another Program'; END IF;

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
    IF b_pub_programs <> 5 OR b_pub_platform <> 60
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
  THEN RAISE EXCEPTION 'ABORT: Advanced Muscle is not fully published'; END IF;

  -- Content and access still identical (the UPDATEs touched only status/visibility).
  SELECT count(*) INTO v_diff FROM (
    (SELECT id, name, md5(exercises::text), source_program_slug, times_used, last_used_at,
            sort_order, description, goal, difficulty, tags, is_platform, source_workout_id
       FROM public.workout_templates WHERE id IN (k_r1, k_r2, k_r3, k_r4)
     EXCEPT SELECT * FROM _amp_routine_exp)
    UNION ALL
    (SELECT * FROM _amp_routine_exp
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
     EXCEPT SELECT * FROM _amp_program_exp)
    UNION ALL
    (SELECT * FROM _amp_program_exp
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
  THEN RAISE EXCEPTION 'ABORT: a row outside Advanced Muscle changed'; END IF;

  -- The other two Advanced Programs are still hidden drafts.
  IF (SELECT count(*) FROM public.programs
       WHERE slug IN ('advanced_fat_loss', 'advanced_home_strength') AND status = 'draft') <> 2
  THEN RAISE EXCEPTION 'ABORT: another Advanced Program is not a draft'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 8
     OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> 6
     OR (SELECT count(*) FROM public.program_routines) <> 72
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 73
     OR (SELECT count(*) FROM public.workout_templates
          WHERE is_platform AND visibility = 'published') <> 64
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: catalog counts differ from the approved end state'; END IF;

  RAISE NOTICE 'phase_439l_publish_advanced_muscle: state=%', v_state;
END $$;
