/* ──────────────────────────────────────────────────────────────────────────
 * Tests for the shared exercise picker SEARCH (exercise-core.js index.search /
 * searchExercises) — Phase 4.2.1F.
 *
 * search() is the LIST-producing sibling of resolve(): it powers the real
 * workout picker, so these tests pin the properties the picker depends on —
 * deterministic ranking, hard-variant preservation, honest ambiguity, canonical
 * identity, and safe failure — all offline against the live-catalog fixture
 * (benchmarks/exercise-fixtures.js). They complement, and never weaken,
 * exercise-core.test.js (which pins resolve()).
 * ──────────────────────────────────────────────────────────────────────────── */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const EX = require('./exercise-core.js');
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const idx = EX.createExerciseIndex(EXERCISE_CATALOG);
const byName = {};
EXERCISE_CATALOG.forEach((e) => { byName[e.name] = e; });

const search = (q, opts) => idx.search(q, opts);
const results = (q) => search(q).results;
const top = (q) => search(q).results[0];
const names = (q) => search(q).results.map((r) => r.name);
const EXACT = ['exact_canonical', 'exact_alias', 'normalized', 'normalized_alias'];

/* ── Ranking ─────────────────────────────────────────────────────────────── */

test('exact canonical name ranks first', () => {
  const r = top('Bench Press');
  assert.equal(r.name, 'Bench Press');
  assert.equal(r.matchType, 'exact_canonical');
});

test('exact alias ranks first (RDL, BB bench, DB shoulder press)', () => {
  assert.equal(top('RDL').name, 'Romanian Deadlift');
  assert.equal(top('RDL').matchType, 'exact_alias');
  assert.equal(top('BB bench').name, 'Bench Press');
  assert.equal(top('DB shoulder press').name, 'Dumbbell Shoulder Press');
});

test('equipment-qualified abbreviation ranks the right equipment first', () => {
  // "DB bench" prefers the flat Dumbbell Press over Incline (unrequested modifier).
  assert.equal(top('DB bench').name, 'Dumbbell Press');
  assert.equal(top('BB bench').name, 'Bench Press');
});

test('strong variant match ranks above generic text matches', () => {
  const ns = names('incline db press');
  assert.equal(ns[0], 'Incline Dumbbell Press');
  // Flat Dumbbell Press may appear as a nearby option but never first.
  assert.ok(ns.indexOf('Dumbbell Press') === -1 || ns.indexOf('Dumbbell Press') > 0);
});

test('canonical/alias prefix behavior is deterministic and stable', () => {
  const a = names('bench');
  const b = names('bench');
  assert.deepEqual(a, b);
  assert.equal(a[0], 'Bench Press');
});

test('fallback (partial) matches never outrank a real resolver match', () => {
  const rs = results('seated cable row');
  assert.equal(rs[0].name, 'Seated Cable Row');
  assert.ok(EXACT.includes(rs[0].matchType));
  // Loose partials (e.g. Cable Curl / Cable Fly) sink below the exact match.
  rs.slice(1).forEach((r) => assert.ok(!EXACT.includes(r.matchType) || r.name === 'Seated Cable Row'));
});

/* ── Hard variant safety ─────────────────────────────────────────────────── */

test('incline does not collapse to flat', () => {
  assert.equal(top('incline bench').name, 'Incline Bench Press');
  assert.notEqual(top('incline dumbbell press').name, 'Dumbbell Press');
});

test('flat does not collapse to incline', () => {
  assert.equal(top('flat bench').name, 'Bench Press');
  assert.notEqual(top('flat bench').name, 'Incline Bench Press');
});

test('front squat: no exact match, back squat only ever a labeled nearby option', () => {
  const s = search('front squat');
  assert.equal(s.resolution.matchType, 'unresolved');
  // Never presented as an exact match.
  s.results.forEach((r) => assert.ok(!EXACT.includes(r.matchType)));
  const back = s.results.find((r) => r.name === 'Barbell Back Squat');
  if (back) assert.equal(back.matchType, 'related');
});

test('RDL does not become conventional deadlift', () => {
  assert.equal(top('RDL').name, 'Romanian Deadlift');
  assert.equal(top('romanian deadlift').name, 'Romanian Deadlift');
});

test('assisted pull-up is not an exact pull-up', () => {
  const r = top('assisted pull-up');
  assert.equal(r.name, 'Pull-Up');
  assert.ok(!EXACT.includes(r.matchType)); // approximate variant, never exact_alias
  assert.equal(search('assisted pull-up').resolution.confidence, 'low');
});

test('seated cable row does not become barbell row', () => {
  assert.equal(top('seated row').name, 'Seated Cable Row');
  assert.equal(top('seated cable row').name, 'Seated Cable Row');
  assert.notEqual(top('seated row').name, 'Barbell Row');
});

test('dumbbell press does not become barbell press', () => {
  assert.equal(top('dumbbell shoulder press').name, 'Dumbbell Shoulder Press');
  assert.notEqual(top('dumbbell shoulder press').name, 'Overhead Press');
});

/* ── Ambiguity ───────────────────────────────────────────────────────────── */

test('"row" returns multiple relevant choices, none auto-selected', () => {
  const rs = results('row');
  const ns = rs.map((r) => r.name);
  assert.ok(ns.includes('Barbell Row') && ns.includes('Seated Cable Row'));
  assert.ok(rs.length >= 3);
  assert.equal(search('row').resolution.matchType, 'family');
  assert.equal(search('row').resolution.canonicalExerciseId, null);
});

test('"press" returns multiple relevant choices', () => {
  const rs = results('press');
  assert.ok(rs.length >= 3);
  assert.equal(search('press').resolution.canonicalExerciseId, null);
});

test('"curl" does not auto-select a single arbitrary curl', () => {
  const rs = results('curl');
  assert.ok(rs.length >= 2);
  assert.equal(search('curl').resolution.canonicalExerciseId, null);
});

test('broad searches expose no canonical id until user selection', () => {
  ['row', 'press', 'curl', 'raise', 'extension'].forEach((q) => {
    assert.equal(search(q).resolution.canonicalExerciseId, null, q);
  });
});

/* ── Identity ────────────────────────────────────────────────────────────── */

test('every search result id is a real production exercises.id', () => {
  const ids = new Set(EXERCISE_CATALOG.map((e) => e.id));
  ['bench', 'row', 'RDL', 'db bench', 'incline bench', 'curl'].forEach((q) => {
    results(q).forEach((r) => assert.ok(ids.has(r.id), `${q} → ${r.name} has real id`));
  });
});

test('alias selection maps to the canonical record id', () => {
  assert.equal(top('RDL').id, byName['Romanian Deadlift'].id);
  assert.equal(top('BB bench').id, byName['Bench Press'].id);
  assert.equal(top('dumbbell bench press').id, byName['Dumbbell Press'].id);
});

test('canonical-name and alias searches resolve to the SAME id', () => {
  assert.equal(top('RDL').id, top('romanian deadlift').id);
  assert.equal(top('pullup').id, top('Pull-Up').id);
});

test('the result NAME is the canonical name, never the alias/search text', () => {
  assert.equal(top('RDL').name, 'Romanian Deadlift');   // not "RDL"
  assert.equal(top('BB bench').name, 'Bench Press');    // not "BB bench"
  assert.equal(top('pushup').name, 'Push-Up');          // not "pushup"
});

test('similar variants keep distinct ids', () => {
  assert.notEqual(byName['Bench Press'].id, byName['Incline Bench Press'].id);
  assert.notEqual(top('incline bench').id, top('flat bench').id);
  assert.notEqual(byName['Dumbbell Press'].id, byName['Incline Dumbbell Press'].id);
});

test('result exposes the selected catalog row for downstream metadata', () => {
  const r = top('RDL');
  assert.equal(r.exercise.id, byName['Romanian Deadlift'].id);
  assert.equal(r.exercise.equipment, 'Barbell');
  assert.equal(r.exercise.movement_pattern, 'hinge');
});

/* ── Failure behavior ────────────────────────────────────────────────────── */

test('null / non-string / empty / whitespace queries are safe', () => {
  [null, undefined, {}, [], 42, '', '   '].forEach((q) => {
    const s = search(q);
    assert.deepEqual(s.results, []);
    assert.ok(!s.results.length);
  });
});

test('symbols-only query yields no matches (clean state), never a crash', () => {
  assert.deepEqual(results('!!!'), []);
  assert.deepEqual(results('—'), []);
});

test('empty catalog is safe', () => {
  const e = EX.createExerciseIndex([]);
  assert.deepEqual(e.search('bench').results, []);
  assert.equal(e.search('bench').resolution.matchType, 'unresolved');
});

test('malformed / partial catalog rows are skipped, not fatal', () => {
  const bad = EX.createExerciseIndex([
    { id: 'x' },                       // no name
    { name: 'No Id' },                 // no id
    null,                              // junk
    { id: 'y', name: 'Zercher Squat' } // valid, minimal
  ]);
  assert.equal(bad.size, 1);
  assert.equal(bad.search('zercher').results[0].name, 'Zercher Squat');
});

test('duplicate names / aliases across rows do not throw and stay resolvable', () => {
  const dup = EX.createExerciseIndex([
    { id: 'a', name: 'Row', aliases: ['pull'] },
    { id: 'b', name: 'Row', aliases: ['pull'] } // duplicate name + alias
  ]);
  assert.doesNotThrow(() => dup.search('row'));
  assert.ok(dup.search('row').results.length >= 1);
});

test('resolver-unavailable analog: search over an empty index degrades cleanly', () => {
  const e = EX.searchExercises('anything', []);
  assert.deepEqual(e.results, []);
});

/* ── searchExercises convenience === index.search ─────────────────────────── */

test('searchExercises(query, catalog) matches createExerciseIndex(...).search', () => {
  const a = EX.searchExercises('RDL', EXERCISE_CATALOG).results.map((r) => r.id);
  const b = idx.search('RDL').results.map((r) => r.id);
  assert.deepEqual(a, b);
});
