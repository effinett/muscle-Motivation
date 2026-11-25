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

// ── analyze: below the floor → HOLD (never auto-reduce) ─────────────────────
// A single bad session must never silently lower the weight. The engine holds
// and asks for the floor; any reduction is now a deload SUGGESTION only.
test('analyze: reps below the floor → hold, weight unchanged (no auto-reduce)', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 5, 3)] // 5 < floor, but only one session
  });
  assert.equal(r.action, 'hold');
  assert.equal(r.recommendedWeight, 100);   // held, NOT reduced to 90
  assert.equal(r.recommendedReps, 8);
  assert.equal(r.deloadSuggested, false);    // one session can't trigger a deload
});

// ── analyze: regression deload (advisory, weight held) ──────────────────────
test('analyze: best est-1RM drops >10% vs last session → regression deload', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    // newest first: 100×3 (e1RM 110) after 100×10 (e1RM ~133) → ~17% drop
    history: [session(100, 3, 3), session(100, 10, 3)]
  });
  assert.equal(r.deloadSuggested, true);
  assert.equal(r.deloadReason, 'regression');
  assert.equal(r.recommendedWeight, 100);    // pre-fill weight is NOT lowered
  assert.equal(r.deloadWeight, 90);          // the suggested drop, if accepted
  assert.ok(r.deloadWeight < r.recommendedWeight);
});

// ── analyze: stall deload (3 sessions, same weight, no improvement) ─────────
test('analyze: 3 sessions same weight with no improvement → stall deload', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 8, 3), session(100, 8, 3), session(100, 8, 3)]
  });
  assert.equal(r.deloadSuggested, true);
  assert.equal(r.deloadReason, 'stall');
  assert.equal(r.recommendedWeight, 100);    // held, advisory only
  assert.match(r.coachNote, /stalled/i);
});

// ── analyze: an earned increase never also suggests a deload ────────────────
test('analyze: topping the range → increase, never a deload', () => {
  const r = P.analyze({
    exerciseName: 'Bench Press', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: [session(100, 12, 3), session(100, 12, 3), session(100, 12, 3)]
  });
  assert.equal(r.action, 'increase');
  assert.equal(r.deloadSuggested, false);
  assert.equal(r.deloadWeight, null);
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

/* ── "Hold the top" note fix (4.3.9-L, owner decision 2026-11-17) ────────────
 * A caller may pass `noLoadNote: true` for a catalog-confirmed bodyweight-reps
 * or timed exercise with no weight today, in ANY Program. It changes the words
 * only, and only when the session being read carried no load. */
{
  const P = require('./progression.js');
  const BANNED = /beyond|add load|harder variation/i;
  const unloaded = (reps) => reps.map((r) => ({ weight: null, reps: r, completed: true }));
  const loaded = (reps) => reps.map((r) => ({ weight: 25, reps: r, completed: true }));
  // Every branch: top on every set, in range (equal and uneven), a lagging set at
  // the ceiling, below range, incomplete, and first session.
  const BRANCHES = [[12, 12, 12], [9, 9, 9], [10, 9, 9], [12, 12, 9], [5, 5, 5], [10], []];
  const run = (sets, extra) => P.analyze(Object.assign({
    exerciseName: 'Push-Up', repsLow: 8, repsHigh: 12, targetSets: 3,
    history: sets.length ? [{ sets }] : [] }, extra));

  test('noLoadNote: no no-load note ever says beyond, add load or harder variation', () => {
    ['bodyweight_reps', 'time'].forEach((trackingType) => {
      BRANCHES.forEach((reps) => {
        const rec = run(unloaded(reps), { trackingType, noLoadNote: true });
        assert.doesNotMatch(rec.coachNote, BANNED, trackingType + ' ' + JSON.stringify(reps) + ': ' + rec.coachNote);
      });
    });
    assert.match(run(unloaded([12, 12, 12]), { trackingType: 'bodyweight_reps', noLoadNote: true }).coachNote,
      /^You hit the top of the range on every set\. Hold 12 reps and keep your form solid\.$/);
  });

  test('noLoadNote changes words only: numbers, actions and equipment are identical', () => {
    BRANCHES.forEach((reps) => {
      const a = run(unloaded(reps), { trackingType: 'bodyweight_reps', noLoadNote: true });
      const b = run(unloaded(reps), { trackingType: 'bodyweight_reps' });
      ['action', 'equipment', 'recommendedWeight', 'recommendedReps', 'recommendedSets',
        'recommendedDisplay', 'plateau', 'deloadSuggested', 'deloadWeight'].forEach((k) =>
        assert.deepStrictEqual(a[k], b[k], k + ' ' + JSON.stringify(reps)));
    });
  });

  test('noLoadNote never touches a loaded session: weight advice is kept in every branch', () => {
    BRANCHES.filter((r) => r.length).forEach((reps) => {
      const a = run(loaded(reps), { trackingType: 'bodyweight_reps', noLoadNote: true });
      const b = run(loaded(reps), { trackingType: 'bodyweight_reps' });
      assert.deepStrictEqual(a, b, JSON.stringify(reps));
    });
  });

  test('noLoadNote without tracking metadata keeps the historical wording byte-for-byte', () => {
    BRANCHES.forEach((reps) => {
      assert.deepStrictEqual(run(unloaded(reps), { noLoadNote: true }), run(unloaded(reps), {}));
    });
  });
}

/* ── Assisted machines: reverse progression (is_assisted) ─────────────────── */
const sess = (w, reps) => ({ sets: reps.map((r) => ({ weight: w, reps: r, completed: true })) });
const assistedIn = (history, extra) => Object.assign({
  exerciseName: 'Assisted Dip', repsLow: 8, repsHigh: 12, targetSets: 3,
  history, trackingType: 'weight_reps', assisted: true
}, extra || {});

test('assisted: topping the range LOWERS the assist by 5 lb', () => {
  const r = P.analyze(assistedIn([sess(50, [12, 12, 12])]));
  assert.equal(r.action, 'increase');
  assert.equal(r.recommendedWeight, 45);
  assert.equal(r.recommendedReps, 8);
  assert.match(r.coachNote, /Drop the assist to 45 lb/);
});

test('assisted: same session WITHOUT the flag keeps the old behaviour', () => {
  const r = P.analyze(assistedIn([sess(50, [12, 12, 12])], { assisted: undefined }));
  assert.equal(r.recommendedWeight, 50); // name reads as bodyweight: no step
  assert.doesNotMatch(r.coachNote, /assist/);
});

test('assisted: at 0 lb assist the next step is the unassisted version', () => {
  const r = P.analyze(assistedIn([sess(0, [12, 12, 12])]));
  assert.equal(r.recommendedWeight, 0);
  assert.match(r.coachNote, /unassisted/);
});

test('assisted: assist never goes below zero', () => {
  const r = P.analyze(assistedIn([sess(3, [12, 12, 12])]));
  assert.equal(r.recommendedWeight, 0);
});

test('assisted: hold wording talks about the assist, not adding weight', () => {
  const r = P.analyze(assistedIn([sess(40, [10, 10, 10])]));
  assert.equal(r.action, 'hold');
  assert.equal(r.recommendedWeight, 40);
  assert.match(r.coachNote, /lowering the assist/);
  assert.doesNotMatch(r.coachNote, /increasing weight/);
});

test('assisted: lowering the assist is never read as a regression', () => {
  // 45 × 8 has a lower 1RM score than 50 × 12, but it is progress.
  const r = P.analyze(assistedIn([sess(45, [8, 8, 8]), sess(50, [12, 12, 12])]));
  assert.equal(r.deloadSuggested, false);
});

test('assisted: a deload ADDS assist', () => {
  const r = P.analyze(assistedIn([sess(40, [8, 8, 8]), sess(40, [8, 8, 8]), sess(40, [8, 8, 8])]));
  assert.equal(r.deloadSuggested, true);
  assert.equal(r.deloadWeight, 45);
  assert.match(r.coachNote, /add assist up to about 45 lb/);
});

test('assisted PRs: the record is the LOWEST assist', () => {
  const prior = { best_weight: 40, best_reps: 10, best_volume: 400, best_estimated_1rm: 53 };
  const lower = P.evaluatePRs([{ weight: 35, reps: 8 }], prior, { trackingType: 'weight_reps', assisted: true });
  assert.equal(lower.updated, true);
  assert.equal(lower.best.best_weight, 35);
  assert.match(lower.topMessage, /35 lb assist × 8/);
  assert.equal(lower.best.best_volume, 400);        // untouched
  assert.equal(lower.best.best_estimated_1rm, 53);  // untouched
  const heavier = P.evaluatePRs([{ weight: 60, reps: 15 }], prior, { trackingType: 'weight_reps', assisted: true });
  assert.equal(heavier.updated, false);             // more assist is never a PR
  const reps = P.evaluatePRs([{ weight: 40, reps: 11 }], prior, { trackingType: 'weight_reps', assisted: true });
  assert.match(reps.topMessage, /rep PR/);
});
