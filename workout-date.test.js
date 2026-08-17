// workout-date.test.js — Phase 4.3.5 real-device follow-up.
//
// THE QUESTION ASKED: if a user trains on Monday, forgets to press Finish, and
// finishes on Tuesday morning, which day gets the weekly training check?
//
// THE ANSWER FOUND: Monday, already, and by design. `workouts.date` is stamped
// once when the session is STARTED and finishing never rewrites it. No model
// change was needed for the reported case — so it is pinned here instead, with
// the whole chain asserted end to end, because an invisible correctness
// property with no test is one refactor away from silently breaking.
//
// WHAT WAS ACTUALLY BROKEN: the start stamp used `toISOString()`, which is the
// UTC date, while every consumer of that value derives "today" LOCALLY. For any
// user west of UTC an evening session was stamped with tomorrow's date and the
// check landed on the wrong day — the same class of defect as the one reported,
// from a different cause. That is what changed.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WORKOUT = read('workout.html');
const SNAPSHOT_SRC = read('snapshot.js');

const { whLocalDate } = require('./workout-history.js');
const SN = require('./snapshot.js');

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · The training date is stamped at START and never rewritten
 * ══════════════════════════════════════════════════════════════════════ */

test('every workout is stamped with a training date when it is CREATED', () => {
  const inserts = [...WORKOUT.matchAll(/\.from\('workouts'\)\s*\n?\s*\.insert\(\{([^}]*)\}/g)]
    .map((m) => m[1]);
  assert.ok(inserts.length >= 3, `expected the known insert sites, found ${inserts.length}`);
  for (const body of inserts) {
    assert.match(body, /date:\s*whLocalDate\(\)/,
      'every workout insert stamps the local training date');
  }
});

test('finishing a workout never rewrites its training date', () => {
  // THE forgotten-finish guarantee. If this update ever grows a `date` field,
  // a Monday session finished on Tuesday starts counting as Tuesday.
  const finish = WORKOUT.match(/\.from\('workouts'\)\.update\(\{ completed: true[^}]*\}/);
  assert.ok(finish, 'the finish transition exists');
  assert.ok(!/\bdate\b/.test(finish[0]),
    `finish must not touch the training date — found: ${finish[0]}`);
  assert.match(finish[0], /duration_minutes/, 'it records duration, which IS finish-time data');
});

test('no workout update anywhere rewrites the training date', () => {
  for (const m of WORKOUT.matchAll(/\.from\('workouts'\)\s*\.update\(\{([^}]*)\}/g)) {
    assert.ok(!/(^|[^_\w])date\s*:/.test(m[1]),
      `a workouts.update() sets date — history must never be re-dated: ${m[1]}`);
  }
  // The history editor may rename a workout but must not re-date it either.
  for (const m of read('workout-history.js').matchAll(/\.from\('workouts'\)\.update\(\{([^}]*)\}/g)) {
    assert.ok(!/(^|[^_\w])date\s*:/.test(m[1]), `history edit re-dates a workout: ${m[1]}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · The stamp is the user's LOCAL date, not UTC
 * ══════════════════════════════════════════════════════════════════════ */

test('the training date is the local calendar date, matching every consumer', () => {
  // The bug: an 8pm Monday session at UTC-4 is already Tuesday in UTC.
  const evening = new Date('2026-08-17T20:00:00-04:00');
  assert.strictEqual(evening.toISOString().slice(0, 10), '2026-08-18',
    'precondition: UTC has already rolled over');

  // whLocalDate formats in the RUNNER's zone, so assert the property that
  // matters rather than a fixed string: it agrees with the local calendar.
  const expected = [
    evening.getFullYear(),
    String(evening.getMonth() + 1).padStart(2, '0'),
    String(evening.getDate()).padStart(2, '0'),
  ].join('-');
  assert.strictEqual(whLocalDate(evening), expected,
    'the stamp is the local calendar day of that instant');
});

test('the stamp uses the same computation as every reader of the value', () => {
  // weight.js wlToday(), snapshot.js dashIso() and this helper must agree, or
  // the dashboard compares dates that were produced two different ways.
  assert.match(read('workout-history.js'),
    /getTime\(\) - when\.getTimezoneOffset\(\) \* 60000/);
  assert.match(read('weight.js'), /getTime\(\) - d\.getTimezoneOffset\(\) \* 60000/);
  assert.match(SNAPSHOT_SRC, /getTime\(\) - d\.getTimezoneOffset\(\) \* 60000/);
});

test('no raw UTC date stamp survives anywhere in the workout page', () => {
  assert.ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(WORKOUT),
    'a UTC date stamp reappeared in workout.html');
});

test('a malformed argument degrades to today rather than a bogus date', () => {
  for (const bad of ['nonsense', null, undefined, NaN, new Date('nope')]) {
    assert.match(whLocalDate(bad), /^\d{4}-\d{2}-\d{2}$/, `handles ${String(bad)}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · The dashboard credits the day the workout was PERFORMED
 * ══════════════════════════════════════════════════════════════════════ */

// Build the snapshot's calendar week from a set of workout rows, exactly as
// snComputeSnapshot does: it reads `w.date` and nothing else.
function weekFor(workouts, todayIso, trainingDays) {
  const dates = [];
  const seen = {};
  workouts.forEach((w) => { if (w.date && !seen[w.date]) { seen[w.date] = true; dates.push(w.date); } });
  return SN.snCalendarWeek(dates, todayIso, trainingDays);
}
const dayOf = (week, iso) => week.days.find((d) => d.date === iso);

test('same-day: start Monday, finish Monday → Monday credited', () => {
  // 2026-08-17 is a Monday.
  const week = weekFor([{ date: '2026-08-17', completed: true }], '2026-08-17', 3);
  assert.strictEqual(dayOf(week, '2026-08-17').completed, true, 'Monday is credited');
  assert.strictEqual(week.completed, 1);
});

test('forgotten finish: start Monday, finish Tuesday → MONDAY credited, not Tuesday', () => {
  // The row as it exists after the resume-and-finish flow: `date` is still the
  // start date because finishWorkout only sets completed + duration.
  const row = { date: '2026-08-17', completed: true, duration_minutes: 900 };
  const week = weekFor([row], '2026-08-18', 3);   // "today" is Tuesday
  assert.strictEqual(dayOf(week, '2026-08-17').completed, true, 'Monday keeps the check');
  assert.strictEqual(dayOf(week, '2026-08-18').completed, false,
    'Tuesday must NOT be credited merely because Finish was pressed then');
  assert.strictEqual(week.completed, 1, 'one workout, one day');
});

test('resumed days later: a Monday session finished Thursday still credits Monday', () => {
  const week = weekFor([{ date: '2026-08-17', completed: true }], '2026-08-20', 3);
  assert.strictEqual(dayOf(week, '2026-08-17').completed, true);
  for (const iso of ['2026-08-18', '2026-08-19', '2026-08-20']) {
    assert.strictEqual(dayOf(week, iso).completed, false, `${iso} is not credited`);
  }
});

test('midnight crossover is deterministic: the day the session BEGAN', () => {
  // A session started 23:30 Monday and finished 00:20 Tuesday belongs to
  // Monday, by the same rule and with no elapsed-time heuristic anywhere.
  const week = weekFor([{ date: '2026-08-17', completed: true }], '2026-08-18', 4);
  assert.strictEqual(dayOf(week, '2026-08-17').completed, true);
  assert.strictEqual(dayOf(week, '2026-08-18').completed, false);
});

test('two sessions on one day count as one training DAY', () => {
  const week = weekFor([
    { date: '2026-08-17', completed: true },
    { date: '2026-08-17', completed: true },
  ], '2026-08-18', 3);
  assert.strictEqual(week.completed, 1, 'the weekly target is expressed in days');
});

test('the weekly circles read the stored date, never a completion time', () => {
  // Structural: the snapshot query selects `date` and the assembly keys off it.
  assert.match(SNAPSHOT_SRC, /\.select\('date, name, created_at, duration_minutes'\)/);
  assert.match(SNAPSHOT_SRC, /workouts\.forEach\(function \(w\) \{\s*\n\s*if \(w\.date/);
  // completed_at does not exist in this model, and nothing may invent it.
  assert.ok(!/completed_at/.test(SNAPSHOT_SRC), 'no completion timestamp feeds the week');
  assert.ok(!/completed_at/.test(WORKOUT), 'the workout page stores no completion timestamp');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · Duplicate protection on a resumed finish
 * ══════════════════════════════════════════════════════════════════════ */

test('finishing a resumed session cannot double-count it', () => {
  // The optimistic completed=false → true transition means a second tab, a
  // re-tap, or a resumed session finished twice updates zero rows the second
  // time and short-circuits before PR detection or progression run again.
  assert.match(WORKOUT,
    /\.update\(\{ completed: true[^}]*\}\)\s*\n?\s*\.eq\('id', currentWorkout\.id\)\.eq\('completed', false\)/,
    'the finish transition is guarded on the current state');
  assert.match(WORKOUT, /if \(!updated \|\| !updated\.length\) \{/,
    'a no-op update is detected');
  assert.match(WORKOUT, /showToast\('This workout was already finished\.'\)/);
});

test('a resumed session reuses its original row rather than creating a new one', () => {
  // Resume finds the existing incomplete workout; it never inserts a fresh one,
  // which is what keeps the original training date attached.
  assert.match(WORKOUT,
    /\.from\('workouts'\)\.select\('\*'\)\s*\n?\s*\.eq\('user_id', currentUser\.id\)\.eq\('completed', false\)/,
    'resume looks for the existing incomplete session');
  assert.match(WORKOUT, /currentWorkout = data;\s*\n\s*await loadExercisesForWorkout\(data\.id\);/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · No migration, no history rewrite
 * ══════════════════════════════════════════════════════════════════════ */

test('the fix is forward-only — no existing row is re-dated', () => {
  // Rows written before this change keep whatever date they were given. They
  // are not rewritten: a backfill would need to guess each user's timezone at
  // the time of training, which is exactly the guessing the brief forbids.
  const migrationish = /UPDATE\s+workouts|backfill|apply_migration|ALTER TABLE/i;
  assert.ok(!migrationish.test(WORKOUT), 'workout.html performs no data migration');
  assert.ok(!migrationish.test(read('workout-history.js')));
});
