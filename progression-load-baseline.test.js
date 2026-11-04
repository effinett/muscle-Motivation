/* Phase 4.3.9B — weighted baselines survive bodyweight sessions, blank weights
 * and skipped exercises (owner request 2026-11-03).
 * ──────────────────────────────────────────────────────────────────────────
 * Before: analyze() always progressed from the NEWEST session. One bodyweight
 * Reverse Lunge in Bodyweight Foundations, one set of blank weights or one
 * skipped exercise replaced months of weighted progression, and a 0 lb
 * bodyweight entry could earn a "+5 lb" jump.
 *
 * After: the caller passes a catalog-derived `load` policy and analyze() picks
 * the reference session from history (Progression.referenceHistory). Callers
 * that pass no policy are byte-identical to before.
 *
 * Runs the REAL progression.js and the REAL workout.html / workout-complete.html
 * functions in a vm sandbox. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Progression = require('./progression.js');
const ExerciseFilters = require('./exercise-filters.js');

const WORKOUT = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');
const COMPLETE = fs.readFileSync(path.join(__dirname, 'workout-complete.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'defines ' + name + '()');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* Production catalog rows (2026-11-03 read). */
const LIB = [
  { id: 'rlunge', name: 'Reverse Lunge',       tracking_type: 'bodyweight_reps', is_bodyweight: true  },
  { id: 'bridge', name: 'Glute Bridge',        tracking_type: 'bodyweight_reps', is_bodyweight: true  },
  { id: 'pushup', name: 'Push-Up',             tracking_type: 'bodyweight_reps', is_bodyweight: true  },
  { id: 'plank',  name: 'Plank',               tracking_type: 'time',            is_bodyweight: true  },
  { id: 'bench',  name: 'Bench Press',         tracking_type: 'weight_reps',     is_bodyweight: false },
  { id: 'calf',   name: 'Standing Calf Raise', tracking_type: 'weight_reps',     is_bodyweight: false },
];

const FNS = ['catalogRowForExercise', 'trackingTypeForExercise', 'unitForExercise',
  'unitColumnLabel', 'unitPlaceholder', 'hasSavedWeight', 'isNoLoadExercise',
  'workoutEquipmentFree', 'equipmentFreeSlug', 'loadPolicyForExercise', 'recForExercise',
  'buildRecBlock', 'buildExCard'];
const VARS = [/var NO_LOAD_TRACKING = \{[^}]*\};/, /var EQUIPMENT_FREE_PROGRAMS_IF_UNLOADED = \{[^}]*\};/];

function workoutSandbox(slug) {
  const sandbox = {
    Progression, ExerciseFilters, exerciseLibrary: LIB,
    currentWorkout: { id: 'w1', program_slug: slug, mode: 'program' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  };
  vm.createContext(sandbox);
  const vars = VARS.map((re) => WORKOUT.match(re)[0]);
  vm.runInContext(vars.join('\n') + '\n' + FNS.map((n) => extractFn(WORKOUT, n)).join('\n') +
    '\nthis.__fns = {' + FNS.join(',') + '};', sandbox);
  return sandbox.__fns;
}

const GYM = workoutSandbox('muscle_gain');
const MANUAL = workoutSandbox(null);
const BWF = workoutSandbox('bodyweight_foundations');

let nextId = 1;
function ex(id, history, opts) {
  const o = opts || {};
  const row = LIB.find((r) => r.id === id);
  return {
    id: 'we' + (nextId++), exercise_id: o.custom ? null : id, name: o.name || (row ? row.name : id),
    reps_low: o.low || 8, reps_high: o.high || 12, target_sets: 3, history,
    sets: [1, 2, 3].map((n) => ({ id: 's' + (nextId++), set_number: n, weight_lbs: null, reps: null, completed: false })),
  };
}

// A session (newest-first history entry). w = weight per set (null = blank).
const session = (w, reps, extra) => Object.assign({
  date: '2026-10-01',
  sets: reps.map((r) => ({ weight: w, reps: r, completed: r != null })),
}, extra || {});
const bwf = (reps) => session(null, reps, { equipmentFree: true });   // logged in Bodyweight Foundations
const hasWeightInput = (html) => /placeholder="lbs"/.test(html);
const WEIGHT_TALK = /pick a weight|increasing weight|add weight|add load|this weight|\blb\b/i;

/* ── 1 · Weighted → Bodyweight Foundations → weighted ───────────────────── */

test('case 1: a Bodyweight Foundations session never replaces the weighted Reverse Lunge baseline', () => {
  const history = [bwf([12, 12, 12]), session(25, [12, 12, 12])];

  // The bug, reproduced: without a policy the bodyweight session wins.
  const legacy = Progression.analyze({ exerciseName: 'Reverse Lunge', repsLow: 8, repsHigh: 12, targetSets: 3, history });
  assert.equal(legacy.recommendedWeight, null, 'legacy lost the 25 lb baseline');

  // Fixed, in a gym program and in a manual workout.
  [GYM, MANUAL].forEach((W) => {
    const rec = W.recForExercise(ex('rlunge', history));
    assert.equal(rec.action, 'increase');
    assert.equal(rec.recommendedWeight, 30, 'progresses from the 25 lb session');
    assert.equal(rec.lastPerformance.weight, 25);
    assert.ok(hasWeightInput(W.buildExCard(ex('rlunge', history), 0)));
  });

  // Inside Bodyweight Foundations the same history gives bodyweight guidance.
  const inBwf = BWF.recForExercise(ex('rlunge', history));
  assert.equal(inBwf.recommendedWeight, null);
  assert.ok(!WEIGHT_TALK.test(inBwf.coachNote), inBwf.coachNote);
  assert.ok(!hasWeightInput(BWF.buildExCard(ex('rlunge', history), 0)), 'no weight input in BWF');
});

test('case 1: a Bodyweight Foundations session with 0 lb typed in (pre-fix screen) is still not a gym baseline', () => {
  const history = [session(0, [12, 12, 12], { equipmentFree: true }), session(25, [12, 12, 12])];
  [GYM, MANUAL].forEach((W) => assert.equal(W.recForExercise(ex('rlunge', history)).recommendedWeight, 30));
  // A 0 lb gym session, by contrast, is the user's own choice and does count.
  assert.equal(GYM.recForExercise(ex('rlunge', [session(0, [12, 12, 12]), session(25, [12, 12, 12])])).recommendedWeight, null);
});

test('case 1: the newer weighted session takes over again once it is logged', () => {
  const history = [session(30, [10, 10, 10]), bwf([15, 15, 15]), session(25, [12, 12, 12])];
  const rec = GYM.recForExercise(ex('rlunge', history));
  assert.equal(rec.lastPerformance.weight, 30);
  assert.equal(rec.recommendedWeight, 30);
  assert.equal(rec.action, 'hold');
});

test('case 1: Bodyweight Foundations progresses from bodyweight sessions only, never weighted ones', () => {
  const history = [session(25, [12, 12, 12]), bwf([10, 10, 10])];
  const rec = BWF.recForExercise(ex('rlunge', history));
  assert.equal(rec.lastPerformance.weight, null);
  assert.deepEqual(rec.lastPerformance.reps, [10, 10, 10], 'reps come from the bodyweight session');
  // With only weighted history there is nothing comparable: a clean start, no weight.
  const fresh = BWF.recForExercise(ex('rlunge', [session(25, [12, 12, 12])]));
  assert.equal(fresh.action, 'start');
  assert.equal(fresh.recommendedWeight, null);
  assert.ok(!WEIGHT_TALK.test(fresh.coachNote), fresh.coachNote);
});

/* ── 2 · Blank weight ───────────────────────────────────────────────────── */

test('case 2: blank weight on a weighted lift keeps the previous weighted guidance', () => {
  const history = [session(null, [8, 8, 8]), session(100, [12, 12, 12])];
  const rec = GYM.recForExercise(ex('bench', history));
  assert.equal(rec.recommendedWeight, 105);
  assert.equal(rec.action, 'increase');
  const legacy = Progression.analyze({ exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3, history });
  assert.equal(legacy.recommendedWeight, null, 'legacy treated the blank session as bodyweight');
});

test('case 2: blank weight on a bodyweight-capable exercise keeps the weighted guidance too', () => {
  const history = [session(null, [12, 12, 12]), session(25, [10, 10, 10])];
  assert.equal(GYM.recForExercise(ex('rlunge', history)).recommendedWeight, 25);
});

test('case 2: blanks never turn a weighted lift into bodyweight, even with no weighted history', () => {
  const e = ex('bench', [session(null, [10, 10, 10])]);
  const rec = GYM.recForExercise(e);
  assert.equal(rec.action, 'start');
  assert.equal(rec.recommendedWeight, null);
  assert.match(rec.coachNote, /Pick a weight you can do for 8–12 reps/);
  const block = GYM.buildRecBlock(e, 0);
  assert.ok(!/BW/.test(block), 'the card never labels it bodyweight');
  assert.match(block, /No previous data yet/);
});

test('case 2: someone who always logs a bodyweight-capable exercise blank still gets rep guidance', () => {
  const rec = GYM.recForExercise(ex('pushup', [session(null, [12, 12, 12]), session(null, [10, 10, 10])]));
  assert.equal(rec.recommendedWeight, null);
  assert.deepEqual(rec.lastPerformance.reps, [12, 12, 12]);
  assert.equal(rec.action, 'increase');
});

test('case 2: blank is still saved as null, never 0', () => {
  const ExerciseLog = require('./exercise-log.js');
  assert.deepEqual(ExerciseLog.sanitizeSetField('weight_lbs', ''), { value: null, valid: true });
  assert.deepEqual(ExerciseLog.sanitizeSetField('weight_lbs', '0'), { value: 0, valid: true });
});

/* ── 3 · Skipped exercise / incomplete sets ─────────────────────────────── */

test('case 3: a skipped exercise (sets created, nothing logged) keeps the previous guidance', () => {
  const skipped = { date: '2026-10-05', sets: [1, 2, 3].map(() => ({ weight: 105, reps: null, completed: false })) };
  const history = [skipped, session(100, [12, 12, 12])];
  const legacy = Progression.analyze({ exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3, history });
  assert.equal(legacy.action, 'start', 'legacy reset to "first time"');
  const rec = GYM.recForExercise(ex('bench', history));
  assert.equal(rec.action, 'increase');
  assert.equal(rec.recommendedWeight, 105);
  // Same for Bodyweight Foundations.
  const bwSkip = [{ date: 'x', equipmentFree: true, sets: [{ weight: null, reps: null, completed: false }] }, bwf([10, 10, 10])];
  assert.deepEqual(BWF.recForExercise(ex('bridge', bwSkip)).lastPerformance.reps, [10, 10, 10]);
});

test('case 3: incomplete sets keep the weight (existing "incomplete" rule), never resetting guidance', () => {
  const partial = session(105, [8, null, null]);
  const rec = GYM.recForExercise(ex('bench', [partial, session(100, [12, 12, 12])]));
  assert.equal(rec.action, 'incomplete');
  assert.equal(rec.recommendedWeight, 105, 'holds the weight the user was working at');
  // An incomplete session with blank weight on a weighted lift falls back instead.
  const blankPartial = session(null, [8, null, null]);
  const rec2 = GYM.recForExercise(ex('bench', [blankPartial, session(100, [12, 12, 12])]));
  assert.equal(rec2.recommendedWeight, 105);
  assert.equal(rec2.action, 'increase');
});

/* ── 4 · Historical 0 lb ────────────────────────────────────────────────── */

test('case 4: 0 lb on a bodyweight exercise never earns "+5 lb"', () => {
  const history = [session(0, [12, 12, 12])];
  const legacy = Progression.analyze({ exerciseName: 'Glute Bridge', repsLow: 8, repsHigh: 12, targetSets: 3, history });
  assert.equal(legacy.recommendedWeight, 5, 'the bug: 0 lb → move up to 5 lb');
  [GYM, MANUAL, BWF].forEach((W) => {
    const rec = W.recForExercise(ex('bridge', history));
    assert.equal(rec.recommendedWeight, null);
    assert.ok(!/5 lb/.test(rec.coachNote), rec.coachNote);
    assert.match(rec.recommendedDisplay, /^BW/);
  });
  assert.ok(!hasWeightInput(BWF.buildExCard(ex('bridge', history), 0)), 'no weight input in BWF');
  // A 0 lb entry made TODAY in Bodyweight Foundations does not keep the input either.
  const today = ex('bridge', []);
  today.sets[0].weight_lbs = 0;
  assert.ok(!hasWeightInput(BWF.buildExCard(today, 0)));
});

test('case 4: an explicit 0 lb is a deliberate bodyweight session and beats an older loaded one', () => {
  const rec = GYM.recForExercise(ex('pushup', [session(0, [15, 15, 15]), session(25, [10, 10, 10])]));
  assert.equal(rec.recommendedWeight, null, 'unlike a blank, 0 lb was a real entry');
});

test('case 4: on a weighted lift 0 lb keeps its stored meaning (bodyweight calf raises are legitimate)', () => {
  const history = [session(0, [12, 12, 12]), session(null, [12, 12, 12])];
  const rec = GYM.recForExercise(ex('calf', history));
  assert.equal(rec.lastPerformance.weight, 0);
  assert.equal(rec.recommendedWeight, 5, 'adding load is the real next step here');
});

test('case 4: custom and unresolved exercises keep their stored 0 lb meaning', () => {
  const history = [session(0, [12, 12, 12])];
  const custom = GYM.recForExercise(ex('mine', history, { custom: true, name: 'Side Leg Lifts' }));
  const legacy = Progression.analyze({ exerciseName: 'Side Leg Lifts', repsLow: 8, repsHigh: 12, targetSets: 3, history, unit: 'unknown' });
  assert.deepEqual(custom, legacy);
});

/* ── 5 · Nothing else moves ─────────────────────────────────────────────── */

const WEIGHTED = [
  [session(100, [12, 12, 12])], [session(100, [9, 9, 9])], [session(100, [10, 9, 9])],
  [session(100, [12, 9, 9])], [session(100, [5, 5, 5])], [session(100, [10])],
  [session(100, [9, 9, 9]), session(100, [9, 9, 9]), session(100, [9, 9, 9]), session(105, [10, 10, 10])],
  [session(80, [6, 6, 6]), session(90, [8, 8, 8]), session(100, [10, 10, 10])],
];

test('case 5: all-weighted history progresses exactly as before under every policy', () => {
  WEIGHTED.forEach((history, i) => {
    ['Bench Press', 'Reverse Lunge', 'Dips', 'My Custom'].forEach((name) => {
      const base = { exerciseName: name, repsLow: 8, repsHigh: 12, targetSets: 3, history, unit: 'reps' };
      const legacy = Progression.analyze(base);
      ['required', 'optional', 'unknown'].forEach((load) => {
        assert.deepEqual(Progression.analyze(Object.assign({ load }, base)), legacy, name + ' ' + load + ' case ' + i);
      });
    });
  });
});

test('case 5: timed guidance still reads in seconds with the policy applied', () => {
  const history = [bwf([30, 30, 30])];
  const rec = BWF.recForExercise(ex('plank', history, { low: 20, high: 40 }));
  assert.equal(rec.coachNote, 'Add 1 sec — aim for 31 sec on every set.');
  assert.equal(rec.recommendedDisplay, 'BW × 31, 31, 31 sec');
  const gym = GYM.recForExercise(ex('plank', [session(null, [30, 30, 30])], { low: 20, high: 40 }));
  assert.ok(!/\breps?\b/.test(gym.coachNote), gym.coachNote);
});

test('case 5: no policy → byte-identical to before (every caller that omits `load`)', () => {
  const mixed = [bwf([12, 12, 12]), { sets: [{ weight: 50, reps: null }] }, session(0, [12, 12, 12]), session(25, [12, 12, 12])];
  const a = Progression.analyze({ exerciseName: 'Reverse Lunge', repsLow: 8, repsHigh: 12, targetSets: 3, history: mixed });
  const b = Progression.analyze({ exerciseName: 'Reverse Lunge', repsLow: 8, repsHigh: 12, targetSets: 3, history: mixed, load: 'bogus' });
  assert.deepEqual(b, a);
  assert.equal(a.lastPerformance.weight, null, 'still the newest session');
});

test('loadPolicy derives from catalog metadata, never the name', () => {
  const P = Progression.loadPolicy;
  assert.equal(P({ noLoad: true, isBodyweight: true, trackingType: 'time' }), 'none');
  assert.equal(P({ isBodyweight: true, trackingType: 'bodyweight_reps' }), 'optional');
  assert.equal(P({ isBodyweight: true, trackingType: 'weighted_bodyweight' }), 'optional');
  assert.equal(P({ isBodyweight: false, trackingType: 'weight_reps' }), 'required');
  assert.equal(P({ isBodyweight: false, trackingType: 'time' }), 'unknown', 'a timed machine is never "required"');
  assert.equal(P({}), 'unknown');
  assert.equal(P(), 'unknown');
});

test('referenceHistory never mutates the stored sessions', () => {
  const history = [session(0, [12, 12, 12]), session(25, [10, 10, 10])];
  const snapshot = JSON.stringify(history);
  Progression.referenceHistory(history, 'optional');
  Progression.referenceHistory(history, 'none');
  assert.equal(JSON.stringify(history), snapshot);
});

/* ── Wiring: both screens mark Bodyweight Foundations sessions ──────────── */

/* ── Deeper baseline: the real loader against a fake database ───────────── */

// A tiny PostgREST stand-in for the three tables loadExerciseHistory reads.
// Workouts are stored newest first, which is the order the real query asks for.
function fakeDb(workouts) {
  const calls = [];
  const rows = {
    workouts: workouts.map((w) => ({ id: w.id, created_at: w.date, program_slug: w.slug || null, completed: true })),
    workout_sets: [],
  };
  workouts.forEach((w) => w.sets.forEach((st, i) => rows.workout_sets.push(Object.assign(
    { workout_exercise_id: 'wex-' + w.id, set_number: i + 1, is_warmup: false }, st))));
  const from = (table) => {
    const q = { table, ins: {}, nots: [], limit: null };
    const b = {
      select: () => b, eq: () => b, order: () => b,
      in: (c, v) => { q.ins[c] = v; return b; },
      not: (c) => { q.nots.push(c); return b; },
      limit: (n) => { q.limit = n; return b; },
      then: (resolve) => {
        calls.push(q);
        let data = rows[table].filter((r) => Object.keys(q.ins).every((c) => q.ins[c].includes(r[c])));
        data = data.filter((r) => q.nots.every((c) => r[c] != null));
        if (q.limit != null) data = data.slice(0, q.limit);
        resolve({ data });
      },
    };
    return b;
  };
  return { supabaseClient: { from }, calls, wexs: workouts.map((w) => ({ id: 'wex-' + w.id, workout_id: w.id })) };
}

function loaderSandbox(slug, db) {
  const sandbox = {
    Progression, ExerciseFilters, exerciseLibrary: LIB, supabaseClient: db.supabaseClient,
    currentUser: { id: 'u1' }, currentWorkout: { id: 'live', program_slug: slug, mode: 'program' },
    loadLoggedMatches: async () => db.wexs,
    esc: (x) => String(x),
  };
  vm.createContext(sandbox);
  const vars = VARS.map((re) => WORKOUT.match(re)[0]).concat([WORKOUT.match(/var HISTORY_BASELINE_LOOKBACK = \d+;/)[0]]);
  const asyncFns = ['loadHistorySessions', 'loadExerciseHistory'];
  vm.runInContext(vars.join('\n') + '\n' + FNS.map((n) => extractFn(WORKOUT, n)).join('\n') + '\n' +
    asyncFns.map((n) => 'async ' + extractFn(WORKOUT, n)).join('\n') +
    '\nthis.__fns = {' + FNS.concat(asyncFns).join(',') + '};', sandbox);
  return sandbox.__fns;
}

let day = 100;
const W_ = (sets, slug) => ({ id: 'w' + (day--), date: '2026-0' + 1 + '-01T00:00:' + String(day).padStart(3, '0'), slug, sets });
const done = (w, reps) => reps.map((r) => ({ weight_lbs: w, reps: r, completed: true }));
const skippedSets = () => [1, 2, 3].map(() => ({ weight_lbs: 30, reps: null, completed: false }));

test('deeper baseline: weighted session + 7 ineligible newer ones → the gym workout keeps 25 lb → 30 lb', async () => {
  // Newest first: 4 BWF sessions, 1 blank gym session, 1 skipped, 1 BWF 0 lb, then the weighted one.
  const workouts = [
    W_(done(null, [12, 12, 12]), 'bodyweight_foundations'),
    W_(done(null, [12, 12, 12]), 'bodyweight_foundations'),
    W_(done(null, [11, 11, 11]), 'bodyweight_foundations'),
    W_(done(null, [10, 10, 10]), 'bodyweight_foundations'),
    W_(done(null, [12, 12, 12]), 'muscle_gain'),
    W_(skippedSets(), 'muscle_gain'),
    W_(done(0, [10, 10, 10]), 'bodyweight_foundations'),
    W_(done(25, [12, 12, 12]), 'muscle_gain'),
  ];
  const db = fakeDb(workouts);
  const G = loaderSandbox('muscle_gain', db);
  const e = ex('rlunge', []);
  await G.loadExerciseHistory(e);

  assert.equal(e.history[e.history.length - 1].sets[0].weight, 25, 'baseline appended after the window');
  const rec = G.recForExercise(e);
  assert.equal(rec.lastPerformance.weight, 25);
  assert.equal(rec.action, 'increase');
  assert.equal(rec.recommendedWeight, 30, 'progression continues from the weighted baseline');

  // Bounded: one metadata read at the lookback cap, one window read, one deeper read (reps-bearing sets only).
  const ws = db.calls.filter((c) => c.table === 'workouts');
  assert.equal(ws.length, 1);
  assert.equal(ws[0].limit, 120);
  const setReads = db.calls.filter((c) => c.table === 'workout_sets');
  assert.equal(setReads.length, 2);
  assert.deepEqual(setReads[1].nots, ['reps']);
  assert.ok(!setReads[1].ins.workout_exercise_id.includes('wex-' + workouts[6].id), 'BWF sessions are not even read');

  // Without the deeper read the 6-session window alone would lose it.
  const windowOnly = Object.assign({}, e, { history: e.history.slice(0, -1) });
  assert.equal(G.recForExercise(windowOnly).recommendedWeight, null);
});

test('deeper baseline: no extra read when the recent window already has an anchor', async () => {
  const workouts = [W_(done(30, [10, 10, 10]), 'muscle_gain')]
    .concat([1, 2, 3, 4, 5, 6, 7].map(() => W_(done(null, [12, 12, 12]), 'bodyweight_foundations')));
  const db = fakeDb(workouts);
  const e = ex('rlunge', []);
  await loaderSandbox('muscle_gain', db).loadExerciseHistory(e);
  assert.equal(db.calls.filter((c) => c.table === 'workout_sets').length, 1);
  assert.equal(e.history.length, 6, 'window unchanged');
});

test('deeper baseline: Bodyweight Foundations finds an older bodyweight session behind 7 gym ones', async () => {
  const workouts = [1, 2, 3, 4, 5, 6, 7].map(() => W_(done(25, [12, 12, 12]), 'muscle_gain'))
    .concat([W_(done(null, [14, 14, 14]), 'bodyweight_foundations')]);
  const db = fakeDb(workouts);
  const B = loaderSandbox('bodyweight_foundations', db);
  const e = ex('rlunge', []);
  await B.loadExerciseHistory(e);
  const rec = B.recForExercise(e);
  assert.deepEqual(rec.lastPerformance.reps, [14, 14, 14]);
  assert.equal(rec.recommendedWeight, null);
});

test('deeper baseline: nothing eligible anywhere → the window is returned as-is (blank-only Push-Up user)', async () => {
  const workouts = [1, 2, 3, 4, 5, 6, 7, 8].map(() => W_(done(null, [12, 12, 12]), 'muscle_gain'));
  const db = fakeDb(workouts);
  const G = loaderSandbox('muscle_gain', db);
  const e = ex('pushup', []);
  await G.loadExerciseHistory(e);
  assert.equal(e.history.length, 6);
  assert.deepEqual(G.recForExercise(e).lastPerformance.reps, [12, 12, 12]);
});

test('needsDeeperBaseline / findBaseline follow the same rules as referenceHistory', () => {
  const P = Progression;
  assert.equal(P.needsDeeperBaseline([bwf([12, 12, 12])], 'optional'), true);
  assert.equal(P.needsDeeperBaseline([session(25, [12])], 'optional'), false);
  assert.equal(P.needsDeeperBaseline([session(0, [12])], 'required'), false, 'a recorded 0 anchors a weighted lift');
  assert.equal(P.needsDeeperBaseline([session(25, [12])], 'none'), true);
  assert.equal(P.needsDeeperBaseline([], undefined), false, 'no policy → never reads more');
  assert.equal(P.findBaseline([bwf([12]), session(null, [12]), session(40, [8])], 'required').sets[0].weight, 40);
  assert.equal(P.findBaseline([session(25, [12]), bwf([9])], 'none').sets[0].reps, 9);
  assert.equal(P.findBaseline([session(null, [12])], 'optional'), null);
});

test('workout.html wiring: Program tag, policy, bounded deeper read', () => {
  assert.match(extractFn(WORKOUT, 'loadHistorySessions'), /equipmentFree: equipmentFreeSlug\(w\.program_slug\)/);
  const src = extractFn(WORKOUT, 'loadExerciseHistory');
  assert.match(src, /select\('id, created_at, program_slug'\)/);
  assert.match(src, /\.limit\(HISTORY_BASELINE_LOOKBACK\)/);
  assert.match(extractFn(WORKOUT, 'recForExercise'), /load: loadPolicyForExercise\(ex\)/);
});

test('workout-complete.html tags sessions too, so its note matches the next workout screen', () => {
  const src = extractFn(COMPLETE, 'loadHistory');
  assert.match(src, /select\('id,created_at,program_slug'\)/);
  assert.match(src, /equipmentFree:freeW\[x\.workout_id\]/);
  assert.match(COMPLETE, /var hist = \[\{ date:w\.created_at, equipmentFree: EQUIPMENT_FREE_PROGRAMS\[w\.program_slug\]===true,/);

  // Completion of a gym workout with blank Reverse Lunge weights: the note
  // still progresses from the earlier weighted session.
  const progLine = COMPLETE.match(/var EQUIPMENT_FREE_PROGRAMS = \{[^}]*\};/)[0];
  const box = { Progression, tracking: { failed: false, byId: { rlunge: LIB[0] } },
    num: (v) => (v === '' || v == null || isNaN(parseFloat(v)) ? null : parseFloat(v)), w: { program_slug: 'muscle_gain' } };
  vm.createContext(box);
  vm.runInContext(progLine + '\n' + extractFn(COMPLETE, 'noteMetaFor') + '\nthis.f = noteMetaFor;', box);
  const e = { exercise_id: 'rlunge', sets: [{ weight_lbs: null, reps: 12 }] };
  const hist = [session(null, [12, 12, 12]), session(25, [12, 12, 12])];
  const rec = Progression.analyze(Object.assign({ exerciseName: 'Reverse Lunge', repsLow: 8, repsHigh: 12, targetSets: 3, history: hist },
    box.f(e, hist)));
  assert.equal(rec.recommendedWeight, 30);
});
