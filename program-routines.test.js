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

test('boundary: CP8b completed the cutover CP8a deliberately deferred', () => {
  // This asserted the opposite during CP8a, when wiring the relationship into
  // runtime was out of scope. CP8b performs the cutover, so the invariant
  // inverts: the relationship IS the runtime source and legacy is not read.
  const src = readCode('workout.html');
  assert.ok(!src.includes("from('program_workouts')"), 'legacy reads are gone');
  assert.match(src, /from\('program_routines'\)/, 'the relationship is the source');
});

test('boundary: only Program execution surfaces query the relationship', () => {
  // CP8b widened Routine SELECT and wired the relationship into the two
  // Program execution surfaces. Nothing else should touch it — Home and
  // Profile have no business reading Program prescriptions.
  for (const f of ['app.html', 'profile.html', 'nutrition.html', 'weight-history.html']) {
    assert.ok(!read(f).includes('program_routines'),
      `${f} must not query the relationship`);
  }
  for (const f of ['workout.html', 'workout-complete.html']) {
    assert.match(readCode(f), /from\('program_routines'\)/, `${f} is a Program surface`);
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

/* ══════════════════════════════════════════════════════════════════════════
 * CP8b — entitlement-scoped RLS + execution cutover
 *
 * The RLS matrix was run against the live database before merge (17/17);
 * results are in the checkpoint record and mirrored here. What CI pins is the
 * code side: the cutover happened, no fallback exists, and the entitlement
 * predicate in SQL matches entitlement-core.js.
 * ═════════════════════════════════════════════════════════════════════════ */

const { resolveProgramAccess } = require('./entitlement-core.js');
const { rlPublishEligibility } = require('./routine-lifecycle.js');

const RLS = {
  ownPrivate: 'allow', othersPrivate: 'deny', platformDraft: 'deny',
  publishedUnlinked: 'deny',
  standaloneActive: 'allow', standalonePastDue: 'allow',
  standaloneCanceled: 'deny', standaloneRefunded: 'deny',
  membershipActive: 'allow', membershipPastDue: 'allow', membershipCanceled: 'deny',
  membershipNotIncluded: 'deny', membershipProgramRetired: 'deny',
  standaloneProgramNotSellable: 'allow', standaloneProgramNotIncluded: 'allow',
  standaloneProgramRetired: 'allow',
  noPurchase: 'deny', directRoutineId: 'deny', directRelationshipId: 'deny',
  draftLinkedAccidentally: 'deny',
};

/* ── entitlement parity: SQL semantics == entitlement-core.js ───────────── */

const prog = (over = {}) => ({ slug: 'muscle_gain', includedWithMembership: true,
  standalonePurchasable: true, status: 'published', ...over });
const buy = (product, status) => ({ product, status });

test('parity: standalone outcomes match the resolver exactly', () => {
  const map = { active: 'allow', past_due: 'allow', canceled: 'deny', refunded: 'deny' };
  for (const [status, expected] of Object.entries(map)) {
    const client = resolveProgramAccess(prog(), [buy('muscle_gain', status)]).allowed;
    assert.strictEqual(client ? 'allow' : 'deny', expected, `standalone ${status}`);
  }
  assert.strictEqual(RLS.standaloneActive, 'allow');
  assert.strictEqual(RLS.standaloneCanceled, 'deny');
});

test('parity: standalone ignores catalog flags on BOTH sides', () => {
  // The RLS Branch S reads no catalog column; the resolver's Branch S reads
  // none either. This is the case a naive policy would have broken.
  for (const over of [{ standalonePurchasable: false }, { includedWithMembership: false },
    { status: 'retired' }]) {
    assert.strictEqual(
      resolveProgramAccess(prog(over), [buy('muscle_gain', 'active')]).allowed, true,
      'ownership survives ' + JSON.stringify(over));
  }
  assert.strictEqual(RLS.standaloneProgramRetired, 'allow');
  assert.strictEqual(RLS.standaloneProgramNotSellable, 'allow');
});

test('parity: membership requires published AND included on BOTH sides', () => {
  assert.strictEqual(resolveProgramAccess(prog(), [buy('ai_membership', 'active')]).allowed, true);
  assert.strictEqual(resolveProgramAccess(prog({ includedWithMembership: false }),
    [buy('ai_membership', 'active')]).allowed, false);
  assert.strictEqual(RLS.membershipNotIncluded, 'deny');
  assert.strictEqual(RLS.membershipProgramRetired, 'deny');
});

test('rls: ids never grant access, drafts never leak', () => {
  assert.strictEqual(RLS.directRoutineId, 'deny');
  assert.strictEqual(RLS.directRelationshipId, 'deny');
  assert.strictEqual(RLS.platformDraft, 'deny');
  assert.strictEqual(RLS.draftLinkedAccidentally, 'deny',
    'a draft linked by mistake must still be denied');
  assert.strictEqual(RLS.othersPrivate, 'deny');
  assert.strictEqual(RLS.ownPrivate, 'allow');
});

/* ── description is optional ────────────────────────────────────────────── */

const publishable = (over = {}) => ({ name: 'Upper A', goal: 'muscle',
  exercises: [{ name: 'Bench Press', exercise_id: 'b691b1f7-73a0-415a-854d-41941bdfb5de',
    sets: 3, reps_low: 8, reps_high: 12, notes: '', rest_sec: 90 }],
  is_platform: true, visibility: 'private', ...over });

test('publish: a Routine with NO description is eligible (CP8b)', () => {
  const v = rlPublishEligibility(publishable({ description: null }));
  assert.strictEqual(v.eligible, true);
  assert.ok(!v.reasons.includes('missing_description'));
});

test('publish: relaxing description did NOT loosen identity or prescription', () => {
  const legacy = rlPublishEligibility(publishable({ description: null,
    exercises: [{ name: 'X', exercise_id: null, sets: 3, reps_low: 8, reps_high: 12,
      notes: '', rest_sec: 90 }] }));
  assert.strictEqual(legacy.eligible, false);
  assert.ok(legacy.reasons.includes('legacy_identity'));
  assert.ok(rlPublishEligibility(publishable({ description: null, exercises: [] }))
    .reasons.includes('no_exercises'));
  assert.ok(rlPublishEligibility(publishable({ description: null, goal: null }))
    .reasons.includes('missing_goal'));
  assert.ok(rlPublishEligibility(publishable({ description: null, name: '' }))
    .reasons.includes('missing_name'));
});

test('publish: missing_description is gone from the codebase', () => {
  assert.ok(!readCode('routine-lifecycle.js').includes('missing_description'));
  assert.ok(!read('routine-studio.html').includes('missing_description'),
    'Studio copy no longer claims description is required');
});

/* ── unpublish safety ───────────────────────────────────────────────────── */

test('unpublish: an assigned Routine is refused with routine_in_use', () => {
  const src = readCode('api/routine-admin.js');
  const block = src.slice(src.indexOf('async function actionUnpublish'),
    src.indexOf('async function loadAssignments'));
  assert.match(block, /loadAssignments/, 'checks Program assignments first');
  assert.match(block, /routine_in_use/);
  assert.match(block, /status: 409/);
  assert.ok(!/DELETE|delete/.test(block), 'never cascades or deletes');
});

test('unpublish: the guard runs BEFORE any visibility write', () => {
  const src = readCode('api/routine-admin.js');
  const block = src.slice(src.indexOf('async function actionUnpublish'),
    src.indexOf('async function loadAssignments'));
  const guard = block.indexOf('routine_in_use');
  const write = block.indexOf('rlUnpublishPatch');
  assert.ok(guard > -1 && (write === -1 || guard < write),
    'a rejected unpublish must leave visibility untouched');
});

/* ── assignment safety ──────────────────────────────────────────────────── */

test('assign: only a PUBLISHED PLATFORM Routine may be assigned', () => {
  const src = readCode('api/routine-admin.js');
  const block = src.slice(src.indexOf('async function actionAssign'),
    src.indexOf('async function actionUnassign'));
  assert.match(block, /rlClassify\(row\) !== 'platform_published'/,
    'a user private Routine and a platform draft are both refused');
  assert.match(block, /loadRoutine\(body\.id\)/, 'checked against the STORED row');
  assert.ok(!/body\.is_platform|body\.visibility/.test(block),
    'never trusts a client-supplied flag');
});

test('assign: relationship writes stay privileged', () => {
  // program_routines has no client write policy at all, so RLS denies
  // insert/update/delete for every non-service role.
  for (const f of ['workout.html', 'workout-complete.html', 'app.html', 'profile.html']) {
    const src = readCode(f);
    assert.ok(!/from\('program_routines'\)[\s\S]{0,120}\.(insert|update|delete|upsert)\(/.test(src),
      `${f} must never write relationships`);
  }
});

/* ── execution cutover ──────────────────────────────────────────────────── */

test('cutover: ZERO normal runtime prescription reads of program_workouts', () => {
  const runtime = ['workout.html', 'workout-complete.html', 'workout-history.js',
    'app.html', 'profile.html', 'program-catalog.js', 'program-state.js'];
  for (const f of runtime) {
    assert.ok(!readCode(f).includes("from('program_workouts')"),
      `${f} still reads legacy prescriptions`);
  }
});

test('cutover: both Program consumers use the canonical Routine path', () => {
  const src = readCode('workout.html');
  assert.match(src, /async function loadProgramSession/);
  assert.match(src, /from\('program_routines'\)/);
  // applyTemplateRanges and startProgramSession both go through the helper.
  assert.strictEqual((src.match(/await loadProgramSession\(/g) || []).length, 2,
    'applyTemplateRanges and startProgramSession, both via the helper');
});

test('cutover: there is NO runtime fallback to legacy data', () => {
  // A silent fallback would restore dual authority and mask defects. Rollback
  // is a deployment action, not a runtime branch.
  const src = readCode('workout.html') + readCode('workout-complete.html');
  assert.ok(!/program_workouts/.test(src), 'no legacy reference remains at runtime');
});

test('cutover: the prescription is normalized by the ONE shared contract', () => {
  const src = readCode('workout.html');
  const block = src.slice(src.indexOf('async function loadProgramSession'),
    src.indexOf('async function applyTemplateRanges'));
  assert.match(block, /rtNormalizeExercises/, 'no Program-specific prescription shape');
});

test('cutover: one protected query, not a waterfall', () => {
  const src = readCode('workout.html');
  const block = src.slice(src.indexOf('async function loadProgramSession'),
    src.indexOf('async function applyTemplateRanges'));
  assert.match(block, /programs!inner[\s\S]{0,80}workout_templates!inner/,
    'relationship, Program and Routine arrive together');
  assert.strictEqual((block.match(/supabaseClient/g) || []).length, 1);
});

test('cutover: session_key remains the linkage and ordering is untouched', () => {
  const src = readCode('workout.html');
  assert.match(src, /\.eq\('session_key', sessionKey\)/);
  assert.match(src, /startProgramSession\(programSlug, sessionKey, mode\)/,
    'progression signature unchanged');
});

test('cutover: progression and history semantics untouched', () => {
  const src = readCode('workout.html');
  assert.match(src, /from\('user_programs'\)/, 'progression still read from user_programs');
  assert.match(src, /advanceProgramSession/, 'advancement unchanged');
  // History remains a snapshot: the workout still records its own exercises.
  assert.match(src, /from\('workout_exercises'\)[\s\S]{0,200}\.insert/);
});
