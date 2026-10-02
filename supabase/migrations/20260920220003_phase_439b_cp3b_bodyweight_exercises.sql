-- phase_439b_cp3b_bodyweight_exercises
-- Phase 4.3.9B CP3b. Adds three equipment-free movements so a Bodyweight
-- Program can be built with no exercise requiring a bar, bench, box or
-- implement. Superman is force_type 'static' and is posterior-chain/postural
-- endurance — deliberately NOT a pulling movement.
--
-- Explicit three-state machine: FRESH (141 rows, none present) inserts three;
-- REPLAY (144 rows, all three present and every column matching) is a verified
-- no-op; EVERY other state aborts before any write. There is no shared
-- permissive branch. ONE exact-record predicate, held in a temp relation, is
-- used for BOTH replay verification and post-insert verification.
DO $mig$
DECLARE
  k_tokens CONSTANT text[] := ARRAY['pike push-up','pike pushup','pike press',
                                    'superman','bird dog','quadruped opposite arm leg'];
  v_total int; v_ids int; v_coll int; v_exact int; v_ins int; v_tok int;
BEGIN
  -- Serialize count -> classify -> collide-check -> insert -> verify against any
  -- concurrent writer. SHARE ROW EXCLUSIVE blocks INSERT/UPDATE/DELETE but NOT
  -- readers, and is held until this statement (the whole DO block) ends.
  LOCK TABLE public.exercises IN SHARE ROW EXCLUSIVE MODE;

  -- Mechanical internal-uniqueness assertion: six tokens, six distinct.
  IF array_length(k_tokens, 1) <> 6 THEN
    RAISE EXCEPTION 'cp3b aborted: token array has % elements, expected 6.', array_length(k_tokens, 1);
  END IF;
  SELECT count(DISTINCT lower(t)) INTO v_tok FROM unnest(k_tokens) t;
  IF v_tok <> 6 THEN
    RAISE EXCEPTION 'cp3b aborted: token array has only % distinct lowercase values, expected 6.', v_tok;
  END IF;

  -- The ONE expected-record relation. Both verifications join against it.
  DROP TABLE IF EXISTS _cp3b_expected;
  CREATE TEMP TABLE _cp3b_expected ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34'::uuid,'Pike Push-Up','Vertical Push','Bodyweight',
     'Shoulders',ARRAY['Triceps','Chest'],'vertical_push','push','intermediate',true,false,'lb',
     'bodyweight_reps',ARRAY['Pike Pushup','Pike Press'],
     'From a downward-dog position with hips high, bend your elbows to lower the top of your head toward the floor between your hands, then press back up.',
     'Keep your hips high throughout — the higher the hips, the more this becomes a shoulder press. Elbows track forward, not flared out.',true),
    ('c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45'::uuid,'Superman','Hinge','Bodyweight',
     'Lower Back',ARRAY['Glutes','Hamstrings'],'hinge','static','beginner',true,false,'lb',
     'bodyweight_reps',ARRAY[]::text[],
     'Lie face down with arms extended overhead. Lift your chest, arms and legs off the floor, hold briefly, then lower under control.',
     'Lift with your glutes and upper back — don''t crank your lower back. This builds posterior-chain and postural endurance.',true),
    ('d3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56'::uuid,'Bird Dog','Core','Bodyweight',
     'Core',ARRAY['Glutes','Lower Back'],'core','static','beginner',true,true,'lb',
     'bodyweight_reps',ARRAY['Quadruped Opposite Arm Leg'],
     'On hands and knees, extend one arm forward and the opposite leg back until both are level with your torso, then return under control.',
     'Keep your hips square and your back flat — resist rotating toward the lifted leg.',true)
  ) AS t(id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
         force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
         aliases,instructions,tips,is_active);

  SELECT count(*) INTO v_total FROM public.exercises;
  SELECT count(*) INTO v_ids   FROM public.exercises e JOIN _cp3b_expected x ON x.id = e.id;

  -- THE exact-record predicate. Every inserted column; arrays order-insensitive.
  SELECT count(*) INTO v_exact
    FROM public.exercises e
    JOIN _cp3b_expected x ON x.id = e.id
   WHERE e.name = x.name AND e.category = x.category AND e.equipment = x.equipment
     AND e.primary_muscle = x.primary_muscle AND e.movement_pattern = x.movement_pattern
     AND e.force_type = x.force_type AND e.difficulty = x.difficulty
     AND e.is_bodyweight = x.is_bodyweight AND e.is_unilateral = x.is_unilateral
     AND e.default_unit = x.default_unit AND e.tracking_type = x.tracking_type
     AND e.instructions = x.instructions AND e.tips = x.tips AND e.is_active = x.is_active
     AND (SELECT coalesce(array_agg(s ORDER BY s),'{}') FROM unnest(coalesce(e.secondary_muscles,'{}')) s)
       = (SELECT coalesce(array_agg(s ORDER BY s),'{}') FROM unnest(coalesce(x.secondary_muscles,'{}')) s)
     AND (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM unnest(coalesce(e.aliases,'{}')) a)
       = (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM unnest(coalesce(x.aliases,'{}')) a);

  ------------------------------------------------------------------ REPLAY
  IF v_total = 144 AND v_ids = 3 AND v_exact = 3 THEN
    RAISE NOTICE 'cp3b: already applied — 3 rows verified against the exact records. No-op.';
    RETURN;
  END IF;

  ------------------------------------------------------------------ ABORTS
  IF v_total NOT IN (141, 144) THEN
    RAISE EXCEPTION 'cp3b aborted: row count %, expected 141 (fresh) or 144 (replay).', v_total;
  END IF;
  IF v_total = 144 AND v_ids <> 3 THEN
    RAISE EXCEPTION 'cp3b aborted: 144 rows but % of 3 target ids present.', v_ids;
  END IF;
  IF v_total = 144 AND v_ids = 3 AND v_exact <> 3 THEN
    RAISE EXCEPTION 'cp3b aborted: 3 target ids exist but only % match the exact record.', v_exact;
  END IF;
  IF v_total = 141 AND v_ids <> 0 THEN
    RAISE EXCEPTION 'cp3b aborted: 141 rows but % target id(s) already present.', v_ids;
  END IF;

  ------------------------------------------------------------------ FRESH
  SELECT count(*) INTO v_coll FROM public.exercises e
   WHERE lower(e.name) = ANY (k_tokens)
      OR EXISTS (SELECT 1 FROM unnest(coalesce(e.aliases,'{}')) a WHERE lower(a) = ANY (k_tokens));
  IF v_coll <> 0 THEN
    RAISE EXCEPTION 'cp3b aborted: % existing row(s) collide with a proposed name or alias.', v_coll;
  END IF;

  INSERT INTO public.exercises
    (id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
     force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
     aliases,instructions,tips,is_active)
  SELECT id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
         force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
         aliases,instructions,tips,is_active
    FROM _cp3b_expected;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins <> 3 THEN RAISE EXCEPTION 'cp3b aborted: inserted % rows, expected 3.', v_ins; END IF;

  ---------------------------------------------------------- POST-CONDITIONS
  SELECT count(*) INTO v_total FROM public.exercises;
  IF v_total <> 144 THEN RAISE EXCEPTION 'cp3b aborted: final count %, expected 144.', v_total; END IF;

  -- Identical predicate to the replay check above.
  SELECT count(*) INTO v_exact
    FROM public.exercises e
    JOIN _cp3b_expected x ON x.id = e.id
   WHERE e.name = x.name AND e.category = x.category AND e.equipment = x.equipment
     AND e.primary_muscle = x.primary_muscle AND e.movement_pattern = x.movement_pattern
     AND e.force_type = x.force_type AND e.difficulty = x.difficulty
     AND e.is_bodyweight = x.is_bodyweight AND e.is_unilateral = x.is_unilateral
     AND e.default_unit = x.default_unit AND e.tracking_type = x.tracking_type
     AND e.instructions = x.instructions AND e.tips = x.tips AND e.is_active = x.is_active
     AND (SELECT coalesce(array_agg(s ORDER BY s),'{}') FROM unnest(coalesce(e.secondary_muscles,'{}')) s)
       = (SELECT coalesce(array_agg(s ORDER BY s),'{}') FROM unnest(coalesce(x.secondary_muscles,'{}')) s)
     AND (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM unnest(coalesce(e.aliases,'{}')) a)
       = (SELECT coalesce(array_agg(a ORDER BY a),'{}') FROM unnest(coalesce(x.aliases,'{}')) a);
  IF v_exact <> 3 THEN
    RAISE EXCEPTION 'cp3b aborted: post-insert exact-record assertion failed (% of 3).', v_exact;
  END IF;

  RAISE NOTICE 'cp3b: inserted 3 bodyweight exercises (141 -> 144).';
END
$mig$;