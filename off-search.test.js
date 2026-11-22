// Open Food Facts community fallback for search (api/_off.js + /api/usda-search
// + the search screen). Run via `npm test`. No network, no database.
//
// Pins the owner-approved rules (2026-11-22): the fallback runs only when no
// USDA result mentions a word the member typed; its foods pass the same gate
// as the barcode fallback; they come back as a SEPARATE `community` list that
// only the search screen shows — ranked `foods`, Quick Log and saved meals
// never see them.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const off = require('./api/_off.js');
const search = require('./api/usda-search.js')._internals;

const royoBuns = (over) => Object.assign({ code: '0736613480273', product_name: 'Burger Buns', brands: 'ROYO',
  serving_size: '1 bun (60 g)', serving_quantity: 60, serving_quantity_unit: 'g',
  nutriments: { 'energy-kcal_100g': 150, proteins_100g: 15, carbohydrates_100g: 50, fiber_100g: 38.3, fat_100g: 4.17 } }, over || {});
const rolo = { description: 'ROLO, CHEWY CARAMEL IN MILK CHOCOLATE', brand: 'ROLO' };

test('missingQueryWords: only words no USDA result mentions; measures and short words never count', () => {
  assert.deepStrictEqual(off.missingQueryWords('royo', [rolo]), ['royo']);
  assert.deepStrictEqual(off.missingQueryWords('royo bagels', [{ description: 'Bagels, plain' }]), ['royo']);
  assert.deepStrictEqual(off.missingQueryWords('chicken breasts', [{ description: 'Chicken, breast, raw' }]), []);
  assert.deepStrictEqual(off.missingQueryWords('2 slices royo bread', [{ description: 'Bread, white' }]), ['royo']);
  assert.deepStrictEqual(off.missingQueryWords('fage greek yogurt', [{ description: 'Greek yogurt', brand: 'FAGE' }]), []);
  assert.deepStrictEqual(off.missingQueryWords('egg', []), [], '3-letter words never trigger a lookup');
  assert.deepStrictEqual(off.missingQueryWords('royo', []), ['royo'], 'nothing at all from USDA');
});

test('communityFoods: plausible, relevant, deduped, best match first, capped', () => {
  const products = [
    royoBuns({ product_name: 'Hamburger buns', brands: 'Wonder' }),                      // not about "royo"
    royoBuns({ product_name: 'Everything Bagel', code: '1' }),
    royoBuns(),
    royoBuns(),                                                                         // duplicate
    royoBuns({ product_name: 'Royo Bread', brands: 'x', nutriments: { 'energy-kcal_100g': 4000, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }), // fails the gate
  ];
  const foods = off.communityFoods(products, 'royo buns', ['royo']);
  assert.deepStrictEqual(foods.map((f) => f.description), ['Burger Buns', 'Everything Bagel'], 'both words beat one word');
  foods.forEach((f) => {
    assert.strictEqual(f.group, 'community');
    assert.strictEqual(f.source, 'off');
    assert.strictEqual(f.unverified, true);
    assert.strictEqual(f.fdcId, null, 'never a USDA identity');
  });
  const many = Array.from({ length: 20 }, (_, i) => royoBuns({ product_name: 'Royo item ' + i }));
  assert.strictEqual(off.communityFoods(many, 'royo', ['royo']).length, off.OFF_SEARCH_MAX);
  assert.deepStrictEqual(off.communityFoods(null, 'royo', ['royo']), []);
});

function withFetch(impl, run) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve().then(run).finally(() => { global.fetch = orig; });
}
function resetOff() {
  off.offSearchMemo.clear(); off.offSearchCalls.length = 0;
  off.offServingMemo.clear(); off.offProductCalls.length = 0;
}
// Search-a-licious carries no serving fields — the hit as their index returns it.
const hit = (over) => { const p = royoBuns(over); delete p.serving_size; delete p.serving_quantity; delete p.serving_quantity_unit; return p; };
// A fake Open Food Facts: search answers `hits`, the product API answers servings.
function offWorld(o) {
  const log = { search: [], product: [] };
  const impl = async (url, init) => {
    const u = String(url);
    if (u.startsWith(off.OFF_SEARCH_ENDPOINT)) {
      log.search.push({ url: u, ua: init.headers['User-Agent'] });
      if (o.searchFail) throw new Error('down');
      return { ok: true, json: async () => ({ hits: o.hits }) };
    }
    if (u.startsWith(off.OFF_PRODUCT_ENDPOINT)) {
      const code = u.slice(off.OFF_PRODUCT_ENDPOINT.length).split('?')[0];
      log.product.push(code);
      if (o.productFail) return { ok: false, status: 503, json: async () => ({}) };
      const sv = (o.servings || {})[code];
      return { ok: true, json: async () => ({ status: 1, product: sv || {} }) };
    }
    throw new Error('unexpected fetch ' + u);
  };
  return { impl, log };
}

test('searchOpenFoodFacts: identifies itself, US-only, fills label servings, remembers answers', async () => {
  resetOff();
  const w = offWorld({ hits: [hit(), hit({ code: '0736613480075', product_name: 'Royo Artisan Bread' })],
    servings: { '0736613480273': { serving_size: '60g', serving_quantity: '60', serving_quantity_unit: 'g' },
      '0736613480075': { serving_size: '1 slice (32 g)', serving_quantity: 32, serving_quantity_unit: 'g' } } });
  await withFetch(w.impl, async () => {
    const a = await off.searchOpenFoodFacts('Royo', ['royo']);
    assert.strictEqual(a.ok, true);
    assert.deepStrictEqual(a.foods.map((f) => [f.description, f.servingSize, f.householdServing]),
      [['Burger Buns', 60, '60g'], ['Royo Artisan Bread', 32, '1 slice (32 g)']]);
    a.foods[0].description = 'mutated';
    const b = await off.searchOpenFoodFacts('royo', ['royo']);
    assert.strictEqual(b.foods[0].description, 'Burger Buns', 'callers never share the memo');
  });
  assert.strictEqual(w.log.search.length, 1, 'second ask served from memory');
  assert.strictEqual(w.log.product.length, 2);
  const url = new URL(w.log.search[0].url);
  assert.strictEqual(url.searchParams.get('q'), 'royo countries_tags:"en:united-states"');
  assert.match(w.log.search[0].ua, /^MuscleMotivation\//);

  resetOff();
  const down = offWorld({ hits: [hit()], productFail: true });
  await withFetch(down.impl, async () => {
    const r = await off.searchOpenFoodFacts('royo', ['royo']);
    assert.strictEqual(r.ok, true, 'a missing serving never fails the search');
    assert.strictEqual(r.foods[0].servingSize, null, 'per 100 g until a serving is known');
  });
  assert.strictEqual(off.offServingMemo.size, 0, 'a failed serving read is not remembered');

  resetOff();
  await withFetch(async () => { throw new Error('network'); }, async () => {
    assert.deepStrictEqual(await off.searchOpenFoodFacts('royo', ['royo']), { foods: [], ok: false });
  });
  await withFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }), async () => {
    assert.deepStrictEqual(await off.searchOpenFoodFacts('royo', ['royo']), { foods: [], ok: false });
  });
  assert.strictEqual(off.offSearchMemo.size, 0, 'a failure is never remembered');
});

test('searchOpenFoodFacts: stays under their per-minute cap', async () => {
  resetOff();
  let n = 0;
  await withFetch(async () => { n++; return { ok: true, json: async () => ({ hits: [] }) }; }, async () => {
    for (let i = 0; i < off.OFF_SEARCH_PER_MIN + 3; i++) await off.searchOpenFoodFacts('brand' + i + 'x', ['brand']);
    const capped = await off.searchOpenFoodFacts('another brand', ['another']);
    assert.strictEqual(capped.ok, false, 'over the cap → "could not ask", never a request');
  });
  assert.strictEqual(n, off.OFF_SEARCH_PER_MIN);
  resetOff();
});

test('serving lookups stay under the product API cap and only for the top results', async () => {
  resetOff();
  const many = Array.from({ length: 8 }, (_, i) => hit({ code: String(1000 + i), product_name: 'Royo item ' + i }));
  const w = offWorld({ hits: many, servings: {} });
  await withFetch(w.impl, async () => { await off.searchOpenFoodFacts('royo', ['royo']); });
  assert.strictEqual(w.log.product.length, off.OFF_SERVING_DETAIL);
  off.offProductCalls.length = 0;
  for (let i = 0; i < off.OFF_PRODUCT_PER_MIN; i++) off.offProductCalls.push(Date.now());
  const w2 = offWorld({ hits: [hit({ code: '42' })], servings: {} });
  await withFetch(w2.impl, async () => { await off.searchOpenFoodFacts('royo bun', ['royo']); });
  assert.strictEqual(w2.log.product.length, 0, 'budget spent → no product read');
  resetOff();
});

test('route: community is added beside foods, never into them; failures mark the answer degraded', async () => {
  resetOff();
  await withFetch(offWorld({ hits: [hit()] }).impl, async () => {
    const foods = [Object.assign({ fdcId: 1, group: 'branded' }, rolo)];
    const out = { status: 200, body: { foods: foods.slice() } };
    await search.addCommunityFoods('royo', out);
    assert.deepStrictEqual(out.body.foods, foods, 'ranked foods untouched');
    assert.deepStrictEqual(out.body.community.map((f) => f.description), ['Burger Buns']);
    assert.ok(!out.degraded);

    const covered = { status: 200, body: { foods: [{ description: 'Chicken, breast', fdcId: 2 }] } };
    await search.addCommunityFoods('chicken breast', covered);
    assert.ok(!('community' in covered.body), 'USDA already covers it → no lookup');
  });
  resetOff();
  await withFetch(async () => { throw new Error('down'); }, async () => {
    const out = { status: 200, body: { foods: [rolo] } };
    await search.addCommunityFoods('royo', out);
    assert.ok(!('community' in out.body));
    assert.strictEqual(out.degraded, true, 'never stored in the 24 h cache');
  });
  resetOff();
  const err = { status: 500, body: { error: 'x' } };
  await search.addCommunityFoods('royo', err);
  assert.deepStrictEqual(err, { status: 500, body: { error: 'x' } });
});

test('the cache fingerprint covers the fallback module', () => {
  const src = fs.readFileSync(path.join(__dirname, 'api/usda-search.js'), 'utf8');
  assert.match(src, /require\.resolve\('\.\/_off\.js'\)/);
});

/* ── the search screen ───────────────────────────────────────────────── */
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
const page = { window: null, document: { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] } };
let fetched = 0;
const usdaRow = { fdcId: 1596549, description: 'ROLO, CHEWY CARAMEL IN MILK CHOCOLATE', brand: 'ROLO', dataType: 'Branded', group: 'branded',
  servingSize: 17, servingSizeUnit: 'g', nutrients: { kcal: 471, protein: 5.9, carbs: 70.6, fat: 20.6, fiber: 0, sugar: 64.7 } };
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Error, Set, Map,
  document: page.document,
  fetch: async (u) => {
    fetched++;
    if (String(u).startsWith('/api/usda-search')) {
      return { ok: true, json: async () => ({ foods: [usdaRow], community: [off.communityFoods([royoBuns()], 'royo', ['royo'])[0]] }) };
    }
    if (String(u).startsWith('/api/usda-food')) return { ok: true, json: async () => ({ portions: [] }) };
    throw new Error('unexpected fetch ' + u);
  },
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) }, from: () => { throw new Error('no DB'); } },
  showToast: () => {},
});
ctx.window = ctx;
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
});
vm.runInContext('nu_favorites = []; nu_favKeys = {}; nu_ownFoods = []; nu_corrections = [];', ctx);

test('only the search screen asks for community foods; Quick Log and saved meals never get them', async () => {
  const plain = await ctx.nuUsdaSearch('royo');
  assert.deepStrictEqual(plain.map((f) => f.description), [usdaRow.description], 'resolver paths: USDA only');
  const before = fetched;
  const withC = await ctx.nuUsdaSearch('royo', { withCommunity: true });
  assert.strictEqual(fetched, before, 'answered from the per-query cache');
  assert.deepStrictEqual(withC.map((f) => f.description), [usdaRow.description, 'Burger Buns']);
  const again = await ctx.nuUsdaSearch('royo');
  assert.deepStrictEqual(again.map((f) => f.description), [usdaRow.description], 'the cached entry keeps them apart');

  const nutritionSrc = fs.readFileSync(path.join(__dirname, 'nutrition.js'), 'utf8');
  const calls = nutritionSrc.match(/withCommunity: true/g) || [];
  assert.strictEqual(calls.length, 1, 'exactly one caller asks — the search screen');
  assert.match(nutritionSrc, /nuUsdaSearch\(q, \{ signal: [^}]*withCommunity: true \}\)/);
});

test('community rows render last, under their own header, labelled Unverified, without one-tap add', async () => {
  el('nuUsdaInput').value = 'royo';
  el('nuFoodId').value = '';
  await ctx.nuRunUsdaSearch('royo');
  const html = el('nuUsdaResults').innerHTML;
  const iBranded = html.indexOf('Branded foods');
  const iCommunity = html.indexOf('Community foods · Open Food Facts');
  assert.ok(iBranded !== -1 && iCommunity > iBranded, 'community header after the USDA rows');
  const communityPart = html.slice(iCommunity);
  assert.match(communityPart, /Burger Buns/);
  assert.match(communityPart, /nu-unverified-sm">Unverified/);
  assert.ok(!/nu-verified-sm/.test(communityPart), 'never the USDA mark');
  assert.ok(!/nuQuickAdd\('usda',1\)/.test(html), 'no one-tap add for community data');
  assert.ok(/nuQuickAdd\('usda',0\)/.test(html), 'USDA rows keep it');
  assert.strictEqual(vm.runInContext('nuIsUnverified(nu_usdaResults[1])', ctx), true, 'saved as a manual entry');
});
