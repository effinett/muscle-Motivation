// dashboard-model.test.js — Phase 4.3.4 CP3.
//
// The dashboard view-model is pure, so every priority rule and every
// missing-data fallback is testable without a browser. The binding rule these
// tests enforce is that the model NEVER fabricates: absent evidence must
// surface as hasData:false or a null focus insight, never as filler.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DM = require('./dashboard-model.js');
const { snComputeSnapshot, snPlannedPerWeek, snWeekAdherence } = require('./snapshot.js');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// A snapshot-shaped fixture. Deliberately built by hand (not by fetching) so
// the model is tested against the CONTRACT, not against a live query.
function snap(over) {
  return Object.assign({
    profile: {},
    weight: { current: null, change30: null, count: 0, goal: null },
    bodyFat: { current: null, count: 0 },
    waist: { current: null, count: 0 },
    nutrition: { today: { calories: 0, protein: 0, carbs: 0, fat: 0 },
                 week: { daysLogged: 0, avgCalories: null, avgProtein: null } },
    training: { trainedToday: false, streak: 0, thisWeekCount: 0,
                weekAdherence: { planned: null, completed: 0, ratio: null, met: null },
                lastWorkout: null },
  }, over || {});
}

/* ── A · TODAY priority ─────────────────────────────────────────────────── */

test('today: an unfinished session outranks everything else', () => {
  const t = DM.buildToday({
    snapshot: snap({ training: { trainedToday: true, thisWeekCount: 3 } }),
    inProgressWorkout: { id: 'w1', name: 'Upper Body' },
    program: { sessionLabel: 'Lower Body', href: 'workout.html?x', name: 'Muscle Gain' },
  });
  assert.strictEqual(t.state, 'resume');
  assert.strictEqual(t.title, 'Upper Body');
  assert.strictEqual(t.cta.label, 'Resume Workout');
  assert.strictEqual(t.secondary.action, 'discard', 'discard stays reachable');
});

test('today: trained already → completed state with no primary CTA', () => {
  const t = DM.buildToday({
    snapshot: snap({ training: { trainedToday: true, lastWorkout: { name: 'Push Day' } } }),
    program: { sessionLabel: 'Pull Day', href: 'workout.html?x' },
  });
  assert.strictEqual(t.state, 'done');
  assert.strictEqual(t.title, 'Push Day');
  assert.strictEqual(t.status, 'Complete');
  assert.strictEqual(t.cta, null, 'no dominant CTA once the work is done');
  assert.strictEqual(t.secondary.href, 'workout.html', 'training again is still possible');
});

test('today: an active program surfaces the next session as the CTA', () => {
  const t = DM.buildToday({
    snapshot: snap(),
    program: { sessionLabel: 'Upper Body', name: 'Muscle Gain', href: 'workout.html?program=muscle_gain&session=upper&mode=progression' },
  });
  assert.strictEqual(t.state, 'start');
  assert.strictEqual(t.title, 'Upper Body');
  assert.strictEqual(t.status, 'Muscle Gain');
  assert.strictEqual(t.cta.label, 'Start Workout');
  assert.match(t.cta.href, /mode=progression/);
});

test('today: multiple programs and none active → choosing is the action', () => {
  const t = DM.buildToday({ snapshot: snap(), program: { needsSelection: true } });
  assert.strictEqual(t.state, 'choose');
  assert.strictEqual(t.cta.href, 'profile.html#programs');
});

test('today: no program still offers training — never a dead end', () => {
  const t = DM.buildToday({ snapshot: snap(), program: null });
  assert.strictEqual(t.state, 'open');
  assert.strictEqual(t.cta.href, 'workout.html');
  assert.ok(!/store|buy|browse/i.test(t.cta.label), 'the fallback CTA is not a store link');
});

test('today: survives a completely absent snapshot', () => {
  const t = DM.buildToday({});
  assert.ok(t && t.state && t.title, 'still returns a renderable state');
  assert.strictEqual(t.state, 'open');
});

/* ── B · THIS WEEK ──────────────────────────────────────────────────────── */

test('week: completed vs planned when a target exists', () => {
  const w = DM.buildWeek({ snapshot: snap({
    training: { thisWeekCount: 3, streak: 2, weekAdherence: { planned: 4, completed: 3 } },
  }) });
  assert.strictEqual(w.hasData, true);
  assert.strictEqual(w.label, '3 / 4 workouts');
  assert.strictEqual(w.pct, 75);
  assert.strictEqual(w.complete, false);
});

test('week: meeting the target reads as complete', () => {
  const w = DM.buildWeek({ snapshot: snap({
    training: { thisWeekCount: 4, weekAdherence: { planned: 4, completed: 4 } },
  }) });
  assert.strictEqual(w.complete, true);
  assert.strictEqual(w.pct, 100);
});

test('week: no declared target → count only, never an invented denominator', () => {
  const w = DM.buildWeek({ snapshot: snap({
    training: { thisWeekCount: 2, weekAdherence: { planned: null, completed: 2 } },
  }) });
  assert.strictEqual(w.planned, null);
  assert.strictEqual(w.label, '2 workouts');
  assert.ok(!/\//.test(w.label), 'no fabricated "x / y"');
});

test('week: singular grammar and the zero case', () => {
  assert.strictEqual(DM.buildWeek({ snapshot: snap({ training: { thisWeekCount: 1 } }) }).label, '1 workout');
  assert.strictEqual(DM.buildWeek({ snapshot: snap({ training: { thisWeekCount: 0 } }) }).label, '0 workouts');
});

test('week: missing snapshot → hasData false, no numbers', () => {
  const w = DM.buildWeek({});
  assert.strictEqual(w.hasData, false);
  assert.strictEqual(w.completed, null);
  assert.strictEqual(w.label, null);
});

/* ── C · NUTRITION ──────────────────────────────────────────────────────── */

test('nutrition: calories left and protein progress against targets', () => {
  const n = DM.buildNutrition({
    snapshot: snap({ nutrition: { today: { calories: 1260, protein: 118 }, week: {} } }),
    profile: { target_calories: 2500, protein_target: 160 },
  });
  assert.strictEqual(n.hasData, true);
  assert.strictEqual(n.left, 1240);
  assert.strictEqual(n.over, false);
  assert.strictEqual(n.protein.consumed, 118);
  assert.strictEqual(n.protein.target, 160);
  assert.strictEqual(n.protein.pct, 74);
});

test('nutrition: over the target reports the overage, not a negative', () => {
  const n = DM.buildNutrition({
    snapshot: snap({ nutrition: { today: { calories: 2800, protein: 200 }, week: {} } }),
    profile: { target_calories: 2500, protein_target: 160 },
  });
  assert.strictEqual(n.over, true);
  assert.strictEqual(n.left, 300, 'magnitude only — the label carries the direction');
  assert.strictEqual(n.pct, 100, 'the bar never exceeds full');
});

test('nutrition: no calorie target → totals only, no computed "left"', () => {
  const n = DM.buildNutrition({
    snapshot: snap({ nutrition: { today: { calories: 900, protein: 60 }, week: {} } }),
    profile: {},
  });
  assert.strictEqual(n.hasTargets, false);
  assert.strictEqual(n.left, undefined, 'never invents a remaining figure');
  assert.strictEqual(n.consumed, 900);
});

test('nutrition: nothing logged is distinct from no data at all', () => {
  const empty = DM.buildNutrition({
    snapshot: snap({ nutrition: { today: { calories: 0, protein: 0 }, week: {} } }),
    profile: { target_calories: 2500 },
  });
  assert.strictEqual(empty.hasData, true);
  assert.strictEqual(empty.logged, false);

  const missing = DM.buildNutrition({ snapshot: null, profile: { target_calories: 2500 } });
  assert.strictEqual(missing.hasData, false);
});

/* ── D · FOCUS — evidence or nothing ────────────────────────────────────── */

test('focus: returns null when there is no snapshot at all', () => {
  assert.strictEqual(DM.buildFocus({}), null);
  assert.strictEqual(DM.buildFocus({ snapshot: null }), null);
});

test('focus: returns null when nothing is evidence-backed — no filler', () => {
  // Nutrition is on track, the streak is short, logging is healthy, and the
  // user has declared NO weekly training target — so there is no goal to count
  // toward and genuinely nothing to say.
  const f = DM.buildFocus({
    snapshot: snap({
      nutrition: { today: { calories: 1200, protein: 120 }, week: { daysLogged: 5 } },
      training: { thisWeekCount: 2, streak: 1,
        weekAdherence: { planned: null, completed: 2 } },
    }),
    profile: { target_calories: 2500, protein_target: 160 },
    hourOfDay: 12,
  });
  assert.strictEqual(f, null, 'silence beats a manufactured insight');
});

test('focus: a declared weekly target DOES earn a line when behind', () => {
  // Same scenario, but with a real target — the weekly goal is evidence-backed
  // and useful, so the seat is filled rather than left empty.
  const f = DM.buildFocus({
    snapshot: snap({
      nutrition: { today: { calories: 1200, protein: 120 }, week: { daysLogged: 5 } },
      training: { thisWeekCount: 2, streak: 1,
        weekAdherence: { planned: 4, completed: 2 } },
    }),
    profile: { target_calories: 2500, protein_target: 160 },
    hourOfDay: 12,
  });
  assert.strictEqual(f.id, 'week-remaining');
  assert.strictEqual(f.text, '2 workouts to hit your weekly goal.');
});

test('focus: protein behind, but only once late enough to act on', () => {
  const input = {
    snapshot: snap({ nutrition: { today: { calories: 800, protein: 40 }, week: { daysLogged: 5 } } }),
    profile: { target_calories: 2500, protein_target: 160 },
  };
  assert.strictEqual(DM.buildFocus(Object.assign({ hourOfDay: 9 }, input)), null,
    'not flagged first thing in the morning');
  const late = DM.buildFocus(Object.assign({ hourOfDay: 17 }, input));
  assert.strictEqual(late.id, 'protein-behind');
  assert.strictEqual(late.text, 'Protein is behind today.');
});

test('focus: is one short line, never a paragraph', () => {
  const cases = [
    { hourOfDay: 17, snapshot: snap({ nutrition: { today: { calories: 800, protein: 40 }, week: {} } }),
      profile: { target_calories: 2500, protein_target: 160 } },
    { hourOfDay: 12, snapshot: snap({ nutrition: { today: { calories: 3000, protein: 200 }, week: {} } }),
      profile: { target_calories: 2500, protein_target: 160 } },
    { hourOfDay: 12, snapshot: snap({ training: { thisWeekCount: 4, streak: 4, weekAdherence: { planned: 4, completed: 4 } },
      nutrition: { today: { calories: 2000, protein: 160 }, week: { daysLogged: 6 } } }),
      profile: { target_calories: 2500, protein_target: 160 } },
  ];
  for (const c of cases) {
    const f = DM.buildFocus(c);
    assert.ok(f, 'this case should produce an insight');
    assert.ok(f.text.length <= 48, `too long for a glanceable line: "${f.text}"`);
    assert.strictEqual((f.text.match(/\./g) || []).length, 1, 'a single sentence');
    assert.ok(['behind', 'good', 'neutral'].includes(f.tone));
  }
});

test('focus: never claims to be AI or coaching commentary', () => {
  const SRC = read('dashboard-model.js');
  const strings = SRC.match(/'[^']{4,}'/g) || [];
  for (const s of strings) {
    assert.ok(!/\b(AI|coach said|I think|I recommend|you should probably)\b/i.test(s),
      `focus copy must not present itself as AI reasoning: ${s}`);
  }
});

test('focus: priority — the most actionable evidence wins', () => {
  // Over calories AND a long streak: the actionable problem outranks the praise.
  const f = DM.buildFocus({
    snapshot: snap({
      nutrition: { today: { calories: 3000, protein: 200 }, week: { daysLogged: 6 } },
      training: { thisWeekCount: 5, streak: 9, weekAdherence: { planned: 4, completed: 5 } },
    }),
    profile: { target_calories: 2500, protein_target: 160 },
    hourOfDay: 20,
  });
  assert.strictEqual(f.id, 'calories-over');
});

/* ── E · PROGRESS ───────────────────────────────────────────────────────── */

test('progress: current weight plus its 30-day direction', () => {
  const p = DM.buildProgress({ snapshot: snap({
    weight: { current: 184.23, change30: -1.42, count: 9, goal: 175 },
  }) });
  assert.strictEqual(p.hasData, true);
  assert.strictEqual(p.current, 184.2);
  assert.strictEqual(p.change30, -1.4);
  assert.strictEqual(p.direction, 'down');
});

test('progress: no weigh-ins → honest empty state, still tappable', () => {
  const p = DM.buildProgress({ snapshot: snap() });
  assert.strictEqual(p.hasData, false);
  assert.strictEqual(p.href, 'weight-history.html');
  assert.strictEqual(p.current, undefined);
});

test('progress: a single weigh-in shows weight without a fabricated trend', () => {
  const p = DM.buildProgress({ snapshot: snap({ weight: { current: 200, change30: null, count: 1 } }) });
  assert.strictEqual(p.hasData, true);
  assert.strictEqual(p.change30, null);
  assert.strictEqual(p.direction, null);
});

test('progress: models only metrics with a real shared source', () => {
  const p = DM.buildProgress({ snapshot: snap({ weight: { current: 180, change30: 0, count: 3 } }) });
  for (const invented of ['steps', 'water', 'sleep']) {
    assert.ok(!(invented in p), `${invented} has no shared data source and must not be modelled`);
  }
});

/* ── Assembly + total-degradation ───────────────────────────────────────── */

test('model: assembles every section and degrades safely with no input', () => {
  const m = DM.buildDashboardModel({});
  assert.ok(m.today && m.week && m.nutrition && m.progress, 'all sections present');
  assert.strictEqual(m.focus, null);
  assert.strictEqual(m.week.hasData, false);
  assert.strictEqual(m.nutrition.hasData, false);
  assert.strictEqual(m.progress.hasData, false);
  assert.ok(m.today.cta, 'the primary action always exists');
});

test('model: owns no fetching, no DOM and no intelligence of its own', () => {
  const SRC = read('dashboard-model.js');
  assert.ok(!/supabaseClient|\bfetch\s*\(/.test(SRC), 'no data access');
  assert.ok(!/document\.|window\./.test(SRC), 'no DOM access');
  assert.ok(!/\bcaches\s*\.|navigator\s*\.\s*serviceWorker/.test(SRC), 'no worker/cache access');
});

/* ── Shared snapshot additions ──────────────────────────────────────────── */

test('snapshot: planned-per-week never invents a target', () => {
  assert.strictEqual(snPlannedPerWeek(4), 4);
  assert.strictEqual(snPlannedPerWeek('5'), 5);
  assert.strictEqual(snPlannedPerWeek(9), 7, 'capped at a week');
  for (const v of [0, null, undefined, '', 'x', -2]) {
    assert.strictEqual(snPlannedPerWeek(v), null, `${String(v)} → null, not a default`);
  }
});

test('snapshot: week adherence reports ratio only against a real target', () => {
  assert.deepStrictEqual(snWeekAdherence(3, 4), { planned: 4, completed: 3, ratio: 0.75, met: false });
  assert.deepStrictEqual(snWeekAdherence(4, 4), { planned: 4, completed: 4, ratio: 1, met: true });
  assert.deepStrictEqual(snWeekAdherence(2, 0), { planned: null, completed: 2, ratio: null, met: null });
  assert.strictEqual(snWeekAdherence(-1, 3).completed, 0, 'negative completions clamp to zero');
});

test('snapshot: the addition is additive — the existing shape is untouched', () => {
  const s = snComputeSnapshot({
    profile: { goal: 'fatloss', target_calories: 2200, training_days: 4 },
    weightLogs: [], bfLogs: [], msLogs: [], foodRows: [],
    workouts: [], today: '2026-08-10',
  });
  for (const k of ['generatedAt', 'profile', 'weight', 'bodyFat', 'waist', 'nutrition', 'training']) {
    assert.ok(k in s, `existing key ${k} still present`);
  }
  for (const k of ['trainedToday', 'streak', 'thisWeekCount', 'lastWorkout']) {
    assert.ok(k in s.training, `existing training.${k} still present`);
  }
  assert.ok(s.training.weekAdherence, 'weekAdherence added');
  assert.strictEqual(s.training.weekAdherence.planned, 4);
  assert.strictEqual(s.profile.training_days, 4, 'training_days exposed for reuse');
});

test('snapshot: thisWeekCount and weekAdherence.completed agree', () => {
  const s = snComputeSnapshot({
    profile: { training_days: 3 },
    weightLogs: [], bfLogs: [], msLogs: [], foodRows: [],
    workouts: [{ date: '2026-08-10' }, { date: '2026-08-09' }],
    today: '2026-08-10',
  });
  assert.strictEqual(s.training.weekAdherence.completed, s.training.thisWeekCount);
});

/* ── Home no longer hosts administrative actions ────────────────────────── */

test('home: configuration and commerce have left the primary hierarchy', () => {
  const html = read('app.html');
  assert.ok(!/Recalculate Goals/.test(html), 'goal configuration moved to Profile');
  assert.ok(!/id="recalcModal"/.test(html), 'the recalculate modal is no longer on Home');
  assert.ok(!/manageBilling|membershipSection/.test(html), 'billing moved to Profile');
  assert.ok(!/\$49|\$59|\$39/.test(html), 'the static price list is gone from Home');
  assert.ok(!/signOut\(\)/.test(html), 'Sign Out moved to Profile');
  assert.match(html, /href="profile\.html"/, 'Home links to the secondary destination');
});

test('home: those actions all exist on Profile', () => {
  const html = read('profile.html');
  for (const needle of ['Recalculate Goals', 'recalcModal', 'manageBilling', 'signOut()', 'store.html']) {
    assert.ok(html.includes(needle), `profile.html provides ${needle}`);
  }
});

test('home: consumes shared state and drops the food-resolution stack', () => {
  const html = read('app.html');
  for (const dep of ['food-core.js', 'food-display.js', 'nutrition.js']) {
    assert.ok(!html.includes(dep), `Home no longer loads ${dep}`);
  }
  for (const dep of ['snapshot.js', 'dashboard-model.js', 'program-state.js']) {
    assert.ok(html.includes(dep), `Home loads ${dep}`);
  }
  // No nu*/fd* helper may remain — that was the reason those files were loaded.
  assert.ok(!/\bnu[A-Z]\w*\s*\(/.test(html), 'no nutrition-module helper calls remain');
  assert.ok(!/\bfd[A-Z]\w*\s*\(/.test(html), 'no food-display helper calls remain');
});

test('home: one snapshot pass replaces the per-metric loaders', () => {
  const html = read('app.html');
  for (const gone of ['loadRecentActivity', 'loadTrainedToday', 'loadStreak',
    'loadNutritionSummary', 'loadRecentWeighIns', 'loadSnapshotExtras']) {
    assert.ok(!html.includes(gone), `${gone} removed`);
  }
  const snapCalls = html.match(/buildUserSnapshot\(/g) || [];
  assert.strictEqual(snapCalls.length, 1, 'exactly one snapshot call');
  // The only remaining direct queries are the two things snapshot does not model.
  const froms = html.match(/\.from\('([a-z_]+)'\)/g) || [];
  assert.deepStrictEqual([...new Set(froms)], [".from('workouts')"],
    'Home queries only the in-progress workout directly');
});
