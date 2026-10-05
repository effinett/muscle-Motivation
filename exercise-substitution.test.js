/* Phase 4.3.6I — exercise-substitution.js
 *
 * Covers the §38 engine matrix. The load-bearing assertions are the SAFETY ones:
 * an unrelated muscle can never rank as a substitute, incompatible tracking is
 * filtered rather than converted, and custom/legacy sources produce nothing
 * fabricated. Those are the failures this engine exists to make impossible.
 *
 * Ranking-quality tests run against the REAL production catalog fixture
 * (benchmarks/exercise-fixtures.js mirrors public.exercises id-for-id), so a
 * metadata or weight change that degrades real suggestions fails here. */

'use strict';
const test = require('node:test');
const assert = require('node:assert');

const Subs = require('./exercise-substitution');
const { findSubstitutions, explain, canInheritPrescription, muscleGroup, trackingClass } = Subs;
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const byName = (n) => {
  const e = EXERCISE_CATALOG.find((x) => x.name === n);
  if (!e) throw new Error('fixture missing exercise: ' + n);
  return e;
};
const refFor = (n) => ({ name: n, exerciseId: byName(n).id, customId: null });
const names = (list) => list.map((c) => c.name);
const allNames = (r) => names(r.best).concat(names(r.other));

/* ── 1 + 34. source excluded, duplicates removed, inactive excluded ───────── */

test('the source exercise is never offered as its own replacement', () => {
  EXERCISE_CATALOG.forEach((src) => {
    const r = findSubstitutions({ name: src.name, exerciseId: src.id }, EXERCISE_CATALOG);
    const ids = r.best.concat(r.other).map((c) => String(c.id));
    assert.ok(!ids.includes(String(src.id)), src.name + ' suggested itself');
  });
});

test('duplicate catalog ids collapse to one candidate', () => {
  const bench = byName('Bench Press');
  const dbp = byName('Dumbbell Press');
  const dupes = EXERCISE_CATALOG.concat([Object.assign({}, dbp)]);
  const r = findSubstitutions(refFor('Bench Press'), dupes);
  const ids = r.best.concat(r.other).map((c) => String(c.id));
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate ids leaked through');
  assert.ok(bench.id);
});

test('inactive exercises are excluded', () => {
  const cat = EXERCISE_CATALOG.map((e) =>
    e.name === 'Dumbbell Press' ? Object.assign({}, e, { is_active: false }) : e);
  const r = findSubstitutions(refFor('Bench Press'), cat);
  assert.ok(!allNames(r).includes('Dumbbell Press'), 'an inactive exercise was suggested');
  // …and it is present when active, so the test is meaningful.
  const active = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  assert.ok(allNames(active).includes('Dumbbell Press'));
});

/* ── 3 + 6. same primary muscle is a HARD gate, not a preference ──────────── */

test('an unrelated muscle can never be suggested (the bench-press/lat-pulldown rule)', () => {
  const r = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  const got = allNames(r);
  ['Lat Pulldown', 'Barbell Row', 'Barbell Curl', 'Leg Press', 'Back Squat', 'Pull-Up']
    .forEach((n) => assert.ok(!got.includes(n), 'Bench Press must not suggest ' + n));
  assert.ok(got.length > 0, 'but it must still produce real chest alternatives');
});

test('every suggestion across the whole catalog shares the source muscle group', () => {
  EXERCISE_CATALOG.forEach((src) => {
    const r = findSubstitutions({ name: src.name, exerciseId: src.id }, EXERCISE_CATALOG);
    r.best.concat(r.other).forEach((c) => {
      const cand = EXERCISE_CATALOG.find((x) => String(x.id) === String(c.id));
      assert.strictEqual(muscleGroup(cand.primary_muscle), muscleGroup(src.primary_muscle),
        src.name + ' → ' + cand.name + ' crossed muscle groups');
    });
  });
});

test('biceps and triceps never substitute each other (region would be too coarse)', () => {
  const curls = findSubstitutions(refFor('Barbell Curl'), EXERCISE_CATALOG);
  curls.best.concat(curls.other).forEach((c) => {
    assert.ok(!/pushdown|dip|skull|triceps/i.test(c.name), 'curl suggested a triceps move: ' + c.name);
  });
});

test('rear delts never merge into the pressing shoulders group', () => {
  const r = findSubstitutions(refFor('Rear Delt Fly'), EXERCISE_CATALOG);
  r.best.concat(r.other).forEach((c) => {
    const cand = EXERCISE_CATALOG.find((x) => String(x.id) === String(c.id));
    assert.strictEqual(cand.primary_muscle, 'Rear Delts', 'leaked out of rear delts: ' + cand.name);
  });
});

test('curated muscle equivalences hold, and unrelated ones do not', () => {
  assert.strictEqual(muscleGroup('Upper Chest'), muscleGroup('Chest'));
  assert.strictEqual(muscleGroup('Lats'), muscleGroup('Back'));
  assert.strictEqual(muscleGroup('Front Delts'), muscleGroup('Shoulders'));
  assert.strictEqual(muscleGroup('Brachialis'), muscleGroup('Biceps'));
  assert.strictEqual(muscleGroup('Core'), muscleGroup('Abs'));
  assert.notStrictEqual(muscleGroup('Rear Delts'), muscleGroup('Shoulders'));
  assert.notStrictEqual(muscleGroup('Biceps'), muscleGroup('Triceps'));
  assert.notStrictEqual(muscleGroup('Quads'), muscleGroup('Hamstrings'));
  assert.notStrictEqual(muscleGroup('Chest'), muscleGroup('Back'));
});

/* ── 6 + 7. tracking compatibility is a correctness gate ──────────────────── */

test('a time-based exercise never receives rep-based suggestions', () => {
  const r = findSubstitutions(refFor('Plank'), EXERCISE_CATALOG);
  r.best.concat(r.other).forEach((c) => {
    const cand = EXERCISE_CATALOG.find((x) => String(x.id) === String(c.id));
    assert.strictEqual(trackingClass(cand.tracking_type), 'time',
      'Plank suggested a non-time exercise: ' + cand.name + ' (' + cand.tracking_type + ')');
  });
  // Plank shares the abs group with rep-based crunches — proving the filter, not an accident.
  const crunch = EXERCISE_CATALOG.find((e) => e.name === 'Crunches');
  if (crunch) {
    assert.strictEqual(muscleGroup(crunch.primary_muscle), muscleGroup(byName('Plank').primary_muscle));
    assert.ok(!allNames(r).includes('Crunches'), 'a rep exercise leaked into a time source');
  }
});

test('rep-based tracking types are mutually compatible', () => {
  assert.strictEqual(trackingClass('weight_reps'), trackingClass('bodyweight_reps'));
  assert.strictEqual(trackingClass('weight_reps'), trackingClass('weighted_bodyweight'));
  assert.notStrictEqual(trackingClass('weight_reps'), trackingClass('time'));
  assert.notStrictEqual(trackingClass('time'), trackingClass('time_distance'));
  assert.notStrictEqual(trackingClass('time'), trackingClass('distance'));
});

test('a bodyweight exercise is ELIGIBLE to stand in for a loaded one (same rep semantics)', () => {
  // Eligibility is the engine's contract; top-5 membership is a display cap.
  // Push-Up is a different exercise-core family than Bench Press, so it ranks
  // below the seven press-family candidates and is reached via "Choose another
  // exercise" — but it must never be FILTERED OUT, since rep-based bodyweight
  // and rep-based loaded work carry the same prescription semantics.
  const x = explain(byName('Bench Press'), byName('Push-Up'));
  assert.strictEqual(x.eligible, true);
  assert.strictEqual(x.tier, 'best', 'same horizontal-push movement');
  // With the cap lifted it does surface, proving it is ranked rather than dropped.
  const wide = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG, { bestLimit: 50, otherLimit: 50 });
  assert.ok(names(wide.best).includes('Push-Up'));
});

test('canInheritPrescription follows the same tracking rule', () => {
  assert.strictEqual(canInheritPrescription(byName('Bench Press'), byName('Push-Up')), true);
  assert.strictEqual(canInheritPrescription(byName('Bench Press'), byName('Plank')), false);
  assert.strictEqual(canInheritPrescription(null, byName('Plank')), false);
});

/* ── 4 + 10 + 11. tiering ─────────────────────────────────────────────────── */

test('best matches share the movement pattern; other options do not', () => {
  EXERCISE_CATALOG.forEach((src) => {
    const r = findSubstitutions({ name: src.name, exerciseId: src.id }, EXERCISE_CATALOG);
    r.best.forEach((c) => {
      const cand = EXERCISE_CATALOG.find((x) => String(x.id) === String(c.id));
      assert.strictEqual(cand.movement_pattern, src.movement_pattern,
        src.name + ' best-tier candidate changed movement: ' + cand.name);
    });
    r.other.forEach((c) => {
      const cand = EXERCISE_CATALOG.find((x) => String(x.id) === String(c.id));
      assert.notStrictEqual(cand.movement_pattern, src.movement_pattern,
        src.name + ' other-tier candidate kept movement: ' + cand.name);
    });
  });
});

test('a vertical pull keeps pulldowns in best and pushes rows to other', () => {
  const r = findSubstitutions(refFor('Pull-Up'), EXERCISE_CATALOG);
  assert.ok(names(r.best).includes('Lat Pulldown'), 'pulldown should be a best match');
  assert.ok(names(r.best).includes('Chin-Up'));
  const otherNames = names(r.other);
  assert.ok(otherNames.some((n) => /Row/i.test(n)), 'rows belong in other options');
  assert.ok(!names(r.best).some((n) => /Row/i.test(n)), 'a row is not the same movement');
});

test('suggestion counts are capped so the sheet never dumps the catalog', () => {
  EXERCISE_CATALOG.forEach((src) => {
    const r = findSubstitutions({ name: src.name, exerciseId: src.id }, EXERCISE_CATALOG);
    assert.ok(r.best.length <= 5, src.name + ' returned ' + r.best.length + ' best matches');
    assert.ok(r.other.length <= 4, src.name + ' returned ' + r.other.length + ' other options');
  });
  const custom = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG, { bestLimit: 2, otherLimit: 1 });
  assert.strictEqual(custom.best.length, 2);
  assert.strictEqual(custom.other.length, 1);
});

/* ── 5. equipment is a ranking signal, never an eligibility gate ──────────── */

test('equipment never gates eligibility — a barbell source still offers other equipment', () => {
  const r = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  const equips = new Set(r.best.concat(r.other).map((c) => String(c.equipment)));
  assert.ok(equips.size > 1, 'substitution is usually equipment-driven; options must vary');
});

test('same equipment outranks different equipment when all else is equal', () => {
  const src = { id: 's', name: 'Src', primary_muscle: 'Chest', movement_pattern: 'horizontal_push',
    equipment: 'Dumbbell', force_type: 'push', difficulty: 'intermediate', tracking_type: 'weight_reps',
    secondary_muscles: [], is_unilateral: false };
  const same = Object.assign({}, src, { id: 'a', name: 'Alpha Same' });
  const diff = Object.assign({}, src, { id: 'b', name: 'Alpha Diff', equipment: 'Machine' });
  const r = findSubstitutions({ name: 'Src', exerciseId: 's' }, [src, same, diff]);
  assert.deepStrictEqual(names(r.best), ['Alpha Same', 'Alpha Diff']);
});

/* ── 9 + 33. determinism ──────────────────────────────────────────────────── */

test('the same inputs always produce the same ordered result', () => {
  const a = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  const b = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  const shuffled = EXERCISE_CATALOG.slice().reverse();
  const c = findSubstitutions(refFor('Bench Press'), shuffled);
  assert.deepStrictEqual(allNames(a), allNames(b), 'repeat call differed');
  assert.deepStrictEqual(allNames(a), allNames(c), 'catalog order changed the result');
});

test('ties break on name then id, never on input order', () => {
  const base = { primary_muscle: 'Chest', movement_pattern: 'horizontal_push', equipment: 'Barbell',
    force_type: 'push', difficulty: 'intermediate', tracking_type: 'weight_reps',
    secondary_muscles: [], is_unilateral: false };
  const src = Object.assign({ id: 's', name: 'Src' }, base);
  const zeta = Object.assign({ id: 'z', name: 'Zeta' }, base);
  const alpha = Object.assign({ id: 'a', name: 'Alpha' }, base);
  const r1 = findSubstitutions({ name: 'Src', exerciseId: 's' }, [src, zeta, alpha]);
  const r2 = findSubstitutions({ name: 'Src', exerciseId: 's' }, [src, alpha, zeta]);
  assert.deepStrictEqual(names(r1.best), ['Alpha', 'Zeta']);
  assert.deepStrictEqual(names(r1.best), names(r2.best));
});

/* ── 12 + 36. explainability ──────────────────────────────────────────────── */

test('every suggestion carries a deterministic, metadata-derived reason', () => {
  const r = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  r.best.forEach((c) => {
    assert.match(c.reason, /^Same movement/, 'best reason: ' + c.reason);
    assert.ok(c.matched.length > 0, c.name + ' matched no field but was suggested');
  });
  r.other.forEach((c) => assert.match(c.reason, /^Same muscle · Different movement/));
  // Reasons are labels, not generated prose: same pairing → same string.
  const again = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG);
  assert.deepStrictEqual(r.best.map((c) => c.reason), again.best.map((c) => c.reason));
});

test('explain() states why a pairing qualified or was rejected', () => {
  const ok = explain(byName('Bench Press'), byName('Dumbbell Press'));
  assert.strictEqual(ok.eligible, true);
  assert.strictEqual(ok.tier, 'best');
  assert.ok(ok.matched.includes('same_force_type'));

  const muscle = explain(byName('Bench Press'), byName('Lat Pulldown'));
  assert.strictEqual(muscle.eligible, false);
  assert.strictEqual(muscle.rejectedBy, 'muscle_mismatch');

  const tracking = explain(byName('Plank'), byName('Crunches'));
  assert.strictEqual(tracking.eligible, false);
  assert.strictEqual(tracking.rejectedBy, 'tracking_mismatch');

  const self = explain(byName('Bench Press'), byName('Bench Press'));
  assert.strictEqual(self.rejectedBy, 'self');
});

/* ── 13 + 14. custom and legacy sources fabricate nothing ─────────────────── */

test('a custom source produces no algorithmic suggestions', () => {
  const r = findSubstitutions({ name: 'Effi Special Curl', exerciseId: null, customId: 'c-1' }, EXERCISE_CATALOG);
  assert.strictEqual(r.kind, 'custom');
  assert.strictEqual(r.supported, false);
  assert.deepStrictEqual(r.best, []);
  assert.deepStrictEqual(r.other, []);
  assert.strictEqual(r.note, Subs.NOTE.custom);
});

test('a custom named exactly like a canonical still gets nothing', () => {
  const r = findSubstitutions({ name: 'Bench Press', exerciseId: null, customId: 'c-2' }, EXERCISE_CATALOG);
  assert.strictEqual(r.kind, 'custom');
  assert.deepStrictEqual(r.best.concat(r.other), []);
});

test('a legacy name-only source produces no automatic suggestions', () => {
  const r = findSubstitutions({ name: 'Bench Press', exerciseId: null, customId: null }, EXERCISE_CATALOG);
  assert.strictEqual(r.kind, 'legacy');
  assert.strictEqual(r.supported, false);
  assert.deepStrictEqual(r.best.concat(r.other), []);
  assert.strictEqual(r.note, Subs.NOTE.legacy);
});

test('a dual-id (invalid) reference is never treated as canonical', () => {
  const r = findSubstitutions({ name: 'Bench Press', exerciseId: byName('Bench Press').id, customId: 'c-3' }, EXERCISE_CATALOG);
  assert.strictEqual(r.kind, 'invalid');
  assert.strictEqual(r.supported, false);
  assert.deepStrictEqual(r.best.concat(r.other), []);
});

test('a canonical id absent from the catalog yields nothing, not a guess', () => {
  const r = findSubstitutions({ name: 'Bench Press', exerciseId: 'not-a-real-id' }, EXERCISE_CATALOG);
  assert.strictEqual(r.supported, false);
  assert.deepStrictEqual(r.best.concat(r.other), []);
  assert.strictEqual(r.note, Subs.NOTE.unknown);
});

/* ── 16. no name matching anywhere ────────────────────────────────────────── */

test('identity is by id only — a matching name cannot substitute for a matching id', () => {
  const bench = byName('Bench Press');
  // Same name, different id: must be treated as a different exercise (and is
  // therefore eligible), proving resolution never keys on the name.
  const impostor = Object.assign({}, bench, { id: 'other-id-999', name: 'Bench Press' });
  const r = findSubstitutions(refFor('Bench Press'), EXERCISE_CATALOG.concat([impostor]));
  const ids = r.best.concat(r.other).map((c) => String(c.id));
  assert.ok(!ids.includes(String(bench.id)), 'the real source leaked in');
  assert.ok(ids.includes('other-id-999'), 'a same-named different id must be a normal candidate');
});

/* ── malformed input ──────────────────────────────────────────────────────── */

test('malformed inputs never throw', () => {
  const bad = [
    [null, null], [undefined, undefined], [{}, []], [{}, null],
    [refFor('Bench Press'), null], [refFor('Bench Press'), 'nope'],
    [{ name: 'x', exerciseId: 1 }, [{ id: 1 }, { id: 2 }]],
    [{ name: 'x', exerciseId: 1 }, [{ id: 1, primary_muscle: null }, null, { }]]
  ];
  bad.forEach(([ref, cat]) => {
    const r = findSubstitutions(ref, cat);
    assert.ok(r && Array.isArray(r.best) && Array.isArray(r.other));
  });
});

/* ── real-catalog coverage (a metadata regression would show up here) ─────── */

test('real catalog coverage stays high and the known isolates stay isolated', () => {
  let withAny = 0;
  const zero = [];
  EXERCISE_CATALOG.forEach((src) => {
    const r = findSubstitutions({ name: src.name, exerciseId: src.id }, EXERCISE_CATALOG);
    if (r.best.length || r.other.length) withAny++;
    else zero.push(src.name);
  });
  assert.ok(withAny >= 130, 'coverage dropped to ' + withAny + '/' + EXERCISE_CATALOG.length);
  // These six are genuinely alone in their (muscle × tracking) cell. Returning
  // nothing is the CORRECT answer — the alternative is suggesting something wrong.
  //
  // Superman's (Phase 4.3.9B CP3b) isolation is DELIBERATE: it is the only
  // REP-tracked exercise whose primary_muscle is 'Lower Back' (CP4b's Cat-Cow and
  // Supine Spinal Twist share the muscle but are timed, so the tracking gate keeps
  // them apart). The sole way to give it candidates would be to reclassify it as
  // 'Back', which is the primary muscle of twelve ROWS — so the engine would start
  // offering pulling movements as substitutes for a floor exercise. That is the
  // exact pulling-equivalence 4.3.9B forbids, so no substitute is the honest answer.
  //
  // The six CP4b isolates are equally deliberate: Pike Lean is the only timed
  // Shoulders hold (it must never inherit Pike Push-Up's rep prescription), and
  // five mobility drills are alone in their (muscle × timed) cell — offering a
  // strength exercise instead would be the wrong answer.
  assert.deepStrictEqual(zero.sort(), [
    '90/90 Hip Rotation', 'Diaphragmatic Breathing', 'Farmer Carry', 'Hip Adduction',
    'Incline Treadmill Walk', 'Kneeling Hip Flexor Stretch', 'Pike Lean',
    'Standing Ankle Rock', 'Superman', 'Supine Hamstring Stretch', 'Treadmill Run', 'Wall Sit'
  ]);
});

/* ── Phase 4.3.9B CP4b — containment for the fifteen catalog additions ───── */

const CP4B_NAMES = ['Wall Push-Up', 'Pike Lean', 'Step Jack', 'Jumping Jack', 'March in Place', 'High Knees',
  'Cat-Cow', 'Quadruped Thoracic Rotation', 'Wall Slide', 'Kneeling Hip Flexor Stretch', '90/90 Hip Rotation',
  'Supine Hamstring Stretch', 'Standing Ankle Rock', 'Supine Spinal Twist', 'Diaphragmatic Breathing'];
const CONDITIONING = ['High Knees', 'Jumping Jack', 'March in Place', 'Step Jack'];
const swapOf = (n, catalog) => {
  const src = byName(n);
  return findSubstitutions({ name: src.name, exerciseId: src.id }, catalog || EXERCISE_CATALOG);
};

test('CP4b: Pike Lean and Pike Push-Up never substitute for each other (tracking differs)', () => {
  assert.deepStrictEqual(allNames(swapOf('Pike Lean')), []);
  assert.ok(!allNames(swapOf('Pike Push-Up')).includes('Pike Lean'));
  assert.strictEqual(canInheritPrescription(byName('Pike Push-Up'), byName('Pike Lean')), false);
  assert.strictEqual(canInheritPrescription(byName('Pike Lean'), byName('Pike Push-Up')), false);
  assert.strictEqual(explain(byName('Pike Push-Up'), byName('Pike Lean')).eligible, false);
});

test('CP4b: Wall Push-Up joins only the rep-tracked chest/push group', () => {
  const r = swapOf('Wall Push-Up');
  assert.deepStrictEqual(names(r.best),
    ['Incline Push-Up', 'Knee Push-Up', 'Push-Up', 'Decline Push-Up', 'Dumbbell Press']);
  assert.deepStrictEqual(names(r.other), ['Dumbbell Fly', 'Cable Fly', 'Pec Deck']);
  r.best.concat(r.other).forEach((c) => {
    const cand = byName(c.name);
    assert.strictEqual(muscleGroup(cand.primary_muscle), 'chest', c.name);
    assert.strictEqual(trackingClass(cand.tracking_type), 'reps', c.name);
  });
});

test('CP4b: the four conditioning movements form one closed timed group', () => {
  CONDITIONING.forEach((n) => {
    const got = allNames(swapOf(n)).slice().sort();
    assert.deepStrictEqual(got, CONDITIONING.filter((x) => x !== n), n);
  });
});

test('CP4b: mobility never pairs with strength work in either direction', () => {
  const mobility = EXERCISE_CATALOG.filter((e) => e.movement_pattern === 'mobility');
  assert.strictEqual(mobility.length, 9);
  const isMob = new Set(mobility.map((e) => e.name));
  mobility.forEach((m) => {
    allNames(swapOf(m.name)).forEach((c) => assert.ok(isMob.has(c), m.name + ' offered strength move ' + c));
  });
  EXERCISE_CATALOG.filter((e) => !isMob.has(e.name)).forEach((e) => {
    allNames(swapOf(e.name)).forEach((c) => assert.ok(!isMob.has(c), e.name + ' offered mobility drill ' + c));
  });
  // The only mobility pairs are same-muscle timed drills, by construction.
  assert.deepStrictEqual(allNames(swapOf('Cat-Cow')), ['Supine Spinal Twist']);
  assert.deepStrictEqual(allNames(swapOf('Wall Slide')), ['Quadruped Thoracic Rotation']);
});

test('CP4b: every pre-CP4b exercise keeps its swaps, except the approved Wall Push-Up additions', () => {
  const added = new Set(CP4B_NAMES);
  const prior = EXERCISE_CATALOG.filter((e) => !added.has(e.name));
  assert.strictEqual(prior.length, 144);
  const changed = [];
  const displaced = {};
  prior.forEach((e) => {
    const before = swapOf(e.name, prior);
    const after = swapOf(e.name);
    if (JSON.stringify([names(before.best), names(before.other)]) === JSON.stringify([names(after.best), names(after.other)])) return;
    changed.push(e.name);
    // The ONLY permitted change is Wall Push-Up joining the list.
    const newcomers = allNames(after).filter((n) => added.has(n));
    assert.deepStrictEqual(newcomers, ['Wall Push-Up'], e.name + ' gained ' + newcomers);
    // Per tier, every prior candidate keeps its relative order; the newcomer can
    // only push the TAIL of its own tier past that tier's limit. Nothing else is
    // reordered, substituted, or moved between tiers.
    ['best', 'other'].forEach((tier) => {
      const kept = names(after[tier]).filter((n) => !added.has(n));
      assert.deepStrictEqual(kept, names(before[tier]).slice(0, kept.length), e.name + ' ' + tier + ' reordered');
    });
    displaced[e.name] = allNames(before).filter((n) => !allNames(after).includes(n));
  });
  // Exactly what the approved Wall Push-Up addition pushes out of the 5-slot
  // best tier: the lowest-scored barbell press, never another bodyweight push.
  assert.deepStrictEqual(displaced, {
    'Push-Up': ['Bench Press'], 'Knee Push-Up': ['Bench Press'],
    'Incline Push-Up': ['Bench Press'], 'Decline Push-Up': ['Decline Bench Press']
  });
  assert.deepStrictEqual(changed.sort(), ['Decline Push-Up', 'Incline Push-Up', 'Knee Push-Up', 'Push-Up']);
  ['Plank', 'Wall Sit', 'Mountain Climber', 'Side Plank', 'Treadmill Run', 'Incline Treadmill Walk']
    .forEach((n) => assert.deepStrictEqual(allNames(swapOf(n)), allNames(swapOf(n, prior)), n));
});

/* ── Phase 4.3.9B — equipment-free candidates (candidateFilter) ────────────
 * A Bodyweight Foundations session ranks only equipment-free candidates. The
 * rule is ExerciseFilters'; the engine only honours a caller's constraint. */

const EFR = require('./exercise-filters.js');
const freeOnly = { candidateFilter: EFR.isEquipmentFreeExercise };
const swapFree = (n) => findSubstitutions(refFor(n), EXERCISE_CATALOG, freeOnly);
const swapAll = (n) => findSubstitutions(refFor(n), EXERCISE_CATALOG);

test('4.3.9B: every equipment-free candidate is in the reviewed pool, for every pool source', () => {
  EFR.EQUIPMENT_FREE_EXERCISE_IDS.forEach((id) => {
    const src = EXERCISE_CATALOG.find((e) => e.id === id);
    const r = swapFree(src.name);
    assert.strictEqual(r.supported, true, src.name);
    r.best.concat(r.other).forEach((c) => {
      const row = EXERCISE_CATALOG.find((e) => e.id === c.id);
      assert.ok(EFR.isEquipmentFreeExercise(row), src.name + ' → ' + c.name + ' needs equipment');
    });
  });
});

test('4.3.9B: Push-Up keeps its equipment-free progressions and loses the bench and barbell', () => {
  const free = allNames(swapFree('Push-Up'));
  ['Knee Push-Up', 'Wall Push-Up'].forEach((n) => assert.ok(free.includes(n), n + ' is offered'));
  // Each of these is offered today without the rule, so its absence is real.
  const all = allNames(swapAll('Push-Up'));
  ['Incline Push-Up', 'Decline Push-Up', 'Dumbbell Press', 'Cable Fly', 'Pec Deck'].forEach((n) => {
    assert.ok(all.includes(n), n + ' is an unrestricted candidate');
    assert.ok(!free.includes(n), n + ' is not offered');
  });
  assert.ok(all.some((n) => !free.includes(n)), 'the restriction actually removed something');
});

test('4.3.9B: the source is still found in the full catalog even when it is not equipment-free', () => {
  // A row added before the rule existed must still get equipment-free suggestions.
  const r = swapFree('Bench Press');
  assert.strictEqual(r.supported, true);
  assert.strictEqual(r.sourceName, 'Bench Press');
  assert.ok(r.best.length + r.other.length > 0, 'equipment-free alternatives are offered');
  r.best.concat(r.other).forEach((c) =>
    assert.ok(EFR.EQUIPMENT_FREE_EXERCISE_IDS.includes(c.id), c.name));
});

test('4.3.9B: the constraint applies before limits, so it never starves a list', () => {
  const big = { candidateFilter: EFR.isEquipmentFreeExercise, bestLimit: 99, otherLimit: 99 };
  const full = findSubstitutions(refFor('Push-Up'), EXERCISE_CATALOG, big);
  const r = swapFree('Push-Up');
  assert.strictEqual(r.best.length, Math.min(5, full.best.length));
  assert.strictEqual(r.other.length, Math.min(4, full.other.length));
  assert.deepStrictEqual(names(r.best), names(full.best).slice(0, 5), 'ranking order unchanged');
});

test('4.3.9B: nothing compatible means the existing honest note — never an equipment fallback', () => {
  // Pike Push-Up's only matches are equipment presses; restricted, none remain.
  assert.ok(allNames(swapAll('Pike Push-Up')).length > 0);
  const r = swapFree('Pike Push-Up');
  assert.deepStrictEqual(allNames(r), []);
  assert.strictEqual(r.note, 'No close alternatives in the library for this one.');
});

test('4.3.9B: no option, an empty option object or a non-function filter changes nothing', () => {
  ['Push-Up', 'Bench Press', 'Pike Push-Up', 'Bodyweight Squat', 'Lat Pulldown'].forEach((n) => {
    const base = swapAll(n);
    assert.deepStrictEqual(findSubstitutions(refFor(n), EXERCISE_CATALOG, {}), base, n);
    assert.deepStrictEqual(findSubstitutions(refFor(n), EXERCISE_CATALOG, { candidateFilter: 'yes' }), base, n);
  });
});

test('4.3.9B: only a strict true admits a candidate', () => {
  const truthy = findSubstitutions(refFor('Push-Up'), EXERCISE_CATALOG, { candidateFilter: () => 1 });
  assert.deepStrictEqual(allNames(truthy), []);
});
