// Quantity typed in the food search box (roadmap 5.4.12).
// Run via `npm test` (node --test). No network, no database.
//
// Tier 1: the shared parser (food-ranking.js parseQueryQuantity) and its
// agreement with the query stripping. Tier 2: the card opening with the amount
// applied, through the same vm page-load harness as nutrition-own-foods.test.js.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ranking = require('./food-ranking.js');
const P = ranking.parseQueryQuantity;

/* ── tier 1: parser ──────────────────────────────────────────────────── */
test('weights carry total grams (same convention as the AI parser)', () => {
  assert.deepStrictEqual(P('200g chicken'), { quantity: 200, unit: 'g', grams: 200, food: 'chicken' });
  assert.deepStrictEqual(P('6 oz salmon'), { quantity: 6, unit: 'oz', grams: 170, food: 'salmon' });
  assert.deepStrictEqual(P('1 lb ground beef'), { quantity: 1, unit: 'lb', grams: 454, food: 'ground beef' });
  assert.deepStrictEqual(P('2.5 ounces cheese'), { quantity: 2.5, unit: 'oz', grams: 71, food: 'cheese' });
});

test('household units are canonical singular; "of" is dropped; decimals and fractions read', () => {
  assert.deepStrictEqual(P('1.5 cups rice'), { quantity: 1.5, unit: 'cup', grams: null, food: 'rice' });
  assert.deepStrictEqual(P('1/2 cup oats'), { quantity: 0.5, unit: 'cup', grams: null, food: 'oats' });
  assert.deepStrictEqual(P('.5 cup rice'), { quantity: 0.5, unit: 'cup', grams: null, food: 'rice' });
  assert.deepStrictEqual(P('2 slices of whole wheat bread'), { quantity: 2, unit: 'slice', grams: null, food: 'whole wheat bread' });
  assert.deepStrictEqual(P('2 Tablespoons Peanut Butter'), { quantity: 2, unit: 'tbsp', grams: null, food: 'peanut butter' });
  assert.deepStrictEqual(P('250 ml milk'), { quantity: 250, unit: 'ml', grams: null, food: 'milk' });
});

test('a bare count has no unit', () => {
  assert.deepStrictEqual(P('2 eggs'), { quantity: 2, unit: null, grams: null, food: 'eggs' });
});

test('anything doubtful is NOT a quantity', () => {
  ['chicken', '3', '', null, '2% milk', '7 up', '7up', '100 grand bar', '3 musketeers', '12 grain bread',
   '100 calorie pack', '0 eggs', '2 3 eggs', '1/0 cup rice', '10kg rice', 'reeses pieces', 'eggs 2', 'Dr. Pepper']
    .forEach((q) => assert.strictEqual(P(q), null, JSON.stringify(q)));
});

test('the food words agree with what the search query keeps', () => {
  ['200g chicken breast', '2 eggs', '1.5 cups rice', '6 oz salmon', '2 slices of whole wheat bread'].forEach((q) => {
    assert.strictEqual(ranking.expandQuery(P(q).food).query, ranking.expandQuery(q).query, q);
  });
});

/* ── tier 2: the card ────────────────────────────────────────────────── */
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
global.window = global;
global.document = { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
let detail = [];
global.fetch = async (u) => {
  if (String(u).startsWith('/api/usda-food')) return { ok: true, json: async () => ({ portions: detail }) };
  throw new Error('unexpected fetch ' + u);
};
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched'); },
};
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = [];

const chicken = () => ({ fdcId: 11, description: 'Chicken, breast, grilled', dataType: 'SR Legacy',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } });
const egg = () => ({ fdcId: 12, description: 'Egg, whole, raw', dataType: 'SR Legacy',
  nutrients: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0, sugar: 0.4 } });
const rice = () => ({ fdcId: 13, description: 'Rice, white, cooked', dataType: 'SR Legacy',
  nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0 } });

function search(text, raws) {
  nuResetModalState();
  for (const k of Object.keys(nu_detailCache)) delete nu_detailCache[k];
  el('nuUsdaInput').value = text;
  nuUsdaInputChanged();
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  nu_usdaResults = raws.map(nuNormalizeUsdaFood);
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('"200g chicken" → the card opens on custom grams 200, quantity 1', () => {
  detail = [];
  search('200g chicken', [chicken()]);
  assert.match(el('nuQtyHint').textContent, /200 g/);
  nuPickUsda(0);
  assert.strictEqual(el('nuServingSelect').value, 'custom');
  assert.strictEqual(+el('nuCustomGrams').value, 200);
  assert.strictEqual(+el('nuServings').value, 1);
  assert.strictEqual(+el('nuCalories').value, 330, '165 kcal/100 g × 200 g');
  assert.strictEqual(nu_pendingSource.grams, 200);
});

test('"2 eggs" → default serving × 2, and it follows the real serving when portions arrive', async () => {
  detail = [{ label: '1 large', amount: 1, gramWeight: 50 }];
  search('2 eggs', [egg()]);
  nuPickUsda(0);
  assert.strictEqual(+el('nuServings').value, 2);
  await settle();
  assert.strictEqual(+el('nuServings').value, 2, 'count survives the portion load');
  assert.strictEqual(nu_pendingSource.grams, 50, 'serving is now 1 large (50 g)');
  assert.strictEqual(+el('nuCalories').value, 72, 'per-serving calories for one large egg (143 kcal/100 g × 50 g, rounded)');
});

test('"1.5 cups rice" → applied once the cup portion loads; quantity 1.5', async () => {
  detail = [{ label: '1 cup', amount: 1, gramWeight: 158 }];
  search('1.5 cups rice', [rice()]);
  nuPickUsda(0);
  assert.strictEqual(+el('nuServings').value, 1, 'no cup serving known yet → nothing guessed');
  await settle();
  assert.strictEqual(+el('nuServings').value, 1.5);
  assert.strictEqual(nu_pendingSource.grams, 158);
});

test('a unit the food cannot express is never guessed', async () => {
  detail = [{ label: '1 large', amount: 1, gramWeight: 50 }];
  search('2 cups eggs', [egg()]);
  nuPickUsda(0);
  await settle();
  assert.strictEqual(+el('nuServings').value, 1, 'quantity stays 1 — no cup serving exists for this food');
});

test('no amount typed → the card opens exactly as before; a chip never inherits one', () => {
  detail = [];
  search('chicken', [chicken()]);
  assert.strictEqual(nu_searchQty, null);
  assert.strictEqual(el('nuQtyHint').style.display, 'none');
  nuPickUsda(0);
  assert.strictEqual(+el('nuServings').value, 1);
  assert.notStrictEqual(el('nuServingSelect').value, 'custom');

  search('200g chicken', [chicken()]);
  nuResetModalState();                       // what every chip / fresh open does first
  assert.strictEqual(nu_searchQty, null, 'a stale typed amount cannot leak into the next open');
});

test('own foods match on the food words; a custom food takes a bare count only', () => {
  nu_ownFoods = nuMergeOwnFoods([], [{ food_key: 'custom:protein shake', name: 'Protein Shake', calories: 220 }]);
  search('2 protein shakes', []);
  assert.match(el('nuOwnResults').innerHTML, /Protein Shake/, '"2" does not block the match');
  nuPickOwn(0);
  assert.strictEqual(+el('nuServings').value, 2);

  search('200g protein shake', []);
  nuPickOwn(0);
  assert.strictEqual(+el('nuServings').value, 1, 'a weight cannot be applied to a custom serving');
  nu_ownFoods = [];
});
