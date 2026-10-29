/* Phase 4.3.9B — owner-found workout-logging defects (real iPhone test,
 * Push & Core A, Bodyweight Foundations).
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Equipment-free exercises showed a WEIGHT (lbs) input.
 * 2. Their coaching note said "Pick a weight…", because workout.html never
 *    passed catalog equipment and progression.js guessed it from the name
 *    (Pike Lean, Wall Slide, Glute Bridge → "other"; Split Squat → barbell).
 * 3. Timed exercises read "20–40 sec" in the Goal row but "20–40 reps" in the
 *    note, because the note hardcoded "reps".
 *
 * These tests run the REAL progression.js and the REAL workout.html /
 * workout-complete.html functions in a vm sandbox (the workout-guidance.test.js
 * pattern). They pin the fix and, just as hard, what must NOT change: weighted
 * exercises, customs, saved weights, numbers and the legacy wording. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Progression = require('./progression.js');

const WORKOUT = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');
const COMPLETE = fs.readFileSync(path.join(__dirname, 'workout-complete.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'defines ' + name + '()');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* Canonical rows exactly as production stores them (2026-10-25 read). */
const LIB = [
  { id: 'pike',    name: 'Pike Lean',        tracking_type: 'time',                is_bodyweight: true  },
  { id: 'slide',   name: 'Wall Slide',       tracking_type: 'time',                is_bodyweight: true  },
  { id: 'plank',   name: 'Plank',            tracking_type: 'time',                is_bodyweight: true  },
  { id: 'wallpu',  name: 'Wall Push-Up',     tracking_type: 'bodyweight_reps',     is_bodyweight: true  },
  { id: 'bridge',  name: 'Glute Bridge',     tracking_type: 'bodyweight_reps',     is_bodyweight: true  },
  { id: 'split',   name: 'Split Squat',      tracking_type: 'bodyweight_reps',     is_bodyweight: true  },
  { id: 'deadbug', name: 'Dead Bug',         tracking_type: 'bodyweight_reps',     is_bodyweight: true  },
  { id: 'hkr',     name: 'Hanging Knee Raise', tracking_type: 'bodyweight_reps',   is_bodyweight: true  },
  { id: 'dips',    name: 'Dips',             tracking_type: 'weighted_bodyweight', is_bodyweight: true  },
  { id: 'pullup',  name: 'Pull-Up',          tracking_type: 'weighted_bodyweight', is_bodyweight: true  },
  { id: 'bench',   name: 'Bench Press',      tracking_type: 'weight_reps',         is_bodyweight: false },
  { id: 'bss',     name: 'Bulgarian Split Squat', tracking_type: 'weight_reps',    is_bodyweight: false },
  { id: 'walk',    name: 'Incline Treadmill Walk', tracking_type: 'time',          is_bodyweight: false },
];

const FNS = ['catalogRowForExercise', 'trackingTypeForExercise', 'unitForExercise',
  'unitColumnLabel', 'unitPlaceholder', 'hasSavedWeight', 'isNoLoadExercise',
  'recForExercise', 'buildRecBlock', 'buildExCard'];

function workoutSandbox(library) {
  const varLine = WORKOUT.match(/var NO_LOAD_TRACKING = \{[^}]*\};/);
  assert.ok(varLine, 'workout.html declares NO_LOAD_TRACKING');
  const sandbox = {
    Progression,
    exerciseLibrary: library === undefined ? LIB : library,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  };
  vm.createContext(sandbox);
  vm.runInContext(varLine[0] + '\n' + FNS.map((n) => extractFn(WORKOUT, n)).join('\n') +
    '\nthis.__fns = {' + FNS.join(',') + '};', sandbox);
  return sandbox.__fns;
}

const W = workoutSandbox();

let nextId = 1;
function ex(id, opts) {
  const o = opts || {};
  const row = LIB.find((r) => r.id === id);
  const sets = (o.sets || [{}]).map((s, i) => Object.assign(
    { id: 's' + (nextId++), set_number: i + 1, weight_lbs: null, reps: null, completed: false }, s));
  return {
    id: 'we' + (nextId++),
    exercise_id: o.custom ? null : id,
    name: o.name || (row ? row.name : id),
    reps_low: o.low == null ? 8 : o.low,
    reps_high: o.high == null ? 12 : o.high,
    target_sets: o.targetSets || sets.length,
    history: o.history || [],
    sets,
  };
}

const card = (e) => W.buildExCard(e, 0);
const hasWeightInput = (html) => /placeholder="lbs"/.test(html);
const hasWeightHeader = (html) => />Weight</.test(html);
const NO_WEIGHT_TALK = /pick a weight|increasing weight|add weight|add load|this weight|\blb\b/i;

/* ── 1 · Defect 1: the weight input ─────────────────────────────────────── */

test('timed equipment-free exercises render Sec and no weight input (Pike Lean, Wall Slide, Plank)', () => {
  ['pike', 'slide', 'plank'].forEach((id) => {
    const html = card(ex(id, { low: 20, high: 40 }));
    assert.ok(!hasWeightInput(html), id + ': no lbs input');
    assert.ok(!hasWeightHeader(html), id + ': no Weight column');
    assert.match(html, />Sec</, id + ': Sec column');
    assert.match(html, /placeholder="sec"/, id + ': sec input');
    assert.match(html, /class="set-row no-load"/, id + ': three-column row');
  });
});

test('rep-based equipment-free exercises render Reps and no weight input', () => {
  ['wallpu', 'bridge', 'split', 'deadbug', 'hkr'].forEach((id) => {
    const html = card(ex(id));
    assert.ok(!hasWeightInput(html), id + ': no lbs input');
    assert.match(html, />Reps</, id);
    assert.match(html, /placeholder="reps"/, id);
  });
});

test('weighted bodyweight variations keep the weight input (Dips, Pull-Up)', () => {
  ['dips', 'pullup'].forEach((id) => {
    const html = card(ex(id));
    assert.ok(hasWeightInput(html), id + ' can take added load');
    assert.ok(hasWeightHeader(html), id);
    assert.ok(!/no-load/.test(html), id);
  });
});

test('equipment exercises keep the weight input, including a timed machine exercise', () => {
  ['bench', 'bss', 'walk'].forEach((id) => {
    assert.ok(hasWeightInput(card(ex(id))), id);
  });
});

test('custom, legacy and unresolved exercises keep the weight input', () => {
  assert.ok(hasWeightInput(card(ex('pike', { custom: true, name: 'My Hold' }))), 'custom');
  assert.ok(hasWeightInput(card(ex('ghost', { name: 'Not In Catalog' }))), 'missing row');
  const noCatalog = workoutSandbox([]);
  assert.ok(hasWeightInput(noCatalog.buildExCard(ex('plank'), 0)), 'catalog not loaded');
});

test('a weight already saved on a set keeps the input and shows the value', () => {
  const html = card(ex('split', { sets: [{ weight_lbs: 20, reps: 10 }, {}] }));
  assert.ok(hasWeightInput(html), 'existing data is never hidden');
  assert.match(html, /value="20"/);
});

test('a weight in the exercise history keeps the input', () => {
  const history = [{ date: '2026-10-01', sets: [{ weight: 15, reps: 10, completed: true }] }];
  assert.ok(hasWeightInput(card(ex('bridge', { history }))));
});

test('a set with weight 0 counts as saved weight and keeps the input', () => {
  assert.ok(hasWeightInput(card(ex('bridge', { sets: [{ weight_lbs: 0, reps: 10 }] }))));
});

/* ── 2 · Defect 2: "Pick a weight" ──────────────────────────────────────── */

test('the workout passes catalog equipment, so no equipment-free note mentions weight', () => {
  ['pike', 'slide', 'plank', 'wallpu', 'bridge', 'split', 'deadbug'].forEach((id) => {
    const rec = W.recForExercise(ex(id, { low: 15, high: 30 }));
    assert.equal(rec.equipment, 'bodyweight', id + ': catalog, not name');
    assert.ok(!NO_WEIGHT_TALK.test(rec.coachNote), id + ': ' + rec.coachNote);
  });
});

test('the defect reproduces from the name alone, proving the catalog is what fixes it', () => {
  ['Pike Lean', 'Wall Slide', 'Glute Bridge', 'Split Squat'].forEach((name) => {
    const legacy = Progression.analyze({ exerciseName: name, repsLow: 15, repsHigh: 30 });
    assert.match(legacy.coachNote, /Pick a weight/, name + ' guessed as weighted by name');
  });
});

test('weighted, custom and saved-weight exercises pass no equipment (weight jumps unchanged)', () => {
  const history = [{ date: '2026-10-01', sets: [{ weight: 20, reps: 10, completed: true }] }];
  [ex('bench'), ex('bss'), ex('dips'), ex('pike', { custom: true, name: 'Pike Lean' }),
   ex('split', { history })].forEach((e) => {
    const rec = W.recForExercise(e);
    const legacyEquip = Progression.inferEquipment(e.name);
    assert.equal(rec.equipment, legacyEquip, e.name + ' keeps name-based equipment');
  });
});

/* ── 3 · Defect 3: seconds read as reps ─────────────────────────────────── */

test('first-session notes for timed exercises read in seconds (owner examples)', () => {
  [['slide', 30, 45], ['pike', 15, 30], ['plank', 20, 40]].forEach(([id, lo, hi]) => {
    const e = ex(id, { low: lo, high: hi });
    const rec = W.recForExercise(e);
    assert.equal(rec.goalRange.display, lo + '–' + hi + ' sec');
    assert.ok(rec.coachNote.includes(lo + '–' + hi + ' sec'), rec.coachNote);
    assert.ok(!/\breps?\b/i.test(rec.coachNote), id + ': ' + rec.coachNote);
    const html = W.buildRecBlock(e, 0);
    assert.ok(!/\breps?\b/i.test(html.replace(/rec-/g, '')), id + ' card has no "reps"');
  });
});

/* ── 4 · Every history branch: unit and load wording ────────────────────── */

const bw = (reps, completed) => reps.map((r) => ({ weight: null, reps: r, completed: completed !== false }));
const BRANCHES = {
  incomplete: { targetSets: 3, history: [{ sets: bw([30]) }] },
  increase:   { targetSets: 2, history: [{ sets: bw([40, 40]) }] },
  holdSame:   { targetSets: 2, history: [{ sets: bw([30, 30]) }] },
  holdMatch:  { targetSets: 2, history: [{ sets: bw([35, 30]) }] },
  holdBring:  { targetSets: 2, history: [{ sets: bw([40, 30]) }] },
  below:      { targetSets: 2, history: [{ sets: bw([10, 10]) }] },
};
const run = (name, extra, branch) => Progression.analyze(Object.assign(
  { exerciseName: name, repsLow: 20, repsHigh: 40 }, BRANCHES[branch], extra));

test('every timed equipment-free branch reads in seconds and never mentions weight', () => {
  Object.keys(BRANCHES).forEach((b) => {
    const r = run('Wall Slide', { unit: 'sec', equipment: 'bodyweight' }, b);
    assert.ok(!/\breps?\b/i.test(r.coachNote), b + ': ' + r.coachNote);
    assert.ok(!NO_WEIGHT_TALK.test(r.coachNote), b + ': ' + r.coachNote);
    assert.match(r.recommendedDisplay, / sec$/, b + ' Today line');
    assert.match(r.lastPerformance.display, / sec$/, b + ' Last line');
  });
});

test('every rep-based equipment-free branch keeps reps and never mentions weight', () => {
  Object.keys(BRANCHES).forEach((b) => {
    const r = run('Glute Bridge', { unit: 'reps', equipment: 'bodyweight' }, b);
    assert.ok(!NO_WEIGHT_TALK.test(r.coachNote), b + ': ' + r.coachNote);
    assert.ok(!/ sec\b/.test(r.coachNote + r.recommendedDisplay), b);
  });
});

test('a weighted timed exercise reads in seconds but keeps its weight advice', () => {
  const history = [{ sets: [{ weight: 25, reps: 30, completed: true }, { weight: 25, reps: 30, completed: true }] }];
  const r = Progression.analyze({ exerciseName: 'Weighted Wall Sit', repsLow: 20, repsHigh: 40,
    targetSets: 2, history, unit: 'sec' });
  assert.equal(r.coachNote, 'Add 1 sec before increasing weight — aim for 31 sec on every set.');
  assert.equal(r.recommendedDisplay, '25 × 31, 31 sec');
});

/* ── 5 · Nothing else moves ─────────────────────────────────────────────── */

test('numbers and actions are identical with and without the new metadata', () => {
  Object.keys(BRANCHES).forEach((b) => {
    ['Wall Slide', 'Glute Bridge', 'Split Squat', 'Pike Lean'].forEach((name) => {
      const legacy = run(name, {}, b);
      const aware = run(name, { unit: 'sec', equipment: 'bodyweight' }, b);
      ['action', 'recommendedWeight', 'recommendedReps', 'recommendedSets', 'plateau',
       'deloadSuggested', 'deloadWeight'].forEach((k) => {
        assert.deepEqual(aware[k], legacy[k], name + ' ' + b + ' ' + k);
      });
    });
  });
});

test('weighted rep exercises read exactly as before when the workout passes unit reps', () => {
  const weighted = [
    [], [{ sets: [{ weight: 100, reps: 12, completed: true }, { weight: 100, reps: 12, completed: true }] }],
    [{ sets: [{ weight: 100, reps: 9, completed: true }, { weight: 100, reps: 9, completed: true }] }],
    [{ sets: [{ weight: 100, reps: 10, completed: true }, { weight: 100, reps: 9, completed: true }] }],
    [{ sets: [{ weight: 100, reps: 12, completed: true }, { weight: 100, reps: 9, completed: true }] }],
    [{ sets: [{ weight: 100, reps: 5, completed: true }, { weight: 100, reps: 5, completed: true }] }],
    [{ sets: [{ weight: 100, reps: 10, completed: true }] }],
  ];
  weighted.forEach((history, i) => {
    ['Bench Press', 'Bulgarian Split Squat', 'Dips'].forEach((name) => {
      const base = { exerciseName: name, repsLow: 8, repsHigh: 12, targetSets: 2, history };
      const legacy = Progression.analyze(base);
      const aware = Progression.analyze(Object.assign({ unit: 'reps' }, base));
      assert.deepEqual(aware, legacy, name + ' case ' + i);
    });
  });
});

test('PARITY: callers that pass no metadata keep the historical wording byte-for-byte', () => {
  const legacy = (name, extra, branch) => run(name, extra || {}, branch).coachNote;
  assert.equal(Progression.analyze({ exerciseName: 'Plank', repsLow: 20, repsHigh: 40 }).coachNote,
    'Log your sets — aim for 20–40 reps and we\'ll guide you next time.');
  assert.equal(Progression.analyze({ exerciseName: 'Pike Lean', repsLow: 15, repsHigh: 30 }).coachNote,
    'Pick a weight you can do for 15–30 reps. We\'ll guide your progression next time.');
  assert.equal(legacy('Plank', {}, 'incomplete'), 'Complete all target sets before increasing weight.');
  assert.equal(legacy('Plank', {}, 'increase'),
    'You topped the rep range. Add reps beyond 40, add load, or move to a harder variation.');
  assert.equal(legacy('Plank', {}, 'holdSame'), 'Add 1 rep before increasing weight — aim for 31 on every set.');
  assert.equal(legacy('Plank', {}, 'holdMatch'),
    'Match your top set (35 reps) on every set, then keep adding reps toward 40.');
  assert.equal(legacy('Plank', {}, 'holdBring'), 'Bring every set up to 40 reps, then add weight next time.');
  assert.equal(legacy('Plank', {}, 'below'), 'Stay at this weight until you hit at least 20 reps on every set.');
  assert.equal(run('Plank', {}, 'holdSame').recommendedDisplay, 'BW × 31, 31');
});

test('personal records still come only from rep-tracked sets with a weight', () => {
  const hold = [{ weight: 20, reps: 45 }];
  assert.equal(Progression.evaluatePRs(hold, {}, { trackingType: 'time' }).updated, false);
  const r = Progression.evaluatePRs([{ weight: 100, reps: 10 }], {}, { trackingType: 'weight_reps' });
  assert.equal(r.updated, true);
  // The caller filters on weight_lbs != null before evaluating; unchanged.
  assert.match(WORKOUT, /s\.completed && s\.weight_lbs != null && s\.reps != null/);
});

test('saving a set is untouched: a blank weight is still stored as "no external load"', () => {
  const ExerciseLog = require('./exercise-log.js');
  assert.deepEqual(ExerciseLog.sanitizeSetField('weight_lbs', ''), { value: null, valid: true });
  assert.deepEqual(ExerciseLog.sanitizeSetField('reps', '30'), { value: 30, valid: true });
});

/* ── 6 · Other programs: representative published exercises ─────────────── */

test('Plank, Dead Bug and Hanging Knee Raise (Fat Loss, Muscle Gain, Glute Builder) get the fix too', () => {
  [['plank', 20, 40, 'sec'], ['deadbug', 8, 10, 'reps'], ['hkr', 10, 15, 'reps']].forEach(([id, lo, hi, u]) => {
    const e = ex(id, { low: lo, high: hi });
    const html = card(e);
    assert.ok(!hasWeightInput(html), id);
    const rec = W.recForExercise(e);
    assert.ok(rec.coachNote.includes(lo + '–' + hi + ' ' + u), id + ': ' + rec.coachNote);
    assert.ok(!NO_WEIGHT_TALK.test(rec.coachNote), id);
  });
});

/* ── 7 · Completion page uses the same rule ─────────────────────────────── */

test('the completion page reads is_bodyweight and passes tracking metadata into its note', () => {
  assert.match(COMPLETE, /select\('id,tracking_type,is_bodyweight'\)/);
  const src = extractFn(COMPLETE, 'noteMetaFor');
  const make = (tracking) => {
    const box = { tracking };
    vm.createContext(box);
    vm.runInContext(src + '\nthis.f = noteMetaFor;', box);
    return box.f;
  };
  const byId = {
    pike:  { tracking_type: 'time', is_bodyweight: true },
    bench: { tracking_type: 'weight_reps', is_bodyweight: false },
    dips:  { tracking_type: 'weighted_bodyweight', is_bodyweight: true },
  };
  const f = make({ byId, failed: false });
  const noWeight = [{ sets: [{ weight: null, reps: 30 }] }];
  assert.deepEqual(f({ exercise_id: 'pike' }, noWeight), { trackingType: 'time', equipment: 'bodyweight' });
  assert.deepEqual(f({ exercise_id: 'pike' }, [{ sets: [{ weight: 10, reps: 30 }] }]), { trackingType: 'time' });
  assert.deepEqual(f({ exercise_id: 'bench' }, noWeight), { trackingType: 'weight_reps' });
  assert.deepEqual(f({ exercise_id: 'dips' }, noWeight), { trackingType: 'weighted_bodyweight' });
  assert.deepEqual(f({ exercise_id: null }, noWeight), {}, 'custom keeps legacy wording');
  assert.deepEqual(f({ exercise_id: 'gone' }, noWeight), {}, 'missing row keeps legacy wording');
  assert.deepEqual(make({ byId, failed: true })({ exercise_id: 'pike' }, noWeight), {}, 'failed read');
});
