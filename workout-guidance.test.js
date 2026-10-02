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

/* ══════════════════════════════════════════════════════════════════════════
 * CP3d-2b — unit-correct completion recap (workout-complete.html)
 *
 * The recap summed `workout_sets.reps` into a "reps" stat and multiplied
 * weight × reps into "lb volume" without ever consulting tracking_type, so a
 * plank's seconds were counted as repetitions and a weighted hold inflated
 * pound-volume. These tests execute the REAL render aggregation out of
 * workout-complete.html in a vm sandbox.
 * ══════════════════════════════════════════════════════════════════════════ */

const RECAP = fs.readFileSync(path.join(__dirname, 'workout-complete.html'), 'utf8');

const RECAP_FNS = ['num', 'working', 'recapUnitFor', 'fmtSeconds'];

// Canonical rows exactly as loadTrackingTypes() shapes them.
const TRACK = {
  'ex-plank': { id: 'ex-plank', tracking_type: 'time' },
  'ex-squat': { id: 'ex-squat', tracking_type: 'bodyweight_reps' },
  'ex-bench': { id: 'ex-bench', tracking_type: 'weight_reps' },
  'ex-carry': { id: 'ex-carry', tracking_type: 'distance' },
  'ex-run':   { id: 'ex-run',   tracking_type: 'time_distance' },
  'ex-blank': { id: 'ex-blank', tracking_type: null },
  'ex-weird': { id: 'ex-weird', tracking_type: 'quantum_reps' },
};

function recapSandbox(source) {
  const sandbox = { console: { error() {}, warn() {} }, Progression };
  vm.createContext(sandbox);
  const src = source || RECAP;
  // `var` declarations the extracted functions close over.
  const decls = ['RECAP_NEUTRAL_TYPES', 'RECAP_UNIT']
    .map((n) => (src.match(new RegExp('var ' + n + ' = \\{[\\s\\S]*?\\};')) || [''])[0])
    .join('\n');
  vm.runInContext(decls + '\n' + RECAP_FNS.map((n) => extractFn(src, n)).join('\n'), sandbox);
  return sandbox;
}

/* The aggregation block, lifted verbatim from render() so the test exercises
 * the shipped arithmetic rather than a restatement of it. */
function extractAggregation(src) {
  const start = src.indexOf('var totalSets=0, totalReps=0, totalVol=0, totalSec=0');
  assert.ok(start > -1, 'workout-complete.html defines the recap totals');
  const end = src.indexOf("document.getElementById('statGrid').innerHTML = statsHtml;");
  assert.ok(end > start, 'workout-complete.html assigns the stat grid');
  const block = src.slice(start, end);
  // The block declares its own stat() HTML builder, which would hoist over the
  // capturing one the harness injects. Strip that single declaration so the
  // arithmetic under test is untouched but each stat is observable.
  const statDecl = block.match(/function stat\(n,l\)\{[^\n]*\}\n/);
  assert.ok(statDecl, 'the recap block declares stat()');
  return block.replace(statDecl[0], '');
}

function runRecap(exs, tracking, source) {
  const s = recapSandbox(source);
  const src = source || RECAP;
  const captured = [];
  s.exs = exs;
  s.tracking = tracking || { byId: TRACK, failed: false };
  // unitOf() as render() defines it, against the injected tracking result.
  vm.runInContext(`
    function unitOf(e){
      if(tracking.failed) return RECAP_UNIT.UNRESOLVED;
      if(!e || e.exercise_id == null) return RECAP_UNIT.UNRESOLVED;
      var row = tracking.byId[e.exercise_id];
      return recapUnitFor(row ? row.tracking_type : null, !!row);
    }
    function stat(n,l){ __stats.push({ value:String(n), label:l }); return ''; }
    var __stats = [];
  `, Object.assign(s, { __stats: captured }));
  vm.runInContext(extractAggregation(src) + '\n__out = __stats;', s);
  return s.__out;
}

// The exercise-count label is singular for one exercise ("exercise"), which is
// pre-existing behaviour this checkpoint deliberately leaves alone.
const statFor = (stats, label) => (label === 'exercises')
  ? stats.find((x) => x.label === 'exercise' || x.label === 'exercises')
  : stats.find((x) => x.label === label);
const set = (reps, weight, extra) =>
  Object.assign({ set_number: 1, reps, weight_lbs: weight === undefined ? null : weight,
    completed: true, is_warmup: false }, extra || {});

/* ── Resolver coupling ──────────────────────────────────────────────────── */

test('recap: neutral types stay in step with the shared resolver', () => {
  const s = recapSandbox();
  // Both recognized-but-non-aggregatable types must be UNKNOWN to the CP3d-2a
  // resolver — this pins the recap's list to progression.js rather than letting
  // the two drift silently.
  ['distance', 'time_distance'].forEach((t) => {
    assert.equal(Progression.trackingUnit(t), 'unknown', t);
    assert.equal(s.RECAP_NEUTRAL_TYPES[t], true, t);
  });
  assert.deepEqual(Object.keys(s.RECAP_NEUTRAL_TYPES).sort(), ['distance', 'time_distance']);
});

test('recap: unit classification separates neutral from unresolved', () => {
  const s = recapSandbox();
  assert.equal(s.recapUnitFor('weight_reps', true), 'reps');
  assert.equal(s.recapUnitFor('bodyweight_reps', true), 'reps');
  assert.equal(s.recapUnitFor('weighted_bodyweight', true), 'reps');
  assert.equal(s.recapUnitFor('time', true), 'sec');
  assert.equal(s.recapUnitFor('distance', true), 'neutral');
  assert.equal(s.recapUnitFor('time_distance', true), 'neutral');
  assert.equal(s.recapUnitFor(null, true), 'unresolved');        // missing type
  assert.equal(s.recapUnitFor('quantum_reps', true), 'unresolved'); // unrecognized
  assert.equal(s.recapUnitFor('time', false), 'unresolved');     // row missing
});

/* ── Layouts ────────────────────────────────────────────────────────────── */

test('recap: reps-only workout', () => {
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(8, 100), set(8, 100)] },
  ]);
  assert.equal(statFor(stats, 'exercises').value, '1');
  assert.equal(statFor(stats, 'working sets').value, '2');
  assert.equal(statFor(stats, 'reps').value, '16');
  assert.equal(statFor(stats, 'lb volume').value, '1.6k');
  assert.equal(statFor(stats, 'time'), undefined, 'no TIME stat');
});

test('recap: timed-only workout', () => {
  const stats = runRecap([
    { name: 'Plank', exercise_id: 'ex-plank', sets: [set(45), set(45)] },
  ]);
  assert.equal(statFor(stats, 'reps').value, '0');
  assert.equal(statFor(stats, 'lb volume').value, '0');
  assert.equal(statFor(stats, 'time').value, '1:30');
});

test('recap: reps plus timed', () => {
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(8, 100)] },
    { name: 'Plank', exercise_id: 'ex-plank', sets: [set(60)] },
  ]);
  assert.equal(statFor(stats, 'reps').value, '8', 'seconds must not enter reps');
  assert.equal(statFor(stats, 'lb volume').value, '800');
  assert.equal(statFor(stats, 'time').value, '1:00');
});

test('recap: distance-only workout', () => {
  const stats = runRecap([
    { name: 'Farmer Carry', exercise_id: 'ex-carry', sets: [set(40, 50)] },
  ]);
  assert.equal(statFor(stats, 'reps').value, '0');
  assert.equal(statFor(stats, 'lb volume').value, '0');
  assert.equal(statFor(stats, 'time'), undefined);
  // Recognized distance must NOT be treated as a metadata failure.
  assert.notEqual(statFor(stats, 'reps').value, '—');
});

test('recap: reps plus timed plus distance', () => {
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(10, 100)] },
    { name: 'Plank', exercise_id: 'ex-plank', sets: [set(150)] },
    { name: 'Farmer Carry', exercise_id: 'ex-carry', sets: [set(40, 50)] },
    { name: 'Treadmill Run', exercise_id: 'ex-run', sets: [set(30)] },
  ]);
  assert.equal(statFor(stats, 'reps').value, '10');
  assert.equal(statFor(stats, 'lb volume').value, '1k');
  assert.equal(statFor(stats, 'time').value, '2:30');
  assert.equal(statFor(stats, 'working sets').value, '4', 'set counting is unchanged');
});

test('recap: skipped and empty sets are excluded as before', () => {
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench',
      sets: [set(8, 100), set(8, 100, { completed: false }),
             set(8, 100, { is_warmup: true }), set(null, 100)] },
    { name: 'Empty', exercise_id: 'ex-squat', sets: [] },
  ]);
  assert.equal(statFor(stats, 'exercises').value, '1', 'an exercise with no working sets does not count');
  assert.equal(statFor(stats, 'working sets').value, '1');
  assert.equal(statFor(stats, 'reps').value, '8');
});

test('recap: an entirely empty workout does not crash', () => {
  const stats = runRecap([]);
  assert.equal(statFor(stats, 'exercises').value, '0');
  assert.equal(statFor(stats, 'working sets').value, '0');
  assert.equal(statFor(stats, 'reps').value, '0');
  assert.equal(statFor(stats, 'time'), undefined);
});

test('recap: a weighted timed set counts as time only', () => {
  const stats = runRecap([
    { name: 'Plank', exercise_id: 'ex-plank', sets: [set(45, 20)] },
  ]);
  assert.equal(statFor(stats, 'time').value, '45s');
  assert.equal(statFor(stats, 'reps').value, '0', '45 seconds must not become 45 reps');
  assert.equal(statFor(stats, 'lb volume').value, '0', '20 lb × 45 s must not become 900');
});

test('recap: TIME is omitted when no timed work was identified', () => {
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(8, 100)] },
  ]);
  assert.equal(statFor(stats, 'time'), undefined);
  assert.equal(stats.length, 4, 'the usual four-stat layout is unchanged');
});

/* ── Seconds formatting ─────────────────────────────────────────────────── */

test('recap: seconds formatting', () => {
  const s = recapSandbox();
  assert.equal(s.fmtSeconds(45), '45s');
  assert.equal(s.fmtSeconds(59), '59s');
  assert.equal(s.fmtSeconds(60), '1:00');
  assert.equal(s.fmtSeconds(90), '1:30');
  assert.equal(s.fmtSeconds(150), '2:30');
  assert.equal(s.fmtSeconds(0), '0s');
  assert.equal(s.fmtSeconds(605), '10:05', 'seconds stay zero-padded');
});

/* ── Fail-safe ──────────────────────────────────────────────────────────── */

const failSafe = (stats, label) => {
  assert.equal(statFor(stats, 'reps').value, '—', label + ': reps');
  assert.equal(statFor(stats, 'lb volume').value, '—', label + ': volume');
  assert.equal(statFor(stats, 'time'), undefined, label + ': no TIME');
  assert.ok(/^\d+$/.test(statFor(stats, 'exercises').value), label + ': exercises numeric');
  assert.ok(/^\d+$/.test(statFor(stats, 'working sets').value), label + ': sets numeric');
};

test('recap: a failed metadata query fails safe', () => {
  failSafe(runRecap(
    [{ name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(8, 100)] }],
    { byId: {}, failed: true }), 'query failure');
});

test('recap: a missing exercise id fails safe', () => {
  failSafe(runRecap([{ name: 'My Custom', exercise_id: null, sets: [set(8, 100)] }]),
    'missing id');
});

test('recap: a missing canonical row fails safe', () => {
  failSafe(runRecap([{ name: 'Ghost', exercise_id: 'ex-absent', sets: [set(8, 100)] }]),
    'missing row');
});

test('recap: a missing tracking type fails safe', () => {
  failSafe(runRecap([{ name: 'No Metadata', exercise_id: 'ex-blank', sets: [set(8, 100)] }]),
    'missing tracking_type');
});

test('recap: an unrecognized tracking type fails safe', () => {
  failSafe(runRecap([{ name: 'Weird', exercise_id: 'ex-weird', sets: [set(8, 100)] }]),
    'unrecognized tracking_type');
});

test('recap: one unresolved exercise makes the whole total unprovable', () => {
  // A partial number must never be presented as a complete total.
  const stats = runRecap([
    { name: 'Bench Press', exercise_id: 'ex-bench', sets: [set(8, 100)] },
    { name: 'Ghost', exercise_id: 'ex-absent', sets: [set(8, 100)] },
  ]);
  assert.equal(statFor(stats, 'reps').value, '—', 'must not report only the resolvable half');
  assert.notEqual(statFor(stats, 'reps').value, '8');
});

test('recap: unresolved values never fall back to reps', () => {
  [
    [{ name: 'X', exercise_id: null, sets: [set(45, 20)] }, undefined],
    [{ name: 'X', exercise_id: 'ex-absent', sets: [set(45, 20)] }, undefined],
    [{ name: 'X', exercise_id: 'ex-blank', sets: [set(45, 20)] }, undefined],
    [{ name: 'X', exercise_id: 'ex-weird', sets: [set(45, 20)] }, undefined],
  ].forEach(([ex]) => {
    const stats = runRecap([ex]);
    assert.notEqual(statFor(stats, 'reps').value, '45');
    assert.notEqual(statFor(stats, 'lb volume').value, '900');
  });
});

/* ── Layout ─────────────────────────────────────────────────────────────── */

test('recap: the five-stat grid rule exists and only affects an odd last stat', () => {
  assert.match(RECAP, /\.stat:last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1\s*\/\s*-1;?\s*\}/,
    'the odd-last-stat rule must be present');
  assert.match(RECAP, /\.stat-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/,
    'the two-column grid is unchanged');
});

/* ── Mutation sensitivity ───────────────────────────────────────────────── */

test('recap mutation: dropping the unit filter lets seconds become reps', () => {
  const broken = RECAP.replace(
    'if(unit === RECAP_UNIT.SECONDS){',
    'if(false){').replace(
    'if(unit === RECAP_UNIT.REPS){',
    'if(true){');
  assert.notEqual(broken, RECAP, 'the unit branches were not found to mutate');
  const stats = runRecap(
    [{ name: 'Plank', exercise_id: 'ex-plank', sets: [set(45, 20)] }], null, broken);
  assert.equal(statFor(stats, 'reps').value, '45',
    'without the filter seconds DO become reps — otherwise the guard proves nothing');
  assert.equal(statFor(stats, 'lb volume').value, '900',
    'and weighted seconds DO inflate volume');
});

test('recap mutation: removing the fail-safe reintroduces a guessed total', () => {
  const broken = RECAP.replace(
    'if(unit === RECAP_UNIT.UNRESOLVED){ unresolved = true; return; }',
    'if(unit === RECAP_UNIT.UNRESOLVED){ unit = RECAP_UNIT.REPS; }');
  assert.notEqual(broken, RECAP, 'the fail-safe branch was not found to mutate');
  const stats = runRecap(
    [{ name: 'Ghost', exercise_id: 'ex-absent', sets: [set(45, 20)] }], null, broken);
  assert.equal(statFor(stats, 'reps').value, '45',
    'without the fail-safe an unresolved value IS counted as reps');
});

test('recap: rep-based PR cards are gated on the same unit rule', () => {
  // A weighted hold must not yield "New Best Volume" (lb × seconds) or a
  // fabricated estimated 1RM card.
  assert.match(RECAP, /if\(ws\.length && unitOf\(e\) === RECAP_UNIT\.REPS\)\{/,
    'the PR-card block must require a positively rep-tracked exercise');
});

/* ══════════════════════════════════════════════════════════════════════════
 * CP3d-2c — Bodyweight Foundations prescription guidance (workout.html)
 *
 * The Routine entries already carry per-prescription coaching text — "Reps are
 * per leg.", "Hold time in seconds, per side.", the Push-Up Swap instruction,
 * Superman's explicit non-pulling clarification — and none of it was ever
 * shown. Scope is decided by ONE Program-slug rule; no note-string exclusion
 * list exists, and nothing is persisted.
 * ══════════════════════════════════════════════════════════════════════════ */

const GUIDANCE_FNS = ['programGuidanceEligible', 'readProgramGuidance'];

// The stored strings, matching bodyweight-foundations.test.js exactly.
const BWF_NOTE = {
  'Reverse Lunge': 'Reps are per leg.',
  'Single-Leg Glute Bridge': 'Reps are per leg.',
  'Side Plank': 'Hold time in seconds, per side.',
  'Push-Up': 'Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if ' +
             'that is too hard. Swap applies to this workout only.',
  'Pike Lean': 'Hold time in seconds, arms straight. Prepares you for the Pike Push-Up but ' +
               'is not a full-range replacement. Lean less to make it easier.',
  'Superman': 'Posterior-chain and postural endurance. ' +
              'Not a pulling exercise and not a substitute for rows.',
  'Dead Bug': 'Reps are per side.',
  'Bird Dog': 'Reps are per side.',
  'Split Squat': 'Reps are per leg.',
  'Wall Sit': 'Hold time in seconds.',
  'Mountain Climber': 'Work time in seconds.',
  'Russian Twist': 'Reps are total, not per side.',
  'Bodyweight Squat': '',
  'Glute Bridge': '',
};

function guidanceSandbox(source) {
  const sandbox = { console: { error() {}, warn() {} } };
  vm.createContext(sandbox);
  const src = source || WORKOUT;
  const decl = (src.match(/var PROGRAM_GUIDANCE_SLUGS = \{[\s\S]*?\};/) || [''])[0];
  assert.ok(decl, 'workout.html declares PROGRAM_GUIDANCE_SLUGS');
  vm.runInContext(decl + '\n' + GUIDANCE_FNS.map((n) => extractFn(src, n)).join('\n'), sandbox);
  return sandbox;
}

/* ── Slug gate ──────────────────────────────────────────────────────────── */

test('guidance: only bodyweight_foundations is eligible', () => {
  const s = guidanceSandbox();
  assert.equal(s.programGuidanceEligible('bodyweight_foundations'), true);
  ['muscle_gain', 'fat_loss_blueprint', 'glute_builder', 'BODYWEIGHT_FOUNDATIONS',
   'bodyweight_foundations ', '', null, undefined, 0, {}, ['bodyweight_foundations']]
    .forEach((slug) => {
      assert.equal(s.programGuidanceEligible(slug), false, JSON.stringify(slug));
    });
});

test('guidance: eligibility is a slug rule, not a content or name heuristic', () => {
  const src = WORKOUT;
  const fn = extractFn(src, 'programGuidanceEligible');
  // The gate may not consult anything but the slug.
  [/exercise_name/, /session_key/, /\.notes/, /name\b/, /purchase/, /routine/i]
    .forEach((re) => assert.ok(!re.test(fn), 'gate must not consult ' + re));
  // And there must be no note-string exclusion list anywhere.
  assert.ok(!/Phase 2: build to a top set/.test(src), 'no note-value exclusion list');
  assert.ok(!/Walk 30-40 seconds per set/.test(src), 'no note-value exclusion list');
});

/* ── Reading a prescription entry ───────────────────────────────────────── */

test('guidance: blank, missing and non-string values are absent', () => {
  const s = guidanceSandbox();
  [null, undefined, {}, { notes: '' }, { notes: '   ' }, { notes: null },
   { notes: 42 }, { notes: {} }, { notes: [] }].forEach((entry) => {
    assert.equal(s.readProgramGuidance(entry), null, JSON.stringify(entry));
  });
  assert.equal(s.readProgramGuidance({ notes: '  Reps are per leg.  ' }), 'Reps are per leg.');
});

test('guidance: every Bodyweight Foundations entry yields its stored text', () => {
  const s = guidanceSandbox();
  Object.keys(BWF_NOTE).forEach((name) => {
    const got = s.readProgramGuidance({ name, notes: BWF_NOTE[name] });
    assert.equal(got, BWF_NOTE[name] || null, name);
  });
  // The two intentionally note-free entries produce nothing to render.
  assert.equal(s.readProgramGuidance({ name: 'Bodyweight Squat', notes: '' }), null);
  assert.equal(s.readProgramGuidance({ name: 'Glute Bridge', notes: '' }), null);
});

test('guidance: representative content reaches the right entries', () => {
  const s = guidanceSandbox();
  const g = (n) => s.readProgramGuidance({ name: n, notes: BWF_NOTE[n] });
  assert.match(g('Reverse Lunge'), /per leg/);
  assert.match(g('Single-Leg Glute Bridge'), /per leg/);
  assert.match(g('Split Squat'), /per leg/);
  assert.match(g('Side Plank'), /seconds, per side/);
  assert.match(g('Wall Sit'), /seconds/);
  assert.match(g('Mountain Climber'), /Work time in seconds/);
  assert.match(g('Dead Bug'), /per side/);       // canonical is_unilateral=false
  assert.match(g('Bird Dog'), /per side/);
  assert.match(g('Russian Twist'), /total, not per side/);
  assert.match(g('Push-Up'), /Use Swap/);
  assert.match(g('Push-Up'), /this workout only/);
  assert.match(g('Push-Up'), /Knee Push-Up, or Wall Push-Up/);          // CP4c
  assert.match(g('Pike Lean'), /Hold time in seconds, arms straight/);  // CP4c
  assert.match(g('Pike Lean'), /not a full-range replacement/);
  // Pike Push-Up is no longer a Bodyweight Foundations prescription (CP4c).
  assert.ok(!Object.prototype.hasOwnProperty.call(BWF_NOTE, 'Pike Push-Up'));
  assert.match(g('Superman'), /Posterior-chain and postural endurance/);
  assert.match(g('Superman'), /Not a pulling exercise and not a substitute for rows/);
});

/* ── Wiring: launch, resume, swap ───────────────────────────────────────── */

const launchFn = () => extractFn(WORKOUT, 'startProgramSession');
const resumeFn = () => extractFn(WORKOUT, 'applyTemplateRanges');
const swapFn = () => extractFn(WORKOUT, 'applySwap');

test('guidance: first launch pairs guidance with its own prescription entry', () => {
  const fn = launchFn();
  assert.match(fn, /programGuidanceEligible\(programSlug\)\)\s*\? readProgramGuidance\(ex\) : null/,
    'guidance comes from THIS entry, gated on the slug');
  assert.match(fn, /typeof programGuidanceEligible === 'function'/,
    'guidance is optional at runtime and never blocks the launch');
  // It must not be looked up by a global exercise-name map at launch.
  assert.ok(!/byName\[/.test(fn), 'launch must not resolve guidance by name lookup');
});

test('guidance: resume re-derives through the authorized Program-session path', () => {
  const fn = resumeFn();
  assert.match(fn, /loadProgramSession\(programSlug, sessionKey\)/,
    'reuses the existing authorized reload');
  assert.match(fn, /programGuidanceEligible\(programSlug\)/, 'slug-gated on resume too');
  assert.match(fn, /ex\.programGuidance = \(guidanceOk && t\) \? readProgramGuidance\(t\) : null/,
    'a name miss (a swapped exercise) yields null, never stale text');
  // applyTemplateRanges already returns early without a program slug/session.
  assert.match(fn, /if \(!programSlug \|\| !sessionKey\) return;/);
  assert.match(fn, /catch/, 'a failed reload must not block logging');
});

test('guidance: swap clears it in the same identity update', () => {
  const fn = swapFn();
  const idIdx = fn.indexOf('ex.exercise_id = ids.exercise_id;');
  const clrIdx = fn.indexOf('ex.programGuidance = null;');
  assert.ok(idIdx > -1 && clrIdx > -1, 'both updates present');
  assert.ok(clrIdx > idIdx, 'cleared alongside the identity change');
  // No extra query is issued to bring guidance back immediately.
  const after = fn.slice(clrIdx);
  assert.ok(!/loadProgramSession/.test(after),
    'swap must not re-query the Routine merely to restore guidance');
});

/* ── Rendering and escaping ─────────────────────────────────────────────── */

const recBlock = () => extractFn(WORKOUT, 'buildRecBlock');

test('guidance: rendered as escaped plain text under a GUIDANCE label', () => {
  const fn = recBlock();
  assert.match(fn, /rec-key">Guidance</, 'user-facing label is Guidance, not notes');
  assert.match(fn, /esc\(ex\.programGuidance\)/, 'must go through esc()');
  assert.ok(!/ex\.programGuidance\s*\+/.test(fn.replace(/esc\(ex\.programGuidance\)/g, '')),
    'the raw value is never concatenated into markup unescaped');
  // No linkification, markdown, icon or interaction on the guidance row.
  const row = fn.slice(fn.indexOf('rec-guidance') - 200, fn.indexOf('rec-guidance') + 200);
  [/<a /, /href=/, /onclick=/, /data-lucide/, /<button/].forEach((re) =>
    assert.ok(!re.test(row), 'guidance row must not contain ' + re));
});

test('guidance: absent guidance emits no markup at all', () => {
  const fn = recBlock();
  assert.match(fn, /typeof ex\.programGuidance === 'string'\s*\n?\s*&& ex\.programGuidance\.trim\(\)/,
    'only a non-empty string renders');
  assert.match(fn, /var guidance = '';/, 'the default contributes nothing');
});

test('guidance: injected markup is displayed as text, not executed', () => {
  // esc() is the shared helper used across the logger; prove it neutralises the
  // representative payload rather than assuming it does.
  const escSrc = fs.readFileSync(path.join(__dirname, 'workout-history.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFn(escSrc, 'esc'), sandbox);
  const out = sandbox.esc('<img src=x onerror="alert(1)">');
  // What makes markup live is an unescaped angle bracket or quote. The literal
  // text "onerror=" surviving is harmless — there is no element for it to bind
  // to — so the assertions target the characters that actually matter.
  assert.ok(!/[<>]/.test(out), 'no unescaped angle brackets: ' + out);
  assert.ok(!/"/.test(out), 'no unescaped attribute quote: ' + out);
  assert.match(out, /&lt;img/, 'displayed as text');
  assert.match(out, /onerror=&quot;/, 'the handler is inert text, not an attribute');
});

test('guidance: wraps inside the card at narrow widths', () => {
  assert.match(WORKOUT, /\.rec-val\.rec-guidance\s*\{[^}]*min-width:\s*0/,
    'min-width:0 is what lets a flex item wrap');
  assert.match(WORKOUT, /\.rec-val\.rec-guidance\s*\{[^}]*overflow-wrap:\s*anywhere/,
    'a long token cannot force horizontal scrolling');
  const rule = (WORKOUT.match(/\.rec-val\.rec-guidance\s*\{[^}]*\}/) || [''])[0];
  assert.ok(!/nowrap/.test(rule), 'guidance must never be nowrap');
  assert.ok(!/text-overflow/.test(rule), 'guidance must never be ellipsised');
});

/* ── Exposure: nothing but Bodyweight Foundations, nothing persisted ────── */

test('guidance: no other Program, template or Quick Session receives it', () => {
  const s = guidanceSandbox();
  // Another Program's entry carries a note, and is still ineligible.
  assert.equal(s.programGuidanceEligible('muscle_gain'), false);
  assert.equal(s.readProgramGuidance({ name: 'Barbell Back Squat',
    notes: 'Phase 2: build to a top set of 5.' }), 'Phase 2: build to a top set of 5.',
    'the reader is content-agnostic by design');
  // …so the ONLY thing standing between that note and the screen is the gate,
  // which the launch and resume paths both apply.
  assert.match(launchFn(), /programGuidanceEligible\(programSlug\)/);
  assert.match(resumeFn(), /programGuidanceEligible\(programSlug\)/);
  // Quick Session and template launches never touch the guidance paths.
  const manual = extractFn(WORKOUT, 'startWorkout');
  const tpl = extractFn(WORKOUT, 'startTemplateSession');
  [manual, tpl].forEach((fn) => {
    assert.ok(!/programGuidance/.test(fn), 'non-Program launch must not set guidance');
  });
});

test('guidance: a user Routine note cannot become programGuidance', () => {
  // saveTemplate writes the user's own note; nothing reads it back as guidance.
  const save = extractFn(WORKOUT, 'saveTemplate');
  assert.match(save, /notes: ex\.notes/, 'user Routine notes still save as before');
  assert.ok(!/programGuidance/.test(save), 'and never become Program guidance');
  const tplLaunch = extractFn(WORKOUT, 'startTemplateSession');
  assert.ok(!/programGuidance/.test(tplLaunch));
});

test('guidance: never written to any table or storage', () => {
  // Every persistence call site must be free of the field.
  const writes = WORKOUT.match(/\.(insert|update|upsert)\(\{[\s\S]{0,400}?\}\)/g) || [];
  assert.ok(writes.length > 0, 'write payloads found to inspect');
  writes.forEach((w) => {
    assert.ok(!/programGuidance/.test(w), 'no write payload may carry guidance: ' + w.slice(0, 90));
  });
  // Specifically not the performance-log column.
  assert.ok(!/notes:\s*ex\.programGuidance/.test(WORKOUT));
  assert.ok(!/workout_exercises[\s\S]{0,200}programGuidance/.test(WORKOUT));
  // And not into localStorage as standalone content.
  const ls = WORKOUT.match(/localStorage\.setItem\([^)]*\)/g) || [];
  ls.forEach((c) => assert.ok(!/programGuidance/.test(c), c));
});

test('guidance: adds no query and no purchases fetch', () => {
  // The one-purchases-fetch invariant (CP3d-1) is unchanged.
  const hits = (WORKOUT.match(/from\('purchases'\)/g) || []).length;
  assert.strictEqual(hits, 1, 'still exactly one purchases fetch');
  // Guidance is read from the session already loaded; it issues nothing itself.
  GUIDANCE_FNS.forEach((n) => {
    const fn = extractFn(WORKOUT, n);
    assert.ok(!/supabaseClient/.test(fn), n + ' must not query');
  });
});

/* ── Mutation sensitivity ───────────────────────────────────────────────── */

test('guidance mutation: removing the slug gate would expose another Program', () => {
  const broken = WORKOUT.replace(
    'return typeof programSlug === \'string\' && PROGRAM_GUIDANCE_SLUGS[programSlug] === true;',
    'return true;');
  assert.notEqual(broken, WORKOUT, 'the gate body was not found to mutate');
  const s = guidanceSandbox(broken);
  assert.equal(s.programGuidanceEligible('muscle_gain'), true,
    'without the gate another Program IS eligible — otherwise the gate test proves nothing');
  assert.equal(guidanceSandbox().programGuidanceEligible('muscle_gain'), false);
});

test('guidance mutation: removing escaping would create live markup', () => {
  const escSrc = fs.readFileSync(path.join(__dirname, 'workout-history.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFn(escSrc, 'esc'), sandbox);
  const payload = '<img src=x onerror="alert(1)">';
  assert.match(sandbox.esc(payload), /&lt;img/);
  // Unescaped, the same string is live markup — which is what esc() prevents.
  assert.match(payload, /<img/);
  assert.match(recBlock(), /esc\(ex\.programGuidance\)/);
});

test('guidance mutation: not clearing on swap would leave stale text', () => {
  const broken = WORKOUT.replace('      ex.programGuidance = null;\n', '');
  assert.notEqual(broken, WORKOUT, 'the swap clear was not found to mutate');
  assert.ok(!/ex\.programGuidance = null;/.test(extractFn(broken, 'applySwap')),
    'without it the swapped exercise keeps the previous prescription guidance');
  assert.match(swapFn(), /ex\.programGuidance = null;/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 4.3.9B CP4c — Pike Lean in Full Body B (migration 20261002173108)
 *
 * The prescription carries its seconds target in reps_low/reps_high, exactly
 * like Side Plank and Wall Sit; everything that makes it TIME comes from the
 * canonical catalog row's tracking_type. These run the shipped page/recap code
 * against the real catalog rows rather than synthetic ids.
 * ══════════════════════════════════════════════════════════════════════════ */

const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');
const { rtNormalizeExercises } = require('./routine-core.js');

const PIKE_LEAN = 'c3d81925-04dc-4caf-b5ef-5b42740028e8';
const PIKE_PUSH_UP = 'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34';
const PUSH_UP = 'dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac';
const catalogRow = (id) => EXERCISE_CATALOG.find((x) => x.id === id);
// The page's library and the recap's tracking map, built from canonical rows.
const CP4C_LIB = [PIKE_LEAN, PIKE_PUSH_UP, PUSH_UP].map((id) => {
  const r = catalogRow(id);
  return { id: r.id, name: r.name, tracking_type: r.tracking_type };
});
const CP4C_TRACK = {};
CP4C_LIB.forEach((r) => { CP4C_TRACK[r.id] = { id: r.id, tracking_type: r.tracking_type }; });

const e4c = (name, exercise_id, sets, reps_low, reps_high, rest_sec, notes) =>
  ({ name, sets, reps_low, reps_high, notes, rest_sec, exercise_id });
// Full Body B as it is in production after CP4c (mirrors bodyweight-foundations.test.js).
const FULL_BODY_B = [
  e4c('Push-Up', PUSH_UP, 4, 6, 12, 75, BWF_NOTE['Push-Up']),
  e4c('Pike Lean', PIKE_LEAN, 3, 15, 30, 60, BWF_NOTE['Pike Lean']),
  e4c('Superman', 'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45', 3, 10, 12, 45, BWF_NOTE.Superman),
  e4c('Dead Bug', '9c8998ab-9713-43f4-940b-5f8feec39d3c', 3, 10, 10, 45, BWF_NOTE['Dead Bug']),
  e4c('Bird Dog', 'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56', 2, 8, 10, 45, BWF_NOTE['Bird Dog']),
];

test('CP4c: Pike Lean is time-tracked in the catalog and renders Sec, not Reps', () => {
  assert.equal(catalogRow(PIKE_LEAN).tracking_type, 'time');
  const s = makeSandbox({ library: CP4C_LIB }).sandbox;
  assert.equal(s.unitForExercise({ exercise_id: PIKE_LEAN }), 'sec');
  assert.equal(s.unitColumnLabel(s.unitForExercise({ exercise_id: PIKE_LEAN })), 'Sec');
  assert.equal(s.unitPlaceholder(s.unitForExercise({ exercise_id: PIKE_LEAN })), 'sec');
  // The exercise it replaced is rep-tracked — the unit follows the id, not the slot.
  assert.equal(s.unitForExercise({ exercise_id: PIKE_PUSH_UP }), 'reps');
  assert.equal(s.unitColumnLabel(s.unitForExercise({ exercise_id: PIKE_PUSH_UP })), 'Reps');
  // The 15–30 target is presented as seconds by the shared goal wording.
  assert.match(Progression.analyze({ repsLow: 15, repsHigh: 30, trackingType: 'time' }).goalRange.display, /sec/);
});

test('CP4c: timed Pike Lean work never reaches personal_records; Push-Up still does', async () => {
  const lean = { id: 'we-1', name: 'Pike Lean', exercise_id: PIKE_LEAN, customId: null,
    sets: [completedSet(null, 30), Object.assign(completedSet(20, 30), { id: 's2', set_number: 2 })] };
  const t = await runPRs([lean], { library: CP4C_LIB });
  assert.equal(prTouches(t), 0, 'no rep, volume or estimated-1RM evaluation for a hold');
  assert.deepEqual(t.writes, []);
  // Same workout with a weighted (vest) rep-tracked Push-Up: only the Push-Up
  // reaches the table, so the zero above is the unit guard working, not an inert
  // harness. (PR logic only considers sets with a recorded weight — which is why
  // the 20 lb Pike Lean set above is the case that matters.)
  const pu = { id: 'we-2', name: 'Push-Up', exercise_id: PUSH_UP, customId: null, sets: [completedSet(10, 12)] };
  const mixed = await runPRs([lean, pu], { library: CP4C_LIB });
  assert.ok(prTouches(mixed) > 0, 'the rep-tracked Push-Up is still evaluated');
});

test('CP4c: the recap counts Pike Lean as time only — never reps or pound-volume', () => {
  const stats = runRecap([
    { name: 'Push-Up', exercise_id: PUSH_UP, sets: [set(10), set(8)] },
    { name: 'Pike Lean', exercise_id: PIKE_LEAN, sets: [set(30), set(25), set(20, 20)] },
  ], { byId: CP4C_TRACK, failed: false });
  assert.equal(statFor(stats, 'time').value, '1:15', '30 + 25 + 20 seconds');
  assert.equal(statFor(stats, 'reps').value, '18', 'only the Push-Up reps; Pike Lean seconds never enter reps');
  assert.equal(statFor(stats, 'lb volume').value, '0', 'a 20 lb hold is not 20 × 20 lb of volume');
});

test('CP4c: Pike Lean guidance is plain text, shown only on the Bodyweight Foundations path', () => {
  const s = guidanceSandbox();
  const entry = FULL_BODY_B[1];
  assert.equal(s.programGuidanceEligible('bodyweight_foundations') ? s.readProgramGuidance(entry) : null,
    BWF_NOTE['Pike Lean']);
  ['muscle_gain', 'fat_loss_blueprint', 'glute_builder', null].forEach((slug) => {
    assert.equal(s.programGuidanceEligible(slug), false, String(slug));
  });
  // Escaping is a no-op on this text: it is plain words, no markup to neutralise.
  const escSrc = fs.readFileSync(path.join(__dirname, 'workout-history.js'), 'utf8');
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(extractFn(escSrc, 'esc'), sb);
  assert.equal(sb.esc(BWF_NOTE['Pike Lean']), BWF_NOTE['Pike Lean']);
  assert.equal(sb.esc(BWF_NOTE['Push-Up']), BWF_NOTE['Push-Up']);
});

test('CP4c: resume re-derives Pike Lean guidance and its seconds target; a swapped row gets none', async () => {
  function resumeSandbox(slug) {
    const sandbox = {
      console: { error() {}, warn() {} },
      exercises: [
        { name: 'Push-Up', programGuidance: 'stale' },
        { name: 'Pike Lean', programGuidance: 'stale' },
        { name: 'Pike Push-Up', programGuidance: 'stale' },   // what a Swap away from Pike Lean leaves
      ],
      loadProgramSession: async () => ({ exercises: rtNormalizeExercises(FULL_BODY_B) }),
    };
    vm.createContext(sandbox);
    const decl = (WORKOUT.match(/var PROGRAM_GUIDANCE_SLUGS = \{[\s\S]*?\};/) || [''])[0];
    vm.runInContext(decl + '\n' + GUIDANCE_FNS.concat(['applyTemplateRanges'])
      .map((n) => extractFn(WORKOUT, n)).join('\n'), sandbox);
    return sandbox.applyTemplateRanges(slug, 'full_b').then(() => sandbox.exercises);
  }
  const [pu, lean, swapped] = await resumeSandbox('bodyweight_foundations');
  assert.equal(pu.programGuidance, BWF_NOTE['Push-Up']);
  assert.deepEqual([pu.reps_low, pu.reps_high, pu.target_sets], [6, 12, 4]);
  assert.equal(lean.programGuidance, BWF_NOTE['Pike Lean']);
  assert.deepEqual([lean.reps_low, lean.reps_high, lean.target_sets], [15, 30, 3]);
  assert.equal(swapped.programGuidance, null, 'a name miss never keeps stale guidance');
  assert.equal(swapped.reps_low, undefined, 'and takes no prescription it does not own');
  // Another Program's slug gets no guidance at all on resume.
  (await resumeSandbox('muscle_gain')).forEach((x) => assert.equal(x.programGuidance, null, x.name));
});
