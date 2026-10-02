/* Phase 4.3.9B — CP3c. Bodyweight Foundations, created as a HIDDEN DRAFT.
 * ──────────────────────────────────────────────────────────────────────────
 * The Program row is `status='draft'` and its three Routines are
 * `visibility='private'`, so nothing here is reachable by a user. These tests
 * pin the approved content, prove the draft is excluded from the catalog by
 * running the REAL loader, and prove the recommendation engine is unaffected
 * while the Program stays hidden.
 *
 * The literals below are the approved records. They are deliberately a second
 * copy of what the migration inserted: the migration proves the DATABASE holds
 * them, this file proves the repository agrees about what they should be.
 *
 * Phase 4.3.9B CP4c (migration 20261002173108) updated Full Body A and B in
 * place: both Push-Up entries carry the new Swap guidance, and Full Body B's
 * Pike Push-Up became the timed Pike Lean foundation. ROUTINE_A/ROUTINE_B
 * mirror that CURRENT state; the pre-CP4c arrays are kept below only to prove
 * the change touched exactly the approved paths.
 *
 * `schedules.js` has no Node exports (browser-global script), so it is
 * evaluated in a vm sandbox — the same pattern dashboard-zero-state.test.js
 * uses to exercise real browser code. No product file was given exports for
 * the sake of testing. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');
const { rtNormalizeExercises } = require('./routine-core.js');
const { pgSessionIndex } = require('./program-state.js');
const { pcBySlug, pcPagePath } = require('./program-catalog.js');
const Personalization = require('./personalization-core.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ── Approved exercise identity ─────────────────────────────────────────── */

const EX = {
  BODYWEIGHT_SQUAT: '97501496-7f81-4552-82ab-d3f326b8ff06',
  REVERSE_LUNGE:    'd2812c92-d4c6-420c-b2d9-d2c5757871c9',
  SL_GLUTE_BRIDGE:  'da2d9535-6e82-4790-84c9-8e1a0d549718',
  PUSH_UP:          'dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac',
  SIDE_PLANK:       'be4abe1a-93fa-4e87-9250-2627fe45ad3c',
  PIKE_PUSH_UP:     'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34',
  PIKE_LEAN:        'c3d81925-04dc-4caf-b5ef-5b42740028e8',
  SUPERMAN:         'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45',
  DEAD_BUG:         '9c8998ab-9713-43f4-940b-5f8feec39d3c',
  BIRD_DOG:         'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56',
  GLUTE_BRIDGE:     'ff15ede3-a361-415a-8e20-6a7244bad0b3',
  SPLIT_SQUAT:      'a7942454-736c-4d84-980d-39b40298a1b2',
  WALL_SIT:         '7948f9c4-2ec1-432b-ad79-7f27c5961577',
  MOUNTAIN_CLIMBER: 'ed45d50d-5411-4e47-8309-97314b94adfb',
  RUSSIAN_TWIST:    'e4015387-bed0-43e2-9129-4ca3c2b67414',
};

/* Guidance that must stay verbatim. The Push-Up note routes the regression
 * through SWAP so the logged identity changes with it — a note must never ask
 * someone to perform a different movement while logging the original one. */
const NOTE_SWAP =
  'Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if ' +
  'that is too hard. Swap applies to this workout only.';
/* Pike Lean is a timed straight-arm hold that PREPARES for the Pike Push-Up;
 * it is not a full-range replacement and must never be described as one. */
const NOTE_PIKE_LEAN =
  'Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but ' +
  'is not a full-range replacement. Lean less to make it easier.';
const NOTE_SUPERMAN =
  'Posterior-chain and postural endurance. ' +
  'Not a pulling exercise and not a substitute for rows.';

// Canonical key ORDER matters: routine-core writes name · sets · reps_low ·
// reps_high · notes · rest_sec · exercise_id.
const e = (name, exercise_id, sets, reps_low, reps_high, rest_sec, notes) =>
  ({ name, sets, reps_low, reps_high, notes: notes || '', rest_sec, exercise_id });

/* ── Approved records ───────────────────────────────────────────────────── */

const ROUTINE_A = {
  id: 'a4e1c7b2-1f30-4d85-9a61-0c3e7b5d21f4',
  name: 'Full Body A',
  exercises: [
    e('Bodyweight Squat',        EX.BODYWEIGHT_SQUAT, 3, 10, 15, 75),
    e('Reverse Lunge',           EX.REVERSE_LUNGE,    3,  8, 12, 75, 'Reps are per leg.'),
    e('Single-Leg Glute Bridge', EX.SL_GLUTE_BRIDGE,  3,  8, 12, 60, 'Reps are per leg.'),
    e('Push-Up',                 EX.PUSH_UP,          2,  6, 12, 75, NOTE_SWAP),
    e('Side Plank',              EX.SIDE_PLANK,       2, 20, 35, 45, 'Hold time in seconds, per side.'),
  ],
};

const ROUTINE_B = {
  id: 'b5f2d8c3-2a41-4e96-8b72-1d4f8c6e32a5',
  name: 'Full Body B',
  exercises: [
    e('Push-Up',      EX.PUSH_UP,      4,  6, 12, 75, NOTE_SWAP),
    e('Pike Lean',    EX.PIKE_LEAN,    3, 15, 30, 60, NOTE_PIKE_LEAN),
    e('Superman',     EX.SUPERMAN,     3, 10, 12, 45, NOTE_SUPERMAN),
    e('Dead Bug',     EX.DEAD_BUG,     3, 10, 10, 45, 'Reps are per side.'),
    e('Bird Dog',     EX.BIRD_DOG,     2,  8, 10, 45, 'Reps are per side.'),
  ],
};

const ROUTINE_C = {
  id: 'c6a3e9d4-3b52-4fa7-9c83-2e5a9d7f43b6',
  name: 'Full Body C',
  exercises: [
    e('Glute Bridge',     EX.GLUTE_BRIDGE,     3, 12, 15, 60),
    e('Split Squat',      EX.SPLIT_SQUAT,      3,  8, 12, 75, 'Reps are per leg.'),
    e('Wall Sit',         EX.WALL_SIT,         2, 30, 45, 60, 'Hold time in seconds.'),
    e('Superman',         EX.SUPERMAN,         2, 10, 12, 45, NOTE_SUPERMAN),
    e('Mountain Climber', EX.MOUNTAIN_CLIMBER, 2, 30, 30, 45, 'Work time in seconds.'),
    e('Russian Twist',    EX.RUSSIAN_TWIST,    2, 12, 16, 45, 'Reps are total, not per side.'),
  ],
};

const ROUTINES = [ROUTINE_A, ROUTINE_B, ROUTINE_C];

const PROGRAM = {
  id: 'e8c5a1f6-5d74-4bc9-8ea5-4a7c1b9d65d8',
  slug: 'bodyweight_foundations',
  name: 'Bodyweight Foundations',
  description:
    'An equipment-free strength foundation focused on legs, pushing, core, and ' +
    'training consistency. It does not replace balanced resistance training with ' +
    'pulling movements.',
  goal: 'muscle',
  difficulty: 'Beginner – Intermediate',
  duration_weeks: 8,
  recommended_days_per_week: 3,
  equipment_summary: 'Bodyweight',
  included_with_membership: true,
  standalone_purchasable: false,
  status: 'draft',
  sort_order: 4,
  page_path: 'program-bodyweight.html',
};

const LINKS = [
  { id: 'f9d6b2a7-6e85-4cda-9fb6-5b8d2cae76e9', session_key: 'full_a', routine_id: ROUTINE_A.id, sort_order: 1 },
  { id: '0ae7c3b8-7f96-4deb-8ac7-6c9e3dbf87fa', session_key: 'full_b', routine_id: ROUTINE_B.id, sort_order: 2 },
  { id: '1bf8d4c9-80a7-4efc-9bd8-7daf4ecf980b', session_key: 'full_c', routine_id: ROUTINE_C.id, sort_order: 3 },
];

const ALL_ENTRIES = ROUTINES.reduce((a, r) => a.concat(r.exercises), []);
const byId = (id) => EXERCISE_CATALOG.find((x) => x.id === id);

/* ── Prescription shape and content ─────────────────────────────────────── */

test('16 prescription entries across A=5, B=5, C=6', () => {
  assert.equal(ROUTINE_A.exercises.length, 5);
  assert.equal(ROUTINE_B.exercises.length, 5);
  assert.equal(ROUTINE_C.exercises.length, 6);
  assert.equal(ALL_ENTRIES.length, 16);
});

test('16 entries resolve to exactly 14 distinct exercises', () => {
  const ids = new Set(ALL_ENTRIES.map((x) => x.exercise_id));
  assert.equal(ids.size, 14);
  // The two intentional repeats, named rather than merely counted.
  assert.equal(ALL_ENTRIES.filter((x) => x.exercise_id === EX.PUSH_UP).length, 2);
  assert.equal(ALL_ENTRIES.filter((x) => x.exercise_id === EX.SUPERMAN).length, 2);
});

test('exact A/B/C ordering and every prescribed field', () => {
  assert.deepEqual(ROUTINE_A.exercises.map((x) => [x.name, x.sets, x.reps_low, x.reps_high, x.rest_sec]), [
    ['Bodyweight Squat', 3, 10, 15, 75],
    ['Reverse Lunge', 3, 8, 12, 75],
    ['Single-Leg Glute Bridge', 3, 8, 12, 60],
    ['Push-Up', 2, 6, 12, 75],
    ['Side Plank', 2, 20, 35, 45],
  ]);
  assert.deepEqual(ROUTINE_B.exercises.map((x) => [x.name, x.sets, x.reps_low, x.reps_high, x.rest_sec]), [
    ['Push-Up', 4, 6, 12, 75],
    ['Pike Lean', 3, 15, 30, 60],
    ['Superman', 3, 10, 12, 45],
    ['Dead Bug', 3, 10, 10, 45],
    ['Bird Dog', 2, 8, 10, 45],
  ]);
  assert.deepEqual(ROUTINE_C.exercises.map((x) => [x.name, x.sets, x.reps_low, x.reps_high, x.rest_sec]), [
    ['Glute Bridge', 3, 12, 15, 60],
    ['Split Squat', 3, 8, 12, 75],
    ['Wall Sit', 2, 30, 45, 60],
    ['Superman', 2, 10, 12, 45],
    ['Mountain Climber', 2, 30, 30, 45],
    ['Russian Twist', 2, 12, 16, 45],
  ]);
});

test('every prescribed exercise_id exists in the committed catalog fixture', () => {
  ALL_ENTRIES.forEach((x) => {
    const row = byId(x.exercise_id);
    assert.ok(row, `exercise_id ${x.exercise_id} (${x.name}) is not in the fixture`);
    // The prescription's display name must be the canonical catalog name, never
    // an alias or free text — logging identity comes from the id, but a drifting
    // name would mislead on every surface that shows it.
    assert.equal(row.name, x.name);
  });
});

test('no prescribed exercise requires equipment', () => {
  ALL_ENTRIES.forEach((x) => {
    const row = byId(x.exercise_id);
    assert.equal(row.equipment, 'Bodyweight', `${x.name} is not equipment-free`);
    assert.equal(row.is_bodyweight, true, `${x.name} is not flagged bodyweight`);
  });
});

test('every entry is exactly the canonical seven-key shape', () => {
  const KEYS = ['name', 'sets', 'reps_low', 'reps_high', 'notes', 'rest_sec', 'exercise_id'];
  ALL_ENTRIES.forEach((x) => {
    assert.deepEqual(Object.keys(x), KEYS, `${x.name} has the wrong key set or order`);
  });
});

test('every entry survives rtNormalizeExercises unchanged', () => {
  // Proves no clamp or default silently rewrites a prescription: rest_sec is
  // never 0 (which would fall through to 90), reps_high is never below
  // reps_low, and sets is always >= 1.
  ROUTINES.forEach((r) => {
    assert.deepEqual(rtNormalizeExercises(r.exercises), r.exercises,
      `${r.name} is altered by normalization`);
  });
});

/* ── Superman must never be presented as pulling work ───────────────────── */

test('Superman is static and is never treated as a pull', () => {
  const row = byId(EX.SUPERMAN);
  assert.equal(row.force_type, 'static');
  assert.equal(row.name, 'Superman');

  const PULLING = /\b(pull|pull-?up|row|rows|chin-?up|lat|lats)\b/i;
  ALL_ENTRIES.forEach((x) => {
    assert.ok(!PULLING.test(x.name), `${x.name} is a pulling movement`);
  });
  // The one note that mentions pulling must DENY it, not prescribe it.
  const supermanNotes = ALL_ENTRIES
    .filter((x) => x.exercise_id === EX.SUPERMAN).map((x) => x.notes);
  assert.equal(supermanNotes.length, 2);
  supermanNotes.forEach((n) => {
    assert.equal(n, NOTE_SUPERMAN);
    assert.match(n, /Not a pulling exercise/);
    assert.match(n, /not a substitute for rows/);
  });
});

/* ── Notes ──────────────────────────────────────────────────────────────── */

test('notes satisfy the approved constraints', () => {
  ALL_ENTRIES.forEach((x) => {
    assert.equal(typeof x.notes, 'string');
    // 140 is the limit the Routine editor input enforces (workout.html).
    assert.ok(x.notes.length <= 140, `note on ${x.name} is ${x.notes.length} chars`);
    assert.equal(x.notes, x.notes.trim());
  });

  // Unilateral work must say so; the catalog flag is the source of truth.
  ALL_ENTRIES.forEach((x) => {
    if (byId(x.exercise_id).is_unilateral) {
      assert.match(x.notes, /per (leg|side)/,
        `${x.name} is unilateral but its note does not say per leg/side`);
    }
  });

  // Time-tracked entries must say the numbers are seconds, because the shared
  // contract carries time in the reps fields.
  ALL_ENTRIES.forEach((x) => {
    if (byId(x.exercise_id).tracking_type === 'time') {
      assert.match(x.notes, /seconds/, `${x.name} is time-tracked but its note omits seconds`);
    }
  });
});

test('the Push-Up regression routes through Swap, not a silent substitution', () => {
  const pushUps = ALL_ENTRIES.filter((x) => x.exercise_id === EX.PUSH_UP);
  assert.equal(pushUps.length, 2);
  pushUps.forEach((x) => {
    assert.equal(x.notes, NOTE_SWAP);
    assert.match(x.notes, /Use Swap/);
    assert.match(x.notes, /before logging sets/);
    assert.match(x.notes, /this workout only/);   // Swap does not carry forward
    // CP4c: the full beginner path, easiest last — Knee, then Wall.
    assert.match(x.notes, /Knee Push-Up, or Wall Push-Up if that is too hard/);
  });

  // CP4c: the vertical push is the timed Pike Lean, which prepares for the
  // Pike Push-Up and must not claim to replace it. Pike Push-Up is no longer
  // prescribed anywhere in the Program.
  const pike = ALL_ENTRIES.find((x) => x.exercise_id === EX.PIKE_LEAN);
  assert.equal(pike.notes, NOTE_PIKE_LEAN);
  assert.match(pike.notes, /Prepares you for the Pike Push-Up/);
  assert.match(pike.notes, /not a full-range replacement/);
  assert.ok(!ALL_ENTRIES.some((x) => x.exercise_id === EX.PIKE_PUSH_UP || x.name === 'Pike Push-Up'));

  // Knee Push-Up and Wall Push-Up are real catalog exercises, so the Swap
  // instruction is actionable — but neither is itself a prescribed entry.
  ['Knee Push-Up', 'Wall Push-Up'].forEach((n) => {
    const row = EXERCISE_CATALOG.find((x) => x.name === n);
    assert.ok(row, n + ' must exist for the Swap guidance to be actionable');
    assert.ok(!ALL_ENTRIES.some((x) => x.exercise_id === row.id), n + ' is not prescribed');
  });
});

/* ── Program and link records ───────────────────────────────────────────── */

test('the Program is a draft with the approved metadata', () => {
  assert.equal(PROGRAM.status, 'draft');
  assert.equal(PROGRAM.slug, 'bodyweight_foundations');
  assert.equal(PROGRAM.goal, 'muscle');
  assert.equal(PROGRAM.equipment_summary, 'Bodyweight');
  assert.equal(PROGRAM.included_with_membership, true);
  assert.equal(PROGRAM.standalone_purchasable, false);
  assert.equal(PROGRAM.duration_weeks, 8);
  assert.equal(PROGRAM.recommended_days_per_week, 3);
  assert.equal(PROGRAM.sort_order, 4);
});

test('session keys are unique and map one-to-one onto the three Routines', () => {
  assert.deepEqual(LINKS.map((l) => l.session_key), ['full_a', 'full_b', 'full_c']);
  assert.equal(new Set(LINKS.map((l) => l.session_key)).size, 3);
  assert.equal(new Set(LINKS.map((l) => l.routine_id)).size, 3);
  assert.deepEqual(LINKS.map((l) => l.routine_id), ROUTINES.map((r) => r.id));
  assert.deepEqual(LINKS.map((l) => l.sort_order), [1, 2, 3]);
  // Every id used anywhere in CP3c is distinct.
  const ids = [PROGRAM.id].concat(ROUTINES.map((r) => r.id)).concat(LINKS.map((l) => l.id));
  assert.equal(new Set(ids).size, 7);
});

/* ── Schedule ───────────────────────────────────────────────────────────── */

function loadSchedules() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('schedules.js'), sandbox);
  return sandbox;
}

test('every training frequency 2–6 runs all three sessions', () => {
  const S = loadSchedules();
  for (let d = 2; d <= 6; d++) {
    assert.deepEqual(S.getScheduleForDays('bodyweight_foundations', d),
      ['full_a', 'full_b', 'full_c'], `days=${d}`);
  }
  assert.deepEqual(S.getAllSessionsForProgram('bodyweight_foundations'),
    ['full_a', 'full_b', 'full_c']);
});

test('a two-day user still reaches session C by carrying current_index', () => {
  const S = loadSchedules();
  const keys = S.getScheduleForDays('bodyweight_foundations', 2);
  // current_index advances per completed session and is never reset weekly, so
  // two sessions a week walk the three-session list: A,B → C,A → B,C.
  const walked = [0, 1, 2, 3, 4, 5].map((i) => keys[pgSessionIndex(keys, i)]);
  assert.deepEqual(walked, ['full_a', 'full_b', 'full_c', 'full_a', 'full_b', 'full_c']);
  assert.deepEqual([walked[0], walked[1]], ['full_a', 'full_b']);  // week 1
  assert.deepEqual([walked[2], walked[3]], ['full_c', 'full_a']);  // week 2
  assert.deepEqual([walked[4], walked[5]], ['full_b', 'full_c']);  // week 3
  assert.ok(walked.includes('full_c'), 'session C must not be unreachable');
});

test('existing Program schedules are unchanged', () => {
  const S = loadSchedules();
  // Frozen expected values, copied from the pre-CP3c file.
  const FROZEN = {
    fat_loss_blueprint: {
      2: ['full_a', 'full_b'],
      3: ['full_a', 'full_b', 'full_c'],
      4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
      5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
      6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
    },
    muscle_gain: {
      2: ['full_a', 'full_b'],
      3: ['full_a', 'full_b', 'full_c'],
      4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
      5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
      6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
    },
    glute_builder: {
      2: ['glute_a', 'glute_b'],
      3: ['glute_a', 'glute_b', 'glute_c'],
      4: ['glute_lower_a', 'upper_a', 'glute_lower_b', 'upper_b'],
      5: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump'],
      6: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump', 'full_body_glute'],
    },
  };
  Object.keys(FROZEN).forEach((slug) => {
    for (let d = 2; d <= 6; d++) {
      assert.deepEqual(S.getScheduleForDays(slug, d), FROZEN[slug][d], `${slug} days=${d}`);
    }
  });
  assert.deepEqual(S.getAllSessionsForProgram('fat_loss_blueprint'),
    ['full_a', 'full_b', 'full_c', 'upper_a', 'lower_a', 'upper_b', 'lower_b',
     'push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b']);
  assert.deepEqual(S.getAllSessionsForProgram('muscle_gain'),
    ['full_a', 'full_b', 'full_c', 'upper_a', 'lower_a', 'upper_b', 'lower_b',
     'push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b']);
  assert.deepEqual(S.getAllSessionsForProgram('glute_builder'),
    ['glute_a', 'glute_b', 'glute_c', 'glute_lower_a', 'upper_a', 'glute_lower_b',
     'upper_b', 'upper_push_a', 'upper_pull_a', 'glute_pump', 'full_body_glute']);
});

test('SESSION_LABELS is untouched and already names the three sessions', () => {
  const S = loadSchedules();
  assert.equal(S.SESSION_LABELS.full_a, 'Full Body A');
  assert.equal(S.SESSION_LABELS.full_b, 'Full Body B');
  assert.equal(S.SESSION_LABELS.full_c, 'Full Body C');
  // The Routine names must match, or Home (which labels from SESSION_LABELS)
  // and the workout screen (which uses the Routine's own name) would disagree.
  assert.deepEqual(ROUTINES.map((r) => r.name),
    LINKS.map((l) => S.SESSION_LABELS[l.session_key]));
});

/* ── Draft exclusion: the REAL catalog loader against a stub client ─────── */

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// A query builder that HONOURS the filters it is given, so exclusion has to
// come from the loader rather than from a convenient fixture.
function fakeClient(rows) {
  return {
    from() {
      const eqs = [];
      let ordering = null;
      const api = {
        select: () => api,
        eq: (col, val) => { eqs.push([col, val]); return api; },
        order: (col, opts) => { ordering = [col, opts]; return api; },
        then: (resolve) => {
          let data = rows.slice();
          eqs.forEach(([c, v]) => { data = data.filter((r) => r[c] === v); });
          if (ordering) {
            const [c, o] = ordering;
            const dir = (!o || o.ascending !== false) ? 1 : -1;
            data = data.slice().sort((a, b) => (a[c] - b[c]) * dir);
          }
          return resolve({ data, error: null });
        },
      };
      return api;
    },
  };
}

const ROW_FAT_LOSS = {
  slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', description: '12-week fat loss system',
  goal: 'fatloss', difficulty: 'Beginner – Intermediate', duration_weeks: 12,
  recommended_days_per_week: 4, equipment_summary: 'Full Gym', included_with_membership: true,
  standalone_purchasable: true, status: 'published', sort_order: 1, page_path: 'program-fat-loss.html',
};
const ROW_MUSCLE = {
  slug: 'muscle_gain', name: 'Muscle Gain', description: '8-week hypertrophy program',
  goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8,
  recommended_days_per_week: 3, equipment_summary: 'Full Gym', included_with_membership: true,
  standalone_purchasable: true, status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html',
};
const ROW_GLUTE = {
  slug: 'glute_builder', name: 'Glute Builder', description: "Women's lower-body program",
  goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8,
  recommended_days_per_week: 3, equipment_summary: 'Full Gym', included_with_membership: true,
  standalone_purchasable: true, status: 'published', sort_order: 3, page_path: 'program-glute-builder.html',
};
const ROW_DRAFT = {
  slug: PROGRAM.slug, name: PROGRAM.name, description: PROGRAM.description,
  goal: PROGRAM.goal, difficulty: PROGRAM.difficulty, duration_weeks: PROGRAM.duration_weeks,
  recommended_days_per_week: PROGRAM.recommended_days_per_week,
  equipment_summary: PROGRAM.equipment_summary,
  included_with_membership: PROGRAM.included_with_membership,
  standalone_purchasable: PROGRAM.standalone_purchasable, status: PROGRAM.status,
  sort_order: PROGRAM.sort_order, page_path: PROGRAM.page_path,
};
const ALL_ROWS = [ROW_FAT_LOSS, ROW_MUSCLE, ROW_GLUTE, ROW_DRAFT];

function loadCatalog(rows, source) {
  const sandbox = {
    console: { error() {}, warn() {} },
    sessionStorage: memStore(),
    supabaseClient: fakeClient(rows),
  };
  vm.createContext(sandbox);
  vm.runInContext((source || read('program-catalog.js')) + '\n__out = pcLoadCatalog();', sandbox);
  return sandbox.__out;
}

test('the real loader excludes the draft Program', async () => {
  const catalog = await loadCatalog(ALL_ROWS);
  assert.deepEqual(catalog.map((p) => p.slug),
    ['fat_loss_blueprint', 'muscle_gain', 'glute_builder']);
  catalog.forEach((p) => assert.equal(p.status, 'published'));
  assert.ok(!catalog.some((p) => p.slug === 'bodyweight_foundations'));
});

test('the exclusion comes from the status filter, not from the fixture', async () => {
  // Mutation check: neutralise the loader's own filter and the SAME fixture
  // now yields the draft. Without this, the test above could pass for the
  // wrong reason.
  const src = read('program-catalog.js');
  const mutated = src.replace(/\.eq\('status',\s*'published'\)/, '');
  assert.notEqual(mutated, src, 'the status filter was not found to mutate');
  const leaked = await loadCatalog(ALL_ROWS, mutated);
  assert.ok(leaked.some((p) => p.slug === 'bodyweight_foundations'),
    'mutation did not expose the draft — the test cannot fail');
});

test('the hidden draft is unreachable through catalog lookups', async () => {
  const catalog = await loadCatalog(ALL_ROWS);
  assert.equal(pcBySlug(catalog, 'bodyweight_foundations'), null);
  // A null page path is what stops a dead CTA rendering for a page that does
  // not exist yet.
  assert.equal(pcPagePath(catalog, 'bodyweight_foundations'), null);
});

test('source assertion (supplemental): the loader filters on published', () => {
  assert.match(read('program-catalog.js'), /\.eq\('status',\s*'published'\)/);
});

/* ── Recommendation behaviour ───────────────────────────────────────────── */

const GOALS = ['fatloss', 'muscle', 'recomp'];
const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
const GYMS = ['full_gym', 'home_basic', 'bodyweight', null];
const DAYS = [2, 3, 4, 5];

function recommendedSlug(profile, catalog) {
  const t = Personalization.derivePersonalizedStart(profile, { catalog }).training;
  return t.recommendedProgram ? t.recommendedProgram.slug : null;
}

function matrix(catalog) {
  const out = [];
  GOALS.forEach((goal) => EXPERIENCE.forEach((exp) => GYMS.forEach((gym) => DAYS.forEach((d) => {
    out.push(recommendedSlug(
      { goal, training_experience: exp, gym_access: gym, training_days: d }, catalog));
  }))));
  return out;
}

test('while the Program is draft, all 144 recommendation cells are unchanged', async () => {
  const withDraftHidden = await loadCatalog(ALL_ROWS);        // loader drops the draft
  const withoutDraftAtAll = await loadCatalog([ROW_FAT_LOSS, ROW_MUSCLE, ROW_GLUTE]);
  const before = matrix(withoutDraftAtAll);
  const after = matrix(withDraftHidden);
  assert.equal(before.length, 144);
  assert.deepEqual(after, before, 'a draft Program must not alter any recommendation');
});

test('hypothetical publication would serve 72 cells and displace none', async () => {
  // NOT what CP3c does — this measures the value of the eventual publication
  // and pins the reviewed result so a later change cannot quietly alter it.
  const base = await loadCatalog([ROW_FAT_LOSS, ROW_MUSCLE, ROW_GLUTE]);
  const published = await loadCatalog(
    ALL_ROWS.map((r) => (r.slug === PROGRAM.slug ? Object.assign({}, r, { status: 'published' }) : r)));
  assert.ok(published.some((p) => p.slug === 'bodyweight_foundations'));

  const before = matrix(base);
  const after = matrix(published);
  let newlyServed = 0;
  let displaced = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    if (before[i] === null && after[i] === 'bodyweight_foundations') newlyServed++;
    else displaced++;
  }
  assert.equal(before.length, 144);
  assert.equal(newlyServed, 72);
  assert.equal(displaced, 0);
});

test('CP3c creates no enrolment, ownership, entitlement or purchase state', () => {
  // The repository half of that guarantee: the only product file CP3c changes
  // is schedules.js, which is a pure lookup table.
  const src = read('schedules.js');
  assert.ok(!/supabaseClient|from\(|insert|update|upsert|delete/.test(src),
    'schedules.js must remain a pure data module');
  assert.match(src, /bodyweight_foundations/);
});

/* ── Phase 4.3.9B CP4c — Push-Up guidance + Pike Lean (migration 20261002173108)
 * The arrays as CP3c created them, frozen. The CP4c migration's own self-check
 * proved the new arrays differ from these at exactly three paths; the same
 * proof is repeated here against the repository mirror. */

const NOTE_SWAP_CP3C =
  'Too hard? Use Swap to choose Knee Push-Up before logging sets. ' +
  'Swap applies to this workout only — repeat it next session.';
const PRE_CP4C_A = ROUTINE_A.exercises.map((x, i) => (i === 3 ? Object.assign({}, x, { notes: NOTE_SWAP_CP3C }) : x));
const PRE_CP4C_B = [
  e('Push-Up',      EX.PUSH_UP,      4,  6, 12, 75, NOTE_SWAP_CP3C),
  e('Pike Push-Up', EX.PIKE_PUSH_UP, 3,  6, 10, 75,
    'To regress, raise your hands or shorten the range. ' +
    'Do not switch to Knee Push-Up — it trains a different pattern.'),
].concat(ROUTINE_B.exercises.slice(2));

/* Postgres `jsonb::text` serialization (keys by byte length, then bytewise;
 * ", " and ": " separators), so a Routine literal can be hashed exactly as
 * production prints it. Proven against the pre-CP4c hashes below. */
function pgJsonbText(v) {
  if (Array.isArray(v)) return '[' + v.map(pgJsonbText).join(', ') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) =>
      Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
    return '{' + keys.map((k) => JSON.stringify(k) + ': ' + pgJsonbText(v[k])).join(', ') + '}';
  }
  return JSON.stringify(v);
}
const pgMd5 = (arr) => require('node:crypto').createHash('md5').update(pgJsonbText(arr)).digest('hex');

test('CP4c: the repository mirror hashes exactly as production stores each Routine', () => {
  // md5(workout_templates.exercises::text), read from production after the
  // migration (A, B) and before it (pre-CP4c A/B; C is unchanged by CP4c).
  assert.equal(pgMd5(PRE_CP4C_A), 'df9134eba4631b0aad87d550e194e928', 'serializer check: pre-CP4c A');
  assert.equal(pgMd5(PRE_CP4C_B), '6d5ecbd1afd19f26adef58dbc6f0f10b', 'serializer check: pre-CP4c B');
  assert.equal(pgMd5(ROUTINE_A.exercises), '3325d7ae57f6c007d99c9db69d9cb311', 'Full Body A');
  assert.equal(pgMd5(ROUTINE_B.exercises), '04d6831d81623921fe8ead42f44e311a', 'Full Body B');
  assert.equal(pgMd5(ROUTINE_C.exercises), 'a9b1d9785031b8b47799a3a2cc9d05ac', 'Full Body C is unchanged');
});

test('CP4c: A and B changed at exactly {3,notes}, {0,notes} and {1}', () => {
  const changed = (before, after) => {
    const out = [];
    assert.equal(after.length, before.length, 'entry count and order are preserved');
    before.forEach((x, i) => {
      const keys = new Set(Object.keys(x).concat(Object.keys(after[i])));
      keys.forEach((k) => { if (JSON.stringify(x[k]) !== JSON.stringify(after[i][k])) out.push(i + '.' + k); });
    });
    return out;
  };
  assert.deepEqual(changed(PRE_CP4C_A, ROUTINE_A.exercises), ['3.notes']);
  assert.deepEqual(changed(PRE_CP4C_B, ROUTINE_B.exercises),
    ['0.notes', '1.name', '1.reps_low', '1.reps_high', '1.notes', '1.rest_sec', '1.exercise_id']);
  // Entry 1 keeps only its set count; everything else is the Pike Lean prescription.
  assert.equal(ROUTINE_B.exercises[1].sets, PRE_CP4C_B[1].sets);
});

test('CP4c: both Push-Up prescriptions carry the identical approved guidance', () => {
  const a = ROUTINE_A.exercises[3];
  const b = ROUTINE_B.exercises[0];
  assert.equal(a.notes, 'Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only.');
  assert.equal(b.notes, a.notes);
  // Otherwise identical except the approved set counts.
  const { sets: setsA, ...restA } = a;
  const { sets: setsB, ...restB } = b;
  assert.deepEqual(restA, restB);
  assert.deepEqual([setsA, setsB], [2, 4]);
});

test('CP4c: Full Body B position 1 is canonical timed Pike Lean; Pike Push-Up is gone', () => {
  assert.deepEqual(ROUTINE_B.exercises[1], {
    name: 'Pike Lean', sets: 3, reps_low: 15, reps_high: 30,
    notes: 'Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but is not a full-range replacement. Lean less to make it easier.',
    rest_sec: 60, exercise_id: 'c3d81925-04dc-4caf-b5ef-5b42740028e8',
  });
  const lean = byId(EX.PIKE_LEAN);
  assert.equal(lean.name, 'Pike Lean');
  assert.equal(lean.tracking_type, 'time', 'the 15–30 target is seconds');
  assert.equal(lean.default_unit, 'sec');
  assert.equal(lean.is_unilateral, false, 'no per-side wording is owed');
  assert.ok(!ROUTINE_B.exercises.some((x) => x.exercise_id === EX.PIKE_PUSH_UP || x.name === 'Pike Push-Up'));
  // Pike Push-Up remains a catalog exercise; CP4c only stopped prescribing it.
  assert.equal(byId(EX.PIKE_PUSH_UP).name, 'Pike Push-Up');
});

test('CP4c: Bodyweight Squat stays without guidance', () => {
  assert.equal(ROUTINE_A.exercises[0].name, 'Bodyweight Squat');
  assert.equal(ROUTINE_A.exercises[0].notes, '');
});

test('CP4c: the repository records the exact applied migration', () => {
  const file = 'supabase/migrations/20261002173108_phase_439b_cp4c_bodyweight_guidance_pike_lean.sql';
  const sql = read(file);
  // Byte-for-byte the reviewed SQL applied to production.
  assert.equal(require('node:crypto').createHash('sha256').update(sql).digest('hex'),
    'c2774a38edd1aeee82d385af9b60c9c5b63726d94338f60ffb083907c5ea75d0');
  // The correction that lets PL/pgSQL read the IF condition: an unparenthesised
  // CASE is cut at its own THEN. The failed version must never be recorded.
  assert.ok(sql.includes("IF v_n <> (CASE v_state WHEN 'FRESH' THEN 2 ELSE 0 END) THEN"));
  assert.ok(!sql.includes("IF v_n <> CASE v_state"), 'the failed unparenthesised form is absent');
  // The recovery README stays in step with the directory it documents.
  const readme = read('supabase/README.md');
  const files = fs.readdirSync(path.join(__dirname, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
  assert.match(readme, new RegExp('The ' + files.length + ' migrations applied to production'));
  assert.match(readme, /`20261002173108`/);
  assert.ok(files.includes(path.basename(file)));
});
