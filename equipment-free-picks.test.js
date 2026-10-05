/* Phase 4.3.9B — equipment-free Swap and manual picker in workout.html.
 * ──────────────────────────────────────────────────────────────────────────
 * A Bodyweight Foundations session must not be able to pick up an exercise
 * that needs equipment through either escape hatch: Swap, or the manual
 * exercise picker (including its shortcuts, its custom "+ Add" row, its
 * no-module fallback and a typed name that resolves to a canonical exercise).
 *
 * The rule itself is ExerciseFilters' (exercise-filters.test.js). These tests
 * run the REAL page functions, extracted from workout.html into a vm sandbox
 * with the real exercise modules and catalog fixture, and stub only the DOM,
 * the sheet primitive and Supabase. Writes are recorded, never performed. */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EI = require('./exercise-core.js');
const EF = require('./exercise-filters.js');
const ES = require('./exercise-substitution.js');
const EP = require('./exercise-prefs.js');
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const PAGE = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'workout.html defines ' + name + '()');
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

const PAGE_FNS = [
  'canonicalCatalog', 'workoutEquipmentFree', 'pickTargetsWorkout', 'pickerEquipmentFree',
  'equipmentFreeRow', 'equipmentFreeId',
  'filterPicker', 'pickerRowHtml', 'pickerEmptyHtml', 'shortcutsHtml', 'shortcutSectionHtml', 'prefsCatalogs',
  'openExerciseSwap', 'renderExerciseSwap', 'applySwap', 'selectExercise',
  'resolvePickedId', 'libraryExerciseId', 'completedSetCount', 'beginAction', 'endAction',
];
const BLOCKED_DECL = (PAGE.match(/var EQUIPMENT_FREE_BLOCKED = [^\n]*;/) || [])[0];
const UNLOADED_DECL = (PAGE.match(/var EQUIPMENT_FREE_PROGRAMS_IF_UNLOADED = [^\n]*;/) || [])[0];

const CUSTOMS = [{ id: 'u-1', name: 'Sled Push', category: 'Custom', equipment: null, user_created: true }];
const byName = (n) => {
  const e = EXERCISE_CATALOG.find((x) => x.name === n);
  assert.ok(e, n + ' is in the catalog');
  return e;
};

const STUBS = `
  var pickerMode = null, swapCtx = null, currentWorkout = null, editingTemplate = null;
  var exercises = [], favoriteRows = null, recentUsages = null, customExercises = [];
  var _inFlight = {};
  var toasts = [], writes = [], saved = [];
  var pickerFilters = (typeof ExerciseFilters !== 'undefined') ? ExerciseFilters.emptyFilters() : { splits: [], movements: [], equipment: [] };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function favBtnHtml() { return ''; }
  function recordSearchGap() {}
  function showToast(m) { toasts.push(m); }
  // The real close fires the sheet's onClose, which clears an abandoned swap.
  function closePicker() { if (pickerMode === 'swap') swapCtx = null; }
  function closeExerciseSwap() {}
  function saveUserExercise(n) { saved.push(n); return Promise.resolve(); }
  function exerciseIdentityColumns(name, id) { return { exercise_id: id || null, user_exercise_id: null }; }
  function addTemplateExercise(name, id) { writes.push(['template', name, id]); }
  function applyReviewResolution(name, id) { writes.push(['resolve', name, id]); }
  function renderBuilderExercises() {}
  function detailRefFor(ex) { return { name: ex.name, exerciseId: ex.exercise_id, customId: null }; }
  var supabaseClient = { from: function (table) {
    var api = {
      insert: function (row) { writes.push(['insert', table, row]); return api; },
      update: function (row) { writes.push(['update', table, row]); return api; },
      select: function () { return api; },
      eq: function () { return Promise.resolve({ error: { message: 'stubbed' } }); },
      single: function () { return Promise.resolve({ data: null, error: { message: 'stubbed' } }); },
    };
    return api;
  } };
`;

function harness(o) {
  o = o || {};
  const els = {};
  const sandbox = {
    console: { error() {}, warn() {} },
    ExerciseFilters: o.noFilters ? undefined : EF,
    ExerciseSubstitution: ES,
    ExercisePrefs: EP,
    exerciseLibrary: EXERCISE_CATALOG.map((e) => Object.assign({}, e)).concat(CUSTOMS),
    exerciseIndex: o.noFilters ? null : EI.createExerciseIndex(EXERCISE_CATALOG),
    lucide: { createIcons() {} },
    MMSheet: { open() {}, close() {}, isOpen() { return false; } },
    document: { getElementById: (id) => (els[id] = els[id] || { innerHTML: '', value: '' }) },
  };
  if (o.noFilters) delete sandbox.ExerciseFilters;
  vm.createContext(sandbox);
  vm.runInContext(STUBS + '\n' + BLOCKED_DECL + '\n' + UNLOADED_DECL + '\n' + PAGE_FNS.map((n) => extractFn(PAGE, n)).join('\n'), sandbox);
  vm.runInContext('currentWorkout = ' + JSON.stringify(o.workout === undefined ? null : o.workout) + ';', sandbox);
  return { s: sandbox, el: (id) => els[id] || { innerHTML: '', value: '' } };
}

const BWF = { id: 'w-1', program_slug: 'bodyweight_foundations', session_key: 'full_a' };
const FAT_LOSS = { id: 'w-2', program_slug: 'fat_loss_blueprint', session_key: 'upper_a' };
const MANUAL = { id: 'w-3', program_slug: null, session_key: null };

// Names of the rows a render offered as tappable choices.
const offered = (html) => Array.from(String(html).matchAll(/class="(?:picker-item|swap-item)"[^>]*data-name="([^"]*)"/g))
  .map((m) => m[1].replace(/&amp;/g, '&'));

function pick(h, mode, query, swap) {
  vm.runInContext('pickerMode = ' + JSON.stringify(mode) + '; swapCtx = ' + JSON.stringify(swap || null) + ';', h.s);
  h.s.filterPicker(query || '');
  return { list: offered(h.el('pickerList').innerHTML), add: h.el('pickerAddRow').innerHTML, html: h.el('pickerList').innerHTML };
}

function swapNames(h, exName, mode) {
  const ex = byName(exName);
  h.s.openExerciseSwap({ mode: mode || 'workout', exIdx: 0, ref: { name: ex.name, exerciseId: ex.id, customId: null } });
  return { names: offered(h.el('exerciseSwapBody').innerHTML), html: h.el('exerciseSwapBody').innerHTML };
}

const isFree = (n) => EF.isEquipmentFreeExercise(byName(n));
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ── Equipment-free session: Swap ───────────────────────────────────────── */

test('Swap in a Bodyweight Foundations session offers only equipment-free exercises', () => {
  const h = harness({ workout: BWF });
  EF.EQUIPMENT_FREE_EXERCISE_IDS.forEach((id) => {
    const src = EXERCISE_CATALOG.find((e) => e.id === id);
    swapNames(h, src.name).names.forEach((n) => assert.ok(isFree(n), src.name + ' → ' + n));
  });
});

test('Swap still offers the valid bodyweight progressions', () => {
  const r = swapNames(harness({ workout: BWF }), 'Push-Up');
  ['Knee Push-Up', 'Wall Push-Up'].forEach((n) => assert.ok(r.names.includes(n), n));
  ['Incline Push-Up', 'Decline Push-Up', 'Dumbbell Press', 'Cable Fly', 'Pec Deck']
    .forEach((n) => assert.ok(!r.names.includes(n), n + ' is not offered'));
});

test('Swap with no compatible candidate shows the existing note — never an equipment fallback', () => {
  const r = swapNames(harness({ workout: BWF }), 'Pike Push-Up');
  assert.deepStrictEqual(r.names, []);
  assert.match(r.html, /class="swap-note">No close alternatives in the library for this one\.</);
});

test('a ranked equipment candidate cannot be committed in an equipment-free session', async () => {
  const h = harness({ workout: BWF });
  vm.runInContext('exercises = [{ id: "we-1", name: "Push-Up", exercise_id: "' + byName('Push-Up').id + '", sets: [] }];', h.s);
  const bench = byName('Bench Press');
  await h.s.applySwap(bench.name, bench.id, { mode: 'workout', exIdx: 0, ref: {} });
  assert.deepStrictEqual(plain(h.s.writes), [], 'no update reached the database');
  assert.deepStrictEqual(plain(h.s.saved), []);
  assert.equal(h.s.toasts.length, 1);
  assert.match(h.s.toasts[0], /equipment-free/);
  // An equipment-free candidate does reach the commit path.
  const knee = byName('Knee Push-Up');
  await h.s.applySwap(knee.name, knee.id, { mode: 'workout', exIdx: 0, ref: {} });
  assert.equal(h.s.writes[0][0], 'update');
  assert.equal(h.s.writes[0][2].exercise_id, knee.id);
});

/* ── Equipment-free session: manual picker ──────────────────────────────── */

test('the manual picker browse list is exactly the equipment-free pool', () => {
  const r = pick(harness({ workout: BWF }), 'workout', '');
  assert.deepStrictEqual(r.list.slice().sort(),
    EF.EQUIPMENT_FREE_EXERCISE_IDS.map((id) => EXERCISE_CATALOG.find((e) => e.id === id).name).sort());
  assert.ok(!r.list.includes('Sled Push'), 'customs are not offered');
});

test('manual picker search drops equipment exercises and keeps bodyweight ones', () => {
  const h = harness({ workout: BWF });
  const push = pick(h, 'workout', 'push up');
  ['Push-Up', 'Knee Push-Up', 'Wall Push-Up'].forEach((n) => assert.ok(push.list.includes(n), n));
  ['Incline Push-Up', 'Decline Push-Up'].forEach((n) => assert.ok(!push.list.includes(n), n));
  ['bench press', 'pull up', 'squat', 'curl', 'row', 'deadlift'].forEach((q) => {
    pick(h, 'workout', q).list.forEach((n) => assert.ok(isFree(n), q + ' → ' + n));
  });
});

test('manual picker never offers to create a custom in an equipment-free session', () => {
  const h = harness({ workout: BWF });
  const r = pick(h, 'workout', 'zzqx');
  assert.equal(r.add, '', 'no "+ Add" row');
  assert.deepStrictEqual(r.list, []);
  assert.match(r.html, /No exercises match/, 'the existing empty state explains it');
});

test('the manual picker reached from Swap is restricted too', () => {
  const swap = { mode: 'workout', exIdx: 0, ref: {} };
  const r = pick(harness({ workout: BWF }), 'swap', 'press', swap);
  r.list.forEach((n) => assert.ok(isFree(n), n));
  assert.ok(!r.list.includes('Dumbbell Shoulder Press'));
});

test('favorites and recents show only equipment-free shortcuts, and an emptied section is omitted', () => {
  const h = harness({ workout: BWF });
  vm.runInContext('favoriteRows = ' + JSON.stringify([
    { exercise_id: byName('Bench Press').id, user_exercise_id: null, created_at: '2026-10-01T00:00:00Z' },
    { exercise_id: byName('Push-Up').id, user_exercise_id: null, created_at: '2026-10-02T00:00:00Z' },
    { exercise_id: null, user_exercise_id: 'u-1', created_at: '2026-10-03T00:00:00Z' },
  ]) + '; recentUsages = ' + JSON.stringify([
    { exerciseId: byName('Lat Pulldown').id, customId: null, name: 'Lat Pulldown' },
  ]) + '; customExercises = ' + JSON.stringify(CUSTOMS) + '; pickerMode = "workout";', h.s);
  const html = h.s.shortcutsHtml();
  assert.deepStrictEqual(offered(html), ['Push-Up']);
  assert.ok(!/Recent/.test(html), 'the Recent section, emptied by the rule, is omitted');
  assert.ok(!html.includes(EP.COPY.recentsEmpty), 'no untrue "nothing yet" copy');
  // An equipped session still shows every shortcut.
  vm.runInContext('currentWorkout = ' + JSON.stringify(FAT_LOSS) + ';', h.s);
  assert.deepStrictEqual(offered(h.s.shortcutsHtml()).sort(), ['Bench Press', 'Lat Pulldown', 'Push-Up', 'Sled Push']);
});

test('the commit boundary blocks an equipment exercise, a custom and a typed canonical name', async () => {
  const h = harness({ workout: BWF });
  const tries = [
    ['Bench Press', byName('Bench Press').id],   // a forged or stale row
    ['Pull-Up', byName('Pull-Up').id],           // Bodyweight-classified, needs a bar
    ['Bench Press', ''],                          // a typed name resolving to a canonical
    ['Sled Push', ''],                            // a custom
    ['Brand New Thing', ''],                      // would create a custom
  ];
  for (const [name, id] of tries) {
    vm.runInContext('pickerMode = "workout";', h.s);
    await h.s.selectExercise(name, id);
  }
  assert.deepStrictEqual(plain(h.s.writes), [], 'nothing was inserted');
  assert.deepStrictEqual(plain(h.s.saved), [], 'no custom was created');
  assert.equal(h.s.toasts.length, tries.length);
  // An equipment-free pick proceeds to the insert.
  vm.runInContext('pickerMode = "workout";', h.s);
  await h.s.selectExercise('Push-Up', byName('Push-Up').id);
  assert.equal(h.s.writes[0][0], 'insert');
  assert.equal(h.s.writes[0][2].exercise_id, byName('Push-Up').id);
});

test('a manual Swap pick of an equipment exercise is blocked at the commit boundary', async () => {
  const h = harness({ workout: BWF });
  vm.runInContext('exercises = [{ id: "we-1", name: "Push-Up", exercise_id: "x", sets: [] }];' +
    'pickerMode = "swap"; swapCtx = { mode: "workout", exIdx: 0, ref: {}, replacing: true };', h.s);
  await h.s.selectExercise('Bench Press', byName('Bench Press').id);
  assert.deepStrictEqual(plain(h.s.writes), []);
  assert.equal(h.s.toasts.length, 1);
});

/* ── Filter module unavailable (exercise-filters.js failed to load) ──────────
 * Only an equipment-free session fails closed. Every other Program, and a
 * manual workout, keeps the ORIGINAL fallback: a name/category substring match
 * over the whole library, custom "+ Add" included. */

// The pre-4.3.9B fallback, computed independently of the page.
const originalFallback = (q) => {
  const k = q.trim().toLowerCase();
  return EXERCISE_CATALOG.concat(CUSTOMS)
    .filter((e) => e.name.toLowerCase().includes(k) || (e.category || '').toLowerCase().includes(k))
    .map((e) => e.name);
};

test('module unavailable: an equipment-free session exposes nothing', async () => {
  const h = harness({ workout: BWF, noFilters: true });
  for (const q of ['', 'bench', 'push', 'pull']) {
    assert.deepStrictEqual(pick(h, 'workout', q).list, [], 'no rows for "' + q + '"');
  }
  assert.equal(pick(h, 'workout', 'brand new thing').add, '', 'no "+ Add" row');
  assert.deepStrictEqual(pick(h, 'swap', 'bench', { mode: 'workout', exIdx: 0, ref: {} }).list, []);
  assert.deepStrictEqual(swapNames(h, 'Push-Up').names, [], 'Swap offers nothing it cannot prove');
  // And nothing can be committed, not even an equipment-free exercise it cannot verify.
  for (const n of ['Bench Press', 'Push-Up']) {
    vm.runInContext('pickerMode = "workout";', h.s);
    await h.s.selectExercise(n, byName(n).id);
  }
  assert.deepStrictEqual(plain(h.s.writes), []);
});

for (const [label, workout] of [['another Program', FAT_LOSS], ['a manual workout', MANUAL]]) {
  test('module unavailable: ' + label + ' keeps the original fallback picker exactly', async () => {
    const h = harness({ workout, noFilters: true });
    for (const q of ['', 'bench', 'press', 'sled']) {
      assert.deepStrictEqual(pick(h, 'workout', q).list, originalFallback(q), 'fallback for "' + q + '"');
    }
    assert.ok(pick(h, 'workout', 'bench').list.includes('Bench Press'));
    assert.notEqual(pick(h, 'workout', 'brand new thing').add, '', '"+ Add" still offered');
    assert.ok(swapNames(h, 'Push-Up').names.includes('Dumbbell Press'), 'Swap unrestricted');
    vm.runInContext('pickerMode = "workout";', h.s);
    await h.s.selectExercise('Bench Press', byName('Bench Press').id);
    assert.equal(plain(h.s.writes)[0][0], 'insert', 'an equipment exercise still commits');
    assert.deepStrictEqual(plain(h.s.toasts).filter((t) => /equipment-free/.test(t)), []);
  });
}

test('the page fallback Program map is exactly the shared equipment-free Program list', () => {
  const m = PAGE.match(/var EQUIPMENT_FREE_PROGRAMS_IF_UNLOADED = (\{[^}]*\});/);
  assert.ok(m, 'the fallback map is declared');
  const keys = Object.keys(vm.runInNewContext('(' + m[1] + ')'));
  assert.deepStrictEqual(keys.slice().sort(), EF.EQUIPMENT_FREE_PROGRAM_SLUGS.slice().sort());
  assert.ok(Object.isFrozen(EF.EQUIPMENT_FREE_PROGRAM_SLUGS));
  EF.EQUIPMENT_FREE_PROGRAM_SLUGS.forEach((slug) => assert.equal(EF.isEquipmentFreeProgram(slug), true, slug));
});

/* ── Equipped and unrestricted contexts ─────────────────────────────────── */

for (const [label, workout] of [['another Program', FAT_LOSS], ['a manual workout', MANUAL], ['no workout', null]]) {
  test('equipped: ' + label + ' keeps the full picker and Swap', () => {
    const h = harness({ workout });
    // The picker's existing 40-row cap, filled from the full catalog — not
    // the 38-row equipment-free list.
    const all = pick(h, 'workout', '');
    assert.equal(all.list.length, 40);
    assert.ok(all.list.some((n) => !isFree(n)), 'equipment exercises are browsable');
    assert.ok(pick(h, 'workout', 'bench press').list.includes('Bench Press'));
    assert.ok(pick(h, 'workout', 'pull up').list.includes('Pull-Up'));
    assert.notEqual(pick(h, 'workout', 'brand new thing').add, '', '"+ Add" is still offered');
    assert.ok(pick(h, 'workout', 'sled').list.includes('Sled Push'), 'customs are still offered');
    const sw = swapNames(h, 'Push-Up');
    ['Incline Push-Up', 'Dumbbell Press', 'Cable Fly'].forEach((n) => assert.ok(sw.names.includes(n), n));
    assert.ok(swapNames(h, 'Pike Push-Up').names.length > 0, 'equipment presses still offered');
  });
}

test('equipped: an equipment exercise still commits normally', async () => {
  const h = harness({ workout: FAT_LOSS });
  vm.runInContext('pickerMode = "workout";', h.s);
  await h.s.selectExercise('Bench Press', byName('Bench Press').id);
  assert.deepStrictEqual(plain(h.s.toasts).filter((t) => /equipment-free/.test(t)), []);
  assert.equal(h.s.writes[0][0], 'insert');
});

test('a Routine draft and a history review are never restricted, even mid-session', () => {
  const h = harness({ workout: BWF });
  assert.ok(pick(h, 'template', 'bench press').list.includes('Bench Press'));
  assert.ok(pick(h, 'resolve', 'bench press').list.includes('Bench Press'));
  // A Routine-draft Swap is unrestricted too.
  assert.ok(swapNames(h, 'Push-Up', 'template').names.includes('Dumbbell Press'));
  // A manual pick for a Routine-draft swap is unrestricted.
  const r = pick(h, 'swap', 'bench press', { mode: 'template', exIdx: 0, ref: {} });
  assert.ok(r.list.includes('Bench Press'));
});

/* ── Wiring (supplemental source assertions) ────────────────────────────── */

test('both flows read the one shared rule, not a page-local copy', () => {
  assert.match(PAGE, /ExerciseFilters\.isEquipmentFreeProgram\(slug\)/);
  assert.match(PAGE, /ExerciseFilters\.isEquipmentFreeExercise\(row\)/);
  assert.match(PAGE, /findSubstitutions\(ctx\.ref, canonicalCatalog\(\), opts\)/);
  assert.match(PAGE, /equipmentFree: equipmentFree\n/);
  // No exercise id list lives in the page.
  EF.EQUIPMENT_FREE_EXERCISE_IDS.forEach((id) => assert.ok(!PAGE.includes(id), id + ' is not hard-coded'));
});
