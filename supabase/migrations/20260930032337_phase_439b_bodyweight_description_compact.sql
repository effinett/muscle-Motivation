-- Phase 4.3.9B — compact the Bodyweight Foundations canonical description.
-- Changes EXACTLY ONE field on EXACTLY ONE row: programs.description.
--
-- Why: the canonical description is 168 chars against 23/26/26 for the other
-- published Programs, so it wraps to several lines on the two compact surfaces
-- that render it (workout.html Train -> Programs, profile.html account list).
-- The pulling limitation it carried now lives as page copy on the Bodyweight
-- detail page only, so no truthfulness is lost by shortening the catalog field.
--
-- Publication state is NOT touched: status must already be 'published' and must
-- remain 'published'. Routines, links, exercises, profiles, purchases,
-- enrolments, workouts and every other Program are out of scope entirely.
DO $$
DECLARE
  k_slug constant text := 'bodyweight_foundations';
  k_id   constant uuid := 'e8c5a1f6-5d74-4bc9-8ea5-4a7c1b9d65d8';

  k_old constant text := 'An equipment-free strength foundation focused on legs, pushing, core, and '
                         'training consistency. It does not replace balanced resistance training with '
                         'pulling movements.';
  k_new constant text := 'Equipment-free full-body strength program';

  v_state text;
  v_n int;
  v_desc text;
  v_updated int;

  -- Captured under lock so the "nothing else moved" checks are measured against
  -- a state no concurrent writer can have shifted.
  b_programs int; b_published int;
BEGIN
  -- Only `programs` is written, so only `programs` is locked. Blocks concurrent
  -- writers to that table; readers are unaffected.
  LOCK TABLE public.programs IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO b_programs  FROM public.programs;
  SELECT count(*) INTO b_published FROM public.programs WHERE status = 'published';

  -- Exactly one target row, addressed by slug AND the expected UUID.
  SELECT count(*) INTO v_n FROM public.programs WHERE slug = k_slug AND id = k_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 row for slug % / id %, found %', k_slug, k_id, v_n;
  END IF;

  -- Every field EXCEPT description must match the approved published record.
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id = k_id
     AND slug = k_slug
     AND name = 'Bodyweight Foundations'
     AND goal = 'muscle'
     AND difficulty = 'Beginner – Intermediate'
     AND duration_weeks = 8
     AND recommended_days_per_week = 3
     AND equipment_summary = 'Bodyweight'
     AND included_with_membership IS TRUE
     AND standalone_purchasable IS FALSE
     AND status = 'published'
     AND sort_order = 4
     AND page_path = 'program-bodyweight.html';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORT: a non-description Program field diverges, or the Program is not published';
  END IF;

  -- Three-state machine on the description alone. No permissive branch.
  SELECT description INTO v_desc FROM public.programs WHERE id = k_id;

  IF v_desc = k_old THEN
    v_state := 'fresh';
  ELSIF v_desc = k_new THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: description matches neither the approved old nor new value (length %)',
      length(coalesce(v_desc, ''));
  END IF;

  IF v_state = 'fresh' THEN
    -- Keyed by id, slug AND the exact expected current value, so a concurrent
    -- edit cannot be overwritten and no other row can be touched.
    UPDATE public.programs
       SET description = k_new
     WHERE id = k_id AND slug = k_slug AND description = k_old;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'ABORT: update affected % rows, expected exactly 1', v_updated;
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Postconditions. Identical on both paths.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id = k_id
     AND slug = k_slug
     AND description = k_new
     AND name = 'Bodyweight Foundations'
     AND goal = 'muscle'
     AND difficulty = 'Beginner – Intermediate'
     AND duration_weeks = 8
     AND recommended_days_per_week = 3
     AND equipment_summary = 'Bodyweight'
     AND included_with_membership IS TRUE
     AND standalone_purchasable IS FALSE
     AND status = 'published'
     AND sort_order = 4
     AND page_path = 'program-bodyweight.html';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORT: post-state row does not match the approved record exactly';
  END IF;

  -- The catalog itself must be untouched in shape and publication state.
  IF (SELECT count(*) FROM public.programs) <> b_programs
    THEN RAISE EXCEPTION 'ABORT: Program total changed'; END IF;
  IF (SELECT count(*) FROM public.programs WHERE status = 'published') <> b_published
    THEN RAISE EXCEPTION 'ABORT: published Program count changed'; END IF;

  -- No other Program's description may have moved.
  IF (SELECT count(*) FROM public.programs
       WHERE slug <> k_slug
         AND description NOT IN ('12-week fat loss system',
                                 '8-week hypertrophy program',
                                 'Women''s lower-body program')) <> 0
  THEN
    RAISE EXCEPTION 'ABORT: another Program description differs from its expected value';
  END IF;

  RAISE NOTICE 'phase_439b_bodyweight_description_compact: state=%', v_state;
END $$;