// Regression tests for the quick-log resolution layer in nutrition.js.
// Run via `npm test` (node --test). No network, no keys: the real
// nutrition.js is evaluated with stubbed globals and canned USDA payloads.
//
// Covers the NU_CUP_GRAMS yogurt table (Effi-approved 2026-07-13) and its
// precedence: native USDA portion → alike-candidate retry → 245 g table
// (cup + weight-based + description starts with "Yogurt") → flagged
// 1-serving fallback.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/* ── minimal browser globals ─────────────────────────────────────────── */
global.window = global;
global.document = { getElementById: () => null, addEventListener: () => {} };
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u' } } } }) },
  from: () => { throw new Error('DB must not be touched by resolution'); },
};

/* ── canned USDA payloads (proxy's trimmed shape; nutrients per 100 g) ── */
const GREEK_NONFAT = {
  fdcId: 170894, description: 'Yogurt, Greek, plain, nonfat', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 59, protein: 10.2, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2 },
};
const GREEK_WHOLE = {
  fdcId: 171304, description: 'Yogurt, Greek, plain, whole milk', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 97, protein: 9, carbs: 3.9, fat: 5, fiber: 0, sugar: 4 },
};
// Foundation-style record with no cup vocabulary + its SR twin that carries
// the native cup portion — the retry must deliver the NATIVE cup, not the table.
const YOG_PLAIN_F = {
  fdcId: 2259794, description: 'Yogurt, plain, whole milk', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 60, protein: 3.8, carbs: 4.6, fat: 3.2, fiber: 0, sugar: 4.6 },
};
const YOG_PLAIN_SR = {
  fdcId: 171284, description: 'Yogurt, plain, whole milk, 8 grams protein per 8 ounce', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, sugar: 4.7 },
};
// Non-yogurt semi-solid with no cup data anywhere: the yogurt table must NOT
// apply — flagged 1-serving fallback instead.
const HUMMUS = {
  fdcId: 172454, description: 'Hummus, commercial', brand: '', group: 'generic',
  foodCategory: 'Legumes and Legume Products',
  nutrients: { kcal: 229, protein: 7.4, carbs: 14.9, fat: 17.1, fiber: 5.4, sugar: 0.3 },
};

const SEARCHES = {
  'greek yogurt nonfat': [GREEK_NONFAT],
  'greek yogurt whole milk': [GREEK_WHOLE],
  'plain yogurt': [YOG_PLAIN_F, YOG_PLAIN_SR],
  hummus: [HUMMUS],
};
const PORTIONS = {
  170894: [{ label: '1 container', gramWeight: 170, amount: 1 }],   // container ≠ cup
  171304: [],
  2259794: [{ label: '1 serving', gramWeight: 170, amount: 1 }],
  171284: [{ label: '1 cup (8 fl oz)', gramWeight: 245, amount: 1 }],
  172454: [],
};

global.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('/api/usda-search')) {
    const q = decodeURIComponent(u.split('q=')[1]);
    return { ok: true, json: async () => ({ foods: SEARCHES[q] || [] }) };
  }
  if (u.startsWith('/api/usda-food')) {
    const id = decodeURIComponent(u.split('fdcId=')[1]);
    return { ok: true, json: async () => ({ portions: PORTIONS[id] || [] }) };
  }
  throw new Error('unexpected fetch ' + u);
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'nutrition.js'), 'utf8'),
  { filename: 'nutrition.js' });

/* ── the four confirmed regression cases ────────────────────────────── */

test('1 cup Greek nonfat yogurt → 245 g table (no native cup exists)', async () => {
  const r = await nuAiResolveItem({ text: '1 cup greek yogurt', query: 'greek yogurt nonfat', brand: null, quantity: 1, unit: 'cup', grams: null });
  assert.strictEqual(r.serving_description, '1 cup (~245 g)');
  assert.strictEqual(r.grams, 245);
  assert.strictEqual(r.servings, 1);
  assert.ok(!r.unitUnresolved);
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 145);  // 59 × 2.45
});

test('1/2 cup Greek whole-milk yogurt → fractional cup on the table weight', async () => {
  const r = await nuAiResolveItem({ text: 'half a cup of greek yogurt', query: 'greek yogurt whole milk', brand: null, quantity: 0.5, unit: 'cup', grams: null });
  assert.strictEqual(r.serving_description, '1 cup (~245 g)');
  assert.strictEqual(r.servings, 0.5);
  // whole-milk panel (97/100g), NOT nonfat — variants share only the weight
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 119);  // 97 × 2.45 × 0.5
});

test('native USDA cup portion wins over the table (via alike retry)', async () => {
  const r = await nuAiResolveItem({ text: '1 cup plain yogurt', query: 'plain yogurt', brand: null, quantity: 1, unit: 'cup', grams: null });
  assert.strictEqual(r.food.usda_fdc_id, 171284, 'retry must land on the SR twin with the real cup');
  assert.strictEqual(r.serving_description, '1 cup (8 fl oz)');
  assert.ok(r.serving_description.indexOf('~') === -1, 'native portion, not the estimate');
  assert.strictEqual(r.grams, 245);
  assert.strictEqual(r.servings, 1);
});

test('non-yogurt semi-solid: table does NOT apply — flagged fallback', async () => {
  const r = await nuAiResolveItem({ text: '1 cup hummus', query: 'hummus', brand: null, quantity: 1, unit: 'cup', grams: null });
  assert.strictEqual(r.unitUnresolved, true, 'must flag, not borrow the yogurt weight');
  assert.strictEqual(r.servings, 1);
  assert.ok(String(r.serving_description || '').indexOf('245') === -1);
});
