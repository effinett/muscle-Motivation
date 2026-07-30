'use strict';
// Phase 4.2.1J — exercise logging reliability. Exercises the pure core in
// exercise-log.js: ID-first logged-exercise identity, chronological
// previous-session selection, and set-value sanitization. This is the exact
// logic workout.html consumes for previous-performance, history, live PR, and
// set persistence — so identity/comparison correctness is verified here in Node
// rather than only in the browser.
const test = require('node:test');
const assert = require('node:assert');
const EL = require('./exercise-log.js');
const EI = require('./exercise-core.js');

// Stable canonical ids (any distinct strings stand in for real exercises.id).
const BENCH = 'id-barbell-bench';
const SMITH = 'id-smith-bench';
const PULLUP = 'id-pullup';
const ASSISTED = 'id-assisted-pullup';

// Helpers mirroring how workout.html builds references / rows.
const ref = (o) => Object.assign({ exerciseId: null, customId: null, name: '' }, o);
const row = (o) => Object.assign({ exercise_id: null, exercise_name: '', user_exercise_id: null }, o);

// ── Normalizer parity ────────────────────────────────────────────────────────
test('normalizeName matches exercise-core (no identity drift)', () => {
  ['Incline DB Press', "Farmer's Carry", 'PULL  up', 'weird--name', 'Smith Machine Bench Press'].forEach((n) => {
    assert.strictEqual(EL.normalizeName(n), EI.normalizeExerciseName(n));
  });
});

// ── Identity: canonical vs canonical (id equality) ───────────────────────────
test('same canonical id → same exercise', () => {
  assert.strictEqual(
    EL.sameLoggedExercise(ref({ exerciseId: BENCH, name: 'Bench Press' }),
      row({ exercise_id: BENCH, exercise_name: 'Bench Press' })), true);
});

test('barbell bench ≠ smith machine bench (distinct canonical ids)', () => {
  assert.strictEqual(
    EL.sameLoggedExercise(ref({ exerciseId: BENCH, name: 'Bench Press' }),
      row({ exercise_id: SMITH, exercise_name: 'Smith Machine Bench Press' })), false);
});

test('pull-up ≠ assisted pull-up (distinct canonical ids)', () => {
  assert.strictEqual(
    EL.sameLoggedExercise(ref({ exerciseId: PULLUP, name: 'Pull-Up' }),
      row({ exercise_id: ASSISTED, exercise_name: 'Assisted Pull-Up' })), false);
});

// ── Identity: legacy NULL canonical rows ─────────────────────────────────────
test('canonical ref folds in a legacy NULL row with the same canonical name', () => {
  // Pre-4.2.1F logs stored the canonical name with exercise_id = NULL.
  assert.strictEqual(
    EL.sameLoggedExercise(ref({ exerciseId: BENCH, name: 'Bench Press' }),
      row({ exercise_id: null, exercise_name: 'Bench Press' })), true);
});

test('canonical ref does NOT fold in a differently-named NULL row', () => {
  assert.strictEqual(
    EL.sameLoggedExercise(ref({ exerciseId: BENCH, name: 'Bench Press' }),
      row({ exercise_id: null, exercise_name: 'Incline Bench Press' })), false);
});

// ── Identity: canonical vs same-name custom never merge ───────────────────────
test('canonical vs same-name custom: custom carries no canonical id → never merged from either side', () => {
  // A custom can never take a canonical name (4.2.1H), but even if a free-typed
  // NULL row shared the name, direction matters:
  const canonRef = ref({ exerciseId: BENCH, name: 'Bench Press' });
  const customRow = row({ exercise_id: null, exercise_name: 'My Bench', user_exercise_id: 'cust-1' });
  assert.strictEqual(EL.sameLoggedExercise(canonRef, customRow), false); // different names anyway
  // From the custom's perspective, a canonical row is never inherited.
  const customRef = ref({ customId: 'cust-1', name: 'My Bench' });
  const canonRow = row({ exercise_id: BENCH, exercise_name: 'Bench Press' });
  assert.strictEqual(EL.sameLoggedExercise(customRef, canonRow), false);
});

test('custom ref never inherits a canonical-id row even with an equal name', () => {
  // Defensive: a canonical-id row is off-limits to a custom/free reference.
  const customRef = ref({ name: 'Bench Press' }); // free-typed, no ids
  const canonRow = row({ exercise_id: BENCH, exercise_name: 'Bench Press' });
  assert.strictEqual(EL.sameLoggedExercise(customRef, canonRow), false);
});

// ── Identity: two same-name customs with different ids stay distinct ──────────
test('two same-name customs with different ids are distinct when ids are known', () => {
  const a = ref({ customId: 'cust-A', name: 'Sled Push' });
  const rowB = row({ exercise_id: null, exercise_name: 'Sled Push', user_exercise_id: 'cust-B' });
  assert.strictEqual(EL.sameLoggedExercise(a, rowB), false);
  const rowA = row({ exercise_id: null, exercise_name: 'Sled Push', user_exercise_id: 'cust-A' });
  assert.strictEqual(EL.sameLoggedExercise(a, rowA), true);
});

test('same-name custom falls back to name equality when ids are unknown (legacy rows)', () => {
  // Today workout_exercises does not persist the custom id; a custom reference
  // with no known id matches its own name-snapshot rows.
  const a = ref({ name: 'Sled Push' });
  assert.strictEqual(
    EL.sameLoggedExercise(a, row({ exercise_id: null, exercise_name: 'Sled Push' })), true);
});

// ── Identity: renamed custom does not rewrite history ────────────────────────
test('renamed custom does not match its old name-snapshot rows (history stays under old name)', () => {
  const renamed = ref({ name: 'Bulgarian Split Squat' }); // was "Split Squat"
  assert.strictEqual(
    EL.sameLoggedExercise(renamed, row({ exercise_id: null, exercise_name: 'Split Squat' })), false);
});

// ── filterLoggedMatches + progression comparability ──────────────────────────
test('filterLoggedMatches keeps only same-identity rows', () => {
  const r = ref({ exerciseId: BENCH, name: 'Bench Press' });
  const rows = [
    row({ exercise_id: BENCH, exercise_name: 'Bench Press' }),      // ✓
    row({ exercise_id: SMITH, exercise_name: 'Smith Bench' }),       // ✗ different canonical
    row({ exercise_id: null, exercise_name: 'Bench Press' }),        // ✓ legacy
    row({ exercise_id: null, exercise_name: 'Dumbbell Bench Press' })// ✗ different name
  ];
  assert.strictEqual(EL.filterLoggedMatches(r, rows).length, 2);
});

test('isComparableForProgression: substitution does not inherit prior exercise', () => {
  const bench = { exerciseId: BENCH, name: 'Bench Press' };
  const smith = { exerciseId: SMITH, name: 'Smith Machine Bench Press' };
  assert.strictEqual(EL.isComparableForProgression(bench, smith), false);
  assert.strictEqual(EL.isComparableForProgression(bench, { exerciseId: BENCH, name: 'Bench Press' }), true);
});

// ── Chronology: previous-session selection ───────────────────────────────────
const S = (o) => Object.assign({ workoutId: 'w', date: null, createdAt: null, completed: true }, o);

test('selectPreviousSessions excludes the current workout', () => {
  const sessions = [
    S({ workoutId: 'cur', date: '2026-07-30' }),
    S({ workoutId: 'prev', date: '2026-07-20' })
  ];
  const out = EL.selectPreviousSessions(sessions, { excludeWorkoutId: 'cur', now: '2026-07-31' });
  assert.deepStrictEqual(out.map((s) => s.workoutId), ['prev']);
});

test('selectPreviousSessions excludes incomplete (draft/abandoned) sessions', () => {
  const sessions = [
    S({ workoutId: 'draft', date: '2026-07-29', completed: false }),
    S({ workoutId: 'done', date: '2026-07-20', completed: true })
  ];
  const out = EL.selectPreviousSessions(sessions, { now: '2026-07-31' });
  assert.deepStrictEqual(out.map((s) => s.workoutId), ['done']);
});

test('selectPreviousSessions excludes future-dated rows', () => {
  const sessions = [
    S({ workoutId: 'future', date: '2026-08-15' }),
    S({ workoutId: 'past', date: '2026-07-10' })
  ];
  const out = EL.selectPreviousSessions(sessions, { now: '2026-07-31' });
  assert.deepStrictEqual(out.map((s) => s.workoutId), ['past']);
});

test('selectPreviousSessions orders by date desc, then createdAt, then id (deterministic)', () => {
  const sessions = [
    S({ workoutId: 'a', date: '2026-07-10', createdAt: '2026-07-10T08:00:00Z' }),
    S({ workoutId: 'b', date: '2026-07-20', createdAt: '2026-07-20T08:00:00Z' }),
    S({ workoutId: 'c', date: '2026-07-20', createdAt: '2026-07-20T12:00:00Z' }) // same date, later create
  ];
  const out = EL.selectPreviousSessions(sessions, { now: '2026-07-31' });
  assert.deepStrictEqual(out.map((s) => s.workoutId), ['c', 'b', 'a']);
});

test('recencyCompare is a stable total order (no ties collapse identical dates)', () => {
  const a = { workoutId: 'a', date: '2026-07-20', createdAt: '2026-07-20T00:00:00Z' };
  const b = { workoutId: 'b', date: '2026-07-20', createdAt: '2026-07-20T00:00:00Z' };
  assert.notStrictEqual(EL.recencyCompare(a, b), 0);
  assert.strictEqual(EL.recencyCompare(a, b), -EL.recencyCompare(b, a));
});

// ── Set-value sanitization ───────────────────────────────────────────────────
test('sanitizeReps: blank stays blank; zero stays zero', () => {
  assert.deepStrictEqual(EL.sanitizeReps(''), { value: null, valid: true });
  assert.deepStrictEqual(EL.sanitizeReps(null), { value: null, valid: true });
  assert.deepStrictEqual(EL.sanitizeReps(0), { value: 0, valid: true });
  assert.deepStrictEqual(EL.sanitizeReps('8'), { value: 8, valid: true });
});

test('sanitizeReps: rejects NaN / Infinity / negative / absurd', () => {
  assert.deepStrictEqual(EL.sanitizeReps('abc'), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeReps(Infinity), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeReps(-3), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeReps(999999), { value: null, valid: false });
});

test('sanitizeReps: rounds an accidental decimal to a whole count', () => {
  assert.deepStrictEqual(EL.sanitizeReps('8.4'), { value: 8, valid: true });
});

test('sanitizeWeight: blank stays blank (bodyweight); decimals preserved', () => {
  assert.deepStrictEqual(EL.sanitizeWeight(''), { value: null, valid: true });
  assert.deepStrictEqual(EL.sanitizeWeight('137.5'), { value: 137.5, valid: true });
  assert.deepStrictEqual(EL.sanitizeWeight(0), { value: 0, valid: true });
});

test('sanitizeWeight: rejects NaN / Infinity / negative / absurd', () => {
  assert.deepStrictEqual(EL.sanitizeWeight('xyz'), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeWeight(Infinity), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeWeight(-45), { value: null, valid: false });
  assert.deepStrictEqual(EL.sanitizeWeight(1e9), { value: null, valid: false });
});

test('sanitizeSetField dispatches by field name', () => {
  assert.deepStrictEqual(EL.sanitizeSetField('reps', '5'), { value: 5, valid: true });
  assert.deepStrictEqual(EL.sanitizeSetField('weight_lbs', '95.5'), { value: 95.5, valid: true });
  assert.deepStrictEqual(EL.sanitizeSetField('unknown', 'x'), { value: 'x', valid: true });
});
