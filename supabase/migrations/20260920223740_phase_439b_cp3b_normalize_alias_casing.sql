-- Phase 4.3.9B — CP3b corrective migration.
-- Aligns the two CP3b rows whose aliases were stored in Title Case to the
-- catalog-wide lowercase alias convention (142 of 144 rows already comply).
-- Purely a casing correction: resolution is case-insensitive, so no behaviour
-- changes. Exactly two rows, addressed by UUID + exact current array value.
-- No broad lower(alias) update.
DO $$
DECLARE
  k_pike  constant uuid := 'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34';
  k_super constant uuid := 'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45';
  k_bird  constant uuid := 'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56';

  fresh_pike constant text[] := ARRAY['Pike Pushup','Pike Press'];
  fresh_bird constant text[] := ARRAY['Quadruped Opposite Arm Leg'];
  want_pike  constant text[] := ARRAY['pike pushup','pike press'];
  want_bird  constant text[] := ARRAY['quadruped opposite arm leg'];
  want_super constant text[] := ARRAY[]::text[];

  v_count      int;
  v_present    int;
  v_fieldmatch int;
  v_updated    int;
  v_pike       text[];
  v_bird       text[];
  v_super      text[];
  v_state      text;
BEGIN
  -- Serialize against concurrent writers; readers are unaffected.
  LOCK TABLE public.exercises IN SHARE ROW EXCLUSIVE MODE;

  -- (2) total count must be exactly 144
  SELECT count(*) INTO v_count FROM public.exercises;
  IF v_count <> 144 THEN
    RAISE EXCEPTION 'ABORT: exercises count is %, expected 144', v_count;
  END IF;

  -- (3) all three CP3b rows must exist
  SELECT count(*) INTO v_present FROM public.exercises
   WHERE id IN (k_pike, k_super, k_bird);
  IF v_present <> 3 THEN
    RAISE EXCEPTION 'ABORT: expected 3 CP3b rows present, found %', v_present;
  END IF;

  -- (4) every NON-ALIAS approved field must still match, on all three rows
  SELECT count(*) INTO v_fieldmatch
    FROM public.exercises e
    JOIN (VALUES
      (k_pike ,'Pike Push-Up','Vertical Push','Bodyweight','Shoulders',
       ARRAY['Triceps','Chest'],'vertical_push','push','intermediate',
       true,false,'bodyweight_reps','lb',true),
      (k_super,'Superman','Hinge','Bodyweight','Lower Back',
       ARRAY['Glutes','Hamstrings'],'hinge','static','beginner',
       true,false,'bodyweight_reps','lb',true),
      (k_bird ,'Bird Dog','Core','Bodyweight','Core',
       ARRAY['Glutes','Lower Back'],'core','static','beginner',
       true,true,'bodyweight_reps','lb',true)
    ) AS x(id,name,category,equipment,primary_muscle,secondary_muscles,
           movement_pattern,force_type,difficulty,is_bodyweight,
           is_unilateral,tracking_type,default_unit,is_active)
      ON  e.id                = x.id
      AND e.name              = x.name
      AND e.category          = x.category
      AND e.equipment         = x.equipment
      AND e.primary_muscle    = x.primary_muscle
      AND e.secondary_muscles = x.secondary_muscles
      AND e.movement_pattern  = x.movement_pattern
      AND e.force_type        = x.force_type
      AND e.difficulty        = x.difficulty
      AND e.is_bodyweight     = x.is_bodyweight
      AND e.is_unilateral     = x.is_unilateral
      AND e.tracking_type     = x.tracking_type
      AND e.default_unit      = x.default_unit
      AND e.is_active         = x.is_active;
  IF v_fieldmatch <> 3 THEN
    RAISE EXCEPTION 'ABORT: non-alias field drift on CP3b rows (matched % of 3)', v_fieldmatch;
  END IF;

  SELECT aliases INTO v_pike  FROM public.exercises WHERE id = k_pike;
  SELECT aliases INTO v_bird  FROM public.exercises WHERE id = k_bird;
  SELECT aliases INTO v_super FROM public.exercises WHERE id = k_super;

  -- Superman must be empty in BOTH valid states; never written to.
  IF v_super IS DISTINCT FROM want_super THEN
    RAISE EXCEPTION 'ABORT: Superman aliases must be empty, found %', v_super;
  END IF;

  -- (5) explicit three-state model. Both rows must agree on the same state;
  -- a half-corrected catalog (one lowercase, one Title Case) matches neither
  -- branch and therefore aborts before any write.
  IF v_pike = fresh_pike AND v_bird = fresh_bird THEN
    v_state := 'fresh';
  ELSIF v_pike = want_pike AND v_bird = want_bird THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: alias state matches neither fresh nor replay exactly (pike=%, bird=%)',
      v_pike, v_bird;
  END IF;

  IF v_state = 'fresh' THEN
    -- Keyed by UUID *and* exact expected current value, so an unexpected row
    -- can never be affected and a concurrent change cannot be overwritten.
    UPDATE public.exercises SET aliases = want_pike
     WHERE id = k_pike AND aliases = fresh_pike;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'ABORT: Pike Push-Up update affected % rows, expected 1', v_updated;
    END IF;

    UPDATE public.exercises SET aliases = want_bird
     WHERE id = k_bird AND aliases = fresh_bird;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'ABORT: Bird Dog update affected % rows, expected 1', v_updated;
    END IF;
  END IF;

  -- Post-state verification — identical assertions on BOTH paths.
  SELECT aliases INTO v_pike  FROM public.exercises WHERE id = k_pike;
  SELECT aliases INTO v_bird  FROM public.exercises WHERE id = k_bird;
  SELECT aliases INTO v_super FROM public.exercises WHERE id = k_super;

  IF v_pike  IS DISTINCT FROM want_pike  THEN
    RAISE EXCEPTION 'ABORT: post-state Pike aliases = %, expected %', v_pike, want_pike;
  END IF;
  IF v_bird  IS DISTINCT FROM want_bird  THEN
    RAISE EXCEPTION 'ABORT: post-state Bird Dog aliases = %, expected %', v_bird, want_bird;
  END IF;
  IF v_super IS DISTINCT FROM want_super THEN
    RAISE EXCEPTION 'ABORT: post-state Superman aliases = %, expected empty', v_super;
  END IF;

  -- Catalog-wide invariant: no uppercase character in any alias, any row.
  IF EXISTS (
    SELECT 1 FROM public.exercises e, unnest(e.aliases) AS a WHERE a <> lower(a)
  ) THEN
    RAISE EXCEPTION 'ABORT: uppercase aliases still present after correction';
  END IF;

  -- Row count must be untouched by a pure UPDATE.
  SELECT count(*) INTO v_count FROM public.exercises;
  IF v_count <> 144 THEN
    RAISE EXCEPTION 'ABORT: post-state count is %, expected 144', v_count;
  END IF;

  RAISE NOTICE 'phase_439b_cp3b_normalize_alias_casing: state=%', v_state;
END $$;