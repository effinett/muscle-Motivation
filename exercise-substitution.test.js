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
  assert.ok(withAny >= 130, 'coverage dropped to ' + withAny + '/141');
  // These five are genuinely alone in their (muscle × tracking) cell. Returning
  // nothing is the CORRECT answer — the alternative is suggesting something wrong.
  assert.deepStrictEqual(zero.sort(), [
    'Farmer Carry', 'Hip Adduction', 'Incline Treadmill Walk', 'Treadmill Run', 'Wall Sit'
  ]);
});
