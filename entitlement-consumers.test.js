/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP2b — migrated entitlement consumers
 *
 * CP2a proved the resolver in isolation. These tests prove the CONSUMERS were
 * actually migrated onto it, that no page kept a private copy of the policy,
 * and that the client verdict matches the installed program_workouts RLS.
 *
 * The RLS side is compared against its DOCUMENTED semantics (recorded in
 * docs/ROADMAP-HISTORY.md → CP2-RLS), not by re-parsing the policy: CI is
 * offline and a second policy implementation would be one more thing to drift.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { resolveProgramAccess, entHasQualifyingMembership } = require('./entitlement-core.js');
const { pcNormalizeCatalog } = require('./program-catalog.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PROGRAM_PAGES = ['program-fat-loss.html', 'program-muscle-gain.html',
  'program-glute-builder.html'];
const ACCESS_SURFACES = [...PROGRAM_PAGES, 'workout.html', 'program-state.js'];
const ALL_SURFACES = [...ACCESS_SURFACES, 'profile.html'];

const CATALOG = pcNormalizeCatalog([
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 1 },
  { slug: 'muscle_gain', name: 'Muscle Gain',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 2 },
  { slug: 'glute_builder', name: 'Glute Builder',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 3 },
]);
const prog = (s) => CATALOG.filter((p) => p.slug === s)[0];
const buy = (product, status) => ({ product, status });

/* ── 1 · the five Program-access surfaces are migrated ──────────────────── */

test('every Program-access surface calls the shared resolver', () => {
  for (const f of ACCESS_SURFACES) {
    assert.match(readCode(f), /resolveProgramAccess\s*\(/,
      `${f} must decide access through entitlement-core`);
  }
});

test('every migrated page loads entitlement-core.js and the catalog', () => {
  for (const f of [...PROGRAM_PAGES, 'workout.html', 'app.html', 'profile.html']) {
    const src = read(f);
    const cat = src.indexOf('program-catalog.js');
    const ent = src.indexOf('entitlement-core.js');
    assert.ok(cat > -1, `${f} loads program-catalog.js`);
    assert.ok(ent > -1, `${f} loads entitlement-core.js`);
    assert.ok(cat < ent, `${f} loads the catalog before the resolver`);
  }
});

/* ── 2 · no surface kept a private copy of the policy ───────────────────── */

test('no Program-access surface filters purchases by status itself', () => {
  // A status filter in the query would silently become a second policy: rows
  // the resolver should have judged would never reach it.
  for (const f of ALL_SURFACES) {
    const src = readCode(f);
    assert.ok(!/\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/.test(src),
      `${f} must not pre-filter purchases to status=active`);
    assert.ok(!/\.in\(\s*['"]status['"]/.test(src),
      `${f} must not carry its own qualifying-status list`);
  }
});

test('no surface re-implements the membership or OR logic', () => {
  for (const f of ACCESS_SURFACES) {
    const src = readCode(f);
    assert.ok(!/['"]ai_membership['"]/.test(src),
      `${f} must not name the membership product — that lives in the resolver`);
    assert.ok(!/included_with_membership|includedWithMembership/.test(src),
      `${f} must not read the inclusion flag directly`);
    assert.ok(!/['"]past_due['"]/.test(src),
      `${f} must not handle past_due itself`);
  }
});

test('only entitlement-core defines the qualifying-status vocabulary', () => {
  const defs = ['entitlement-core.js', 'program-state.js', 'program-catalog.js',
    'profile.html', 'workout.html', ...PROGRAM_PAGES]
    .filter((f) => /ENT_QUALIFYING_STATUSES\s*=/.test(readCode(f)));
  assert.deepStrictEqual(defs, ['entitlement-core.js']);
});

test('program-state.js no longer interprets purchase status', () => {
  const src = readCode('program-state.js');
  assert.match(src, /resolveProgramAccess|_resolveAccess/, 'it delegates');
  assert.ok(!/status\s*===?\s*['"]active['"]/.test(src), 'no local status test');
});

/* ── 3 · client ↔ installed RLS parity ──────────────────────────────────── */

// The documented CP2-RLS semantics, from docs/ROADMAP-HISTORY.md:
//   allow  ⇔  status IN ('active','past_due')
//             AND ( product = slug                                  -- Branch S
//                   OR (product = 'ai_membership'                   -- Branch M
//                       AND program.included_with_membership
//                       AND program.status = 'published') )
function rlsWouldAllow(program, rows) {
  return (rows || []).some((r) => {
    if (!['active', 'past_due'].includes(r.status)) return false;
    if (r.product === program.slug) return true;
    return r.product === 'ai_membership'
      && program.includedWithMembership === true
      && program.status === 'published';
  });
}

const PARITY_CASES = [
  ['standalone active', [buy('muscle_gain', 'active')]],
  ['standalone past_due', [buy('muscle_gain', 'past_due')]],
  ['standalone refunded', [buy('muscle_gain', 'refunded')]],
  ['standalone canceled', [buy('muscle_gain', 'canceled')]],
  ['membership active', [buy('ai_membership', 'active')]],
  ['membership past_due', [buy('ai_membership', 'past_due')]],
  ['membership canceled', [buy('ai_membership', 'canceled')]],
  ['membership refunded', [buy('ai_membership', 'refunded')]],
  ['both active', [buy('ai_membership', 'active'), buy('muscle_gain', 'active')]],
  ['canceled membership + standalone', [buy('ai_membership', 'canceled'), buy('muscle_gain', 'active')]],
  ['unrelated program only', [buy('glute_builder', 'active')]],
  ['neither', []],
];

test('parity: client and RLS agree on every access case', () => {
  for (const [name, rows] of PARITY_CASES) {
    const client = resolveProgramAccess(prog('muscle_gain'), rows).allowed;
    const db = rlsWouldAllow(prog('muscle_gain'), rows);
    assert.strictEqual(client, db,
      `${name}: client=${client} but RLS=${db} — the client must never show an ` +
      'access state the database would deny');
  }
});

test('parity: membership is denied for a not-included Program', () => {
  const excluded = pcNormalizeCatalog([{ slug: 'x', name: 'X',
    included_with_membership: false, standalone_purchasable: true,
    status: 'published', sort_order: 1 }])[0];
  const rows = [buy('ai_membership', 'active')];
  assert.strictEqual(resolveProgramAccess(excluded, rows).allowed, false);
  assert.strictEqual(rlsWouldAllow(excluded, rows), false);
});

test('parity: membership is denied for a draft or retired Program', () => {
  for (const status of ['draft', 'retired']) {
    const p = pcNormalizeCatalog([{ slug: 'x', name: 'X',
      included_with_membership: true, standalone_purchasable: true,
      status, sort_order: 1 }])[0];
    const rows = [buy('ai_membership', 'active')];
    assert.strictEqual(rlsWouldAllow(p, rows), false, `RLS denies ${status}`);
    // The resolver does not read publication status — it is the catalog loader
    // that never serves unpublished rows to the client (programs RLS is
    // status='published'), so the client cannot even construct this case in
    // production. Documented so the asymmetry is deliberate, not a gap.
    assert.strictEqual(resolveProgramAccess(p, rows).allowed, true,
      'resolver is publication-agnostic by design; the catalog gates it');
  }
});

test('parity: an unpublished Program never reaches the client catalog', () => {
  // Which is why the asymmetry above is safe. pcLoadCatalog filters to
  // published, and the programs RLS enforces the same server-side.
  assert.match(readCode('program-catalog.js'), /\.eq\('status',\s*'published'\)/);
});

/* ── 4 · past_due, the approved behaviour change ────────────────────────── */

test('past_due: standalone now grants access (was denied before CP2b)', () => {
  assert.strictEqual(
    resolveProgramAccess(prog('muscle_gain'), [buy('muscle_gain', 'past_due')]).allowed,
    true, 'the pre-CP2b predicate .eq(status,active) denied this');
});

test('past_due: membership now grants included Programs', () => {
  for (const p of CATALOG) {
    assert.strictEqual(
      resolveProgramAccess(p, [buy('ai_membership', 'past_due')]).allowed, true, p.slug);
  }
});

test('past_due: still denied once the subscription is canceled or refunded', () => {
  for (const bad of ['canceled', 'refunded']) {
    assert.strictEqual(
      resolveProgramAccess(prog('muscle_gain'), [buy('ai_membership', bad)]).allowed, false);
  }
});

/* ── 5 · profile membership display ─────────────────────────────────────── */

test('profile uses the shared membership predicate, not a Program object', () => {
  const src = readCode('profile.html');
  assert.match(src, /entHasQualifyingMembership\s*\(/, 'uses the membership predicate');
  assert.ok(!/resolveProgramAccess\s*\(\s*\{/.test(src),
    'must not fabricate a dummy Program to answer a membership question');
});

test('profile membership predicate keeps its existing past_due behaviour', () => {
  assert.strictEqual(entHasQualifyingMembership([buy('ai_membership', 'past_due')]), true);
  assert.strictEqual(entHasQualifyingMembership([buy('ai_membership', 'canceled')]), false);
  assert.strictEqual(entHasQualifyingMembership([buy('muscle_gain', 'active')]), false);
});

test('profile still renders the billing details it always did', () => {
  const src = read('profile.html');
  for (const field of ['current_period_end', 'cancel_at_period_end']) {
    assert.ok(src.includes(field), `${field} is still available for display`);
  }
  assert.match(src, /Payment failed/, 'the past_due warning survives');
});

/* ── 6 · purchase-fetch consolidation ───────────────────────────────────── */

test('profile makes exactly one purchases request', () => {
  const hits = readCode('profile.html').match(/from\('purchases'\)/g) || [];
  assert.strictEqual(hits.length, 1,
    'the Programs list and the billing card share one fetch (was 2)');
});

test('each Program-access surface makes at most one purchases request', () => {
  for (const f of ACCESS_SURFACES) {
    const hits = readCode(f).match(/from\('purchases'\)/g) || [];
    assert.ok(hits.length <= 1, `${f} issues ${hits.length} purchases queries`);
  }
});

test('perf: the catalog load stays parallel to the purchases query', () => {
  // 4.3.5F is unmeasured; entitlement must not add a sequential round trip.
  for (const f of [...PROGRAM_PAGES, 'workout.html', 'program-state.js']) {
    assert.match(readCode(f), /Promise\.all\(\[\s*\n?\s*(typeof\s+)?pcLoadCatalog/,
      `${f} must parallelise the catalog fetch with the purchases query`);
  }
});

/* ── 7 · scope guards ───────────────────────────────────────────────────── */

test('scope: entitlement stayed out of progression and history', () => {
  const src = readCode('workout.html');
  assert.match(src, /user_programs/, 'progression cursor still read');
  assert.ok(!/resolveProgramAccess[\s\S]{0,200}current_index/.test(src),
    'entitlement and progression stay separate concerns');
});

test('scope: CP3 has not started', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, 'routine-core.js')));
  for (const f of ALL_SURFACES) {
    assert.ok(!/routine-core/.test(read(f)), `${f} must not reference CP3 work`);
  }
});

test('scope: no client write path to purchases was introduced', () => {
  for (const f of [...ALL_SURFACES, 'app.html']) {
    const src = readCode(f);
    assert.ok(!/from\('purchases'\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(src),
      `${f} must never write purchases — the Stripe webhook is the sole writer`);
  }
});
