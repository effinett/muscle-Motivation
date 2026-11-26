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
const { ID, SESSIONS, PLANS, CORE } = require('./benchmarks/muscle-gain-duration-fixtures.js');

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

/* ── owner decisions 2026-11-26 ─────────────────────────────────────────── */

test('decision 1: 90-minute Push and Pull end with the optional easy walk and land near 90', () => {
  for (const key of ['push', 'pull', 'push_b', 'pull_b']) {
    const r = W.build(SESSIONS[key], PLANS[key], 90);
    const walk = r.exercises.find((e) => e.exercise_id === ID.walk);
    assert.ok(walk, key + ' adds the walk');
    assert.ok(walk.reps_high >= walk.reps_low && walk.reps_high <= 900, 'walk stays within 10–15 min');
    assert.ok(r.onTarget, key + ' at 90 estimates ' + r.estimateMin);
    for (const len of [30, 45, 60]) {
      assert.ok(!W.build(SESSIONS[key], PLANS[key], len).exercises.some((e) => e.exercise_id === ID.walk),
        'no walk below 90 min');
    }
  }
});

test('a flexible timed block shortens to fit instead of being dropped', () => {
  const lift = [{ name: 'Bench Press', exercise_id: ID.bench, sets: 4, reps_low: 6, reps_high: 10, rest_sec: 150 }];
  const walk = { name: 'Incline Treadmill Walk', exercise_id: ID.walk, sets: 1, reps_low: 300, reps_high: 900, rest_sec: 0, tracking: 'time' };
  const r = W.build(lift, { essential: [ID.bench], add: [{ exercise: walk }] }, 30);
  const added = r.exercises.find((e) => e.exercise_id === ID.walk);
  assert.ok(added && added.reps_high < 900 && added.reps_high >= 300);
  assert.strictEqual(walk.reps_high, 900, 'the plan is not mutated');
  assert.ok(r.fits);
});

for (const days of DAYS) {
  test(`decision 2: a ${days}-day week at 45 min keeps at least one core exercise`, () => {
    const keys = getScheduleForDays('muscle_gain', days);
    const week = W.evaluateWeek(keys.map((k) => ({ key: k, exercises: SESSIONS[k], plan: PLANS[k] })), 45);
    const core = week.sessions.some((s) => s.exercises.some((e) => CORE.includes(e.exercise_id)));
    assert.ok(core, keys.join(', '));
  });
}

test('decision 3: Push, Pull and Legs B are distinct from A', () => {
  for (const k of ['push', 'pull', 'legs']) {
    assert.notDeepStrictEqual(ids(SESSIONS[k + '_b']), ids(SESSIONS[k + '_a']));
    const overlap = ids(SESSIONS[k + '_b']).filter((id) => ids(SESSIONS[k + '_a']).includes(id));
    assert.ok(overlap.length <= 2, k + ' B shares at most two exercises with A');
  }
});

test('the applied migration matches the lengths the module accepts', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/20261126182055_phase_439g_workout_length_columns.sql'), 'utf8');
  assert.match(sql, /workout_minutes IN \(30, 45, 60, 90\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS length_plan jsonb/);
});

/* ── the wiring: Train, Profile, Onboarding ─────────────────────────────── */

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'source defines ' + name + '()');
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const WORKOUT = read('workout.html');

function trainSandbox(extra) {
  const store = {};
  const sb = Object.assign({
    WorkoutDuration: W, console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    trackingTypeForExercise: (e) => (e.exercise_id === ID.plank ? 'time' : 'weight_reps'),
    esc: (v) => String(v), document: { getElementById: () => null },
    window: { location: { href: '' } },
  }, extra || {});
  vm.createContext(sb);
  vm.runInContext(['wlWithTracking', 'lengthAdjustedSession', 'storedWorkoutLength', 'startRecommended']
    .map((n) => extractFn(WORKOUT, n)).join('\n'), sb);
  return { sb, store };
}

test('Train builds the stored session toward the chosen length; a session without a plan is unchanged', () => {
  const { sb } = trainSandbox();
  const sess = { exercises: SESSIONS.upper_a, lengthPlan: PLANS.upper_a };
  const r30 = sb.lengthAdjustedSession(sess, 30);
  assert.ok(r30.planned && r30.estimateMin <= 32);
  assert.deepStrictEqual(r30.exercises.map((e) => e.exercise_id), W.build(SESSIONS.upper_a, PLANS.upper_a, 30).exercises.map((e) => e.exercise_id));
  const none = sb.lengthAdjustedSession({ exercises: SESSIONS.upper_a, lengthPlan: null }, 30);
  assert.strictEqual(none.planned, false);
  assert.strictEqual(none.exercises, SESSIONS.upper_a, 'no plan → the stored prescription, untouched');
});

test('today\'s length rides the launch URL only when the session has a plan', () => {
  const { sb } = trainSandbox();
  sb.recommendedLaunch = { sess: { lengthPlan: PLANS.upper_a } };
  sb.chosenWorkoutMinutes = 30;
  sb.startRecommended('muscle_gain', 'upper_a');
  assert.match(sb.window.location.href, /mode=progression&length=30$/);
  sb.recommendedLaunch = { sess: { lengthPlan: null } };
  sb.startRecommended('muscle_gain', 'upper_a');
  assert.doesNotMatch(sb.window.location.href, /length=/);
});

test('a resumed workout reads back its own length; anything else is ignored', () => {
  const { sb, store } = trainSandbox();
  store.wkt_len_w1 = '45';
  store.wkt_len_w2 = '50';
  assert.strictEqual(sb.storedWorkoutLength('w1'), 45);
  assert.strictEqual(sb.storedWorkoutLength('w2'), null);
  assert.strictEqual(sb.storedWorkoutLength('w3'), null);
});

test('launch keeps its signature, applies length before step-ups, and remembers it per workout', () => {
  const body = extractFn(WORKOUT, 'startProgramSession');
  assert.match(WORKOUT, /async function startProgramSession\(programSlug, sessionKey, mode\) \{/);
  assert.ok(body.indexOf('lengthAdjustedSession(sessData') < body.indexOf('BodyweightProgression.applySteps'));
  assert.match(body, /localStorage\.setItem\('wkt_len_' \+ workout\.id/);
  assert.doesNotMatch(body, /workout_minutes/, 'a session choice never writes the usual length');
  assert.match(extractFn(WORKOUT, 'loadProgramSession'), /length_plan/);
});

test('Profile\'s length sheet writes workout_minutes and nothing else', () => {
  const PROFILE = read('profile.html');
  const body = extractFn(PROFILE, 'saveLength');
  assert.match(body, /\.update\(\{ workout_minutes: value \}\)/);
  assert.equal((body.match(/\.update\(/g) || []).length, 1);
  assert.match(PROFILE, /get\('edit'\) === 'length'\) openLength\(\)/);
});

test('onboarding asks for the length and the draft accepts only the four lengths', () => {
  const D = require('./onboarding-draft.js');
  for (const m of W.LENGTHS) assert.ok(D.isValidField('workout_minutes', m), String(m));
  for (const bad of [0, 20, 50, 120, '60']) assert.ok(!D.isValidField('workout_minutes', bad), String(bad));
  const ONB = read('onboarding.html');
  assert.match(ONB, /id="ob-length"/);
  assert.match(ONB, /workout_minutes:\s+workoutMinutes/);
});
