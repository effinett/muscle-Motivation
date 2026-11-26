-- Phase 4.3.9-L — Advanced Muscle and Advanced Home Strength: a proper split for
-- every training-day choice (owner-approved 2026-11-25, "Advanced Programs — Training
-- Day Splits" draft).
--
-- Additive only: 18 Routines (is_platform, visibility='private') and 18
-- program_routines links (sort_order 5–13 per Program, after the four approved
-- Upper/Lower sessions, which are untouched). No existing row is modified; no
-- Program status, price, purchase, entitlement or enrolment changes.
--
-- New session keys (the same nine for both Programs):
--   full_a, full_b, full_c            → 2 and 3 days
--   push_a, pull_a, legs_a            → 6 days
--   push_b, pull_b, legs_b            → 5 and 6 days
-- schedules.js maps them; the 4-day Upper/Lower list is unchanged. The links must
-- exist BEFORE the schedules.js change deploys, or the new sessions have no Routine.
--
-- Advanced Home Strength uses only Dumbbell, Band and Bodyweight exercises (its
-- "Home Setup" promise); this is enforced below. Owner is derived from Bodyweight
-- Foundations Full Body A/B/C, so no account id is written here.
DO $$
DECLARE
  k_am   constant uuid := '13c8ee8a-dc10-5858-afa5-cf2402300268';
  k_ah   constant uuid := '2ab5945b-5436-5024-ad96-8bed32c2c572';
  k_am_r_full_a constant uuid := '0f35b09a-09ba-5a66-9e71-e4a5ddbcd4a5';
  k_am_l_full_a constant uuid := 'b922ecda-4b6d-5928-be91-7f8bc0adae8d';
  k_am_r_full_b constant uuid := '7db84bd1-cf4c-5615-a2c1-909f3a5b94d6';
  k_am_l_full_b constant uuid := 'ee548478-99cc-5647-bdad-9e9ef5d96cab';
  k_am_r_full_c constant uuid := '0951bead-f2c4-5f84-a44e-0d8811c728cf';
  k_am_l_full_c constant uuid := '5f47903b-8840-5816-9513-6dd7dbd397da';
  k_am_r_push_a constant uuid := 'f8fe141d-8a98-57ff-a07f-35bf1852b722';
  k_am_l_push_a constant uuid := '0245beca-9e0c-58c3-afa2-b196aab936c5';
  k_am_r_pull_a constant uuid := '79d414a7-2e26-5383-92b0-2d216c30dbd0';
  k_am_l_pull_a constant uuid := '47b9bbf6-f220-559d-93d1-f3e92768feb8';
  k_am_r_legs_a constant uuid := 'a9f6546b-cf8d-5a5b-b5ee-acf6f38eb4b8';
  k_am_l_legs_a constant uuid := 'aa2c0edb-57b3-5761-a891-ba09644cff8b';
  k_am_r_push_b constant uuid := '3f9989e8-4dcb-5200-a8b3-cbf94ec03419';
  k_am_l_push_b constant uuid := 'f456caf1-fdd9-5930-ab32-b153d43f4366';
  k_am_r_pull_b constant uuid := 'a20e2b1a-99a2-5fa6-9c7f-4a0e8e82e604';
  k_am_l_pull_b constant uuid := '30de33b5-30dd-5efc-a20a-39dcf5bf9f27';
  k_am_r_legs_b constant uuid := '98e1bccf-e51f-5a7c-a767-34ad099a703d';
  k_am_l_legs_b constant uuid := 'dda27104-352b-5366-8785-a49f40348211';
  k_ah_r_full_a constant uuid := 'bd0e3da8-a232-5232-b49b-1db5ce05ae53';
  k_ah_l_full_a constant uuid := 'e58fd3ae-126d-5ecb-b266-0e262f1e33ea';
  k_ah_r_full_b constant uuid := '9573ea74-3676-5908-ac98-e728fe943859';
  k_ah_l_full_b constant uuid := '4db56279-db37-5d84-aed5-816aa2bb380c';
  k_ah_r_full_c constant uuid := 'f8f14840-5568-51c2-905f-ec7118d4c7b3';
  k_ah_l_full_c constant uuid := 'b52fc29c-c2ad-5801-b9b2-908fce0c1781';
  k_ah_r_push_a constant uuid := 'fa7db7e9-3506-5c95-bc6a-1964f6488641';
  k_ah_l_push_a constant uuid := '05a99707-5c87-569b-9f98-1b0ff142ead1';
  k_ah_r_pull_a constant uuid := '16aa8ea2-e97f-5034-95e2-aa6d031e4131';
  k_ah_l_pull_a constant uuid := '82b7d7f3-e8fd-5569-972f-aebb709d4298';
  k_ah_r_legs_a constant uuid := 'ec6bc93d-d377-5364-83a2-2825c3f6f818';
  k_ah_l_legs_a constant uuid := '053dd038-3354-5b5f-acce-aafac2cc8e80';
  k_ah_r_push_b constant uuid := 'be33c67a-3fa3-514c-92a8-f6b909fb34df';
  k_ah_l_push_b constant uuid := '081ad98e-d149-599f-8116-0ee1976db2c2';
  k_ah_r_pull_b constant uuid := '13533226-f909-50da-897b-0e8f490df3f7';
  k_ah_l_pull_b constant uuid := '6ed9981a-8644-5f06-9a34-22dab6258e8f';
  k_ah_r_legs_b constant uuid := '52ce5ecb-c586-5c58-b8cc-2ffc4897ceb1';
  k_ah_l_legs_b constant uuid := '245da97a-0d1c-5cdb-990e-6e1a89b85c5e';
  k_bf_ra  constant uuid := 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4';
  k_bf_rb  constant uuid := 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5';
  k_bf_rc  constant uuid := 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6';
  v_owner  uuid;
  v_state  text;
  v_ids    int;
  v_n      int;
  v_diff   int;
BEGIN
  LOCK TABLE public.exercises         IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.workout_templates IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.programs          IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.program_routines  IN SHARE ROW EXCLUSIVE MODE;

  -- Owner: exactly one platform owner, taken from Full Body A/B/C.
  IF (SELECT count(*) FROM public.workout_templates
       WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc) AND is_platform) <> 3
     OR (SELECT count(DISTINCT user_id) FROM public.workout_templates
          WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc)) <> 1 THEN
    RAISE EXCEPTION 'ABORT: Bodyweight Foundations Full Body A/B/C missing or not one owner';
  END IF;
  SELECT DISTINCT user_id INTO v_owner FROM public.workout_templates
   WHERE id IN (k_bf_ra, k_bf_rb, k_bf_rc);
  IF (SELECT count(DISTINCT user_id) FROM public.workout_templates WHERE is_platform) <> 1 THEN
    RAISE EXCEPTION 'ABORT: platform Routines have more than one owner';
  END IF;

  -- The two Programs, in the expected state, each with its four approved links.
  IF (SELECT count(*) FROM public.programs
       WHERE id = k_am AND slug = 'advanced_muscle' AND status = 'published') <> 1
     OR (SELECT count(*) FROM public.programs
          WHERE id = k_ah AND slug = 'advanced_home_strength' AND status = 'draft') <> 1 THEN
    RAISE EXCEPTION 'ABORT: Advanced Muscle / Advanced Home Strength not in the expected state';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES (k_am), (k_ah)) p(id)
     WHERE (SELECT array_agg(session_key ORDER BY sort_order)
              FROM public.program_routines l WHERE l.program_id = p.id
               AND l.sort_order <= 4)
           IS DISTINCT FROM ARRAY['upper_a','lower_a','upper_b','lower_b']) THEN
    RAISE EXCEPTION 'ABORT: the approved Upper/Lower links are not as expected';
  END IF;

  CREATE TEMP TABLE _split_routine_exp (
    id uuid, user_id uuid, name text, exercises jsonb, source_program_slug text,
    times_used int, last_used_at timestamptz, sort_order int, description text,
    goal text, difficulty text, tags text[], is_platform boolean,
    visibility text, source_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _split_routine_exp VALUES
  (k_am_r_full_a, v_owner, 'Full Body A',
   '[{"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":180,"exercise_id":"53cd6807-eb7e-4e5f-bccd-d9621176c35c"},{"name":"Bench Press","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":150,"exercise_id":"b691b1f7-73a0-415a-854d-41941bdfb5de"},{"name":"Barbell Row","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"8be8652d-266e-46a1-99ea-2105695ed84d"},{"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d"},{"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Hammer Curl","sets":2,"reps_low":10,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"},{"name":"Tricep Pushdown","sets":2,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2f5892bb-8050-46de-9978-da3153527c2c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_full_b, v_owner, 'Full Body B',
   '[{"name":"Conventional Deadlift","sets":3,"reps_low":4,"reps_high":6,"notes":"","rest_sec":180,"exercise_id":"77b17ae7-5a90-46fb-87bc-f8e989909280"},{"name":"Overhead Press","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"0b12ed6d-3123-4001-ae94-c62a10b95a7e"},{"name":"Pull-Up","sets":4,"reps_low":6,"reps_high":10,"notes":"Add weight when ready.","rest_sec":120,"exercise_id":"39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481"},{"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"19b2ab5c-b3ad-444c-8d44-a42b3700765a"},{"name":"Incline Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"d37f2707-82db-4e79-ae7f-e313bd805780"},{"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"857f62b9-f5e4-4317-a31e-96746815f81b"},{"name":"Hanging Leg Raise","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"d06aa93c-276f-4b9e-ad8f-3477c96f4f4e"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_full_c, v_owner, 'Full Body C',
   '[{"name":"Front Squat","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":150,"exercise_id":"7665f3c7-a2d4-4456-a9fa-000ce24e3ed8"},{"name":"Incline Bench Press","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"11a1f4e3-88d5-4660-817b-6e904b1a731c"},{"name":"Chest-Supported Row","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"89ccfccf-3e25-4c79-9417-c4086d5f0921"},{"name":"Hip Thrust","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"cfdf913e-7079-4756-a830-71d26540ddd8"},{"name":"Lat Pulldown","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"91b39e1b-1fb1-4e0f-9742-e851c61a201d"},{"name":"Cable Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0a93b1f0-8548-4290-bf58-0fdb6a6db3bd"},{"name":"Standing Calf Raise","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0c1546bd-bd09-44e5-a2e1-70f1939d2486"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_push_a, v_owner, 'Push A',
   '[{"name":"Bench Press","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":150,"exercise_id":"b691b1f7-73a0-415a-854d-41941bdfb5de"},{"name":"Overhead Press","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"0b12ed6d-3123-4001-ae94-c62a10b95a7e"},{"name":"Incline Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"d37f2707-82db-4e79-ae7f-e313bd805780"},{"name":"Cable Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0a93b1f0-8548-4290-bf58-0fdb6a6db3bd"},{"name":"Skull Crusher","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"2d8cc32e-b73f-40ac-b45f-c4a84642866a"},{"name":"Rope Pushdown","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0f482fbe-5898-4d19-b66c-619a49e7983a"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_pull_a, v_owner, 'Pull A',
   '[{"name":"Conventional Deadlift","sets":3,"reps_low":4,"reps_high":6,"notes":"","rest_sec":180,"exercise_id":"77b17ae7-5a90-46fb-87bc-f8e989909280"},{"name":"Pull-Up","sets":4,"reps_low":6,"reps_high":10,"notes":"Add weight when ready.","rest_sec":120,"exercise_id":"39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481"},{"name":"Barbell Row","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"8be8652d-266e-46a1-99ea-2105695ed84d"},{"name":"Face Pull","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"8e94d39c-9a50-4a2e-b4ba-7b08cc6f65e4"},{"name":"Barbell Curl","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"159d6166-afbb-4932-b60b-a28b80b492ee"},{"name":"Hammer Curl","sets":2,"reps_low":10,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_legs_a, v_owner, 'Legs A',
   '[{"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":8,"notes":"","rest_sec":180,"exercise_id":"53cd6807-eb7e-4e5f-bccd-d9621176c35c"},{"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d"},{"name":"Leg Press","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"aaa33fcc-dd0b-46e2-9099-8ca74f5ec253"},{"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"857f62b9-f5e4-4317-a31e-96746815f81b"},{"name":"Standing Calf Raise","sets":4,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"0c1546bd-bd09-44e5-a2e1-70f1939d2486"},{"name":"Hanging Leg Raise","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"d06aa93c-276f-4b9e-ad8f-3477c96f4f4e"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_push_b, v_owner, 'Push B',
   '[{"name":"Incline Bench Press","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"11a1f4e3-88d5-4660-817b-6e904b1a731c"},{"name":"Machine Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"6537df39-e313-4679-93b1-946f906667d5"},{"name":"Cable Fly","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"e21edf28-1d59-45e0-b717-c9622a9768c6"},{"name":"Lateral Raise","sets":4,"reps_low":12,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Close-Grip Bench Press","sets":3,"reps_low":6,"reps_high":10,"notes":"","rest_sec":120,"exercise_id":"2205e63b-3486-4d1b-bc9d-189ee9d4b3bd"},{"name":"Overhead Cable Triceps Extension","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"05443545-34bc-47f9-8563-3ac660d7bcc7"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_pull_b, v_owner, 'Pull B',
   '[{"name":"Lat Pulldown","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"91b39e1b-1fb1-4e0f-9742-e851c61a201d"},{"name":"Chest-Supported Row","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"89ccfccf-3e25-4c79-9417-c4086d5f0921"},{"name":"Single-Arm Cable Row","sets":3,"reps_low":10,"reps_high":12,"notes":"Reps are per arm.","rest_sec":60,"exercise_id":"ced6dc23-e063-4dad-a460-1e3f7b034613"},{"name":"Reverse Pec Deck","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"e13b981a-d39c-498a-9db2-419c9f953126"},{"name":"Incline Dumbbell Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"820e77e6-ea59-4767-987f-618f6f7cfc01"},{"name":"Cable Curl","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"eda3ba6a-ae43-426e-b81f-dbf5cbe3bbe9"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_am_r_legs_b, v_owner, 'Legs B',
   '[{"name":"Hack Squat","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":120,"exercise_id":"69ca08c3-143c-49f3-b2c9-925d6d294c09"},{"name":"Hip Thrust","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"cfdf913e-7079-4756-a830-71d26540ddd8"},{"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"19b2ab5c-b3ad-444c-8d44-a42b3700765a"},{"name":"Seated Leg Curl","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2b30eeef-8550-44ea-8190-67bdeab5c724"},{"name":"Leg Extension","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"e3b57420-d4b6-4f4a-9045-4ad9419ee788"},{"name":"Seated Calf Raise","sets":4,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"c48b4a24-86b3-4f7e-9ef8-922642209b91"},{"name":"Cable Crunch","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"5e02a1cf-e84c-47ae-943d-e01a5ffc7575"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_full_a, v_owner, 'Full Body A',
   '[{"name":"Goblet Squat","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"72f1d568-5da2-4351-8bac-9656c99f3557"},{"name":"Dumbbell Romanian Deadlift","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"6107df4c-5295-4268-9dc5-46e922ca9db9"},{"name":"Push-Up","sets":4,"reps_low":10,"reps_high":20,"notes":"","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Dumbbell Row","sets":4,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Dead Bug","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per side.","rest_sec":45,"exercise_id":"9c8998ab-9713-43f4-940b-5f8feec39d3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_full_b, v_owner, 'Full Body B',
   '[{"name":"Walking Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":90,"exercise_id":"ebfb4a3a-28b9-4093-bcb2-d14b1d61aa88"},{"name":"Single-Leg Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"38afdd22-387a-4b76-a895-e815ea24f28c"},{"name":"Dumbbell Shoulder Press","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac"},{"name":"Band Row","sets":4,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2c6c689e-c443-4a2f-afc7-05aae25ff549"},{"name":"Band Chest Press","sets":3,"reps_low":10,"reps_high":15,"notes":"No door anchor? Wrap the band behind your upper back.","rest_sec":60,"exercise_id":"6d7b582c-02cd-4a69-9c4d-490c15a6abc2"},{"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"},{"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"1b4b6bf8-83df-4c8e-836a-48f1fea82d8d"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_full_c, v_owner, 'Full Body C',
   '[{"name":"Dumbbell Squat","sets":4,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"889e224a-c534-48b4-a5f8-55d8bada6af3"},{"name":"Single-Leg Hip Thrust","sets":3,"reps_low":10,"reps_high":15,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"db9208d9-0190-40dd-849b-38724ec9e09d"},{"name":"Decline Push-Up","sets":4,"reps_low":8,"reps_high":15,"notes":"Feet on a sturdy chair or step.","rest_sec":75,"exercise_id":"eecf2677-57d4-4bc1-a0e9-bd3ffe59ab15"},{"name":"Dumbbell Row","sets":4,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Arnold Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"5f9b8812-feca-4bbd-92ab-2df3a752ef39"},{"name":"Rear Delt Fly","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d215f1b8-3c36-45d9-9767-0517b5f29232"},{"name":"Side Plank","sets":3,"reps_low":20,"reps_high":40,"notes":"Hold time in seconds, per side.","rest_sec":45,"exercise_id":"be4abe1a-93fa-4e87-9250-2627fe45ad3c"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_push_a, v_owner, 'Push A',
   '[{"name":"Push-Up","sets":4,"reps_low":10,"reps_high":20,"notes":"","rest_sec":75,"exercise_id":"dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac"},{"name":"Dumbbell Shoulder Press","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac"},{"name":"Band Chest Press","sets":3,"reps_low":10,"reps_high":15,"notes":"No door anchor? Wrap the band behind your upper back.","rest_sec":60,"exercise_id":"6d7b582c-02cd-4a69-9c4d-490c15a6abc2"},{"name":"Lateral Raise","sets":4,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d327531a-34fa-4ffa-a019-5bd03db30c57"},{"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":60,"exercise_id":"1b4b6bf8-83df-4c8e-836a-48f1fea82d8d"},{"name":"Triceps Kickback","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"62d76b3c-e7ee-4cfe-871d-f302d0b6bf72"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_pull_a, v_owner, 'Pull A',
   '[{"name":"Dumbbell Row","sets":4,"reps_low":8,"reps_high":12,"notes":"Reps are per arm.","rest_sec":75,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Band Row","sets":4,"reps_low":12,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"2c6c689e-c443-4a2f-afc7-05aae25ff549"},{"name":"Rear Delt Fly","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d215f1b8-3c36-45d9-9767-0517b5f29232"},{"name":"Band Pull-Apart","sets":3,"reps_low":15,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"66255be0-4c5d-4ea1-9b75-02029ab88d4b"},{"name":"Dumbbell Shrug","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":60,"exercise_id":"9beb1336-4ba4-49bd-936d-f64abc0c94d9"},{"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"a3882f86-1868-4143-8a8b-494880366993"},{"name":"Hammer Curl","sets":2,"reps_low":10,"reps_high":12,"notes":"","rest_sec":45,"exercise_id":"f19396bd-a73c-442e-a705-9439c6d5b575"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_legs_a, v_owner, 'Legs A',
   '[{"name":"Goblet Squat","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"72f1d568-5da2-4351-8bac-9656c99f3557"},{"name":"Dumbbell Romanian Deadlift","sets":4,"reps_low":8,"reps_high":12,"notes":"","rest_sec":90,"exercise_id":"6107df4c-5295-4268-9dc5-46e922ca9db9"},{"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"d2812c92-d4c6-420c-b2d9-d2c5757871c9"},{"name":"Single-Leg Glute Bridge","sets":3,"reps_low":10,"reps_high":15,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"da2d9535-6e82-4790-84c9-8e1a0d549718"},{"name":"Standing Hip Abduction","sets":3,"reps_low":15,"reps_high":20,"notes":"Reps are per leg.","rest_sec":45,"exercise_id":"00ac1d4d-cb22-46ab-89ac-0fb1618110cc"},{"name":"Lying Leg Raise","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"0b519d3f-6a32-4883-955c-ad9c87f7385f"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_push_b, v_owner, 'Push B',
   '[{"name":"Pike Push-Up","sets":4,"reps_low":6,"reps_high":10,"notes":"","rest_sec":90,"exercise_id":"b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34"},{"name":"Decline Push-Up","sets":4,"reps_low":8,"reps_high":15,"notes":"Feet on a sturdy chair or step.","rest_sec":75,"exercise_id":"eecf2677-57d4-4bc1-a0e9-bd3ffe59ab15"},{"name":"Arnold Press","sets":3,"reps_low":8,"reps_high":12,"notes":"","rest_sec":75,"exercise_id":"5f9b8812-feca-4bbd-92ab-2df3a752ef39"},{"name":"Band Lateral Raise","sets":3,"reps_low":15,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"4331a223-ad04-4b87-9f36-817ee2b8dea5"},{"name":"Front Raise","sets":2,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d230aa81-cd32-42f5-9505-34855af61f04"},{"name":"Band Triceps Extension","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"eb428a86-18d8-42cc-b7bf-f2808897bf74"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_pull_b, v_owner, 'Pull B',
   '[{"name":"Dumbbell Row","sets":4,"reps_low":10,"reps_high":15,"notes":"Reps are per arm.","rest_sec":60,"exercise_id":"c06a8a91-151b-428d-9144-9e9730ca4652"},{"name":"Band Pull-Apart","sets":4,"reps_low":15,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"66255be0-4c5d-4ea1-9b75-02029ab88d4b"},{"name":"Rear Delt Fly","sets":3,"reps_low":12,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"d215f1b8-3c36-45d9-9767-0517b5f29232"},{"name":"Superman","sets":3,"reps_low":10,"reps_high":15,"notes":"Posterior-chain and postural endurance. Not a pulling exercise and not a substitute for rows.","rest_sec":45,"exercise_id":"c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45"},{"name":"Concentration Curl","sets":3,"reps_low":10,"reps_high":12,"notes":"Reps are per arm.","rest_sec":45,"exercise_id":"1815fccc-48d2-41f2-966a-8e67f8ee9fd6"},{"name":"Band Bicep Curl","sets":2,"reps_low":15,"reps_high":20,"notes":"","rest_sec":45,"exercise_id":"7033cf0a-6ce8-4008-a698-b6e10fc497f2"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL),
  (k_ah_r_legs_b, v_owner, 'Legs B',
   '[{"name":"Dumbbell Squat","sets":4,"reps_low":10,"reps_high":15,"notes":"","rest_sec":90,"exercise_id":"889e224a-c534-48b4-a5f8-55d8bada6af3"},{"name":"Single-Leg Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":75,"exercise_id":"38afdd22-387a-4b76-a895-e815ea24f28c"},{"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg. Hold dumbbells.","rest_sec":75,"exercise_id":"a7942454-736c-4d84-980d-39b40298a1b2"},{"name":"Single-Leg Hip Thrust","sets":3,"reps_low":10,"reps_high":15,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"db9208d9-0190-40dd-849b-38724ec9e09d"},{"name":"Lateral Lunge","sets":3,"reps_low":8,"reps_high":12,"notes":"Reps are per leg.","rest_sec":60,"exercise_id":"eee8a605-10d6-41ad-9b79-65d626b598db"},{"name":"Reverse Crunch","sets":3,"reps_low":10,"reps_high":15,"notes":"","rest_sec":45,"exercise_id":"a224a468-28c0-4ba2-b6f9-c8a3f45d2147"}]'::jsonb,
   NULL, 0, NULL, 0, NULL, 'muscle', NULL, '{}'::text[], true, 'private', NULL);

  CREATE TEMP TABLE _split_link_exp (
    id uuid, program_id uuid, routine_id uuid, session_key text,
    sort_order int, legacy_program_workout_id uuid) ON COMMIT DROP;

  INSERT INTO _split_link_exp VALUES
  (k_am_l_full_a, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_full_a, 'full_a', 5, NULL),
  (k_am_l_full_b, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_full_b, 'full_b', 6, NULL),
  (k_am_l_full_c, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_full_c, 'full_c', 7, NULL),
  (k_am_l_push_a, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_push_a, 'push_a', 8, NULL),
  (k_am_l_pull_a, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_pull_a, 'pull_a', 9, NULL),
  (k_am_l_legs_a, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_legs_a, 'legs_a', 10, NULL),
  (k_am_l_push_b, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_push_b, 'push_b', 11, NULL),
  (k_am_l_pull_b, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_pull_b, 'pull_b', 12, NULL),
  (k_am_l_legs_b, '13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, k_am_r_legs_b, 'legs_b', 13, NULL),
  (k_ah_l_full_a, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_full_a, 'full_a', 5, NULL),
  (k_ah_l_full_b, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_full_b, 'full_b', 6, NULL),
  (k_ah_l_full_c, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_full_c, 'full_c', 7, NULL),
  (k_ah_l_push_a, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_push_a, 'push_a', 8, NULL),
  (k_ah_l_pull_a, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_pull_a, 'pull_a', 9, NULL),
  (k_ah_l_legs_a, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_legs_a, 'legs_a', 10, NULL),
  (k_ah_l_push_b, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_push_b, 'push_b', 11, NULL),
  (k_ah_l_pull_b, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_pull_b, 'pull_b', 12, NULL),
  (k_ah_l_legs_b, '2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, k_ah_r_legs_b, 'legs_b', 13, NULL);

  -- 115 prescription entries, each the canonical 7-key shape, sane numbers,
  -- never a fixed-rep target.
  SELECT count(*) INTO v_n FROM _split_routine_exp r, jsonb_array_elements(r.exercises) x;
  IF v_n <> 115 THEN
    RAISE EXCEPTION 'ABORT: expected 115 prescription entries, found %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM _split_routine_exp r, jsonb_array_elements(r.exercises) x
              WHERE NOT (x ?& array['name','sets','reps_low','reps_high',
                                    'notes','rest_sec','exercise_id'])
                 OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 7
                 OR (x->>'sets')::int < 1
                 OR (x->>'reps_low')::int >= (x->>'reps_high')::int
                 OR (x->>'rest_sec')::int < 1) THEN
    RAISE EXCEPTION 'ABORT: a prescription entry is malformed or has a fixed target';
  END IF;

  -- 74 distinct exercises, every one active and named exactly as in the catalog.
  SELECT count(*) INTO v_n FROM (
    SELECT DISTINCT (x->>'exercise_id')::uuid AS id, x->>'name' AS name
      FROM _split_routine_exp r, jsonb_array_elements(r.exercises) x) q
    JOIN public.exercises e ON e.id = q.id AND e.name = q.name AND e.is_active;
  IF v_n <> 74 THEN
    RAISE EXCEPTION 'ABORT: only % of 74 prescribed exercises are active and correctly named', v_n;
  END IF;

  -- Equipment promise per Program.
  IF EXISTS (
    SELECT 1
      FROM _split_link_exp l
      JOIN _split_routine_exp r ON r.id = l.routine_id
      JOIN LATERAL jsonb_array_elements(r.exercises) x ON true
      JOIN public.exercises e ON e.id = (x->>'exercise_id')::uuid
      JOIN (VALUES
        ('13c8ee8a-dc10-5858-afa5-cf2402300268'::uuid, ARRAY['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Smith', 'Bodyweight', 'Band', 'Kettlebell']),
        ('2ab5945b-5436-5024-ad96-8bed32c2c572'::uuid, ARRAY['Dumbbell', 'Band', 'Bodyweight'])
      ) AS allowed(program_id, eq) ON allowed.program_id = l.program_id
     WHERE NOT (e.equipment = ANY (allowed.eq))) THEN
    RAISE EXCEPTION 'ABORT: a prescribed exercise needs equipment the Program does not promise';
  END IF;

  -- Exhaustive state machine: all new rows absent (fresh) or all present (replay).
  SELECT count(*) INTO v_ids FROM (
    SELECT id FROM public.workout_templates WHERE id IN (k_am_r_full_a,k_am_r_full_b,k_am_r_full_c,k_am_r_push_a,k_am_r_pull_a,k_am_r_legs_a,k_am_r_push_b,k_am_r_pull_b,k_am_r_legs_b,k_ah_r_full_a,k_ah_r_full_b,k_ah_r_full_c,k_ah_r_push_a,k_ah_r_pull_a,k_ah_r_legs_a,k_ah_r_push_b,k_ah_r_pull_b,k_ah_r_legs_b)
    UNION ALL SELECT id FROM public.program_routines WHERE id IN (k_am_l_full_a,k_am_l_full_b,k_am_l_full_c,k_am_l_push_a,k_am_l_pull_a,k_am_l_legs_a,k_am_l_push_b,k_am_l_pull_b,k_am_l_legs_b,k_ah_l_full_a,k_ah_l_full_b,k_ah_l_full_c,k_ah_l_push_a,k_ah_l_pull_a,k_ah_l_legs_a,k_ah_l_push_b,k_ah_l_pull_b,k_ah_l_legs_b)
    UNION ALL SELECT id FROM public.program_routines
     WHERE program_id IN (k_am, k_ah) AND sort_order > 4) q;
  IF v_ids = 0 THEN
    v_state := 'fresh';
  ELSIF v_ids = 54 THEN
    v_state := 'replay';
  ELSE
    RAISE EXCEPTION 'ABORT: partial or conflicting state (hits=%)', v_ids;
  END IF;

  IF v_state = 'fresh' THEN
    INSERT INTO public.workout_templates
      (id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
       sort_order,description,goal,difficulty,tags,is_platform,visibility,
       source_workout_id)
    SELECT * FROM _split_routine_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 18 THEN RAISE EXCEPTION 'ABORT: inserted % Routines, expected 18', v_n; END IF;

    INSERT INTO public.program_routines
      (id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id)
    SELECT * FROM _split_link_exp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 18 THEN RAISE EXCEPTION 'ABORT: inserted % links, expected 18', v_n; END IF;
  END IF;

  -- Verification, identical for both paths: stored rows equal the expected rows.
  SELECT count(*) INTO v_diff FROM (
    (SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_am_r_full_a,k_am_r_full_b,k_am_r_full_c,k_am_r_push_a,k_am_r_pull_a,k_am_r_legs_a,k_am_r_push_b,k_am_r_pull_b,k_am_r_legs_b,k_ah_r_full_a,k_ah_r_full_b,k_ah_r_full_c,k_ah_r_push_a,k_ah_r_pull_a,k_ah_r_legs_a,k_ah_r_push_b,k_ah_r_pull_b,k_ah_r_legs_b)
     EXCEPT SELECT * FROM _split_routine_exp)
    UNION ALL
    (SELECT * FROM _split_routine_exp
     EXCEPT SELECT id,user_id,name,exercises,source_program_slug,times_used,last_used_at,
            sort_order,description,goal,difficulty,tags,is_platform,visibility,
            source_workout_id
       FROM public.workout_templates WHERE id IN (k_am_r_full_a,k_am_r_full_b,k_am_r_full_c,k_am_r_push_a,k_am_r_pull_a,k_am_r_legs_a,k_am_r_push_b,k_am_r_pull_b,k_am_r_legs_b,k_ah_r_full_a,k_ah_r_full_b,k_ah_r_full_c,k_ah_r_push_a,k_ah_r_pull_a,k_ah_r_legs_a,k_ah_r_push_b,k_ah_r_pull_b,k_ah_r_legs_b))) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: stored Routines differ from the approved content'; END IF;

  SELECT count(*) INTO v_diff FROM (
    (SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id IN (k_am, k_ah) AND sort_order > 4
     EXCEPT SELECT * FROM _split_link_exp)
    UNION ALL
    (SELECT * FROM _split_link_exp
     EXCEPT SELECT id,program_id,routine_id,session_key,sort_order,legacy_program_workout_id
       FROM public.program_routines WHERE program_id IN (k_am, k_ah) AND sort_order > 4)) d;
  IF v_diff <> 0 THEN RAISE EXCEPTION 'ABORT: stored links differ from the approved content'; END IF;

  IF (SELECT count(*) FROM public.program_routines WHERE program_id IN (k_am, k_ah)) <> 26 THEN
    RAISE EXCEPTION 'ABORT: expected 13 links per Program';
  END IF;

  RAISE NOTICE 'phase_439l_advanced_day_splits: state=%', v_state;
END $$;
