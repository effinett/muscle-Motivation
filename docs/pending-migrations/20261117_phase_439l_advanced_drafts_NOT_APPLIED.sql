-- Phase 4.3.9-L — Advanced Muscle, Advanced Fat Loss and Advanced Home Strength
-- as HIDDEN DRAFTS (catalog Programs 4, 5 and 6 of 6, in one migration).
-- Additive only: 12 Routines (is_platform, visibility='private') + 3 Programs
-- (status='draft') + 12 program_routines links. No existing row is modified.
-- Creates no purchase, entitlement, enrolment, ownership, price or profile
-- state. Publishing is a separate, separately approved migration: until then
-- pcLoadCatalog (status='published' only) never returns these Programs, so no
-- page, recommendation, card link or Train listing can show them.
--
-- Content: the approved tables in the Program Catalog Plan (Revision 7, content
-- revision 1 applied): exercises, sets, ranges and rests exactly as approved. The
-- only added text is the per-leg, per-arm and timing notes, the Pull-Up note and
-- the walk note (below). Session lists already ship in schedules.js.
-- Access: included with membership; standalone_purchasable stays false until
-- prices and Stripe products are approved (individual purchase is TBD).
-- Owner is derived from Bodyweight Foundations Full Body A/B/C, so no account
-- id is written here and no session setting is needed.
DO $$
DECLARE
  k_am   constant uuid := '13c8ee8a-dc10-5858-afa5-cf2402300268';
  k_am_r1 constant uuid := 'f70d7306-dbca-5b80-adaa-161d7d2c57e8';
  k_am_l1 constant uuid := '39393c74-3a1e-5e02-af19-ec7d5066bd4e';
  k_am_r2 constant uuid := '19c09b00-2482-554f-aa08-1a9c1c2f626a';
  k_am_l2 constant uuid := '382063e5-2238-59fb-a14a-6594dbff8adf';
  k_am_r3 constant uuid := '1e854b64-3232-551e-a467-db886b141915';
  k_am_l3 constant uuid := 'd60ef23f-9e7f-5b4e-ac54-93065df06241';
  k_am_r4 constant uuid := 'e40f5cb9-d978-55e8-aad5-acac4e14ca01';
  k_am_l4 constant uuid := 'f558bb4c-c4be-55c8-a7aa-681e360174de';
  k_af   constant uuid := '4299697c-b0f2-5cd2-a4a0-2d28ba2e8022';
  k_af_r1 constant uuid := 'ac0b375a-be54-52d6-a182-16f786584584';
  k_af_l1 constant uuid := '4d842fe6-f348-538a-a1a3-cee2d0c7af1c';
  k_af_r2 constant uuid := '01437cdd-e1a7-555e-ac7d-7222a539f231';
  k_af_l2 constant uuid := '245610a5-9dbd-55a1-a9cc-d0c167c3c0f3';
  k_af_r3 constant uuid := '2227ef5f-67e4-5d43-a1c2-88055a74e749';
  k_af_l3 constant uuid := '4c5e7a66-41ce-5811-a452-3dad635fa9c7';
  k_af_r4 constant uuid := '6646d270-a178-5f58-ac0d-4acb0bcfab2c';
  k_af_l4 constant uuid := '12dd51c6-784c-5d94-aa97-ec274cc5d663';
  k_ah   constant uuid := '2ab5945b-5436-5024-ad96-8bed32c2c572';
  k_ah_r1 constant uuid := '6b07f0fb-a36f-5fab-ac14-483fb8de94c8';
  k_ah_l1 constant uuid := '0631e38b-36fc-56c0-ae1f-f1bf9dfdd947';
  k_ah_r2 constant uuid := '838e1a79-ea9f-5a66-acdb-7d2d694e016f';
  k_ah_l2 constant uuid := '2aa09068-dc50-51bb-a930-c584df9dfe4e';
  k_ah_r3 constant uuid := 'd6238e30-5b23-521f-af89-6dcd4fccec48';
  k_ah_l3 constant uuid := 'f6091efe-79c7-5387-ada5-3cd100746b30';
  k_ah_r4 constant uuid := '51201e11-d0a6-5e38-a635-1cab473215a0';
  k_ah_l4 constant uuid := 'b541102c-9929-514e-a58c-b0d020539780';
  -- Bodyweight Foundations Full Body A/B/C (migration 20260920231151).
  k_bf_ra  constant uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_bf_rb  constant uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_bf_rc  constant uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  v_owner  uuid;
  v_state  text;
  v_ids    int;
  v_slug   int;
  v_n      int;
  v_diff   int;
BEGIN
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  -- Owner: exactly one platform owner, taken from Full Body A/B/C.
  SELECT count(DISTINCT user_id) INTO v_n FROM public.workout_templates
   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc) AND is_platform;
  IF v_n <> 1 OR (SELECT count(*) FROM public.workout_templates
                   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc) AND is_platform) <> 3 THEN
    RAISE EXCEPTION 'ABORT: Bodyweight Foundations Full Body A/B/C missing or not one owner';
  END IF;
  SELECT DISTINCT user_id INTO v_owner FROM public.workout_templates
   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc);
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
    RAISE EXCEPTION 'ABORT: platform owner account missing';
  END IF;
  IF (SELECT count(DISTINCT user_id) FROM public.workout_templates WHERE is_platform) <> 1 THEN
    RAISE EXCEPTION 'ABORT: platform Routines have more than one owner';
  END IF;

  -- Expected records, defined ONCE. Every non-clock stored column is pinned.
  CREATE TEMP TABLE _adv_routine_exp (
    id uuid, user_id uuid, name text, exercises jsonb, source_program_slug text,
    times_used int, last_used_at timestamptz, sort_order int, description text,
    goal text, difficulty text, tags text[], is_platform boolean,
    visibility text, source_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _adv_routine_exp VALUES
  (k_am_r1, v_owner, 'Upper A',
   '[{"name":"Bench Press","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":150,"exercise_id":"b691b1f7-73a0-415a-854d-41941bdfb5de"},{"name":"Barbell Row","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"8be8652d-266e-46a1-99ea-2105695ed84d"},{"name":"Overhead Press","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"0b12ed6d-3123-4001-ae94-c62a10b95a7e"},{"name":"Pull-Up","sets":3,"reps_low":6,"reps_high":10,"notes":"Add weight when ready.","rest_sec":120,"exercise_id":"39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481"},{"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Skull Crusher","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"2d8cc32e-b73f-40ac-b45f-c4a84642866a"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r2, v_owner, 'Lower A',
   '[{"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":180,"exercise_id":"53cd6807-eb7e-4e5f-bccd-d9621176c35c"},{"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d"},{"name":"Leg Press","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"aaa33fcc-dd0b-46e2-9099-8ca74f5ec253"},{"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"857f62b9-f5e4-4317-a31e-96746815f81b"},{"name":"Standing Calf Raise","sets":4,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0c1546bd-bd09-44e5-a2e1-70f1939d2486"},{"name":"Hanging Leg Raise","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"d06aa93c-276f-4b9e-ad8f-3477c96f4f4e"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r3, v_owner, 'Upper B',
   '[{"name":"Incline Dumbbell Press","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"d37f2707-82db-4e79-ae7f-e313bd805780"},{"name":"Lat Pulldown","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"91b39e1b-1fb1-4e0f-9742-e851c61a201d"},{"name":"Seated Cable Row","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"a1af028a-ea95-413c-af2a-3ab24b836177"},{"name":"Cable Fly","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"e21edf28-1d59-45e0-b717-c9622a9768c6"},{"name":"Face Pull","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"8e94d39c-9a50-4a2e-b4ba-7b08cc6f65e4"},{"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"},{"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2f5892bb-8050-46de-9978-da3153527c2c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r4, v_owner, 'Lower B',
   '[{"name":"Conventional Deadlift","sets":3,"reps_low":4,"reps_high":6,"notes":"","rest_sec":180,"exercise_id":"77b17ae7-5a90-46fb-87bc-f8e989909280"},{"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"19b2ab5c-b3ad-444c-8d44-a42b3700765a"},{"name":"Hip Thrust","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"cfdf913e-7079-4756-a830-71d26540ddd8"},{"name":"Leg Extension","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"e3b57420-d4b6-4f4a-9045-4ad9419ee788"},{"name":"Seated Calf Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"c48b4a24-86b3-4f7e-9ef8-922642209b91"},{"name":"Cable Crunch","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"5e02a1cf-e84c-47ae-943d-e01a5ffc7575"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_af_r1, v_owner, 'Lower',
   '[{"name":"Barbell Back Squat","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":150,"exercise_id":"53cd6807-eb7e-4e5f-bccd-d9621176c35c"},{"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":120,"exercise_id":"425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d"},{"name":"Walking Lunge","sets":3,"reps_low":10,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"ebfb4a3a-28b9-4093-bcb2-d14b1d61aa88"},{"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"857f62b9-f5e4-4317-a31e-96746815f81b"},{"name":"Standing Calf Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"0c1546bd-bd09-44e5-a2e1-70f1939d2486"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_af_r2, v_owner, 'Upper',
   '[{"name":"Bench Press","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"b691b1f7-73a0-415a-854d-41941bdfb5de"},{"name":"Chin-Up","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":90,"exercise_id":"9daedcaa-e007-488f-8a4d-17957361b10e"},{"name":"Seated Cable Row","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"a1af028a-ea95-413c-af2a-3ab24b836177"},{"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac"},{"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Tricep Pushdown","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"2f5892bb-8050-46de-9978-da3153527c2c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_af_r3, v_owner, 'Full Body',
   '[{"name":"Trap Bar Deadlift","sets":3,"reps_low":5,"reps_high":8,"notes":"","rest_sec":150,"exercise_id":"939dc433-4dc7-45ce-bc2a-e1dd5f10405a"},{"name":"Incline Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"d37f2707-82db-4e79-ae7f-e313bd805780"},{"name":"Lat Pulldown","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"91b39e1b-1fb1-4e0f-9742-e851c61a201d"},{"name":"Goblet Squat","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"72f1d568-5da2-4351-8bac-9656c99f3557"},{"name":"Kettlebell Swing","sets":3,"reps_low":12,"reps_high":20,"notes":"","rest_sec":60,"exercise_id":"1d49b4cb-7006-4a4b-99ed-390d0f7c2072"},{"name":"Hanging Knee Raise","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_af_r4, v_owner, 'Conditioning & Core',
   '[{"name":"Jumping Jack","sets":4,"reps_low":30,"reps_high":45,"notes":"Work time in seconds.","rest_sec":45,"exercise_id":"41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5"},{"name":"High Knees","sets":4,"reps_low":30,"reps_high":45,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"6d50c3a6-0dde-46e4-bc3a-508c2f358803"},{"name":"Mountain Climber","sets":4,"reps_low":30,"reps_high":45,"notes":"Work time in seconds.","rest_sec":30,"exercise_id":"ed45d50d-5411-4e47-8309-97314b94adfb"},{"name":"Plank","sets":3,"reps_low":40,"reps_high":60,"notes":"Hold time in seconds.","rest_sec":45,"exercise_id":"c320bf46-9f16-4483-bd2f-9ae9e88b7ad5"},{"name":"Hanging Leg Raise","sets":3,"reps_low":8,"reps_high":12,"notes":"Then finish with a 20-30 minute incline walk. Not logged.","rest_sec":60,"exercise_id":"d06aa93c-276f-4b9e-ad8f-3477c96f4f4e"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'fatloss', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r1, v_owner, 'Upper A',
   '[{"name":"Push-Up","sets":4,"reps_low":10,"reps_high":20,"notes":"","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Dumbbell Row","sets":4,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Band Chest Press","sets":3,"reps_low":10,"reps_high":15,"notes":"No door anchor? Wrap the band behind your upper back.","rest_sec":75,"exercise_id":"6d7b582c-02cd-4a69-9c4d-490c15a6abc2"},{"name":"Band Pull-Apart","sets":3,"reps_low":15,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"66255be0-4c5d-4ea1-9b75-02029ab88d4b"},{"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"},{"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"1b4b6bf8-83df-4c8e-836a-48f1fea82d8d"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r2, v_owner, 'Lower A',
   '[{"name":"Walking Lunge","sets":4,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"ebfb4a3a-28b9-4093-bcb2-d14b1d61aa88"},{"name":"Single-Leg Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"38afdd22-387a-4b76-a895-e815ea24f28c"},{"name":"Goblet Squat","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":75,"exercise_id":"72f1d568-5da2-4351-8bac-9656c99f3557"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":10,"reps_high":15,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Lying Leg Raise","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"0b519d3f-6a32-4883-955c-ad9c87f7385f"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r3, v_owner, 'Upper B',
   '[{"name":"Pike Push-Up","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":90,"exercise_id":"b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34"},{"name":"Band Row","sets":4,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2c6c689e-c443-4a2f-afc7-05aae25ff549"},{"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac"},{"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"a3882f86-1868-4143-8a8b-494880366993"},{"name":"Triceps Kickback","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"62d76b3c-e7ee-4cfe-871d-f302d0b6bf72"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r4, v_owner, 'Lower B',
   '[{"name":"Dumbbell Squat","sets":4,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"889e224a-c534-48b4-a5f8-55d8bada6af3"},{"name":"Dumbbell Romanian Deadlift","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"6107df4c-5295-4268-9dc5-46e922ca9db9"},{"name":"Lateral Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Standing Hip Abduction","sets":3,"reps_low":15,"reps_high":20,"notes":"Reps are per leg.","rest_sec":45,"exercise_id":"00ac1d4d-cb22-46ab-89ac-0fb1618110cc"},{"name":"Side Plank","sets":3,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL);

  CREATE TEMP TABLE _adv_program_exp (
    id uuid, slug text, name text, description text, goal text, difficulty text,
    duration_weeks int, recommended_days_per_week int, equipment_summary text,
    included_with_membership boolean, standalone_purchasable boolean,
    status text, sort_order int, page_path text) ON COMMIT DROP;

  INSERT INTO _adv_program_exp VALUES
  (k_am, 'advanced_muscle', 'Advanced Muscle',
   'Builds muscle with a four-day upper/lower split. Each session starts with heavy compound lifts, then adds machine and cable work for volume.',
   'muscle', 'Intermediate – Advanced', 12, 4, 'Full Gym',
   true, false, 'draft', 6, 'program.html?slug=advanced_muscle'),
  (k_af, 'advanced_fat_loss', 'Advanced Fat Loss',
   'Four full-gym sessions that build strength while you lose fat: lower, upper, full body, and a conditioning and core day.',
   'fatloss', 'Intermediate – Advanced', 12, 4, 'Full Gym',
   true, false, 'draft', 7, 'program.html?slug=advanced_fat_loss'),
  (k_ah, 'advanced_home_strength', 'Advanced Home Strength',
   'Builds muscle at home with dumbbells and bands, in a four-day upper/lower split.',
   'muscle', 'Intermediate – Advanced', 10, 4, 'Home Setup',
   true, false, 'draft', 8, 'program.html?slug=advanced_home_strength');

  CREATE TEMP TABLE _adv_link_exp (
    id uuid, program_id uuid, routine_id uuid, session_key text,
    sort_order int, legacy_program_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _adv_link_exp VALUES
  (k_am_l1, k_am, k_am_r1, 'upper_a', 1, NULL),
  (k_am_l2, k_am, k_am_r2, 'lower_a', 2, NULL),
  (k_am_l3, k_am, k_am_r3, 'upper_b', 3, NULL),
  (k_am_l4, k_am, k_am_r4, 'lower_b', 4, NULL),
  (k_af_l1, k_af, k_af_r1, 'lower', 1, NULL),
  (k_af_l2, k_af, k_af_r2, 'upper', 2, NULL),
  (k_af_l3, k_af, k_af_r3, 'full_body', 3, NULL),
  (k_af_l4, k_af, k_af_r4, 'conditioning_core', 4, NULL),
  (k_ah_l1, k_ah, k_ah_r1, 'upper_a', 1, NULL),
  (k_ah_l2, k_ah, k_ah_r2, 'lower_a', 2, NULL),
  (k_ah_l3, k_ah, k_ah_r3, 'upper_b', 3, NULL),
  (k_ah_l4, k_ah, k_ah_r4, 'lower_b', 4, NULL);

  -- Content preconditions
  IF (SELECT count(*) FROM public.exercises) <> 159 THEN
    RAISE EXCEPTION 'ABORT: exercise catalog is not 159 rows';
  END IF;

  -- 69 prescription entries, each the canonical 7-key shape, sane numbers.
  SELECT count(*) INTO v_n FROM _adv_routine_exp r, jsonb_array_elements(r.exercises) x;
  IF v_n <> 69 THEN
    RAISE EXCEPTION 'ABORT: expected 69 prescription entries, found %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM _adv_routine_exp r, jsonb_array_elements(r.exercises) x
              WHERE NOT (x ?& array['name','sets','reps_low','reps_high',
                                    'notes','rest_sec','exercise_id'])
                 OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 7
                 OR (x->>'sets')::int < 1
                 OR (x->>'reps_low')::int >= (x->>'reps_high')::int
                 OR (x->>'rest_sec')::int < 1) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is malformed or has a fixed target';
  END IF;

  -- 53 distinct exercises, every one active and named exactly as in the catalog.
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid FROM _adv_routine_exp r,
           jsonb_array_elements(r.exercises) x) q;
  IF v_n <> 53 THEN
    RAISE EXCEPTION 'ABORT: expected 53 distinct exercise ids, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id, x->>'name' AS name
      FROM _adv_routine_exp r, jsonb_array_elements(r.exercises) x) q
    JOIN public.exercises e ON e.id = q.id AND e.name = q.name AND e.is_active;
  IF v_n <> 53 THEN
    RAISE EXCEPTION 'ABORT: only % of 53 prescribed exercises are active and correctly named', v_n;
  END IF;

  -- Equipment promise: every exercise in a Program's Routines uses only that
  -- Program's equipment (Home Setup = Dumbbell, Band, Bodyweight).
  IF EXISTS (
    SELECT 1
      FROM _adv_link_exp l
      JOIN _adv_routine_exp r ON r.id = l.routine_id
      JOIN LATERAL jsonb_array_elements(r.exercises) x ON true
      JOIN public.exercises e ON e.id = (x->>'exercise_id')::uuid
      JOIN (VALUES
      (k_am, ARRAY['Barbell','Dumbbell','Cable','Machine','Bodyweight']),
      (k_af, ARRAY['Barbell','Dumbbell','Cable','Machine','Kettlebell','Bodyweight']),
      (k_ah, ARRAY['Dumbbell','Band','Bodyweight'])
      ) AS allowed(program_id, eq) ON allowed.program_id = l.program_id
     WHERE NOT (e.equipment = ANY (allowed.eq))) THEN
    RAISE EXCEPTION 'ABORT: a prescribed exercise needs equipment the Program does not promise';
  END IF;

  -- The session keys must be the ones schedules.js uses for these Programs.
  IF EXISTS (
    SELECT 1 FROM (
        SELECT 'advanced_muscle' AS s, ARRAY['upper_a','lower_a','upper_b','lower_b'] AS keys
    UNION ALL     SELECT 'advanced_fat_loss' AS s, ARRAY['lower','upper','full_body','conditioning_core'] AS keys
    UNION ALL     SELECT 'advanced_home_strength' AS s, ARRAY['upper_a','lower_a','upper_b','lower_b'] AS keys
    ) k
    WHERE k.keys <> (SELECT array_agg(l.session_key ORDER BY l.sort_order)
                       FROM _adv_link_exp l JOIN _adv_program_exp p ON p.id = l.program_id
                      WHERE p.slug = k.s)) THEN
    RAISE EXCEPTION 'ABORT: session keys differ from schedules.js';
  END IF;

  -- Exhaustive state machine. No shared permissive branch.
  SELECT count(*) INTO v_ids FROM (
    SELECT id FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4)
    UNION ALL SELECT id FROM public.programs         WHERE id IN (k_am,k_af,k_ah)
    UNION ALL SELECT id FROM public.program_routines WHERE id IN (k_am_l1,k_am_l2,k_am_l3,k_am_l4,k_af_l1,k_af_l2,k_af_l3,k_af_l4,k_ah_l1,k_ah_l2,k_ah_l3,k_ah_l4)
    UNION ALL SELECT id FROM public.exercises        WHERE id IN
      (k_am,k_af,k_ah,k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4,k_am_l1,k_am_l2,k_am_l3,k_am_l4,k_af_l1,k_af_l2,k_af_l3,k_af_l4,k_ah_l1,k_ah_l2,k_ah_l3,k_ah_l4)) c;

  SELECT count(*) INTO v_slug FROM public.programs WHERE slug IN ('advanced_muscle','advanced_fat_loss','advanced_home_strength');

  IF v_ids = 0 AND v_slug = 0 THEN
    v_state := 'fresh';
  ELSIF v_ids = 27 AND v_slug = 3 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION
      'ABORT: partial or conflicting state (id hits=%, slug rows=%)', v_ids, v_slug;
  END IF;

  IF v_state = 'fresh' THEN
    -- Global counts before: exactly the 2026-11-17 production state.
    IF (SELECT count(*) FROM public.programs) <> 5
       OR (SELECT count(*) FROM public.programs WHERE status = 'published') <> 5
       OR (SELECT count(*) FROM public.program_routines) <> 60
       OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 61
    THEN RAISE EXCEPTION 'ABORT: catalog row counts differ from the approved starting state'; END IF;

    INSERT INTO public.workout_templates
      (id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
       sort_order,description,goal,difficulty,tags,is_platform,visibility,
       source_workout_id)
    SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
           sort_order,description,goal,difficulty,tags,is_platform,visibility,
           source_workout_id FROM _adv_routine_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 12 THEN RAISE EXCEPTION 'ABORT: inserted % Routines, expected 12', v_n; END IF;

    INSERT INTO public.programs
      (id,slug,name,description,goal,difficulty,duration_weeks,
       recommended_days_per_week,equipment_summary,included_with_membership,
       standalone_purchasable,status,sort_order,page_path)
    SELECT id,slug,name,description,goal,difficulty,duration_weeks,
           recommended_days_per_week,equipment_summary,included_with_membership,
           standalone_purchasable,status,sort_order,page_path
      FROM _adv_program_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: inserted % Programs, expected 3', v_n; END IF;

    INSERT INTO public.program_routines
      (id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id)
    SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
      FROM _adv_link_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 12 THEN RAISE EXCEPTION 'ABORT: inserted % links, expected 12', v_n; END IF;
  END IF;

  -- Verification, identical for both paths.
  IF (SELECT count(*) FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4)) <> 12
    THEN RAISE EXCEPTION 'ABORT: expected exactly 12 Routine rows'; END IF;
  IF (SELECT count(*) FROM public.programs WHERE id IN (k_am,k_af,k_ah)) <> 3
    THEN RAISE EXCEPTION 'ABORT: expected exactly 3 Program rows'; END IF;
  IF (SELECT count(*) FROM public.program_routines WHERE program_id IN (k_am,k_af,k_ah)) <> 12
    THEN RAISE EXCEPTION 'ABORT: expected exactly 12 links for these Programs'; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4)
     EXCEPT SELECT * FROM _adv_routine_exp)
    UNION ALL
    (SELECT * FROM _adv_routine_exp
     EXCEPT
     SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Routine rows differ from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id IN (k_am,k_af,k_ah)
     EXCEPT SELECT * FROM _adv_program_exp)
    UNION ALL
    (SELECT * FROM _adv_program_exp
     EXCEPT
     SELECT id,slug,name,description,goal,difficulty,duration_weeks,
            recommended_days_per_week,equipment_summary,included_with_membership,
            standalone_purchasable,status,sort_order,page_path
       FROM public.programs WHERE id IN (k_am,k_af,k_ah))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: Program rows differ from approved (% diffs)', v_diff; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id IN (k_am,k_af,k_ah)
     EXCEPT SELECT * FROM _adv_link_exp)
    UNION ALL
    (SELECT * FROM _adv_link_exp
     EXCEPT
     SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id IN (k_am,k_af,k_ah))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: link rows differ from approved (% diffs)', v_diff; END IF;

  -- Timestamp invariants: never compared to a literal clock value.
  IF v_state = 'fresh' THEN
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id IN (k_am,k_af,k_ah)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id IN (k_am,k_af,k_ah)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at <> created_at))
    THEN RAISE EXCEPTION 'ABORT: fresh insert must have updated_at = created_at'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.workout_templates WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.programs WHERE id IN (k_am,k_af,k_ah)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
      OR EXISTS (SELECT 1 FROM public.program_routines WHERE program_id IN (k_am,k_af,k_ah)
                AND (created_at IS NULL OR updated_at IS NULL OR updated_at < created_at))
    THEN RAISE EXCEPTION 'ABORT: replay timestamp invariant violated'; END IF;
  END IF;

  -- Nothing is published, and nothing outside these Programs changed.
  IF (SELECT count(*) FROM public.programs WHERE status = 'published') <> 5
     OR EXISTS (SELECT 1 FROM public.programs WHERE id IN (k_am,k_af,k_ah) AND status <> 'draft')
     OR EXISTS (SELECT 1 FROM public.workout_templates
                 WHERE id IN (k_am_r1,k_am_r2,k_am_r3,k_am_r4,k_af_r1,k_af_r2,k_af_r3,k_af_r4,k_ah_r1,k_ah_r2,k_ah_r3,k_ah_r4) AND visibility <> 'private')
  THEN RAISE EXCEPTION 'ABORT: something is published that must stay hidden'; END IF;

  IF (SELECT count(*) FROM public.programs) <> 8
     OR (SELECT count(*) FROM public.program_routines) <> 72
     OR (SELECT count(*) FROM public.workout_templates WHERE is_platform) <> 73
     OR (SELECT count(*) FROM public.exercises) <> 159
  THEN RAISE EXCEPTION 'ABORT: collateral row-count change detected'; END IF;

  RAISE NOTICE 'phase_439l_advanced_drafts: state=%', v_state;
END $$;
