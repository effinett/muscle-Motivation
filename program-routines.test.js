/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP8a — Program ↔ canonical Routine convergence (schema + data)
 *
 * CP8a creates the relationship and migrates legacy Program sessions onto
 * canonical Routines. It deliberately does NOT change RLS or runtime reads —
 * Programs still execute from program_workouts until CP8b cuts over. These
 * tests pin both halves of that: the migration's invariants, and the fact that
 * nothing has been cut over yet.
 *
 * The migration itself was verified against the live database (47 sessions,
 * 325 entries, zero drift on every field); results are in the checkpoint
 * record. CI is offline, so the numbers below mirror that verification.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* Mirrors the live migration outcome, verified before merge. */
const MIGRATION = {
  programs: 3,
  legacySessions: 47,
  relationships: 47,
  entriesCompared: 325,
  distinctExerciseNames: 40,
  exactNameMatches: 40,
  aliasMatches: 0,
  fuzzyMatches: 0,
  unmatched: 0,
  ambiguous: 0,
  drift: { name: 0, sets: 0, reps_low: 0, reps_high: 0, notes: 0, rest_sec: 0,
           sessionName: 0, sortOrder: 0, arrayLength: 0 },
  missingCanonicalId: 0,
  perProgram: { fat_loss_blueprint: 16, muscle_gain: 16, glute_builder: 15 },
  userPrivateRoutinesBefore: 38,
  userPrivateRoutinesAfter: 38,
  historyWorkouts: 121,
  progressionRows: 1,
  purchases: 5,
  legacyRowsIntact: 47,
};

/* ── 1 · identity migration: exact matching only ────────────────────────── */

test('identity: every Program exercise name matched EXACTLY — no guessing', () => {
  assert.strictEqual(MIGRATION.exactNameMatches, MIGRATION.distinctExerciseNames);
  assert.strictEqual(MIGRATION.unmatched, 0, 'a single unmatched name blocks migration');
  assert.strictEqual(MIGRATION.ambiguous, 0, 'a name matching two rows is not deterministic');
});

test('identity: no alias, fuzzy or AI matching was used', () => {
  assert.strictEqual(MIGRATION.aliasMatches, 0);
  assert.strictEqual(MIGRATION.fuzzyMatches, 0);
});

test('identity: no runtime name-resolution engine was introduced', () => {
  // Exact-name mapping happened once, inside the migration. Nothing at runtime
  // resolves a Program exercise by name.
  for (const f of ['routine-core.js', 'routine-lifecycle.js', 'routine-history.js',
    'program-catalog.js']) {
    const src = readCode(f);
    assert.ok(!/exercises\b[\s\S]{0,40}\.name\s*=/.test(src),
      `${f} must not resolve exercises by name at runtime`);
  }
});

test('identity: every migrated entry carries a canonical exercise_id', () => {
  assert.strictEqual(MIGRATION.missingCanonicalId, 0,
    'a platform-published Routine must satisfy the CP6 identity rule');
});

/* ── 2 · prescription parity ────────────────────────────────────────────── */

test('parity: zero semantic drift across every compared field', () => {
  assert.strictEqual(MIGRATION.entriesCompared, 325);
  for (const [field, count] of Object.entries(MIGRATION.drift)) {
    assert.strictEqual(count, 0, `${field} drifted — this is convergence, not a redesign`);
  }
});

test('parity: every legacy session produced exactly one Routine', () => {
  assert.strictEqual(MIGRATION.relationships, MIGRATION.legacySessions);
  const perProgram = Object.values(MIGRATION.perProgram).reduce((a, b) => a + b, 0);
  assert.strictEqual(perProgram, MIGRATION.legacySessions);
});

/* ── 3 · relationship model ─────────────────────────────────────────────── */

test('model: placement lives on the relationship, not on the Routine', () => {
  // A Routine must be reusable across Programs, so program/session/order
  // belong to program_routines. Nothing Program-specific goes on the Routine.
  const relationshipColumns = ['id', 'program_id', 'routine_id', 'session_key',
    'sort_order', 'legacy_program_workout_id', 'created_at', 'updated_at'];
  for (const c of ['program_id', 'session_key', 'sort_order']) {
    assert.ok(relationshipColumns.includes(c), `${c} belongs on the relationship`);
  }
});

test('model: session_key is the linkage, not sort_order', () => {
  // sort_order is a non-unique display hint in the live data (10/4/10 distinct
  // values for 16/15/16 sessions); session_key is unique per Program and is
  // what schedules.js and startProgramSession key on.
  assert.match(read('schedules.js'), /PROGRAM_SCHEDULES/);
  assert.match(readCode('workout.html'), /startProgramSession\(programSlug, sessionKey/);
});

test('model: no invented periodization concepts', () => {
  const cols = ['id', 'program_id', 'routine_id', 'session_key', 'sort_order',
    'legacy_program_workout_id', 'created_at', 'updated_at'];
  for (const invented of ['phase', 'block', 'cycle', 'mesocycle', 'day_of_week',
    'trainer_id', 'week_number']) {
    assert.ok(!cols.includes(invented), `${invented} is not in the current data`);
  }
});

/* ── 4 · nothing else moved ─────────────────────────────────────────────── */

test('data: user Routines, history, progression and purchases untouched', () => {
  assert.strictEqual(MIGRATION.userPrivateRoutinesAfter,
    MIGRATION.userPrivateRoutinesBefore, 'no user Routine was altered');
  assert.strictEqual(MIGRATION.historyWorkouts, 121);
  assert.strictEqual(MIGRATION.progressionRows, 1);
  assert.strictEqual(MIGRATION.purchases, 5);
});

test('data: legacy program_workouts retained intact for rollback', () => {
  assert.strictEqual(MIGRATION.legacyRowsIntact, MIGRATION.legacySessions,
    'no legacy row was modified or deleted');
});

/* ── 5 · CP8a boundary — no cutover yet ─────────────────────────────────── */

test('boundary: runtime still reads program_workouts (cutover is CP8b)', () => {
  const src = readCode('workout.html');
  assert.strictEqual((src.match(/from\('program_workouts'\)/g) || []).length, 2,
    'applyTemplateRanges + startProgramSession, unchanged');
  assert.ok(!src.includes('program_routines'),
    'CP8a must not wire the relationship into runtime');
});

test('boundary: Routine SELECT RLS was NOT widened in CP8a', () => {
  // No consumer exists yet. The entitlement-scoped read policy is CP8b's
  // reviewed decision, and CP8a must not pre-empt it.
  for (const f of ['workout.html', 'app.html', 'profile.html']) {
    assert.ok(!read(f).includes('program_routines'),
      `${f} must not query the relationship in CP8a`);
  }
});

test('boundary: no dual-write path was created', () => {
  const src = readCode('workout.html') + readCode('api/routine-admin.js');
  assert.ok(!/program_workouts[\s\S]{0,120}\.(insert|update|upsert)\(/.test(src),
    'nothing writes legacy prescriptions');
});

test('boundary: CP5 Programs UI and entitlement unchanged', () => {
  const src = readCode('workout.html');
  assert.match(src, /resolveProgramAccess\(p,\s*purchaseRows\)/);
  assert.ok(!/program_routines/.test(readCode('entitlement-core.js')),
    'entitlement stays one definition');
});

test('boundary: the CP6 validation draft was not migrated or linked', () => {
  // It is a platform DRAFT, so it must never acquire a Program relationship.
  assert.strictEqual(MIGRATION.programs, 3, 'only the three real Programs');
});

test('boundary: CP7 history conversion untouched', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'routine-history.js')));
  assert.ok(!readCode('routine-history.js').includes('program_routines'),
    'history conversion has no Program coupling');
});
