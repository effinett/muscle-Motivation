/* Muscle Gain — workout-length pilot fixtures (Phase 4.3.9G).
 *
 * SESSIONS: a read-only snapshot of the live `muscle_gain` Routines taken
 * 2026-11-26 (program_routines → workout_templates.exercises), notes dropped.
 * `tracking: 'time'` marks the timed holds/carries (reps_low/high = seconds).
 * push_a/push_b, pull_a/pull_b and legs_a/legs_b are byte-identical to
 * push, pull and legs live, so they alias those sessions here.
 *
 * PLANS: per-session priorities, owner-approved 2026-11-26. Each lists the
 * essential lifts (never cut, kept at full rest), the ordered trim list for
 * shorter sessions and the ordered add list for longer ones. Added lifting
 * comes from exercises already in the Program; Push and Pull end their add
 * lists with an optional easy Incline Treadmill Walk (owner decision 1).
 * Dead Bug is cut last on Full Body B, Lower A and Legs A so every 45-minute
 * week keeps one core exercise (owner decision 2).
 *
 * push_b / pull_b / legs_b: distinct B sessions PROPOSED 2026-11-26 (owner
 * decision 3). Live push_b/pull_b/legs_b are still copies of A until their
 * content is applied. */

const ID = {
  bench: 'b691b1f7-73a0-415a-854d-41941bdfb5de', row: '8be8652d-266e-46a1-99ea-2105695ed84d',
  dbPress: '3180d0e0-3cd1-4bed-b699-cf8cb9a4a2ac', pulldown: '91b39e1b-1fb1-4e0f-9742-e851c61a201d',
  facePull: '8e94d39c-9a50-4a2e-b4ba-7b08cc6f65e4', curl: 'a3882f86-1868-4143-8a8b-494880366993',
  pushdown: '2f5892bb-8050-46de-9978-da3153527c2c', plank: 'c320bf46-9f16-4483-bd2f-9ae9e88b7ad5',
  inclineDb: 'd37f2707-82db-4e79-ae7f-e313bd805780', cableRow: 'a1af028a-ea95-413c-af2a-3ab24b836177',
  lateral: 'd327531a-34fa-4ffa-a019-5bd03db30c57', hammer: 'f19396bd-a73c-442e-a705-9439c6d5b575',
  ohTri: '1b4b6bf8-83df-4c8e-836a-48f1fea82d8d', squat: '53cd6807-eb7e-4e5f-bccd-d9621176c35c',
  rdl: '425ff2e8-ba5a-4f0c-85b1-6fc86fb3ef9d', revLunge: 'd2812c92-d4c6-420c-b2d9-d2c5757871c9',
  legCurl: '857f62b9-f5e4-4317-a31e-96746815f81b', legExt: 'e3b57420-d4b6-4f4a-9045-4ad9419ee788',
  calf: '0c1546bd-bd09-44e5-a2e1-70f1939d2486', deadBug: '9c8998ab-9713-43f4-940b-5f8feec39d3c',
  legPress: 'aaa33fcc-dd0b-46e2-9099-8ca74f5ec253', bss: '19b2ab5c-b3ad-444c-8d44-a42b3700765a',
  hipThrust: 'cfdf913e-7079-4756-a830-71d26540ddd8', seatedCalf: 'c48b4a24-86b3-4f7e-9ef8-922642209b91',
  hkr: '5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5', ohp: '0b12ed6d-3123-4001-ae94-c62a10b95a7e',
  fly: 'e21edf28-1d59-45e0-b717-c9622a9768c6', straightArm: '5507d975-d03b-48ac-b461-821cd91d8663',
  bbCurl: '159d6166-afbb-4932-b60b-a28b80b492ee', farmer: 'ced48a22-86f4-445c-a0c7-1e490791dbb4',
  walk: '41836fa8-d808-4ca1-893b-39e01c95766b', inclineBench: '11a1f4e3-88d5-4660-817b-6e904b1a731c',
  machinePress: '6537df39-e313-4679-93b1-946f906667d5', pecDeck: '2fc0c511-e456-4275-8cf8-15ebda4a7028',
  cableLateral: '0a93b1f0-8548-4290-bf58-0fdb6a6db3bd', rope: '0f482fbe-5898-4d19-b66c-619a49e7983a',
  ohCableTri: '05443545-34bc-47f9-8563-3ac660d7bcc7', cableCrunch: '5e02a1cf-e84c-47ae-943d-e01a5ffc7575',
  closeGrip: '2205e63b-3486-4d1b-bc9d-189ee9d4b3bd', ngPulldown: 'a1d03bc5-97cc-40df-9412-bceeab10f668',
  csRow: '89ccfccf-3e25-4c79-9417-c4086d5f0921', saCableRow: 'ced6dc23-e063-4dad-a460-1e3f7b034613',
  revPec: 'e13b981a-d39c-498a-9db2-419c9f953126', incCurl: '820e77e6-ea59-4767-987f-618f6f7cfc01',
  cableCurl: 'eda3ba6a-ae43-426e-b81f-dbf5cbe3bbe9', hlr: 'd06aa93c-276f-4b9e-ad8f-3477c96f4f4e',
  dbRow: 'c06a8a91-151b-428d-9144-9e9730ca4652', hack: '69ca08c3-143c-49f3-b2c9-925d6d294c09',
  seatedCurl: '2b30eeef-8550-44ea-8190-67bdeab5c724', walkLunge: 'ebfb4a3a-28b9-4093-bcb2-d14b1d61aa88',
};

// Optional easy cardio that ends the Push and Pull add lists: one 10–15 min
// block (seconds), no rest after it.
const WALK = () => Object.assign({ name: 'Incline Treadmill Walk', exercise_id: ID.walk, sets: 1,
  reps_low: 600, reps_high: 900, rest_sec: 0, tracking: 'time',
  notes: 'Optional easy cardio: 10–15 min at a pace you can talk at.' });

const ex = (name, id, sets, lo, hi, rest, tracking) =>
  Object.assign({ name, exercise_id: id, sets, reps_low: lo, reps_high: hi, rest_sec: rest, notes: '' },
    tracking ? { tracking } : {});

const SESSIONS = {
  upper_a: [ex('Bench Press', ID.bench, 4, 6, 10, 150), ex('Barbell Row', ID.row, 4, 6, 10, 150),
    ex('Dumbbell Shoulder Press', ID.dbPress, 3, 8, 12, 90), ex('Lat Pulldown', ID.pulldown, 3, 8, 12, 90),
    ex('Face Pull', ID.facePull, 3, 12, 20, 60), ex('Bicep Curl', ID.curl, 3, 10, 15, 60),
    ex('Tricep Pushdown', ID.pushdown, 3, 10, 15, 60), ex('Plank', ID.plank, 3, 30, 60, 60, 'time')],
  upper_b: [ex('Incline Dumbbell Press', ID.inclineDb, 4, 6, 10, 150), ex('Seated Cable Row', ID.cableRow, 4, 8, 12, 90),
    ex('Lat Pulldown', ID.pulldown, 3, 6, 10, 90), ex('Lateral Raise', ID.lateral, 3, 12, 20, 60),
    ex('Hammer Curl', ID.hammer, 3, 10, 15, 60), ex('Overhead Tricep Extension', ID.ohTri, 3, 10, 15, 60),
    ex('Plank', ID.plank, 3, 30, 60, 60, 'time')],
  lower_a: [ex('Barbell Back Squat', ID.squat, 4, 5, 10, 180), ex('Romanian Deadlift', ID.rdl, 4, 6, 10, 120),
    ex('Reverse Lunge', ID.revLunge, 3, 8, 12, 90), ex('Leg Curl', ID.legCurl, 3, 10, 15, 60),
    ex('Leg Extension', ID.legExt, 3, 12, 15, 60), ex('Standing Calf Raise', ID.calf, 4, 12, 20, 60),
    ex('Dead Bug', ID.deadBug, 3, 10, 15, 60)],
  lower_b: [ex('Leg Press', ID.legPress, 4, 6, 10, 120), ex('Romanian Deadlift', ID.rdl, 3, 8, 12, 90),
    ex('Bulgarian Split Squat', ID.bss, 3, 8, 10, 120), ex('Hip Thrust', ID.hipThrust, 3, 10, 15, 90),
    ex('Leg Curl', ID.legCurl, 3, 10, 15, 60), ex('Seated Calf Raise', ID.seatedCalf, 4, 12, 20, 60),
    ex('Hanging Knee Raise', ID.hkr, 3, 10, 15, 60)],
  push: [ex('Bench Press', ID.bench, 4, 5, 10, 180), ex('Overhead Press', ID.ohp, 3, 6, 10, 120),
    ex('Lateral Raise', ID.lateral, 3, 12, 20, 60), ex('Cable Fly', ID.fly, 3, 12, 15, 60),
    ex('Tricep Pushdown', ID.pushdown, 3, 10, 15, 60), ex('Overhead Tricep Extension', ID.ohTri, 2, 10, 15, 60),
    ex('Plank', ID.plank, 3, 30, 60, 60, 'time')],
  pull: [ex('Lat Pulldown', ID.pulldown, 4, 5, 10, 120), ex('Barbell Row', ID.row, 4, 6, 10, 120),
    ex('Face Pull', ID.facePull, 3, 15, 20, 60), ex('Straight-Arm Pulldown', ID.straightArm, 3, 12, 15, 60),
    ex('Barbell Curl', ID.bbCurl, 3, 8, 12, 60), ex('Hammer Curl', ID.hammer, 2, 10, 15, 60),
    ex('Hanging Knee Raise', ID.hkr, 3, 10, 15, 60)],
  legs: [ex('Barbell Back Squat', ID.squat, 4, 5, 10, 180), ex('Romanian Deadlift', ID.rdl, 3, 8, 12, 90),
    ex('Bulgarian Split Squat', ID.bss, 3, 8, 10, 120), ex('Leg Curl', ID.legCurl, 3, 10, 15, 60),
    ex('Leg Extension', ID.legExt, 3, 12, 15, 60), ex('Standing Calf Raise', ID.calf, 4, 12, 20, 60),
    ex('Dead Bug', ID.deadBug, 3, 10, 15, 60)],
  full_a: [ex('Barbell Back Squat', ID.squat, 4, 5, 10, 150), ex('Bench Press', ID.bench, 4, 5, 10, 150),
    ex('Barbell Row', ID.row, 4, 6, 10, 150), ex('Romanian Deadlift', ID.rdl, 3, 8, 12, 90),
    ex('Bicep Curl', ID.curl, 3, 10, 15, 60), ex('Tricep Pushdown', ID.pushdown, 3, 10, 15, 60),
    ex('Plank', ID.plank, 3, 30, 60, 60, 'time')],
  full_b: [ex('Bulgarian Split Squat', ID.bss, 3, 8, 10, 120), ex('Overhead Press', ID.ohp, 3, 6, 10, 120),
    ex('Lat Pulldown', ID.pulldown, 3, 6, 10, 90), ex('Romanian Deadlift', ID.rdl, 3, 8, 12, 90),
    ex('Lateral Raise', ID.lateral, 3, 12, 20, 60), ex('Dead Bug', ID.deadBug, 3, 10, 15, 60)],
  full_c: [ex('Leg Press', ID.legPress, 3, 8, 12, 120), ex('Incline Dumbbell Press', ID.inclineDb, 3, 8, 12, 90),
    ex('Seated Cable Row', ID.cableRow, 3, 8, 12, 90), ex('Face Pull', ID.facePull, 3, 15, 20, 60),
    ex('Leg Curl', ID.legCurl, 3, 10, 15, 60), ex('Farmer Carry', ID.farmer, 3, 30, 40, 60, 'time')],
};
['push', 'pull', 'legs'].forEach((k) => { SESSIONS[k + '_a'] = SESSIONS[k]; });

// Distinct B sessions (proposed content, owner decision 3).
SESSIONS.push_b = [ex('Incline Bench Press', ID.inclineBench, 4, 6, 10, 150), ex('Machine Shoulder Press', ID.machinePress, 3, 8, 12, 90),
  ex('Pec Deck', ID.pecDeck, 3, 10, 15, 60), ex('Cable Lateral Raise', ID.cableLateral, 3, 12, 20, 60),
  ex('Rope Pushdown', ID.rope, 3, 10, 15, 60), ex('Overhead Cable Triceps Extension', ID.ohCableTri, 2, 10, 15, 60),
  ex('Cable Crunch', ID.cableCrunch, 3, 10, 15, 60)];
SESSIONS.pull_b = [ex('Neutral-Grip Lat Pulldown', ID.ngPulldown, 4, 8, 12, 120), ex('Chest-Supported Row', ID.csRow, 4, 8, 12, 120),
  ex('Single-Arm Cable Row', ID.saCableRow, 3, 10, 12, 60), ex('Reverse Pec Deck', ID.revPec, 3, 12, 20, 60),
  ex('Incline Dumbbell Curl', ID.incCurl, 3, 10, 12, 60), ex('Cable Curl', ID.cableCurl, 2, 12, 15, 60),
  ex('Hanging Leg Raise', ID.hlr, 3, 8, 12, 60)];
SESSIONS.legs_b = [ex('Hack Squat', ID.hack, 4, 8, 12, 150), ex('Hip Thrust', ID.hipThrust, 4, 8, 12, 120),
  ex('Walking Lunge', ID.walkLunge, 3, 10, 12, 90), ex('Seated Leg Curl', ID.seatedCurl, 3, 10, 15, 60),
  ex('Leg Extension', ID.legExt, 3, 12, 15, 60), ex('Seated Calf Raise', ID.seatedCalf, 4, 12, 20, 60),
  ex('Hanging Knee Raise', ID.hkr, 3, 10, 15, 60)];

const cut = (ref) => ({ cut: ref });
const sets = (ref, to) => ({ sets: ref, to });
const add = (exercise) => ({ exercise });

const PLANS = {
  upper_a: {
    essential: [ID.bench, ID.row], minSets: { [ID.bench]: 3, [ID.row]: 3 },
    trim: [cut(ID.plank), cut(ID.facePull), sets(ID.curl, 2), sets(ID.pushdown, 2), sets(ID.dbPress, 2),
      sets(ID.pulldown, 2), cut(ID.curl), cut(ID.pushdown), sets(ID.bench, 3), sets(ID.row, 3), cut(ID.dbPress), cut(ID.pulldown)],
    add: [sets(ID.bench, 5), sets(ID.row, 5), add(ex('Incline Dumbbell Press', ID.inclineDb, 3, 8, 12, 90)),
      add(ex('Lateral Raise', ID.lateral, 3, 12, 20, 60)), add(ex('Hammer Curl', ID.hammer, 2, 10, 15, 60)),
      add(ex('Overhead Tricep Extension', ID.ohTri, 2, 10, 15, 60))],
  },
  upper_b: {
    essential: [ID.inclineDb, ID.cableRow], minSets: { [ID.inclineDb]: 3, [ID.cableRow]: 3 },
    trim: [cut(ID.plank), sets(ID.hammer, 2), sets(ID.ohTri, 2), sets(ID.lateral, 2), cut(ID.hammer), cut(ID.ohTri),
      sets(ID.pulldown, 2), sets(ID.inclineDb, 3), sets(ID.cableRow, 3), cut(ID.lateral), cut(ID.pulldown)],
    add: [sets(ID.inclineDb, 5), sets(ID.pulldown, 4), add(ex('Cable Fly', ID.fly, 3, 12, 15, 60)),
      add(ex('Face Pull', ID.facePull, 3, 15, 20, 60)), add(ex('Straight-Arm Pulldown', ID.straightArm, 2, 12, 15, 60)),
      sets(ID.lateral, 4)],
  },
  lower_a: {
    essential: [ID.squat, ID.rdl], minSets: { [ID.squat]: 3, [ID.rdl]: 3 },
    trim: [sets(ID.calf, 2), sets(ID.legExt, 2), sets(ID.legCurl, 2), cut(ID.legExt),
      sets(ID.revLunge, 2), sets(ID.rdl, 3), cut(ID.calf), sets(ID.deadBug, 2), sets(ID.squat, 3), cut(ID.revLunge),
      cut(ID.legCurl), cut(ID.deadBug)],
    add: [sets(ID.squat, 5), add(ex('Hip Thrust', ID.hipThrust, 3, 10, 15, 90)), sets(ID.legCurl, 4),
      add(ex('Seated Calf Raise', ID.seatedCalf, 3, 12, 20, 60)), add(ex('Hanging Knee Raise', ID.hkr, 3, 10, 15, 60))],
  },
  lower_b: {
    essential: [ID.legPress, ID.rdl], minSets: { [ID.legPress]: 3, [ID.rdl]: 3 },
    trim: [cut(ID.hkr), sets(ID.seatedCalf, 2), sets(ID.legCurl, 2), sets(ID.hipThrust, 2), cut(ID.seatedCalf),
      sets(ID.bss, 2), sets(ID.legPress, 3), cut(ID.legCurl), cut(ID.hipThrust), cut(ID.bss)],
    add: [sets(ID.legPress, 5), sets(ID.rdl, 4), add(ex('Leg Extension', ID.legExt, 3, 12, 15, 60)),
      add(ex('Standing Calf Raise', ID.calf, 2, 12, 20, 60)), add(ex('Dead Bug', ID.deadBug, 3, 10, 15, 60))],
  },
  push: {
    essential: [ID.bench, ID.ohp], minSets: { [ID.bench]: 3, [ID.ohp]: 2 },
    trim: [cut(ID.plank), cut(ID.ohTri), sets(ID.fly, 2), sets(ID.pushdown, 2), sets(ID.lateral, 2),
      cut(ID.fly), sets(ID.bench, 3), cut(ID.pushdown), sets(ID.ohp, 2), cut(ID.lateral)],
    add: [sets(ID.bench, 5), add(ex('Incline Dumbbell Press', ID.inclineDb, 3, 8, 12, 90)), sets(ID.lateral, 4),
      sets(ID.ohTri, 3), add(ex('Dumbbell Shoulder Press', ID.dbPress, 2, 8, 12, 90)), add(WALK())],
  },
  pull: {
    essential: [ID.pulldown, ID.row], minSets: { [ID.pulldown]: 3, [ID.row]: 3 },
    trim: [cut(ID.hkr), cut(ID.hammer), sets(ID.straightArm, 2), sets(ID.facePull, 2), sets(ID.bbCurl, 2),
      cut(ID.straightArm), sets(ID.row, 3), sets(ID.pulldown, 3), cut(ID.bbCurl), cut(ID.facePull)],
    add: [sets(ID.row, 5), add(ex('Seated Cable Row', ID.cableRow, 3, 8, 12, 90)), sets(ID.hammer, 3),
      sets(ID.facePull, 4), add(ex('Bicep Curl', ID.curl, 2, 12, 15, 60)), add(WALK())],
  },
  legs: {
    essential: [ID.squat, ID.rdl], minSets: { [ID.squat]: 3, [ID.rdl]: 2 },
    trim: [sets(ID.calf, 2), sets(ID.legExt, 2), sets(ID.legCurl, 2), cut(ID.legExt),
      sets(ID.bss, 2), sets(ID.squat, 3), cut(ID.calf), sets(ID.deadBug, 2), sets(ID.rdl, 2), cut(ID.bss),
      cut(ID.legCurl), cut(ID.deadBug)],
    add: [sets(ID.squat, 5), add(ex('Hip Thrust', ID.hipThrust, 3, 10, 15, 90)), sets(ID.rdl, 4),
      add(ex('Seated Calf Raise', ID.seatedCalf, 3, 12, 20, 60)), add(ex('Hanging Knee Raise', ID.hkr, 3, 10, 15, 60))],
  },
  full_a: {
    essential: [ID.squat, ID.bench, ID.row], minSets: { [ID.squat]: 3, [ID.bench]: 3, [ID.row]: 3 },
    trim: [cut(ID.plank), sets(ID.curl, 2), sets(ID.pushdown, 2), sets(ID.rdl, 2), cut(ID.curl), cut(ID.pushdown),
      sets(ID.squat, 3), sets(ID.bench, 3), sets(ID.row, 3), cut(ID.rdl)],
    add: [add(ex('Lat Pulldown', ID.pulldown, 3, 8, 12, 90)), add(ex('Lateral Raise', ID.lateral, 3, 12, 20, 60)),
      sets(ID.rdl, 4), add(ex('Standing Calf Raise', ID.calf, 3, 12, 20, 60)), sets(ID.curl, 4)],
  },
  full_b: {
    essential: [ID.bss, ID.ohp, ID.pulldown], minSets: { [ID.bss]: 2, [ID.ohp]: 3, [ID.pulldown]: 3 },
    trim: [sets(ID.lateral, 2), sets(ID.rdl, 2), cut(ID.lateral), sets(ID.deadBug, 2), sets(ID.bss, 2), cut(ID.rdl),
      cut(ID.deadBug)],
    add: [add(ex('Barbell Row', ID.row, 3, 6, 10, 120)), add(ex('Incline Dumbbell Press', ID.inclineDb, 3, 8, 12, 90)),
      add(ex('Hammer Curl', ID.hammer, 3, 10, 15, 60)), add(ex('Overhead Tricep Extension', ID.ohTri, 3, 10, 15, 60)),
      sets(ID.rdl, 4), add(ex('Standing Calf Raise', ID.calf, 3, 12, 20, 60)), sets(ID.lateral, 4)],
  },
  full_c: {
    essential: [ID.legPress, ID.inclineDb, ID.cableRow], minSets: { [ID.legPress]: 3, [ID.inclineDb]: 3, [ID.cableRow]: 3 },
    trim: [cut(ID.farmer), sets(ID.facePull, 2), sets(ID.legCurl, 2), cut(ID.facePull), cut(ID.legCurl)],
    add: [add(ex('Romanian Deadlift', ID.rdl, 3, 8, 12, 90)), add(ex('Lat Pulldown', ID.pulldown, 3, 8, 12, 90)),
      add(ex('Bicep Curl', ID.curl, 3, 10, 15, 60)), add(ex('Tricep Pushdown', ID.pushdown, 3, 10, 15, 60)),
      add(ex('Lateral Raise', ID.lateral, 3, 12, 20, 60)), sets(ID.legPress, 4)],
  },
};
['push', 'pull', 'legs'].forEach((k) => { PLANS[k + '_a'] = PLANS[k]; });

PLANS.push_b = {
  essential: [ID.inclineBench, ID.machinePress], minSets: { [ID.inclineBench]: 3, [ID.machinePress]: 2 },
  trim: [cut(ID.cableCrunch), cut(ID.ohCableTri), sets(ID.pecDeck, 2), sets(ID.rope, 2), sets(ID.cableLateral, 2),
    cut(ID.pecDeck), sets(ID.inclineBench, 3), cut(ID.rope), sets(ID.machinePress, 2), cut(ID.cableLateral)],
  add: [sets(ID.inclineBench, 5), add(ex('Close-Grip Bench Press', ID.closeGrip, 3, 8, 12, 90)), sets(ID.cableLateral, 4),
    sets(ID.ohCableTri, 3), sets(ID.pecDeck, 4), add(WALK())],
};
PLANS.pull_b = {
  essential: [ID.ngPulldown, ID.csRow], minSets: { [ID.ngPulldown]: 3, [ID.csRow]: 3 },
  trim: [cut(ID.hlr), cut(ID.cableCurl), sets(ID.saCableRow, 2), sets(ID.revPec, 2), sets(ID.incCurl, 2),
    cut(ID.saCableRow), sets(ID.csRow, 3), sets(ID.ngPulldown, 3), cut(ID.incCurl), cut(ID.revPec)],
  add: [sets(ID.csRow, 5), add(ex('Dumbbell Row', ID.dbRow, 3, 8, 12, 90)), sets(ID.cableCurl, 3),
    sets(ID.revPec, 4), add(WALK())],
};
PLANS.legs_b = {
  essential: [ID.hack, ID.hipThrust], minSets: { [ID.hack]: 3, [ID.hipThrust]: 3 },
  trim: [cut(ID.hkr), sets(ID.seatedCalf, 2), sets(ID.legExt, 2), sets(ID.seatedCurl, 2), cut(ID.legExt),
    sets(ID.walkLunge, 2), sets(ID.hack, 3), cut(ID.seatedCalf), sets(ID.hipThrust, 3), cut(ID.walkLunge), cut(ID.seatedCurl)],
  add: [sets(ID.hack, 5), add(ex('Leg Press', ID.legPress, 3, 10, 15, 120)), sets(ID.seatedCurl, 4),
    add(ex('Dead Bug', ID.deadBug, 3, 10, 15, 60)), sets(ID.walkLunge, 4), sets(ID.hipThrust, 5)],
};

const CORE = [ID.plank, ID.deadBug, ID.hkr, ID.hlr, ID.cableCrunch];

module.exports = { ID, SESSIONS, PLANS, CORE };
