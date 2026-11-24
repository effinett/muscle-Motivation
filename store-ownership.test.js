// store-ownership.test.js — follow-ups to on-site checkout (2026-11-24).
//
//   1. A signed-in member is never offered a second purchase of something they
//      already have: the Store swaps Buy Now for Owned / Included / Member,
//      decided by the shared entitlement resolver — not a page-local check.
//   2. One Programs path: Profile no longer links to the public Store, and a
//      locked paid Program page leads to checkout instead of a dead end.
//   3. Password fields keep room for the Show toggle (and the browser's
//      password-manager icon) — the padding was being overridden.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const STORE = read('store.html');
const ROUTE = read('api/create-checkout-session.js');
const SERVER_SLUGS = [...ROUTE.matchAll(/^\s{2}(\w+):\s*\{ price:/gm)].map((m) => m[1]).sort();

/* ── 1 · Store ownership ────────────────────────────────────────────────── */

test('every sellable Store button is tagged with its server product slug', () => {
  const tagged = [...STORE.matchAll(/data-product="(\w+)" onclick="buyProduct\('(\w+)', this\)"/g)];
  for (const m of tagged) assert.strictEqual(m[1], m[2], 'data-product matches buyProduct slug');
  assert.deepStrictEqual(tagged.map((m) => m[1]).sort(), SERVER_SLUGS);
});

test('Store loads the shared catalog + entitlement resolver after the Supabase client', () => {
  const i = (s) => STORE.indexOf(s);
  assert.ok(i('<script src="supabase.js"></script>') > 0);
  assert.ok(i('<script src="program-catalog.js"></script>') > i('<script src="supabase.js"></script>'));
  assert.ok(i('<script src="entitlement-core.js"></script>') > i('<script src="supabase.js"></script>'));
});

function ownershipFn() {
  const start = STORE.indexOf('async function applyOwnership');
  const end = STORE.indexOf('// Back from checkout.html');
  assert.ok(start > 0 && end > start);
  return STORE.slice(start, end);
}

test('ownership is decided by the shared resolver, from unfiltered purchases', () => {
  const fn = ownershipFn();
  assert.match(fn, /resolveProgramAccess\(/);
  assert.match(fn, /entHasQualifyingMembership\(rows\)/);
  assert.match(fn, /\.from\('purchases'\)\.select\('product, status'\)\.eq\('user_id', session\.user\.id\)/);
  assert.doesNotMatch(fn, /\.eq\('status'/, 'no page-local status filter');
  assert.match(STORE, /applyAuthNav\(!!session\);\s*applyOwnership\(session\);/);
});

// Run the real function against a tiny fake DOM and the real resolver.
function runOwnership(rows, catalog) {
  const ent = require('./entitlement-core.js');
  const buttons = SERVER_SLUGS.map((slug) => {
    const price = { textContent: '$49', classList: { added: [], add(c) { this.added.push(c); } } };
    const parent = { querySelector: (sel) => (sel === '.card-price' ? price : null) };
    const btn = { dataset: { product: slug }, parentElement: parent, replacedWith: null,
      replaceWith(el) { this.replacedWith = el; el.parentElement = parent; } };
    return { slug, btn, price };
  });
  const ctx = {
    ...ent,
    console,
    session: { user: { id: 'u1' } },
    pcLoadCatalog: async () => catalog,
    pcBySlug: (list, s) => list.find((p) => p.slug === s) || null,
    supabaseClient: { from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) },
    document: {
      querySelectorAll: () => buttons.map((b) => b.btn),
      createElement: () => ({ className: '', href: '', textContent: '' }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(ownershipFn() + '\nthis.run = applyOwnership;', ctx);
  return ctx.run(ctx.session).then(() => Object.fromEntries(buttons.map((b) => [b.slug, b])));
}

const CATALOG = [
  { slug: 'fat_loss_blueprint', includedWithMembership: true, pagePath: 'program-fat-loss.html' },
  { slug: 'muscle_gain', includedWithMembership: true, pagePath: 'program-muscle-gain.html' },
  { slug: 'glute_builder', includedWithMembership: true, pagePath: 'program-glute-builder.html' },
];

test('a standalone owner sees Owned + Open Program; everything else stays for sale', async () => {
  const r = await runOwnership([{ product: 'muscle_gain', status: 'active' }], CATALOG);
  assert.strictEqual(r.muscle_gain.btn.replacedWith.textContent, 'Open Program');
  assert.strictEqual(r.muscle_gain.btn.replacedWith.href, 'program-muscle-gain.html');
  assert.strictEqual(r.muscle_gain.price.textContent, 'Owned');
  for (const s of ['fat_loss_blueprint', 'glute_builder', 'ai_membership']) {
    assert.strictEqual(r[s].btn.replacedWith, null, `${s} still purchasable`);
  }
});

test('a member sees Member on the membership card and Included on member Programs', async () => {
  const r = await runOwnership([{ product: 'ai_membership', status: 'active' }], CATALOG);
  assert.strictEqual(r.ai_membership.price.textContent, 'Member');
  assert.strictEqual(r.ai_membership.btn.replacedWith.href, 'app.html');
  assert.strictEqual(r.glute_builder.price.textContent, 'Included');
});

test('refunded / canceled purchases do not hide Buy Now', async () => {
  const r = await runOwnership([
    { product: 'muscle_gain', status: 'refunded' },
    { product: 'ai_membership', status: 'canceled' },
  ], CATALOG);
  for (const s of SERVER_SLUGS) assert.strictEqual(r[s].btn.replacedWith, null, s);
});

test('a purchases read error leaves every Buy button untouched', async () => {
  const ent = require('./entitlement-core.js');
  const ctx = { ...ent, console, pcLoadCatalog: async () => CATALOG, pcBySlug: () => null,
    supabaseClient: { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'x' } }) }) }) },
    document: { querySelectorAll: () => { throw new Error('must not touch the DOM'); } } };
  vm.createContext(ctx);
  vm.runInContext(ownershipFn() + '\nthis.run = applyOwnership;', ctx);
  await ctx.run({ user: { id: 'u1' } });
});

/* ── 2 · One Programs path ──────────────────────────────────────────────── */

test('Profile keeps one Programs entry and no longer links to the Store', () => {
  const profile = read('profile.html');
  assert.match(profile, /<div class="item-name">Browse all programs<\/div>/);
  assert.doesNotMatch(profile, /item-name">Shop programs/);
  assert.doesNotMatch(profile, /href="store\.html"/);
});

for (const [page, slug] of [
  ['program-fat-loss.html', 'fat_loss_blueprint'],
  ['program-muscle-gain.html', 'muscle_gain'],
  ['program-glute-builder.html', 'glute_builder'],
]) {
  test(`${page}: locked state leads to checkout, not a dead end`, () => {
    const html = read(page);
    const locked = html.slice(html.indexOf('<div id="lockedState">'), html.indexOf('<!-- Program content'));
    assert.ok(locked.includes(`href="checkout.html?product=${slug}"`));
    assert.ok(SERVER_SLUGS.includes(slug));
    assert.doesNotMatch(locked, /Unlock it from your dashboard/);
    assert.doesNotMatch(locked, /12-Week/, 'no stale duration in the copy');
  });
}

/* ── 3 · Password Show toggle keeps its space ───────────────────────────── */

for (const page of ['auth.html', 'reset-password.html']) {
  test(`${page}: password padding outranks the generic .form-group input rule`, () => {
    const html = read(page);
    assert.match(html, /\.form-group \.password-wrap input\s*\{[^}]*padding-right:\s*70px/);
    assert.doesNotMatch(html, /\n\s*\.password-wrap input\s*\{/, 'old lower-specificity selector is gone');
  });
}
