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

/* ── Phase 4.3.9B CP4d — frequency Routines as PRIVATE drafts (migration 20261003000515)
 * Six platform Routines linked to Bodyweight Foundations at positions 4–9, for
 * the CP4e 4/5/6-day mapping. They are private, nothing is published and no
 * schedule maps them, so until CP4e every frequency still runs A/B/C only.
 *
 * As above, the literals are a deliberate second copy: the migration proves the
 * database holds them, and these tests prove the repository agrees. */

const CP4D_FILE = 'supabase/migrations/20261003000515_phase_439b_cp4d_bodyweight_frequency_routines.sql';
const CP4D_SQL = read(CP4D_FILE);

/* The reviewed equipment-free pool (38) and the explicit exclusions (14), in
 * the migration's own order. Names are checked against the catalog below, so a
 * wrong id cannot hide behind a right-looking name. */
const CP4D_POOL = [
  ['Wall Push-Up', '784a0508-84c3-42a6-98b1-c00cc780e5cd'], ['Knee Push-Up', 'a1bb3980-ae49-48ce-a0b5-91bffd5daeda'],
  ['Push-Up', 'dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac'], ['Pike Lean', 'c3d81925-04dc-4caf-b5ef-5b42740028e8'],
  ['Pike Push-Up', 'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34'], ['Plank', 'c320bf46-9f16-4483-bd2f-9ae9e88b7ad5'],
  ['Side Plank', 'be4abe1a-93fa-4e87-9250-2627fe45ad3c'], ['Dead Bug', '9c8998ab-9713-43f4-940b-5f8feec39d3c'],
  ['Bird Dog', 'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56'], ['Reverse Crunch', 'a224a468-28c0-4ba2-b6f9-c8a3f45d2147'],
  ['Bicycle Crunch', '694c48ac-9251-4fa7-bb25-23353048963c'], ['Mountain Climber', 'ed45d50d-5411-4e47-8309-97314b94adfb'],
  ['Wall Slide', 'e3f12784-cf40-4aa5-ae41-6770416c4d1f'], ['Bodyweight Squat', '97501496-7f81-4552-82ab-d3f326b8ff06'],
  ['Reverse Lunge', 'd2812c92-d4c6-420c-b2d9-d2c5757871c9'], ['Split Squat', 'a7942454-736c-4d84-980d-39b40298a1b2'],
  ['Lateral Lunge', 'eee8a605-10d6-41ad-9b79-65d626b598db'], ['Glute Bridge', 'ff15ede3-a361-415a-8e20-6a7244bad0b3'],
  ['Single-Leg Glute Bridge', 'da2d9535-6e82-4790-84c9-8e1a0d549718'], ['Superman', 'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45'],
  ['Wall Sit', '7948f9c4-2ec1-432b-ad79-7f27c5961577'], ['Standing Ankle Rock', '53c57e39-51e9-42e5-991a-3357bd610b4a'],
  ['Kneeling Hip Flexor Stretch', '6962172b-18eb-4def-88d3-acc67c62f9ce'], ['March in Place', '7fae5cd2-712d-4df2-982d-850091d10329'],
  ['Step Jack', '1b836b2c-af56-40a6-9afe-023c3ccd5361'], ['Jumping Jack', '41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5'],
  ['High Knees', '6d50c3a6-0dde-46e4-bc3a-508c2f358803'], ['Cat-Cow', 'ead731d6-bfdd-4119-bd0b-bb3092457e69'],
  ['Quadruped Thoracic Rotation', '44ebe984-c8e9-4842-8617-7f54f1179d2b'], ['90/90 Hip Rotation', 'b2168db4-fb33-4dd0-a8e2-ab5fa81677e4'],
  ['Supine Hamstring Stretch', '4b0b5faa-4704-4959-a550-c01de705a540'], ['Supine Spinal Twist', 'fd10bcf3-a09f-41fe-aca5-7996972d496f'],
  ['Diaphragmatic Breathing', '04429fae-c385-47dd-91ec-7e1fe3a4a83c'], ['Forward Lunge', 'a3ffb069-e0ea-4d01-a038-f9f72b1dd7fe'],
  ['Crunches', '0d28f8c9-7485-4b0a-9552-b56cf3c556bf'], ['Lying Leg Raise', '0b519d3f-6a32-4883-955c-ad9c87f7385f'],
  ['Sit-Up', 'c84d3609-cca3-4652-a1ee-b119105aac1a'], ['Russian Twist', 'e4015387-bed0-43e2-9129-4ca3c2b67414'],
];
const CP4D_FORBIDDEN = [
  ['Ab Wheel Rollout', '9d60b74a-91d4-4059-89fa-ac53160ca767'], ['Back Extension', 'b0c178b6-bd81-477d-ae23-2a9aa40d67b4'],
  ['Bench Dip', 'b3661213-09f8-45bf-83fa-72edebca5001'], ['Box Jump', '0d298f82-6688-46ab-82e1-2ea3e914fc84'],
  ['Chin-Up', '9daedcaa-e007-488f-8a4d-17957361b10e'], ['Decline Push-Up', 'eecf2677-57d4-4bc1-a0e9-bd3ffe59ab15'],
  ['Dips', 'd609a511-99d8-46a2-8dad-674b03c7f1ec'], ['Hanging Knee Raise', '5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5'],
  ['Hanging Leg Raise', 'd06aa93c-276f-4b9e-ad8f-3477c96f4f4e'], ['Incline Push-Up', 'c6b852dd-8773-4417-9244-b51989a308b1'],
  ['Inverted Row', 'd75c33fa-5435-47f5-93fc-e796ad22322e'], ['Pistol Squat', '8a56a474-29e1-47b1-a68f-8cb98718223e'],
  ['Pull-Up', '39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481'], ['Single-Leg Hip Thrust', 'db9208d9-0190-40dd-849b-38724ec9e09d'],
];
const P = Object.fromEntries(CP4D_POOL);
const POOL_IDS = new Set(CP4D_POOL.map((x) => x[1]));
const FORBIDDEN_IDS = new Set(CP4D_FORBIDDEN.map((x) => x[1]));

const NOTE_HIGH_KNEES =
  'Work time in seconds. Keep one foot down and drive your knees only as high as comfortable for a low-impact option.';
const NOTE_PLANK = 'Hold time in seconds, on your forearms.';

const CP4D_ROUTINES = [
  { id: 'b654c396-08a2-5ec9-bf7a-f901e797c77b', link_id: 'bc291137-42de-5f96-b493-d1b50aab7fd6',
    session_key: 'push_core_a', sort_order: 4, name: 'Push & Core A', exercises: [
      e('Wall Push-Up', P['Wall Push-Up'], 3, 10, 15, 60,
        'Ready for more? Use Swap before logging sets: Knee Push-Up, then Push-Up. Swap applies to this workout only.'),
      e('Pike Lean',  P['Pike Lean'],  3, 15, 30, 60, NOTE_PIKE_LEAN),
      e('Dead Bug',   P['Dead Bug'],   3,  8, 10, 45, 'Reps are per side.'),
      e('Plank',      P['Plank'],      3, 20, 40, 45, NOTE_PLANK),
      e('Wall Slide', P['Wall Slide'], 2, 30, 45, 30, 'Work time in seconds. Keep your lower back against the wall.'),
    ] },
  { id: 'f1699018-7e10-5d31-97f9-91b2555d1f29', link_id: '34d87501-141f-5e60-a62a-d6a0c3f4cc12',
    session_key: 'lower_a', sort_order: 5, name: 'Lower Body A', exercises: [
      e('Bodyweight Squat',    P['Bodyweight Squat'],    3, 10, 15, 75),
      e('Reverse Lunge',       P['Reverse Lunge'],       3,  6, 10, 75, 'Reps are per leg. Rest a hand on a wall for balance if needed.'),
      e('Glute Bridge',        P['Glute Bridge'],        3, 12, 15, 60),
      e('Wall Sit',            P['Wall Sit'],            2, 20, 40, 60, 'Hold time in seconds. Sit higher on the wall to make it easier.'),
      e('Standing Ankle Rock', P['Standing Ankle Rock'], 2, 30, 45, 30, 'Work time in seconds, per side.'),
    ] },
  { id: '645bd86b-c15c-5096-9103-5da1d418bf2c', link_id: '7aafce9c-27a3-5bae-959d-ec94066d4f5d',
    session_key: 'conditioning_core', sort_order: 6, name: 'Conditioning & Core', exercises: [
      e('March in Place', P['March in Place'], 2, 45, 60, 30, 'Work time in seconds, at an easy warm-up pace.'),
      e('Step Jack',      P['Step Jack'],      3, 30, 45, 45,
        'Work time in seconds. Low impact: one foot stays down. Swap to Jumping Jack only once this feels easy.'),
      e('High Knees',     P['High Knees'],     3, 20, 30, 45, NOTE_HIGH_KNEES),
      e('Bicycle Crunch', P['Bicycle Crunch'], 2, 10, 16, 45, 'Reps are total, not per side.'),
      e('Plank',          P['Plank'],          2, 20, 40, 45, NOTE_PLANK),
    ] },
  { id: '7fb1a573-1ff3-59a5-ae72-e4c91a0e2a78', link_id: 'db2d039d-5da0-569d-9abe-505094259168',
    session_key: 'push_core_b', sort_order: 7, name: 'Push & Core B', exercises: [
      e('Knee Push-Up',   P['Knee Push-Up'],   3,  8, 12, 75,
        'Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only.'),
      e('Pike Lean',      P['Pike Lean'],      3, 20, 40, 60, NOTE_PIKE_LEAN),
      e('Side Plank',     P['Side Plank'],     2, 15, 30, 45, 'Hold time in seconds, per side. Drop your bottom knee to make it easier.'),
      e('Reverse Crunch', P['Reverse Crunch'], 3,  8, 12, 45, 'Curl your hips up with control, without swinging.'),
      e('Bird Dog',       P['Bird Dog'],       2,  6,  8, 45, 'Reps are per side.'),
    ] },
  { id: '50081b09-7f82-591c-842f-1792f2cb4b27', link_id: '279de6f6-2a95-5f6b-820a-769c8bb5519e',
    session_key: 'lower_b', sort_order: 8, name: 'Lower Body B', exercises: [
      e('Split Squat',                 P['Split Squat'],                 3,  6, 10, 75, 'Reps are per leg. Lower only as far as you can control.'),
      e('Single-Leg Glute Bridge',     P['Single-Leg Glute Bridge'],     3,  8, 12, 60, 'Reps are per leg.'),
      e('Lateral Lunge',               P['Lateral Lunge'],               2,  6,  8, 60, 'Reps are per leg. Sit back only as deep as is comfortable.'),
      e('Superman',                    P['Superman'],                    3, 10, 12, 45, NOTE_SUPERMAN),
      e('Kneeling Hip Flexor Stretch', P['Kneeling Hip Flexor Stretch'], 2, 30, 45, 30, 'Hold time in seconds, per side.'),
    ] },
  { id: '58d0f941-51e4-5485-831b-a99521bf9c14', link_id: 'b95ad56d-5cca-5a14-82de-832b87716f15',
    session_key: 'mobility_recovery', sort_order: 9, name: 'Mobility & Recovery', exercises: [
      e('Cat-Cow',                     P['Cat-Cow'],                     2, 45,  60, 15, 'Work time in seconds. Move slowly with your breath.'),
      e('Quadruped Thoracic Rotation', P['Quadruped Thoracic Rotation'], 2, 30,  45, 15, 'Work time in seconds, per side.'),
      e('90/90 Hip Rotation',          P['90/90 Hip Rotation'],          2, 30,  45, 15, 'Work time in seconds, per side.'),
      e('Supine Hamstring Stretch',    P['Supine Hamstring Stretch'],    2, 30,  45, 15, 'Hold time in seconds, per side.'),
      e('Supine Spinal Twist',         P['Supine Spinal Twist'],         2, 30,  45, 15, 'Hold time in seconds, per side.'),
      e('Diaphragmatic Breathing',     P['Diaphragmatic Breathing'],     1, 60, 120, 15, 'Time in seconds. Slow, relaxed breaths.'),
    ] },
];
const CP4D_KEYS = CP4D_ROUTINES.map((r) => r.session_key);

/* SQL with comments, dollar-quoted payloads and string literals removed, so a
 * statement scan sees executable SQL only. */
const CP4D_CODE = CP4D_SQL
  .replace(/--[^\n]*/g, '')
  .replace(/\$(new|sn)\$[\s\S]*?\$\1\$/g, "''")
  .replace(/'[^']*'/g, "''");
const sqlArray = (name) => {
  const m = CP4D_SQL.match(new RegExp('\\b' + name + ' CONSTANT uuid\\[\\] := ARRAY\\[([^\\]]*)\\]::uuid\\[\\];'));
  assert.ok(m, name + ' is declared');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
};
const sqlKNew = () => {
  const m = CP4D_SQL.match(/k_new CONSTANT jsonb := \$new\$([\s\S]*?)\$new\$::jsonb;/);
  assert.ok(m, 'k_new is declared');
  return JSON.parse(m[1]);
};
const sha256 = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');

test('CP4d: the repository records byte-for-byte the statement stored in production', () => {
  const raw = fs.readFileSync(path.join(__dirname, CP4D_FILE));
  // sha256 of supabase_migrations.schema_migrations.statements[1] for version
  // 20261003000515, read from production after the apply.
  assert.equal(sha256(raw), '7341ef439ad0c40d411d85012b52eff2dc96edf65405e276b877607ba8786157');
  assert.equal(raw.length, 33574);
  // Supabase stores the reviewed file without its final newline. Putting it back
  // must give the hash of the reviewed artifact that was approved and applied.
  assert.ok(!raw.toString('utf8').endsWith('\n'));
  assert.equal(sha256(Buffer.concat([raw, Buffer.from('\n')])),
    'c2465305975c7c292f8cf8b6cf05cd100f2396b80d13c3f668c6bba65c983f48');
  // The superseded draft lacked the catalog fingerprint guards; this file carries
  // both constants, so it cannot be that draft.
  assert.ok(CP4D_SQL.includes("k_pool_fp      CONSTANT text := 'a0afad4c9d6badf377a15afee96168ea';"));
  assert.ok(CP4D_SQL.includes("k_forbidden_fp CONSTANT text := '4a50ecd4b343cb0a414bf1ede1b1ab83';"));
});

test('CP4d: both catalog fingerprints are checked before classification and again after the write', () => {
  const at = (s) => CP4D_SQL.indexOf(s);
  const lockIdx = at('PERFORM 1 FROM public.exercises WHERE id = ANY (k_pool || k_forbidden) ORDER BY id FOR SHARE;');
  const classifyIdx = at('---------------------------------------------------------- CLASSIFY');
  const writeIdx = at('------------------------------------------------------------- WRITE');
  const postIdx = at('---------------------------------------------------- POSTCONDITIONS');
  assert.ok(lockIdx > 0 && lockIdx < classifyIdx && classifyIdx < writeIdx && writeIdx < postIdx);
  assert.match(CP4D_SQL, /IF v_n <> 52 OR cardinality\(k_pool \|\| k_forbidden\) <> 52 THEN/);
  for (const k of ['k_pool_fp', 'k_forbidden_fp']) {
    const uses = [];
    let i = -1;
    while ((i = CP4D_SQL.indexOf('IS DISTINCT FROM ' + k, i + 1)) !== -1) uses.push(i);
    assert.equal(uses.length, 2, k + ' is compared exactly twice');
    assert.ok(uses[0] > lockIdx && uses[0] < classifyIdx, k + ': checked after the lock, before classification');
    assert.ok(uses[1] > postIdx, k + ': checked again in the postconditions');
  }
  // The 159-row count and id checksum guards remain alongside the fingerprints.
  assert.match(CP4D_SQL, /k_cat_n {5}CONSTANT int {2}:= 159;/);
  assert.match(CP4D_SQL, /k_cat_md5 {3}CONSTANT text := 'dec5ac379151ad7d0f6463820dc76dc8';/);
});

test('CP4d: the migration only inserts — no UPDATE, DELETE, DDL or schedule change', () => {
  assert.equal((CP4D_CODE.match(/\bINSERT\s+INTO\b/gi) || []).length, 2);
  assert.match(CP4D_CODE, /INSERT INTO public\.workout_templates\b/);
  assert.match(CP4D_CODE, /INSERT INTO public\.program_routines\b/);
  for (const kw of ['UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMENT ON', 'LOCK TABLE']) {
    assert.ok(!new RegExp('\\b' + kw.replace(' ', '\\s+') + '\\b', 'i').test(CP4D_CODE), kw + ' is absent');
  }
  // Schedules live in schedules.js; the migration cannot and does not touch them.
  assert.ok(!/schedule/i.test(CP4D_CODE));
});

test('CP4d: nothing is published — every new Routine is inserted private', () => {
  const insert = CP4D_SQL.slice(CP4D_SQL.indexOf('INSERT INTO public.workout_templates'),
    CP4D_SQL.indexOf('GET DIAGNOSTICS'));
  assert.match(insert, /SELECT r\.id, v_owner, r\.name, r\.exercises, NULL, 0, NULL, 0,\s+NULL, 'muscle', NULL, '\{\}'::text\[\], true, 'private', NULL/);
  assert.ok(!/published/.test(insert), 'the insert never writes published');
  // Every 'published' literal is a read-side comparison against existing rows
  // (`= 'published'` in a WHERE/FILTER), never an assignment or inserted value.
  const lits = CP4D_SQL.match(/.{0,40}'published'/g) || [];
  assert.ok(lits.length > 0);
  lits.forEach((s) => assert.match(s, /(status|visibility) = 'published'$/, 'read-side only: ' + s));
  // Owner and neutral metadata, as the exact-record predicate requires them.
  assert.match(CP4D_SQL, /AND t\.is_platform AND t\.visibility = 'private' AND t\.goal = 'muscle'\n\s+AND t\.sort_order = 0 AND t\.tags = '\{\}'::text\[\] AND t\.times_used = 0\n\s+AND t\.description IS NULL AND t\.difficulty IS NULL AND t\.source_program_slug IS NULL\n\s+AND t\.source_workout_id IS NULL AND t\.last_used_at IS NULL;/);
  // The owner is derived from Full Body A/B/C, never written as an account id.
  assert.match(CP4D_SQL, /SELECT count\(DISTINCT user_id\), min\(user_id::text\)::uuid INTO v_n, v_owner\n\s+FROM public\.workout_templates WHERE id IN \(k_routine_a, k_routine_b, k_routine_c\);/);
});

test('CP4d: the migration records equal the repository mirror exactly', () => {
  assert.deepStrictEqual(sqlKNew(), CP4D_ROUTINES);
});

test('CP4d: the mirror hashes exactly as production stores each new Routine', () => {
  // md5(workout_templates.exercises::text), read from production after the apply.
  const PROD = {
    push_core_a: '1fd033cb535f92f49efb299694e9efc7',
    lower_a: 'cc6c42773382618ddaf5948f3f637249',
    conditioning_core: '4da538974f36e1dfc0ed7b1946a49ec6',
    push_core_b: '1204717d06d7387b716e23d575b99c04',
    lower_b: 'a8d01e5178027dd0fbe4e23574c072c2',
    mobility_recovery: '4fab45bb31c74309b62cbba170cdd69c',
  };
  CP4D_ROUTINES.forEach((r) => assert.equal(pgMd5(r.exercises), PROD[r.session_key], r.name));
});

test('CP4d: ids, names, session keys and sort orders', () => {
  assert.deepEqual(CP4D_ROUTINES.map((r) => [r.sort_order, r.session_key, r.name]), [
    [4, 'push_core_a', 'Push & Core A'],
    [5, 'lower_a', 'Lower Body A'],
    [6, 'conditioning_core', 'Conditioning & Core'],
    [7, 'push_core_b', 'Push & Core B'],
    [8, 'lower_b', 'Lower Body B'],
    [9, 'mobility_recovery', 'Mobility & Recovery'],
  ]);
  // Deterministic ids: UUIDv5 under the Program id, so a replay can never mint new ones.
  const v5 = (name) => {
    const ns = Buffer.from(PROGRAM.id.replace(/-/g, ''), 'hex');
    const h = require('node:crypto').createHash('sha1').update(Buffer.concat([ns, Buffer.from(name)])).digest();
    h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString('hex');
    return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join('-');
  };
  CP4D_ROUTINES.forEach((r) => {
    assert.equal(r.id, v5('mm:bodyweight_foundations:routine:' + r.session_key), r.name + ' routine id');
    assert.equal(r.link_id, v5('mm:bodyweight_foundations:link:' + r.session_key), r.name + ' link id');
  });
  const ids = [PROGRAM.id].concat(ROUTINES.map((r) => r.id), LINKS.map((l) => l.id),
    CP4D_ROUTINES.map((r) => r.id), CP4D_ROUTINES.map((r) => r.link_id));
  assert.equal(new Set(ids).size, 19, 'every Program, Routine and link id is distinct');
});

test('CP4d: Bodyweight Foundations has exactly nine ordered links, A/B/C first', () => {
  const nine = LINKS.map((l) => [l.sort_order, l.session_key])
    .concat(CP4D_ROUTINES.map((r) => [r.sort_order, r.session_key]));
  assert.deepEqual(nine.map((x) => x[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(nine.map((x) => x[1]),
    ['full_a', 'full_b', 'full_c'].concat(CP4D_KEYS));
  // The migration asserts the same order as a postcondition.
  assert.ok(CP4D_SQL.includes("<> ARRAY['full_a','full_b','full_c'] || k_keys THEN"));
  assert.deepEqual(sqlKNew().map((r) => r.sort_order), [4, 5, 6, 7, 8, 9]);
});

test('CP4d: A/B/C stay at 1–3, published and byte-identical to the CP4c state', () => {
  // The migration refuses to run unless A/B/C hash as CP4c left them, published,
  // and re-checks them after the insert. Those constants are the mirror's hashes.
  assert.ok(CP4D_SQL.includes("k_md5_a     CONSTANT text := '" + pgMd5(ROUTINE_A.exercises) + "';"));
  assert.ok(CP4D_SQL.includes("k_md5_b     CONSTANT text := '" + pgMd5(ROUTINE_B.exercises) + "';"));
  assert.ok(CP4D_SQL.includes("k_md5_c     CONSTANT text := '" + pgMd5(ROUTINE_C.exercises) + "';"));
  assert.match(CP4D_SQL, /WHERE is_platform AND visibility = 'published' AND \(\n\s+\(id = k_routine_a AND name = 'Full Body A'/);
  LINKS.forEach((l) => {
    assert.ok(CP4D_SQL.includes("(id = k_link_" + l.session_key.slice(-1) + " AND session_key = '" + l.session_key +
      "' AND routine_id = k_routine_" + l.session_key.slice(-1) + " AND sort_order = " + l.sort_order + ')'), l.session_key);
  });
});

test('CP4d: until CP4e, every frequency 2–6 resolves only A/B/C', () => {
  const S = loadSchedules();
  for (let d = 2; d <= 6; d++) {
    const keys = S.getScheduleForDays('bodyweight_foundations', d);
    assert.deepEqual(keys, ['full_a', 'full_b', 'full_c'], 'days=' + d);
    assert.ok(!keys.some((k) => CP4D_KEYS.includes(k)), 'no draft at days=' + d);
  }
  assert.deepEqual(S.getAllSessionsForProgram('bodyweight_foundations'), ['full_a', 'full_b', 'full_c']);
  // No new key has a session label yet, so nothing can name a draft on Home either.
  CP4D_KEYS.filter((k) => k !== 'lower_a' && k !== 'lower_b')
    .forEach((k) => assert.equal(S.SESSION_LABELS[k], undefined, k));
});

/* The content rules run on BOTH the repository mirror and the migration's own
 * k_new, so a defect in the applied records fails a specific rule, not only the
 * file hash and the mirror-equality test. */
const CP4D_SOURCES = [['repository mirror', CP4D_ROUTINES], ['migration k_new', sqlKNew()]];

for (const [source, routines] of CP4D_SOURCES) {
  const entries = routines.reduce((a, r) => a.concat(r.exercises), []);

  test('CP4d: 31 entries, every one from the reviewed equipment-free pool (' + source + ')', () => {
    assert.deepEqual(routines.map((r) => r.exercises.length), [5, 5, 5, 5, 5, 6]);
    assert.equal(entries.length, 31);
    // The pool and exclusions in the repository are exactly the migration's.
    assert.deepEqual(sqlArray('k_pool'), CP4D_POOL.map((x) => x[1]));
    assert.deepEqual(sqlArray('k_forbidden'), CP4D_FORBIDDEN.map((x) => x[1]));
    assert.equal(POOL_IDS.size, 38);
    assert.equal(FORBIDDEN_IDS.size, 14);
    CP4D_POOL.concat(CP4D_FORBIDDEN).forEach(([name, id]) => {
      assert.ok(!(POOL_IDS.has(id) && FORBIDDEN_IDS.has(id)), name + ' is in only one list');
      assert.equal(byId(id) && byId(id).name, name, name + ' has the reviewed id');
    });
    CP4D_POOL.forEach(([name, id]) => assert.equal(byId(id).equipment, 'Bodyweight', name));
    entries.forEach((x) => {
      assert.ok(POOL_IDS.has(x.exercise_id), x.name + ' is in the pool');
      assert.ok(!FORBIDDEN_IDS.has(x.exercise_id), x.name + ' is not excluded');
      assert.equal(byId(x.exercise_id).name, x.name, x.name + ' is its canonical name');
      assert.deepEqual(rtNormalizeExercises([x]), [x], x.name + ' survives the normaliser');
    });
  });

  test('CP4d: High Knees replaced Mountain Climber in Conditioning & Core (' + source + ')', () => {
    const cond = routines.find((r) => r.session_key === 'conditioning_core');
    assert.deepEqual(cond.exercises[2], {
      name: 'High Knees', sets: 3, reps_low: 20, reps_high: 30, notes: NOTE_HIGH_KNEES,
      rest_sec: 45, exercise_id: '6d50c3a6-0dde-46e4-bc3a-508c2f358803',
    });
    assert.equal(byId(cond.exercises[2].exercise_id).tracking_type, 'time', '20–30 is seconds');
    entries.forEach((x) => {
      assert.notEqual(x.exercise_id, EX.MOUNTAIN_CLIMBER, 'no Mountain Climber');
      assert.notEqual(x.name, 'Mountain Climber');
    });
    // The migration refuses Mountain Climber on its own, by id.
    assert.ok(CP4D_SQL.includes("k_climber   CONSTANT uuid := '" + EX.MOUNTAIN_CLIMBER + "';"));
    assert.match(CP4D_SQL, /OR \(e->>'exercise_id'\)::uuid = k_climber/);
  });

  test('CP4d: Mobility & Recovery contains only the approved mobility work (' + source + ')', () => {
    const mob = routines.find((r) => r.session_key === 'mobility_recovery');
    assert.deepEqual(mob.exercises.map((x) => x.name), ['Cat-Cow', 'Quadruped Thoracic Rotation',
      '90/90 Hip Rotation', 'Supine Hamstring Stretch', 'Supine Spinal Twist', 'Diaphragmatic Breathing']);
    mob.exercises.forEach((x) => {
      const row = byId(x.exercise_id);
      assert.equal(row.movement_pattern, 'mobility', x.name);
      assert.equal(row.tracking_type, 'time', x.name);
    });
  });

  test('CP4d: timed work is prescribed in seconds and rep work in reps (' + source + ')', () => {
    entries.forEach((x) => {
      const row = byId(x.exercise_id);
      assert.ok(['time', 'bodyweight_reps'].includes(row.tracking_type), x.name + ' has a supported tracking type');
      if (row.tracking_type === 'time') {
        assert.equal(row.default_unit, 'sec', x.name);
        assert.match(x.notes, /seconds/, x.name + ' says its target is seconds');
        assert.ok(!/\breps?\b/i.test(x.notes), x.name + ' never calls its target reps');
      } else {
        assert.ok(!/seconds/.test(x.notes), x.name + ' is not described in seconds');
      }
      if (row.is_unilateral) assert.match(x.notes, /per (leg|side)/, x.name + ' says per leg/side');
      assert.ok(x.notes.length <= 140 && x.notes === x.notes.trim(), x.name + ' note shape');
    });
    // Bodyweight Squat keeps the CP4c rule: no guidance.
    entries.filter((x) => x.exercise_id === EX.BODYWEIGHT_SQUAT)
      .forEach((x) => assert.equal(x.notes, ''));
  });

  test('CP4d: no Pull day — Superman is posterior-chain work only (' + source + ')', () => {
    routines.forEach((r) => {
      assert.ok(!/pull/i.test(r.name + ' ' + r.session_key), r.name + ' does not describe a Pull session');
    });
    entries.forEach((x) => {
      const row = byId(x.exercise_id);
      assert.ok(!/pull/.test(row.movement_pattern), x.name + ' is not a pulling movement');
      if (x.exercise_id !== EX.SUPERMAN) assert.ok(!/pull|\brows?\b/i.test(x.notes), x.name + ' note has no pull wording');
    });
    const supermen = entries.filter((x) => x.exercise_id === EX.SUPERMAN);
    assert.equal(supermen.length, 1);
    assert.equal(supermen[0].notes, NOTE_SUPERMAN, 'the only pull wording is the denial');
    assert.equal(byId(EX.SUPERMAN).movement_pattern, 'hinge');
    // Every forbidden pulling exercise stays out.
    ['Inverted Row', 'Pull-Up', 'Chin-Up'].forEach((n) =>
      assert.ok(!entries.some((x) => x.name === n), n + ' is absent'));
  });
}

test('CP4d: the README documents the migration and its count matches the directory', () => {
  const readme = read('supabase/README.md');
  const files = fs.readdirSync(path.join(__dirname, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
  // The exact directory count and guarded-migration count are pinned by the
  // NEWEST migration record (CP4e-1 below), since each new migration moves them.
  assert.ok(files.includes(path.basename(CP4D_FILE)));
  assert.match(readme, new RegExp('The ' + files.length + ' migrations applied to production'));
  assert.match(readme, /`20261003000515` \(`phase_439b_cp4d_bodyweight_frequency_routines`\)/);
  assert.match(readme, /guarded \*\*data\*\* migrations[\s\S]*?`20261003000515`[\s\S]*?\n\n/);
  assert.match(readme, /publishes nothing and changes\s+no schedule mapping/);
});

/* ── Phase 4.3.9B CP4e-1 — publish the six frequency Routines (migration 20261005041336)
 * The ONLY change is visibility 'private' -> 'published' on the six CP4d Routines.
 * No schedule maps them yet (CP4e-2), so every frequency still runs A/B/C. */

const CP4E1_FILE = 'supabase/migrations/20261005041336_phase_439b_cp4e_publish_bodyweight_frequency_routines.sql';
const CP4E1_SQL = read(CP4E1_FILE);
const CP6_VALIDATION_ROUTINE = '07548bd8-bb30-4a31-93fe-eb66ba6ff187';
// Executable SQL only: comments, the $six$ payload and string literals removed.
const CP4E1_CODE = CP4E1_SQL
  .replace(/--[^\n]*/g, '')
  .replace(/\$six\$[\s\S]*?\$six\$/g, "''")
  .replace(/'[^']*'/g, "''");
const cp4e1Six = () => {
  const m = CP4E1_SQL.match(/k_six CONSTANT jsonb := \$six\$([\s\S]*?)\$six\$::jsonb;/);
  assert.ok(m, 'k_six is declared');
  return JSON.parse(m[1]);
};
const cp4e1Pool = () => {
  const m = CP4E1_SQL.match(/\bk_pool {6}CONSTANT uuid\[\] := ARRAY\[([^\]]*)\]::uuid\[\];/);
  assert.ok(m, 'k_pool is declared');
  return m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
};

test('CP4e-1: the repository records byte-for-byte the statement stored in production', () => {
  const raw = fs.readFileSync(path.join(__dirname, CP4E1_FILE));
  // sha256 of supabase_migrations.schema_migrations.statements[1] for version
  // 20261005041336, read from production after the apply.
  assert.equal(sha256(raw), 'fd29293cc480325692792a73526fe7d9a53a4412412af00adefa063444970432');
  assert.equal(raw.length, 19058);
  // Supabase stores the reviewed file without its final newline; restoring it
  // gives the hash of the artifact the owner approved before the apply.
  assert.ok(!raw.toString('utf8').endsWith('\n'));
  assert.equal(sha256(Buffer.concat([raw, Buffer.from('\n')])),
    'bfcbb6e734b04eac2d2ca4e8d72bd6dac134be43438d89a0096eba17f5a10576');
});

test('CP4e-1: it targets exactly the six CP4d Routines, with their production content hashes', () => {
  // Each record is the CP4d mirror's identity plus md5(exercises::text), so a
  // wrong id, key, sort slot or content fingerprint cannot be published.
  assert.deepStrictEqual(cp4e1Six(), CP4D_ROUTINES.map((r) => ({
    id: r.id, link_id: r.link_id, session_key: r.session_key, sort_order: r.sort_order,
    name: r.name, md5: pgMd5(r.exercises),
  })));
  assert.equal(new Set(cp4e1Six().map((r) => r.id)).size, 6);
  // The unrelated private CP6 validation Routine is never named, so it cannot be targeted.
  assert.ok(!CP4E1_SQL.includes(CP6_VALIDATION_ROUTINE));
  // Neither are Full Body A/B/C as write targets: they appear only as read-side guards.
  ROUTINES.forEach((r) => assert.ok(!cp4e1Six().some((x) => x.id === r.id), r.name + ' is not targeted'));
});

test('CP4e-1: the only write is one UPDATE that sets visibility to published on the six', () => {
  const updates = CP4E1_CODE.match(/\bUPDATE\s+public\.\w+[\s\S]*?;/gi) || [];
  assert.equal(updates.length, 1, 'exactly one UPDATE statement');
  // Read from the raw SQL so the literals are visible.
  const upd = CP4E1_SQL.match(/UPDATE public\.workout_templates SET ([^\n]*)\n\s+WHERE ([^;]*);/);
  assert.ok(upd, 'the UPDATE targets workout_templates');
  assert.equal(upd[1], "visibility = 'published'", 'it sets visibility and nothing else');
  assert.match(upd[2], /^id IN \(SELECT \(r->>'id'\)::uuid FROM jsonb_array_elements\(k_six\) r\)\n\s+AND is_platform AND visibility = 'private'$/);
  assert.match(CP4E1_SQL, /GET DIAGNOSTICS v_upd = ROW_COUNT;\n\s+IF v_upd <> 6 THEN/);
  // The only other UPDATE keyword is the row lock on the same six.
  assert.equal((CP4E1_CODE.match(/\bFOR\s+UPDATE\b/gi) || []).length, 1);
  assert.equal((CP4E1_CODE.match(/\bUPDATE\b/gi) || []).length, 2);
});

test('CP4e-1: no INSERT, DELETE, DDL, link write or schedule change', () => {
  for (const kw of ['INSERT', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMENT ON', 'LOCK TABLE']) {
    assert.ok(!new RegExp('\\b' + kw.replace(' ', '\\s+') + '\\b', 'i').test(CP4E1_CODE), kw + ' is absent');
  }
  assert.ok(!/UPDATE\s+public\.(program_routines|programs|exercises)\b/i.test(CP4E1_CODE), 'no link, Program or catalog write');
  assert.ok(!/updated_at\s*=/i.test(CP4E1_CODE), 'no updated_at write');
  assert.ok(!/schedule/i.test(CP4E1_CODE));
});

test('CP4e-1: FRESH publishes, REPLAY is a verified no-op, anything else aborts', () => {
  assert.match(CP4E1_SQL, /IF v_exact = 6 AND v_priv6 = 6 AND v_plat = 57 AND v_pub = 50 AND v_priv = 7 AND v_links = 56 THEN\n\s+v_state := 'FRESH';/);
  assert.match(CP4E1_SQL, /ELSIF v_exact = 6 AND v_pub6 = 6 AND v_plat = 57 AND v_pub = 56 AND v_priv = 1 AND v_links = 56 THEN\n\s+v_state := 'REPLAY';/);
  assert.match(CP4E1_SQL, /ELSE\n\s+RAISE EXCEPTION 'cp4e aborted \(DIVERGED\)/);
  assert.match(CP4E1_SQL, /IF v_state = 'FRESH' THEN\n\s+UPDATE public\.workout_templates/, 'only FRESH writes');
  assert.match(CP4E1_SQL, /IF v_plat <> 57 OR v_pub <> 56 OR v_priv <> 1 OR v_links <> 56 THEN/, 'post totals');
});

test('CP4e-1: unrelated Routines, links and every non-visibility field are fingerprinted', () => {
  const at = (x) => CP4E1_SQL.indexOf(x);
  const writeIdx = at('------------------------------------------------------------- WRITE');
  const postIdx = at('---------------------------------------------------- POSTCONDITIONS');
  assert.ok(writeIdx > 0 && postIdx > writeIdx);
  // Every other platform Routine (including the private CP6 validation one).
  assert.match(CP4E1_SQL, /INTO b_other_fp\n\s+FROM public\.workout_templates t\n\s+WHERE t\.is_platform AND t\.id NOT IN \(SELECT \(r->>'id'\)::uuid FROM jsonb_array_elements\(k_six\) r\);/);
  // Every link.
  assert.match(CP4E1_SQL, /INTO b_links_fp\n\s+FROM public\.program_routines l;/);
  // The six themselves with only visibility removed.
  assert.match(CP4E1_SQL, /md5\(string_agg\(\(to_jsonb\(t\) - 'visibility'\)::text, '\|' ORDER BY t\.id::text COLLATE "C"\)\) INTO b_six_fp/);
  for (const fp of ['b_other_fp', 'b_links_fp', 'b_six_fp']) {
    const i = CP4E1_SQL.indexOf('IS DISTINCT FROM ' + fp);
    assert.ok(i > postIdx, fp + ' is re-checked after the write');
  }
  // Write scope: only the six carry this transaction's xmin; no other table is touched.
  assert.match(CP4E1_SQL, /IF v_state = 'FRESH' THEN v_m := 6; ELSE v_m := 0; END IF;/);
  ['programs', 'program_routines', 'exercises', 'user_programs', 'workouts', 'workout_exercises',
   'workout_sets', 'personal_records', 'purchases', 'profiles'].forEach((t) =>
    assert.ok(CP4E1_SQL.includes('FROM public.' + t + ' WHERE xmin = v_xid'), t + ' write-scope checked'));
});

test('CP4e-1: the guards pin the same approved state CP4d left', () => {
  // Same pool, same pool fingerprint, same catalog, same Program row and A/B/C content.
  assert.deepStrictEqual(cp4e1Pool(), CP4D_POOL.map((x) => x[1]));
  assert.ok(CP4E1_SQL.includes("k_pool_fp   CONSTANT text := 'a0afad4c9d6badf377a15afee96168ea';"));
  assert.match(CP4E1_SQL, /k_cat_n {5}CONSTANT int {2}:= 159;/);
  assert.ok(CP4E1_SQL.includes("k_cat_md5   CONSTANT text := 'dec5ac379151ad7d0f6463820dc76dc8';"));
  assert.ok(CP4E1_SQL.includes("k_program_md5 CONSTANT text := '54f16021713151bdf654eeed5ac76115';"));
  assert.ok(CP4E1_SQL.includes("k_md5_a     CONSTANT text := '" + pgMd5(ROUTINE_A.exercises) + "';"));
  assert.ok(CP4E1_SQL.includes("k_md5_b     CONSTANT text := '" + pgMd5(ROUTINE_B.exercises) + "';"));
  assert.ok(CP4E1_SQL.includes("k_md5_c     CONSTANT text := '" + pgMd5(ROUTINE_C.exercises) + "';"));
  // All nine links, in order, must exist before anything is published.
  assert.ok(CP4E1_SQL.includes("k_keys      CONSTANT text[] := ARRAY['full_a','full_b','full_c'," +
    CP4D_KEYS.map((k) => "'" + k + "'").join(',') + '];'));
  // And every exercise the six prescribe must be in the pool.
  assert.match(CP4E1_SQL, /AND \(e->>'exercise_id' IS NULL OR NOT \(\(e->>'exercise_id'\)::uuid = ANY \(k_pool\)\)\);/);
});

test('CP4e-1: publishing activates no schedule — every frequency still resolves only A/B/C', () => {
  const S = loadSchedules();
  for (let d = 2; d <= 6; d++) {
    assert.deepEqual(S.getScheduleForDays('bodyweight_foundations', d), ['full_a', 'full_b', 'full_c'], 'days=' + d);
  }
});

test('CP4e-1: the README records the migration and the current counts', () => {
  const readme = read('supabase/README.md');
  const files = fs.readdirSync(path.join(__dirname, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
  assert.equal(files.length, 68);
  assert.ok(files.includes(path.basename(CP4E1_FILE)));
  assert.match(readme, new RegExp('The ' + files.length + ' migrations applied to production'));
  assert.match(readme, /nine migrations are guarded \*\*data\*\* migrations/);
  assert.match(readme, /`20261003000515`, `20261005041336`\./);
  assert.match(readme, /`20261005041336` \(`phase_439b_cp4e_publish_bodyweight_frequency_routines`\) publishes exactly/);
  assert.match(readme, /changes no schedule mapping/);
});
