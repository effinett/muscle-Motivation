// calendar-week.test.js — Phase 4.3.4 V3.
//
// The Monday–Sunday calendar week that powers BOTH the day strip and the
// completed/target metric. The binding rules: one definition drives both, the
// existing rolling-7-day fields keep working, and no "scheduled" state is ever
// invented — the product stores a weekly training COUNT, not a weekday plan.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SN = require('./snapshot.js');
const DM = require('./dashboard-model.js');
const { snCalendarWeek, snWeekStart, snComputeSnapshot } = SN;

const dates = (...d) => d;

/* ── Monday–Sunday boundaries ───────────────────────────────────────────── */

test('week start: every day of a week resolves to the same Monday', () => {
  // 2026-08-10 is a Monday; 2026-08-16 is the Sunday that closes that week.
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  for (const day of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
    '2026-08-14', '2026-08-15', '2026-08-16']) {
    assert.strictEqual(iso(snWeekStart(day)), '2026-08-10', `${day} → Monday 2026-08-10`);
  }
  // The next day starts a NEW week.
  assert.strictEqual(iso(snWeekStart('2026-08-17')), '2026-08-17');
});

test('week: Sunday belongs to the week that began the previous Monday', () => {
  const w = snCalendarWeek([], '2026-08-16', 3); // a Sunday
  assert.strictEqual(w.start, '2026-08-10');
  assert.strictEqual(w.end, '2026-08-16');
  assert.strictEqual(w.days.length, 7);
  assert.strictEqual(w.days[6].isToday, true, 'Sunday is the 7th cell, not the 1st');
});

test('week: day cells are labelled Monday-first', () => {
  const w = snCalendarWeek([], '2026-08-12', 3);
  assert.deepStrictEqual(w.days.map((d) => d.label), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.deepStrictEqual(w.days.map((d) => d.weekday),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepStrictEqual(w.days.map((d) => d.date), [
    '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
    '2026-08-14', '2026-08-15', '2026-08-16']);
});

/* ── Current-day identification ─────────────────────────────────────────── */

test('week: exactly one day is today, and future days are marked', () => {
  const w = snCalendarWeek([], '2026-08-13', 4); // Thursday
  assert.strictEqual(w.days.filter((d) => d.isToday).length, 1);
  assert.strictEqual(w.days[3].isToday, true, 'Thursday is the 4th cell');
  assert.deepStrictEqual(w.days.map((d) => d.isFuture),
    [false, false, false, false, true, true, true]);
});

/* ── Completion counting ────────────────────────────────────────────────── */

test('week: completed days are flagged and counted', () => {
  const w = snCalendarWeek(dates('2026-08-10', '2026-08-12'), '2026-08-13', 4);
  assert.deepStrictEqual(w.days.map((d) => d.completed),
    [true, false, true, false, false, false, false]);
  assert.strictEqual(w.completed, 2);
});

test('week: multiple workouts on one day count once', () => {
  // The target is expressed in training DAYS per week, so a double session is
  // one completed day — not two.
  const w = snCalendarWeek(dates('2026-08-11', '2026-08-11', '2026-08-11'), '2026-08-13', 4);
  assert.strictEqual(w.completed, 1);
  assert.strictEqual(w.days[1].completed, true);
});

test('week: workouts outside the current week never leak in', () => {
  const w = snCalendarWeek(dates('2026-08-09', '2026-08-17', '2026-07-30'), '2026-08-13', 4);
  assert.strictEqual(w.completed, 0, 'last week and next week are excluded');
  assert.ok(w.days.every((d) => d.completed === false));
});

test('week: no workouts at all', () => {
  const w = snCalendarWeek([], '2026-08-13', 3);
  assert.strictEqual(w.completed, 0);
  assert.strictEqual(w.met, false);
  assert.strictEqual(w.ratio, 0);
  assert.ok(w.days.every((d) => d.completed === false));
});

test('week: tolerates missing/empty date input', () => {
  for (const input of [null, undefined, [], [null, '', undefined]]) {
    const w = snCalendarWeek(input, '2026-08-13', 3);
    assert.strictEqual(w.completed, 0);
    assert.strictEqual(w.days.length, 7);
  }
});

/* ── Weekly target ──────────────────────────────────────────────────────── */

test('week: target absent or zero yields no denominator, never a default', () => {
  for (const td of [0, null, undefined, '', 'x', -1]) {
    const w = snCalendarWeek(dates('2026-08-10'), '2026-08-13', td);
    assert.strictEqual(w.planned, null, `training_days=${String(td)} → no target`);
    assert.strictEqual(w.ratio, null, 'no ratio without a target');
    assert.strictEqual(w.met, null, 'no met/unmet judgement without a target');
    assert.strictEqual(w.completed, 1, 'the completed count still stands alone');
  }
});

test('week: meeting or exceeding the target reads as met', () => {
  const three = dates('2026-08-10', '2026-08-11', '2026-08-12');
  assert.strictEqual(snCalendarWeek(three, '2026-08-13', 3).met, true);
  assert.strictEqual(snCalendarWeek(three, '2026-08-13', 4).met, false);
  const four = three.concat('2026-08-13');
  const over = snCalendarWeek(four, '2026-08-13', 3);
  assert.strictEqual(over.met, true, 'ahead of target still reads as met');
  assert.ok(over.ratio > 1, 'ratio is not clamped in the domain layer');
});

/* ── Month / year boundaries ────────────────────────────────────────────── */

test('week: spans a month boundary correctly', () => {
  // 2026-09-28 is a Monday; that week runs into October.
  const w = snCalendarWeek(dates('2026-09-30', '2026-10-02'), '2026-10-01', 3);
  assert.strictEqual(w.start, '2026-09-28');
  assert.strictEqual(w.end, '2026-10-04');
  assert.strictEqual(w.completed, 2);
  assert.strictEqual(w.days[2].date, '2026-09-30');
  assert.strictEqual(w.days[4].date, '2026-10-02');
});

test('week: spans a year boundary correctly', () => {
  // 2026-12-28 is a Monday; that week ends 2027-01-03.
  const w = snCalendarWeek(dates('2026-12-31', '2027-01-02'), '2027-01-01', 4);
  assert.strictEqual(w.start, '2026-12-28');
  assert.strictEqual(w.end, '2027-01-03');
  assert.strictEqual(w.completed, 2);
  assert.strictEqual(w.days[6].date, '2027-01-03');
});

test('week: handles a leap day without drifting', () => {
  // 2028-02-28 is a Monday; 2028 is a leap year, so the week includes Feb 29.
  const w = snCalendarWeek(dates('2028-02-29'), '2028-03-01', 3);
  assert.strictEqual(w.start, '2028-02-28');
  assert.strictEqual(w.days[1].date, '2028-02-29');
  assert.strictEqual(w.days[2].date, '2028-03-01');
  assert.strictEqual(w.completed, 1);
});

/* ── No fabricated state ────────────────────────────────────────────────── */

test('week: exposes no scheduled/planned-day state', () => {
  const w = snCalendarWeek(dates('2026-08-10'), '2026-08-13', 4);
  for (const day of w.days) {
    assert.deepStrictEqual(Object.keys(day).sort(),
      ['completed', 'date', 'isFuture', 'isToday', 'label', 'weekday'],
      'a day carries only honest, derivable state');
    for (const forbidden of ['scheduled', 'planned', 'expected', 'rest', 'missed']) {
      assert.ok(!(forbidden in day), `day must not claim "${forbidden}"`);
    }
  }
  // And the source cannot support it: training_days is a weekly count only.
  const src = fs.readFileSync(path.join(__dirname, 'snapshot.js'), 'utf8');
  assert.ok(!/scheduled/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    'no scheduled-day logic exists in the domain layer');
});

/* ── Backward compatibility ─────────────────────────────────────────────── */

test('snapshot: existing fields are preserved alongside the new week', () => {
  const s = snComputeSnapshot({
    profile: { goal: 'fatloss', target_calories: 2200, training_days: 4 },
    weightLogs: [], bfLogs: [], msLogs: [], foodRows: [],
    workouts: [{ date: '2026-08-10' }, { date: '2026-08-12' }],
    today: '2026-08-13',
  });
  for (const k of ['generatedAt', 'profile', 'weight', 'bodyFat', 'waist', 'nutrition', 'training']) {
    assert.ok(k in s, `existing key ${k} still present`);
  }
  for (const k of ['trainedToday', 'streak', 'thisWeekCount', 'weekAdherence', 'lastWorkout']) {
    assert.ok(k in s.training, `existing training.${k} still present`);
  }
  assert.ok(s.training.week, 'training.week added');
  assert.strictEqual(s.training.week.start, '2026-08-10');
  assert.strictEqual(s.training.week.completed, 2);
  assert.strictEqual(s.training.week.planned, 4);
});

test('snapshot: the rolling window and the calendar week are both intact', () => {
  // Sunday 2026-08-16. Rolling 7 days reaches back to Monday 2026-08-10.
  // A workout on Sunday 2026-08-09 is INSIDE neither (rolling starts the 10th),
  // while one on 2026-08-10 is inside both — the two measures are allowed to
  // differ, which is exactly why new surfaces must read training.week.
  const s = snComputeSnapshot({
    profile: { training_days: 3 },
    weightLogs: [], bfLogs: [], msLogs: [], foodRows: [],
    workouts: [{ date: '2026-08-09' }, { date: '2026-08-10' }],
    today: '2026-08-16',
  });
  assert.strictEqual(s.training.week.start, '2026-08-10', 'calendar week starts Monday');
  assert.strictEqual(s.training.week.completed, 1, 'only the 10th falls in this week');
  assert.strictEqual(typeof s.training.thisWeekCount, 'number', 'rolling count still produced');
  assert.strictEqual(s.training.weekAdherence.completed, s.training.thisWeekCount,
    'the legacy pairing is unchanged');
});

/* ── One definition powers strip AND metric ─────────────────────────────── */

test('model: the metric and the day strip come from the same structure', () => {
  const s = snComputeSnapshot({
    profile: { training_days: 4 },
    weightLogs: [], bfLogs: [], msLogs: [], foodRows: [],
    workouts: [{ date: '2026-08-10' }, { date: '2026-08-12' }, { date: '2026-08-13' }],
    today: '2026-08-13',
  });
  const w = DM.buildWeek({ snapshot: s });
  assert.strictEqual(w.hasData, true);
  assert.strictEqual(w.completed, 3);
  assert.strictEqual(w.planned, 4);
  assert.strictEqual(w.label, '3 / 4 workouts');
  assert.strictEqual(w.days.length, 7, 'the strip is available to render');
  // The number the user reads must equal the ticks they can count.
  assert.strictEqual(w.days.filter((d) => d.completed).length, w.completed);
  assert.strictEqual(w.start, s.training.week.start);
});

test('model: an older snapshot without training.week still works', () => {
  const legacy = {
    training: { thisWeekCount: 2, streak: 1, weekAdherence: { planned: 3, completed: 2 } },
    nutrition: { today: {}, week: {} }, weight: {},
  };
  const w = DM.buildWeek({ snapshot: legacy });
  assert.strictEqual(w.hasData, true);
  assert.strictEqual(w.completed, 2);
  assert.strictEqual(w.planned, 3);
  assert.deepStrictEqual(w.days, [], 'no strip without the calendar data — never faked');
});

test('model: no snapshot at all still degrades safely', () => {
  const w = DM.buildWeek({});
  assert.strictEqual(w.hasData, false);
  assert.deepStrictEqual(w.days, []);
});

/* ── Scope guards ───────────────────────────────────────────────────────── */

test('V3: exercise count was deliberately omitted, not faked', () => {
  const src = fs.readFileSync(path.join(__dirname, 'program-state.js'), 'utf8');
  assert.ok(!/exerciseCount/.test(src),
    'no exercise count — program_workouts has no FK to embed, so it would need ' +
    'a dedicated extra Home request');
  const model = fs.readFileSync(path.join(__dirname, 'dashboard-model.js'), 'utf8');
  assert.ok(!/exerciseCount|duration/i.test(model), 'and none is invented downstream');
});

test('V4: the day strip is rendered from training.week, not re-derived', () => {
  const home = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
  // The strip is built from the model's day cells…
  assert.match(home, /\(w\.days \|\| \[\]\)\.map/, 'strip renders model.week.days');
  // …and the only states it can emit are the honest three.
  assert.match(home, /d\.completed \? ' is-done' : ''/);
  assert.match(home, /d\.isToday \? ' is-today' : ''/);
  assert.ok(!/is-scheduled|is-planned|is-missed|is-rest/.test(home),
    'Home never renders a fabricated day state');
  // Home does no week maths of its own.
  assert.ok(!/getDay\(\)|setDate\(/.test(home),
    'week derivation stays in the shared domain layer');
});
