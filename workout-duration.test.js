/* Workout length (Phase 4.3.9G). Locks the estimate, the trim/add rules and
 * the one-session override, and runs the Muscle Gain pilot across every
 * supported day count at all four lengths. Plans are PROPOSED fixtures. */

const test = require('node:test');
const assert = require('node:assert');
const W = require('./workout-duration.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// schedules.js is a browser-global script with no Node exports.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8'), sandbox);
const getScheduleForDays = (slug, days) => vm.runInContext(
  'getScheduleForDays(' + JSON.stringify(slug) + ',' + days + ')', sandbox);
const { ID, SESSIONS, PLANS } = require('./benchmarks/muscle-gain-duration-fixtures.js');

const KEYS = Object.keys(SESSIONS);
const DAYS = [2, 3, 4, 5, 6];
const ids = (list) => list.map((e) => e.exercise_id);

/* ── estimate ───────────────────────────────────────────────────────────── */

test('estimate counts warm-up, working sets, rest between sets and changeovers', () => {
  const one = [{ name: 'Bench Press', exercise_id: ID.bench, sets: 3, reps_low: 6, reps_high: 10, rest_sec: 120 }];
  const m = W.MODEL;
  assert.strictEqual(W.estimate(one, 60), m.warmupSec[60] + 3 * m.setWorkSec + 2 * 120 + m.changeoverSec);
});

test('a timed set lasts its top time, not the rep-set default', () => {
  const plank = [{ name: 'Plank', exercise_id: ID.plank, sets: 2, reps_low: 30, reps_high: 60, rest_sec: 60, tracking: 'time' }];
  assert.strictEqual(W.estimate(plank, 60), W.MODEL.warmupSec[60] + 2 * 60 + 60 + W.MODEL.changeoverSec);
});

test('only 30, 45, 60 and 90 are lengths', () => {
  assert.deepStrictEqual(W.LENGTHS, [30, 45, 60, 90]);
  assert.throws(() => W.build(SESSIONS.upper_a, PLANS.upper_a, 50));
});

/* ── today vs usual ─────────────────────────────────────────────────────── */

test('today\'s length applies to that session only; the next starts on the usual length', () => {
  assert.strictEqual(W.lengthForSession(60, 30), 30);   // busy day
  assert.strictEqual(W.lengthForSession(60, 90), 90);   // longer day
  assert.strictEqual(W.lengthForSession(60, null), 60); // next workout: saved default again
  assert.strictEqual(W.lengthForSession(null, null), 60); // never chose one → 60
  assert.strictEqual(W.lengthForSession(45, 50), 45);   // an invalid choice is ignored
});

/* ── rules, across every Muscle Gain session × length ───────────────────── */

for (const key of KEYS) {
  for (const len of W.LENGTHS) {
    test(`muscle_gain ${key} @ ${len} min keeps essentials, prescriptions and identity`, () => {
      const input = JSON.parse(JSON.stringify(SESSIONS[key]));
      const r = W.build(SESSIONS[key], PLANS[key], len);
      assert.deepStrictEqual(SESSIONS[key], input, 'input is never mutated');

      for (const id of PLANS[key].essential) {
        const kept = r.exercises.find((e) => e.exercise_id === id);
        assert.ok(kept, 'essential kept: ' + id);
        assert.ok(kept.sets >= (PLANS[key].minSets[id] || 3), 'essential above its minimum sets');
      }
      const allowed = new Set([...ids(SESSIONS[key]),
        ...PLANS[key].add.filter((s) => s.exercise).map((s) => s.exercise.exercise_id)]);
      for (const e of r.exercises) {
        assert.ok(allowed.has(e.exercise_id), 'only Program or planned exercises appear');
        const orig = SESSIONS[key].find((o) => o.exercise_id === e.exercise_id);
        if (orig) {
          for (const f of ['name', 'reps_low', 'reps_high', 'rest_sec', 'notes']) {
            assert.strictEqual(e[f], orig[f], f + ' unchanged — only sets may change');
          }
        }
      }
      assert.ok(r.fits, `${key} fits ${len} min (estimate ${r.estimateMin})`);
      if (len < 90) assert.ok(r.onTarget, `${key} lands near ${len} min (estimate ${r.estimateMin})`);
    });
  }
}

test('shorter lengths never keep more work than longer ones', () => {
  for (const key of KEYS) {
    const mins = W.LENGTHS.map((l) => W.build(SESSIONS[key], PLANS[key], l).estimateMin);
    for (let i = 1; i < mins.length; i++) assert.ok(mins[i] >= mins[i - 1], key + ' ' + mins.join('/'));
  }
});

/* ── flags ──────────────────────────────────────────────────────────────── */

test('essentials that cannot fit are flagged, never silently cut', () => {
  const heavy = [{ name: 'Barbell Back Squat', exercise_id: ID.squat, sets: 6, reps_low: 3, reps_high: 5, rest_sec: 300 },
    { name: 'Bench Press', exercise_id: ID.bench, sets: 6, reps_low: 3, reps_high: 5, rest_sec: 300 }];
  const r = W.build(heavy, { essential: [ID.squat, ID.bench], minSets: { [ID.squat]: 5, [ID.bench]: 5 }, trim: [] }, 30);
  assert.strictEqual(r.fits, false);
  assert.strictEqual(r.exercises.length, 2);
  const week = W.evaluateWeek([{ key: 'heavy', exercises: heavy, plan: { essential: [ID.squat, ID.bench], minSets: { [ID.squat]: 5, [ID.bench]: 5 } } }], 30);
  assert.deepStrictEqual(week.gaps.map((g) => g.type), ['essentials_do_not_fit']);
});

/* ── the week, at every supported day count ─────────────────────────────── */

for (const days of DAYS) {
  for (const len of W.LENGTHS) {
    test(`muscle_gain ${days} days × ${len} min: every session fits`, () => {
      const keys = getScheduleForDays('muscle_gain', days);
      const week = W.evaluateWeek(keys.map((k) => ({ key: k, exercises: SESSIONS[k], plan: PLANS[k] })), len);
      assert.strictEqual(week.sessions.length, keys.length);
      assert.ok(week.gaps.every((g) => g.type !== 'essentials_do_not_fit'));
    });
  }
}
