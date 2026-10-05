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
    // The ONLY exemption from "1–2 splits" is the explicit split-less rule
    // (mobility, Phase 4.3.9B CP4b); every other row still needs a split.
    if (EF.SPLITLESS_PATTERNS.includes(e.movement_pattern)) {
      assert.deepEqual(sp, [], `${e.name} is split-less by rule but got ${sp}`);
    } else {
      assert.ok(sp.length >= 1, `${e.name} has no split`);
    }
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

/* ── Filter-panel interaction (Phase 4.2.1L) ─────────────────────────────────
 * The mobile filter-panel UX contract. workout.html holds the DOM; these pure
 * predicates own the collapse/dismiss decisions and are what the DOM handlers
 * consume, so the interaction is regression-tested without a browser. */

test('panel collapses after a filter toggle (mobile: list is the focus)', () => {
  // A filter selection never leaves the panel open — the filtered list, not the
  // menu, is what the user should see next.
  assert.equal(EF.panelStaysOpenAfterFilterToggle(), false);
});

test('outside tap collapses an open panel', () => {
  assert.equal(EF.shouldCollapseOnOutsideClick({
    panelOpen: true, insidePanel: false, onFilterControl: false
  }), true);
});

test('tap inside the panel never collapses it (chip taps handled by the panel)', () => {
  assert.equal(EF.shouldCollapseOnOutsideClick({
    panelOpen: true, insidePanel: true, onFilterControl: false
  }), false);
});

test('tap on a filter control (toggle / active chip) is not an outside tap', () => {
  // The Filters button and the active-filter chip bar must keep working while
  // the panel is open — they are never treated as a dismiss-the-panel tap.
  assert.equal(EF.shouldCollapseOnOutsideClick({
    panelOpen: true, insidePanel: false, onFilterControl: true
  }), false);
});

test('a closed panel is never collapsed by an outside tap (picker-close passes through)', () => {
  // When the panel is closed, an overlay tap must fall through to the normal
  // picker-close path rather than being consumed here.
  assert.equal(EF.shouldCollapseOnOutsideClick({
    panelOpen: false, insidePanel: false, onFilterControl: false
  }), false);
});

test('outside-click decision tolerates missing / junk state', () => {
  assert.doesNotThrow(() => EF.shouldCollapseOnOutsideClick());
  assert.equal(EF.shouldCollapseOnOutsideClick(), false);
  assert.equal(EF.shouldCollapseOnOutsideClick(null), false);
});

test('collapsing the panel is orthogonal to filter state (filters survive)', () => {
  // The panel-collapse decisions carry no filter state, so collapsing can never
  // clear or change active filters — a selection made before collapse persists.
  let f = EF.toggleFilter(EF.emptyFilters(), 'splits', 'legs');
  f = EF.toggleFilter(f, 'equipment', 'machine');
  assert.equal(EF.countActiveFilters(f), 2);
  // Simulate the DOM sequence: toggle → auto-collapse. State is unchanged.
  assert.equal(EF.panelStaysOpenAfterFilterToggle(), false);
  assert.equal(EF.countActiveFilters(f), 2);
  assert.deepEqual(EF.activeChips(f).map((c) => c.key), ['legs', 'machine']);
});

/* ── Phase 4.3.9B CP4b — first-class Mobility ───────────────────────────────
 * Mobility is a visible movement chip with NO strength split (owner decision).
 * Conditioning stays on `gait` (Full Body split, no movement chip). The 144
 * rows that existed before CP4b keep byte-identical membership. */

const MOBILITY_NAMES = [
  '90/90 Hip Rotation', 'Cat-Cow', 'Diaphragmatic Breathing', 'Kneeling Hip Flexor Stretch',
  'Quadruped Thoracic Rotation', 'Standing Ankle Rock', 'Supine Hamstring Stretch',
  'Supine Spinal Twist', 'Wall Slide'
];
const CONDITIONING_NAMES = ['High Knees', 'Jumping Jack', 'March in Place', 'Step Jack'];
const CP4B_IDS = new Set([
  '784a0508-84c3-42a6-98b1-c00cc780e5cd', 'c3d81925-04dc-4caf-b5ef-5b42740028e8',
  '1b836b2c-af56-40a6-9afe-023c3ccd5361', '41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5',
  '7fae5cd2-712d-4df2-982d-850091d10329', '6d50c3a6-0dde-46e4-bc3a-508c2f358803',
  'ead731d6-bfdd-4119-bd0b-bb3092457e69', '44ebe984-c8e9-4842-8617-7f54f1179d2b',
  'e3f12784-cf40-4aa5-ae41-6770416c4d1f', '6962172b-18eb-4def-88d3-acc67c62f9ce',
  'b2168db4-fb33-4dd0-a8e2-ab5fa81677e4', '4b0b5faa-4704-4959-a550-c01de705a540',
  '53c57e39-51e9-42e5-991a-3357bd610b4a', 'fd10bcf3-a09f-41fe-aca5-7996972d496f',
  '04429fae-c385-47dd-91ec-7e1fe3a4a83c'
]);

test('CP4b: the Mobility chip exists once, last in Movement, and no prior chip changed', () => {
  assert.deepEqual(EF.MOVEMENTS.map((m) => m.key + '=' + m.label), [
    'squat=Squat', 'hinge=Hinge', 'horizontal_push=Horizontal Push', 'vertical_push=Vertical Push',
    'horizontal_pull=Horizontal Pull', 'vertical_pull=Vertical Pull', 'lunge=Lunge', 'carry=Carry',
    'isolation=Isolation', 'core=Core', 'mobility=Mobility'
  ]);
  assert.equal(EF.MOVEMENTS.filter((m) => m.label === 'Mobility').length, 1);
  // Split and equipment vocabularies are untouched by CP4b.
  assert.deepEqual(EF.SPLITS.map((s) => s.key), ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'core']);
  assert.deepEqual(EF.EQUIPMENT.map((e) => e.key),
    ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'smith', 'kettlebell', 'band']);
  assert.deepEqual(EF.activeChips({ movements: ['mobility'] }),
    [{ category: 'movements', key: 'mobility', label: 'Mobility' }]);
});

test('CP4b: selecting Mobility returns exactly the nine canonical mobility exercises', () => {
  const r = disc('', { movements: ['mobility'] }, { limit: 500 });
  assert.deepEqual(rowNames(r).slice().sort(), MOBILITY_NAMES);
  assert.ok(r.rows.every((x) => !x.isCustom && x.id && x.movement === 'mobility'));
  // Customs (no taxonomy) never leak into an active metadata filter.
  assert.ok(!rowNames(r).includes('Sled Push'));
});

test('CP4b: no-split for mobility is an explicit rule, not a fallback or a disguised split', () => {
  assert.deepEqual(EF.SPLITLESS_PATTERNS, ['mobility']);
  MOBILITY_NAMES.forEach((n) => assert.deepEqual(EF.getExerciseSplits(ex(n)), [], n));
  // No strength split surfaces any mobility exercise.
  EF.SPLITS.forEach((s) => {
    const names = rowNames(disc('', { splits: [s.key] }, { limit: 500 }));
    MOBILITY_NAMES.forEach((n) => assert.ok(!names.includes(n), n + ' leaked into split ' + s.key));
  });
  // The rule is specific to mobility: a known pattern still gets its split.
  assert.deepEqual(EF.getExerciseSplits({ movement_pattern: 'gait' }), ['full']);
});

test('CP4b: mobility exercises stay reachable via Mobility, Bodyweight, All and search', () => {
  const all = rowNames(disc('', null, { limit: 500 }));
  const bw = rowNames(disc('', { equipment: ['bodyweight'] }, { limit: 500 }));
  MOBILITY_NAMES.forEach((n) => {
    assert.ok(all.includes(n), n + ' missing from All');
    assert.ok(bw.includes(n), n + ' missing from Bodyweight');
    assert.equal(disc(n, null).rows[0].name, n, n + ' not the top search hit');
    assert.equal(EF.getExerciseEquipment(ex(n)), 'bodyweight');
  });
  assert.equal(all.length, EXERCISE_CATALOG.length + CUSTOMS.length);
  assert.equal(EXERCISE_CATALOG.length, 159);
});

test('CP4b: Bodyweight returns all 52 Bodyweight exercises', () => {
  const r = disc('', { equipment: ['bodyweight'] }, { limit: 500 });
  assert.equal(r.rows.length, 52);
  assert.equal(EXERCISE_CATALOG.filter((e) => e.equipment === 'Bodyweight').length, 52);
});

test('CP4b: conditioning stays on gait — Full Body split, no movement chip', () => {
  CONDITIONING_NAMES.forEach((n) => {
    assert.equal(ex(n).movement_pattern, 'gait', n);
    assert.equal(EF.getExerciseMovement(ex(n)), null, n);
    assert.deepEqual(EF.getExerciseSplits(ex(n)), ['full'], n);
  });
  const full = rowNames(disc('', { splits: ['full'] }, { limit: 500 }));
  CONDITIONING_NAMES.forEach((n) => assert.ok(full.includes(n), n));
});

test('CP4b: push foundations join their existing push chips and splits', () => {
  assert.equal(EF.getExerciseMovement(ex('Wall Push-Up')), 'horizontal_push');
  assert.equal(EF.getExerciseMovement(ex('Pike Lean')), 'vertical_push');
  assert.deepEqual(EF.getExerciseSplits(ex('Wall Push-Up')).sort(), ['push', 'upper']);
  assert.deepEqual(EF.getExerciseSplits(ex('Pike Lean')).sort(), ['push', 'upper']);
});

test('CP4b: every pre-CP4b exercise keeps byte-identical split/movement/equipment membership', () => {
  const prior = EXERCISE_CATALOG.filter((e) => !CP4B_IDS.has(e.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.equal(prior.length, 144);
  const snapshot = prior.map((e) => [e.id, EF.getExerciseSplits(e).slice().sort().join('+'),
    EF.getExerciseMovement(e), EF.getExerciseEquipment(e)].join('|')).join('\n');
  const md5 = require('node:crypto').createHash('md5').update(snapshot).digest('hex');
  // Captured from the pre-CP4b filter code over the same 144 rows.
  assert.equal(md5, '9d079326d0193970a2f87802d7dbe8c0');
  assert.ok(prior.every((e) => EF.getExerciseMovement(e) !== 'mobility'));
});

test('CP4b: the picker renders chips from the vocabulary into a wrapping container (source-level)', () => {
  // Source-level only. Physical 320/390/430 px validation remains Phase 4.3.9B CP4f.
  const page = require('node:fs').readFileSync(require('node:path').join(__dirname, 'workout.html'), 'utf8');
  assert.match(page, /\.filter-chips\s*\{\s*display:\s*flex;\s*flex-wrap:\s*wrap;/);
  assert.match(page, /items:\s*ExerciseFilters\.MOVEMENTS/);
  assert.ok(!/>Mobility</.test(page), 'the Mobility chip must not be hard-coded in workout.html');
});

/* ── Phase 4.3.9B — equipment-free Program context ─────────────────────────
 * The ONE rule Swap and the manual picker share for Bodyweight Foundations
 * sessions. The reviewed pool is pinned to the migration that applied it, and
 * the catalog's own Bodyweight classification must agree with it. */

const MIGRATION_CP4D = require('node:fs').readFileSync(require('node:path').join(__dirname,
  'supabase/migrations/20261003000515_phase_439b_cp4d_bodyweight_frequency_routines.sql'), 'utf8');
const sqlIds = (name) => {
  const m = MIGRATION_CP4D.match(new RegExp('\\b' + name + ' CONSTANT uuid\\[\\] := ARRAY\\[([^\\]]*)\\]::uuid\\[\\];'));
  assert.ok(m, name + ' is declared in the CP4d migration');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
};
const POOL = sqlIds('k_pool');
const EXCLUDED = sqlIds('k_forbidden');

test('4.3.9B: the equipment-free set is exactly the reviewed CP4d pool, in order', () => {
  assert.deepEqual(EF.EQUIPMENT_FREE_EXERCISE_IDS, POOL);
  assert.equal(POOL.length, 38);
  assert.equal(EXCLUDED.length, 14);
  assert.ok(!POOL.some((id) => EXCLUDED.includes(id)), 'pool and exclusions are disjoint');
  // The exported list is read-only, so it cannot be used to change the rule.
  assert.ok(Object.isFrozen(EF.EQUIPMENT_FREE_EXERCISE_IDS));
  assert.throws(() => { 'use strict'; EF.EQUIPMENT_FREE_EXERCISE_IDS.push('not-an-id'); }, TypeError);
  assert.equal(EF.EQUIPMENT_FREE_EXERCISE_IDS.length, 38);
});

test('4.3.9B: every Bodyweight-classified catalog row is either in the pool or a reviewed exclusion', () => {
  // So a new Bodyweight exercise cannot slip in unreviewed: it would fail here.
  const bodyweight = EXERCISE_CATALOG.filter((e) => EF.getExerciseEquipment(e) === 'bodyweight').map((e) => e.id);
  assert.deepEqual(bodyweight.slice().sort(), POOL.concat(EXCLUDED).sort());
});

test('4.3.9B: isEquipmentFreeExercise admits the 38 and nothing else in the catalog', () => {
  const admitted = EXERCISE_CATALOG.filter((e) => EF.isEquipmentFreeExercise(e)).map((e) => e.id);
  assert.deepEqual(admitted.slice().sort(), POOL.slice().sort());
  // Bodyweight-classified but needs a bar, bench or box: never admitted.
  ['Pull-Up', 'Chin-Up', 'Dips', 'Bench Dip', 'Box Jump', 'Inverted Row', 'Hanging Knee Raise',
   'Incline Push-Up', 'Decline Push-Up', 'Back Extension', 'Single-Leg Hip Thrust']
    .forEach((n) => { assert.ok(ex(n), n + ' is in the catalog'); assert.equal(EF.isEquipmentFreeExercise(ex(n)), false, n); });
  // Equipment exercises: never admitted.
  ['Bench Press', 'Dumbbell Shoulder Press', 'Lat Pulldown', 'Leg Press', 'Assisted Pull-Up']
    .forEach((n) => { assert.ok(ex(n), n + ' is in the catalog'); assert.equal(EF.isEquipmentFreeExercise(ex(n)), false, n); });
});

test('4.3.9B: a custom, an inactive row, a misclassified row or nothing is never admitted', () => {
  const pushUp = ex('Push-Up');
  assert.equal(EF.isEquipmentFreeExercise(pushUp), true);
  assert.equal(EF.isEquipmentFreeExercise(Object.assign({}, pushUp, { is_active: false })), false);
  assert.equal(EF.isEquipmentFreeExercise(Object.assign({}, pushUp, { user_created: true })), false);
  // Pool membership alone is not enough — the catalog must still say Bodyweight.
  assert.equal(EF.isEquipmentFreeExercise(Object.assign({}, pushUp, { equipment: 'Dumbbell', is_bodyweight: false })), false);
  CUSTOMS.forEach((c) => assert.equal(EF.isEquipmentFreeExercise(c), false, c.name));
  [null, undefined, {}, { id: null }].forEach((v) => assert.equal(EF.isEquipmentFreeExercise(v), false));
});

test('4.3.9B: only Bodyweight Foundations is an equipment-free Program', () => {
  assert.equal(EF.isEquipmentFreeProgram('bodyweight_foundations'), true);
  ['fat_loss_blueprint', 'muscle_gain', 'glute_builder', '', null, undefined, 'BODYWEIGHT_FOUNDATIONS', {}]
    .forEach((s) => assert.equal(EF.isEquipmentFreeProgram(s), false, String(s)));
});

const efDisc = (o) => EF.runDiscovery(Object.assign({ index: idx, customs: CUSTOMS, limit: 400 }, o));

test('4.3.9B discovery: the equipment-free browse list is exactly the pool, no customs', () => {
  const r = efDisc({ equipmentFree: true });
  assert.deepEqual(r.rows.map((x) => x.id).sort(), POOL.slice().sort());
  assert.ok(!r.rows.some((x) => x.isCustom), 'no custom is offered');
});

test('4.3.9B discovery: equipment-free search keeps valid bodyweight matches and drops equipment', () => {
  const push = rowNames(efDisc({ query: 'push up', equipmentFree: true }));
  ['Push-Up', 'Knee Push-Up', 'Wall Push-Up'].forEach((n) => assert.ok(push.includes(n), n + ' is offered'));
  ['Incline Push-Up', 'Decline Push-Up'].forEach((n) => assert.ok(!push.includes(n), n + ' needs a bench'));
  // A search for equipment work offers only equipment-free rows, never the
  // equipment exercise it names.
  const bench = efDisc({ query: 'bench press', equipmentFree: true }).rows;
  bench.forEach((x) => assert.ok(EF.isEquipmentFreeExercise(x.exercise), x.name));
  ['Bench Press', 'Incline Bench Press', 'Close-Grip Bench Press', 'Smith Machine Bench Press', 'Bench Dip']
    .forEach((n) => assert.ok(!bench.some((x) => x.name === n), n + ' is not offered'));
  const pull = efDisc({ query: 'pull up', equipmentFree: true }).rows;
  pull.forEach((x) => assert.ok(EF.isEquipmentFreeExercise(x.exercise), x.name));
  ['Pull-Up', 'Assisted Pull-Up', 'Chin-Up', 'Lat Pulldown', 'Inverted Row']
    .forEach((n) => assert.ok(!pull.some((x) => x.name === n), n + ' is not offered'));
  const squat = rowNames(efDisc({ query: 'squat', equipmentFree: true }));
  assert.ok(squat.includes('Bodyweight Squat') && squat.includes('Split Squat'));
  assert.ok(!squat.some((n) => /Barbell|Goblet|Smith|Pistol/.test(n)), squat.join(', '));
  efDisc({ query: 'squat', equipmentFree: true }).rows.forEach((x) =>
    assert.ok(EF.isEquipmentFreeExercise(x.exercise), x.name));
});

test('4.3.9B discovery: an equipment filter cannot reintroduce equipment exercises', () => {
  const barbell = EF.toggleFilter(EF.emptyFilters(), 'equipment', 'barbell');
  assert.deepEqual(rowNames(efDisc({ filters: barbell, equipmentFree: true })), []);
  assert.deepEqual(rowNames(efDisc({ query: 'press', filters: barbell, equipmentFree: true })), []);
  const bw = EF.toggleFilter(EF.emptyFilters(), 'equipment', 'bodyweight');
  efDisc({ filters: bw, equipmentFree: true }).rows.forEach((x) =>
    assert.ok(POOL.includes(x.id), x.name + ' is in the pool'));
});

test('4.3.9B discovery: an equipped user is unaffected — the flag defaults off', () => {
  // Same output as before the rule existed, for every shape of call.
  [{}, { query: 'bench press' }, { query: 'pull up' }, { query: 'squat' },
   { filters: EF.toggleFilter(EF.emptyFilters(), 'equipment', 'barbell') }].forEach((o) => {
    assert.deepStrictEqual(efDisc(o), efDisc(Object.assign({ equipmentFree: false }, o)), JSON.stringify(o));
  });
  const all = efDisc({});
  assert.equal(all.rows.filter((x) => !x.isCustom).length, EXERCISE_CATALOG.length, 'full catalog still offered');
  assert.ok(all.rows.some((x) => x.isCustom), 'customs still offered');
  assert.ok(rowNames(efDisc({ query: 'bench press' })).includes('Bench Press'));
  assert.ok(rowNames(efDisc({ query: 'pull up' })).includes('Pull-Up'));
});
