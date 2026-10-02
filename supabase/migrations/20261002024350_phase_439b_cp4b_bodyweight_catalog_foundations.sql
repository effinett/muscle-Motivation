-- phase_439b_cp4b_bodyweight_catalog_foundations
-- Phase 4.3.9B CP4b. Adds exactly fifteen equipment-free catalog exercises:
-- two push foundations (Wall Push-Up, Pike Lean), four conditioning movements
-- (Step Jack, Jumping Jack, March in Place, High Knees) and nine mobility /
-- recovery movements (movement_pattern 'mobility', category 'Mobility').
--
-- Catalog groundwork only: no Routine, no Program link, no Program change, no
-- publication change, no user state, and no UPDATE/DELETE of any existing row.
-- public.exercises has no CHECK constraint on category, movement_pattern,
-- tracking_type or default_unit (all free text interpreted by the repository),
-- so no constraint change is needed or made.
--
-- Explicit three-state machine, mirroring phase_439b_cp3b_bodyweight_exercises:
--   FRESH  — exact 144-row baseline (count, Bodyweight count, sorted-id md5),
--            none of the 15 ids present, no normalized name/alias collision
--            → insert 15, then verify every post-condition.
--   REPLAY — exact 159-row post-state, all 15 ids present and byte-identical to
--            the expected relation → verified no-op, writes nothing.
--   Every other state (PARTIAL / DIVERGED) aborts before any write.
-- ONE expected relation (_cp4b_expected) is the single definition of the rows,
-- the collision tokens, the replay predicate and the post-insert predicate.
-- The whole migration is one DO statement, so it commits or rolls back as one.
DO $mig$
DECLARE
  k_n         CONSTANT int  := 15;
  k_before    CONSTANT int  := 144;
  k_after     CONSTANT int  := 159;
  k_bw_before CONSTANT int  := 37;
  k_bw_after  CONSTANT int  := 52;
  k_md5_before CONSTANT text := 'a1314c867b375fad835b246f7536ec68';
  k_md5_after  CONSTANT text := 'dec5ac379151ad7d0f6463820dc76dc8';
  v_total int; v_bw int; v_ids int; v_exact int; v_ins int; v_upper int;
  v_tok int; v_tok_distinct int; v_coll int; v_names int; v_inactive int;
  v_md5 text; v_fp_before text; v_fp_after text;
BEGIN
  -- Serialize classify -> verify -> insert -> verify against any concurrent
  -- writer. SHARE ROW EXCLUSIVE blocks INSERT/UPDATE/DELETE but not readers and
  -- is held to the end of the transaction. Only public.exercises is written.
  LOCK TABLE public.exercises IN SHARE ROW EXCLUSIVE MODE;

  -- The ONE expected-record relation.
  CREATE TEMP TABLE _cp4b_expected ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('784a0508-84c3-42a6-98b1-c00cc780e5cd'::uuid,'Wall Push-Up','Horizontal Push','Bodyweight',
     'Chest',ARRAY['Triceps'],'horizontal_push','push','beginner',true,false,'lb','bodyweight_reps',
     ARRAY['wall pushup','wall press up'],
     'Stand facing a wall about one arm length away and place your hands on it at chest height, slightly wider than your shoulders. Keeping your body in one straight line from head to heels, bend your elbows to bring your chest toward the wall, then press back until your arms are straight.',
     'Walk your feet farther from the wall to make it harder. Keep your hips in line with your body - do not let them sag or push back.',true),
    ('c3d81925-04dc-4caf-b5ef-5b42740028e8'::uuid,'Pike Lean','Vertical Push','Bodyweight',
     'Shoulders',ARRAY['Triceps','Core'],'vertical_push','static','beginner',true,false,'sec','time',
     ARRAY['pike hold'],
     'Start on your hands and feet with your hips high and arms straight, so your body makes an upside-down V. Keeping your elbows locked straight, shift your weight forward until your shoulders are over or just past your hands, then hold that position for the set time.',
     'This hold prepares you for the Pike Push-Up; it is not a replacement for it, and your elbows never bend. Lean only as far as you can hold with steady breathing. Walking your feet closer to your hands makes it harder.',true),
    ('1b836b2c-af56-40a6-9afe-023c3ccd5361'::uuid,'Step Jack','Cardio','Bodyweight',
     'Full Body',ARRAY['Shoulders','Calves'],'gait','push','beginner',true,false,'sec','time',
     ARRAY['step jacks','low impact jack'],
     'Stand tall with your feet together and arms at your sides. Step one foot out to the side as you raise both arms overhead, then return to the start. Alternate sides at a steady pace for the set time.',
     'One foot stays on the floor at all times, so there is no jumping. Move faster to raise the effort, or progress to Jumping Jacks.',true),
    ('41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5'::uuid,'Jumping Jack','Cardio','Bodyweight',
     'Full Body',ARRAY['Shoulders','Calves'],'gait','push','beginner',true,false,'sec','time',
     ARRAY['jumping jacks'],
     'Stand tall with your feet together and arms at your sides. Jump your feet out wider than your hips as you raise your arms overhead, then jump back to the start. Keep a steady rhythm for the set time.',
     'Land softly on the balls of your feet with your knees slightly bent. If jumping is too much today, use Step Jacks instead.',true),
    ('7fae5cd2-712d-4df2-982d-850091d10329'::uuid,'March in Place','Cardio','Bodyweight',
     'Full Body',ARRAY['Hip Flexors','Calves'],'gait','push','beginner',true,false,'sec','time',
     ARRAY['marching in place','standing march'],
     'Stand tall and march on the spot, lifting one knee toward hip height while swinging the opposite arm, then switch. Keep a steady pace for the set time.',
     'Stay upright and avoid leaning back. Lift your knees higher or march faster to raise the effort, or progress to High Knees.',true),
    ('6d50c3a6-0dde-46e4-bc3a-508c2f358803'::uuid,'High Knees','Cardio','Bodyweight',
     'Full Body',ARRAY['Hip Flexors','Calves'],'gait','push','beginner',true,false,'sec','time',
     ARRAY['high knee'],
     'Run on the spot, driving each knee up toward hip height and pumping your arms. Keep a quick, steady rhythm for the set time.',
     'Stay light on the balls of your feet and keep your chest tall. If this is too intense, slow down to March in Place.',true),
    ('ead731d6-bfdd-4119-bd0b-bb3092457e69'::uuid,'Cat-Cow','Mobility','Bodyweight',
     'Lower Back',ARRAY['Upper Back','Core'],'mobility','static','beginner',true,false,'sec','time',
     ARRAY['cat camel','cat cow stretch'],
     'Start on your hands and knees with your hands under your shoulders and knees under your hips. Slowly round your back toward the ceiling and tuck your chin, then let your belly lower as you lift your chest and look forward. Move smoothly between the two positions for the set time.',
     'Move slowly and match each position to your breath. Stay within a comfortable range - this is easy movement, not a stretch to force.',true),
    ('44ebe984-c8e9-4842-8617-7f54f1179d2b'::uuid,'Quadruped Thoracic Rotation','Mobility','Bodyweight',
     'Upper Back',ARRAY['Core'],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['thoracic rotation','t spine rotation'],
     'Start on your hands and knees and place one hand behind your head. Rotate your upper back to point that elbow toward the ceiling, then bring it back down toward your supporting arm. Repeat slowly for the set time, then switch hands and do the other side.',
     'Keep your hips still over your knees so the turn comes from your upper back. Follow your elbow with your eyes.',true),
    ('e3f12784-cf40-4aa5-ae41-6770416c4d1f'::uuid,'Wall Slide','Mobility','Bodyweight',
     'Upper Back',ARRAY['Shoulders'],'mobility','static','beginner',true,false,'sec','time',
     ARRAY['wall slides','wall angel'],
     'Stand with your head, upper back and hips against a wall and your heels a few inches away from it. Raise your arms into a goalpost shape with the backs of your arms against the wall. Slowly slide your arms up as far as you can while keeping contact, then slide them back down. Repeat for the set time.',
     'Keep your lower back gently against the wall - do not arch to reach higher. A smaller range with good contact beats a bigger one without it.',true),
    ('6962172b-18eb-4def-88d3-acc67c62f9ce'::uuid,'Kneeling Hip Flexor Stretch','Mobility','Bodyweight',
     'Hip Flexors',ARRAY['Quads'],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['hip flexor stretch','half kneeling hip flexor stretch'],
     'Kneel on one knee with the other foot flat on the floor in front of you. Tuck your hips under and squeeze the glute of the kneeling leg, then shift your hips gently forward until you feel a stretch at the front of that hip. Hold for the set time, then switch legs and repeat.',
     'Keep your torso tall and avoid arching your lower back. Tucking your hips creates the stretch, not leaning forward.',true),
    ('b2168db4-fb33-4dd0-a8e2-ab5fa81677e4'::uuid,'90/90 Hip Rotation','Mobility','Bodyweight',
     'Glutes',ARRAY['Hip Flexors'],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['90 90 stretch','90 90 hip stretch'],
     'Sit on the floor with one leg bent about 90 degrees in front of you and the other bent about 90 degrees out to the side behind you. Sit tall, turn your chest toward your front shin and lean forward gently from your hips, then return upright. Repeat slowly for the set time, then switch so the other leg is in front.',
     'Place your hands on the floor beside or behind you for support if sitting tall is hard. Move only within a comfortable range.',true),
    ('4b0b5faa-4704-4959-a550-c01de705a540'::uuid,'Supine Hamstring Stretch','Mobility','Bodyweight',
     'Hamstrings',ARRAY['Calves'],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['lying hamstring stretch','hamstring stretch'],
     'Lie on your back with both legs straight. Lift one leg and hold the back of that thigh with both hands, keeping the knee as straight as is comfortable, and gently draw the leg toward you until you feel a stretch along the back of the thigh. Hold for the set time, then switch legs.',
     'Bend your other knee with that foot flat on the floor if it is more comfortable. Keep your hips on the floor and ease into the stretch rather than pulling hard.',true),
    ('53c57e39-51e9-42e5-991a-3357bd610b4a'::uuid,'Standing Ankle Rock','Mobility','Bodyweight',
     'Calves',ARRAY[]::text[],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['ankle rock','ankle rocks'],
     'Stand in a short split stance with your front foot flat on the floor, resting a hand on a wall for balance if needed. Keeping your front heel down, slowly rock your front knee forward over your toes, then rock back. Repeat for the set time, then switch legs.',
     'Your front heel stays on the floor - only go as far forward as you can without it lifting. Keep your knee tracking over your middle toes.',true),
    ('fd10bcf3-a09f-41fe-aca5-7996972d496f'::uuid,'Supine Spinal Twist','Mobility','Bodyweight',
     'Lower Back',ARRAY['Glutes'],'mobility','static','beginner',true,true,'sec','time',
     ARRAY['lying spinal twist','supine twist'],
     'Lie on your back with your arms out to the sides. Bend one knee and let it cross over your body toward the floor on the opposite side, keeping both shoulders down. Hold for the set time, then return to center and switch sides.',
     'Turn your head away from the bent knee if that is comfortable. Let gravity do the work - do not push the knee down.',true),
    ('04429fae-c385-47dd-91ec-7e1fe3a4a83c'::uuid,'Diaphragmatic Breathing','Mobility','Bodyweight',
     'Diaphragm',ARRAY['Core'],'mobility','static','beginner',true,false,'sec','time',
     ARRAY['belly breathing','deep breathing'],
     'Lie on your back with your knees bent, or sit tall. Place one hand on your chest and one on your belly. Breathe in slowly through your nose so the hand on your belly rises while your chest stays mostly still, then breathe out slowly. Continue at a calm pace for the set time.',
     'A breathing practice to help you settle down, for example after training. Keep it relaxed and unforced, and return to normal breathing if you feel lightheaded.',true)
  ) AS t(id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
         force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
         aliases,instructions,tips,is_active);

  -- Normalized identity tokens (name + every alias), derived from the relation
  -- with the repository's normalizeExerciseName rule: lowercase, drop
  -- apostrophes, collapse every non-alphanumeric run to one space, trim.
  CREATE TEMP TABLE _cp4b_tokens ON COMMIT DROP AS
  SELECT btrim(regexp_replace(regexp_replace(lower(tok), '[‘’''`]', '', 'g'), '[^a-z0-9]+', ' ', 'g')) AS k
    FROM (SELECT name AS tok FROM _cp4b_expected
          UNION ALL SELECT unnest(aliases) FROM _cp4b_expected) s;

  ------------------------------------------------------- RELATION SELF-CHECKS
  SELECT count(*), count(DISTINCT id), count(DISTINCT name) INTO v_ids, v_exact, v_names FROM _cp4b_expected;
  IF v_ids <> k_n OR v_exact <> k_n OR v_names <> k_n THEN
    RAISE EXCEPTION 'cp4b aborted: expected relation has % rows / % ids / % names, expected %.', v_ids, v_exact, v_names, k_n;
  END IF;
  SELECT count(*), count(DISTINCT k) INTO v_tok, v_tok_distinct FROM _cp4b_tokens;
  IF v_tok <> 42 OR v_tok_distinct <> 42 THEN
    RAISE EXCEPTION 'cp4b aborted: % identity tokens (% distinct after normalization), expected 42/42.', v_tok, v_tok_distinct;
  END IF;
  SELECT count(*) INTO v_upper FROM _cp4b_expected x, unnest(x.aliases) a WHERE a <> lower(a);
  IF v_upper <> 0 THEN
    RAISE EXCEPTION 'cp4b aborted: % expected alias(es) are not lowercase.', v_upper;
  END IF;
  SELECT count(*) INTO v_bw FROM _cp4b_expected
   WHERE equipment = 'Bodyweight' AND is_bodyweight AND is_active AND difficulty = 'beginner';
  IF v_bw <> k_n THEN
    RAISE EXCEPTION 'cp4b aborted: only % of % expected rows are active beginner Bodyweight.', v_bw, k_n;
  END IF;

  ------------------------------------------------------------ CLASSIFY STATE
  SELECT count(*) INTO v_total FROM public.exercises;
  SELECT count(*) INTO v_bw    FROM public.exercises WHERE equipment = 'Bodyweight';
  SELECT count(*) INTO v_ids   FROM public.exercises e JOIN _cp4b_expected x ON x.id = e.id;
  SELECT count(*) INTO v_names FROM public.exercises e JOIN _cp4b_expected x ON x.name = e.name;
  SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) INTO v_md5 FROM public.exercises;
  SELECT count(*) INTO v_upper FROM public.exercises e, unnest(coalesce(e.aliases,'{}')) a WHERE a <> lower(a);

  -- THE exact-record predicate: every inserted column, byte-for-byte, arrays
  -- order-sensitive. Used identically for REPLAY and for POST-CONDITIONS.
  SELECT count(*) INTO v_exact
    FROM public.exercises e
    JOIN _cp4b_expected x ON x.id = e.id
   WHERE e.name = x.name AND e.category = x.category AND e.equipment = x.equipment
     AND e.primary_muscle = x.primary_muscle AND e.secondary_muscles = x.secondary_muscles
     AND e.movement_pattern = x.movement_pattern AND e.force_type = x.force_type
     AND e.difficulty = x.difficulty AND e.is_bodyweight = x.is_bodyweight
     AND e.is_unilateral = x.is_unilateral AND e.default_unit = x.default_unit
     AND e.tracking_type = x.tracking_type AND e.aliases = x.aliases
     AND e.instructions = x.instructions AND e.tips = x.tips AND e.is_active = x.is_active;

  ------------------------------------------------------------------ REPLAY
  IF v_total = k_after AND v_ids = k_n AND v_names = k_n AND v_exact = k_n
     AND v_bw = k_bw_after AND v_md5 = k_md5_after AND v_upper = 0 THEN
    RAISE NOTICE 'cp4b REPLAY: already applied — % rows verified byte-identical, % total, % Bodyweight, md5 %. No write performed.',
      k_n, v_total, v_bw, v_md5;
    RETURN;
  END IF;

  ------------------------------------------------- ABORTS (PARTIAL/DIVERGED)
  IF v_ids <> 0 OR v_names <> 0 THEN
    RAISE EXCEPTION 'cp4b aborted (PARTIAL/DIVERGED): % of % ids and % of % names present, % byte-exact; total %, Bodyweight %, md5 %.',
      v_ids, k_n, v_names, k_n, v_exact, v_total, v_bw, v_md5;
  END IF;
  IF v_total <> k_before THEN
    RAISE EXCEPTION 'cp4b aborted: row count %, expected % (fresh) or % (replay).', v_total, k_before, k_after;
  END IF;
  IF v_bw <> k_bw_before THEN
    RAISE EXCEPTION 'cp4b aborted: Bodyweight count %, expected %.', v_bw, k_bw_before;
  END IF;
  IF v_md5 IS DISTINCT FROM k_md5_before THEN
    RAISE EXCEPTION 'cp4b aborted: sorted-id md5 %, expected %.', v_md5, k_md5_before;
  END IF;
  IF v_upper <> 0 THEN
    RAISE EXCEPTION 'cp4b aborted: % existing alias(es) are not lowercase.', v_upper;
  END IF;

  ------------------------------------------------------------------ FRESH
  -- Reject any normalized name/alias collision with the existing catalog.
  SELECT count(*) INTO v_coll
    FROM (SELECT btrim(regexp_replace(regexp_replace(lower(tok), '[‘’''`]', '', 'g'), '[^a-z0-9]+', ' ', 'g')) AS k
            FROM (SELECT name AS tok FROM public.exercises
                  UNION ALL SELECT unnest(coalesce(aliases,'{}')) FROM public.exercises) s) ex
   WHERE ex.k IN (SELECT k FROM _cp4b_tokens);
  IF v_coll <> 0 THEN
    RAISE EXCEPTION 'cp4b aborted: % existing name/alias token(s) collide with a proposed name or alias.', v_coll;
  END IF;

  -- Fingerprint of every existing row (all columns) to prove none is modified.
  SELECT md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id::text COLLATE "C"))
    INTO v_fp_before FROM public.exercises e;

  INSERT INTO public.exercises
    (id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
     force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
     aliases,instructions,tips,is_active)
  SELECT id,name,category,equipment,primary_muscle,secondary_muscles,movement_pattern,
         force_type,difficulty,is_bodyweight,is_unilateral,default_unit,tracking_type,
         aliases,instructions,tips,is_active
    FROM _cp4b_expected;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins <> k_n THEN RAISE EXCEPTION 'cp4b aborted: inserted % rows, expected %.', v_ins, k_n; END IF;

  ---------------------------------------------------------- POST-CONDITIONS
  SELECT count(*) INTO v_total FROM public.exercises;
  IF v_total <> k_after THEN RAISE EXCEPTION 'cp4b aborted: final count %, expected %.', v_total, k_after; END IF;

  SELECT count(*) INTO v_bw FROM public.exercises WHERE equipment = 'Bodyweight';
  IF v_bw <> k_bw_after THEN RAISE EXCEPTION 'cp4b aborted: final Bodyweight count %, expected %.', v_bw, k_bw_after; END IF;

  SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C")) INTO v_md5 FROM public.exercises;
  IF v_md5 IS DISTINCT FROM k_md5_after THEN
    RAISE EXCEPTION 'cp4b aborted: final sorted-id md5 %, expected %.', v_md5, k_md5_after;
  END IF;

  SELECT count(*) INTO v_inactive FROM public.exercises e JOIN _cp4b_expected x ON x.id = e.id
   WHERE NOT (e.is_active AND e.equipment = 'Bodyweight');
  IF v_inactive <> 0 THEN RAISE EXCEPTION 'cp4b aborted: % new row(s) not active Bodyweight.', v_inactive; END IF;

  SELECT count(*) INTO v_upper FROM public.exercises e, unnest(coalesce(e.aliases,'{}')) a WHERE a <> lower(a);
  IF v_upper <> 0 THEN RAISE EXCEPTION 'cp4b aborted: % alias(es) not lowercase after insert.', v_upper; END IF;

  -- Identical predicate to the replay check above.
  SELECT count(*) INTO v_exact
    FROM public.exercises e
    JOIN _cp4b_expected x ON x.id = e.id
   WHERE e.name = x.name AND e.category = x.category AND e.equipment = x.equipment
     AND e.primary_muscle = x.primary_muscle AND e.secondary_muscles = x.secondary_muscles
     AND e.movement_pattern = x.movement_pattern AND e.force_type = x.force_type
     AND e.difficulty = x.difficulty AND e.is_bodyweight = x.is_bodyweight
     AND e.is_unilateral = x.is_unilateral AND e.default_unit = x.default_unit
     AND e.tracking_type = x.tracking_type AND e.aliases = x.aliases
     AND e.instructions = x.instructions AND e.tips = x.tips AND e.is_active = x.is_active;
  IF v_exact <> k_n THEN
    RAISE EXCEPTION 'cp4b aborted: post-insert exact-record assertion failed (% of %).', v_exact, k_n;
  END IF;

  SELECT md5(string_agg(row_to_json(e)::text, '|' ORDER BY e.id::text COLLATE "C"))
    INTO v_fp_after FROM public.exercises e
   WHERE e.id NOT IN (SELECT id FROM _cp4b_expected);
  IF v_fp_after IS DISTINCT FROM v_fp_before THEN
    RAISE EXCEPTION 'cp4b aborted: an existing exercise row changed (fingerprint % -> %).', v_fp_before, v_fp_after;
  END IF;

  RAISE NOTICE 'cp4b FRESH: inserted % exercises (% -> %; Bodyweight % -> %; md5 %). Existing rows unchanged.',
    k_n, k_before, k_after, k_bw_before, k_bw_after, v_md5;
END
$mig$;