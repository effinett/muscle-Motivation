/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP3 — shared Routine contract
 *
 * LIVE_SHAPES below mirrors the 40 DISTINCT prescription shapes present across
 * all 512 live entries (187 workout_templates + 325 program_workouts), as
 * measured read-only before the extraction. Normalization is per-entry and
 * depends only on these fields, so covering every distinct shape covers every
 * row. Names are anonymized — the normalizer only trims a name and checks it is
 * non-empty, so the literal string is irrelevant to the contract and there is
 * no reason to carry user content into the repo.
 *
 * The real-data run against the actual entries was performed before merge and
 * is reported in the CP3 checkpoint record.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  RT_DEFAULTS, RT_VALID, RT_LEGACY_IDENTITY, RT_INVALID,
  rtNormalizeExercise, rtNormalizeExercises,
  rtValidateExercise, rtValidateExercises,
  rtSameExercise, rtSameExercises,
} = require('./routine-core.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const UUID_A = 'b691b1f7-73a0-415a-854d-41941bdfb5de';
const UUID_B = 'd2812c92-d4c6-420c-b2d9-d2c5757871c9';

/* [sets, reps_low, reps_high, rest_sec, hasNotes, idState]
 * idState: 'absent' | 'null' | 'string' — the three identity states actually
 * present in production (325 program entries omit the key entirely, 65 template
 * entries store null, 105 store a uuid, 17 template entries omit it). */
const SIGNATURES = [
  [2, 10, 15, 60, false, 'absent'], [2, 12, 20, 60, false, 'absent'],
  [3, 6, 10, 90, false, 'absent'], [3, 6, 10, 120, false, 'absent'],
  [3, 8, 12, 60, false, 'absent'], [3, 8, 12, 90, false, 'absent'],
  [3, 8, 12, 120, false, 'absent'], [3, 10, 15, 60, false, 'absent'],
  [3, 12, 15, 60, false, 'absent'], [3, 12, 20, 60, false, 'absent'],
  [3, 15, 20, 60, false, 'absent'], [3, 30, 60, 60, false, 'absent'],
  [4, 5, 10, 120, false, 'absent'], [4, 5, 10, 150, false, 'absent'],
  [4, 5, 10, 180, false, 'absent'], [4, 6, 10, 120, false, 'absent'],
  [4, 6, 10, 150, false, 'absent'], [4, 8, 12, 90, false, 'absent'],
  [4, 12, 20, 60, false, 'absent'],
  [4, 5, 10, 180, true, 'absent'], [4, 6, 10, 120, true, 'absent'],
  [4, 6, 10, 150, true, 'absent'], [4, 6, 12, 120, true, 'absent'],
  [4, 12, 20, 60, true, 'absent'], [3, 6, 10, 90, true, 'absent'],
  [3, 8, 10, 120, true, 'absent'], [3, 8, 12, 90, true, 'absent'],
  [3, 10, 12, 90, true, 'absent'], [3, 10, 15, 60, true, 'absent'],
  [3, 10, 15, 90, true, 'absent'], [3, 12, 15, 60, true, 'absent'],
  [3, 12, 20, 60, true, 'absent'], [3, 15, 20, 60, true, 'absent'],
  [3, 30, 40, 60, true, 'absent'], [3, 30, 60, 60, true, 'absent'],
  [2, 8, 12, 90, true, 'absent'],
  [3, 8, 12, 90, false, 'null'], [3, 8, 12, 90, false, 'string'],
  [3, 8, 12, 90, true, 'string'], [3, 12, 20, 90, true, 'string'],
];

function shapeToEntry(sig, i) {
  const [sets, lo, hi, rest, hasNotes, idState] = sig;
  const e = {
    name: 'Exercise ' + (i + 1),
    sets, notes: hasNotes ? 'Coaching cue for this movement.' : '',
    reps_low: lo, rest_sec: rest, reps_high: hi,
  };
  if (idState === 'null') e.exercise_id = null;
  if (idState === 'string') e.exercise_id = (i % 2 ? UUID_A : UUID_B);
  return e;
}

const LIVE_SHAPES = SIGNATURES.map(shapeToEntry);

/* ── 1 · the canonical contract ─────────────────────────────────────────── */

test('contract: canonical shape has exactly the seven prescription fields', () => {
  const out = rtNormalizeExercise({ name: 'Bench Press' });
  assert.deepStrictEqual(Object.keys(out),
    ['name', 'sets', 'reps_low', 'reps_high', 'notes', 'rest_sec', 'exercise_id'],
    'key order matches what saveTemplate has always written');
});

test('contract: CP3 added no Routine metadata fields', () => {
  // description, goal, difficulty, tags, visibility, tempo, load guidance,
  // versioning and Program relationships all belong to CP4 and later.
  const out = rtNormalizeExercise({ name: 'X' });
  for (const later of ['description', 'goal', 'difficulty', 'tags', 'visibility',
    'tempo', 'load', 'version', 'status', 'author', 'program_slug']) {
    assert.ok(!Object.hasOwn(out, later), `${later} must not appear in CP3`);
  }
});

test('defaults: exactly the values that already existed in production', () => {
  assert.deepStrictEqual(RT_DEFAULTS, { sets: 3, repsLow: 8, repsHigh: 12, restSec: 90 });
  const out = rtNormalizeExercise({ name: 'X' });
  assert.strictEqual(out.sets, 3);        // TEMPLATE_DEFAULT_SETS
  assert.strictEqual(out.reps_low, 8);    // saveTemplate isNaN fallback
  assert.strictEqual(out.reps_high, 12);  // saveTemplate isNaN fallback
  assert.strictEqual(out.rest_sec, 90);   // saveTemplate `ex.rest_sec || 90`
  assert.strictEqual(out.notes, '');
});

/* ── 2 · value handling, matching the retired saveTemplate logic ────────── */

test('reps: reps_high below reps_low is raised to reps_low', () => {
  const out = rtNormalizeExercise({ name: 'X', reps_low: 12, reps_high: 5 });
  assert.strictEqual(out.reps_low, 12);
  assert.strictEqual(out.reps_high, 12);
});

test('sets: below one falls back to the default, as before', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: 0 }).sets, 3);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: -4 }).sets, 3);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: 1 }).sets, 1);
});

test('numbers: strings parse, junk falls back — parseInt semantics preserved', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: '4' }).sets, 4);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: 'abc' }).sets, 3);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', reps_low: '6' }).reps_low, 6);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', sets: 3.9 }).sets, 3, 'truncates');
});

test('rest: zero falls through to the default, matching `ex.rest_sec || 90`', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', rest_sec: 0 }).rest_sec, 90);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', rest_sec: 45 }).rest_sec, 45);
});

test('notes: trimmed; non-strings become empty', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', notes: '  hi  ' }).notes, 'hi');
  assert.strictEqual(rtNormalizeExercise({ name: 'X', notes: null }).notes, '');
  assert.strictEqual(rtNormalizeExercise({ name: 'X', notes: 42 }).notes, '');
});

test('name: trimmed, and a nameless entry is unusable', () => {
  assert.strictEqual(rtNormalizeExercise({ name: '  Squat ' }).name, 'Squat');
  for (const bad of [{}, { name: '' }, { name: '   ' }, { name: null }, { name: 7 }]) {
    assert.strictEqual(rtNormalizeExercise(bad), null);
  }
  assert.strictEqual(rtNormalizeExercise(null), null);
  assert.strictEqual(rtNormalizeExercise('Squat'), null);
});

/* ── 3 · identity is preserved, never repaired ──────────────────────────── */

test('identity: a canonical id is carried through untouched', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', exercise_id: UUID_A }).exercise_id, UUID_A);
});

test('identity: name-only stays name-only — no guessing', () => {
  // program_workouts is entirely name-keyed (all 325 entries). Inventing ids
  // here would silently "fix" protected identity debt.
  for (const input of [{ name: 'Bench Press' }, { name: 'Bench Press', exercise_id: null },
    { name: 'Bench Press', exercise_id: '' }]) {
    assert.strictEqual(rtNormalizeExercise(input).exercise_id, null);
  }
});

test('identity: the core performs no lookup of any kind', () => {
  const src = readCode('routine-core.js');
  for (const b of ['libraryExerciseId', 'normalizeExerciseName',
    'ExerciseIntelligence', 'exerciseLibrary']) {
    assert.ok(!src.includes(b), `routine-core must not resolve identity (${b})`);
  }
});

test('identity: a non-string id is treated as absent, not coerced', () => {
  assert.strictEqual(rtNormalizeExercise({ name: 'X', exercise_id: 42 }).exercise_id, null);
  assert.strictEqual(rtNormalizeExercise({ name: 'X', exercise_id: {} }).exercise_id, null);
});

/* ── 4 · arrays ─────────────────────────────────────────────────────────── */

test('array: order is preserved exactly', () => {
  const list = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
  assert.deepStrictEqual(rtNormalizeExercises(list).map((e) => e.name),
    ['A', 'B', 'C', 'D']);
});

test('array: an unusable entry is dropped, the rest survive', () => {
  const out = rtNormalizeExercises([{ name: 'A' }, { name: '' }, null, 7, { name: 'B' }]);
  assert.deepStrictEqual(out.map((e) => e.name), ['A', 'B'],
    'one malformed element must not cost the user the whole routine');
});

test('array: non-arrays and empties are safe', () => {
  for (const bad of [null, undefined, 'x', 42, {}]) {
    assert.deepStrictEqual(rtNormalizeExercises(bad), []);
  }
});

test('array: inputs are never mutated', () => {
  const list = [{ name: '  A  ', sets: 0 }, { name: 'B', exercise_id: UUID_A }];
  const before = JSON.stringify(list);
  rtNormalizeExercises(list);
  assert.strictEqual(JSON.stringify(list), before);
});

test('array: output shares no reference with the input', () => {
  const list = [{ name: 'A', notes: 'n' }];
  const out = rtNormalizeExercises(list);
  out[0].notes = 'changed';
  assert.strictEqual(list[0].notes, 'n', 'duplicate-template copy must be deep');
});

/* ── 5 · validation ─────────────────────────────────────────────────────── */

test('validate: three narrow states', () => {
  assert.strictEqual(rtValidateExercise({ name: 'X', exercise_id: UUID_A }).status, RT_VALID);
  assert.strictEqual(rtValidateExercise({ name: 'X' }).status, RT_LEGACY_IDENTITY);
  assert.strictEqual(rtValidateExercise({ name: '' }).status, RT_INVALID);
});

test('validate: a routine takes the status of its weakest entry', () => {
  const allCanon = [{ name: 'A', exercise_id: UUID_A }, { name: 'B', exercise_id: UUID_B }];
  assert.strictEqual(rtValidateExercises(allCanon).status, RT_VALID);

  const oneLegacy = [{ name: 'A', exercise_id: UUID_A }, { name: 'B' }];
  assert.strictEqual(rtValidateExercises(oneLegacy).status, RT_LEGACY_IDENTITY);

  const oneBad = [{ name: 'A', exercise_id: UUID_A }, { name: '' }];
  assert.strictEqual(rtValidateExercises(oneBad).status, RT_INVALID);

  assert.strictEqual(rtValidateExercises([]).status, RT_INVALID);
  assert.strictEqual(rtValidateExercises(null).status, RT_INVALID);
});

test('validate: an all-name-only Program routine is legacy, not invalid', () => {
  // Every program_workouts row looks like this. It must stay usable.
  const programLike = [{ name: 'Bench Press', sets: 4, reps_low: 6, reps_high: 10, rest_sec: 150 }];
  const r = rtValidateExercises(programLike);
  assert.strictEqual(r.status, RT_LEGACY_IDENTITY);
  assert.ok(r.issues.includes('legacy_identity_present'));
});

test('validate: stays narrow — no publish or candidacy vocabulary', () => {
  const src = readCode('routine-core.js');
  for (const later of ['publish', 'draft', 'candidate', 'eligib']) {
    assert.ok(!new RegExp(later, 'i').test(src),
      `${later} belongs to CP6/CP7, not the CP3 contract`);
  }
});

/* ── 6 · the round-trip gate, over every live shape ─────────────────────── */

test('gate: every live shape round-trips with zero semantic drift', () => {
  for (const input of LIVE_SHAPES) {
    assert.ok(rtSameExercise(input, rtNormalizeExercise(input)),
      'semantic drift on ' + JSON.stringify(input));
  }
});

test('gate: no live shape has any VALUE changed by normalization', () => {
  // All 512 live entries were measured to already satisfy every normalizer
  // invariant, so the only permitted difference is materializing the
  // exercise_id key. Any other change would be a data-rewriting migration.
  for (const input of LIVE_SHAPES) {
    const out = rtNormalizeExercise(input);
    for (const k of Object.keys(input)) {
      assert.strictEqual(out[k], input[k], `value drift on ${k}`);
    }
    const added = Object.keys(out).filter((k) => !Object.hasOwn(input, k));
    assert.ok(added.every((k) => k === 'exercise_id' && out[k] === null),
      'the only added key may be exercise_id:null, got ' + added.join(','));
  }
});

test('gate: normalization is idempotent', () => {
  for (const input of LIVE_SHAPES) {
    const once = rtNormalizeExercise(input);
    assert.deepStrictEqual(rtNormalizeExercise(once), once);
  }
});

test('gate: an absent exercise_id and an explicit null are semantically equal', () => {
  // Which is exactly how every consumer reads it (`ex.exercise_id != null`).
  assert.ok(rtSameExercise({ name: 'X' }, { name: 'X', exercise_id: null }));
  assert.ok(rtSameExercises([{ name: 'X' }], [{ name: 'X', exercise_id: null }]));
});

test('gate: a whole routine round-trips', () => {
  assert.ok(rtSameExercises(LIVE_SHAPES, rtNormalizeExercises(LIVE_SHAPES)));
  assert.strictEqual(rtNormalizeExercises(LIVE_SHAPES).length, LIVE_SHAPES.length);
});

test('gate: equality is order-sensitive and length-sensitive', () => {
  assert.ok(!rtSameExercises([{ name: 'A' }, { name: 'B' }], [{ name: 'B' }, { name: 'A' }]));
  assert.ok(!rtSameExercises([{ name: 'A' }], [{ name: 'A' }, { name: 'B' }]));
});

/* ── 7 · consumers and purity ───────────────────────────────────────────── */

test('consumers: the template write paths use the shared contract', () => {
  const src = readCode('workout.html');
  assert.match(src, /rtNormalizeExercises\(/, 'saveTemplate + duplicate');
  assert.match(src, /rtNormalizeExercise\(/, 'addTemplateExercise');
  assert.match(read('workout.html'), /<script src="routine-core\.js"><\/script>/);
});

test('consumers: the retired inline normalization is gone', () => {
  const src = readCode('workout.html');
  assert.ok(!/if \(isNaN\(lo\)\) lo = 8/.test(src), 'inline reps default retired');
  assert.ok(!/if \(isNaN\(hi\)\) hi = 12/.test(src), 'inline reps default retired');
  assert.ok(!/ex\.rest_sec \|\| 90/.test(src), 'inline rest default retired');
  assert.ok(!/JSON\.parse\(JSON\.stringify\(t\.exercises/.test(src),
    'duplicate now normalizes rather than blind-cloning');
});

test('purity: no DOM, fetch, Supabase or storage', () => {
  const src = readCode('routine-core.js');
  for (const banned of ['document', 'window', 'supabaseClient', 'fetch(',
    'sessionStorage', 'localStorage', 'require(']) {
    assert.ok(!src.includes(banned), `routine-core must not reference ${banned}`);
  }
});

test('purity: deterministic', () => {
  const input = { name: ' X ', sets: '0', reps_low: 12, reps_high: 4, notes: ' n ' };
  const first = rtNormalizeExercise(input);
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(rtNormalizeExercise(input), first);
  }
});

/* ── 8 · CP4 scope guard ────────────────────────────────────────────────── */

test('scope: CP3 wrote no migration and no schema change', () => {
  const src = readCode('routine-core.js');
  for (const banned of ['alter table', 'create table', 'insert into', 'update ']) {
    assert.ok(!src.toLowerCase().includes(banned), 'CP3 is schema-free');
  }
});
