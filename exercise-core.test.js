/* ──────────────────────────────────────────────────────────────────────────
 * Tests for the Shared Exercise-Intelligence Core (exercise-core.js, Phase 4.2.1E)
 *
 * Zero-dependency: Node's built-in runner + assert. exercise-core.js is a pure
 * module (no DB / DOM / fetch), so identity resolution, the family model, the
 * relationship graph, and validation are all testable offline against a snapshot
 * of the live catalog (benchmarks/exercise-fixtures.js).
 *
 * These tests pin BEHAVIOR, not implementation output: aliases resolve, variants
 * never silently collapse, ambiguous terms don't fake certainty, families group
 * meaningfully, and relationships stay conservative (never muscle-only).
 * ──────────────────────────────────────────────────────────────────────────── */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const EX = require('./exercise-core.js');
const P = require('./progression.js');
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const idx = EX.createExerciseIndex(EXERCISE_CATALOG);
const byName = {};
EXERCISE_CATALOG.forEach((e) => { byName[e.name] = e; });
const resolve = (q) => idx.resolve(q);
const nameOf = (q) => resolve(q).canonicalName;
const relsOf = (name) => idx.getRelationships(byName[name].id);

/* ── Normalization ───────────────────────────────────────────────────────── */

test('normalizeExerciseName collapses case, punctuation, hyphens, apostrophes', () => {
  assert.equal(EX.normalizeExerciseName('Pull-Up'), 'pull up');
  assert.equal(EX.normalizeExerciseName('  Lat   Pull-Down '), 'lat pull down');
  assert.equal(EX.normalizeExerciseName("Farmer's Walk"), 'farmers walk');
  assert.equal(EX.normalizeExerciseName('BENCH PRESS'), 'bench press');
  assert.equal(EX.normalizeExerciseName(null), '');
});

test('buildExerciseLookupKey expands equipment abbreviations and singularizes', () => {
  assert.equal(EX.buildExerciseLookupKey('DB Bench Press'), 'dumbbell bench press');
  assert.equal(EX.buildExerciseLookupKey('BB Row'), 'barbell row');
  assert.equal(EX.buildExerciseLookupKey('Curls'), 'curl');
  assert.equal(EX.buildExerciseLookupKey('Crunches'), 'crunch');
  // "press" (…ss) must never be singularized to "pres"
  assert.equal(EX.buildExerciseLookupKey('Bench Press'), 'bench press');
});

/* ── Exact + alias matching ──────────────────────────────────────────────── */

test('exact canonical names resolve with high confidence', () => {
  const r = resolve('Bench Press');
  assert.equal(r.matchType, 'exact_canonical');
  assert.equal(r.confidence, 'high');
  assert.equal(r.canonicalName, 'Bench Press');
  assert.equal(r.canonicalExerciseId, byName['Bench Press'].id);
});

test('aliases and abbreviations resolve to the right canonical exercise', () => {
  assert.equal(nameOf('BB bench'), 'Bench Press');
  assert.equal(nameOf('DB bench'), 'Dumbbell Press');
  assert.equal(nameOf('dumbbell bench press'), 'Dumbbell Press');
  assert.equal(nameOf('lat pulldown'), 'Lat Pulldown');
  assert.equal(nameOf('lat pull-down'), 'Lat Pulldown');
  assert.equal(nameOf('RDL'), 'Romanian Deadlift');
  assert.equal(nameOf('Romanian deadlift'), 'Romanian Deadlift');
  assert.equal(nameOf('OHP'), 'Overhead Press');
  assert.equal(nameOf('db row'), 'Dumbbell Row');
});

test('resolved result carries structured metadata + provenance', () => {
  const r = resolve('bb bench');
  assert.equal(r.movementPattern, 'horizontal_push');
  assert.equal(r.equipment, 'barbell');
  assert.equal(r.mechanics, 'compound');
  assert.deepEqual(r.primaryMuscles, ['Chest']);
  assert.equal(r.exerciseFamily, 'bench-press');
  assert.equal(r.provenance, 'curated_catalog');
});

/* ── Variant preservation (must never silently collapse) ─────────────────── */

test('incline never resolves to flat and vice-versa', () => {
  assert.equal(nameOf('incline bench'), 'Incline Bench Press');
  assert.equal(nameOf('incline db press'), 'Incline Dumbbell Press');
  // "flat bench" must land on the flat barbell bench, never the incline
  assert.equal(nameOf('flat bench'), 'Bench Press');
  assert.notEqual(nameOf('flat bench'), 'Incline Bench Press');
  assert.notEqual(nameOf('incline bench'), 'Bench Press');
});

test('a demanded hard variant absent from the catalog stays unresolved, never collapses', () => {
  // Catalog has back/goblet squat but no front squat.
  const r = resolve('front squat');
  assert.equal(r.matchType, 'unresolved');
  assert.equal(r.canonicalExerciseId, null);
  assert.equal(r.reason, 'variant_not_in_catalog');
  // never silently becomes back squat
  assert.notEqual(r.canonicalName, 'Barbell Back Squat');
});

test('Romanian deadlift and conventional deadlift stay distinct variants', () => {
  assert.equal(nameOf('romanian deadlift'), 'Romanian Deadlift');
  assert.equal(nameOf('conventional deadlift'), 'Conventional Deadlift');
  assert.notEqual(nameOf('rdl'), 'Conventional Deadlift');
});

test('seated cable row does not collapse into barbell row', () => {
  assert.equal(nameOf('seated row'), 'Seated Cable Row');
  assert.notEqual(nameOf('seated row'), 'Barbell Row');
});

test('dumbbell shoulder press does not resolve to the barbell overhead press', () => {
  assert.equal(nameOf('dumbbell shoulder press'), 'Dumbbell Shoulder Press');
  assert.notEqual(nameOf('dumbbell shoulder press'), 'Overhead Press');
});

test('assisted pull-up is NOT an exact alias of the unassisted pull-up', () => {
  const r = resolve('assisted pull-up');
  assert.notEqual(r.matchType, 'exact_alias');
  assert.notEqual(r.matchType, 'exact_canonical');
  // it still points at the pull-up as an approximate/soft variant, low confidence
  assert.equal(r.canonicalName, 'Pull-Up');
  assert.equal(r.confidence, 'low');
});

/* ── Family model ────────────────────────────────────────────────────────── */

test('family groups meaningful variants without merging them into one exercise', () => {
  const fam = (n) => EX.getExerciseFamily(byName[n]);
  assert.equal(fam('Bench Press'), 'bench-press');
  assert.equal(fam('Dumbbell Press'), 'bench-press');
  assert.equal(fam('Incline Bench Press'), 'bench-press');
  assert.equal(fam('Incline Dumbbell Press'), 'bench-press');
  // deadlift family shares a base movement, distinct variants
  assert.equal(fam('Conventional Deadlift'), 'deadlift');
  assert.equal(fam('Romanian Deadlift'), 'deadlift');
  assert.equal(fam('Trap Bar Deadlift'), 'deadlift');
  // rows are one family
  ['Barbell Row', 'Dumbbell Row', 'Machine Row', 'Seated Cable Row'].forEach((n) => {
    assert.equal(fam(n), 'row');
  });
  // pull-up and chin-up share a family; lat pulldown is a DIFFERENT family
  assert.equal(fam('Pull-Up'), 'pull-up');
  assert.equal(fam('Chin-Up'), 'pull-up');
  assert.notEqual(fam('Lat Pulldown'), fam('Pull-Up'));
});

test('shared muscle alone does NOT make a family', () => {
  // leg extension and squat both hit quads but are different families
  assert.notEqual(EX.getExerciseFamily(byName['Leg Extension']), EX.getExerciseFamily(byName['Barbell Back Squat']));
  // cable fly and bench press both hit chest but are different families
  assert.notEqual(EX.getExerciseFamily(byName['Cable Fly']), EX.getExerciseFamily(byName['Bench Press']));
  // leg press is its own family, not the barbell squat family
  assert.notEqual(EX.getExerciseFamily(byName['Leg Press']), EX.getExerciseFamily(byName['Barbell Back Squat']));
});

test('getExerciseFamily degrades deterministically for uncurated exercises', () => {
  const f = EX.getExerciseFamily({ name: 'Zercher Squat', movement_pattern: 'squat' });
  assert.equal(typeof f, 'string');
  assert.ok(f.indexOf('squat') !== -1);
  // stable across calls
  assert.equal(f, EX.getExerciseFamily({ name: 'Zercher Squat', movement_pattern: 'squat' }));
});

/* ── Equipment handling ──────────────────────────────────────────────────── */

test('normalizeEquipment maps every equipment class to a distinct canonical token', () => {
  assert.equal(EX.normalizeEquipment('Barbell'), 'barbell');
  assert.equal(EX.normalizeEquipment('Dumbbell'), 'dumbbell');
  assert.equal(EX.normalizeEquipment('Cable'), 'cable');
  assert.equal(EX.normalizeEquipment('Machine'), 'machine');
  assert.equal(EX.normalizeEquipment('Bodyweight'), 'bodyweight');
  assert.equal(EX.normalizeEquipment('Smith Machine'), 'smith');
  assert.equal(EX.normalizeEquipment('Resistance Band'), 'band');
  assert.equal(EX.normalizeEquipment('Kettlebell'), 'kettlebell');
  assert.equal(EX.normalizeEquipment(''), 'other');
});

/* ── Ambiguity (no false certainty) ──────────────────────────────────────── */

test('broad generic terms do not resolve to a single exact exercise', () => {
  ['row', 'press', 'curl', 'extension', 'raise'].forEach((q) => {
    const r = resolve(q);
    assert.equal(r.canonicalExerciseId, null, `"${q}" must not pick one exercise`);
    assert.ok(r.matchType === 'ambiguous' || r.matchType === 'family', `"${q}" -> ${r.matchType}`);
    assert.equal(r.confidence, 'low');
    assert.ok(r.candidates.length > 1);
  });
});

test('a generic term whose candidates are all one family reports that family', () => {
  const r = resolve('row');
  assert.equal(r.matchType, 'family');
  assert.equal(r.exerciseFamily, 'row');
});

test('a generic term spanning families reports ambiguous', () => {
  const r = resolve('press'); // bench-press, overhead-press, leg-press, dumbbell shoulder…
  assert.equal(r.matchType, 'ambiguous');
  assert.equal(r.exerciseFamily, null);
});

test('empty / unknown queries resolve to unresolved, not a guess', () => {
  assert.equal(resolve('').matchType, 'unresolved');
  assert.equal(resolve('   ').matchType, 'unresolved');
  assert.equal(resolve('xyzzy nonsense move').matchType, 'unresolved');
});

/* ── Relationships ───────────────────────────────────────────────────────── */

test('same-family different-equipment yields equipment_substitution', () => {
  const rels = relsOf('Bench Press');
  const sub = rels.find((r) => r.target.name === 'Dumbbell Press');
  assert.ok(sub);
  assert.equal(sub.type, 'equipment_substitution');
});

test('progression/regression are directional by difficulty within a family', () => {
  // Chin-Up (intermediate) -> Pull-Up (advanced) is a progression
  const chin = relsOf('Chin-Up');
  const prog = chin.find((r) => r.target.name === 'Pull-Up' && r.type === 'progression');
  assert.ok(prog);
  assert.equal(prog.direction, 'harder');
  // and the reciprocal from Pull-Up is a regression
  const pull = relsOf('Pull-Up');
  const reg = pull.find((r) => r.target.name === 'Chin-Up' && r.type === 'regression');
  assert.ok(reg);
  assert.equal(reg.direction, 'easier');
});

test('cross-family same-pattern alternatives exist for compound moves only', () => {
  // Pull-Up <-> Lat Pulldown: same vertical-pull pattern, different family
  const pull = relsOf('Pull-Up');
  assert.ok(pull.find((r) => r.target.name === 'Lat Pulldown' && r.type === 'same_pattern_alternative'));
  // Bench Press <-> Push-Up: same horizontal-push pattern
  assert.ok(relsOf('Bench Press').find((r) => r.target.name === 'Push-Up' && r.type === 'same_pattern_alternative'));
  // Leg Press <-> Barbell Back Squat: same squat pattern, different family
  assert.ok(relsOf('Leg Press').find((r) => r.target.name === 'Barbell Back Squat' && r.type === 'same_pattern_alternative'));
});

test('isolation moves never form broad muscle-only substitution nets', () => {
  // Cable Fly (isolation, chest) must NOT be related to Bench Press (compound)
  assert.ok(!relsOf('Cable Fly').find((r) => r.target.name === 'Bench Press'));
  // Leg Extension (isolation, quads) must NOT be related to any squat
  const le = relsOf('Leg Extension');
  assert.ok(!le.find((r) => r.target.name === 'Barbell Back Squat'));
  assert.ok(!le.find((r) => r.target.name === 'Leg Press'));
});

test('no exercise ever relates to itself', () => {
  EXERCISE_CATALOG.forEach((ex) => {
    idx.getRelationships(ex.id).forEach((r) => {
      assert.notEqual(r.target.id, ex.id, `${ex.name} self-relationship`);
    });
  });
});

test('relationship direction is explicit for a synthetic progression pair', () => {
  // Non-curated names so both share a DERIVED family (pattern + base token),
  // isolating the difficulty-driven progression direction.
  const mini = [
    { id: 'a', name: 'Ring Push', equipment: 'Bodyweight', movement_pattern: 'horizontal_push', force_type: 'push', primary_muscle: 'Chest', difficulty: 'beginner', is_bodyweight: true },
    { id: 'b', name: 'Weighted Ring Push', equipment: 'Bodyweight', movement_pattern: 'horizontal_push', force_type: 'push', primary_muscle: 'Chest', difficulty: 'intermediate', is_bodyweight: true }
  ];
  const m = EX.createExerciseIndex(mini);
  const fromPush = m.getRelationships('a');
  assert.ok(fromPush.find((r) => r.type === 'progression' && r.target.id === 'b'));
  const fromWeighted = m.getRelationships('b');
  assert.ok(fromWeighted.find((r) => r.type === 'regression' && r.target.id === 'a'));
});

/* ── Validation ──────────────────────────────────────────────────────────── */

test('the production catalog passes validation (no identity errors)', () => {
  const v = EX.validateExerciseCatalog(EXERCISE_CATALOG);
  assert.equal(v.ok, true);
  assert.equal(v.errors.length, 0);
  assert.equal(v.counts.exercises, 57);
});

test('validation flags invalid enums, missing names, duplicate + colliding aliases', () => {
  const bad = [
    { id: '1', name: 'Good Lift', movement_pattern: 'squat', equipment: 'Barbell', difficulty: 'beginner', force_type: 'push', aliases: ['squat thing', 'squat thing'] },
    { id: '2', name: 'Odd Move', movement_pattern: 'levitation', equipment: 'Barbell', difficulty: 'godlike', aliases: ['squat thing'] }, // colliding alias with id 1
    { id: '3', name: 'Good Lift' }, // duplicate canonical name
    { id: '4', name: '' } // missing canonical name
  ];
  const v = EX.validateExerciseCatalog(bad);
  assert.equal(v.ok, false);
  const codes = v.errors.map((e) => e.code);
  assert.ok(codes.includes('missing_canonical_name'));
  assert.ok(codes.includes('duplicate_name'));
  assert.ok(codes.includes('alias_collision')); // "squat thing" owned by 1 and 2
  const warnCodes = v.warnings.map((w) => w.code);
  assert.ok(warnCodes.includes('invalid_movement_pattern'));
  assert.ok(warnCodes.includes('invalid_difficulty'));
  assert.ok(warnCodes.includes('duplicate_alias'));
});

test('validation detects broken relationship targets and self-relationships', () => {
  const cat = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
  const v = EX.validateRelationships([
    { sourceId: 'x', targetId: 'ghost', type: 'equipment_substitution' },
    { sourceId: 'y', targetId: 'y', type: 'variant' }
  ], cat);
  const codes = v.errors.map((e) => e.code);
  assert.ok(codes.includes('relationship_target_missing'));
  assert.ok(codes.includes('self_relationship'));
});

test('validation detects circular progression chains', () => {
  const cat = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const v = EX.validateRelationships([
    { sourceId: 'a', targetId: 'b', type: 'progression' },
    { sourceId: 'b', targetId: 'c', type: 'progression' },
    { sourceId: 'c', targetId: 'a', type: 'progression' }
  ], cat);
  assert.ok(v.errors.map((e) => e.code).includes('circular_progression'));
});

/* ── Taxonomy is one shared source of truth ──────────────────────────────── */

test('every catalog movement_pattern is a member of the shared taxonomy', () => {
  const set = new Set(EX.MOVEMENT_PATTERNS);
  EXERCISE_CATALOG.forEach((ex) => {
    assert.ok(set.has(ex.movement_pattern), `${ex.name}: ${ex.movement_pattern} not in taxonomy`);
  });
});

test('mechanics derive from movement pattern, not a name regex', () => {
  assert.equal(EX.getMechanics(byName['Barbell Back Squat']), 'compound');
  assert.equal(EX.getMechanics(byName['Bicep Curl']), 'isolation');
  assert.equal(EX.getMechanics(byName['Plank']), 'isolation'); // core -> single-joint bucket
});

/* ── Cross-module integration with progression.js (the real consumer) ────── */

test('progression consumes exercise metadata instead of re-parsing the name', () => {
  const pull = byName['Pull-Up'];
  const meta = EX.getProgressionMeta(pull);
  assert.equal(meta.equipment, 'bodyweight');
  // Feed the metadata into progression: equipment comes from the exercise, not the name.
  const out = P.analyze({ exerciseName: 'Pull-Up', equipment: meta.equipment, mechanics: meta.mechanics, history: [] });
  assert.equal(out.equipment, 'bodyweight');
});

test('progression PARITY: omitting metadata matches name-regex inference exactly', () => {
  ['Bench Press', 'Goblet Squat', 'Lat Pulldown', 'Plank', 'Farmer Carry'].forEach((n) => {
    assert.equal(P.resolveEquipment({ exerciseName: n }), P.inferEquipment(n));
  });
});
