/* ──────────────────────────────────────────────────────────────────────────
 * Tests for the Progressive Overload Engine (progression.js)
 *
 * Zero-dependency: uses Node's built-in test runner + assert.
 *   Run with:  npm test      (or:  node --test)
 *
 * progression.js is a pure module (no DB / DOM), so every branch of the
 * double-progression logic, PR detection, plateau detection, equipment
 * inference, and target-set resolution is testable here.
 * ────────────────────────────────────────────────────────────────────────── */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./progression.js');

// ── Helpers to build sessions/sets the way the engine expects ───────────────
// A set: { weight, reps, completed, is_warmup }. A session: { sets: [...] }.
function set(weight, reps, opts) {
  opts = opts || {};
  return {
    weight: weight,
    reps: reps,
    completed: opts.completed !== false, // default completed
    is_warmup: !!opts.is_warmup
  };
}

// `count` identical working sets at the given weight/reps.
function session(weight, reps, count, opts) {
  var sets = [];
  for (var i = 0; i < count; i++) sets.push(set(weight, reps, opts));
  return { sets: sets };
}

// ── inferEquipment ──────────────────────────────────────────────────────────
test('inferEquipment classifies by name', () => {
  assert.equal(P.inferEquipment('Push-up'), 'bodyweight');
  assert.equal(P.inferEquipment('Pull Up'), 'bodyweight');
  assert.equal(P.inferEquipment('Goblet Squat'), 'dumbbell');
  assert.equal(P.inferEquipment('Dumbbell Curl'), 'dumbbell');
  assert.equal(P.inferEquipment('Lat Pulldown'), 'cable');
  assert.equal(P.inferEquipment('Cable Row'), 'cable');
  assert.equal(P.inferEquipment('Leg Press'), 'machine');
  assert.equal(P.inferEquipment('Barbell Bench Press'), 'barbell');
  assert.equal(P.inferEquipment('Deadlift'), 'barbell');
  assert.equal(P.inferEquipment('Some Random Move'), 'other');
});

// ── roundWeight ─────────────────────────────────────────────────────────────
test('roundWeight snaps to nearest 5 and never goes negative', () => {
  assert.equal(P.roundWeight(137, 'barbell'), 135);
  assert.equal(P.roundWeight(138, 'barbell'), 140);
  assert.equal(P.roundWeight(100, 'dumbbell'), 100);
  assert.equal(P.roundWeight(-20, 'barbell'), 0);
  assert.equal(P.roundWeight(0, 'barbell'), 0);
  assert.equal(P.roundWeight(null, 'barbell'), null);
});

// ── weightIncrement ─────────────────────────────────────────────────────────
test('weightIncrement: heavy lower-body barbell jumps 10, others 5, bodyweight 0', () => {
  assert.equal(P.weightIncrement('barbell', 'Back Squat'), 10);
  assert.equal(P.weightIncrement('barbell', 'Deadlift'), 10);
  assert.equal(P.weightIncrement('barbell', 'Hip Thrust'), 10);
  assert.equal(P.weightIncrement('barbell', 'Bench Press'), 5);
  assert.equal(P.weightIncrement('dumbbell', 'Dumbbell Curl'), 5);
  assert.equal(P.weightIncrement('bodyweight', 'Push-up'), 0);
});

// ── estimate1RM (Epley) ─────────────────────────────────────────────────────
test('estimate1RM uses Epley; reps=1 returns the weight; bad input null', () => {
  assert.equal(P.estimate1RM(100, 1), 100);
  assert.ok(Math.abs(P.estimate1RM(100, 10) - 133.3333) < 0.001);
  assert.equal(P.estimate1RM(100, 0), null);
  assert.equal(P.estimate1RM(null, 5), null);
});

// ── analyze: no history (empty state) ───────────────────────────────────────
test('analyze with no history → start action, leans on goal range', () => {
  const r = P.analyze({ exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12 });
  assert.equal(r.hasHistory, false);
  assert.equal(r.action, 'start');
  assert.equal(r.recommendedWeight, null);
  assert.equal(r.recommendedReps, 8); // low end of range
  assert.equal(r.recommendedSets, 3); // category default
  assert.equal(r.equipment, 'barbell');
});

test('analyze with no history but a programmed weight → rounds the start weight', () => {
  const r = P.analyze({ exerciseName: 'Bench Press', programmedWeight: 137, programmedReps: 10 });
  assert.equal(r.action, 'start');
  assert.equal(r.recommendedWeight, 135);
  assert.equal(r.recommendedReps, 10);
});

// ── analyze: incomplete session never shrinks the target ────────────────────
test('analyze: fewer completed sets than target → incomplete, hold weight', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 12, 2)] // only 2 of 3 sets done
  });
  assert.equal(r.action, 'incomplete');
  assert.equal(r.recommendedWeight, 100); // held
  assert.equal(r.recommendedSets, 3);     // target not reduced to 2
});

// ── analyze: earned increase (topped the range on every set) ────────────────
test('analyze: all sets at top of range → increase weight, reset reps to low', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 12, 3)]
  });
  assert.equal(r.action, 'increase');
  assert.equal(r.recommendedWeight, 105); // +5 barbell upper
  assert.equal(r.recommendedReps, 8);     // back to bottom
});

test('analyze: heavy barbell lower lift jumps by 10 on increase', () => {
  const r = P.analyze({
    exerciseName: 'Back Squat', repsLow: 5, repsHigh: 8, targetSets: 3,
    history: [session(200, 8, 3)]
  });
  assert.equal(r.action, 'increase');
  assert.equal(r.recommendedWeight, 210);
});

// ── analyze: in range → hold and push reps ──────────────────────────────────
test('analyze: mid-range reps → hold weight, add a rep', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 10, 3)]
  });
  assert.equal(r.action, 'hold');
  assert.equal(r.recommendedWeight, 100);
  assert.equal(r.recommendedReps, 11); // +1 toward the top
});

// ── analyze: well below range → reduce ──────────────────────────────────────
test('analyze: reps well below the floor → reduce weight ~10%', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 5, 3)] // 5 < (8 - 2)
  });
  assert.equal(r.action, 'reduce');
  assert.equal(r.recommendedWeight, 90);
  assert.equal(r.recommendedReps, 8);
});

// ── analyze: plateau folds into deload guidance ─────────────────────────────
test('analyze: declining over the plateau window suggests a deload', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    // newest first, scores declining (reps=1 → score == weight): 100, 110, 120
    history: [session(100, 1, 3), session(110, 1, 3), session(120, 1, 3)]
  });
  assert.equal(r.deloadSuggested, true);
  assert.match(r.coachNote, /stalled/i);
});

// ── detectPlateau ───────────────────────────────────────────────────────────
test('detectPlateau: improvement across window → no plateau', () => {
  const res = P.detectPlateau([session(140, 1, 1), session(135, 1, 1), session(130, 1, 1)]);
  assert.equal(res.plateau, false);
  assert.equal(res.declining, false);
});

test('detectPlateau: flat across window → plateau, not declining', () => {
  const res = P.detectPlateau([session(130, 1, 1), session(130, 1, 1), session(130, 1, 1)]);
  assert.equal(res.plateau, true);
  assert.equal(res.declining, false);
});

test('detectPlateau: not enough sessions → no plateau', () => {
  const res = P.detectPlateau([session(130, 1, 1)]);
  assert.equal(res.plateau, false);
  assert.equal(res.sessions, 1);
});

// ── resolveTargetSets / establishedTargetSets ───────────────────────────────
test('resolveTargetSets honors explicit targetSets, then prescribed, then default', () => {
  assert.equal(P.resolveTargetSets({ exerciseName: 'Bench Press', targetSets: 4 }, []), 4);
  assert.equal(P.resolveTargetSets({ exerciseName: 'Bench Press', prescribedSets: 5 }, []), 5);
  assert.equal(P.resolveTargetSets({ exerciseName: 'Bench Press' }, []), 3); // default
});

test('establishedTargetSets needs 2+ sessions, uses the most common count', () => {
  assert.equal(P.establishedTargetSets([session(100, 8, 4)]), null); // one session never counts
  assert.equal(P.establishedTargetSets([session(100, 8, 4), session(100, 8, 4)]), 4);
});

// ── evaluatePRs ─────────────────────────────────────────────────────────────
test('evaluatePRs: no prior records → updates bests but emits no PR messages', () => {
  const res = P.evaluatePRs([set(100, 10)], null);
  assert.equal(res.hadPrior, false);
  assert.equal(res.updated, true);
  assert.deepEqual(res.prMessages, []); // first-ever workout isn't a "PR beat"
  assert.equal(res.best.best_weight, 100);
  assert.equal(res.best.best_reps, 10);
  assert.equal(res.best.best_volume, 1000);
});

test('evaluatePRs: heavier weight than ever → weight PR message', () => {
  const prior = { best_weight: 100, best_reps: 10, best_volume: 1000, best_estimated_1rm: 133.33 };
  const res = P.evaluatePRs([set(105, 8)], prior);
  assert.equal(res.hadPrior, true);
  assert.equal(res.topMessage, '105 lb × 8');
  assert.equal(res.best.best_weight, 105);
});

test('evaluatePRs: same top weight, more reps → rep PR message', () => {
  const prior = { best_weight: 100, best_reps: 10, best_volume: 1000, best_estimated_1rm: 200 };
  const res = P.evaluatePRs([set(100, 11)], prior);
  assert.equal(res.topMessage, '100 lb × 11 (rep PR)');
});

test('evaluatePRs: lighter set that beats only volume → volume PR message', () => {
  // 90×13 = 1170 vol beats 1000, but weight, reps-at-weight, and 1RM don't lead.
  const prior = { best_weight: 100, best_reps: 13, best_volume: 1000, best_estimated_1rm: 200 };
  const res = P.evaluatePRs([set(90, 13)], prior);
  assert.equal(res.topMessage, '90 lb × 13 (volume PR)');
  assert.equal(res.best.best_volume, 1170);
});
