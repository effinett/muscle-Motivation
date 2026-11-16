/* Bodyweight Exercise Progression v1 (roadmap 5.1.2 bodyweight scope; owner
 * decisions 2026-11-16). Locks the rules, the approved paths and the terminal
 * list, and proves no step ever leaves the equipment-free pool. */

const test = require('node:test');
const assert = require('node:assert');
const B = require('./bodyweight-progression.js');
const { EXERCISE_CATALOG } = require('./benchmarks/exercise-fixtures.js');

const S = B.STATUS;
const EX = B.EX;
const at = (reps, n, extra) => Object.assign({ completed: true, sets: Array.from({ length: n }, () => ({ reps, completed: true })) }, extra || {});
const rx = (lo, hi, sets) => ({ reps_low: lo, reps_high: hi, sets: sets || 3 });

/* Bodyweight Foundations' explicit exclusions (CP4d): equipment or a bench. */
const FORBIDDEN = new Set([
  '9d60b74a-91d4-4059-89fa-ac53160ca767', 'b0c178b6-bd81-477d-ae23-2a9aa40d67b4', 'b3661213-09f8-45bf-83fa-72edebca5001',
  '0d298f82-6688-46ab-82e1-2ea3e914fc84', '9daedcaa-e007-488f-8a4d-17957361b10e', 'eecf2677-57d4-4bc1-a0e9-bd3ffe59ab15',
  'd609a511-99d8-46a2-8dad-674b03c7f1ec', '5df17fbb-fe7e-4a33-bc4b-a8be97e3d9e5', 'd06aa93c-276f-4b9e-ad8f-3477c96f4f4e',
  'c6b852dd-8773-4417-9244-b51989a308b1', 'd75c33fa-5435-47f5-93fc-e796ad22322e', '8a56a474-29e1-47b1-a68f-8cb98718223e',
  '39e89b3b-bc0c-4cf3-b78f-dff5fcdc6481', 'db9208d9-0190-40dd-849b-38724ec9e09d',
]);

/* ── catalog integrity ───────────────────────────────────────────────────── */

test('every path and terminal exercise is a canonical, equipment-free catalog exercise', () => {
  const ids = new Set([...B.PATHS.flatMap((p) => [p.from, p.to]), ...B.TERMINAL]);
  for (const id of ids) {
    const ex = EXERCISE_CATALOG.find((x) => x.id === id);
    assert.ok(ex, id + ' is in the catalog');
    assert.equal(ex.equipment, 'Bodyweight', ex.name);
    assert.ok(!FORBIDDEN.has(id), ex.name + ' is not on the equipment-free exclusion list');
  }
  B.PATHS.forEach((p) => assert.equal(EXERCISE_CATALOG.find((x) => x.id === p.to).name, p.toName));
});

test('the approved paths are exactly the owner-approved seven, each with room to progress', () => {
  const name = (id) => EXERCISE_CATALOG.find((x) => x.id === id).name;
  assert.deepStrictEqual(B.PATHS.map((p) => name(p.from) + ' > ' + name(p.to)), [
    'Wall Push-Up > Knee Push-Up', 'Knee Push-Up > Push-Up', 'Pike Lean > Pike Push-Up',
    'Bodyweight Squat > Split Squat', 'Glute Bridge > Single-Leg Glute Bridge',
    'Reverse Crunch > Lying Leg Raise', 'Crunches > Sit-Up',
  ]);
  B.PATHS.forEach((p) => assert.ok(p.reps_low < p.reps_high, name(p.to) + ' range'));
});

test('the nine owner-reviewed exercises are terminal, and no exercise is both on a path and terminal', () => {
  [EX.PUSH_UP, EX.SPLIT_SQUAT, EX.SL_GLUTE_BRIDGE, EX.DEAD_BUG, EX.BIRD_DOG, EX.SUPERMAN, EX.PLANK, EX.SIDE_PLANK, EX.WALL_SIT]
    .forEach((id) => assert.ok(B.isTerminal(id), id));
  B.TERMINAL.forEach((id) => assert.equal(B.pathFrom(id), null, id + ' has no next step'));
});

test('mobility, cardio and equipment exercises are not eligible', () => {
  ['6d50c3a6-0dde-46e4-bc3a-508c2f358803', /* High Knees */ 'ed45d50d-5411-4e47-8309-97314b94adfb', /* Mountain Climber */
   'ead731d6-bfdd-4119-bd0b-bb3092457e69', /* Cat-Cow */ 'b691b1f7-73a0-415a-854d-41941bdfb5de' /* Bench Press */]
    .forEach((id) => assert.equal(B.decide({ exerciseId: id, prescription: rx(8, 12), history: [at(12, 3), at(12, 3)] }).status, S.NOT_ELIGIBLE));
});

/* ── the decision rules ──────────────────────────────────────────────────── */

test('two consecutive sessions at the top on every set → offer the next step with its range', () => {
  const d = B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: [at(12, 3), at(12, 3)] });
  assert.equal(d.status, S.STEP_UP);
  assert.equal(d.ceiling, 12);
  assert.deepStrictEqual(d.next, { exerciseId: EX.PUSH_UP, name: 'Push-Up', reps_low: 6, reps_high: 12, unit: 'reps' });
});

test('one session at the top → one more; a set below the top → building', () => {
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: [at(12, 3), at(10, 3)] }).status, S.ONE_MORE);
  const mixed = { completed: true, sets: [{ reps: 12 }, { reps: 12 }, { reps: 11 }] };
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: [mixed, at(12, 3)] }).status, S.BUILDING);
});

test('the streak must be consecutive and from the newest session', () => {
  const d = B.decide({ exerciseId: EX.GLUTE_BRIDGE, prescription: rx(12, 15), history: [at(15, 3), at(13, 3), at(15, 3)] });
  assert.equal(d.status, S.ONE_MORE);
  assert.equal(d.streak, 1);
});

test('fewer sets than prescribed, an incomplete session, or only warm-ups never count', () => {
  const two = at(12, 2);
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12, 3), history: [two, two] }).status, S.BUILDING);
  const abandoned = at(12, 3, { completed: false });
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: [abandoned, at(12, 3)] }).status, S.BUILDING);
  const warm = { completed: true, sets: [{ reps: 12, is_warmup: true }, { reps: 12 }, { reps: 12 }, { reps: 12 }] };
  assert.ok(B.sessionAtCeiling(warm, 12, 3));
  const onlyWarm = { completed: true, sets: [{ reps: 12, is_warmup: true }] };
  assert.ok(!B.sessionAtCeiling(onlyWarm, 12, 1));
});

test('exceeding the top still counts as at the ceiling', () => {
  assert.equal(B.decide({ exerciseId: EX.WALL_PUSH_UP, prescription: rx(10, 15), history: [at(18, 3), at(16, 3)] }).status, S.STEP_UP);
});

test('a terminal exercise at the top twice is marked terminal and offered nothing', () => {
  const d = B.decide({ exerciseId: EX.DEAD_BUG, prescription: rx(8, 12), history: [at(12, 3), at(12, 3)] });
  assert.equal(d.status, S.TERMINAL);
  assert.equal(d.next, null);
  assert.equal(d.ceiling, 12, 'the ceiling stays the prescribed top — it never rises');
});

test('timed exercises use seconds against the top of the range (Pike Lean → Pike Push-Up)', () => {
  const d = B.decide({ exerciseId: EX.PIKE_LEAN, prescription: rx(15, 30), history: [at(30, 3), at(32, 3)] });
  assert.equal(d.status, S.STEP_UP);
  assert.equal(d.next.name, 'Pike Push-Up');
  assert.deepStrictEqual([d.next.reps_low, d.next.reps_high, d.next.unit], [6, 10, 'reps']);
});

test('after "Not yet", only sessions after the decline count toward a new offer', () => {
  const h = [at(12, 3, { date: '2026-11-20' }), at(12, 3, { date: '2026-11-18' }), at(12, 3, { date: '2026-11-16' })];
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: h, declinedAt: '2026-11-19' }).status, S.ONE_MORE);
  assert.equal(B.decide({ exerciseId: EX.KNEE_PUSH_UP, prescription: rx(8, 12), history: h, declinedAt: '2026-11-17' }).status, S.STEP_UP);
});

test('a fixed prescription has no room to progress and is left alone', () => {
  assert.equal(B.decide({ exerciseId: EX.DEAD_BUG, prescription: rx(10, 10), history: [at(10, 3), at(10, 3)] }).status, S.NOT_ELIGIBLE);
});

test('no history, missing input, or an unknown exercise never throws', () => {
  assert.equal(B.decide({ exerciseId: EX.PUSH_UP, prescription: rx(6, 12) }).status, S.BUILDING);
  assert.equal(B.decide().status, S.NOT_ELIGIBLE);
  assert.equal(B.decide({ exerciseId: 'nope', prescription: rx(8, 12) }).status, S.NOT_ELIGIBLE);
});

/* ── applying accepted steps to a session ────────────────────────────────── */

const ROUTINE = [
  { name: 'Wall Push-Up', exercise_id: EX.WALL_PUSH_UP, sets: 3, reps_low: 10, reps_high: 15, rest_sec: 60, notes: 'Ready for more? Use Swap…' },
  { name: 'Dead Bug', exercise_id: EX.DEAD_BUG, sets: 3, reps_low: 8, reps_high: 12, rest_sec: 45, notes: 'Reps are per side.' },
];

test('an accepted step replaces the slot, keeps sets and rest, uses the step range, and never mutates the Routine', () => {
  const before = JSON.stringify(ROUTINE);
  const out = B.applySteps(ROUTINE, [{ from_exercise_id: EX.WALL_PUSH_UP, to_exercise_id: EX.KNEE_PUSH_UP, state: 'accepted' }]);
  assert.equal(JSON.stringify(ROUTINE), before, 'source Routine untouched');
  assert.deepStrictEqual(
    [out[0].name, out[0].exercise_id, out[0].sets, out[0].rest_sec, out[0].reps_low, out[0].reps_high, out[0].stepped_from],
    ['Knee Push-Up', EX.KNEE_PUSH_UP, 3, 60, 8, 12, 'Wall Push-Up']);
  assert.deepStrictEqual(out[1], ROUTINE[1], 'other slots unchanged');
});

test('accepted steps chain (Wall → Knee → Push-Up); a later revert stops the chain', () => {
  const steps = [
    { from_exercise_id: EX.WALL_PUSH_UP, to_exercise_id: EX.KNEE_PUSH_UP, state: 'accepted' },
    { from_exercise_id: EX.KNEE_PUSH_UP, to_exercise_id: EX.PUSH_UP, state: 'accepted' },
  ];
  assert.equal(B.applySteps(ROUTINE, steps)[0].name, 'Push-Up');
  assert.equal(B.applySteps(ROUTINE, steps)[0].stepped_from, 'Wall Push-Up');
  const reverted = steps.concat([{ from_exercise_id: EX.KNEE_PUSH_UP, to_exercise_id: EX.PUSH_UP, state: 'reverted' }]);
  assert.equal(B.applySteps(ROUTINE, reverted)[0].name, 'Knee Push-Up');
});

test('declined steps and steps off the approved paths are ignored', () => {
  assert.equal(B.applySteps(ROUTINE, [{ from_exercise_id: EX.WALL_PUSH_UP, to_exercise_id: EX.KNEE_PUSH_UP, state: 'declined' }])[0].name, 'Wall Push-Up');
  assert.equal(B.applySteps(ROUTINE, [{ from_exercise_id: EX.WALL_PUSH_UP, to_exercise_id: EX.PUSH_UP, state: 'accepted' }])[0].name, 'Wall Push-Up');
  assert.equal(B.applySteps(ROUTINE, [{ from_exercise_id: EX.DEAD_BUG, to_exercise_id: EX.PLANK, state: 'accepted' }])[1].name, 'Dead Bug');
});
