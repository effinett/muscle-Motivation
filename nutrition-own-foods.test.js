// "Your foods" inside food search (roadmap 5.4.1 / 5.4.2 refinement).
// Run via `npm test` (node --test). No network, no database.
//
// Covers the shared matcher (food-core.js nuMatchOwnFoods), the favorites +
// recents merge, the rendered section, the database-list de-duplication, and
// the tap path — with the same vm page-load harness as
// nutrition-search-cache.test.js plus a tiny element stub.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/* ── minimal browser globals ─────────────────────────────────────────── */
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
global.window = global;
global.document = { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
global.fetch = async () => { throw new Error('search must not hit the network in these tests'); };
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched'); },
};

['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});

nu_favorites = []; nu_favKeys = {};   // favorites cache pre-seeded: the star sync never queries

const names = (rows) => rows.map((r) => r.name);
const pool = () => [
  { name: 'Chicken Breast, grilled' },
  { name: 'Egg, whole, raw' },
  { name: 'Greek Yogurt, plain', brand: 'Fage' },
  { name: 'Rolled Oats' },
  { name: 'Breaded Chicken Tenders' },
];

/* ── shared matcher ──────────────────────────────────────────────────── */
test('nuMatchOwnFoods: every query word must begin a word of the name or brand', () => {
  assert.deepStrictEqual(names(nuMatchOwnFoods('chi bre', pool())), ['Chicken Breast, grilled', 'Breaded Chicken Tenders']);
  assert.deepStrictEqual(names(nuMatchOwnFoods('fage', pool())), ['Greek Yogurt, plain'], 'brand words match');
  assert.deepStrictEqual(names(nuMatchOwnFoods('icken', pool())), [], 'mid-word fragments do not match');
  assert.deepStrictEqual(names(nuMatchOwnFoods('chicken rice', pool())), [], 'all words are required');
});

test('nuMatchOwnFoods: plural-insensitive, case- and punctuation-insensitive', () => {
  assert.deepStrictEqual(names(nuMatchOwnFoods('EGGS', pool())), ['Egg, whole, raw']);
  assert.deepStrictEqual(names(nuMatchOwnFoods('oat', pool())), ['Rolled Oats']);
  assert.deepStrictEqual(names(nuMatchOwnFoods('  yogurt,  ', pool())), ['Greek Yogurt, plain']);
});

test('nuMatchOwnFoods: name-prefix matches lead; otherwise caller order is kept; limit applies', () => {
  assert.deepStrictEqual(names(nuMatchOwnFoods('bre', pool())), ['Breaded Chicken Tenders', 'Chicken Breast, grilled']);
  assert.deepStrictEqual(names(nuMatchOwnFoods('chicken', pool())), ['Chicken Breast, grilled', 'Breaded Chicken Tenders']);
  assert.strictEqual(nuMatchOwnFoods('chicken', pool(), 1).length, 1);
});

test('nuMatchOwnFoods: empty query returns the leading items; bad input is safe', () => {
  assert.deepStrictEqual(names(nuMatchOwnFoods('', pool(), 3)), names(pool().slice(0, 3)));
  assert.deepStrictEqual(nuMatchOwnFoods('egg', null), []);
  assert.deepStrictEqual(nuMatchOwnFoods('egg', [null, {}, { name: 'Egg' }]).length, 1);
});

/* ── merge ───────────────────────────────────────────────────────────── */
const favRow = (o) => Object.assign({ food_key: 'usda:1', food_name: 'Bananas, raw', brand_name: null, fdc_id: 1,
  calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, raw_food: null, gtin_upc: null, serving_unit: null, serving_qty: null }, o);

test('nuMergeOwnFoods: favorites first, recents after, one row per food identity', () => {
  const merged = nuMergeOwnFoods(
    [favRow({})],
    [{ food_key: 'usda:1', name: 'Bananas, raw', usda_fdc_id: 1, calories: 105 },   // same food as the favorite
     { food_key: 'custom:protein shake', name: 'Protein Shake', calories: 220 }]);
  assert.deepStrictEqual(merged.map((m) => [m.name, m.own]), [['Bananas, raw', 'favorite'], ['Protein Shake', 'recent']]);
  assert.strictEqual(merged[0].calories, 105);
  assert.strictEqual(merged[0].usda_fdc_id, 1);
});

/* ── rendered section + de-duplication + tap ─────────────────────────── */
test('search box shows matching own foods instantly and the database list omits them', () => {
  nu_ownFoods = nuMergeOwnFoods(
    [favRow({})],
    [{ food_key: 'custom:banana bread', name: 'Banana Bread', calories: 196 }]);
  nu_usdaResults = [
    { name: 'Bananas, raw', usda_fdc_id: 1, group: 'generic', calories: 105 },
    { name: 'Bananas, dehydrated', usda_fdc_id: 2, group: 'generic', calories: 346 },
  ];
  nuRenderOwnResults('banana');
  const own = el('nuOwnResults').innerHTML;
  assert.match(own, /Your foods/);
  assert.match(own, /Favorite/);
  assert.match(own, /Recent/);
  assert.strictEqual((own.match(/nuPickOwn\(/g) || []).length, 2);

  nuRenderUsdaResults();
  const db = el('nuUsdaResults').innerHTML;
  assert.ok(!/nuPickUsda\(0\)/.test(db), 'the favorite banana is not repeated in the database list');
  assert.match(db, /nuPickUsda\(1\)/, 'other results keep their original index');

  nuRenderOwnResults('zzz');
  assert.strictEqual(el('nuOwnResults').innerHTML, '', 'no match → no section');
  nuRenderUsdaResults();
  assert.match(el('nuUsdaResults').innerHTML, /nuPickUsda\(0\)/, 'and the database row returns');
});

test('tapping a custom own food prefills the form and keeps the chosen meal', () => {
  nu_ownFoods = nuMergeOwnFoods([], [{ food_key: 'custom:protein shake', name: 'Protein Shake',
    calories: 220, protein: 30, carbs: 9, fat: 6 }]);
  el('nuMeal').value = 'dinner';
  nuRenderOwnResults('shake');
  nuPickOwn(0);
  assert.strictEqual(el('nuName').value, 'Protein Shake');
  assert.strictEqual(el('nuCalories').value, 220);
  assert.strictEqual(el('nuProtein').value, 30);
  assert.strictEqual(el('nuServings').value, 1);
  assert.strictEqual(el('nuMeal').value, 'dinner', 'meal picked before searching is untouched');
  assert.strictEqual(nu_pendingSource, null, 'a custom food carries no USDA provenance');
  assert.strictEqual(nu_formBackTo, 'search', 'back returns to the search');
});

test('tapping an own food with a stored USDA payload opens the serving card', () => {
  const raw = { fdcId: 9, description: 'Oats, rolled', dataType: 'SR Legacy',
    nutrients: { kcal: 379, protein: 13, carbs: 68, fat: 6.5, fiber: 10, sugar: 1 },
    portions: [{ label: '1 cup', amount: 1, gramWeight: 81 }] };
  nu_ownFoods = nuMergeOwnFoods([favRow({ food_key: 'usda:9', food_name: 'Oats, rolled', fdc_id: 9, raw_food: raw })], []);
  nuRenderOwnResults('oats');
  nuPickOwn(0);
  assert.ok(nu_pendingSource && String(nu_pendingSource.usda_fdc_id) === '9', 'card is backed by the USDA food');
  assert.ok(nu_detailCache[9], 'stored portions seed the detail cache (no request needed)');
});
