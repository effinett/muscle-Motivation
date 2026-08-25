/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP6 — platform Routine authoring / publishing
 *
 * The lifecycle rules and the privileged endpoint's pure helpers run offline.
 * The RLS side (a normal client cannot promote or publish) was proven against
 * the live database in CP4 and re-verified for CP6; those results are in the
 * checkpoint record.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  RL_USER_PRIVATE, RL_PLATFORM_DRAFT, RL_PLATFORM_PUBLISHED, RL_UNKNOWN, RL_GOALS,
  rlClassify, rlIsPlatform, rlPublishEligibility, rlUnpublishEligibility,
  rlPublishPatch, rlUnpublishPatch, rlDraftDefaults,
} = require('./routine-lifecycle.js');
const admin = require('./api/routine-admin.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const UUID = 'b691b1f7-73a0-415a-854d-41941bdfb5de';
const canonicalEx = (n) => ({ name: n, exercise_id: UUID, sets: 3,
  reps_low: 8, reps_high: 12, notes: '', rest_sec: 90 });
const legacyEx = (n) => ({ name: n, exercise_id: null, sets: 3,
  reps_low: 8, reps_high: 12, notes: '', rest_sec: 90 });

const publishable = (over = {}) => ({
  id: 'r1', name: 'Platform Push Day', description: 'A push session.',
  goal: 'muscle', difficulty: 'Beginner', tags: ['push'],
  exercises: [canonicalEx('Bench Press')],
  is_platform: true, visibility: 'private', ...over,
});

/* ── 1 · state model — no new column ────────────────────────────────────── */

test('state: is_platform + visibility express every CP6 state', () => {
  assert.strictEqual(rlClassify({ is_platform: false, visibility: 'private' }), RL_USER_PRIVATE);
  assert.strictEqual(rlClassify({ is_platform: true, visibility: 'private' }), RL_PLATFORM_DRAFT);
  assert.strictEqual(rlClassify({ is_platform: true, visibility: 'published' }), RL_PLATFORM_PUBLISHED);
});

test('state: the impossible combination is not a state', () => {
  // A user-owned published row is forbidden by database CHECK; if one somehow
  // appeared it must classify as unknown, never as user_private.
  assert.strictEqual(rlClassify({ is_platform: false, visibility: 'published' }), RL_UNKNOWN);
  assert.strictEqual(rlClassify(null), RL_UNKNOWN);
  assert.strictEqual(rlClassify('x'), RL_UNKNOWN);
});

test('state: CP6 introduced no status column or parallel state machine', () => {
  // The check that matters is what gets WRITTEN: every state transition must
  // move `visibility` alone. (Reading `verdict.status` from the CP3 validator
  // is unrelated — that is a validation result, not a lifecycle column.)
  assert.deepStrictEqual(rlDraftDefaults(), { is_platform: true, visibility: 'private' });
  assert.deepStrictEqual(rlPublishPatch(), { visibility: 'published' });
  assert.deepStrictEqual(rlUnpublishPatch(), { visibility: 'private' });
  for (const patch of [rlDraftDefaults(), rlPublishPatch(), rlUnpublishPatch()]) {
    assert.ok(!Object.hasOwn(patch, 'status'), 'no status column is ever written');
  }
  // And the endpoint must not smuggle one into a row it writes.
  const src = readCode('api/routine-admin.js');
  assert.ok(!/\bstatus:\s*['"]/.test(src), 'no status literal is persisted');
});

test('state: platform detection', () => {
  assert.strictEqual(rlIsPlatform(publishable()), true);
  assert.strictEqual(rlIsPlatform({ is_platform: false, visibility: 'private' }), false);
});

/* ── 2 · publish eligibility ────────────────────────────────────────────── */

test('publish: a complete platform draft is eligible', () => {
  const v = rlPublishEligibility(publishable());
  assert.deepStrictEqual(v, { eligible: true, reasons: [] });
});

test('publish: a user Routine is never eligible', () => {
  const v = rlPublishEligibility(publishable({ is_platform: false }));
  assert.strictEqual(v.eligible, false);
  assert.ok(v.reasons.includes('not_platform_routine'));
});

test('publish: an already-published Routine is not re-publishable', () => {
  const v = rlPublishEligibility(publishable({ visibility: 'published' }));
  assert.ok(v.reasons.includes('already_published'));
});

test('publish: required metadata', () => {
  assert.ok(rlPublishEligibility(publishable({ name: '  ' })).reasons.includes('missing_name'));
  assert.ok(rlPublishEligibility(publishable({ description: '' })).reasons.includes('missing_description'));
  assert.ok(rlPublishEligibility(publishable({ goal: null })).reasons.includes('missing_goal'));
  assert.ok(rlPublishEligibility(publishable({ goal: 'glutes' })).reasons.includes('invalid_goal'));
});

test('publish: goal vocabulary is the existing one', () => {
  assert.deepStrictEqual(RL_GOALS, ['fatloss', 'recomp', 'muscle']);
});

test('publish: at least one exercise is required', () => {
  assert.ok(rlPublishEligibility(publishable({ exercises: [] })).reasons.includes('no_exercises'));
});

test('publish: malformed prescriptions block publish', () => {
  const v = rlPublishEligibility(publishable({ exercises: [{ name: '' }] }));
  assert.ok(v.reasons.includes('invalid_prescription'));
});

test('publish: reasons accumulate rather than short-circuit', () => {
  const v = rlPublishEligibility({ is_platform: true, visibility: 'private',
    name: '', description: '', goal: null, exercises: [] });
  for (const r of ['missing_name', 'missing_description', 'missing_goal', 'no_exercises']) {
    assert.ok(v.reasons.includes(r), 'expected ' + r);
  }
});

test('publish: unknown input fails closed', () => {
  assert.deepStrictEqual(rlPublishEligibility(null), { eligible: false, reasons: ['not_found'] });
});

/* ── 3 · identity safety — the strict part ──────────────────────────────── */

test('identity: a name-only exercise blocks publish', () => {
  const v = rlPublishEligibility(publishable({ exercises: [legacyEx('Bench Press')] }));
  assert.strictEqual(v.eligible, false);
  assert.ok(v.reasons.includes('legacy_identity'));
});

test('identity: one legacy entry among canonical ones still blocks', () => {
  const v = rlPublishEligibility(publishable({
    exercises: [canonicalEx('Bench Press'), legacyEx('Some Custom Move')] }));
  assert.ok(v.reasons.includes('legacy_identity'));
});

test('identity: a user custom exercise can never reach published content', () => {
  // The CP3 contract carries only exercise_id — there is no user_exercise_id
  // field — so a custom-derived entry arrives with exercise_id null and is
  // rejected as legacy identity. Custom leakage is blocked by the SHAPE of the
  // contract, not by a lookup.
  const custom = { name: 'My Custom Move', exercise_id: null,
    user_exercise_id: 'someone-elses-custom-id',
    sets: 3, reps_low: 8, reps_high: 12, notes: '', rest_sec: 90 };
  const v = rlPublishEligibility(publishable({ exercises: [custom] }));
  assert.strictEqual(v.eligible, false);
  assert.ok(v.reasons.includes('legacy_identity'));
});

test('identity: nothing in the lifecycle core resolves or guesses an id', () => {
  const src = readCode('routine-lifecycle.js');
  for (const banned of ['libraryExerciseId', 'normalizeExerciseName', 'exerciseLibrary',
    'backfill', 'fuzzy', 'ILIKE', 'lookup']) {
    assert.ok(!src.includes(banned), `must not ${banned}`);
  }
});

/* ── 4 · unpublish ──────────────────────────────────────────────────────── */

test('unpublish: only a published platform Routine can be unpublished', () => {
  assert.strictEqual(rlUnpublishEligibility(publishable({ visibility: 'published' })).eligible, true);
  assert.ok(rlUnpublishEligibility(publishable()).reasons.includes('not_published'));
  assert.ok(rlUnpublishEligibility(publishable({ is_platform: false, visibility: 'private' }))
    .reasons.includes('not_platform_routine'));
  assert.ok(rlUnpublishEligibility(null).reasons.includes('not_found'));
});

test('unpublish: returns to draft and deletes nothing', () => {
  assert.deepStrictEqual(rlUnpublishPatch(), { visibility: 'private' });
  const src = readCode('api/routine-admin.js');
  const block = src.slice(src.indexOf('actionUnpublish'), src.indexOf('const ACTIONS'));
  assert.ok(!/DELETE|method: 'DELETE'/.test(block), 'unpublish must never delete');
});

/* ── 5 · privileged authorization ───────────────────────────────────────── */

test('auth: the allowlist is server-only and fails closed when unset', () => {
  const saved = process.env.ROUTINE_ADMIN_USER_IDS;
  try {
    delete process.env.ROUTINE_ADMIN_USER_IDS;
    assert.strictEqual(admin.isPlatformAuthor('any-user'), false, 'unset ⇒ nobody');
    process.env.ROUTINE_ADMIN_USER_IDS = '';
    assert.strictEqual(admin.isPlatformAuthor('any-user'), false, 'empty ⇒ nobody');
    process.env.ROUTINE_ADMIN_USER_IDS = 'user-a, user-b';
    assert.strictEqual(admin.isPlatformAuthor('user-a'), true);
    assert.strictEqual(admin.isPlatformAuthor('user-b'), true, 'whitespace tolerated');
    assert.strictEqual(admin.isPlatformAuthor('user-c'), false);
    assert.strictEqual(admin.isPlatformAuthor(''), false);
    assert.strictEqual(admin.isPlatformAuthor(null), false);
    assert.strictEqual(admin.isPlatformAuthor(undefined), false);
  } finally {
    if (saved === undefined) delete process.env.ROUTINE_ADMIN_USER_IDS;
    else process.env.ROUTINE_ADMIN_USER_IDS = saved;
  }
});

test('auth: identity comes from the verified token, never the request body', () => {
  const src = readCode('api/routine-admin.js');
  assert.match(src, /getUserFromToken\(token\)/);
  assert.match(src, /user_id: user\.id/, 'created rows are owned by the verified caller');
  assert.ok(!/body\.user_id|body\.userId/.test(src), 'never trusts a body-supplied identity');
});

test('auth: authorization is checked before any action runs', () => {
  const src = readCode('api/routine-admin.js');
  const gate = src.indexOf('isPlatformAuthor(user.id)');
  const dispatch = src.indexOf('await run(user, body)');
  assert.ok(gate > -1 && dispatch > gate, 'the allowlist gate precedes dispatch');
});

test('auth: no roles or grants table was introduced', () => {
  const src = readCode('api/routine-admin.js') + readCode('routine-lifecycle.js');
  for (const banned of ['user_roles', 'roles', 'grants', 'permissions', 'rbac']) {
    assert.ok(!new RegExp('\\b' + banned + '\\b', 'i').test(src), `no ${banned}`);
  }
});

/* ── 6 · secret containment — HARD GATE ─────────────────────────────────── */

const BROWSER_FILES = ['routine-studio.html', 'routine-lifecycle.js', 'routine-core.js',
  'workout.html', 'app.html', 'profile.html', 'nutrition.html', 'weight-history.html'];

test('secrets: no service-role key or allowlist reaches the browser', () => {
  for (const f of BROWSER_FILES) {
    const src = read(f);
    for (const secret of ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE',
      'ROUTINE_ADMIN_USER_IDS', 'process.env']) {
      assert.ok(!src.includes(secret), `${f} must not contain ${secret}`);
    }
  }
});

test('secrets: the authoring page holds no privileged identity of its own', () => {
  const src = readCode('routine-studio.html');
  // No hard-coded identity: no uuid, no email address, no client-side role test.
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(src),
    'no user id is embedded in the page');
  assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(src), 'no email allowlist in the page');
  assert.ok(!/\bisAdmin\b|\bADMIN_ID\b|ROUTINE_ADMIN/.test(src), 'no client-side role check');
  // Access is decided by the server's answer, never by hiding controls.
  assert.match(src, /probe\.status === 403/, 'the server decides');
});

/* ── 7 · shared-contract reuse ──────────────────────────────────────────── */

test('contract: the endpoint normalizes through routine-core, not its own copy', () => {
  const src = readCode('api/routine-admin.js');
  assert.match(src, /rtNormalizeExercises/);
  assert.ok(!/reps_low\s*=\s*8|isNaN\(lo\)/.test(src), 'no re-implemented normalization');
});

test('contract: the endpoint adds no CP8 Program relationship fields', () => {
  const src = readCode('api/routine-admin.js');
  for (const cp8 of ['program_slug', 'program_id', 'session_key', 'program_workouts']) {
    assert.ok(!src.includes(cp8), `${cp8} belongs to CP8`);
  }
});

test('contract: publish/update cannot change is_platform or visibility implicitly', () => {
  const src = readCode('api/routine-admin.js');
  const patch = src.slice(src.indexOf('function buildPatch'), src.indexOf('async function actionList'));
  assert.ok(!/is_platform/.test(patch), 'buildPatch must not accept is_platform');
  assert.ok(!/visibility/.test(patch), 'buildPatch must not accept visibility');
});

/* ── 8 · input hardening ────────────────────────────────────────────────── */

test('input: metadata is bounded and the goal vocabulary enforced', () => {
  const p = admin.buildPatch({ name: 'x'.repeat(500), description: 'y'.repeat(2000),
    goal: 'nonsense', difficulty: 'z'.repeat(200) });
  assert.strictEqual(p.name.length, 80);
  assert.strictEqual(p.description.length, 600);
  assert.strictEqual(p.goal, null, 'an unknown goal is dropped, not stored');
  assert.strictEqual(p.difficulty.length, 40);
});

test('input: tags are bounded, de-duplicated and trimmed', () => {
  const tags = admin.cleanTags([' a ', 'a', 'b', 42, null, 'c'.repeat(80),
    ...Array.from({ length: 20 }, (_, i) => 't' + i)]);
  assert.ok(tags.length <= 8);
  assert.strictEqual(new Set(tags).size, tags.length, 'no duplicates');
  assert.ok(tags.every((t) => t.length <= 24));
  assert.ok(tags.includes('a') && tags.includes('b'));
});

test('input: exercises are capped and normalized', () => {
  const many = Array.from({ length: 100 }, (_, i) => canonicalEx('Ex ' + i));
  const p = admin.buildPatch({ exercises: many });
  assert.ok(p.exercises.length <= 40);
  assert.ok(p.exercises.every((e) => Object.hasOwn(e, 'exercise_id')));
});

test('input: an omitted field is not written', () => {
  assert.deepStrictEqual(admin.buildPatch({}), {}, 'no accidental nulling');
});

/* ── 9 · scope and isolation ────────────────────────────────────────────── */

test('scope: the normal app does not load any authoring code', () => {
  // 4.3.5F: Home / Train / Nutrition / Progress payload must be unchanged.
  for (const page of ['app.html', 'workout.html', 'nutrition.html', 'weight-history.html']) {
    const src = read(page);
    assert.ok(!src.includes('routine-lifecycle.js'), `${page} must not load the lifecycle core`);
    assert.ok(!src.includes('routine-admin'), `${page} must not know the endpoint`);
    assert.ok(!src.includes('routine-studio'), `${page} must not link the studio`);
  }
});

test('scope: the studio is not reachable from navigation', () => {
  assert.ok(!read('app-nav.js').includes('routine-studio'), 'no nav entry');
  assert.match(read('routine-studio.html'), /noindex/, 'not indexable');
});

/* Regression: production validation found platform Routines listed in the
 * author's own Train → Workouts. Platform rows are owned by the authoring
 * admin, so owner-only RLS legitimately returns them — the normal template
 * reads must therefore exclude them explicitly. */

test('regression: Train excludes platform Routines from the user template list', () => {
  const src = readCode('workout.html');
  const list = src.slice(src.indexOf("from('workout_templates')"));
  const listBlock = list.slice(0, list.indexOf('.order('));
  assert.match(listBlock, /\.eq\('is_platform',\s*false\)/,
    'loadTemplates must filter out platform Routines');
});

test('regression: a platform Routine is not launchable from the normal logger', () => {
  const src = readCode('workout.html');
  const launch = src.slice(src.indexOf('.eq(\'id\', templateId)') - 200,
    src.indexOf('.eq(\'id\', templateId)') + 120);
  assert.match(launch, /\.eq\('is_platform',\s*false\)/,
    'launch-by-id must refuse platform Routines');
});

test('regression: every normal-client template READ excludes platform rows', () => {
  // Writes are already blocked by RLS (is_platform=false in the policies);
  // it is the READS that needed the explicit filter.
  const src = readCode('workout.html');
  const reads = src.match(/from\('workout_templates'\)\s*\n?\s*\.select\([\s\S]{0,400}?(?=;)/g) || [];
  assert.ok(reads.length >= 2, 'found the template reads');
  for (const r of reads) {
    assert.match(r, /\.eq\('is_platform',\s*false\)/,
      'a normal-client read leaked platform rows: ' + r.slice(0, 90));
  }
});

/* Regression: production validation found the studio's confirmation dialog
 * opened correctly but the confirmed action never ran — closing a <dialog>
 * via a method="dialog" form submission did not fire its `close` event, so
 * publish and unpublish were silently swallowed. */

test('regression: the confirm action does not depend on the dialog close event', () => {
  const src = readCode('routine-studio.html');
  assert.ok(!/\.onclose\s*=/.test(src), 'must not hang the action off onclose');
  assert.match(src, /fresh\.addEventListener\('click'/,
    'the action runs from the confirm button\'s own click');
  assert.match(src, /id="cGo"[^>]*type="button"/,
    'the confirm button must not auto-submit the dialog form');
});

test('regression: each confirmation binds exactly one action', () => {
  // Cloning the button drops the previous handler, so publishing after
  // cancelling an unpublish can never fire the wrong action, or fire twice.
  const src = readCode('routine-studio.html');
  assert.match(src, /cloneNode\(true\)[\s\S]{0,120}replaceChild/,
    'a stale handler must not survive into the next confirmation');
});

test('scope: CP5 Programs UI is untouched by CP6', () => {
  const src = readCode('workout.html');
  assert.match(src, /resolveProgramAccess\(p,\s*purchaseRows\)/, 'still catalog+entitlement based');
  // Train references is_platform ONLY to exclude platform Routines from the
  // user's own lists. It must never read `visibility` — that is publication
  // state, and Train has no business consuming platform content until CP8.
  assert.ok(!/visibility/.test(src), 'Train must not read publication state');
  for (const use of src.match(/.{0,14}is_platform[^\n]*/g) || []) {
    assert.match(use, /\.eq\('is_platform',\s*false\)/,
      'is_platform may only be used to filter platform rows out: ' + use.trim());
  }
});

test('scope: platform authoring stays independent of history conversion', () => {
  // CP7 shipped routine-history.js. The durable invariant is that the platform
  // authoring path never reaches into history conversion, and vice versa.
  const src = readCode('api/routine-admin.js') + readCode('routine-lifecycle.js');
  for (const cp7 of ['rhAnalyzeWorkout', 'routine-history', 'workout_sets', 'candidacy']) {
    assert.ok(!src.includes(cp7), `platform authoring must not depend on ${cp7}`);
  }
  const hist = readCode('routine-history.js');
  assert.ok(!/is_platform|routine-admin|rlPublish/.test(hist),
    'history conversion must not reach into platform authoring');
});

test('scope: CP8 has not started — program_workouts untouched', () => {
  const src = readCode('api/routine-admin.js') + readCode('routine-lifecycle.js') +
    readCode('routine-studio.html');
  assert.ok(!src.includes('program_workouts'), 'CP8 owns Program convergence');
  // Train still performs exactly its two pre-existing program_workouts reads.
  assert.strictEqual(
    (readCode('workout.html').match(/from\('program_workouts'\)/g) || []).length, 2);
});

test('scope: purity of the lifecycle core', () => {
  const src = readCode('routine-lifecycle.js');
  for (const banned of ['document', 'window.', 'supabaseClient', 'fetch(', 'localStorage']) {
    assert.ok(!src.includes(banned), `lifecycle core must not reference ${banned}`);
  }
});
