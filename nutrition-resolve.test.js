// Regression tests for the Phase 4.2 quick-log resolution layer in
// nutrition.js. Run via `npm test` (node --test). No network, no keys: the
// REAL nutrition.js is evaluated with stubbed globals and canned USDA
// payloads (the proxy's trimmed shape, nutrients per 100 g).
//
// Ported from the live-QA session harnesses so every behavior fixed during
// 4.2 live testing stays fixed:
//   • serving-count division ("1/2 cup" on a 0.5-cup serving = 1 serving)
//   • stated weights are TOTALS ("6oz chicken" never multiplies)
//   • handful estimates (28/20/40 g), liquid tsp/tbsp volume conversion
//   • confidence: generic lead auto-picks, named brand auto-picks,
//     brand-crowded asks, restaurant categories ALWAYS ask
//   • chooser dedupe (identical products collapse; real differences ask)
//   • unit-satisfaction retry (alike-gated, native portion wins)
//   • NU_CUP_GRAMS yogurt table (245 g, last resort only)
//   • unresolved units never multiply (1 serving + flag)
//   • nuAiLogItems replays the saved-meal src shape
//   • friendly display names

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
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'user-1' } } } }) },
  from: () => { throw new Error('DB must not be touched by resolution'); },
};

/* ── canned USDA payloads ────────────────────────────────────────────── */
const EGG = {
  fdcId: 171287, description: 'Egg, whole, cooked, hard-boiled', brand: '',
  group: 'generic', foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, fiber: 0, sugar: 1.1 },
};
const BREAD = {
  fdcId: 172686, description: 'Bread, white, commercially prepared, toasted', brand: '',
  group: 'generic', nutrients: { kcal: 293, protein: 9.1, carbs: 54.4, fat: 4, fiber: 2.4, sugar: 6 },
};
const CHICKEN = {
  fdcId: 171477, description: 'Chicken, broiler, breast, meat only, raw', brand: '',
  group: 'generic', nutrients: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 },
};
const MILK = {
  fdcId: 999001, description: 'Whole Milk', brand: 'FairLife', group: 'branded',
  servingSize: 240, servingSizeUnit: 'MLT', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.3, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5 },
};
const ALMONDS = {
  fdcId: 170567, description: 'Nuts, almonds', brand: '', group: 'generic',
  foodCategory: 'Nut and Seed Products',
  nutrients: { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5, sugar: 4.4 },
};
const QUEST_CC = {
  fdcId: 999002, description: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR', brand: 'Quest Nutrition',
  group: 'branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 317, protein: 35, carbs: 37, fat: 12, fiber: 23, sugar: 2 },
};
const QUEST_CNC = {
  fdcId: 999003, description: 'QUEST COOKIES & CREAM BAR', brand: 'Quest Nutrition',
  group: 'branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 317, protein: 35, carbs: 38, fat: 13, fiber: 20, sugar: 2 },
};
const BAREBELLS = {
  fdcId: 999004, description: 'BAREBELLS PROTEIN BAR CARAMEL CASHEW', brand: 'Barebells',
  group: 'branded', servingSize: 55, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 364, protein: 36, carbs: 33, fat: 15, fiber: 4, sugar: 3 },
};
// Four branded jasmine rices, ~identical per-100g dry panels + a cooked twin.
function jasmine(fdcId, brand, kcal) {
  return { fdcId, description: 'JASMINE RICE', brand, group: 'branded',
    servingSize: 45, servingSizeUnit: 'g',
    nutrients: { kcal, protein: 7, carbs: 80, fat: 0.9, fiber: 1.1, sugar: 0 } };
}
const JR1 = jasmine(999011, 'Mahatma', 356);
const JR2 = jasmine(999012, 'Lundberg', 360);
const JR3 = jasmine(999013, 'Dynasty', 364);
const JR4 = jasmine(999014, 'Great Value', 358);
const JR_COOKED = { fdcId: 999015, description: 'JASMINE RICE COOKED', brand: 'Minute',
  group: 'branded', servingSize: 125, servingSizeUnit: 'g',
  nutrients: { kcal: 130, protein: 2.7, carbs: 28.6, fat: 0.2, fiber: 0.4, sugar: 0 } };
const FF_DOUBLE = {
  fdcId: 170725, description: 'Fast foods, cheeseburger; double, regular patty; with condiments',
  brand: '', group: 'generic', foodCategory: 'Fast Foods',
  nutrients: { kcal: 282, protein: 15.4, carbs: 18.6, fat: 15.9, fiber: 1.1, sugar: 3.4 },
};
const MCD_DOUBLE = {
  fdcId: 170728, description: "McDONALD'S, Double Cheeseburger",
  brand: '', group: 'generic', foodCategory: 'Fast Foods',
  nutrients: { kcal: 263, protein: 15, carbs: 20.7, fat: 13.4, fiber: 1.3, sugar: 4.3 },
};
// Effi's live breakfast (QA round 2): ½ cup oats, 1 tbsp PB, 1 tbsp syrup.
const OATS = { fdcId: 999021, description: 'OLD FASHIONED OATS', brand: 'Quaker', group: 'branded',
  servingSize: 40, servingSizeUnit: 'g', householdServing: '0.5 cup',
  nutrients: { kcal: 380, protein: 13, carbs: 68, fat: 6.5, fiber: 10, sugar: 1 } };
const ROLLED_NO_CUP = { fdcId: 999023, description: 'Oats, whole grain, rolled, old fashioned',
  brand: '', group: 'generic',
  nutrients: { kcal: 379, protein: 13.5, carbs: 68.7, fat: 5.9, fiber: 0, sugar: 0 } };
const PB_SR = { fdcId: 999022, description: 'Peanut butter, smooth style, without salt', brand: '',
  group: 'generic', nutrients: { kcal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9 } };
function syrup(fdcId, desc, brand, kcal) {
  return { fdcId, description: desc, brand, group: 'branded',
    servingSize: 60, servingSizeUnit: 'MLT', householdServing: '1/4 cup',
    nutrients: { kcal, protein: 0, carbs: kcal * 0.26, fat: 0, fiber: 0, sugar: kcal * 0.25 } };
}
const SY1 = syrup(999031, 'MAPLE SYRUP', 'Great Value', 345);
const SY2 = syrup(999032, 'PURE MAPLE SYRUP', 'Butternut Mountain', 360);
const SY3 = syrup(999033, '100% PURE ORGANIC MAPLE SYRUP', 'Kirkland', 367);
// Yogurt-table cases (Effi-approved NU_CUP_GRAMS precedence).
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
const HUMMUS = {
  fdcId: 172454, description: 'Hummus, commercial', brand: '', group: 'generic',
  foodCategory: 'Legumes and Legume Products',
  nutrients: { kcal: 229, protein: 7.4, carbs: 14.9, fat: 17.1, fiber: 5.4, sugar: 0.3 },
};

const SEARCHES = {
  egg: [EGG], toast: [BREAD], 'chicken breast': [CHICKEN], milk: [MILK], zzz: [],
  almonds: [ALMONDS],
  'protein bar': [QUEST_CC, QUEST_CNC, BAREBELLS],
  'quest bar': [QUEST_CC, QUEST_CNC],
  'jasmine rice': [JR1, JR2, JR3, JR4],
  'jasmine rice mixed': [JR1, JR_COOKED, JR2, JR3],
  'double cheeseburger': [FF_DOUBLE, MCD_DOUBLE],
  oats: [OATS],
  'rolled oats': [ROLLED_NO_CUP, OATS],   // top has no cup — the alike retry must switch
  'peanut butter': [PB_SR],
  'maple syrup': [SY1, SY2, SY3],
  'greek yogurt nonfat': [GREEK_NONFAT],
  'greek yogurt whole milk': [GREEK_WHOLE],
  'plain yogurt': [YOG_PLAIN_F, YOG_PLAIN_SR],
  hummus: [HUMMUS],
};
const PORTIONS = {
  171287: [{ label: '1 large', gramWeight: 50, amount: 1 }],
  172686: [{ label: '1 slice', gramWeight: 25, amount: 1 }],
  171477: [],
  999001: [],
  170567: [{ label: '1 cup, whole', gramWeight: 143, amount: 1 }],
  999021: [],
  999022: [{ label: '2 tbsp', gramWeight: 32, amount: 2 }],
  999023: [{ label: '1 serving', gramWeight: 40, amount: 1 }],
  170894: [{ label: '1 container', gramWeight: 170, amount: 1 }],
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

function item(overrides) {
  return Object.assign({ text: '', query: '', brand: null, quantity: 1, unit: null, grams: null }, overrides);
}

/* ── quantities, portions, and weights ──────────────────────────────── */

test('bare count → natural portion, quantity carries (2 eggs)', async () => {
  const r = await nuAiResolveItem(item({ text: '2 eggs', query: 'egg', quantity: 2 }));
  assert.strictEqual(r.unmatched, false);
  assert.strictEqual(r.food.usda_fdc_id, 171287);
  assert.strictEqual(r.servings, 2);
  assert.strictEqual(r.serving_description, '1 large');
  assert.strictEqual(r.grams, 50);
  assert.strictEqual(r.perUnit.calories, 78);            // 155 × 0.5
  assert.ok(r.food.raw.portions, 'portions attach to raw for provenance');
});

test('household unit matches the portion label (2 slices toast)', async () => {
  const r = await nuAiResolveItem(item({ query: 'toast', quantity: 2, unit: 'slice' }));
  assert.strictEqual(r.serving_description, '1 slice');
  assert.strictEqual(r.grams, 25);
  assert.strictEqual(r.servings, 2);
  assert.strictEqual(r.perUnit.calories, 73);            // 293 × 0.25
});

test('stated weight is a TOTAL — never multiplied by quantity (6oz chicken)', async () => {
  // Real model shape: quantity 6 + unit oz + grams 170 (the total).
  const r = await nuAiResolveItem(item({ query: 'chicken breast', quantity: 6, unit: 'oz', grams: 170 }));
  assert.strictEqual(r.serving_description, '170 g');
  assert.strictEqual(r.grams, 170);
  assert.strictEqual(r.servings, 1, 'weights must not multiply');
  assert.strictEqual(r.perUnit.calories, 204);           // 120 × 1.7
});

test('serving-label count divides the quantity (1/2 cup oats = ONE serving)', async () => {
  const r = await nuAiResolveItem(item({ query: 'oats', quantity: 0.5, unit: 'cup' }));
  assert.strictEqual(r.servings, 1, 'half cup ÷ half-cup serving');
  assert.strictEqual(r.serving_description, '0.5 cup');
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 152);
});

test('1 tbsp on a 2-tbsp USDA portion = half a serving (peanut butter)', async () => {
  const r = await nuAiResolveItem(item({ query: 'peanut butter', quantity: 1, unit: 'tbsp' }));
  assert.strictEqual(r.servings, 0.5);
  assert.strictEqual(r.serving_description, '2 tbsp');
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 94);
});

test('handfuls: deterministic 28/20/40 g estimates, never 100 g', async () => {
  const hand = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful' }));
  assert.strictEqual(hand.grams, 28);
  assert.strictEqual(hand.serving_description, 'handful (~28 g)');
  assert.strictEqual(hand.perUnit.calories, 162);        // 579 × 0.28

  const small = await nuAiResolveItem(item({ query: 'almonds', unit: 'small handful' }));
  assert.strictEqual(small.grams, 20);
  assert.strictEqual(small.perUnit.calories, 116);

  const large = await nuAiResolveItem(item({ query: 'almonds', quantity: 2, unit: 'large handfuls' }));
  assert.strictEqual(large.grams, 40, 'plural normalizes');
  assert.strictEqual(large.servings, 2, 'handful counts DO multiply');

  // an explicit weight still beats the hand estimate
  const weighed = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful', grams: 30 }));
  assert.strictEqual(weighed.grams, 30);
  assert.strictEqual(weighed.servings, 1);
});

test('liquids: tbsp is a 15 ml volume conversion; grams never fabricated', async () => {
  const sy = await nuAiResolveItem(item({ query: 'maple syrup', unit: 'tbsp' }));
  assert.ok(!sy.needsChoice, 'PURE/ORGANIC filler variants must collapse first');
  assert.strictEqual(sy.serving_description, '1 tbsp (15 ml)');
  assert.strictEqual(sy.grams, null);
  assert.strictEqual(sy.perUnit.calories, 52);           // 345/100ml × 15
  assert.ok(!sy.unitUnresolved);
});

/* ── unit-satisfaction retry + unresolved handling ──────────────────── */

test('alike-gated retry: cup-aware twin wins when the top food lacks the unit', async () => {
  const r = await nuAiResolveItem(item({ query: 'rolled oats', quantity: 0.5, unit: 'cup' }));
  assert.strictEqual(r.food.usda_fdc_id, 999021, 'must switch to the cup-aware twin');
  assert.strictEqual(r.servings, 1);
  assert.strictEqual(r.serving_description, '0.5 cup');
});

test('unresolved units never multiply: 1 serving + flag', async () => {
  const r = await nuAiResolveItem(item({ text: 'half a cup of eggs', query: 'egg', quantity: 0.5, unit: 'cup' }));
  assert.strictEqual(r.servings, 1, 'quantity in an unmatched unit must not scale a serving');
  assert.strictEqual(r.unitUnresolved, true);
  assert.strictEqual(r.serving_description, '1 large');

  // liquid handful: no fabricated weight → default serving, flagged
  const liq = await nuAiResolveItem(item({ query: 'milk', brand: 'fairlife', unit: 'handful' }));
  assert.strictEqual(liq.grams, null);
  assert.strictEqual(liq.serving_description, '1 cup');
  assert.strictEqual(liq.unitUnresolved, true);
});

test('empty search → unmatched, never throws', async () => {
  const r = await nuAiResolveItem(item({ query: 'zzz' }));
  assert.strictEqual(r.unmatched, true);
});

/* ── confidence, chooser, dedupe ────────────────────────────────────── */

test('brand-crowded query asks; picking a candidate resolves fully', async () => {
  const bar = await nuAiResolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(bar.needsChoice, true);
  assert.strictEqual(bar.choices.length, 3, 'flavors survive dedupe (names differ)');
  assert.strictEqual(bar.choices[2].brand, 'Barebells');
  assert.strictEqual(nuAiTotals([bar]).calories, 0, 'unresolved choosers add nothing');

  const picked = await nuAiResolveChoice(bar, 2);
  assert.strictEqual(picked.food.usda_fdc_id, 999004);
  assert.strictEqual(picked.serving_description, '1 bar');
  assert.strictEqual(picked.perUnit.calories, 200);      // 364/100g × 55
});

test('naming the brand restores confidence (quest bar auto-picks)', async () => {
  const r = await nuAiResolveItem(item({ query: 'quest bar', brand: 'quest' }));
  assert.ok(!r.needsChoice);
  assert.strictEqual(r.food.usda_fdc_id, 999002);
});

test('nutritionally identical candidates collapse — no interruption', async () => {
  const rice = await nuAiResolveItem(item({ query: 'jasmine rice' }));
  assert.ok(!rice.needsChoice, 'four interchangeable jasmine rices = auto-pick');
  assert.strictEqual(rice.food.usda_fdc_id, 999011);
});

test('real differences keep the chooser, deduped with kcal shown', async () => {
  const mixed = await nuAiResolveItem(item({ query: 'jasmine rice mixed' }));
  assert.strictEqual(mixed.needsChoice, true, 'dry vs cooked panels must ask');
  assert.strictEqual(mixed.choices.length, 2, 'duplicates collapse out of the chooser');
  assert.strictEqual(mixed.choices[0].kcal, 356);
  assert.strictEqual(mixed.choices[1].kcal, 130);
});

test('restaurant-dish categories ALWAYS ask, even on a generic lead', async () => {
  const burger = await nuAiResolveItem(item({ query: 'double cheeseburger' }));
  assert.strictEqual(burger.needsChoice, true, 'Fast Foods must ask "which one?"');
  assert.match(burger.choices[1].name, /McDONALD/);
});

/* ── NU_CUP_GRAMS yogurt table (Effi-approved precedence) ───────────── */

test('1 cup Greek nonfat yogurt → 245 g table (no native cup exists)', async () => {
  const r = await nuAiResolveItem(item({ query: 'greek yogurt nonfat', unit: 'cup' }));
  assert.strictEqual(r.serving_description, '1 cup (~245 g)');
  assert.strictEqual(r.grams, 245);
  assert.strictEqual(r.servings, 1);
  assert.ok(!r.unitUnresolved);
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 145);  // 59 × 2.45
});

test('1/2 cup Greek whole-milk yogurt → fractional cup on the table weight', async () => {
  const r = await nuAiResolveItem(item({ query: 'greek yogurt whole milk', quantity: 0.5, unit: 'cup' }));
  assert.strictEqual(r.serving_description, '1 cup (~245 g)');
  assert.strictEqual(r.servings, 0.5);
  // whole-milk panel (97/100g), NOT nonfat — variants share only the weight
  assert.strictEqual(nuScaleMacros(r.perUnit, r.servings).calories, 119);
});

test('native USDA cup portion wins over the table (via alike retry)', async () => {
  const r = await nuAiResolveItem(item({ query: 'plain yogurt', unit: 'cup' }));
  assert.strictEqual(r.food.usda_fdc_id, 171284, 'retry must land on the SR twin with the real cup');
  assert.strictEqual(r.serving_description, '1 cup (8 fl oz)');
  assert.ok(r.serving_description.indexOf('~') === -1, 'native portion, not the estimate');
  assert.strictEqual(r.grams, 245);
  assert.strictEqual(r.servings, 1);
});

test('non-yogurt semi-solid: table does NOT apply — flagged fallback', async () => {
  const r = await nuAiResolveItem(item({ query: 'hummus', unit: 'cup' }));
  assert.strictEqual(r.unitUnresolved, true, 'must flag, not borrow the yogurt weight');
  assert.strictEqual(r.servings, 1);
  assert.ok(String(r.serving_description || '').indexOf('245') === -1);
});

/* ── logging replay + totals + display names ────────────────────────── */

test('nuAiLogItems replays the saved-meal src shape; skips unresolved', async () => {
  const egg = await nuAiResolveItem(item({ text: '2 eggs', query: 'egg', quantity: 2 }));
  const toast = await nuAiResolveItem(item({ query: 'toast', quantity: 2, unit: 'slice' }));
  const un = await nuAiResolveItem(item({ query: 'zzz' }));
  const bar = await nuAiResolveItem(item({ query: 'protein bar' }));

  const saved = [];
  global.nuSaveLog = async (uid, entry) => { saved.push({ uid, entry }); return { data: { id: 'log' + saved.length }, error: null }; };
  const n = await nuAiLogItems([egg, toast, un, bar], 'breakfast', '2026-07-13');
  assert.strictEqual(n, 2, 'unmatched + unresolved chooser skipped');

  const e0 = saved[0].entry;
  assert.strictEqual(saved[0].uid, 'user-1');
  assert.strictEqual(e0.meal, 'breakfast');
  assert.strictEqual(e0.date, '2026-07-13');
  assert.strictEqual(e0.servings, 2);
  assert.strictEqual(e0.calories, 78);                   // per-serving; nuSaveLog scales
  for (const k of ['name', 'usda_fdc_id', 'brand', 'gtin_upc', 'serving_amount', 'serving_unit',
                   'serving_description', 'grams', 'fiber', 'sugar', 'calories', 'protein', 'carbs', 'fat', 'raw']) {
    assert.ok(k in e0.src, 'src missing ' + k);
  }
  assert.strictEqual(e0.src.usda_fdc_id, 171287);
  assert.strictEqual(e0.src.raw.fdcId, 171287, 'raw payload preserved');
  assert.strictEqual(e0.src.sugar, 0.6);                 // per-unit sugar scaled to 50 g

  const tot = nuAiTotals([egg, toast, un]);
  assert.strictEqual(Math.round(tot.calories), 78 * 2 + 73 * 2);
});

test('friendly display names: USDA grammar → human names', () => {
  assert.strictEqual(nuAiDisplayName('Apples, fuji, with skin, raw'), 'Fuji Apple');
  assert.strictEqual(nuAiDisplayName('Chicken, broilers or fryers, breast, meat only, cooked'), 'Chicken Breast');
  assert.strictEqual(nuAiDisplayName('Egg, whole, cooked, hard-boiled'), 'Egg');
  assert.strictEqual(nuAiDisplayName('Bread, white, commercially prepared, toasted'), 'White Bread');
  assert.strictEqual(nuAiDisplayName('Milk, whole, 3.25% milkfat, with added vitamin D'), 'Milk');
  assert.strictEqual(nuAiDisplayName('Nuts, almonds'), 'Almonds');
  assert.strictEqual(nuAiDisplayName('Peanut butter, smooth style, without salt'), 'Peanut Butter');
  assert.strictEqual(nuAiDisplayName("McDONALD'S, Double Cheeseburger"), "McDonald's Double Cheeseburger");
  assert.strictEqual(nuAiDisplayName('JASMINE RICE'), 'Jasmine Rice');
  assert.strictEqual(nuAiDisplayName('Honey'), 'Honey');
  // emojis were removed per Effi's design call — the helper must stay gone
  assert.strictEqual(typeof global.nuFoodEmoji, 'undefined');
});
