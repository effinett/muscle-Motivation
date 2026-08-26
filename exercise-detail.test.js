/* Phase 4.3.6H — exercise-detail.js
 *
 * Covers the §26 data matrix. The load-bearing assertions are the ones proving
 * a custom or legacy reference can NEVER pick up canonical guidance, since that
 * is the failure this module exists to make impossible. */

const test = require('node:test');
const assert = require('node:assert');

const ExerciseDetail = require('./exercise-detail');
const { buildExerciseDetail, needsCatalogFetch, NOTE } = ExerciseDetail;

// A representative production row (shape + values taken from public.exercises).
const BENCH_ID = '11111111-1111-4111-8111-111111111111';
function benchRow(over) {
  return Object.assign({
    id: BENCH_ID,
    name: 'Barbell Bench Press',
    category: 'Horizontal Push',
    equipment: 'Barbell',
    primary_muscle: 'Chest',
    secondary_muscles: ['Triceps', 'Shoulders'],
    movement_pattern: 'horizontal_push',
    force_type: 'push',
    difficulty: 'intermediate',
    tracking_type: 'weight_reps',
    default_unit: 'lb',
    is_bodyweight: false,
    is_unilateral: false,
    instructions: 'Lie back on the bench, unrack the bar over your chest, lower it to mid-chest, then press it back up.',
    tips: 'Keep your shoulder blades pulled together and your feet planted.'
  }, over || {});
}
const benchRef = { name: 'Barbell Bench Press', exerciseId: BENCH_ID, customId: null };

function sectionBody(d, key) {
  const s = d.sections.find((x) => x.key === key);
  return s ? s.body : null;
}
function classValue(d, key) {
  const r = d.classification.find((x) => x.key === key);
  return r ? r.value : null;
}

/* ── 1. canonical exercise, full data → correct sections ─────────────────── */

test('canonical exercise with full data yields classification + both prose sections', () => {
  const d = buildExerciseDetail(benchRef, benchRow());
  assert.strictEqual(d.kind, 'canonical');
  assert.strictEqual(d.available, true);
  assert.strictEqual(d.note, null);
  assert.deepStrictEqual(d.sections.map((s) => s.key), ['instructions', 'tips']);
  assert.strictEqual(classValue(d, 'primary_muscle'), 'Chest');
  assert.strictEqual(classValue(d, 'equipment'), 'Barbell');
  assert.strictEqual(classValue(d, 'difficulty'), 'Intermediate');
});

test('canonical title prefers the catalog name over a stale caller-supplied name', () => {
  const d = buildExerciseDetail(
    { name: 'bench press (old log name)', exerciseId: BENCH_ID },
    benchRow()
  );
  assert.strictEqual(d.title, 'Barbell Bench Press');
});

/* ── 2. missing description fields → omitted cleanly (no empty headings) ──── */

test('absent prose fields are omitted entirely rather than rendered empty', () => {
  const d = buildExerciseDetail(benchRef, benchRow({ instructions: null, tips: '   ' }));
  assert.deepStrictEqual(d.sections, []);
  // Classification still present, so the surface is still worth showing.
  assert.strictEqual(d.available, true);
  assert.strictEqual(d.note, null);
});

test('no section ever carries an empty body', () => {
  for (const over of [{}, { instructions: '' }, { tips: null }, { instructions: '  ', tips: '' }]) {
    const d = buildExerciseDetail(benchRef, benchRow(over));
    d.sections.forEach((s) => {
      assert.ok(s.body && s.body.trim().length > 0, 'section ' + s.key + ' had an empty body');
      assert.ok(s.heading && s.heading.length > 0);
    });
  }
});

test('a canonical row stripped of every optional field reports unavailable, not an empty panel', () => {
  const bare = { id: BENCH_ID, name: 'Barbell Bench Press' };
  const d = buildExerciseDetail(benchRef, bare);
  assert.strictEqual(d.available, false);
  assert.strictEqual(d.note, NOTE.unavailable);
  assert.deepStrictEqual(d.sections, []);
  assert.deepStrictEqual(d.classification, []);
});

/* ── 3 + 4. instructions and cues preserved, and kept DISTINCT ────────────── */

test('instructions and coaching cues are preserved verbatim and never merged', () => {
  const row = benchRow();
  const d = buildExerciseDetail(benchRef, row);
  assert.strictEqual(sectionBody(d, 'instructions'), row.instructions);
  assert.strictEqual(sectionBody(d, 'tips'), row.tips);
  assert.notStrictEqual(sectionBody(d, 'instructions'), sectionBody(d, 'tips'));
  const headings = d.sections.map((s) => s.heading);
  assert.strictEqual(new Set(headings).size, headings.length, 'headings must be distinct');
});

test('cues-only and instructions-only rows each render just their own section', () => {
  const cuesOnly = buildExerciseDetail(benchRef, benchRow({ instructions: null }));
  assert.deepStrictEqual(cuesOnly.sections.map((s) => s.key), ['tips']);

  const instrOnly = buildExerciseDetail(benchRef, benchRow({ tips: null }));
  assert.deepStrictEqual(instrOnly.sections.map((s) => s.key), ['instructions']);
});

/* ── 5 + 6. equipment and muscle data preserved ───────────────────────────── */

test('secondary muscles are listed, de-duplicated, and blank members dropped', () => {
  const d = buildExerciseDetail(
    benchRef,
    benchRow({ secondary_muscles: ['Triceps', '', 'triceps', null, 'Shoulders', '   '] })
  );
  assert.strictEqual(classValue(d, 'secondary_muscles'), 'Triceps, Shoulders');
});

test('an empty secondary-muscle array omits the row instead of showing a blank value', () => {
  for (const v of [[], null, undefined, ['', '  ']]) {
    const d = buildExerciseDetail(benchRef, benchRow({ secondary_muscles: v }));
    assert.strictEqual(classValue(d, 'secondary_muscles'), null);
  }
});

test('movement pattern is shown in words, never as the raw snake_case enum', () => {
  const d = buildExerciseDetail(benchRef, benchRow());
  assert.strictEqual(classValue(d, 'movement_pattern'), 'Horizontal push');
  const all = JSON.stringify(d);
  assert.ok(!all.includes('horizontal_push'), 'raw enum leaked into the detail model');
});

test('every catalog movement pattern maps to a readable label', () => {
  const patterns = ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push',
    'horizontal_pull', 'vertical_pull', 'carry', 'rotation', 'isolation', 'core', 'gait'];
  patterns.forEach((p) => {
    const d = buildExerciseDetail(benchRef, benchRow({ movement_pattern: p }));
    const v = classValue(d, 'movement_pattern');
    assert.ok(v && !v.includes('_'), 'pattern ' + p + ' rendered as ' + v);
  });
});

/* ── 7. custom exercise is NOT treated as canonical ───────────────────────── */

test('a custom exercise gets its own note and no canonical content', () => {
  const d = buildExerciseDetail({ name: 'Effi Special Curl', exerciseId: null, customId: 'c-1' }, null);
  assert.strictEqual(d.kind, 'custom');
  assert.strictEqual(d.available, false);
  assert.strictEqual(d.note, NOTE.custom);
  assert.deepStrictEqual(d.sections, []);
  assert.deepStrictEqual(d.classification, []);
  assert.strictEqual(d.title, 'Effi Special Curl');
});

test('a custom NAMED exactly like a canonical exercise never inherits its guidance', () => {
  // The headline anti-fabrication guarantee: same name, canonical row supplied,
  // but the reference is a custom — no canonical content may surface.
  const d = buildExerciseDetail(
    { name: 'Barbell Bench Press', exerciseId: null, customId: 'c-2' },
    benchRow()
  );
  assert.strictEqual(d.kind, 'custom');
  assert.deepStrictEqual(d.sections, []);
  assert.deepStrictEqual(d.classification, []);
  assert.strictEqual(d.note, NOTE.custom);
});

/* ── 8. legacy exercise is not guessed ────────────────────────────────────── */

test('a legacy name-only reference degrades gracefully without guessing', () => {
  const d = buildExerciseDetail({ name: 'Bench Press', exerciseId: null, customId: null }, null);
  assert.strictEqual(d.kind, 'legacy');
  assert.strictEqual(d.available, false);
  assert.strictEqual(d.note, NOTE.legacy);
  assert.strictEqual(d.title, 'Bench Press');
});

test('a legacy reference never adopts a canonical row even when one is handed to it', () => {
  const d = buildExerciseDetail({ name: 'Barbell Bench Press' }, benchRow());
  assert.strictEqual(d.kind, 'legacy');
  assert.deepStrictEqual(d.sections, []);
  assert.strictEqual(d.note, NOTE.legacy);
});

test('a canonical reference paired with a DIFFERENT exercise row shows no content', () => {
  // Guards against a stale/mismatched fetch landing on the wrong exercise.
  const other = benchRow({ id: '99999999-9999-4999-8999-999999999999', name: 'Leg Press' });
  const d = buildExerciseDetail(benchRef, other);
  assert.strictEqual(d.available, false);
  assert.strictEqual(d.note, NOTE.unavailable);
  assert.deepStrictEqual(d.sections, []);
  assert.strictEqual(d.title, 'Barbell Bench Press', 'must not adopt the other row’s name');
});

/* ── 9. malformed / null metadata handled ─────────────────────────────────── */

test('malformed and null inputs never throw', () => {
  const bad = [
    [null, null],
    [undefined, undefined],
    [{}, {}],
    [benchRef, null],
    [benchRef, undefined],
    [benchRef, {}],
    [{ name: null, exerciseId: BENCH_ID }, benchRow({ name: null })],
    [{ name: 123, exerciseId: BENCH_ID }, benchRow({ primary_muscle: 42, secondary_muscles: 'not-an-array' })],
    [{ name: 'x', exerciseId: BENCH_ID }, benchRow({ instructions: {}, tips: [] })]
  ];
  bad.forEach(([ref, row]) => {
    const d = buildExerciseDetail(ref, row);
    assert.ok(d && typeof d.kind === 'string');
    assert.ok(Array.isArray(d.sections) && Array.isArray(d.classification));
    d.sections.forEach((s) => assert.ok(typeof s.body === 'string' && s.body.length));
    d.classification.forEach((c) => assert.ok(typeof c.value === 'string' && c.value.length));
  });
});

test('a non-array secondary_muscles value is ignored rather than rendered', () => {
  const d = buildExerciseDetail(benchRef, benchRow({ secondary_muscles: 'Triceps' }));
  assert.strictEqual(classValue(d, 'secondary_muscles'), null);
});

test('an invalid reference carrying BOTH ids is never rendered as canonical', () => {
  const d = buildExerciseDetail(
    { name: 'Barbell Bench Press', exerciseId: BENCH_ID, customId: 'c-3' },
    benchRow()
  );
  assert.strictEqual(d.kind, 'invalid');
  assert.strictEqual(d.isCanonicalRef, false);
  assert.deepStrictEqual(d.sections, []);
  assert.strictEqual(d.note, NOTE.legacy);
});

/* ── 10. no raw internal ids or internal taxonomy shown ───────────────────── */

test('internal taxonomy and raw ids never reach the detail model', () => {
  const d = buildExerciseDetail(benchRef, benchRow());
  const serialized = JSON.stringify(d);
  [BENCH_ID, 'weight_reps', 'force_type', 'tracking_type', 'default_unit',
    'is_bodyweight', 'is_unilateral'].forEach((leak) => {
    assert.ok(!serialized.includes(leak), 'leaked internal value: ' + leak);
  });
  // category duplicates movement_pattern and is deliberately not surfaced.
  assert.strictEqual(classValue(d, 'category'), null);
});

/* ── fetch gating (performance contract) ──────────────────────────────────── */

test('only canonical references warrant a catalog fetch', () => {
  assert.strictEqual(needsCatalogFetch(benchRef), true);
  assert.strictEqual(needsCatalogFetch({ name: 'x', customId: 'c-1' }), false);
  assert.strictEqual(needsCatalogFetch({ name: 'x' }), false);
  assert.strictEqual(needsCatalogFetch(null), false);
  assert.strictEqual(needsCatalogFetch({ name: 'x', exerciseId: BENCH_ID, customId: 'c' }), false);
});

/* ── identity classification agrees with the logging core ─────────────────── */

test('identityType matches exercise-log.js (display identity never forks logged identity)', () => {
  const ExerciseLog = require('./exercise-log');
  const refs = [
    { name: 'a', exerciseId: BENCH_ID },
    { name: 'b', customId: 'c-1' },
    { name: 'c' },
    { name: 'd', exerciseId: BENCH_ID, customId: 'c-1' }
  ];
  refs.forEach((r) => {
    assert.strictEqual(ExerciseDetail.identityType(r), ExerciseLog.identityType(r));
  });
});
