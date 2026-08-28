/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7G — analytics-core.js
 *
 * Weighted toward the two things that would actually matter if wrong: a
 * payload carrying something it must never carry, and telemetry throwing into
 * a path that was about to save a user's onboarding.
 *
 * The client vocabulary here must stay identical to the per-event allowlist in
 * the funnel_events insert policy. A drift between them is a real defect, so
 * the vocabulary is pinned literally rather than derived.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');

const A = require('./analytics-core.js');

/* ══ the vocabulary is closed and matches the insert policy ══════════════ */

test('the event vocabulary is exactly the approved eight', () => {
  assert.deepStrictEqual(Object.keys(A.FUNNEL_EVENTS).sort(), [
    'landing_cta_clicked',
    'onboarding_claim_failed',
    'onboarding_completed',
    'onboarding_started',
    'onboarding_step_completed',
    'personalized_plan_viewed',
    'save_plan_clicked',
    'signup_completed',
  ]);
});

test('each event permits exactly the details the insert policy allows', () => {
  // Mirrors phase_437g_funnel_events verbatim. If these diverge, the database
  // rejects rows the client believes are valid — silent data loss.
  assert.deepStrictEqual(A.FUNNEL_EVENTS.landing_cta_clicked, ['hero', 'create_account']);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.onboarding_started, ['anonymous', 'authenticated']);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.onboarding_step_completed, ['1', '2', '3', '4']);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.personalized_plan_viewed, ['ready', 'partial', 'needs_input']);
  assert.strictEqual(A.FUNNEL_EVENTS.save_plan_clicked, null);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.signup_completed, ['email', 'google']);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.onboarding_completed, ['anonymous_claim', 'authenticated_wizard']);
  assert.deepStrictEqual(A.FUNNEL_EVENTS.onboarding_claim_failed,
    ['compute', 'merge_empty', 'field_write', 'flag_write', 'confirm']);
});

test('an unknown event or detail is rejected', () => {
  assert.strictEqual(A.isValidEvent('button_clicked', 'x'), false);
  assert.strictEqual(A.isValidEvent('onboarding_started', 'sideways'), false);
  assert.strictEqual(A.isValidEvent('onboarding_step_completed', '9'), false);
  assert.strictEqual(A.isValidEvent(null, null), false);
  assert.strictEqual(A.isValidEvent('toString', 'x'), false);   // no prototype leakage
});

test('save_plan_clicked must carry no detail at all', () => {
  assert.strictEqual(A.isValidEvent('save_plan_clicked', null), true);
  assert.strictEqual(A.isValidEvent('save_plan_clicked', undefined), true);
  assert.strictEqual(A.isValidEvent('save_plan_clicked', 'anything'), false);
  // ...and the built row omits the key rather than sending null.
  const row = A.buildEvent('save_plan_clicked', null, 'abc123def456', 'onboarding');
  assert.ok(!('detail' in row));
});

test('claim failure reasons match the fail-stop returns in claimDraft', () => {
  // compute · merge_empty · field_write · flag_write · confirm — one per
  // `return false` in the ordered claim sequence.
  ['compute', 'merge_empty', 'field_write', 'flag_write', 'confirm'].forEach((r) => {
    assert.strictEqual(A.isValidEvent('onboarding_claim_failed', r), true);
  });
  assert.strictEqual(A.isValidEvent('onboarding_claim_failed', 'other'), false);
});

/* ══ privacy — the part that must never regress ══════════════════════════ */

test('a built payload carries ONLY the five contract keys', () => {
  const row = A.buildEvent('onboarding_started', 'anonymous', 'abc123def456', 'onboarding');
  assert.deepStrictEqual(Object.keys(row).sort(),
    ['detail', 'event', 'funnel_id', 'route', 'schema_version']);
  assert.strictEqual(A.payloadKeysAreSafe(row), true);
  // An event that takes no detail carries four keys, not five with a null.
  const noDetail = A.buildEvent('save_plan_clicked', null, 'abc123def456', 'onboarding');
  assert.deepStrictEqual(Object.keys(noDetail).sort(),
    ['event', 'funnel_id', 'route', 'schema_version']);
});

test('a payload with any extra key is flagged unsafe', () => {
  assert.strictEqual(A.payloadKeysAreSafe(
    { event: 'x', funnel_id: 'y', user_id: 'leak' }), false);
  assert.strictEqual(A.payloadKeysAreSafe(
    { event: 'x', funnel_id: 'y', weight_lbs: 185 }), false);
  assert.strictEqual(A.payloadKeysAreSafe(null), false);
});

test('there is no parameter through which profile data could be passed', () => {
  // emit takes (event, detail) and nothing else; buildEvent ignores extras.
  assert.strictEqual(A.emit.length, 2);
  const row = A.buildEvent('onboarding_started', 'anonymous', 'abc123def456', 'onboarding');
  assert.strictEqual(A.payloadKeysAreSafe(row), true);
});

test('the module contains no identity or profile vocabulary', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'analytics-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  // NOTE: the bare word "email" legitimately appears as a signup-METHOD enum
  // value (`signup_completed: ['email','google']`), which is a category, not an
  // address. The patterns below target the handling of actual identity data.
  [/user_id/, /weight/, /body_fat/, /\bage\b/, /target_calories/, /protein/,
    /full_name/, /\btoken\b/, /localStorage/, /getUser/, /session\.user/,
    /supabaseClient/, /@[a-z]+\.[a-z]/i,
  ].forEach((re) => {
    assert.ok(!re.test(src), 'analytics-core.js must not reference ' + re);
  });
});

test('no vocabulary value could itself be personal data', () => {
  // Every permitted detail is a short lowercase category. Nothing free-form,
  // nothing that could carry a name, an address or a number about a body.
  Object.keys(A.FUNNEL_EVENTS).forEach((event) => {
    const values = A.FUNNEL_EVENTS[event];
    if (values === null) return;
    values.forEach((v) => {
      assert.match(v, /^[a-z0-9_]{1,24}$/, event + ' has a suspect detail: ' + v);
    });
  });
});

test('routes are coarse buckets — a pathname can never leak', () => {
  assert.strictEqual(A.routeOf('/'), 'landing');
  assert.strictEqual(A.routeOf('/index.html'), 'landing');
  assert.strictEqual(A.routeOf('/onboarding.html'), 'onboarding');
  assert.strictEqual(A.routeOf('/auth.html'), 'auth');
  assert.strictEqual(A.routeOf('/app.html'), 'app');
  // Anything unrecognised collapses, rather than passing the path through.
  assert.strictEqual(A.routeOf('/workout.html?program=secret'), 'other');
  assert.strictEqual(A.routeOf('/some/deep/private/path'), 'other');
  assert.strictEqual(A.routeOf(null), 'other');
  A.ROUTES.forEach((r) => assert.ok(typeof r === 'string'));
});

test('an invalid route is refused rather than sent raw', () => {
  assert.strictEqual(
    A.buildEvent('onboarding_started', 'anonymous', 'abc123def456', '/raw/path'), null);
});

/* ══ funnel id ══════════════════════════════════════════════════════════ */

test('a funnel id is opaque and within the policy length bounds', () => {
  const id = A.newFunnelId();
  assert.strictEqual(id.length, 12);
  assert.match(id, /^[a-z0-9]+$/);
  assert.strictEqual(A.isValidFunnelId(id), true);
  // The insert policy requires 8..24 — anything outside is refused here first.
  assert.strictEqual(A.isValidFunnelId('short'), false);
  assert.strictEqual(A.isValidFunnelId('x'.repeat(25)), false);
  assert.strictEqual(A.isValidFunnelId(null), false);
});

test('randomness is injected, so the pure layer is deterministic', () => {
  let n = 0;
  const rand = () => { n += 0.0001; return n; };
  const a = A.newFunnelId(rand);
  n = 0;
  const b = A.newFunnelId(rand);
  assert.strictEqual(a, b);
});

test('a row with a bad funnel id is never built', () => {
  assert.strictEqual(A.buildEvent('onboarding_started', 'anonymous', 'short', 'onboarding'), null);
  assert.strictEqual(A.buildEvent('onboarding_started', 'anonymous', null, 'onboarding'), null);
});

/* ══ dedupe — at-most-once, and honest about it ═════════════════════════ */

test('a milestone fires once per funnel', () => {
  const emitted = [];
  assert.strictEqual(A.shouldEmit('onboarding_started', 'anonymous', emitted), true);
  emitted.push(A.dedupeKey('onboarding_started', 'anonymous'));
  assert.strictEqual(A.shouldEmit('onboarding_started', 'anonymous', emitted), false);
});

test('step events dedupe per step, not per event', () => {
  const emitted = [A.dedupeKey('onboarding_step_completed', '1')];
  assert.strictEqual(A.shouldEmit('onboarding_step_completed', '1', emitted), false);
  assert.strictEqual(A.shouldEmit('onboarding_step_completed', '2', emitted), true);
});

test('claim failures dedupe per reason', () => {
  const emitted = [A.dedupeKey('onboarding_claim_failed', 'field_write')];
  assert.strictEqual(A.shouldEmit('onboarding_claim_failed', 'field_write', emitted), false);
  assert.strictEqual(A.shouldEmit('onboarding_claim_failed', 'confirm', emitted), true);
});

test('an invalid event is never emitted regardless of dedupe state', () => {
  assert.strictEqual(A.shouldEmit('made_up', 'x', []), false);
});

/* ══ it can never break the product ═════════════════════════════════════ */

test('emit degrades to false without storage or fetch, and never throws', () => {
  // Node has neither sessionStorage nor location — the exact "private mode /
  // hostile environment" shape.
  assert.doesNotThrow(() => A.emit('onboarding_started', 'anonymous'));
  assert.strictEqual(A.emit('onboarding_started', 'anonymous'), false);
  assert.strictEqual(A.ensureFunnelId(), null);
  assert.strictEqual(A.currentFunnelId(), null);
  assert.strictEqual(A.clearFunnel(), false);
});

test('emit never throws on malformed input', () => {
  [[undefined, undefined], [null, null], [{}, []], [123, 456],
    ['onboarding_started', {}], [Symbol.iterator, 'x'],
  ].forEach(([e, d]) => {
    assert.doesNotThrow(() => A.emit(e, d), 'threw on ' + String(e));
  });
});

test('emit returns a boolean, never a promise the caller might await', () => {
  const r = A.emit('onboarding_started', 'anonymous');
  assert.strictEqual(typeof r, 'boolean');
  assert.ok(!(r && typeof r.then === 'function'));
});

test('the module reads no clock and holds no timers', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'analytics-core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  [/setTimeout/, /setInterval/, /Date\.now/, /new Date\(/].forEach((re) => {
    assert.ok(!re.test(src), 'analytics-core.js must not contain ' + re);
  });
});

test('no batching buffer exists — events are independent', () => {
  // Batching would risk losing the abandonment events, which are the ones
  // worth having. Pinned so it is not added casually.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'analytics-core.js'), 'utf8');
  assert.ok(!/queue|buffer|flush/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});
