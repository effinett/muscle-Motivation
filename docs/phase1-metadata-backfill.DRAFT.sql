-- ============================================================================
-- Exercise Intelligence — Phase 1: Metadata Backfill (DRAFT — REVIEW BEFORE APPLY)
-- ----------------------------------------------------------------------------
-- DATA-ONLY. No schema changes. No INSERT. No DELETE. No name/id changes.
-- Touches the existing 57 exercises only, keyed by id (idempotent / re-runnable).
-- Does NOT touch: secondary_muscles, primary_muscle, category, equipment, name, id.
-- Does NOT touch: workout history, templates, programs, progression, frontend.
--
-- Controlled vocabularies (docs/exercise-intelligence-architecture.md §3):
--   movement_pattern: squat | hinge | lunge | horizontal_push | vertical_push
--                     | horizontal_pull | vertical_pull | carry | rotation
--                     | isolation | core | gait
--   force_type:       push | pull | static
--   difficulty:       beginner | intermediate | advanced
--   tracking_type:    weight_reps | bodyweight_reps | weighted_bodyweight
--                     | time | distance | time_distance
--   default_unit:     lb | kg | sec | m | mi
--
-- Note on "reps_only": the requirement's "reps_only" intent maps to the
-- controlled-vocab term `bodyweight_reps` (bodyweight movement, tracked by reps).
-- Note on Farmer Carry: loaded + distance; the tracking_type enum has no combined
-- weight+distance type, so primary metric is `distance` (load still logged per set).
-- ============================================================================

-- ── Biceps ──────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['bb curl','barbell bicep curl'],
  instructions='Hold a barbell with an underhand grip, elbows tucked, and curl the bar to shoulder height without swinging.',
  tips='Keep your elbows pinned to your sides — let the biceps do the work, not momentum.',
  updated_at=now() WHERE id='159d6166-afbb-4932-b60b-a28b80b492ee'; -- Barbell Curl

UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['dumbbell curl','db curl'],
  instructions='Curl a dumbbell in each hand from your sides up to shoulder height, keeping your upper arms still.',
  tips='Lower under control — the slow part builds the most muscle.',
  updated_at=now() WHERE id='a3882f86-1868-4143-8a8b-494880366993'; -- Bicep Curl

UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['cable bicep curl'],
  instructions='Stand facing a low cable, curl the handle toward your shoulders, then lower slowly.',
  tips='Constant cable tension means no rest at the bottom — own every rep.',
  updated_at=now() WHERE id='eda3ba6a-ae43-426e-b81f-dbf5cbe3bbe9'; -- Cable Curl

UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['db hammer curl','neutral grip curl'],
  instructions='Curl dumbbells with a neutral (palms-facing) grip, keeping your wrists straight.',
  tips='Great for thicker arms — it targets the brachialis under the biceps.',
  updated_at=now() WHERE id='f19396bd-a73c-442e-a705-9439c6d5b575'; -- Hammer Curl

-- ── Calves ──────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY[]::text[],
  instructions='Sit with the pad over your knees and the balls of your feet on the platform, then raise and lower your heels through a full range.',
  tips='Pause at the top and stretch at the bottom — calves respond to full range, not bouncing.',
  updated_at=now() WHERE id='c48b4a24-86b3-4f7e-9ef8-922642209b91'; -- Seated Calf Raise

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['calf raise'],
  instructions='Stand with the balls of your feet on the platform and press up onto your toes, then lower your heels below the step.',
  tips='Slow and full — a big stretch at the bottom beats a fast quarter rep.',
  updated_at=now() WHERE id='0c1546bd-bd09-44e5-a2e1-70f1939d2486'; -- Standing Calf Raise

-- ── Cardio ──────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='gait', force_type='push', difficulty='beginner',
  tracking_type='time', default_unit='sec', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['incline walk','treadmill walk'],
  instructions='Set the treadmill to a brisk incline and hold a steady walking pace for the target duration.',
  tips='Skip the handrails — let your legs do the work for the full benefit.',
  updated_at=now() WHERE id='41836fa8-d808-4ca1-893b-39e01c95766b'; -- Incline Treadmill Walk

UPDATE exercises SET movement_pattern='gait', force_type='push', difficulty='beginner',
  tracking_type='time_distance', default_unit='mi', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['running','treadmill running','jog'],
  instructions='Run at a steady pace on the treadmill for your target time or distance.',
  tips='Pick a pace you can hold and finish strong — consistency beats sprint-and-stop.',
  updated_at=now() WHERE id='5ad5a346-c7fc-4ea3-b078-f0daddf9b899'; -- Treadmill Run

-- ── Carry ───────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='carry', force_type='static', difficulty='beginner',
  tracking_type='distance', default_unit='m', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['farmers carry','farmers walk','farmer''s walk'],
  instructions='Hold a heavy dumbbell in each hand and walk for the target distance with tall posture.',
  tips='Brace your core and keep your shoulders back — walk tall, don''t shuffle.',
  updated_at=now() WHERE id='ced48a22-86f4-445c-a0c7-1e490791dbb4'; -- Farmer Carry

-- ── Core ────────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='core', force_type='pull', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['crunch','ab crunch'],
  instructions='Lie on your back with knees bent and curl your shoulders off the floor toward your knees.',
  tips='Shorten the distance between ribs and hips — don''t yank on your neck.',
  updated_at=now() WHERE id='0d28f8c9-7485-4b0a-9552-b56cf3c556bf'; -- Crunches

UPDATE exercises SET movement_pattern='core', force_type='static', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['deadbug'],
  instructions='Lie on your back, arms up and knees bent at 90 degrees, then lower opposite arm and leg without arching your back.',
  tips='Press your lower back into the floor the whole time — that''s the point of the drill.',
  updated_at=now() WHERE id='9c8998ab-9713-43f4-940b-5f8feec39d3c'; -- Dead Bug

UPDATE exercises SET movement_pattern='core', force_type='pull', difficulty='intermediate',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['hanging leg raise','knee raise'],
  instructions='Hang from a bar and raise your knees toward your chest, then lower under control.',
  tips='Curl your pelvis up rather than just swinging your legs — kill the momentum.',
  updated_at=now() WHERE id='5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5'; -- Hanging Knee Raise

UPDATE exercises SET movement_pattern='core', force_type='pull', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['leg raise','floor leg raise'],
  instructions='Lie flat and raise your straight legs to vertical, then lower them slowly without touching the floor.',
  tips='Keep your lower back glued to the floor — stop before it arches.',
  updated_at=now() WHERE id='0b519d3f-6a32-4883-955c-ad9c87f7385f'; -- Lying Leg Raise

UPDATE exercises SET movement_pattern='core', force_type='static', difficulty='beginner',
  tracking_type='time', default_unit='sec', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['front plank','forearm plank'],
  instructions='Hold a straight line from head to heels on your forearms and toes for the target time.',
  tips='Squeeze your glutes and brace your abs — quality time beats a saggy long hold.',
  updated_at=now() WHERE id='c320bf46-9f16-4483-bd2f-9ae9e88b7ad5'; -- Plank

UPDATE exercises SET movement_pattern='rotation', force_type='static', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['seated twist'],
  instructions='Sit leaning back with feet up and rotate your torso to tap the floor on each side.',
  tips='Turn from your ribcage, not just your arms — control the twist both directions.',
  updated_at=now() WHERE id='e4015387-bed0-43e2-9129-4ca3c2b67414'; -- Russian Twist

-- ── Hinge ───────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=true,
  aliases=ARRAY['glute kickback','cable glute kickback'],
  instructions='Attach a cuff to your ankle and kick the working leg straight back, squeezing the glute.',
  tips='Keep your torso still — move from the hip, not your lower back.',
  updated_at=now() WHERE id='75bcf925-81b7-44d7-9582-6376303bf7da'; -- Cable Kickback

UPDATE exercises SET movement_pattern='hinge', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['pull through','rope pull through'],
  instructions='Face away from a low cable, hinge at the hips to let the rope travel back, then drive your hips forward to stand tall.',
  tips='This is a hip hinge, not a squat — push your hips back and feel the hamstrings load.',
  updated_at=now() WHERE id='af49030e-c7d6-4854-b14a-32e2e1d9a8b3'; -- Cable Pull-Through

UPDATE exercises SET movement_pattern='hinge', force_type='pull', difficulty='advanced',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['deadlift','dl'],
  instructions='With the bar over mid-foot, hinge down, grip just outside your knees, and stand up by driving the floor away.',
  tips='Keep the bar close and your back flat — set your lats before you pull.',
  updated_at=now() WHERE id='77b17ae7-5a90-46fb-87bc-f8e989909280'; -- Conventional Deadlift

UPDATE exercises SET movement_pattern='hinge', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['barbell hip thrust'],
  instructions='With your upper back on a bench and a barbell over your hips, drive through your heels to full hip extension.',
  tips='Finish each rep with a hard glute squeeze and ribs down — don''t hyperextend your back.',
  updated_at=now() WHERE id='cfdf913e-7079-4756-a830-71d26540ddd8'; -- Hip Thrust

UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['hamstring curl','lying leg curl','seated leg curl'],
  instructions='Curl the pad toward your glutes by bending your knees, then lower slowly.',
  tips='Control the negative — don''t let the weight slam back down.',
  updated_at=now() WHERE id='857f62b9-f5e4-4317-a31e-96746815f81b'; -- Leg Curl

UPDATE exercises SET movement_pattern='hinge', force_type='pull', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['rdl','romanian dl'],
  instructions='Hold the bar at your hips, soften your knees, and push your hips back to lower the bar along your legs until you feel a hamstring stretch.',
  tips='Keep the bar dragging down your thighs and stop when your back wants to round.',
  updated_at=now() WHERE id='425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d'; -- Romanian Deadlift

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['hip abduction machine','abductor machine'],
  instructions='Sit in the machine and push your knees apart against the pads, then return slowly.',
  tips='Lean slightly forward to bias the glutes, and don''t let the pads snap back.',
  updated_at=now() WHERE id='11c63aee-e1dd-409a-9d4d-836ed3f22ee4'; -- Seated Hip Abduction

UPDATE exercises SET movement_pattern='hinge', force_type='push', difficulty='intermediate',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=true,
  aliases=ARRAY['single leg hip thrust','one leg hip thrust'],
  instructions='With your upper back on a bench, drive through one heel to lift your hips while the other leg stays raised.',
  tips='Keep your hips level — don''t let the non-working side dip.',
  updated_at=now() WHERE id='db9208d9-0190-40dd-849b-38724ec9e09d'; -- Single-Leg Hip Thrust

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=true,
  aliases=ARRAY['band hip abduction','standing abduction'],
  instructions='With a band around your ankles, lift one leg out to the side against the band, then return under control.',
  tips='Stand tall and move only at the hip — no leaning to cheat the rep.',
  updated_at=now() WHERE id='00ac1d4d-cb22-46ab-89ac-0fb1618110cc'; -- Standing Hip Abduction

UPDATE exercises SET movement_pattern='hinge', force_type='pull', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['hex bar deadlift','trap bar dl'],
  instructions='Stand inside the trap bar, hinge to grip the handles, and stand up tall by driving through your whole foot.',
  tips='A beginner-friendly deadlift — the neutral handles keep you upright and safer.',
  updated_at=now() WHERE id='939dc433-4dc7-45ce-bc2a-e1dd5f10405a'; -- Trap Bar Deadlift

-- ── Horizontal Pull ─────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='horizontal_pull', force_type='pull', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['bent over row','bb row','barbell bent over row'],
  instructions='Hinge forward with a flat back and row the barbell to your lower ribs, then lower under control.',
  tips='Pull with your elbows and squeeze your shoulder blades — don''t heave with your back.',
  updated_at=now() WHERE id='8be8652d-266e-46a1-99ea-2105695ed84d'; -- Barbell Row

UPDATE exercises SET movement_pattern='horizontal_pull', force_type='pull', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=true,
  aliases=ARRAY['db row','one arm row','single arm dumbbell row','bent over dumbbell row'],
  instructions='With one hand and knee on a bench, row the dumbbell to your hip, then lower it fully.',
  tips='Keep your back flat and pull your elbow past your torso for a full squeeze.',
  updated_at=now() WHERE id='c06a8a91-151b-428d-9144-9e9730ca4652'; -- Dumbbell Row

UPDATE exercises SET movement_pattern='horizontal_pull', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['cable face pull','rope face pull'],
  instructions='Set a rope at face height and pull it toward your forehead, splitting your hands apart at the end.',
  tips='Great for healthy shoulders — aim the elbows high and squeeze the rear delts.',
  updated_at=now() WHERE id='8e94d39c-9a50-4a2e-b4ba-7b08cc6f65e4'; -- Face Pull

UPDATE exercises SET movement_pattern='horizontal_pull', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['seated machine row'],
  instructions='Sit at the machine, brace your chest against the pad, and row the handles back.',
  tips='Lead with your elbows and pause when the handles reach your torso.',
  updated_at=now() WHERE id='b966a5d5-ba1c-4dfe-a5f1-5f95a99b44e9'; -- Machine Row

UPDATE exercises SET movement_pattern='horizontal_pull', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['cable row','seated row'],
  instructions='Sit tall, pull the handle to your stomach while keeping your torso upright, then return under control.',
  tips='Squeeze your shoulder blades together — don''t rock back and forth for momentum.',
  updated_at=now() WHERE id='a1af028a-ea95-413c-af2a-3ab24b836177'; -- Seated Cable Row

-- ── Horizontal Push ─────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='horizontal_push', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['barbell bench press','flat bench press','bb bench'],
  instructions='Lie on the bench, lower the bar to mid-chest with control, then press it back up to lockout.',
  tips='Keep your shoulder blades pinched and feet planted — press in a slight arc back over your shoulders.',
  updated_at=now() WHERE id='b691b1f7-73a0-415a-854d-41941bdfb5de'; -- Bench Press

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['cable flye','cable crossover','pec fly'],
  instructions='With a cable in each hand, bring your arms together in front of your chest in a wide hugging motion.',
  tips='Keep a soft elbow bend the whole way and squeeze your chest at the middle.',
  updated_at=now() WHERE id='e21edf28-1d59-45e0-b717-c9622a9768c6'; -- Cable Fly

UPDATE exercises SET movement_pattern='horizontal_push', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['db bench press','flat db press','dumbbell bench press','db press'],
  instructions='Lie on a bench and press two dumbbells from chest level to straight overhead, then lower with control.',
  tips='Dumbbells give a bigger stretch than a barbell — lower until you feel the chest load.',
  updated_at=now() WHERE id='1afc0077-569c-4120-aee3-18d821056a15'; -- Dumbbell Press

UPDATE exercises SET movement_pattern='horizontal_push', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['incline barbell bench press','incline bench'],
  instructions='On a bench set to a low incline, lower the bar to your upper chest and press it back up.',
  tips='Keep the incline around 30 degrees to hit the upper chest without overloading the shoulders.',
  updated_at=now() WHERE id='11a1f4e3-88d5-4660-817b-6e904b1a731c'; -- Incline Bench Press

UPDATE exercises SET movement_pattern='horizontal_push', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['incline db press','incline db bench'],
  instructions='On a low incline bench, press two dumbbells from your upper chest to overhead, then lower with control.',
  tips='Let the dumbbells drift slightly together at the top and get a full stretch at the bottom.',
  updated_at=now() WHERE id='d37f2707-82db-4e79-ae7f-e313bd805780'; -- Incline Dumbbell Press

UPDATE exercises SET movement_pattern='horizontal_push', force_type='push', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['pushup','press up'],
  instructions='In a straight-body plank position, lower your chest to the floor and press back up.',
  tips='Keep a tight line from head to heels — no sagging hips or flared elbows.',
  updated_at=now() WHERE id='dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac'; -- Push-Up

-- ── Plyometric ──────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='squat', force_type='push', difficulty='intermediate',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['box jumps'],
  instructions='From a quarter squat, jump onto a sturdy box and land softly with bent knees, then step back down.',
  tips='Step down, don''t jump down — and land quietly to protect your knees.',
  updated_at=now() WHERE id='0d298f82-6688-46ab-82e1-2ea3e914fc84'; -- Box Jump

-- ── Squat ───────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='squat', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['back squat','squat','bb squat'],
  instructions='With the bar on your upper back, squat down until your thighs are at least parallel, then drive back up.',
  tips='Brace hard, keep your chest up, and push your knees out over your toes.',
  updated_at=now() WHERE id='53cd6807-eb7e-4e5f-bccd-d9621176c35c'; -- Barbell Back Squat

UPDATE exercises SET movement_pattern='lunge', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=true,
  aliases=ARRAY['bss','rear foot elevated split squat','rfess'],
  instructions='With your back foot on a bench, lower into a split squat on the front leg, then drive back up.',
  tips='Keep most of your weight on the front heel — it''s humbling, so start light.',
  updated_at=now() WHERE id='19b2ab5c-b3ad-444c-8d44-a42b3700765a'; -- Bulgarian Split Squat

UPDATE exercises SET movement_pattern='lunge', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=true,
  aliases=ARRAY['db step up','step up'],
  instructions='Holding dumbbells, step onto a box with one foot and stand tall, then lower under control.',
  tips='Drive through the top foot — don''t push off the floor with your trailing leg.',
  updated_at=now() WHERE id='eb94f2b0-c6a9-443c-a597-e56006fa3127'; -- Dumbbell Step-Up

UPDATE exercises SET movement_pattern='squat', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['db goblet squat','kettlebell goblet squat'],
  instructions='Hold a dumbbell at your chest and squat down between your knees, keeping your torso upright.',
  tips='A great squat to learn the pattern — elbows track inside your knees at the bottom.',
  updated_at=now() WHERE id='72f1d568-5da2-4351-8bac-9656c99f3557'; -- Goblet Squat

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['knee extension','quad extension','leg ext'],
  instructions='Sit in the machine and extend your knees to straighten your legs, then lower slowly.',
  tips='Pause briefly at the top squeeze and control the way down.',
  updated_at=now() WHERE id='e3b57420-d4b6-4f4a-9045-4ad9419ee788'; -- Leg Extension

UPDATE exercises SET movement_pattern='squat', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['machine leg press'],
  instructions='Press the platform away until your legs are nearly straight, then lower under control to a deep knee bend.',
  tips='Don''t lock your knees hard at the top, and keep your lower back on the pad.',
  updated_at=now() WHERE id='aaa33fcc-dd0b-46e2-9099-8ca74f5ec253'; -- Leg Press

UPDATE exercises SET movement_pattern='lunge', force_type='push', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=true,
  aliases=ARRAY['reverse lunges','bodyweight reverse lunge'],
  instructions='Step one foot back and lower until both knees are bent about 90 degrees, then push back to standing.',
  tips='Easier on the knees than forward lunges — keep your torso tall and weight on the front heel.',
  updated_at=now() WHERE id='d2812c92-d4c6-420c-b2d9-d2c5757871c9'; -- Reverse Lunge

UPDATE exercises SET movement_pattern='lunge', force_type='push', difficulty='beginner',
  tracking_type='bodyweight_reps', default_unit='lb', is_bodyweight=true, is_unilateral=true,
  aliases=ARRAY['static lunge','bodyweight split squat'],
  instructions='In a staggered stance, lower straight down until your back knee nearly touches the floor, then drive up.',
  tips='Keep your front shin fairly vertical and your weight on the front foot.',
  updated_at=now() WHERE id='a7942454-736c-4d84-980d-39b40298a1b2'; -- Split Squat

-- ── Triceps ─────────────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='vertical_push', force_type='push', difficulty='intermediate',
  tracking_type='weighted_bodyweight', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['tricep dips','chest dips','parallel bar dips'],
  instructions='Support yourself on parallel bars, lower until your elbows reach about 90 degrees, then press back up.',
  tips='Stay upright for triceps, lean forward for chest — add a belt for weight when ready.',
  updated_at=now() WHERE id='d609a511-99d8-46a2-8dad-674b03c7f1ec'; -- Dips

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['overhead extension','french press','db overhead extension'],
  instructions='Hold a dumbbell overhead with both hands and lower it behind your head, then extend back up.',
  tips='Keep your elbows pointed forward and close — only your forearms should move.',
  updated_at=now() WHERE id='1b4b6bf8-83df-4c8e-836a-48f1fea82d8d'; -- Overhead Tricep Extension

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['lying tricep extension','skullcrusher','ez bar skull crusher'],
  instructions='Lying down, lower a barbell toward your forehead by bending only at the elbows, then extend back up.',
  tips='Keep your upper arms still and pointed up — lower behind the head to spare your elbows.',
  updated_at=now() WHERE id='2d8cc32e-b73f-40ac-b45f-c4a84642866a'; -- Skull Crusher

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['tricep pressdown','cable pushdown','rope pushdown'],
  instructions='At a high cable, push the bar or rope down until your arms are fully straight, then return slowly.',
  tips='Pin your elbows to your sides — if they flare, the weight''s too heavy.',
  updated_at=now() WHERE id='2f5892bb-8050-46de-9978-da3153527c2c'; -- Tricep Pushdown

-- ── Vertical Pull ───────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='vertical_pull', force_type='pull', difficulty='intermediate',
  tracking_type='weighted_bodyweight', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['chinup','chin up'],
  instructions='Hang from a bar with an underhand grip and pull your chin over the bar, then lower fully.',
  tips='Underhand grip brings in more biceps — pull your elbows down and through.',
  updated_at=now() WHERE id='9daedcaa-e007-488f-8a4d-17957361b10e'; -- Chin-Up

UPDATE exercises SET movement_pattern='vertical_pull', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['pulldown','lat pull down'],
  instructions='Grip the bar wide, pull it to your upper chest while leaning back slightly, then return under control.',
  tips='Drive your elbows down to your sides — don''t lean back and yank.',
  updated_at=now() WHERE id='91b39e1b-1fb1-4e0f-9742-e851c61a201d'; -- Lat Pulldown

UPDATE exercises SET movement_pattern='vertical_pull', force_type='pull', difficulty='advanced',
  tracking_type='weighted_bodyweight', default_unit='lb', is_bodyweight=true, is_unilateral=false,
  aliases=ARRAY['pullup','pull up'],
  instructions='Hang from a bar with an overhand grip and pull your chin over the bar, then lower with control.',
  tips='Start from a dead hang and lead with your chest — use a band for assistance if needed.',
  updated_at=now() WHERE id='39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481'; -- Pull-Up

UPDATE exercises SET movement_pattern='isolation', force_type='pull', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['straight arm pulldown','stiff arm pulldown'],
  instructions='With straight arms, pull a high cable bar down to your thighs in an arc, then return slowly.',
  tips='Keep a slight elbow bend locked and feel your lats do the pulling.',
  updated_at=now() WHERE id='5507d975-d03b-48ac-b461-821cd91d8663'; -- Straight-Arm Pulldown

-- ── Vertical Push ───────────────────────────────────────────────────────────
UPDATE exercises SET movement_pattern='vertical_push', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['db shoulder press','seated dumbbell press','db ohp'],
  instructions='Press two dumbbells from shoulder height to straight overhead, then lower with control.',
  tips='Keep your ribs down and core braced — don''t arch your lower back to push the weight.',
  updated_at=now() WHERE id='3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac'; -- Dumbbell Shoulder Press

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['db front raise'],
  instructions='With a dumbbell in each hand, raise your arms straight in front to shoulder height, then lower slowly.',
  tips='Lift to about eye level and avoid swinging — let the front delts do the work.',
  updated_at=now() WHERE id='d230aa81-cd32-42f5-9505-34855af61f04'; -- Front Raise

UPDATE exercises SET movement_pattern='isolation', force_type='push', difficulty='beginner',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['side lateral raise','db lateral raise','side raise','lat raise'],
  instructions='Raise dumbbells out to your sides up to shoulder height with a slight elbow bend, then lower slowly.',
  tips='Lead with your elbows, not your hands, and go light — this is all about control.',
  updated_at=now() WHERE id='d327531a-34fa-4ffa-a019-5bd03db30c57'; -- Lateral Raise

UPDATE exercises SET movement_pattern='vertical_push', force_type='push', difficulty='intermediate',
  tracking_type='weight_reps', default_unit='lb', is_bodyweight=false, is_unilateral=false,
  aliases=ARRAY['ohp','barbell shoulder press','military press','standing press'],
  instructions='From shoulder height, press the barbell overhead to lockout, moving your head back then through at the top.',
  tips='Squeeze your glutes and brace your abs to keep your lower back from arching.',
  updated_at=now() WHERE id='0b12ed6d-3123-4001-ae94-c62a10b95a7e'; -- Overhead Press

-- ============================================================================
-- POST-CHECK (read-only — run after the 57 UPDATEs):
--   SELECT count(*) AS row_count,
--          md5(string_agg(id::text, ',' ORDER BY id)) AS id_set_checksum,
--          count(*) FILTER (WHERE movement_pattern IS NULL) AS null_movement,
--          count(*) FILTER (WHERE force_type IS NULL)       AS null_force,
--          count(*) FILTER (WHERE difficulty IS NULL)       AS null_difficulty,
--          count(*) FILTER (WHERE instructions IS NULL)     AS null_instructions,
--          count(*) FILTER (WHERE tips IS NULL)             AS null_tips
--   FROM exercises;
-- EXPECT: row_count=57, id_set_checksum=53db1ebbc332b2ccee9ee0ebb726166a, all null_* = 0.
-- ============================================================================
