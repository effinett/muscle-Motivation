// Barcode lookup — Open Food Facts fallback (owner-approved 2026-11-11).
// Run via `npm test` (node --test). No network: USDA and Open Food Facts are
// stubbed with responses in their documented shapes.
//
// USDA stays the first and only verified source. Open Food Facts is tried ONLY
// on a clean USDA miss; its food is flagged unverified, must carry a complete
// and plausible panel (else "not found", exactly as before), and is logged by
// the client as a MANUAL entry — USDA provenance is never stamped on it.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const route = require('./api/usda-barcode.js');
const { offToFood, lookupOpenFoodFacts, lookupBarcode, offMemo, OFF_USER_AGENT, OFF_ENDPOINT } = route._internals;

const offProduct = (over) => Object.assign({
  code: '0123456789012',
  product_name: '  Almond  Protein Bar ',
  brands: 'Acme Foods, Acme',
  serving_size: '1 bar (60 g)', serving_quantity: 60, serving_quantity_unit: 'g',
  nutriments: { 'energy-kcal_100g': 400, 'energy_100g': 1674, proteins_100g: 30, carbohydrates_100g: 40,
    fat_100g: 13.33, fiber_100g: 8, sugars_100g: 5.04 },
}, over || {});

function withFetch(impl, run) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve().then(run).finally(() => { global.fetch = orig; });
}
// USDA finds nothing unless told otherwise; OFF returns `off` (object | status code).
function world(o) {
  const log = { usda: 0, off: [] };
  const impl = async (url, init) => {
    const s = String(url);
    if (s.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1' }) };
    if (s.startsWith('https://api.nal.usda.gov/')) {
      log.usda++;
      return { ok: true, json: async () => ({ foods: o.usdaFoods || [] }) };
    }
    if (s.startsWith(OFF_ENDPOINT)) {
      log.off.push({ url: s, ua: init && init.headers && init.headers['User-Agent'] });
      if (o.offThrow) throw new Error('network');
      if (typeof o.off === 'number') return { ok: false, status: o.off, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => o.off };
    }
    throw new Error('unexpected fetch ' + s);
  };
  return { impl, log };
}

/* ── mapping ─────────────────────────────────────────────────────────── */
test('offToFood: a complete panel maps to the trimmed USDA shape, flagged unverified', () => {
  const f = offToFood(offProduct(), '0123456789012');
  assert.deepStrictEqual(f, {
    fdcId: null, description: 'Almond Protein Bar', dataType: 'Open Food Facts', foodCategory: '',
    brand: 'Acme Foods', gtinUpc: '0123456789012',
    servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar (60 g)',
    nutrients: { kcal: 400, protein: 30, carbs: 40, fat: 13.3, fiber: 8, sugar: 5 },
    group: 'branded', source: 'off', unverified: true,
  });
});

test('offToFood: kJ is converted when kcal is absent; missing fiber/sugar are zero', () => {
  const f = offToFood(offProduct({ nutriments: { 'energy-kj_100g': 1674, proteins_100g: 30, carbohydrates_100g: 40, fat_100g: 13.3 } }), '1');
  assert.strictEqual(f.nutrients.kcal, 400);
  assert.strictEqual(f.nutrients.fiber, 0);
  assert.strictEqual(f.nutrients.sugar, 0);
});

test('offToFood: anything short of a complete, plausible panel is rejected', () => {
  const bad = (patch) => offToFood(offProduct(patch), '1');
  const n = offProduct().nutriments;
  const without = (k) => { const c = Object.assign({}, n); delete c[k]; if (k === 'energy-kcal_100g') delete c.energy_100g; return { nutriments: c }; };
  assert.strictEqual(bad({ product_name: '   ' }), null, 'no name');
  assert.strictEqual(bad({ nutriments: undefined }), null, 'no nutrition');
  for (const k of ['energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']) {
    assert.strictEqual(bad(without(k)), null, 'missing ' + k);
  }
  assert.strictEqual(bad({ nutriments: Object.assign({}, n, { 'energy-kcal_100g': 4000 }) }), null, 'kJ typed into the kcal field');
  assert.strictEqual(bad({ nutriments: Object.assign({}, n, { proteins_100g: 130 }) }), null, 'more than 100 g per 100 g');
  assert.strictEqual(bad({ nutriments: Object.assign({}, n, { proteins_100g: -3 }) }), null, 'negative value');
  assert.strictEqual(bad({ nutriments: Object.assign({}, n, { 'energy-kcal_100g': 150 }) }), null, 'energy disagrees with the macros');
  assert.strictEqual(bad({ nutriments: Object.assign({}, n, { fat_100g: 'n/a' }) }), null, 'non-numeric macro');
  assert.strictEqual(offToFood(null, '1'), null);
});

test('offToFood: zero-calorie drinks pass; serving is kept only when usable', () => {
  const water = offToFood(offProduct({ product_name: 'Sparkling Water', serving_quantity: 355, serving_quantity_unit: 'ml',
    serving_size: '1 can', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 } }), '1');
  assert.strictEqual(water.nutrients.kcal, 0);
  assert.strictEqual(water.servingSizeUnit, 'ml');
  const noServing = offToFood(offProduct({ serving_quantity: undefined, serving_size: 'about a handful' }), '1');
  assert.deepStrictEqual([noServing.servingSize, noServing.servingSizeUnit, noServing.householdServing], [null, '', '']);
  const oddUnit = offToFood(offProduct({ serving_quantity: 2, serving_quantity_unit: 'oz' }), '1');
  assert.strictEqual(oddUnit.servingSize, null, 'only g / ml servings are trusted');
});

/* ── lookup ──────────────────────────────────────────────────────────── */
test('lookupOpenFoodFacts: one identified request; exact-barcode guard; never throws', async () => {
  offMemo.clear();
  const w = world({ off: { code: '0123456789012', status: 1, product: offProduct() } });
  const f = await withFetch(w.impl, () => lookupOpenFoodFacts('123456789012'));     // UPC-A scan of a zero-padded code
  assert.strictEqual(f.description, 'Almond Protein Bar');
  assert.strictEqual(w.log.off.length, 1);
  assert.match(w.log.off[0].url, /\/api\/v2\/product\/123456789012\?fields=code,product_name,brands,nutriments,/);
  assert.strictEqual(w.log.off[0].ua, OFF_USER_AGENT);
  assert.match(OFF_USER_AGENT, /^MuscleMotivation\/\d/);

  offMemo.clear();
  const other = world({ off: { code: '9999999999999', status: 1, product: offProduct({ code: '9999999999999' }) } });
  assert.strictEqual(await withFetch(other.impl, () => lookupOpenFoodFacts('123456789012')), null, 'a different product is never accepted');

  offMemo.clear();
  for (const o of [{ off: { status: 0, status_verbose: 'product not found' } }, { off: 404 }, { off: 503 }, { offThrow: true }, { off: 'not json' }]) {
    offMemo.clear();
    assert.strictEqual(await withFetch(world(o).impl, () => lookupOpenFoodFacts('123456789012')), null, JSON.stringify(o));
  }
});

test('lookupOpenFoodFacts: hits and real misses are remembered; outages are not', async () => {
  offMemo.clear();
  const hit = world({ off: { code: '123456789012', status: 1, product: offProduct({ code: '123456789012' }) } });
  await withFetch(hit.impl, async () => {
    const a = await lookupOpenFoodFacts('123456789012');
    a.description = 'mutated';
    const b = await lookupOpenFoodFacts('0123456789012');                            // same product, padded
    assert.strictEqual(b.description, 'Almond Protein Bar', 'memo hands out copies');
  });
  assert.strictEqual(hit.log.off.length, 1, 'second lookup made no request (15/min limit)');

  offMemo.clear();
  const miss = world({ off: 404 });
  await withFetch(miss.impl, async () => { await lookupOpenFoodFacts('55555555'); await lookupOpenFoodFacts('55555555'); });
  assert.strictEqual(miss.log.off.length, 1, 'a real miss is remembered');

  offMemo.clear();
  const down = world({ off: 503 });
  await withFetch(down.impl, async () => { await lookupOpenFoodFacts('55555555'); await lookupOpenFoodFacts('55555555'); });
  assert.strictEqual(down.log.off.length, 2, 'an outage is retried next time');
});

test('lookupBarcode: USDA first — Open Food Facts is only asked on a clean USDA miss', async () => {
  offMemo.clear();
  const usdaFood = { fdcId: 777, description: 'PROTEIN BAR', dataType: 'Branded', brandName: 'Acme', gtinUpc: '00123456789012',
    servingSize: 60, servingSizeUnit: 'g', foodNutrients: [{ nutrientId: 1008, value: 350 }, { nutrientId: 1003, value: 33 }] };
  const found = world({ usdaFoods: [usdaFood], off: { code: '123456789012', status: 1, product: offProduct() } });
  const a = await withFetch(found.impl, () => lookupBarcode('123456789012'));
  assert.strictEqual(a.body.food.fdcId, 777);
  assert.ok(!a.body.food.unverified);
  assert.strictEqual(found.log.off.length, 0, 'USDA matched → Open Food Facts never contacted');

  const fallback = world({ off: { code: '123456789012', status: 1, product: offProduct({ code: '123456789012' }) } });
  const b = await withFetch(fallback.impl, () => lookupBarcode('123456789012'));
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.body.food.unverified, true);
  assert.strictEqual(b.body.food.source, 'off');
  assert.strictEqual(b.body.food.fdcId, null);

  offMemo.clear();
  const none = world({ off: 404 });
  const c = await withFetch(none.impl, () => lookupBarcode('123456789012'));
  assert.deepStrictEqual(c, { status: 200, body: { food: null } }, 'neither source has it → the same answer as before');
});

test('route: an unverified result is cached for an hour, a USDA one for a day', async () => {
  offMemo.clear();
  const mk = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
  const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { code: '123456789012' } };
  const off = world({ off: { code: '123456789012', status: 1, product: offProduct({ code: '123456789012' }) } });
  const r1 = mk();
  await withFetch(off.impl, () => route(req, r1));
  assert.strictEqual(r1.code, 200);
  assert.strictEqual(r1.headers['Cache-Control'], 'private, max-age=3600');
  const usda = world({ usdaFoods: [{ fdcId: 1, description: 'X', dataType: 'Branded', gtinUpc: '123456789012', foodNutrients: [{ nutrientId: 1008, value: 100 }] }] });
  const r2 = mk();
  await withFetch(usda.impl, () => route(req, r2));
  assert.strictEqual(r2.headers['Cache-Control'], 'private, max-age=86400');
});

/* ── client: labelled, and logged as a manual entry ──────────────────── */
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', className: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
global.window = global;
global.document = { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched'); },
};
global.showToast = () => {};
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = [];

test('client: an Open Food Facts food is labelled Unverified with its source, never the USDA mark', () => {
  nuResetModalState();
  const f = nuNormalizeUsdaFood(offToFood(offProduct(), '0123456789012'));
  assert.strictEqual(nuIsUnverified(f), true);
  assert.strictEqual(f.usda_fdc_id, null);
  nu_usdaResults = [f];
  nuRenderUsdaResults();
  assert.match(el('nuUsdaResults').innerHTML, /nu-unverified-sm">Unverified</);
  assert.ok(!/nu-verified-sm/.test(el('nuUsdaResults').innerHTML));
  assert.ok(!/nuQuickAdd/.test(el('nuUsdaResults').innerHTML), 'no one-tap add on unverified data — it always opens the card');

  nuPickUsda(0);
  assert.strictEqual(el('nuCardHeader').style.display, '', 'it opens as a food card (where the label lives)…');
  assert.strictEqual(el('nuNameGroup').style.display, 'none', '…not as the editable manual form');
  assert.strictEqual(el('nuServingRow').style.display, '');
  assert.strictEqual(el('nuCardSource').textContent, 'Unverified');
  assert.strictEqual(el('nuCardSource').className, 'nu-unverified');
  assert.match(el('nuCardSourceNote').textContent, /Open Food Facts/, 'source is named (attribution)');
  assert.strictEqual(el('nuCardSourceNote').style.display, 'block');
  assert.strictEqual(+el('nuCalories').value, 240, '400 kcal/100 g × the 60 g serving');

  // a USDA food opened afterwards restores the verified mark
  nu_usdaResults = [nuNormalizeUsdaFood({ fdcId: 5, description: 'Egg', dataType: 'SR Legacy', nutrients: { kcal: 143 } })];
  nuPickUsda(0);
  assert.strictEqual(el('nuCardSource').textContent, 'USDA');
  assert.strictEqual(el('nuCardSource').className, 'nu-verified');
  assert.strictEqual(el('nuCardSourceNote').style.display, 'none');
  assert.strictEqual(nuIsUnverified(nu_pendingSource), false);
});

test('client: saving an unverified food writes a MANUAL entry — no USDA provenance', async () => {
  nuResetModalState();
  el('nuFoodId').value = ''; el('nuMeal').value = 'snack';
  nu_usdaResults = [nuNormalizeUsdaFood(offToFood(offProduct(), '0123456789012'))];
  nuPickUsda(0);
  let entry = null;
  const origLog = nuSaveLog, origClose = nuCloseModal;
  nuSaveLog = async (uid, e) => { entry = e; return { error: null, data: { id: 'x' } }; };
  nuCloseModal = () => {};
  try { await nuSave(); } finally { nuSaveLog = origLog; nuCloseModal = origClose; }
  assert.ok(entry, 'saved');
  assert.strictEqual(entry.src, null, 'src is null → nuSaveLog stamps no source=usda, no fdc id, no raw payload');
  assert.strictEqual(entry.name, 'Almond Protein Bar (Acme Foods)');
  assert.strictEqual(entry.calories, 240);
  assert.strictEqual(entry.meal, 'snack');
});
