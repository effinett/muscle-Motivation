/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP7 — history → Routine candidacy
 *
 * Fixtures mirror the live history shape measured before the rules were
 * written: workouts.completed, workout_exercises with exercise_id XOR
 * user_exercise_id (else name-only), workout_sets with completed / is_warmup /
 * reps / weight_lbs.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  RH_READY, RH_NEEDS_REVIEW, RH_BLOCKED,
  RH_CANONICAL, RH_CUSTOM, RH_LEGACY,
  RH_NOT_OWNED, RH_WORKOUT_IN_PROGRESS, RH_EMPTY_WORKOUT, RH_NO_COMPLETED_SETS,
  RH_MISSING_EXERCISE_IDENTITY, RH_CUSTOM_IDENTITY_UNSUPPORTED,
  rhClassifyExerciseIdentity, rhIsQualifyingSet, rhDerivePrescription,
  rhAnalyzeWorkout, rhResolveEntry, rhRecheck, rhCandidateExercises,
} = require('./routine-history.js');
const { rtValidateExercises, RT_VALID, RT_DEFAULTS } = require('./routine-core.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const OWNER = 'owner-1';
const CANON = 'b691b1f7-73a0-415a-854d-41941bdfb5de';

const wk = (over = {}) => ({ id: 'w1', user_id: OWNER, name: 'Push Day A',
  completed: true, ...over });
const ex = (over = {}) => ({ id: 'e1', exercise_name: 'Bench Press',
  exercise_id: CANON, user_exercise_id: null, ...over });
const set = (reps, over = {}) => ({ reps, completed: true, is_warmup: false,
  weight_lbs: 135, ...over });

// setsFor helper from a map of exerciseId → sets
const feeder = (map) => (id) => map[id] || [];

/* ── 1 · identity classification ────────────────────────────────────────── */

test('identity: decided from columns only, never from the name', () => {
  assert.strictEqual(rhClassifyExerciseIdentity(ex()), RH_CANONICAL);
  assert.strictEqual(rhClassifyExerciseIdentity(
    ex({ exercise_id: null, user_exercise_id: 'cust-1' })), RH_CUSTOM);
  assert.strictEqual(rhClassifyExerciseIdentity(
    ex({ exercise_id: null, user_exercise_id: null })), RH_LEGACY);
  assert.strictEqual(rhClassifyExerciseIdentity(null), RH_LEGACY);
});

test('identity: canonical wins when both columns are somehow present', () => {
  assert.strictEqual(rhClassifyExerciseIdentity(
    ex({ exercise_id: CANON, user_exercise_id: 'cust-1' })), RH_CANONICAL);
});

test('identity: the module performs no name matching of any kind', () => {
  const src = readCode('routine-history.js');
  for (const banned of ['normalizeExerciseName', 'libraryExerciseId', 'exerciseLibrary',
    'toLowerCase', 'ILIKE', 'fuzzy', 'similar', 'levenshtein']) {
    assert.ok(!src.includes(banned), `must not use ${banned} to resolve identity`);
  }
});

/* ── 2 · qualifying sets ────────────────────────────────────────────────── */

test('sets: only completed, non-warmup, positive whole reps qualify', () => {
  assert.strictEqual(rhIsQualifyingSet(set(10)), true);
  assert.strictEqual(rhIsQualifyingSet(set(10, { completed: false })), false);
  assert.strictEqual(rhIsQualifyingSet(set(10, { is_warmup: true })), false);
  assert.strictEqual(rhIsQualifyingSet(set(0)), false);
  assert.strictEqual(rhIsQualifyingSet(set(-5)), false);
  assert.strictEqual(rhIsQualifyingSet(set(8.5)), false);
  assert.strictEqual(rhIsQualifyingSet(set(null)), false);
  assert.strictEqual(rhIsQualifyingSet(set('10')), false, 'strings are not reps');
  assert.strictEqual(rhIsQualifyingSet(null), false);
});

/* ── 3 · prescription derivation ────────────────────────────────────────── */

test('derive: sets = count, reps = observed min/max', () => {
  const d = rhDerivePrescription(ex(), [set(10), set(10), set(8)]);
  assert.strictEqual(d.prescription.sets, 3);
  assert.strictEqual(d.prescription.reps_low, 8);
  assert.strictEqual(d.prescription.reps_high, 10);
});

test('derive: a constant rep count yields an equal low and high', () => {
  const d = rhDerivePrescription(ex(), [set(12), set(12), set(12)]);
  assert.strictEqual(d.prescription.reps_low, 12);
  assert.strictEqual(d.prescription.reps_high, 12);
});

test('derive: non-qualifying sets are excluded from BOTH count and range', () => {
  const d = rhDerivePrescription(ex(), [
    set(10), set(3, { is_warmup: true }), set(99, { completed: false }), set(8),
  ]);
  assert.strictEqual(d.prescription.sets, 2, 'warmup and incomplete excluded');
  assert.strictEqual(d.prescription.reps_low, 8);
  assert.strictEqual(d.prescription.reps_high, 10, 'the 99 must not widen the range');
});

test('derive: historical LOAD is never carried into the Routine', () => {
  const d = rhDerivePrescription(ex(), [set(10, { weight_lbs: 225 })]);
  assert.ok(!Object.hasOwn(d.prescription, 'weight_lbs'));
  assert.ok(!Object.hasOwn(d.prescription, 'load'));
  assert.deepStrictEqual(Object.keys(d.prescription),
    ['name', 'exercise_id', 'sets', 'reps_low', 'reps_high', 'notes', 'rest_sec']);
});

test('derive: notes are empty — performance logs are not coaching notes', () => {
  const d = rhDerivePrescription(ex({ notes: 'felt heavy today, shoulder twinge' }),
    [set(10, { notes: 'last rep grinder' })]);
  assert.strictEqual(d.prescription.notes, '');
});

test('derive: rest uses the CP3 default and says so', () => {
  const d = rhDerivePrescription(ex(), [set(10)]);
  assert.strictEqual(d.prescription.rest_sec, RT_DEFAULTS.restSec);
  assert.strictEqual(d.restDefaulted, true, 'the UI must be able to disclose this');
});

test('derive: no qualifying sets yields no prescription and an issue', () => {
  const d = rhDerivePrescription(ex(), [set(10, { completed: false })]);
  assert.strictEqual(d.prescription, null);
  assert.ok(d.issues.includes(RH_NO_COMPLETED_SETS));
});

test('derive: custom and legacy identities are flagged, never resolved', () => {
  const custom = rhDerivePrescription(
    ex({ exercise_id: null, user_exercise_id: 'cust-1' }), [set(10)]);
  assert.ok(custom.issues.includes(RH_CUSTOM_IDENTITY_UNSUPPORTED));
  assert.strictEqual(custom.prescription.exercise_id, null, 'never invented');
  assert.strictEqual(custom.resolved, false);

  const legacy = rhDerivePrescription(
    ex({ exercise_id: null, user_exercise_id: null }), [set(10)]);
  assert.ok(legacy.issues.includes(RH_MISSING_EXERCISE_IDENTITY));
  assert.strictEqual(legacy.prescription.exercise_id, null);
});

/* ── 4 · workout candidacy ──────────────────────────────────────────────── */

test('candidacy: a completed all-canonical workout is ready', () => {
  const r = rhAnalyzeWorkout(wk(), [ex()], feeder({ e1: [set(10), set(8)] }), OWNER);
  assert.strictEqual(r.status, RH_READY);
  assert.strictEqual(r.eligible, true);
  assert.deepStrictEqual(r.issues, []);
  assert.strictEqual(r.candidate.name, 'Push Day A');
  assert.strictEqual(r.candidate.sourceWorkoutId, 'w1');
});

test('candidacy: an in-progress workout is BLOCKED', () => {
  const r = rhAnalyzeWorkout(wk({ completed: false }), [ex()],
    feeder({ e1: [set(10)] }), OWNER);
  assert.strictEqual(r.status, RH_BLOCKED);
  assert.ok(r.issues.includes(RH_WORKOUT_IN_PROGRESS));
  assert.strictEqual(r.candidate, null, 'a blocked workout yields no candidate');
});

test('candidacy: another user\'s workout is BLOCKED', () => {
  const r = rhAnalyzeWorkout(wk({ user_id: 'someone-else' }), [ex()],
    feeder({ e1: [set(10)] }), OWNER);
  assert.strictEqual(r.status, RH_BLOCKED);
  assert.ok(r.issues.includes(RH_NOT_OWNED));
});

test('candidacy: an empty workout is BLOCKED', () => {
  const r = rhAnalyzeWorkout(wk(), [], feeder({}), OWNER);
  assert.strictEqual(r.status, RH_BLOCKED);
  assert.ok(r.issues.includes(RH_EMPTY_WORKOUT));
});

test('candidacy: a workout with no usable sets anywhere is BLOCKED', () => {
  const r = rhAnalyzeWorkout(wk(), [ex()],
    feeder({ e1: [set(10, { completed: false })] }), OWNER);
  assert.strictEqual(r.status, RH_BLOCKED);
  assert.ok(r.issues.includes(RH_NO_COMPLETED_SETS));
});

test('candidacy: any unresolved identity forces NEEDS_REVIEW, not ready', () => {
  const r = rhAnalyzeWorkout(wk(), [ex(), ex({ id: 'e2', exercise_name: 'Some Move',
    exercise_id: null, user_exercise_id: null })],
    feeder({ e1: [set(10)], e2: [set(12)] }), OWNER);
  assert.strictEqual(r.status, RH_NEEDS_REVIEW);
  assert.strictEqual(r.eligible, false, 'needs_review must never be eligible');
  assert.ok(r.issues.includes(RH_MISSING_EXERCISE_IDENTITY));
});

test('candidacy: a custom exercise forces NEEDS_REVIEW', () => {
  const r = rhAnalyzeWorkout(wk(), [ex({ exercise_id: null, user_exercise_id: 'c1' })],
    feeder({ e1: [set(10)] }), OWNER);
  assert.strictEqual(r.status, RH_NEEDS_REVIEW);
  assert.ok(r.issues.includes(RH_CUSTOM_IDENTITY_UNSUPPORTED));
});

test('candidacy: exercise order is preserved exactly as logged', () => {
  const rows = ['A', 'B', 'C', 'D'].map((n, i) =>
    ex({ id: 'e' + i, exercise_name: n }));
  const sets = {}; rows.forEach((r) => { sets[r.id] = [set(10)]; });
  const r = rhAnalyzeWorkout(wk(), rows, feeder(sets), OWNER);
  assert.deepStrictEqual(r.candidate.exercises.map((e) => e.name), ['A', 'B', 'C', 'D']);
});

test('candidacy: the workout name becomes the proposed Routine name', () => {
  const r = rhAnalyzeWorkout(wk({ name: '  Leg Day  ' }), [ex()],
    feeder({ e1: [set(10)] }), OWNER);
  assert.strictEqual(r.candidate.name, 'Leg Day', 'trimmed, not replaced');
});

test('candidacy: a nameless workout needs review rather than a generic name', () => {
  const r = rhAnalyzeWorkout(wk({ name: '' }), [ex()], feeder({ e1: [set(10)] }), OWNER);
  assert.strictEqual(r.status, RH_NEEDS_REVIEW);
  assert.strictEqual(r.candidate.name, '', 'no invented name');
});

test('candidacy: malformed set data is handled without throwing', () => {
  for (const bad of [null, undefined, 'x', 42, [null, 'x', {}]]) {
    const r = rhAnalyzeWorkout(wk(), [ex()], () => bad, OWNER);
    assert.ok([RH_BLOCKED, RH_NEEDS_REVIEW].includes(r.status));
  }
});

test('candidacy: malformed workout input fails closed', () => {
  for (const bad of [null, undefined, 'w1', 42]) {
    assert.strictEqual(rhAnalyzeWorkout(bad, [ex()], feeder({}), OWNER).status, RH_BLOCKED);
  }
});

/* ── 5 · history is never mutated ───────────────────────────────────────── */

test('immutability: analysis does not mutate the history objects', () => {
  const workout = wk();
  const rows = [ex(), ex({ id: 'e2', exercise_id: null, user_exercise_id: 'c1' })];
  const sets = { e1: [set(10), set(8)], e2: [set(12)] };
  const before = JSON.stringify({ workout, rows, sets });
  rhAnalyzeWorkout(workout, rows, feeder(sets), OWNER);
  assert.strictEqual(JSON.stringify({ workout, rows, sets }), before,
    'history is evidence — analysis must never write to it');
});

test('immutability: resolving an entry does not mutate the original entry', () => {
  const d = rhDerivePrescription(ex({ exercise_id: null, user_exercise_id: null }), [set(10)]);
  const before = JSON.stringify(d);
  rhResolveEntry(d, CANON, 'Bench Press');
  assert.strictEqual(JSON.stringify(d), before);
});

/* ── 6 · manual resolution ──────────────────────────────────────────────── */

test('resolve: an explicit user pick is the only way to gain identity', () => {
  const d = rhDerivePrescription(ex({ exercise_id: null, user_exercise_id: null }), [set(10)]);
  assert.strictEqual(d.resolved, false);
  const fixed = rhResolveEntry(d, CANON, 'Bench Press');
  assert.strictEqual(fixed.identity, RH_CANONICAL);
  assert.strictEqual(fixed.resolved, true);
  assert.strictEqual(fixed.prescription.exercise_id, CANON);
  assert.strictEqual(fixed.prescription.name, 'Bench Press');
});

test('resolve: the derived prescription survives resolution unchanged', () => {
  const d = rhDerivePrescription(ex({ exercise_id: null, user_exercise_id: null }),
    [set(10), set(6)]);
  const fixed = rhResolveEntry(d, CANON, 'Bench Press');
  assert.strictEqual(fixed.prescription.sets, 2);
  assert.strictEqual(fixed.prescription.reps_low, 6);
  assert.strictEqual(fixed.prescription.reps_high, 10);
});

test('resolve: a bad id is refused rather than applied', () => {
  const d = rhDerivePrescription(ex({ exercise_id: null, user_exercise_id: null }), [set(10)]);
  for (const bad of ['', null, 42, undefined]) {
    assert.strictEqual(rhResolveEntry(d, bad).resolved, false);
  }
});

test('resolve: a set-data issue survives an identity fix', () => {
  const d = rhDerivePrescription(ex({ exercise_id: null, user_exercise_id: null }),
    [set(10, { completed: false })]);
  const fixed = rhResolveEntry(d, CANON, 'Bench Press');
  assert.ok(fixed.issues.includes(RH_NO_COMPLETED_SETS), 'identity fix is not a blanket fix');
  assert.strictEqual(fixed.resolved, false);
});

test('recheck: a fully resolved candidate becomes ready', () => {
  const rows = [ex(), ex({ id: 'e2', exercise_name: 'Mystery', exercise_id: null,
    user_exercise_id: null })];
  const r = rhAnalyzeWorkout(wk(), rows, feeder({ e1: [set(10)], e2: [set(12)] }), OWNER);
  assert.strictEqual(r.status, RH_NEEDS_REVIEW);

  const entries = r.entries.map((e) =>
    e.resolved ? e : rhResolveEntry(e, CANON, 'Barbell Row'));
  const after = rhRecheck('Push Day A', entries);
  assert.strictEqual(after.status, RH_READY);
  assert.strictEqual(after.eligible, true);
  assert.strictEqual(after.candidate.exercises.length, 2);
});

test('recheck: one unresolved entry keeps the whole candidate ineligible', () => {
  const rows = [ex(), ex({ id: 'e2', exercise_id: null, user_exercise_id: null })];
  const r = rhAnalyzeWorkout(wk(), rows, feeder({ e1: [set(10)], e2: [set(12)] }), OWNER);
  const after = rhRecheck('Push Day A', r.entries);   // nothing resolved
  assert.strictEqual(after.eligible, false);
});

/* ── 7 · the candidate satisfies the CP3 contract ───────────────────────── */

test('contract: a ready candidate passes routine-core validation', () => {
  const r = rhAnalyzeWorkout(wk(), [ex(), ex({ id: 'e2', exercise_name: 'Squat' })],
    feeder({ e1: [set(10), set(8)], e2: [set(5)] }), OWNER);
  const normalized = rhCandidateExercises(r.candidate);
  assert.strictEqual(rtValidateExercises(normalized).status, RT_VALID,
    'every entry must carry canonical identity');
  assert.strictEqual(normalized.length, 2);
});

test('contract: normalization is delegated, not re-implemented', () => {
  const src = readCode('routine-history.js');
  assert.match(src, /rtNormalizeExercises/);
  assert.ok(!/isNaN\(lo\)|reps_low\s*=\s*8/.test(src), 'no duplicated CP3 defaults');
});

/* ── 8 · purity and scope ───────────────────────────────────────────────── */

test('purity: no DOM, Supabase, fetch or navigation', () => {
  const src = readCode('routine-history.js');
  for (const banned of ['document', 'window.', 'supabaseClient', 'fetch(',
    'localStorage', 'sessionStorage', 'location.']) {
    assert.ok(!src.includes(banned), `must not reference ${banned}`);
  }
});

test('purity: deterministic', () => {
  const rows = [ex(), ex({ id: 'e2', exercise_id: null, user_exercise_id: 'c1' })];
  const sets = { e1: [set(10), set(8)], e2: [set(12)] };
  const first = JSON.stringify(rhAnalyzeWorkout(wk(), rows, feeder(sets), OWNER));
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(JSON.stringify(rhAnalyzeWorkout(wk(), rows, feeder(sets), OWNER)), first);
  }
});

test('scope: no AI, no scoring, no progression inference', () => {
  const src = readCode('routine-history.js');
  for (const banned of ['anthropic', 'openai', 'score', 'rank', 'recommend',
    'progression', 'suggest', 'quality']) {
    assert.ok(!new RegExp(banned, 'i').test(src), `CP7 is deterministic: no ${banned}`);
  }
});

test('scope: CP8 not started — no Program coupling', () => {
  const src = readCode('routine-history.js');
  for (const cp8 of ['program_workouts', 'program_slug', 'session_key', 'is_platform']) {
    assert.ok(!src.includes(cp8), `${cp8} belongs to CP8 / platform authoring`);
  }
});

/* ── 9 · UI wiring (CP7) ────────────────────────────────────────────────── */

test('ui: Save as Routine opens a review, it does not create anything', () => {
  const src = readCode('workout.html');
  assert.match(src, /function openRoutineReview/);
  const open = src.slice(src.indexOf('function openRoutineReview'),
    src.indexOf('function cancelRoutineReview'));
  assert.ok(!/\.insert\(/.test(open), 'opening the review must never write');
  assert.match(open, /rhAnalyzeWorkout/, 'it analyses first');
});

test('ui: creation is gated on eligibility, twice', () => {
  const src = readCode('workout.html');
  const create = src.slice(src.indexOf('async function createRoutineFromHistory'),
    src.indexOf('var trainPane'));
  assert.match(create, /rhRecheck/, 're-checks at create time');
  assert.match(create, /if \(!check\.eligible\)/, 'refuses an ineligible candidate');
  assert.match(create, /beginAction\('createRoutine'\)/, 'idempotent under double-tap');
});

test('ui: the created Routine is private, user-owned and not platform', () => {
  const src = readCode('workout.html');
  const create = src.slice(src.indexOf('async function createRoutineFromHistory'),
    src.indexOf('var trainPane'));
  assert.match(create, /user_id: currentUser\.id/);
  assert.match(create, /source_workout_id: reviewState\.workout\.id/);
  // is_platform / visibility are never sent: the column defaults plus the CP4
  // INSERT policy make a platform or published row impossible from here.
  assert.ok(!/is_platform/.test(create) && !/visibility/.test(create),
    'client must not attempt to set platform or publication state');
});

test('ui: conversion writes nothing to history', () => {
  const src = readCode('workout.html');
  const block = src.slice(src.indexOf('function openRoutineReview'),
    src.indexOf('var trainPane'));
  for (const table of ['workouts', 'workout_exercises', 'workout_sets']) {
    assert.ok(!new RegExp(`from\\('${table}'\\)[\\s\\S]{0,80}\\.(insert|update|delete)`)
      .test(block), `conversion must never write ${table}`);
  }
});

test('ui: manual resolution goes through the normal picker', () => {
  const src = readCode('workout.html');
  assert.match(src, /openPickerFor\('resolve'\)/);
  assert.match(src, /pickerMode === 'resolve'/);
  // The resolve branch must return before any live-workout write.
  const sel = src.slice(src.indexOf('async function selectExercise'));
  const resolveAt = sel.indexOf("pickerMode === 'resolve'");
  const insertAt = sel.indexOf("from('workout_exercises')");
  assert.ok(resolveAt > -1 && resolveAt < insertAt,
    'resolving must not add an exercise to the live workout');
});

test('ui: a non-canonical pick is refused rather than stored', () => {
  const src = readCode('workout.html');
  const apply = src.slice(src.indexOf('function applyReviewResolution'),
    src.indexOf('async function createRoutineFromHistory'));
  assert.match(apply, /if \(!canonicalId\)/, 'a custom pick cannot resolve an entry');
});

test('ui: cancelling or leaving the review discards it', () => {
  const src = readCode('workout.html');
  assert.match(src, /function cancelRoutineReview[\s\S]{0,200}reviewState = null/);
  assert.match(src, /function showStartView[\s\S]{0,300}reviewState = null/,
    'any path back to the start view abandons the review');
});

test('ui: the history query supplies what the analyzer verifies', () => {
  const src = read('workout-history.js');
  for (const col of ['completed', 'user_id', 'is_warmup', 'exercise_id', 'user_exercise_id']) {
    assert.ok(src.includes(col), `history query must select ${col}`);
  }
  assert.match(src, /\.eq\('user_id', currentUser\.id\)/, 'owner-scoped');
  assert.match(src, /\.eq\('completed', true\)/, 'completed-only');
});

test('ui: Save as Routine only renders where it can actually be completed', () => {
  const src = read('workout-history.js');
  assert.match(src, /typeof openRoutineReview === 'function'/,
    'no dead-end button on a page without the picker');
});

test('perf: routine-history.js loads on Train only', () => {
  assert.match(read('workout.html'), /<script src="routine-history\.js"><\/script>/);
  for (const page of ['app.html', 'nutrition.html', 'weight-history.html']) {
    assert.ok(!read(page).includes('routine-history.js'), `${page} must not load it`);
  }
});

test('scope: CP7 did not touch program_workouts or platform authoring', () => {
  const src = readCode('workout.html');
  const block = src.slice(src.indexOf('function openRoutineReview'),
    src.indexOf('var trainPane'));
  for (const banned of ['program_workouts', 'routine-admin', 'is_platform', 'visibility']) {
    assert.ok(!block.includes(banned), `${banned} is out of CP7 scope`);
  }
  // CP8b cut Program execution over to canonical Routines, so Train no longer
  // reads legacy prescriptions at all. History conversion is unaffected either
  // way — it never touched Program data.
  assert.ok(!src.includes("from('program_workouts')"),
    'legacy prescription reads are gone after CP8b');
});
