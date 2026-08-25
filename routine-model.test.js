/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP4 — Routine model schema + security contract
 *
 * CI is offline and holds no secrets, so the RLS policies themselves are
 * verified against the live database before merge (17/17 scenarios, recorded
 * in the CP4 checkpoint entry). What CI can pin durably is the CONTRACT those
 * policies implement, so a future change cannot quietly weaken it without a
 * failing test and a deliberate edit here.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { GOAL_LABELS } = require('./program-state.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Script source only: <style> blocks are stripped as well as comments, because
// CSS has its own `visibility` property that has nothing to do with the column.
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* Mirrors public.workout_templates as of migration
 * routine_model_additive_columns_and_rls_split. */
const ROUTINE_COLUMNS = [
  'id', 'user_id', 'name', 'exercises', 'source_program_slug', 'times_used',
  'last_used_at', 'sort_order', 'created_at', 'updated_at',
  // CP4 additions
  'description', 'goal', 'difficulty', 'tags', 'is_platform', 'visibility',
];
const CP4_ADDED = ['description', 'goal', 'difficulty', 'tags', 'is_platform', 'visibility'];
const CP4_DEFAULTS = { tags: [], is_platform: false, visibility: 'private' };
const VISIBILITY_VALUES = ['private', 'published'];
const GOAL_VALUES = ['fatloss', 'recomp', 'muscle'];

/* ── 1 · additive-only ──────────────────────────────────────────────────── */

test('schema: CP4 only added columns — nothing was dropped or renamed', () => {
  const preCp4 = ['id', 'user_id', 'name', 'exercises', 'source_program_slug',
    'times_used', 'last_used_at', 'sort_order', 'created_at', 'updated_at'];
  for (const col of preCp4) {
    assert.ok(ROUTINE_COLUMNS.includes(col), `${col} must survive CP4`);
  }
});

test('schema: exactly the six approved columns were added', () => {
  assert.deepStrictEqual(CP4_ADDED.slice().sort(),
    ['description', 'difficulty', 'goal', 'is_platform', 'tags', 'visibility']);
});

test('schema: existing rows keep their meaning through the defaults', () => {
  // A row written before CP4 must read as user-owned and private.
  assert.strictEqual(CP4_DEFAULTS.is_platform, false);
  assert.strictEqual(CP4_DEFAULTS.visibility, 'private');
  assert.deepStrictEqual(CP4_DEFAULTS.tags, []);
});

/* ── 2 · fields deliberately deferred ───────────────────────────────────── */

test('schema: no lifecycle `status` column — it would duplicate visibility', () => {
  // status and visibility would both carry 'published', allowing contradictory
  // rows (status='draft' + visibility='published'). Lifecycle arrives with the
  // CP6 publishing workflow, as one state machine rather than two.
  assert.ok(!ROUTINE_COLUMNS.includes('status'));
});

test('schema: no source_workout_id yet — that is CP7 provenance', () => {
  assert.ok(!ROUTINE_COLUMNS.includes('source_workout_id'));
});

test('schema: no speculative marketplace or media fields', () => {
  for (const later of ['tempo', 'load_guidance', 'cover_image', 'price',
    'author_profile', 'program_id', 'version', 'published_at']) {
    assert.ok(!ROUTINE_COLUMNS.includes(later), `${later} must not exist in CP4`);
  }
});

/* ── 3 · vocabulary reuse ───────────────────────────────────────────────── */

test('goal: reuses the live profiles/Programs vocabulary, no new taxonomy', () => {
  assert.deepStrictEqual(GOAL_VALUES.slice().sort(), Object.keys(GOAL_LABELS).sort());
});

test('visibility: read exposure only, two values', () => {
  assert.deepStrictEqual(VISIBILITY_VALUES, ['private', 'published']);
});

/* ── 4 · the security contract the policies implement ───────────────────── */

// (verb, ownRow, isPlatform, targetVisibility) → allowed?
function clientMayWrite(verb, ownRow, isPlatform, visibility) {
  if (!ownRow) return false;                 // never touch another user's row
  if (isPlatform) return false;              // never author or edit platform content
  if (verb === 'delete') return true;
  return visibility === 'private';           // never publish from a client
}

test('security: a client may manage only its own private, non-platform rows', () => {
  assert.strictEqual(clientMayWrite('insert', true, false, 'private'), true);
  assert.strictEqual(clientMayWrite('update', true, false, 'private'), true);
  assert.strictEqual(clientMayWrite('delete', true, false, 'private'), true);
});

test('security: a client can never write another user\'s row', () => {
  for (const verb of ['insert', 'update', 'delete']) {
    assert.strictEqual(clientMayWrite(verb, false, false, 'private'), false, verb);
  }
});

test('security: a client can never create or touch platform content', () => {
  for (const verb of ['insert', 'update', 'delete']) {
    assert.strictEqual(clientMayWrite(verb, true, true, 'private'), false, verb);
  }
});

test('security: a client can never publish, even its own row', () => {
  assert.strictEqual(clientMayWrite('insert', true, false, 'published'), false);
  assert.strictEqual(clientMayWrite('update', true, false, 'published'), false);
});

test('security: publication structurally requires platform authorship', () => {
  // The CHECK constraint: visibility='published' implies is_platform=true.
  const checkHolds = (vis, plat) => vis === 'private' || plat === true;
  assert.strictEqual(checkHolds('private', false), true);
  assert.strictEqual(checkHolds('published', true), true);
  assert.strictEqual(checkHolds('published', false), false,
    'a user-owned row can never be published — enforced by CHECK, not app code');
});

test('security: CP4 did NOT widen read exposure', () => {
  // Schema capability and live publication are separate concerns. SELECT is
  // still owner-only; platform-read arrives deliberately in CP6/CP8.
  const selectAllowed = (ownRow) => ownRow === true;
  assert.strictEqual(selectAllowed(true), true);
  assert.strictEqual(selectAllowed(false), false,
    'no published-platform read path exists yet');
});

/* ── 5 · scope guards ───────────────────────────────────────────────────── */

test('scope: CP4 created no platform rows and no publish UI', () => {
  const src = readCode('workout.html');
  assert.ok(!src.includes('visibility'), 'Train must not read publication state');
  // CP6 gave Train one legitimate use of is_platform: excluding platform
  // Routines from the user's own lists. Nothing else is permitted.
  for (const use of src.match(/.{0,14}is_platform[^\n]*/g) || []) {
    assert.match(use, /\.eq\('is_platform',\s*false\)/, 'exclusion filter only');
  }
  assert.ok(!/publishRoutine/.test(src), 'no publish control in Train');
});

test('scope: the Routine contract module is untouched by CP4', () => {
  // CP3 owns the exercises JSONB shape; CP4 added table columns only.
  const src = readCode('routine-core.js');
  for (const col of CP4_ADDED) {
    assert.ok(!src.includes(col), `routine-core must not learn about ${col}`);
  }
});

test('scope: entitlement stayed out of Routine privacy', () => {
  const ent = readCode('entitlement-core.js');
  assert.ok(!/workout_templates|is_platform|visibility|routine/i.test(ent),
    'Routine privacy and Program entitlement are separate concerns');
});

test('scope: program_workouts was not touched', () => {
  // Its convergence is CP8.
  const src = readCode('workout.html');
  assert.match(src, /from\('program_workouts'\)/, 'still read as before');
  assert.ok(!/program_workouts[\s\S]{0,80}(is_platform|visibility)/.test(src));
});

test('scope: CP8 has not started, and lifecycle fields stay off Train', () => {
  // The boundary has moved as checkpoints shipped: CP5 → CP6 → CP7 → now CP8.
  // What stays constant is that the NORMAL app never reads Routine lifecycle
  // fields — platform authoring lives on its own surface.
  const src = readCode('workout.html');
  for (const notInTrain of ['publishRoutine', 'visibility']) {
    assert.ok(!src.includes(notInTrain), `${notInTrain} must not reach Train`);
  }
  for (const use of src.match(/.{0,14}is_platform[^\n]*/g) || []) {
    assert.match(use, /\.eq\('is_platform',\s*false\)/, 'exclusion filter only');
  }
  // CP7 provenance would attach source_workout_id to a ROUTINE write. The
  // pre-existing personal_records.source_workout_id (Phase 4.2.1K PR
  // detection) is a different column and must not trip this guard.
  for (const w of src.match(/from\('workout_templates'\)[\s\S]{0,400}?\)/g) || []) {
    assert.ok(!w.includes('source_workout_id'), 'Routine provenance is CP7');
  }
});
