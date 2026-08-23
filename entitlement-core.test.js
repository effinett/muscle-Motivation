/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP2a — shared Program access resolver
 *
 * The resolver is pure, so these tests exercise the real production logic
 * offline. Fixtures mirror the live public.programs rows and the live
 * purchases status vocabulary written by api/stripe-webhook.js:
 *   'active'   — checkout completed
 *   'past_due' — invoice.payment_failed   (subscription-keyed only)
 *   'canceled' — subscription.deleted     (subscription-keyed only)
 *   'refunded' — refund; terminal, guarded by status=neq.refunded
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  ENT_MEMBERSHIP_PRODUCT, ENT_QUALIFYING_STATUSES, entIsQualifyingStatus,
  entHasQualifyingMembership, entOwnsStandalone, resolveProgramAccess,
} = require('./entitlement-core.js');
const { pcNormalizeCatalog } = require('./program-catalog.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* The three live Programs, all included_with_membership AND standalone
 * purchasable per owner decision R2 (2026-08-21). */
const CATALOG = pcNormalizeCatalog([
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', goal: 'fatloss',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 1 },
  { slug: 'muscle_gain', name: 'Muscle Gain', goal: 'muscle',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 2 },
  { slug: 'glute_builder', name: 'Glute Builder', goal: 'muscle',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 3 },
]);

const prog = (slug) => CATALOG.filter((p) => p.slug === slug)[0];

// A Program deliberately NOT included with membership, to prove the flag is
// consulted rather than assumed.
const NOT_INCLUDED = pcNormalizeCatalog([
  { slug: 'future_program', name: 'Future Program',
    included_with_membership: false, standalone_purchasable: true,
    status: 'published', sort_order: 9 },
])[0];

const buy = (product, status) => ({ product, status });
const OLD_PERIOD_END = '2020-01-01T00:00:00Z';

/* ── 1 · the approved access matrix ─────────────────────────────────────── */

test('1 · included Program + active membership → allow via membership', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), [buy('ai_membership', 'active')]);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.source, 'membership');
  assert.strictEqual(v.reason, 'membership_included');
  assert.deepStrictEqual(v.via, { membership: true, standalone: false });
});

test('2 · included Program + past_due membership → allow (dunning grace)', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), [buy('ai_membership', 'past_due')]);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.source, 'membership');
});

test('3 · included Program + canceled membership → deny', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), [buy('ai_membership', 'canceled')]);
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.source, 'none');
  assert.strictEqual(v.reason, 'no_qualifying_purchase');
});

test('4 · included Program + refunded membership → deny', () => {
  assert.strictEqual(
    resolveProgramAccess(prog('muscle_gain'), [buy('ai_membership', 'refunded')]).allowed, false);
});

test('5 · NOT-included Program + active membership → deny', () => {
  const v = resolveProgramAccess(NOT_INCLUDED, [buy('ai_membership', 'active')]);
  assert.strictEqual(v.allowed, false, 'membership only grants Programs that declare inclusion');
  assert.strictEqual(v.via.membership, false);
});

test('6 · valid standalone purchase, no membership → allow via standalone', () => {
  const v = resolveProgramAccess(prog('glute_builder'), [buy('glute_builder', 'active')]);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.source, 'standalone');
  assert.strictEqual(v.reason, 'standalone_purchase');
});

test('7 · standalone survives a cancelled or refunded membership', () => {
  // The O1 guarantee. Branch S reads no membership state at all, so this holds
  // structurally rather than by special-casing.
  for (const membershipStatus of ['canceled', 'refunded', 'past_due', 'active']) {
    const v = resolveProgramAccess(prog('glute_builder'), [
      buy('ai_membership', membershipStatus),
      buy('glute_builder', 'active'),
    ]);
    assert.strictEqual(v.allowed, true, `standalone must survive membership=${membershipStatus}`);
    assert.strictEqual(v.source, 'standalone');
  }
});

test('7b · standalone survives when membership is absent entirely', () => {
  const v = resolveProgramAccess(prog('glute_builder'), [buy('glute_builder', 'active')]);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.via.membership, false);
});

test('8 · both branches succeed → allow, source standalone, both observable', () => {
  const v = resolveProgramAccess(prog('fat_loss_blueprint'), [
    buy('ai_membership', 'active'),
    buy('fat_loss_blueprint', 'active'),
  ]);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.source, 'standalone', 'the stronger, non-expiring claim wins');
  assert.deepStrictEqual(v.via, { membership: true, standalone: true });
});

test('9 · neither branch → deny', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), []);
  assert.strictEqual(v.allowed, false);
  assert.deepStrictEqual(v.via, { membership: false, standalone: false });
});

test('10 · a purchase of a DIFFERENT Program grants nothing', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), [buy('glute_builder', 'active')]);
  assert.strictEqual(v.allowed, false);
});

test('11 · refunded standalone → deny', () => {
  // Mirrors real data: one user holds a refunded glute_builder row.
  assert.strictEqual(
    resolveProgramAccess(prog('glute_builder'), [buy('glute_builder', 'refunded')]).allowed, false);
});

/* ── 2 · sellability is not ownership ───────────────────────────────────── */

test('12 · withdrawing a Program from sale never revokes an existing purchase', () => {
  const withdrawn = pcNormalizeCatalog([{
    slug: 'glute_builder', name: 'Glute Builder',
    included_with_membership: false, standalone_purchasable: false,
    status: 'retired', sort_order: 3,
  }])[0];
  const v = resolveProgramAccess(withdrawn, [buy('glute_builder', 'active')]);
  assert.strictEqual(v.allowed, true,
    'standalone_purchasable=false is a merchandising decision, not a revocation');
  assert.strictEqual(v.source, 'standalone');
});

test('12b · sellability alone grants nothing without a purchase', () => {
  assert.strictEqual(resolveProgramAccess(prog('muscle_gain'), []).allowed, false);
});

/* ── 3 · current_period_end is never an independent denial ──────────────── */

test('13 · an old current_period_end does not revoke an active purchase', () => {
  const row = { product: 'ai_membership', status: 'active', current_period_end: OLD_PERIOD_END };
  assert.strictEqual(resolveProgramAccess(prog('muscle_gain'), [row]).allowed, true);
});

test('14 · an old current_period_end does not change the past_due rule', () => {
  const stale = { product: 'ai_membership', status: 'past_due', current_period_end: OLD_PERIOD_END };
  assert.strictEqual(resolveProgramAccess(prog('muscle_gain'), [stale]).allowed, true);
  const dead = { product: 'ai_membership', status: 'canceled', current_period_end: OLD_PERIOD_END };
  assert.strictEqual(resolveProgramAccess(prog('muscle_gain'), [dead]).allowed, false,
    'status decides, not the period end');
});

test('14b · the resolver never reads current_period_end at all', () => {
  assert.ok(!/current_period_end/.test(readCode('entitlement-core.js')),
    'billing interpretation must not be duplicated here');
});

/* ── 4 · input hardening — fail closed ──────────────────────────────────── */

test('15 · duplicate rows do not change the verdict', () => {
  const dupes = [buy('glute_builder', 'active'), buy('glute_builder', 'active'),
    buy('ai_membership', 'active'), buy('ai_membership', 'active')];
  const v = resolveProgramAccess(prog('glute_builder'), dupes);
  assert.strictEqual(v.allowed, true);
  assert.strictEqual(v.source, 'standalone');
});

test('15b · a refunded duplicate does not cancel a valid active row', () => {
  const v = resolveProgramAccess(prog('glute_builder'),
    [buy('glute_builder', 'refunded'), buy('glute_builder', 'active')]);
  assert.strictEqual(v.allowed, true, 'any qualifying row grants; order must not matter');
  const reversed = resolveProgramAccess(prog('glute_builder'),
    [buy('glute_builder', 'active'), buy('glute_builder', 'refunded')]);
  assert.deepStrictEqual(reversed, v);
});

test('16 · malformed program input fails closed without throwing', () => {
  for (const bad of [null, undefined, {}, { slug: '' }, { slug: 42 }, 'muscle_gain', 7, []]) {
    const v = resolveProgramAccess(bad, [buy('ai_membership', 'active')]);
    assert.strictEqual(v.allowed, false, `denied for ${JSON.stringify(bad)}`);
    assert.strictEqual(v.reason, 'invalid_program');
  }
});

test('16b · malformed purchase input fails closed without throwing', () => {
  for (const bad of [null, undefined, 'active', 42, {}]) {
    const v = resolveProgramAccess(prog('muscle_gain'), bad);
    assert.strictEqual(v.allowed, false, `denied for ${JSON.stringify(bad)}`);
    assert.strictEqual(v.reason, 'invalid_purchases');
  }
});

test('16c · malformed rows inside a valid array are skipped, not fatal', () => {
  const rows = [null, undefined, 42, 'glute_builder', {}, { status: 'active' },
    { product: 7, status: 'active' }, buy('glute_builder', 'active')];
  const v = resolveProgramAccess(prog('glute_builder'), rows);
  assert.strictEqual(v.allowed, true, 'the one valid row still grants');
});

test('16d · malformed rows alone never grant', () => {
  const rows = [null, 42, {}, { status: 'active' }, { product: null, status: 'active' }];
  assert.strictEqual(resolveProgramAccess(prog('glute_builder'), rows).allowed, false);
});

test('17 · an unknown or missing status fails closed', () => {
  for (const status of ['ACTIVE', 'Active', 'trialing', 'incomplete', 'paid', '',
    null, undefined, 0, 1, true, {}]) {
    assert.strictEqual(entIsQualifyingStatus(status), false, `status ${String(status)}`);
    const v = resolveProgramAccess(prog('glute_builder'), [{ product: 'glute_builder', status }]);
    assert.strictEqual(v.allowed, false, `denied for status ${String(status)}`);
  }
});

test('18 · unknown products are ignored', () => {
  const v = resolveProgramAccess(prog('muscle_gain'), [
    buy('some_future_product', 'active'), buy('', 'active'), buy('AI_MEMBERSHIP', 'active'),
  ]);
  assert.strictEqual(v.allowed, false, 'product matching is exact and case-sensitive');
});

test('18b · a missing included_with_membership flag fails closed', () => {
  const v = resolveProgramAccess({ slug: 'muscle_gain' }, [buy('ai_membership', 'active')]);
  assert.strictEqual(v.allowed, false, 'inclusion must be declared, never assumed');
});

test('18c · a raw snake_case programs row is accepted too', () => {
  // CP2b may hand the resolver an unnormalized row; silently denying would be
  // a subtle wrong-answer bug rather than a loud failure.
  const raw = { slug: 'muscle_gain', included_with_membership: true };
  assert.strictEqual(resolveProgramAccess(raw, [buy('ai_membership', 'active')]).allowed, true);
});

/* ── 5 · all three live Programs against realistic fixtures ─────────────── */

test('all three Programs: the owner fixture (membership + every standalone)', () => {
  // Mirrors the live owner account: ai_membership plus all three Programs.
  const rows = [buy('ai_membership', 'active'), buy('fat_loss_blueprint', 'active'),
    buy('muscle_gain', 'active'), buy('glute_builder', 'active')];
  for (const p of CATALOG) {
    const v = resolveProgramAccess(p, rows);
    assert.strictEqual(v.allowed, true, p.slug);
    assert.strictEqual(v.source, 'standalone', p.slug);
    assert.strictEqual(v.via.membership, true, p.slug);
  }
});

test('all three Programs: membership only → allowed via membership', () => {
  const rows = [buy('ai_membership', 'active')];
  for (const p of CATALOG) {
    const v = resolveProgramAccess(p, rows);
    assert.strictEqual(v.allowed, true, p.slug);
    assert.strictEqual(v.source, 'membership', p.slug);
  }
});

test('all three Programs: the refunded-only user is denied everywhere', () => {
  // Mirrors the second live user, who holds a refunded glute_builder row.
  const rows = [buy('glute_builder', 'refunded')];
  for (const p of CATALOG) {
    assert.strictEqual(resolveProgramAccess(p, rows).allowed, false, p.slug);
  }
});

test('all three Programs: no purchases → denied everywhere', () => {
  for (const p of CATALOG) {
    assert.strictEqual(resolveProgramAccess(p, []).allowed, false, p.slug);
  }
});

/* ── 6 · branch predicates ──────────────────────────────────────────────── */

test('membership predicate matches the resolver policy', () => {
  assert.strictEqual(entHasQualifyingMembership([buy('ai_membership', 'active')]), true);
  assert.strictEqual(entHasQualifyingMembership([buy('ai_membership', 'past_due')]), true);
  assert.strictEqual(entHasQualifyingMembership([buy('ai_membership', 'canceled')]), false);
  assert.strictEqual(entHasQualifyingMembership([buy('muscle_gain', 'active')]), false);
  assert.strictEqual(entHasQualifyingMembership(null), false);
});

test('standalone predicate matches the resolver policy', () => {
  assert.strictEqual(entOwnsStandalone([buy('muscle_gain', 'active')], 'muscle_gain'), true);
  assert.strictEqual(entOwnsStandalone([buy('muscle_gain', 'refunded')], 'muscle_gain'), false);
  assert.strictEqual(entOwnsStandalone([buy('muscle_gain', 'active')], 'glute_builder'), false);
  assert.strictEqual(entOwnsStandalone(null, 'muscle_gain'), false);
  assert.strictEqual(entOwnsStandalone([buy('muscle_gain', 'active')], ''), false);
});

test('the qualifying-status list is exactly the approved policy', () => {
  assert.deepStrictEqual(ENT_QUALIFYING_STATUSES, ['active', 'past_due']);
  assert.strictEqual(ENT_MEMBERSHIP_PRODUCT, 'ai_membership');
});

/* ── 7 · purity and scope guards ────────────────────────────────────────── */

test('purity: the resolver touches no IO of any kind', () => {
  const src = readCode('entitlement-core.js');
  for (const banned of ['supabaseClient', 'fetch(', 'document', 'window',
    'sessionStorage', 'localStorage', 'stripe', 'Stripe', 'require(']) {
    assert.ok(!src.includes(banned), `entitlement-core must not reference ${banned}`);
  }
});

test('purity: the resolver never mutates its inputs', () => {
  const program = prog('glute_builder');
  const rows = [buy('ai_membership', 'active'), buy('glute_builder', 'active')];
  const programSnapshot = JSON.stringify(program);
  const rowsSnapshot = JSON.stringify(rows);
  resolveProgramAccess(program, rows);
  assert.strictEqual(JSON.stringify(program), programSnapshot);
  assert.strictEqual(JSON.stringify(rows), rowsSnapshot);
});

test('determinism: repeated calls agree', () => {
  const rows = [buy('ai_membership', 'past_due'), buy('muscle_gain', 'refunded')];
  const first = resolveProgramAccess(prog('muscle_gain'), rows);
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(resolveProgramAccess(prog('muscle_gain'), rows), first);
  }
});

test('scope: CP2a migrated no call site — every legacy check is untouched', () => {
  // CP2b owns migration. Until then the resolver has zero consumers and CP2a
  // is removable with no user-visible effect.
  const consumers = ['program-state.js', 'profile.html', 'workout.html', 'app.html',
    'store.html', 'program-fat-loss.html', 'program-muscle-gain.html',
    'program-glute-builder.html'];
  for (const f of consumers) {
    assert.ok(!/entitlement-core/.test(read(f)),
      `${f} must not consume the resolver until CP2b`);
  }
});

test('scope: the legacy per-surface purchase checks still exist unchanged', () => {
  // Proof the live access path was not quietly altered.
  for (const f of ['program-fat-loss.html', 'program-muscle-gain.html',
    'program-glute-builder.html']) {
    assert.match(read(f), /from\('purchases'\)/, `${f} still does its own check`);
  }
  assert.match(read('program-state.js'), /from\('purchases'\)/);
});

test('scope: no page loads the module, so no bootstrap surface changed', () => {
  // 4.3.5F is still unmeasured; CP2a must not touch Home or Train startup.
  for (const f of ['app.html', 'workout.html', 'profile.html', 'nutrition.html',
    'weight-history.html']) {
    assert.ok(!/entitlement-core\.js/.test(read(f)),
      `${f} must not load entitlement-core.js in CP2a`);
  }
});
