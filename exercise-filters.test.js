/* ──────────────────────────────────────────────────────────────────────────
 * Tests for the shared exercise DISCOVERY filter layer (exercise-filters.js,
 * Phase 4.2.1I) — split/movement/equipment membership and the search+filter
 * composition (runDiscovery) that powers the workout picker.
 *
 * All offline against the live-catalog fixture (benchmarks/exercise-fixtures.js)
 * so a canonicalExerciseId here equals the production exercises.id. These pin the
 * picker's discovery contract; they complement, and never weaken, exercise-core
 * / exercise-search / exercise-custom tests (identity, ranking, lifecycle).
 * ──────────────────────────────────────────────────────────────────────────── */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const EX = require('./exercise-core.js');
const EF = require('./exercise-filters.js');
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const idx = EX.createExerciseIndex(EXERCISE_CATALOG);
const byName = {};
EXERCISE_CATALOG.forEach((e) => { byName[e.name] = e; });
const ex = (name) => byName[name];

// Synthetic ACTIVE customs (the shape workout.html passes: no taxonomy metadata).
const CUSTOMS = [
  { id: 'u1', name: 'Sled Push', category: 'Custom' },
  { id: 'u2', name: 'Jefferson Curl', category: 'Custom' }
];

const disc = (query, filters, opts) =>
  EF.runDiscovery(Object.assign({ index: idx, customs: CUSTOMS, query, filters }, opts || {}));
const rowNames = (r) => r.rows.map((x) => x.name);
const equipSet = (r) => [...new Set(r.rows.map((x) => x.exercise && x.exercise.equipment))];

/* ── Membership derivation ─────────────────────────────────────────────────── */

test('split membership: compound patterns map correctly', () => {
  assert.deepEqual(EF.getExerciseSplits(ex('Bench Press')).sort(), ['push', 'upper']);
  assert.deepEqual(EF.getExerciseSplits(ex('Pull-Up')).sort(), ['pull', 'upper']);
  assert.deepEqual(EF.getExerciseSplits(ex('Barbell Back Squat')).sort(), ['legs', 'lower']);
  assert.deepEqual(EF.getExerciseSplits(ex('Romanian Deadlift')).sort(), ['legs', 'lower']);
  assert.deepEqual(EF.getExerciseSplits(ex('Bulgarian Split Squat')).sort(), ['legs', 'lower']);
  assert.deepEqual(EF.getExerciseSplits(ex('Farmer Carry')), ['full']);
  assert.deepEqual(EF.getExerciseSplits(ex('Plank')), ['core']);
});

test('split membership: isolation maps by target-muscle region', () => {
  assert.deepEqual(EF.getExerciseSplits(ex('Barbell Curl')).sort(), ['pull', 'upper']);   // biceps
  assert.deepEqual(EF.getExerciseSplits(ex('Cable Fly')).sort(), ['push', 'upper']);       // chest
  assert.deepEqual(EF.getExerciseSplits(ex('Lateral Raise')).sort(), ['push', 'upper']);   // shoulders
  assert.deepEqual(EF.getExerciseSplits(ex('Face Pull')).sort(), ['pull', 'upper']);       // rear delts (h-pull)
  assert.deepEqual(EF.getExerciseSplits(ex('Leg Extension')).sort(), ['legs', 'lower']);   // quads
  assert.deepEqual(EF.getExerciseSplits(ex('Leg Curl')).sort(), ['legs', 'lower']);        // hamstrings
  assert.deepEqual(EF.getExerciseSplits(ex('Standing Calf Raise')).sort(), ['legs', 'lower']);
});

test('movement membership uses the taxonomy with rotation folded into core', () => {
  assert.equal(EF.getExerciseMovement(ex('Barbell Back Squat')), 'squat');
  assert.equal(EF.getExerciseMovement(ex('Romanian Deadlift')), 'hinge');
  assert.equal(EF.getExerciseMovement(ex('Bench Press')), 'horizontal_push');
  assert.equal(EF.getExerciseMovement(ex('Overhead Press')), 'vertical_push');
  assert.equal(EF.getExerciseMovement(ex('Barbell Row')), 'horizontal_pull');
  assert.equal(EF.getExerciseMovement(ex('Pull-Up')), 'vertical_pull');
  assert.equal(EF.getExerciseMovement(ex('Bulgarian Split Squat')), 'lunge');
  assert.equal(EF.getExerciseMovement(ex('Barbell Curl')), 'isolation');
  assert.equal(EF.getExerciseMovement(ex('Russian Twist')), 'core');   // rotation → core
  assert.equal(EF.getExerciseMovement(ex('Treadmill Run')), null);     // gait not exposed
});

test('equipment membership reuses exercise-core normalization (Smith ≠ Machine)', () => {
  assert.equal(EF.getExerciseEquipment(ex('Bench Press')), 'barbell');
  assert.equal(EF.getExerciseEquipment(ex('Dumbbell Press')), 'dumbbell');
  assert.equal(EF.getExerciseEquipment(ex('Seated Cable Row')), 'cable');
  assert.equal(EF.getExerciseEquipment(ex('Machine Row')), 'machine');
  assert.equal(EF.getExerciseEquipment(ex('Push-Up')), 'bodyweight');
  assert.equal(EF.getExerciseEquipment(ex('Smith Machine Squat')), 'smith');
  assert.equal(EF.getExerciseEquipment(ex('Kettlebell Swing')), 'kettlebell');
  assert.equal(EF.getExerciseEquipment(ex('Band Pull-Apart')), 'band');
});

test('every canonical exercise receives a valid filter treatment', () => {
  const splitKeys = new Set(EF.SPLITS.map((s) => s.key));
  const moveKeys = new Set(EF.MOVEMENTS.map((m) => m.key));
  const equipKeys = new Set(EF.EQUIPMENT.map((e) => e.key));
  EXERCISE_CATALOG.forEach((e) => {
    const sp = EF.getExerciseSplits(e);
    assert.ok(sp.length >= 1, `${e.name} has no split`);
    assert.ok(sp.length <= 2, `${e.name} has too many splits (${sp})`);
    sp.forEach((k) => assert.ok(splitKeys.has(k), `${e.name} bad split ${k}`));
    const mv = EF.getExerciseMovement(e);
    // gait (treadmill) has no movement chip by design; everything else does.
    if (e.movement_pattern !== 'gait') assert.ok(mv && moveKeys.has(mv), `${e.name} bad movement ${mv}`);
    const eq = EF.getExerciseEquipment(e);
    assert.ok(eq && equipKeys.has(eq), `${e.name} bad equipment ${eq}`);
  });
});

/* ── Filter-state helpers ──────────────────────────────────────────────────── */

test('filter-state helpers: empty, count, has, toggle (immutable), chips', () => {
  const f0 = EF.emptyFilters();
  assert.equal(EF.countActiveFilters(f0), 0);
  assert.equal(EF.hasActiveFilters(f0), false);
  const f1 = EF.toggleFilter(f0, 'equipment', 'cable');
  assert.deepEqual(f0.equipment, []);           // original untouched (immutable)
  assert.deepEqual(f1.equipment, ['cable']);
  assert.equal(EF.countActiveFilters(f1), 1);
  const f2 = EF.toggleFilter(f1, 'splits', 'push');
  assert.equal(EF.countActiveFilters(f2), 2);
  const f3 = EF.toggleFilter(f2, 'equipment', 'cable'); // toggle off
  assert.deepEqual(f3.equipment, []);
  assert.equal(EF.countActiveFilters(f3), 1);
  // unknown category/key is ignored, not fatal
  assert.equal(EF.countActiveFilters(EF.toggleFilter(f0, 'bogus', 'x')), 0);
  assert.equal(EF.countActiveFilters(EF.toggleFilter(f0, 'splits', 'nope')), 0);
  const chips = EF.activeChips(f2);
  assert.deepEqual(chips.map((c) => c.label), ['Push', 'Cable']); // splits before equipment
});

/* ── Search WITHOUT filters (parity with plain search) ─────────────────────── */

test('search without filters returns ranked canonical results', () => {
  const r = disc('bench press', null);
  assert.equal(r.rows[0].name, 'Bench Press');
  assert.equal(r.hasFilters, false);
});

test('no query and no filters returns the full library (canonical + customs)', () => {
  const r = disc('', null, { limit: 500 });
  assert.equal(r.rows.length, EXERCISE_CATALOG.length + CUSTOMS.length);
  assert.ok(rowNames(r).includes('Sled Push'));
});

/* ── Filters WITHOUT search ────────────────────────────────────────────────── */

test('equipment filter with no search text lists exactly the eligible catalog', () => {
  const r = disc('', { equipment: ['bodyweight'] }, { limit: 500 });
  const expected = EXERCISE_CATALOG.filter((e) => EF.getExerciseEquipment(e) === 'bodyweight').length;
  assert.equal(r.rows.length, expected);
  assert.ok(r.rows.every((x) => x.exercise.is_bodyweight || /bodyweight/i.test(x.exercise.equipment || '')));
});

test('split filter with no search text lists eligible catalog only', () => {
  const r = disc('', { splits: ['push'] }, { limit: 500 });
  assert.ok(r.rows.length > 0);
  assert.ok(r.rows.every((x) => EF.getExerciseSplits(x.exercise).includes('push')));
});

/* ── Search + ONE filter (collision assertions) ────────────────────────────── */

test('row + Cable surfaces cable rows, never barbell/dumbbell rows', () => {
  const r = disc('row', { equipment: ['cable'] });
  assert.equal(r.rows[0].name, 'Seated Cable Row');
  assert.ok(!rowNames(r).includes('Barbell Row'));
  assert.ok(!rowNames(r).includes('Dumbbell Row'));
  assert.deepEqual(equipSet(r), ['Cable']);
});

test('row + Dumbbell surfaces dumbbell rows only', () => {
  const r = disc('row', { equipment: ['dumbbell'] });
  assert.ok(rowNames(r).includes('Dumbbell Row'));
  assert.ok(!rowNames(r).includes('Barbell Row'));
  assert.ok(!rowNames(r).includes('Seated Cable Row'));
  assert.deepEqual(equipSet(r), ['Dumbbell']);
});

test('press + Dumbbell never surfaces machine presses', () => {
  const r = disc('press', { equipment: ['dumbbell'] });
  assert.deepEqual(equipSet(r), ['Dumbbell']);
  assert.ok(!rowNames(r).includes('Machine Chest Press'));
  assert.ok(!rowNames(r).includes('Machine Shoulder Press'));
});

test('press + Machine surfaces machine presses only', () => {
  const r = disc('press', { equipment: ['machine'] });
  assert.deepEqual(equipSet(r), ['Machine']);
  assert.ok(rowNames(r).includes('Machine Chest Press'));
  assert.ok(!rowNames(r).includes('Dumbbell Press'));
});

test('squat + Smith Machine surfaces the Smith Machine Squat', () => {
  const r = disc('squat', { equipment: ['smith'] });
  assert.ok(rowNames(r).includes('Smith Machine Squat'));
  assert.deepEqual(equipSet(r), ['Smith']);
  assert.ok(!rowNames(r).includes('Barbell Back Squat'));
});

test('squat + Barbell surfaces barbell squats, not Smith/dumbbell', () => {
  const r = disc('squat', { equipment: ['barbell'] });
  assert.ok(rowNames(r).includes('Barbell Back Squat'));
  assert.ok(!rowNames(r).includes('Smith Machine Squat'));
  assert.ok(!rowNames(r).includes('Goblet Squat'));
});

test('curl + Legs surfaces leg curls, never biceps curls', () => {
  const r = disc('curl', { splits: ['legs'] });
  assert.ok(rowNames(r).includes('Leg Curl'));
  assert.ok(!rowNames(r).includes('Barbell Curl'));
  assert.ok(!rowNames(r).includes('Bicep Curl'));
  assert.ok(r.rows.every((x) => EF.getExerciseSplits(x.exercise).includes('legs')));
});

test('curl + Upper Body surfaces biceps curls, never leg curls', () => {
  const r = disc('curl', { splits: ['upper'] });
  assert.ok(rowNames(r).includes('Barbell Curl'));
  assert.ok(!rowNames(r).includes('Leg Curl'));
});

test('raise + Core surfaces core raises (leg/knee), not lateral/calf raises', () => {
  const r = disc('raise', { splits: ['core'] });
  assert.ok(rowNames(r).includes('Hanging Leg Raise') || rowNames(r).includes('Lying Leg Raise'));
  assert.ok(!rowNames(r).includes('Lateral Raise'));
  assert.ok(!rowNames(r).includes('Standing Calf Raise'));
});

test('pulldown + Cable surfaces cable pulldowns', () => {
  const r = disc('pulldown', { equipment: ['cable'] });
  assert.ok(rowNames(r).includes('Lat Pulldown'));
  assert.deepEqual(equipSet(r), ['Cable']);
});

test('fly + Machine and fly + Dumbbell resolve distinct equipment', () => {
  const m = disc('fly', { equipment: ['machine'] });
  assert.ok(rowNames(m).includes('Pec Deck'));
  assert.deepEqual(equipSet(m), ['Machine']);
  const d = disc('fly', { equipment: ['dumbbell'] });
  assert.ok(rowNames(d).includes('Dumbbell Fly'));
  assert.deepEqual(equipSet(d), ['Dumbbell']);
});

test('pull up + Bodyweight ranks Pull-Up first within the bodyweight set', () => {
  const r = disc('pull up', { equipment: ['bodyweight'] });
  assert.equal(r.rows[0].name, 'Pull-Up');
  assert.deepEqual(equipSet(r), ['Bodyweight']);
});

/* ── Search + MULTIPLE filters ─────────────────────────────────────────────── */

test('split + equipment compose (Push + Cable)', () => {
  const r = disc('', { splits: ['push'], equipment: ['cable'] }, { limit: 500 });
  assert.ok(r.rows.length > 0);
  assert.ok(r.rows.every((x) =>
    EF.getExerciseSplits(x.exercise).includes('push') && EF.getExerciseEquipment(x.exercise) === 'cable'));
});

test('split + movement compose (Legs + Squat)', () => {
  const r = disc('', { splits: ['legs'], movements: ['squat'] }, { limit: 500 });
  assert.ok(r.rows.length > 0);
  assert.ok(r.rows.every((x) =>
    EF.getExerciseSplits(x.exercise).includes('legs') && EF.getExerciseMovement(x.exercise) === 'squat'));
  assert.ok(rowNames(r).includes('Barbell Back Squat'));
});

test('search + split + equipment all compose (press + Push + Dumbbell)', () => {
  const r = disc('press', { splits: ['push'], equipment: ['dumbbell'] });
  assert.deepEqual(equipSet(r), ['Dumbbell']);
  assert.ok(r.rows.every((x) => EF.getExerciseSplits(x.exercise).includes('push')));
});

test('within-category OR: equipment [barbell, dumbbell] returns both', () => {
  const r = disc('row', { equipment: ['barbell', 'dumbbell'] });
  const eqs = equipSet(r).sort();
  assert.ok(eqs.includes('Barbell') && eqs.includes('Dumbbell'));
  assert.ok(!eqs.includes('Cable'));
});

/* ── Identity preservation under filters ───────────────────────────────────── */

test('exact-name priority holds within a filtered set', () => {
  const r = disc('seated cable row', { equipment: ['cable'] });
  assert.equal(r.rows[0].name, 'Seated Cable Row');
  assert.ok(['exact_canonical', 'exact_alias', 'normalized', 'normalized_alias'].includes(r.rows[0].matchType));
});

test('alias resolves under a filter (RDL + Hinge → Romanian Deadlift)', () => {
  const r = disc('RDL', { movements: ['hinge'] });
  assert.equal(r.rows[0].name, 'Romanian Deadlift');
  assert.equal(r.rows[0].id, ex('Romanian Deadlift').id);
});

test('abbreviation resolves under a filter (DB bench + Dumbbell → Dumbbell Press)', () => {
  const r = disc('DB bench', { equipment: ['dumbbell'] });
  assert.equal(r.rows[0].name, 'Dumbbell Press');
  assert.notEqual(r.rows[0].name, 'Incline Dumbbell Press');
});

test('hard modifier preserved under a filter (incline never collapses to flat)', () => {
  const r = disc('incline bench', { splits: ['push'] });
  assert.equal(r.rows[0].name, 'Incline Bench Press');
  assert.ok(!rowNames(r).slice(0, 1).includes('Bench Press'));
});

test('unilateral identity preserved (single arm row + Cable → Single-Arm Cable Row)', () => {
  const r = disc('single arm row', { equipment: ['cable'] });
  assert.equal(r.rows[0].name, 'Single-Arm Cable Row');
  assert.equal(r.rows[0].id, ex('Single-Arm Cable Row').id);
});

test('Smith identity preserved (smith squat + Smith → Smith Machine Squat)', () => {
  const r = disc('smith squat', { equipment: ['smith'] });
  assert.equal(r.rows[0].name, 'Smith Machine Squat');
});

test('every filtered result id is a real production exercises.id', () => {
  const ids = new Set(EXERCISE_CATALOG.map((e) => e.id));
  ['row', 'press', 'squat', 'curl'].forEach((q) => {
    disc(q, { equipment: ['cable', 'dumbbell', 'barbell'] }).rows
      .forEach((r) => { if (!r.isCustom) assert.ok(ids.has(r.id), `${q} → ${r.name}`); });
  });
});

test('no duplicate result rows under filters', () => {
  const r = disc('row', { splits: ['pull'] });
  const seen = new Set();
  r.rows.forEach((x) => {
    const key = (x.isCustom ? 'c:' : 'g:') + x.name.toLowerCase();
    assert.ok(!seen.has(key), `dup ${x.name}`);
    seen.add(key);
  });
});

/* ── Custom exercise behavior ──────────────────────────────────────────────── */

test('custom is searchable by name when no filters are active', () => {
  const r = disc('sled', null);
  assert.ok(rowNames(r).includes('Sled Push'));
  assert.equal(r.rows.find((x) => x.name === 'Sled Push').id, ''); // no fabricated canonical id
});

test('custom with no metadata is EXCLUDED when any metadata filter is active', () => {
  assert.ok(!rowNames(disc('sled', { splits: ['legs'] })).includes('Sled Push'));
  assert.ok(!rowNames(disc('sled', { equipment: ['bodyweight'] })).includes('Sled Push'));
  assert.ok(!rowNames(disc('', { movements: ['squat'] }, { limit: 500 })).includes('Sled Push'));
});

test('custom is never assigned a fabricated filter membership', () => {
  const c = CUSTOMS[0];
  assert.deepEqual(EF.getExerciseSplits(c), []);
  assert.equal(EF.getExerciseMovement(c), null);
  assert.equal(EF.getExerciseEquipment(c), null);
});

test('canonical and custom coexist without collision (no query, no filter)', () => {
  const r = disc('', null, { limit: 500 });
  assert.ok(rowNames(r).includes('Bench Press'));   // canonical
  assert.ok(rowNames(r).includes('Jefferson Curl')); // custom
});

test('archived custom is excluded / restored custom included — via the customs the caller passes', () => {
  // The caller (workout.html) passes only ACTIVE customs; an archived one is
  // simply absent, a restored one present. The module honors that list verbatim.
  const withArchived = EF.runDiscovery({ index: idx, customs: [], query: 'sled', filters: null });
  assert.ok(!rowNames(withArchived).includes('Sled Push'));   // archived → not passed → hidden
  const restored = EF.runDiscovery({ index: idx, customs: CUSTOMS, query: 'sled', filters: null });
  assert.ok(rowNames(restored).includes('Sled Push'));        // restored → passed → shown
});

test('cross-user isolation: only the passed customs can ever appear', () => {
  const foreign = { id: 'other-user', name: 'Zercher Carry', category: 'Custom' };
  const r = EF.runDiscovery({ index: idx, customs: CUSTOMS, query: 'zercher', filters: null });
  assert.ok(!rowNames(r).includes('Zercher Carry')); // foreign custom never in our list → never shown
  assert.ok(!JSON.stringify(r.rows).includes(foreign.id));
});

/* ── Clear-one-filter / reset / empty-state ────────────────────────────────── */

test('clearing one filter preserves the others (immutable toggle)', () => {
  let f = EF.emptyFilters();
  f = EF.toggleFilter(f, 'splits', 'push');
  f = EF.toggleFilter(f, 'equipment', 'cable');
  f = EF.toggleFilter(f, 'equipment', 'cable'); // remove equipment only
  assert.deepEqual(f.equipment, []);
  assert.deepEqual(f.splits, ['push']); // split survived
});

test('reset all filters preserves search text (composition is orthogonal)', () => {
  const withFilters = disc('row', { equipment: ['cable'] });
  const afterReset = disc('row', EF.emptyFilters());
  // Same query, broader eligible set: resetting filters widens results and
  // re-admits the previously-excluded equipment (barbell/dumbbell rows).
  assert.ok(afterReset.rows.length > withFilters.rows.length);
  assert.ok(rowNames(afterReset).includes('Seated Cable Row')); // cable row still present
  assert.ok(rowNames(afterReset).includes('Barbell Row'));      // and now barbell too
});

test('empty-state: filters that exclude all matches return zero rows with context', () => {
  const r = disc('bench press', { equipment: ['cable'] }); // bench press isn't cable
  assert.equal(r.rows.length, 0);
  assert.equal(r.hasQuery, true);
  assert.equal(r.hasFilters, true);
  assert.ok(r.resolution); // resolution still available for messaging
});

/* ── Robustness ────────────────────────────────────────────────────────────── */

test('runDiscovery degrades safely with no index', () => {
  const r = EF.runDiscovery({ query: 'bench', filters: null });
  assert.deepEqual(r.rows, []);
});

test('null / junk inputs never throw', () => {
  assert.doesNotThrow(() => EF.runDiscovery(null));
  assert.doesNotThrow(() => EF.runDiscovery({ index: idx, query: null, filters: null }));
  assert.doesNotThrow(() => EF.exerciseMatchesFilters(null, null));
  assert.doesNotThrow(() => EF.getExerciseSplits(null));
  assert.doesNotThrow(() => EF.getExerciseEquipment(undefined));
});

test('limit caps rows and reports counts', () => {
  const r = disc('', null, { limit: 5 });
  assert.equal(r.rows.length, 5);
  assert.equal(r.counts.shown, 5);
  assert.ok(r.counts.total > 5);
  assert.ok(r.counts.filtered > 0);
});
