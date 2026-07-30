'use strict';
// Phase 4.2.1H — custom-exercise lifecycle. Exercises the pure decision core in
// exercise-custom.js (the exact logic workout.html consumes). Cross-user
// isolation (items 5–7) is enforced by RLS and verified separately with live
// SQL; here a foreign custom is represented by its ABSENCE from the owner's
// context (that is precisely what RLS guarantees the client sees).
const test = require('node:test');
const assert = require('node:assert');
const EC = require('./exercise-custom.js');
const EI = require('./exercise-core.js');

// A tiny canonical set + helper to build context the way workout.html does.
const CANON = ['Back Squat', 'Bench Press', "Farmer's Carry", 'Pull-Up'];
function ctx(customs) {
  return EC.buildLifecycleContext({ canonicalNames: CANON, customs: customs || [] });
}
const active = (id, name) => ({ id, name, archived_at: null });
const archived = (id, name) => ({ id, name, archived_at: '2026-07-29T00:00:00Z' });

test('normalizeCustomName matches the shared exercise-core normalizer (no drift)', () => {
  ['Incline DB Press', "Farmer's Carry", 'PULL  up', 'weird--name'].forEach((n) => {
    assert.strictEqual(EC.normalizeCustomName(n), EI.normalizeExerciseName(n));
  });
});

test('normalization is resistant to case, whitespace and punctuation but keeps meaning', () => {
  const n = EC.normalizeCustomName;
  assert.strictEqual(n('  My   Cool-Exercise '), 'my cool exercise');
  assert.strictEqual(n('MY COOL EXERCISE'), 'my cool exercise');
  assert.strictEqual(n("Farmer's Carry"), 'farmers carry');
  // biomechanical meaning is preserved — incline never collapses to flat
  assert.notStrictEqual(n('Incline Press'), n('Flat Press'));
});

test('cleanDisplayName tidies whitespace without lowercasing or fabricating', () => {
  assert.strictEqual(EC.cleanDisplayName('  Zercher   Squat '), 'Zercher Squat');
  assert.strictEqual(EC.cleanDisplayName(''), '');
  assert.strictEqual(EC.cleanDisplayName(null), '');
});

// 1 · create a brand-new custom
test('create: genuinely new name → create', () => {
  const r = EC.classifyCreateIntent('Zercher Squat', ctx([]));
  assert.strictEqual(r.action, 'create');
  assert.strictEqual(r.display, 'Zercher Squat');
  assert.strictEqual(r.normalized, 'zercher squat');
  assert.strictEqual(r.targetId, null);
});

test('create: blank / whitespace-only → invalid (no row)', () => {
  assert.strictEqual(EC.classifyCreateIntent('   ', ctx([])).action, 'invalid');
  assert.strictEqual(EC.classifyCreateIntent('', ctx([])).action, 'invalid');
  assert.strictEqual(EC.classifyCreateIntent('!!!', ctx([])).action, 'invalid');
});

// 16 · same-name active duplicate → reuse, never a second row
test('create: matches active own custom → reuse-active (dedupe)', () => {
  const r = EC.classifyCreateIntent('zercher   SQUAT', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.action, 'reuse-active');
  assert.strictEqual(r.targetId, 'a1');
});

// 17 · same-name archived → restore, never a duplicate
test('create: matches archived own custom → restore-archived (same id)', () => {
  const r = EC.classifyCreateIntent('Zercher Squat', ctx([archived('a9', 'Zercher Squat')]));
  assert.strictEqual(r.action, 'restore-archived');
  assert.strictEqual(r.targetId, 'a9'); // 15 · original id preserved on restore
});

// 18 · canonical-name collision → use canonical, never corrupt/duplicate
test('create: matches a canonical name → use-canonical (no custom row)', () => {
  const r = EC.classifyCreateIntent('back  squat', ctx([]));
  assert.strictEqual(r.action, 'use-canonical');
  assert.strictEqual(r.targetId, null);
  // apostrophe/punctuation-insensitive canonical match too
  assert.strictEqual(EC.classifyCreateIntent('farmers carry', ctx([])).action, 'use-canonical');
});

// 5–7 · a foreign user's custom is invisible → matching it has no effect
test('create: a foreign custom (absent from owner context) falls through to create', () => {
  // owner sees only their own rows; the foreign "Zercher Squat" is NOT in ctx
  const r = EC.classifyCreateIntent('Zercher Squat', ctx([active('mine', 'Deadlift Variation')]));
  assert.strictEqual(r.action, 'create');
});

test('create precedence: canonical > active > archived', () => {
  // a name that is simultaneously canonical AND an owned custom → canonical wins
  const c = ctx([active('x', 'Back Squat'), archived('y', 'Back Squat')]);
  assert.strictEqual(EC.classifyCreateIntent('Back Squat', c).action, 'use-canonical');
  // active beats archived when not canonical
  const c2 = ctx([active('x', 'Sissy Squat'), archived('y', 'Sissy Squat')]);
  const r2 = EC.classifyCreateIntent('sissy squat', c2);
  assert.strictEqual(r2.action, 'reuse-active');
  assert.strictEqual(r2.targetId, 'x');
});

// 3 · edit name; 2 · stable id (caller keeps id; edit never asks to create)
test('edit: valid rename of own active custom → ok/rename', () => {
  const r = EC.classifyEditIntent('a1', 'Zercher Squat v2', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'rename');
  assert.strictEqual(r.display, 'Zercher Squat v2');
});

test('edit: identical display → noop (nothing to write)', () => {
  const r = EC.classifyEditIntent('a1', 'Zercher Squat', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'noop');
});

test('edit: same identity, tidier casing/spacing → rename (display refresh)', () => {
  const r = EC.classifyEditIntent('a1', 'zercher  squat', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'rename');
  assert.strictEqual(r.display, 'zercher squat');
});

test('edit: blank name → rejected', () => {
  const r = EC.classifyEditIntent('a1', '   ', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Enter an exercise name/);
});

// 4 · canonical exercises are non-editable / not collidable
test('edit: renaming to a canonical name → rejected', () => {
  const r = EC.classifyEditIntent('a1', 'Bench Press', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /built-in/);
});

test('edit: colliding with another active custom → rejected', () => {
  const c = ctx([active('a1', 'Zercher Squat'), active('a2', 'Hack Squat')]);
  const r = EC.classifyEditIntent('a1', 'hack squat', c);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /already have/);
});

test('edit: colliding with an archived custom → rejected (points to restore)', () => {
  const c = ctx([active('a1', 'Zercher Squat'), archived('a2', 'Hack Squat')]);
  const r = EC.classifyEditIntent('a1', 'Hack Squat', c);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /archived/);
});

test('edit: unknown / not-owned / archived target → rejected safely', () => {
  const r = EC.classifyEditIntent('ghost', 'Whatever', ctx([active('a1', 'Zercher Squat')]));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no longer available/);
});

// 13 · archived excluded from picker view; 23 · works with no metadata
test('partitionCustoms: splits active / archived / canonical-shadow', () => {
  const customs = [
    active('a1', 'Zercher Squat'),
    archived('a2', 'Hack Squat'),
    active('a3', 'Bench Press'), // shadows a canonical → inert
  ];
  const p = EC.partitionCustoms(customs, ctx(customs).canonicalSet);
  assert.deepStrictEqual(p.active.map((c) => c.id), ['a1']);
  assert.deepStrictEqual(p.archived.map((c) => c.id), ['a2']);
  assert.deepStrictEqual(p.shadowed.map((c) => c.id), ['a3']);
});

// 14 · restore path is a create-intent classification (covered above); confirm
// an archived-only library yields nothing active for the picker.
test('archived-only custom is not surfaced as active', () => {
  const customs = [archived('a2', 'Hack Squat')];
  const p = EC.partitionCustoms(customs, ctx(customs).canonicalSet);
  assert.strictEqual(p.active.length, 0);
  assert.strictEqual(p.archived.length, 1);
});

// 19 · permanent delete blocked when referenced
test('canPermanentlyDelete: referenced → blocked with count', () => {
  const r = EC.canPermanentlyDelete(3);
  assert.strictEqual(r.allowed, false);
  assert.match(r.message, /3 logged workouts/);
  const one = EC.canPermanentlyDelete(1);
  assert.match(one.message, /1 logged workout\b/);
});

// 20 · safe permanent delete when genuinely unreferenced
test('canPermanentlyDelete: unreferenced → allowed', () => {
  assert.strictEqual(EC.canPermanentlyDelete(0).allowed, true);
  assert.strictEqual(EC.canPermanentlyDelete(undefined).allowed, true);
});

// 23 · lifecycle never depends on canonical taxonomy metadata
test('lifecycle decisions require no canonical metadata on customs', () => {
  const bare = [{ id: 'a1', name: 'Homemade Sled Drag', archived_at: null }];
  const c = ctx(bare);
  assert.strictEqual(EC.classifyCreateIntent('Homemade Sled Drag', c).action, 'reuse-active');
  assert.strictEqual(EC.classifyEditIntent('a1', 'Sled Drag Heavy', c).ok, true);
});

// 10/22 · identity stability: normalization is a pure, stable function so a
// snapshot logged under a name always re-normalizes to the same identity.
test('normalization is stable/idempotent (history & reopen identity hold)', () => {
  const once = EC.normalizeCustomName('Homemade  Sled-Drag');
  const twice = EC.normalizeCustomName(EC.cleanDisplayName('Homemade  Sled-Drag'));
  assert.strictEqual(once, twice);
});
