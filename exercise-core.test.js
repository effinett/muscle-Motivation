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
  // Catalog now has front/back/goblet/smith squat, but no DECLINE squat — a hard
  // modifier with no matching variant must not collapse onto another squat.
  const r = resolve('decline squat');
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

test('assisted pull-up resolves to its own machine canonical (Phase 4.2.1G)', () => {
  // Phase 4.2.1G added Assisted Pull-Up as a distinct machine station, so the
  // assist is now an identity of its own record — not a soft variant of Pull-Up.
  const r = resolve('assisted pull-up');
  assert.equal(r.canonicalName, 'Assisted Pull-Up');
  assert.equal(r.matchType, 'exact_canonical');
  assert.notEqual(r.canonicalExerciseId, byName['Pull-Up'].id);
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
  // "lunge" spans several lunge-family variants (walking/forward/lateral/reverse)
  // but no other family, so it reports the family rather than bare ambiguity.
  // ("row" is now cross-family ambiguous because Upright Row shares the token.)
  const r = resolve('lunge');
  assert.equal(r.matchType, 'family');
  assert.equal(r.exerciseFamily, 'lunge');
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
  assert.equal(v.counts.exercises, 159); // 4.2.1G (57 → 141); 4.3.9B CP3b (→ 144); CP4b (→ 159)
  // The expansion introduces no name/equipment or laterality integrity warnings.
  const noisy = v.warnings.filter((w) => w.code === 'equipment_name_mismatch' || w.code === 'laterality_name_mismatch');
  assert.equal(noisy.length, 0);
});

test('validation flags name/equipment and laterality integrity problems (Phase 4.2.1G)', () => {
  const v = EX.validateExerciseCatalog([
    { id: '1', name: 'Dumbbell Thing', equipment: 'Barbell', primary_muscle: 'X' },      // name says dumbbell, tagged barbell
    { id: '2', name: 'Single-Arm Press', equipment: 'Cable', primary_muscle: 'X', is_unilateral: false }, // says single-arm, not unilateral
    { id: '3', name: 'Smith Machine Squat', equipment: 'Smith', primary_muscle: 'Quads' } // smith+machine in name, Smith equip → OK
  ]);
  const codes = v.warnings.map((w) => w.code);
  assert.ok(codes.includes('equipment_name_mismatch'));
  assert.ok(codes.includes('laterality_name_mismatch'));
  // the legitimate "Smith Machine …" row must NOT be flagged
  assert.ok(!v.warnings.some((w) => w.id === '3' && w.code === 'equipment_name_mismatch'));
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

/* ── Phase 4.3.9B CP3b — Bodyweight Foundations exercise records ───────────
 * Three equipment-free movements added so a Bodyweight Program can be built
 * without any exercise that needs a bar, bench, box or implement.
 *
 * These assert the FIXTURE, which is a committed mirror of public.exercises.
 * Fixture↔header consistency is provable here; fixture↔LIVE-DATABASE parity is
 * not, and is proven at migration time instead. */

const CP3B = {
  'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34': {
    name: 'Pike Push-Up', category: 'Vertical Push', equipment: 'Bodyweight',
    primary_muscle: 'Shoulders', secondary_muscles: ['Chest', 'Triceps'],
    movement_pattern: 'vertical_push', force_type: 'push', difficulty: 'intermediate',
    is_bodyweight: true, is_unilateral: false, tracking_type: 'bodyweight_reps',
    default_unit: 'lb', aliases: ['pike press', 'pike pushup'],
  },
  'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45': {
    name: 'Superman', category: 'Hinge', equipment: 'Bodyweight',
    primary_muscle: 'Lower Back', secondary_muscles: ['Glutes', 'Hamstrings'],
    movement_pattern: 'hinge', force_type: 'static', difficulty: 'beginner',
    is_bodyweight: true, is_unilateral: false, tracking_type: 'bodyweight_reps',
    default_unit: 'lb', aliases: [],
  },
  'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56': {
    name: 'Bird Dog', category: 'Core', equipment: 'Bodyweight',
    primary_muscle: 'Core', secondary_muscles: ['Glutes', 'Lower Back'],
    movement_pattern: 'core', force_type: 'static', difficulty: 'beginner',
    is_bodyweight: true, is_unilateral: true, tracking_type: 'bodyweight_reps',
    default_unit: 'lb', aliases: ['quadruped opposite arm leg'],
  },
};

/* Phase 4.3.9B CP4b — the fifteen live catalog additions (migration
 * phase_439b_cp4b_bodyweight_catalog_foundations). Approved semantics per row;
 * every remaining field is pinned by CP4B_CONTENT_MD5 below. */
const CP4B_ROLE = {
  '784a0508-84c3-42a6-98b1-c00cc780e5cd': ['Wall Push-Up', 'push', 'Horizontal Push', 'horizontal_push', 'Chest', 'bodyweight_reps', 'lb', false],
  'c3d81925-04dc-4caf-b5ef-5b42740028e8': ['Pike Lean', 'push', 'Vertical Push', 'vertical_push', 'Shoulders', 'time', 'sec', false],
  '1b836b2c-af56-40a6-9afe-023c3ccd5361': ['Step Jack', 'conditioning', 'Cardio', 'gait', 'Full Body', 'time', 'sec', false],
  '41fe1cb7-ffc7-48a0-8ad4-c0b4d46c0fa5': ['Jumping Jack', 'conditioning', 'Cardio', 'gait', 'Full Body', 'time', 'sec', false],
  '7fae5cd2-712d-4df2-982d-850091d10329': ['March in Place', 'conditioning', 'Cardio', 'gait', 'Full Body', 'time', 'sec', false],
  '6d50c3a6-0dde-46e4-bc3a-508c2f358803': ['High Knees', 'conditioning', 'Cardio', 'gait', 'Full Body', 'time', 'sec', false],
  'ead731d6-bfdd-4119-bd0b-bb3092457e69': ['Cat-Cow', 'mobility', 'Mobility', 'mobility', 'Lower Back', 'time', 'sec', false],
  '44ebe984-c8e9-4842-8617-7f54f1179d2b': ['Quadruped Thoracic Rotation', 'mobility', 'Mobility', 'mobility', 'Upper Back', 'time', 'sec', true],
  'e3f12784-cf40-4aa5-ae41-6770416c4d1f': ['Wall Slide', 'mobility', 'Mobility', 'mobility', 'Upper Back', 'time', 'sec', false],
  '6962172b-18eb-4def-88d3-acc67c62f9ce': ['Kneeling Hip Flexor Stretch', 'mobility', 'Mobility', 'mobility', 'Hip Flexors', 'time', 'sec', true],
  'b2168db4-fb33-4dd0-a8e2-ab5fa81677e4': ['90/90 Hip Rotation', 'mobility', 'Mobility', 'mobility', 'Glutes', 'time', 'sec', true],
  '4b0b5faa-4704-4959-a550-c01de705a540': ['Supine Hamstring Stretch', 'mobility', 'Mobility', 'mobility', 'Hamstrings', 'time', 'sec', true],
  '53c57e39-51e9-42e5-991a-3357bd610b4a': ['Standing Ankle Rock', 'mobility', 'Mobility', 'mobility', 'Calves', 'time', 'sec', true],
  'fd10bcf3-a09f-41fe-aca5-7996972d496f': ['Supine Spinal Twist', 'mobility', 'Mobility', 'mobility', 'Lower Back', 'time', 'sec', true],
  '04429fae-c385-47dd-91ec-7e1fe3a4a83c': ['Diaphragmatic Breathing', 'mobility', 'Mobility', 'mobility', 'Diaphragm', 'time', 'sec', false],
};

const byId = (id) => EXERCISE_CATALOG.filter((e) => e.id === id);
const sorted = (a) => (a || []).slice().sort();

test('CP3b: each new exercise appears exactly once, with every approved field', () => {
  Object.keys(CP3B).forEach((id) => {
    const hits = byId(id);
    assert.equal(hits.length, 1, id + ' must appear exactly once');
    const row = hits[0];
    const want = CP3B[id];
    Object.keys(want).forEach((k) => {
      // Arrays compare order-insensitively, matching the migration's predicate.
      if (Array.isArray(want[k])) {
        assert.deepStrictEqual(sorted(row[k]), sorted(want[k]), id + '.' + k);
      } else {
        assert.strictEqual(row[k], want[k], id + '.' + k);
      }
    });
  });
});

test('CP3b: Superman is static, never a pulling movement', () => {
  const s = byId('c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45')[0];
  assert.strictEqual(s.force_type, 'static');
  assert.notStrictEqual(s.force_type, 'pull');
  // Nothing in its identity may support pulling-equivalence copy.
  const text = [s.name, s.category, s.movement_pattern].concat(s.aliases || []).join(' ').toLowerCase();
  [/\brow\b/, /pull-?up/, /pulldown/, /\blat\b/].forEach((re) => {
    assert.ok(!re.test(text), 'Superman must not carry pulling language: ' + re);
  });
});

test('CP3b: all three are equipment-free by the approved contract', () => {
  Object.keys(CP3B).forEach((id) => {
    const row = byId(id)[0];
    assert.strictEqual(row.equipment, 'Bodyweight', row.name + ' equipment');
    assert.strictEqual(row.is_bodyweight, true, row.name + ' is_bodyweight');
    // The contract is body + floor + wall: no fixture-dependent vocabulary.
    const text = [row.name].concat(row.aliases || []).join(' ').toLowerCase();
    [/bench/, /\bbar\b/, /\bbox\b/, /chair/, /\bstep\b/, /machine/, /dumbbell/, /\bband\b/]
      .forEach((re) => assert.ok(!re.test(text), row.name + ' must not imply equipment: ' + re));
  });
});

test('CP3b: the catalog has no case-insensitive name or alias collision', () => {
  const seen = new Map();
  EXERCISE_CATALOG.forEach((e) => {
    [e.name].concat(e.aliases || []).forEach((token) => {
      const k = String(token).trim().toLowerCase();
      if (seen.has(k)) {
        assert.fail('token "' + k + '" is shared by "' + seen.get(k) + '" and "' + e.name + '"');
      }
      seen.set(k, e.name);
    });
  });
});

test('fixture holds 159 rows and matches its documented checksum (CP4b)', () => {
  assert.strictEqual(EXERCISE_CATALOG.length, 159);
  const ids = EXERCISE_CATALOG.map((e) => e.id).sort();
  assert.strictEqual(new Set(ids).size, 159, 'every id must be unique');
  const md5 = require('node:crypto').createHash('md5').update(ids.join(',')).digest('hex');
  const header = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, 'benchmarks', 'exercise-fixtures.js'), 'utf8');
  assert.ok(header.includes(md5),
    'the header checksum must equal md5(sorted ids joined by ","): ' + md5);
});

test('CP3b: the 141 pre-existing catalog entries are untouched', () => {
  const added = new Set(Object.keys(CP3B).concat(Object.keys(CP4B_ROLE)));
  assert.strictEqual(EXERCISE_CATALOG.filter((e) => !added.has(e.id)).length, 141);
  // A spot-check on identities other phases depend on.
  const bench = EXERCISE_CATALOG.find((e) => e.name === 'Bench Press');
  assert.ok(bench && bench.equipment === 'Barbell', 'Bench Press must be unchanged');
});

/* Convention guard added with CP3c, protecting a CP3b correction.
 *
 * Two CP3b rows were inserted with Title Case aliases while every other row in
 * the catalog stored them lowercase. Resolution normalizes aliases, so nothing
 * broke — but the raw value surfaces as `matchedAlias`, and the id-only catalog
 * checksum is structurally blind to field content, so neither the checksum nor
 * the existing tests could see the drift. The database was corrected in
 * migration `phase_439b_cp3b_normalize_alias_casing`; this keeps the fixture
 * honest from here on. It is a repository invariant only and does NOT replace
 * live-database verification. */
test('every alias in the catalog fixture is lowercase', () => {
  EXERCISE_CATALOG.forEach((ex) => {
    (ex.aliases || []).forEach((alias) => {
      assert.strictEqual(alias, alias.toLowerCase(),
        'alias "' + alias + '" on ' + ex.name + ' must be stored lowercase');
    });
  });
});

/* ── Phase 4.3.9B CP4b — catalog foundations + first-class Mobility ─────────
 * The fifteen rows are a committed mirror of the live migration. The content
 * hashes pin EVERY fixture field of the new rows and prove the 144 rows that
 * existed before CP4b are byte-identical to the pre-CP4b fixture. */

const CP4B_FIELDS = ['id', 'name', 'category', 'equipment', 'primary_muscle', 'secondary_muscles', 'aliases',
  'movement_pattern', 'force_type', 'difficulty', 'is_bodyweight', 'is_unilateral', 'tracking_type', 'default_unit'];
const contentMd5 = (rows) => require('node:crypto').createHash('md5').update(rows.slice()
  .sort((a, b) => (a.id < b.id ? -1 : 1))
  .map((r) => JSON.stringify(CP4B_FIELDS.map((k) => r[k]))).join('\n')).digest('hex');
const isCp4b = (e) => Object.prototype.hasOwnProperty.call(CP4B_ROLE, e.id);
const CP4B_ROWS = () => EXERCISE_CATALOG.filter(isCp4b);
const PRE_CP4B_ROWS = () => EXERCISE_CATALOG.filter((e) => !isCp4b(e));
const MOBILITY_FAMILY = {
  'Cat-Cow': 'cat-cow',
  'Quadruped Thoracic Rotation': 'thoracic-rotation',
  'Wall Slide': 'wall-slide',
  'Kneeling Hip Flexor Stretch': 'hip-flexor-stretch',
  '90/90 Hip Rotation': 'hip-90-90',
  'Supine Hamstring Stretch': 'hamstring-stretch',
  'Standing Ankle Rock': 'ankle-rock',
  'Supine Spinal Twist': 'spinal-twist',
  'Diaphragmatic Breathing': 'diaphragmatic-breathing',
};

test('CP4b: the fifteen additions appear exactly once with their approved semantics', () => {
  Object.keys(CP4B_ROLE).forEach((id) => {
    const hits = byId(id);
    assert.strictEqual(hits.length, 1, id + ' must appear exactly once');
    const r = hits[0];
    const [name, , category, pattern, primary, tracking, unit, unilateral] = CP4B_ROLE[id];
    assert.strictEqual(r.name, name);
    assert.strictEqual(r.category, category, name + ' category');
    assert.strictEqual(r.movement_pattern, pattern, name + ' movement_pattern');
    assert.strictEqual(r.primary_muscle, primary, name + ' primary_muscle');
    assert.strictEqual(r.tracking_type, tracking, name + ' tracking_type');
    assert.strictEqual(r.default_unit, unit, name + ' default_unit');
    assert.strictEqual(r.is_unilateral, unilateral, name + ' is_unilateral');
    assert.strictEqual(r.equipment, 'Bodyweight', name + ' equipment');
    assert.strictEqual(r.is_bodyweight, true, name + ' is_bodyweight');
    assert.strictEqual(r.difficulty, 'beginner', name + ' difficulty');
  });
  assert.strictEqual(contentMd5(CP4B_ROWS()), 'ad2f37e7d42e69ad4560bf038be5df6d',
    'a CP4b row drifted from the reviewed live values');
});

test('CP4b: the 144 pre-CP4b rows are byte-identical to the previous fixture', () => {
  const prior = PRE_CP4B_ROWS();
  assert.strictEqual(prior.length, 144);
  const idMd5 = require('node:crypto').createHash('md5').update(prior.map((e) => e.id).sort().join(',')).digest('hex');
  assert.strictEqual(idMd5, 'a1314c867b375fad835b246f7536ec68', 'pre-CP4b id set changed');
  assert.strictEqual(contentMd5(prior), '87828a231aaaebe88c42a9fba5f04c3c', 'a pre-CP4b row changed');
  assert.strictEqual(EXERCISE_CATALOG.filter((e) => e.equipment === 'Bodyweight').length, 52);
});

test('CP4b: roles partition the additions 2 push / 4 conditioning / 9 mobility', () => {
  const count = (role) => Object.keys(CP4B_ROLE).filter((id) => CP4B_ROLE[id][1] === role).length;
  assert.deepStrictEqual([count('push'), count('conditioning'), count('mobility')], [2, 4, 9]);
  // Mobility is exactly the nine rows tagged mobility — nothing else in the catalog.
  const mobility = EXERCISE_CATALOG.filter((e) => e.movement_pattern === 'mobility').map((e) => e.name).sort();
  assert.deepStrictEqual(mobility, Object.keys(MOBILITY_FAMILY).sort());
  EXERCISE_CATALOG.filter((e) => e.movement_pattern === 'mobility')
    .forEach((e) => assert.strictEqual(e.category, 'Mobility', e.name));
});

test('CP4b: mobility is a member of the canonical movement-pattern taxonomy', () => {
  assert.ok(EX.MOVEMENT_PATTERNS.includes('mobility'));
  const v = EX.validateExerciseCatalog(EXERCISE_CATALOG);
  assert.deepStrictEqual(v.warnings.filter((w) => w.code === 'invalid_movement_pattern'), []);
});

test('CP4b: every mobility exercise resolves to its own explicit, stable family', () => {
  Object.keys(MOBILITY_FAMILY).forEach((name) => {
    const fam = EX.getExerciseFamily(byName[name]);
    assert.strictEqual(fam, MOBILITY_FAMILY[name], name + ' family');
    // Never the pattern+token fallback, whose generic last word groups drills.
    assert.ok(!/^mobility:/.test(fam), name + ' fell back to ' + fam);
  });
  const fams = Object.values(MOBILITY_FAMILY);
  assert.strictEqual(new Set(fams).size, fams.length, 'two mobility drills share a family');
});

test('CP4b: generic words never pair unrelated mobility drills as variants', () => {
  const pairs = [
    ['Quadruped Thoracic Rotation', '90/90 Hip Rotation'],
    ['Kneeling Hip Flexor Stretch', 'Supine Hamstring Stretch'],
  ];
  pairs.forEach(([a, b]) => {
    assert.notStrictEqual(EX.getExerciseFamily(byName[a]), EX.getExerciseFamily(byName[b]), a + ' vs ' + b);
    assert.ok(!relsOf(a).some((r) => r.target.name === b), a + ' must not relate to ' + b);
    assert.ok(!relsOf(b).some((r) => r.target.name === a), b + ' must not relate to ' + a);
  });
  // The mechanism the curated entries defend against: without them both pairs
  // DO share a fallback family, so this guard is load-bearing, not decorative.
  const fallback = (name) => EX.getExerciseFamily({ name: name + ' Drill', movement_pattern: 'mobility' });
  assert.strictEqual(fallback('Thoracic Rotation'), fallback('Hip Rotation'));
  // No mobility drill gets ANY derived relationship: each is its own family and
  // mobility is not a compound pattern, so no user-facing progression is implied.
  Object.keys(MOBILITY_FAMILY).forEach((name) => {
    assert.deepStrictEqual(relsOf(name), [], name + ' relationships');
  });
});

test('CP4b: existing exercise families are unchanged', () => {
  const prior = PRE_CP4B_ROWS().slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const md5 = require('node:crypto').createHash('md5')
    .update(prior.map((e) => e.id + '|' + EX.getExerciseFamily(e)).join('\n')).digest('hex');
  assert.strictEqual(md5, '85de0031a850e265570fa6f1066da1f1');
});

test('CP4b: Pike Lean is a timed hold, never a Pike Push-Up variant or regression', () => {
  const lean = byName['Pike Lean'];
  assert.notStrictEqual(EX.getExerciseFamily(lean), EX.getExerciseFamily(byName['Pike Push-Up']));
  assert.deepStrictEqual(relsOf('Pike Lean'), []);
  assert.ok(!relsOf('Pike Push-Up').some((r) => r.target.name === 'Pike Lean'));
  assert.strictEqual(lean.tracking_type, 'time');
  assert.strictEqual(lean.force_type, 'static');
});

test('CP4b: exact names and aliases of every addition resolve to that exercise', () => {
  CP4B_ROWS().forEach((e) => {
    const r = idx.resolve(e.name);
    assert.strictEqual(r.canonicalExerciseId, e.id, e.name + ' by name -> ' + r.canonicalName);
    (e.aliases || []).forEach((a) => {
      const ra = idx.resolve(a);
      assert.strictEqual(ra.canonicalExerciseId, e.id, 'alias "' + a + '" -> ' + ra.canonicalName);
    });
  });
});

test('CP4b: broad terms produce a deterministic chooser, never a guessed auto-pick', () => {
  const expected = {
    pike: ['Pike Lean', 'Pike Push-Up'],
    twist: ['Russian Twist', 'Supine Spinal Twist'],
    wall: ['Wall Sit', 'Wall Slide', 'Wall Push-Up'],
    hamstring: ['Leg Curl', 'Supine Hamstring Stretch', 'Lying Leg Curl', 'Seated Leg Curl'],
  };
  Object.keys(expected).forEach((q) => {
    const r = idx.resolve(q);
    assert.strictEqual(r.matchType, 'ambiguous', q + ' must not auto-select (' + r.canonicalName + ')');
    assert.strictEqual(r.canonicalExerciseId, null, q);
    const run = () => idx.search(q, { limit: 5 }).results.map((x) => x.exercise.name);
    assert.deepStrictEqual(run(), expected[q], q + ' chooser order');
    assert.deepStrictEqual(run(), run(), q + ' chooser must be deterministic');
  });
});

test('CP4b: additions use only floor, wall, standing space and the body', () => {
  // "step" is excluded from the vocabulary on purpose: Step Jack steps a foot
  // sideways (a verb), it never uses a step platform.
  const FORBIDDEN = [/bench/, /\bbar\b/, /\bbox\b/, /chair/, /table/, /machine/, /dumbbell/, /\bband\b/,
    /cable/, /treadmill/, /roller/, /strap/, /towel/, /platform/, /wedge/, /\bwheel\b/];
  CP4B_ROWS().forEach((e) => {
    const text = [e.name].concat(e.aliases || []).join(' ').toLowerCase();
    FORBIDDEN.forEach((re) => assert.ok(!re.test(text), e.name + ' implies equipment: ' + re));
  });
});
