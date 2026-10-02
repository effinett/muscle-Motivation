-- phase_439l_cp2_program_equipment_and_difficulty
-- Phase 4.3.9-L CP2. Corrects equipment_summary and difficulty on the three
-- published Programs to match their audited content, activating the CP1
-- eligibility gate. Recognizes exactly two coherent states: the exact audited
-- before-state (applies) or the exact after-state (no-op replay). Anything
-- else aborts without changing a row.
DO $mig$
DECLARE
  -- Built from a code point, never a literal, so the en dash cannot be
  -- corrupted into a hyphen by copy/paste or an editor. Asserted below against
  -- the value already stored on fat_loss_blueprint.
  k_diff   CONSTANT text := 'Beginner ' || chr(8211) || ' Intermediate';
  k_fat    CONSTANT uuid := '8e8dbdbf-3e9a-4a09-b7bf-673f3acc95ee';
  k_muscle CONSTANT uuid := '75f23eeb-5f36-4508-8399-0c1207afaed1';
  k_glute  CONSTANT uuid := '79b77b10-0f1a-446b-a56a-620e0d3bcff6';
  v_present int;
  v_before  int;
  v_after   int;
  v_n       int;
  v_rows    int := 0;
BEGIN
  ---------------------------------------------------------------- PRECONDITIONS
  -- (a) exactly the three audited rows exist, matched on id AND slug together
  SELECT count(*) INTO v_present
    FROM public.programs
   WHERE (id = k_fat    AND slug = 'fat_loss_blueprint')
      OR (id = k_muscle AND slug = 'muscle_gain')
      OR (id = k_glute  AND slug = 'glute_builder');
  IF v_present <> 3 THEN
    RAISE EXCEPTION
      'phase_439l_cp2 aborted: expected exactly 3 audited Programs by (id, slug), found %.', v_present;
  END IF;

  -- (b) how many rows are in the EXACT before-state
  SELECT count(*) INTO v_before
    FROM public.programs
   WHERE (id = k_fat    AND equipment_summary = 'Any Setup' AND difficulty = k_diff)
      OR (id = k_muscle AND equipment_summary = 'Any Setup' AND difficulty = 'Beginner')
      OR (id = k_glute  AND equipment_summary = 'Any Setup' AND difficulty = 'All Levels');

  -- (c) how many rows are in the EXACT after-state
  SELECT count(*) INTO v_after
    FROM public.programs
   WHERE id IN (k_fat, k_muscle, k_glute)
     AND equipment_summary = 'Full Gym'
     AND difficulty = k_diff;

  -- (d) idempotent replay: the whole set is already correct
  IF v_after = 3 THEN
    RAISE NOTICE 'phase_439l_cp2: already applied — all 3 Programs in the exact after-state. No-op.';
    RETURN;
  END IF;

  -- (e) reject mixed, drifted or partially applied states.
  --     v_before = 3 also proves k_diff is byte-identical to the stored
  --     fat_loss_blueprint difficulty, so the en dash is confirmed correct.
  IF v_before <> 3 THEN
    RAISE EXCEPTION
      'phase_439l_cp2 aborted: catalog is in neither the exact before-state nor the exact after-state (before=%, after=%). Re-audit before proceeding.',
      v_before, v_after;
  END IF;

  --------------------------------------------------------------------- UPDATES
  UPDATE public.programs SET equipment_summary = 'Full Gym'
   WHERE id = k_fat AND equipment_summary = 'Any Setup' AND difficulty = k_diff;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;

  UPDATE public.programs SET equipment_summary = 'Full Gym', difficulty = k_diff
   WHERE id = k_muscle AND equipment_summary = 'Any Setup' AND difficulty = 'Beginner';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;

  UPDATE public.programs SET equipment_summary = 'Full Gym', difficulty = k_diff
   WHERE id = k_glute AND equipment_summary = 'Any Setup' AND difficulty = 'All Levels';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;

  -- rejects a partial apply of 1 or 2 rows
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'phase_439l_cp2 aborted: expected exactly 3 updated rows, got %.', v_rows;
  END IF;

  --------------------------------------------------------------- POSTCONDITIONS
  -- (f) every field of every row is exactly the approved after-state
  SELECT count(*) INTO v_after
    FROM public.programs
   WHERE (id = k_fat    AND equipment_summary = 'Full Gym' AND difficulty = k_diff)
      OR (id = k_muscle AND equipment_summary = 'Full Gym' AND difficulty = k_diff)
      OR (id = k_glute  AND equipment_summary = 'Full Gym' AND difficulty = k_diff);
  IF v_after <> 3 THEN
    RAISE EXCEPTION 'phase_439l_cp2 aborted: post-state assertion failed (% of 3 rows correct).', v_after;
  END IF;

  -- (g) no audited Program still claims Any Setup
  SELECT count(*) INTO v_n FROM public.programs
   WHERE id IN (k_fat, k_muscle, k_glute) AND equipment_summary = 'Any Setup';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'phase_439l_cp2 aborted: % audited Program(s) still declare Any Setup.', v_n;
  END IF;

  RAISE NOTICE 'phase_439l_cp2: applied — 3 Programs corrected.';
END
$mig$;