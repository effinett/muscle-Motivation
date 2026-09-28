/* Phase 4.3.9B — CP3d-2a. Tracking-unit and personal-record correctness.
 * ──────────────────────────────────────────────────────────────────────────
 * `workout_sets.reps` is a bare integer that holds repetitions for a rep
 * exercise and SECONDS for a timed one. Nothing consulted `tracking_type`, so
 * a weighted hold — 20 lb × 45 s — wrote best_reps=45, best_volume=900 and a
 * fabricated ~50 lb Epley 1RM into `personal_records`, permanently. 23 Plank
 * entries across three PUBLISHED Programs sit on that path today.
 *
 * These tests execute the REAL functions: the resolver and evaluator straight
 * from progression.js, and the workout.html display/guard functions extracted
 * into a vm sandbox against a write-recording stub client (the
 * dashboard-zero-state.test.js pattern). Denied paths assert EXACT ZERO
 * personal_records reads and writes, not merely "no PR message". */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Progression = require('./progression.js');

const WORKOUT = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'workout.html defines ' + name + '()');
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ── 1 · Resolver ───────────────────────────────────────────────────────── */

test('every rep-tracked type resolves to reps', () => {
  ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight'].forEach((t) => {
    assert.equal(Progression.trackingUnit(t), 'reps', t);
    assert.equal(Progression.isRepTracked(t), true, t);
  });
});

test('time resolves to seconds', () => {
  assert.equal(Progression.trackingUnit('time'), 'sec');
  assert.equal(Progression.isRepTracked('time'), false);
});

test('distance and time_distance resolve to unknown', () => {
  // Their stored magnitude is not trustworthy as a unit today, so they stay
  // neutral rather than being labelled from default_unit.
  assert.equal(Progression.trackingUnit('distance'), 'unknown');
  assert.equal(Progression.trackingUnit('time_distance'), 'unknown');
});

test('missing and unrecognized metadata resolve to unknown', () => {
  [null, undefined, '', 'bogus', 'TIME', 42, {}, []].forEach((t) => {
    assert.equal(Progression.trackingUnit(t), 'unknown', JSON.stringify(t));
    assert.equal(Progression.isRepTracked(t), false, JSON.stringify(t));
  });
});

test('unknown never falls back to reps', () => {
  const units = Object.keys({ distance: 1, time_distance: 1, nope: 1 })
    .map(Progression.trackingUnit);
  assert.ok(!units.includes('reps'), 'no unresolved type may report reps');
  assert.equal(Progression.TRACKING_UNIT.UNKNOWN, 'unknown');
});

/* ── 2 · Goal range wording ─────────────────────────────────────────────── */

const goal = (input) => Progression.analyze(input).goalRange.display;

test('goal range is unit-aware', () => {
  assert.equal(goal({ repsLow: 8, repsHigh: 12, unit: 'reps' }), '8–12 reps');
  assert.equal(goal({ repsLow: 30, repsHigh: 45, unit: 'sec' }), '30–45 sec');
  assert.equal(goal({ repsLow: 30, repsHigh: 40, unit: 'unknown' }), '30–40');
  // A raw tracking type works too, for callers that have not resolved it.
  assert.equal(goal({ repsLow: 30, repsHigh: 45, trackingType: 'time' }), '30–45 sec');
  assert.equal(goal({ repsLow: 30, repsHigh: 40, trackingType: 'distance' }), '30–40');
});

test('an unresolved prescription carries no unit noun at all', () => {
  const display = goal({ repsLow: 30, repsHigh: 40, unit: 'unknown' });
  [/reps/i, /\bsec\b/i, /\bm\b/, /\bmi\b/, /distance/i].forEach((re) => {
    assert.ok(!re.test(display), 'must not contain ' + re + ': ' + display);
  });
});

test('PARITY: omitting tracking metadata preserves the original wording', () => {
  // Every pre-CP3d-2a caller omits both keys and must be byte-identical.
  assert.equal(goal({ repsLow: 8, repsHigh: 12 }), '8–12 reps');
  assert.equal(goal({ repsLow: 5, repsHigh: 5 }), '5–5 reps');
  assert.equal(goal({}), Progression.DEFAULT_LOW + '–' + Progression.DEFAULT_HIGH + ' reps');
});

/* ── 3 · Evaluator guard ────────────────────────────────────────────────── */

const PRIOR = { best_weight: 15, best_reps: 12, best_volume: 180, best_estimated_1rm: 21 };
const HOLD = [{ weight: 20, reps: 45 }];   // 20 lb weighted plank held 45 seconds

test('a weighted timed set produces no PR inside the evaluator', () => {
  const r = Progression.evaluatePRs(HOLD, PRIOR, { trackingType: 'time' });
  assert.equal(r.updated, false);
  assert.deepEqual(r.prMessages, []);
  assert.equal(r.topMessage, null);
  assert.equal(r.skippedReason, 'non_rep_tracking');
  // Seconds must not become reps, volume, or a 1RM.
  assert.equal(r.best.best_reps, 12, 'best_reps must not become 45');
  assert.notEqual(r.best.best_volume, 900);
  assert.equal(r.best.best_volume, 180);
  assert.equal(r.best.best_estimated_1rm, 21);
  assert.equal(r.best.best_weight, 15);
});

test('the guarded no-op preserves prior records rather than erasing them', () => {
  const r = Progression.evaluatePRs(HOLD, PRIOR, { trackingType: 'distance' });
  assert.deepEqual(r.best, PRIOR);
  assert.equal(r.hadPrior, true);
});

test('distance, time_distance and unrecognized types are all refused', () => {
  ['distance', 'time_distance', 'bogus'].forEach((t) => {
    const r = Progression.evaluatePRs(HOLD, PRIOR, { trackingType: t });
    assert.equal(r.updated, false, t);
    assert.deepEqual(r.prMessages, [], t);
  });
});

test('legitimate rep-tracked sets still record exactly as before', () => {
  const r = Progression.evaluatePRs([{ weight: 100, reps: 10 }], PRIOR,
    { trackingType: 'weight_reps' });
  assert.equal(r.updated, true);
  assert.equal(r.best.best_weight, 100);
  assert.equal(r.best.best_reps, 12);       // 10 < prior 12, unchanged
  assert.equal(r.best.best_volume, 1000);
  assert.ok(r.prMessages.length > 0);
});

test('PARITY: omitting options preserves the original evaluator behaviour', () => {
  const withOut = Progression.evaluatePRs(HOLD, PRIOR);
  const legacy = Progression.evaluatePRs(HOLD, PRIOR, {});
  assert.equal(withOut.updated, true, 'no metadata must behave as it always did');
  assert.deepEqual(legacy.best, withOut.best);
  assert.equal(withOut.best.best_reps, 45);   // the documented old behaviour
});

/* ── 4 · workout.html display + caller-side guard ───────────────────────── */

// Canonical rows as loadExerciseLibrary() shapes them.
const LIB = [
  { id: 'ex-plank', name: 'Plank', tracking_type: 'time' },
  { id: 'ex-squat', name: 'Bodyweight Squat', tracking_type: 'bodyweight_reps' },
  { id: 'ex-bench', name: 'Bench Press', tracking_type: 'weight_reps' },
  { id: 'ex-carry', name: 'Farmer Carry', tracking_type: 'distance' },
  { id: 'ex-blank', name: 'No Metadata', tracking_type: null },
];

const DISPLAY_FNS = ['trackingTypeForExercise', 'unitForExercise',
  'unitColumnLabel', 'unitPlaceholder'];

function makeSandbox(opts) {
  const o = opts || {};
  const writes = [];
  const reads = [];

  function builder(table) {
    const api = {
      select: () => { reads.push({ table, op: 'select' }); return api; },
      eq: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: o.priorRecord || null, error: null }),
      single: async () => ({ data: o.priorRecord || null, error: null }),
      then: (res) => res({ data: o.priorRecord ? [o.priorRecord] : [], error: null }),
      insert(payload) { writes.push({ table, op: 'insert', payload }); return {
        select: () => ({ single: async () => ({ data: payload, error: null }) }),
        then: (r) => r({ data: null, error: null }) }; },
      update(payload) { writes.push({ table, op: 'update', payload }); return {
        eq: () => ({ then: (r) => r({ error: null }) }) }; },
      upsert(payload) { writes.push({ table, op: 'upsert', payload }); return {
        then: (r) => r({ error: null }) }; },
      delete() { writes.push({ table, op: 'delete' }); return {
        eq: () => ({ then: (r) => r({ error: null }) }) }; },
    };
    return api;
  }

  const sandbox = {
    console: { error() {}, warn() {} },
    Progression,
    exerciseLibrary: o.library === undefined ? LIB : o.library,
    exercises: o.exercises || [],
    currentUser: { id: 'user-1' },
    supabaseClient: { from: builder },
    ExerciseLog: { identityType: () => 'canonical' },
    esc: (s) => String(s == null ? '' : s),
  };
  vm.createContext(sandbox);

  const src = o.source || WORKOUT;
  const names = DISPLAY_FNS.concat(o.extraFns || []);
  vm.runInContext(names.map((n) => extractFn(src, n)).join('\n'), sandbox);

  return { sandbox, writes, reads };
}

const unitOf = (exercise_id, opts) =>
  makeSandbox(opts).sandbox.unitForExercise({ exercise_id });

test('the workout page resolves units from the canonical catalog', () => {
  assert.equal(unitOf('ex-squat'), 'reps');
  assert.equal(unitOf('ex-bench'), 'reps');
  assert.equal(unitOf('ex-plank'), 'sec');
  assert.equal(unitOf('ex-carry'), 'unknown');
  assert.equal(unitOf('ex-blank'), 'unknown');   // row exists, no tracking_type
  assert.equal(unitOf('ex-missing'), 'unknown'); // id not in the catalog
  assert.equal(unitOf(null), 'unknown');         // custom / legacy reference
});

test('an empty or unavailable catalog resolves to unknown, never reps', () => {
  assert.equal(unitOf('ex-squat', { library: [] }), 'unknown');
  assert.equal(unitOf('ex-squat', { library: null }), 'unknown');
});

test('column label and placeholder follow the unit', () => {
  const s = makeSandbox().sandbox;
  assert.equal(s.unitColumnLabel('reps'), 'Reps');
  assert.equal(s.unitColumnLabel('sec'), 'Sec');
  assert.equal(s.unitColumnLabel('unknown'), 'Target');
  assert.equal(s.unitPlaceholder('reps'), 'reps');
  assert.equal(s.unitPlaceholder('sec'), 'sec');
  assert.equal(s.unitPlaceholder('unknown'), 'value');
  // No false unit noun reaches an unresolved prescription.
  [/reps/i, /sec/i, /\bm\b/, /mi/i, /distance/i].forEach((re) => {
    assert.ok(!re.test(s.unitColumnLabel('unknown')), 'header: ' + re);
    assert.ok(!re.test(s.unitPlaceholder('unknown')), 'placeholder: ' + re);
  });
});

test('a swap re-derives the unit from the replacement exercise', () => {
  const s = makeSandbox().sandbox;
  // The in-memory row is mutated in place by applySwap; the unit follows the id.
  const ex = { exercise_id: 'ex-plank' };
  assert.equal(s.unitForExercise(ex), 'sec');
  ex.exercise_id = 'ex-squat';                   // timed → reps
  assert.equal(s.unitForExercise(ex), 'reps');
  ex.exercise_id = 'ex-plank';                   // reps → timed
  assert.equal(s.unitForExercise(ex), 'sec');
  ex.exercise_id = 'ex-carry';                   // → neutral
  assert.equal(s.unitForExercise(ex), 'unknown');
  ex.exercise_id = null;                         // → custom, neutral
  assert.equal(s.unitForExercise(ex), 'unknown');
});

test('reload re-derives the unit with no persisted tracking field', () => {
  // loadExercisesForWorkout rebuilds rows from workout_exercises, which carry
  // only identity — no tracking_type. Resolution must still be correct.
  const rebuilt = { id: 'we-1', name: 'Plank', exercise_id: 'ex-plank', sets: [] };
  assert.equal(makeSandbox().sandbox.unitForExercise(rebuilt), 'sec');
  assert.ok(!('tracking_type' in rebuilt), 'nothing is persisted onto the workout row');
});

/* ── 5 · Caller-side PR guard: zero reads AND zero writes ───────────────── */

async function runPRs(exercises, opts) {
  const t = makeSandbox(Object.assign({ exercises }, opts, {
    extraFns: ['detectAndRecordPRs'],
  }));
  t.sandbox.exercises = exercises;
  await t.sandbox.detectAndRecordPRs();
  return t;
}

const completedSet = (weight, reps) =>
  ({ id: 's1', set_number: 1, weight_lbs: weight, reps, completed: true });

const prTouches = (t) =>
  t.reads.filter((r) => r.table === 'personal_records').length +
  t.writes.filter((w) => w.table === 'personal_records').length;

test('a completed 20 lb × 45 sec timed set touches personal_records zero times', async () => {
  const t = await runPRs([{
    id: 'we-1', name: 'Plank', exercise_id: 'ex-plank', customId: null,
    sets: [completedSet(20, 45)],
  }]);
  assert.equal(t.reads.filter((r) => r.table === 'personal_records').length, 0,
    'zero personal_records reads');
  assert.equal(t.writes.filter((w) => w.table === 'personal_records').length, 0,
    'zero personal_records writes');
  assert.deepEqual(t.writes, [], 'the denied path writes nothing at all');
});

test('distance, unknown and custom exercises also touch personal_records zero times', async () => {
  for (const ex of [
    { name: 'Farmer Carry', exercise_id: 'ex-carry' },
    { name: 'No Metadata', exercise_id: 'ex-blank' },
    { name: 'Ghost', exercise_id: 'ex-missing' },
    { name: 'My Custom', exercise_id: null, customId: 'custom-1' },
  ]) {
    const t = await runPRs([Object.assign({ id: 'we-x', customId: null,
      sets: [completedSet(20, 45)] }, ex)]);
    assert.equal(prTouches(t), 0, ex.name + ' must not touch personal_records');
  }
});

test('a legitimate rep-tracked weighted set still reaches personal_records', async () => {
  const t = await runPRs([{
    id: 'we-1', name: 'Bench Press', exercise_id: 'ex-bench', customId: null,
    sets: [completedSet(135, 8)],
  }]);
  assert.ok(t.reads.some((r) => r.table === 'personal_records'),
    'the rep-tracked path must still read the prior record');
});

test('a mixed workout guards only the non-rep exercise', async () => {
  const t = await runPRs([
    { id: 'we-1', name: 'Plank', exercise_id: 'ex-plank', customId: null,
      sets: [completedSet(20, 45)] },
    { id: 'we-2', name: 'Bench Press', exercise_id: 'ex-bench', customId: null,
      sets: [completedSet(135, 8)] },
  ]);
  assert.ok(t.reads.some((r) => r.table === 'personal_records'),
    'the bench press must still be evaluated');
  // Exactly one exercise reached the pipeline.
  assert.equal(t.reads.filter((r) => r.table === 'personal_records').length, 1);
});

/* ── 6 · Mutation sensitivity ───────────────────────────────────────────── */

test('removing the caller-side guard makes the timed test fail', async () => {
  const bypassed = WORKOUT.replace("if (unitForExercise(ex) !== 'reps') continue;", '');
  assert.notEqual(bypassed, WORKOUT, 'the caller guard was not found to mutate');
  const t = await runPRs([{
    id: 'we-1', name: 'Plank', exercise_id: 'ex-plank', customId: null,
    sets: [completedSet(20, 45)],
  }], { source: bypassed });
  assert.ok(prTouches(t) > 0,
    'without the caller guard a timed set must reach personal_records — ' +
    'otherwise the guard test proves nothing');
});

test('removing the evaluator guard makes the evaluator test fail', () => {
  // Re-run the evaluator with the guard condition neutralised.
  const guarded = Progression.evaluatePRs(HOLD, PRIOR, { trackingType: 'time' });
  const unguarded = Progression.evaluatePRs(HOLD, PRIOR);   // no metadata = old path
  assert.equal(guarded.updated, false);
  assert.equal(unguarded.updated, true,
    'the unguarded path must still corrupt — otherwise the guard proves nothing');
  assert.equal(unguarded.best.best_reps, 45);
  assert.equal(unguarded.best.best_volume, 900);
  assert.equal(unguarded.best.best_estimated_1rm, 50);
});

test('source: the caller guard precedes the prior-record read', () => {
  const fn = extractFn(WORKOUT, 'detectAndRecordPRs');
  const guard = fn.indexOf("unitForExercise(ex) !== 'reps'");
  const read = fn.indexOf("from('personal_records')");
  assert.ok(guard > -1 && read > -1);
  assert.ok(guard < read, 'the unit guard must run before any personal_records read');
});
