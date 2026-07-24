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

// Phase 4.2.1a: the shared core loads before nutrition.js, same order as the
// pages (nutrition.html, app.html).
['food-core.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});

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

/* ── confidence contract (Phase 4.2.3, checkpoint 1) ────────────────────
 * nuAssessConfidence is a pure CONSUMER of the ordered pool — nothing wires it
 * into resolveItem yet, so these pin the CONTRACT (dispositions, reason codes,
 * ambiguity types, score evidence, materiality) and PARITY with the existing
 * boolean, not any behavior change. */

test('confidence contract: no candidates → unresolved terminal', () => {
  const v = nuAssessConfidence(item({ query: 'zzz' }), SEARCHES.zzz);
  assert.strictEqual(v.disposition, 'unresolved');
  assert.strictEqual(v.level, 'low');
  assert.strictEqual(v.candidate, null);
  assert.strictEqual(v.evidence.scoreAvailable, false);
  assert.strictEqual(v.reasons[0].code, 'no_candidates');
});

test('confidence contract: generic lead → auto_resolve, high, immaterial', () => {
  const v = nuAssessConfidence(item({ query: 'egg' }), SEARCHES.egg);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.strictEqual(v.level, 'high');
  assert.strictEqual(v.candidate.fdcId, 171287);
  assert.strictEqual(v.material, false);
  assert.deepStrictEqual(v.ambiguity, []);
  assert.strictEqual(v.reasons[0].code, 'generic_canonical');
});

test('confidence contract: lone branded, no brand → auto_resolve (dedupe→1)', () => {
  // Parity: nuAiIsConfident is FALSE here (branded, unnamed brand) yet the
  // resolver auto-picks because the distinct set collapses to one.
  const req = item({ query: 'milk' });
  const v = nuAssessConfidence(req, SEARCHES.milk);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.strictEqual(nuAiIsConfident(req, SEARCHES.milk[0]), false);
  assert.strictEqual(v.reasons[0].code, 'single_candidate');
});

test('confidence contract: brand-crowded branded lead → choose_candidate (identity)', () => {
  const v = nuAssessConfidence(item({ query: 'protein bar' }), SEARCHES['protein bar']);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.level, 'medium');
  assert.deepStrictEqual(v.ambiguity, ['identity']);
  assert.strictEqual(v.material, true, 'Quest vs Barebells differ (fat)');
  assert.strictEqual(v.alternatives.length, 3);
  assert.strictEqual(v.reasons[0].code, 'branded_crowd');
});

test('confidence contract: named brand matched, alike variants → auto_resolve', () => {
  const req = item({ query: 'quest bar', brand: 'quest' });
  const v = nuAssessConfidence(req, SEARCHES['quest bar']);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.strictEqual(v.reasons[0].code, 'brand_matched');
});

test('confidence contract: restaurant category → choose_candidate (category)', () => {
  const v = nuAssessConfidence(item({ query: 'double cheeseburger' }), SEARCHES['double cheeseburger']);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.deepStrictEqual(v.ambiguity, ['category']);
  assert.strictEqual(v.material, true);
  assert.strictEqual(v.reasons[0].code, 'ask_category');
});

test('confidence contract: identical candidates collapse → auto_resolve', () => {
  const v = nuAssessConfidence(item({ query: 'jasmine rice' }), SEARCHES['jasmine rice']);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.strictEqual(v.material, false);
});

test('confidence contract: real differences remain → choose_candidate, 2 distinct', () => {
  const v = nuAssessConfidence(item({ query: 'jasmine rice mixed' }), SEARCHES['jasmine rice mixed']);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.alternatives.length, 2);
});

test('confidence contract: score evidence is read from the ordered pool', () => {
  const foods = [
    Object.assign({}, CHICKEN, { score: 2600 }),
    Object.assign({}, ALMONDS, { score: 900 }),
  ];
  const v = nuAssessConfidence(item({ query: 'x' }), foods);
  assert.strictEqual(v.evidence.scoreAvailable, true);
  assert.strictEqual(v.evidence.topScore, 2600);
  assert.strictEqual(v.evidence.runnerUpScore, 900);
  assert.strictEqual(v.evidence.gap, 1700);
});

// The score-gap escalations ship OFF (NU_CONFIDENCE.scoreEscalation === false,
// Checkpoint 2 parity). These exercise the escalation LOGIC via an explicit,
// per-call policy override — no shared global mutation.
const ESC = { scoreEscalation: true };

test('confidence contract: decisive gap over a material generic runner → auto_resolve', () => {
  const foods = [
    Object.assign({}, CHICKEN, { score: 2600, description: 'Chicken, breast, raw' }),
    Object.assign({}, ALMONDS, { score: 100, description: 'Nuts, almonds' }),
  ];
  const v = nuAssessConfidence(item({ query: 'x' }), foods, ESC);
  assert.strictEqual(v.disposition, 'auto_resolve', 'gap 2500 ≥ decisive → confident');
  assert.strictEqual(v.material, true);
});

test('confidence contract: close gap over a material generic runner → choose_candidate', () => {
  const foods = [
    Object.assign({}, CHICKEN, { score: 2600, description: 'Chicken, breast, raw' }),
    Object.assign({}, ALMONDS, { score: 2550, description: 'Nuts, almonds' }),
  ];
  const v = nuAssessConfidence(item({ query: 'x' }), foods, ESC);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.deepStrictEqual(v.ambiguity, ['identity']);
  assert.strictEqual(v.reasons[0].code, 'close_material_runner_up');
});

test('confidence contract: close gap but ALIKE runner → auto_resolve (no friction)', () => {
  const foods = [
    Object.assign({}, GREEK_NONFAT, { score: 2600, description: 'Yogurt, Greek, plain, nonfat' }),
    Object.assign({}, GREEK_NONFAT, { score: 2550, fdcId: 111, description: 'Yogurt, greek, plain, fat free' }),
  ];
  const v = nuAssessConfidence(item({ query: 'greek yogurt' }), foods, ESC);
  assert.strictEqual(v.disposition, 'auto_resolve', 'immaterial diff never asks, even at a narrow gap');
  assert.strictEqual(v.material, false);
});

test('parity: score-gap escalation ships DORMANT (flag off → no new behavior)', () => {
  assert.strictEqual(NU_CONFIDENCE.scoreEscalation, false, 'must ship OFF for the parity migration');
  // A close, materially-different scored runner-up must NOT escalate while
  // dormant — proving gapDecisive:800 introduces no user-visible change.
  const foods = [
    Object.assign({}, CHICKEN, { score: 2600, description: 'Chicken, breast, raw' }),
    Object.assign({}, ALMONDS, { score: 2550, description: 'Nuts, almonds' }),
  ];
  const v = nuAssessConfidence(item({ query: 'x' }), foods);
  assert.strictEqual(v.disposition, 'auto_resolve', 'generic lead auto-resolves exactly as today');
});

test('confidence contract: nuAiIsConfident TRUE ⟹ auto_resolve (superset parity)', () => {
  const cases = [
    item({ query: 'egg' }), item({ query: 'chicken breast' }),
    item({ query: 'quest bar', brand: 'quest' }), item({ query: 'jasmine rice' }),
  ];
  const pools = { egg: SEARCHES.egg, 'chicken breast': SEARCHES['chicken breast'],
    'quest bar': SEARCHES['quest bar'], 'jasmine rice': SEARCHES['jasmine rice'] };
  for (const req of cases) {
    const foods = pools[req.query];
    if (nuAiIsConfident(req, foods[0])) {
      assert.strictEqual(nuAssessConfidence(req, foods).disposition, 'auto_resolve',
        'nuAiIsConfident true must map to auto_resolve for "' + req.query + '"');
    }
  }
});

/* ── Checkpoint 2: resolver parity migration ────────────────────────────
 * The migrated resolveItem consumes nuAssessConfidence. These prove the
 * OBSERVABLE decision (unmatched / needsChoice+choices / resolved) is identical
 * to the pre-4.2.3 algorithm across the WHOLE fixture corpus, both directions. */

// Frozen copy of the ORIGINAL pre-4.2.3 decision (nuAiIsConfident H1–H4 + the
// inline needsChoice block), independent of the now-shared verdict — the ground
// truth the migration must reproduce. Restaurant categories used the undeduped
// top-4; everything else used nuAiDedupeChoices(top-4).
function legacyConfident(parsed, top) {
  if (NU_ASK_CATEGORIES[String(top.foodCategory || '').toLowerCase()]) return false;
  if ((top.group || 'generic') !== 'branded') return true;
  const b = (parsed.brand || '').toLowerCase().split(' ')[0];
  if (b && String(top.brand || '').toLowerCase().indexOf(b) !== -1) return true;
  return false;
}
function legacyDecision(parsed, foods) {
  if (!foods || !foods.length) return { kind: 'unmatched' };
  if (!legacyConfident(parsed, foods[0])) {
    const candidates = foods.slice(0, 4);
    const askCat = NU_ASK_CATEGORIES[String(foods[0].foodCategory || '').toLowerCase()];
    const options = askCat ? candidates : nuAiDedupeChoices(candidates);
    if (askCat || options.length > 1) {
      return { kind: 'needsChoice', ids: options.map((f) => f.fdcId) };
    }
  }
  return { kind: 'resolved' };
}

test('parity: resolveItem decision matches the legacy algorithm across ALL fixtures', async () => {
  assert.strictEqual(NU_CONFIDENCE.scoreEscalation, false, 'parity holds only with escalation dormant');
  // Cover both a bare query and (where meaningful) a named-brand variant, so the
  // brand-match branch is exercised alongside the crowded/generic/restaurant ones.
  const inputs = Object.keys(SEARCHES).map((q) => item({ query: q }));
  inputs.push(item({ query: 'quest bar', brand: 'quest' }));       // named-brand match
  inputs.push(item({ query: 'protein bar', brand: 'barebells' })); // brand named, top is a different brand

  for (const parsed of inputs) {
    const foods = SEARCHES[parsed.query];
    const expected = legacyDecision(parsed, foods);
    const r = await nuAiResolveItem(parsed);
    const label = parsed.query + (parsed.brand ? ' [brand=' + parsed.brand + ']' : '');
    if (expected.kind === 'unmatched') {
      assert.ok(r.unmatched && !r.needsChoice && !r.needsClarification, `${label}: expected unmatched`);
    } else if (expected.kind === 'needsChoice') {
      // allowed mapping: legacy chooser → chooser OR targeted clarification
      assert.ok((r.needsChoice || r.needsClarification) && !r.unmatched,
        `${label}: expected a chooser or clarification`);
      if (r.needsChoice) {
        assert.deepStrictEqual(r.choices.map((c) => c.raw.fdcId), expected.ids,
          `${label}: chooser candidate set must match legacy exactly`);
      }
    } else {
      // legacy auto → MUST remain auto (no new interruption while scoreEscalation off)
      assert.ok(!r.needsChoice && !r.needsClarification && !r.unmatched,
        `${label}: legacy auto must stay auto`);
    }
  }
});

test('parity directions: each legacy behavior class is individually preserved', async () => {
  // previous automatic resolution stays automatic (generic lead)
  assert.ok(!(await nuAiResolveItem(item({ query: 'egg' }))).needsChoice);
  // lone branded, no brand → still auto (dedupe→1)
  assert.ok(!(await nuAiResolveItem(item({ query: 'milk' }))).needsChoice);
  // previous chooser stays a chooser (brand-crowded)
  assert.strictEqual((await nuAiResolveItem(item({ query: 'protein bar' }))).needsChoice, true);
  // restaurant category unchanged (always asks)
  assert.strictEqual((await nuAiResolveItem(item({ query: 'double cheeseburger' }))).needsChoice, true);
  // named-brand behavior unchanged (auto-picks)
  assert.ok(!(await nuAiResolveItem(item({ query: 'quest bar', brand: 'quest' }))).needsChoice);
  // nutritionally equivalent choices stay collapsed → auto
  assert.ok(!(await nuAiResolveItem(item({ query: 'jasmine rice' }))).needsChoice);
  // real differences stay a chooser
  assert.strictEqual((await nuAiResolveItem(item({ query: 'jasmine rice mixed' }))).needsChoice, true);
  // unmatched unchanged
  assert.strictEqual((await nuAiResolveItem(item({ query: 'zzz' }))).unmatched, true);
  // portion behavior unchanged (unresolved unit flags, never multiplies)
  const h = await nuAiResolveItem(item({ query: 'hummus', unit: 'cup' }));
  assert.strictEqual(h.unitUnresolved, true);
  assert.strictEqual(h.servings, 1);
});

/* ── Checkpoint 3: targeted clarification (dormant) ─────────────────────
 * nuAssessConfidence(request, foods, { targetedClarification: true }) exercises
 * the clarification LOGIC via an explicit policy override; the production flag
 * ships OFF, so resolveItem/UI keep Checkpoint 2 behavior. Deterministic
 * fixtures only — never live USDA wording. */
const CLAR = { targetedClarification: true };

// same base food, separated ONLY by preparation state, materially different
const CHK_RAW = { fdcId: 700001, description: 'Chicken breast, raw', brand: 'Kirkland', group: 'branded',
  nutrients: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 } };
const CHK_COOKED = { fdcId: 700002, description: 'Chicken breast, cooked', brand: 'Kirkland', group: 'branded',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } };
// dry vs prepared, materially different
const OATS_DRY = { fdcId: 700010, description: 'Oats, dry', brand: 'Quaker', group: 'branded',
  nutrients: { kcal: 380, protein: 13, carbs: 68, fat: 6.5, fiber: 10, sugar: 1 } };
const OATS_PREP = { fdcId: 700011, description: 'Oats, prepared', brand: 'Quaker', group: 'branded',
  nutrients: { kcal: 71, protein: 2.5, carbs: 12, fat: 1.5, fiber: 1.7, sugar: 0.3 } };
// prep difference but nutritionally ALIKE (immaterial)
const CHK_RAW_A = { fdcId: 700020, description: 'Chicken, raw', brand: 'BrandA', group: 'branded',
  nutrients: { kcal: 120, protein: 22, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 } };
const CHK_CKD_A = { fdcId: 700021, description: 'Chicken, cooked', brand: 'BrandA', group: 'branded',
  nutrients: { kcal: 125, protein: 23, carbs: 0, fat: 2.8, fiber: 0, sugar: 0 } };
// one clear food-form distinction (water vs oil), materially different
const TUNA_WATER = { fdcId: 700030, description: 'Tuna, canned in water', brand: 'StarKist', group: 'branded',
  nutrients: { kcal: 86, protein: 19, carbs: 0, fat: 0.8, fiber: 0, sugar: 0 } };
const TUNA_OIL = { fdcId: 700031, description: 'Tuna, canned in oil', brand: 'StarKist', group: 'branded',
  nutrients: { kcal: 198, protein: 29, carbs: 0, fat: 8, fiber: 0, sugar: 0 } };
// explicit brand mismatch (user said Fairlife; pool is Horizon), materially different
const MK_A = { fdcId: 700040, description: 'Whole Milk', brand: 'Horizon', group: 'branded',
  servingSize: 240, servingSizeUnit: 'MLT', nutrients: { kcal: 61, protein: 3.3, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5 } };
const MK_B = { fdcId: 700041, description: 'Skim Milk', brand: 'Horizon', group: 'branded',
  servingSize: 240, servingSizeUnit: 'MLT', nutrients: { kcal: 34, protein: 3.4, carbs: 5, fat: 0.2, fiber: 0, sugar: 5 } };
// two competing dimensions at once (prep AND form)
const POT_1 = { fdcId: 700050, description: 'Potato, raw, whole', brand: 'B', group: 'branded',
  nutrients: { kcal: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, sugar: 0.8 } };
const POT_2 = { fdcId: 700051, description: 'Potato, cooked, mashed', brand: 'B', group: 'branded',
  nutrients: { kcal: 90, protein: 2, carbs: 20, fat: 0.1, fiber: 1.5, sugar: 1.2 } };
// GENERIC prep pair with close scores — only becomes interruptible via
// scoreEscalation, so the two policies can be exercised independently.
const GEN_RAW = { fdcId: 700060, description: 'Chicken, raw', brand: '', group: 'generic', score: 2600,
  nutrients: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 } };
const GEN_CKD = { fdcId: 700061, description: 'Chicken, cooked', brand: '', group: 'generic', score: 2550,
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } };

test('clarify: raw vs cooked, materially different → preparation clarification', () => {
  const v = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED], CLAR);
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.deepStrictEqual(v.ambiguity, ['preparation']);
  assert.strictEqual(v.material, true);
  assert.strictEqual(v.clarification.type, 'preparation');
  assert.match(v.clarification.prompt, /cooked or raw|raw or cooked/i);
  assert.strictEqual(v.clarification.options.length, 2);
  assert.strictEqual(v.reasons[0].code, 'targeted_clarification');
  // explicit flag OFF → falls back to the existing chooser
  assert.strictEqual(nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED],
    { targetedClarification: false }).disposition, 'choose_candidate');
});

test('clarify: dry vs prepared, materially different → preparation clarification', () => {
  const v = nuAssessConfidence(item({ query: 'oats' }), [OATS_DRY, OATS_PREP], CLAR);
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.strictEqual(v.clarification.type, 'preparation');
  assert.match(v.clarification.prompt, /dry or prepared|prepared or dry/i);
});

test('clarify: preparation difference but nutritionally immaterial → no clarification', () => {
  const v = nuAssessConfidence(item({ query: 'chicken' }), [CHK_RAW_A, CHK_CKD_A], CLAR);
  assert.notStrictEqual(v.disposition, 'clarify_input');
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.clarification, null);
});

test('clarify: meaningful food-form distinction → targeted form clarification', () => {
  const v = nuAssessConfidence(item({ query: 'tuna' }), [TUNA_WATER, TUNA_OIL], CLAR);
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.deepStrictEqual(v.ambiguity, ['form']);
  assert.strictEqual(v.clarification.type, 'form');
  assert.strictEqual(v.clarification.options.length, 2);
  assert.match(v.clarification.prompt, /oil or water|water or oil/i);
});

test('clarify: explicit brand mismatch → one focused brand question', () => {
  const v = nuAssessConfidence(item({ query: 'milk', brand: 'fairlife' }), [MK_A, MK_B], CLAR);
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.deepStrictEqual(v.ambiguity, ['brand']);
  assert.strictEqual(v.clarification.type, 'brand');
  assert.match(v.clarification.prompt, /fairlife/i);
  // UNIQUE value over the chooser: free-text correction, NOT re-listed candidates
  assert.ok(v.clarification.allowFreeText, 'free-text brand correction is the point');
  assert.ok(v.clarification.options.length < v.alternatives.length, 'must not duplicate chooser rows');
  assert.ok(v.clarification.options.some((o) => /search all brands/i.test(o.label)));
  assert.strictEqual(v.clarification.candidateRefs, undefined, 'no raw candidate refs embedded');
});

test('clarify: brand prompt is a full, long question (must render wrapped, not clipped)', () => {
  // Regression for the Checkpoint 4.1 fix: the brand prompt is a complete question
  // long enough to overflow the single-line review row — the UI renders it with
  // .ai-clar-prompt (wrapping), never the clipping .ai-unmatched-label. Here we
  // pin that the CORE emits the whole prompt (leading + brand + trailing), so any
  // truncation can only be a styling regression, not a lost string.
  const v = nuAssessConfidence(item({ query: 'milk', brand: 'fairlife' }), [MK_A, MK_B], CLAR);
  const p = v.clarification.prompt;
  assert.match(p, /^We couldn.t find the brand/i, 'keeps the leading explanation');
  assert.match(p, /fairlife/i, 'names the requested brand');
  assert.match(p, /search all brands\.?$/i, 'keeps the trailing action — the part that was clipped');
  assert.ok(p.length > 60, 'long enough to require wrapping (' + p.length + ' chars)');
});

test('clarify: multiple unrelated branded candidates → chooser, not a brand question', () => {
  const v = nuAssessConfidence(item({ query: 'protein bar' }), SEARCHES['protein bar'], CLAR);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.clarification, null);
});

test('clarify: several competing ambiguity dimensions → chooser, not clarification', () => {
  const v = nuAssessConfidence(item({ query: 'potato' }), [POT_1, POT_2], CLAR);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.clarification, null);
});

test('clarify: uncertain portion + uncertain identity → identity handled first', async () => {
  const r = await nuAiResolveItem(item({ query: 'protein bar', unit: 'bar' }));
  assert.strictEqual(r.needsChoice, true);      // identity chooser first; portion never reached
  assert.ok(!('unitUnresolved' in r));
});

test('clarify: portion ambiguity not solvable by one question → current behavior preserved', async () => {
  const r = await nuAiResolveItem(item({ query: 'hummus', unit: 'cup' }));
  assert.strictEqual(r.unitUnresolved, true);
  assert.strictEqual(r.servings, 1);
  assert.ok(!r.needsChoice);
});

test('clarify: no viable candidates → unresolved (even with clarification enabled)', () => {
  const v = nuAssessConfidence(item({ query: 'zzz' }), [], CLAR);
  assert.strictEqual(v.disposition, 'unresolved');
});

test('clarify: equivalent candidates → automatic resolution (never a question)', () => {
  const v = nuAssessConfidence(item({ query: 'jasmine rice' }), SEARCHES['jasmine rice'], CLAR);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.strictEqual(v.clarification, null);
});

test('clarify: option patch updates the shared request and re-enters the SAME resolver', async () => {
  const req = item({ query: 'chicken breast' });
  const v = nuAssessConfidence(req, [CHK_RAW, CHK_COOKED], CLAR);
  const cookedIdx = v.clarification.options.findIndex((o) => /cooked/i.test(o.label));
  const patched = nuApplyClarification(req, v.clarification, cookedIdx);
  assert.strictEqual(patched.query, 'chicken breast cooked', 'deterministic request patch');
  assert.deepStrictEqual(patched.clarified, ['preparation'], 'dimension recorded for loop prevention');
  // re-enters the normal resolver (dormant path) — no parallel resolution
  SEARCHES['chicken breast cooked'] = [CHK_COOKED];
  PORTIONS[CHK_COOKED.fdcId] = [];
  const r = await nuAiResolveItem(patched);
  assert.ok(!r.needsChoice && !r.unmatched);
  assert.strictEqual(r.food.usda_fdc_id, CHK_COOKED.fdcId);
});

test('clarify: free-text answer patches the target field', () => {
  const req = item({ query: 'milk', brand: 'fairlife' });
  const v = nuAssessConfidence(req, [MK_A, MK_B], CLAR);
  const patched = nuApplyClarification(req, v.clarification, 'lactaid');
  assert.strictEqual(patched.brand, 'lactaid');
  assert.deepStrictEqual(patched.clarified, ['brand']);
});

test('clarify: an answered dimension is never asked again (loop prevention)', () => {
  const v1 = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED], CLAR);
  assert.strictEqual(v1.disposition, 'clarify_input');
  const answered = item({ query: 'chicken breast', clarified: ['preparation'] });
  const v2 = nuAssessConfidence(answered, [CHK_RAW, CHK_COOKED], CLAR);
  assert.notStrictEqual(v2.disposition, 'clarify_input', 'preparation must not be re-asked');
  assert.strictEqual(v2.disposition, 'choose_candidate');
});

test('clarify: an unanswered dimension still surfaces after another is resolved', () => {
  // 'brand' already answered; the pool still differs by preparation → prep asked
  const v = nuAssessConfidence(item({ query: 'chicken breast', clarified: ['brand'] }), [CHK_RAW, CHK_COOKED], CLAR);
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.strictEqual(v.clarification.type, 'preparation');
});

test('clarify: after the clarification path is exhausted → chooser, not repeated questions', () => {
  const req = item({ query: 'chicken breast', clarified: ['brand', 'preparation', 'form'] });
  const v = nuAssessConfidence(req, [CHK_RAW, CHK_COOKED], CLAR);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.clarification, null);
});

test('clarify: reason codes and ambiguity types are stable and bounded', () => {
  const prep = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED], CLAR);
  assert.strictEqual(prep.reasons[0].code, 'targeted_clarification');
  assert.strictEqual(prep.reasons[0].detail, 'preparation');
  assert.deepStrictEqual(prep.ambiguity, ['preparation']);
});

test('clarify: production ships with targetedClarification ACTIVE, scoreEscalation OFF', () => {
  assert.strictEqual(NU_CONFIDENCE.targetedClarification, true, 'activated in checkpoint 4');
  assert.strictEqual(NU_CONFIDENCE.scoreEscalation, false, 'escalation stays off');
  // default policy: an eligible chooser becomes a focused question
  const v = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED]);
  assert.strictEqual(v.disposition, 'clarify_input');
  // dormancy remains available via explicit override
  const off = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED],
    { targetedClarification: false });
  assert.strictEqual(off.disposition, 'choose_candidate');
});

/* ── Checkpoint 3.5: activation-readiness audit ─────────────────────────── */

test('audit: targetedClarification and scoreEscalation are independent policies', () => {
  const foods = [GEN_RAW, GEN_CKD];           // generic prep pair, close scores
  const q = () => item({ query: 'chicken' });
  // neither → auto (Checkpoint 2 parity)
  assert.strictEqual(nuAssessConfidence(q(), foods,
    { scoreEscalation: false, targetedClarification: false }).disposition, 'auto_resolve');
  // clarification ONLY: a generic auto case is NOT made interruptible → stays auto
  assert.strictEqual(nuAssessConfidence(q(), foods,
    { scoreEscalation: false, targetedClarification: true }).disposition, 'auto_resolve');
  // escalation ONLY: interruptible, but presented as a CHOOSER, never a question
  const esc = nuAssessConfidence(q(), foods, { scoreEscalation: true, targetedClarification: false });
  assert.strictEqual(esc.disposition, 'choose_candidate');
  assert.strictEqual(esc.clarification, null);
  // BOTH: interruptible (escalation) AND presented as a targeted question
  const both = nuAssessConfidence(q(), foods, { scoreEscalation: true, targetedClarification: true });
  assert.strictEqual(both.disposition, 'clarify_input');
  assert.strictEqual(both.clarification.type, 'preparation');
});

test('audit: an already-interruptible (branded) prep case clarifies without escalation', () => {
  // branded crowd is interruptible on its own → prep clarify needs NO gapDecisive
  const v = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED],
    { targetedClarification: true });   // scoreEscalation implicitly false
  assert.strictEqual(v.disposition, 'clarify_input');
  assert.strictEqual(v.clarification.type, 'preparation');
});

test('audit: multiple unrelated brands → chooser remains preferred', () => {
  const v = nuAssessConfidence(item({ query: 'protein bar' }), SEARCHES['protein bar'], CLAR);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.clarification, null);
});

test('audit: nuPatchQuery spaces tokens and dedupes (idempotent)', () => {
  assert.strictEqual(nuPatchQuery('chicken breast', 'cooked'), 'chicken breast cooked');
  assert.strictEqual(nuPatchQuery('chicken breast cooked', 'cooked'), 'chicken breast cooked');
  assert.strictEqual(nuPatchQuery('oats dry', 'dry'), 'oats dry');       // preserved, no dup
  assert.strictEqual(nuPatchQuery('', 'cooked'), 'cooked');
  assert.strictEqual(nuPatchQuery('tuna', 'oil'), 'tuna oil');
});

test('audit: applying the same clarification answer twice never duplicates a token', () => {
  const req = item({ query: 'chicken breast' });
  const v = nuAssessConfidence(req, [CHK_RAW, CHK_COOKED], CLAR);
  const idx = v.clarification.options.findIndex((o) => /cooked/i.test(o.label));
  const once = nuApplyClarification(req, v.clarification, idx);
  assert.strictEqual(once.query, 'chicken breast cooked');
  const twice = nuApplyClarification(once, v.clarification, idx);
  assert.strictEqual(twice.query, 'chicken breast cooked', 'no token duplication');
  assert.deepStrictEqual(twice.clarified, ['preparation'], 'clarified deduped too');
});

test('audit: clarification carries no metadata duplicated on the verdict', () => {
  const v = nuAssessConfidence(item({ query: 'chicken breast' }), [CHK_RAW, CHK_COOKED], CLAR);
  const c = v.clarification;
  assert.strictEqual(c.ambiguity, undefined, 'ambiguity lives on the verdict only');
  assert.strictEqual(c.reason, undefined, 'reason lives on verdict.reasons only');
  assert.strictEqual(c.candidateRefs, undefined, 'no embedded candidate objects');
  assert.deepStrictEqual(v.ambiguity, ['preparation']);
  assert.strictEqual(v.reasons[0].code, 'targeted_clarification');
  assert.deepStrictEqual(Object.keys(c).sort(),
    ['allowFreeText', 'options', 'prompt', 'target', 'type'], 'minimal field set');
});

test('audit: normalized patched request re-enters the SAME resolver', async () => {
  const req = item({ query: 'chicken breast' });
  const v = nuAssessConfidence(req, [CHK_RAW, CHK_COOKED], CLAR);
  const idx = v.clarification.options.findIndex((o) => /cooked/i.test(o.label));
  const patched = nuApplyClarification(req, v.clarification, idx);
  assert.strictEqual(patched.query, 'chicken breast cooked');
  SEARCHES['chicken breast cooked'] = [CHK_COOKED];
  PORTIONS[CHK_COOKED.fdcId] = [];
  const r = await nuAiResolveItem(patched);
  assert.ok(!r.needsChoice && !r.unmatched);
  assert.strictEqual(r.food.usda_fdc_id, CHK_COOKED.fdcId);
});

/* ── Checkpoint 4: activation + re-entry through resolveItem ─────────────── */
// Register fixtures the resolver can search by query.
SEARCHES['chix prep'] = [CHK_RAW, CHK_COOKED];
SEARCHES['chix prep cooked'] = [CHK_COOKED];   // re-search after a "cooked" answer
SEARCHES['chix prep2'] = [CHK_RAW, CHK_COOKED];
SEARCHES['org milk'] = [MK_A, MK_B];
SEARCHES['tuna pick'] = [TUNA_WATER, TUNA_OIL];
PORTIONS[700001] = []; PORTIONS[700002] = []; PORTIONS[700030] = [];
PORTIONS[700031] = []; PORTIONS[700040] = []; PORTIONS[700041] = [];

test('activation: an eligible prep chooser now resolves to a clarification item', async () => {
  const it = await nuAiResolveItem(item({ query: 'chix prep' }));
  assert.strictEqual(it.needsClarification, true);
  assert.ok(!it.needsChoice && !it.unmatched);
  assert.strictEqual(it.clarification.type, 'preparation');
  assert.ok(Array.isArray(it.choices) && it.choices.length === 2, 'fallback chooser rows present');
});

test('activation: a multi-brand chooser stays a chooser (no clarification)', async () => {
  const it = await nuAiResolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(it.needsChoice, true);
  assert.ok(!it.needsClarification);
});

test('re-entry: answering prep resolves the item via the same resolver', async () => {
  const it = await nuAiResolveItem(item({ query: 'chix prep' }));
  const idx = it.clarification.options.findIndex((o) => /cooked/i.test(o.label));
  const r = await nuAiResolveClarification(it, idx);
  assert.ok(!r.needsClarification && !r.needsChoice && !r.unmatched);
  assert.strictEqual(r.food.usda_fdc_id, CHK_COOKED.fdcId);
});

test('re-entry: malformed option index keeps the clarification visible', async () => {
  const it = await nuAiResolveItem(item({ query: 'chix prep' }));
  assert.strictEqual(await nuAiResolveClarification(it, 99), it, 'invalid index → unchanged item');
  assert.strictEqual(await nuAiResolveClarification(it, -1), it);
});

test('re-entry: empty / whitespace free text is rejected (item unchanged)', async () => {
  const milk = await nuAiResolveItem(item({ query: 'org milk', brand: 'fairlife' }));
  assert.strictEqual(milk.clarification.type, 'brand');
  assert.strictEqual(await nuAiResolveClarification(milk, '   '), milk);
  assert.strictEqual(await nuAiResolveClarification(milk, ''), milk);
});

test('re-entry: a different dimension can surface after the first answer (no loop)', async () => {
  const milk = await nuAiResolveItem(item({ query: 'org milk', brand: 'fairlife' }));
  const next = await nuAiResolveClarification(milk, 0);   // "Search all brands" (brand → '')
  assert.strictEqual(next.needsClarification, true);
  assert.strictEqual(next.clarification.type, 'form', 'brand answered → form (whole vs skim) surfaces');
  assert.deepStrictEqual(next.parsed.clarified, ['brand']);
});

test('re-entry: free-text brand answer is applied and brand is never re-asked', async () => {
  const milk = await nuAiResolveItem(item({ query: 'org milk', brand: 'fairlife' }));
  const r = await nuAiResolveClarification(milk, 'lactaid');
  assert.strictEqual(r.parsed.brand, 'lactaid');
  assert.deepStrictEqual(r.parsed.clarified, ['brand']);
  assert.notStrictEqual(r.clarification && r.clarification.type, 'brand');
});

test('re-entry: an answered dimension is not re-asked → bounded chooser fallback', async () => {
  const it = await nuAiResolveItem(item({ query: 'chix prep2', clarified: ['preparation'] }));
  assert.ok(!it.needsClarification, 'preparation already answered → no prep question');
  assert.strictEqual(it.needsChoice, true, 'falls back to the bounded chooser');
});

test('state: resolving one clarification item does not disturb another', async () => {
  const a = await nuAiResolveItem(item({ query: 'chix prep' }));
  const b = await nuAiResolveItem(item({ query: 'tuna pick' }));
  const idx = a.clarification.options.findIndex((o) => /cooked/i.test(o.label));
  const aResolved = await nuAiResolveClarification(a, idx);
  assert.ok(!aResolved.needsClarification);
  assert.strictEqual(b.needsClarification, true, 'sibling item untouched');
  assert.strictEqual(b.clarification.type, 'form');
});

test('state: unresolved clarification items are excluded from totals', () => {
  const clarItem = { needsClarification: true, clarification: {}, parsed: {} };
  const resolved = { perUnit: { calories: 100, protein: 10 }, servings: 1 };
  assert.strictEqual(nuAiTotals([clarItem, resolved]).calories, 100);
  assert.strictEqual(nuAiTotals([clarItem, resolved]).protein, 10);
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
  const clar = { needsClarification: true, clarification: { type: 'preparation' }, parsed: { query: 'x' } };

  const saved = [];
  global.nuSaveLog = async (uid, entry) => { saved.push({ uid, entry }); return { data: { id: 'log' + saved.length }, error: null }; };
  const n = await nuAiLogItems([egg, toast, un, bar, clar], 'breakfast', '2026-07-13');
  assert.strictEqual(n, 2, 'unmatched + unresolved chooser + clarification skipped');

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

/* ── standalone resolver (Phase 4.2.1b) ─────────────────────────────── */

// The core must run in plain Node through require() with an injected
// adapter — no nutrition.js, no browser globals, no fetch. This is the
// contract the 4.4 coach route and the benchmark runner build on.
test('nuCreateResolver resolves standalone via require() + fake adapter', async () => {
  const core = require('./food-core.js');
  const r = core.nuCreateResolver({
    search: async (q) => SEARCHES[q] || [],
    portions: async (id) => PORTIONS[id] || [],
  });

  const egg = await r.resolveItem(item({ text: '2 eggs', query: 'egg', quantity: 2 }));
  assert.strictEqual(egg.food.usda_fdc_id, 171287);
  assert.strictEqual(egg.servings, 2);
  assert.strictEqual(egg.perUnit.calories, 78);

  const oats = await r.resolveItem(item({ query: 'rolled oats', quantity: 0.5, unit: 'cup' }));
  assert.strictEqual(oats.food.usda_fdc_id, 999021, 'alike retry works through the adapter');

  const bar = await r.resolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(bar.needsChoice, true);
  const picked = await r.resolveChoice(bar, 2);
  assert.strictEqual(picked.food.usda_fdc_id, 999004);

  const boom = await r.resolveItem(item({ query: 'zzz' }));
  assert.strictEqual(boom.unmatched, true);

  // an adapter that throws must degrade to unmatched, never throw out
  const broken = core.nuCreateResolver({ search: async () => { throw new Error('down'); },
                                         portions: async () => [] });
  const failed = await broken.resolveItem(item({ query: 'egg' }));
  assert.strictEqual(failed.unmatched, true);
});

/* ── persisted-format pins (Phase 4.2.1a — locked BEFORE extraction) ──── */
// user_food_favorites.food_key and saved-meal items store nuFoodKey output;
// any format change orphans existing rows. Pin the exact strings.
test('nuFoodKey persisted formats: usda:<fdcId> and custom:<name>', () => {
  assert.strictEqual(nuFoodKey({ usda_fdc_id: 171287 }), 'usda:171287');
  assert.strictEqual(nuFoodKey({ usda_fdc_id: '999002', name: 'ignored' }), 'usda:999002',
    'USDA identity wins over name');
  assert.strictEqual(nuFoodKey({ name: '  Chicken Breast ' }), 'custom:chicken breast',
    'custom keys trim + lowercase');
  assert.strictEqual(nuFoodKey({ usda_fdc_id: '', name: 'Oats' }), 'custom:oats',
    'empty fdc id falls through to the name');
  assert.strictEqual(nuFoodKey({ name: '' }), null);
  assert.strictEqual(nuFoodKey(null), null);
});

// nuNormalizeUsdaFood output feeds nu_pendingSource → nuSaveLog src columns and
// reopens favorites/recents from raw_food — pin the persisted fields.
test('nuNormalizeUsdaFood persisted fields are pinned', () => {
  const milk = nuNormalizeUsdaFood(MILK);           // 240 MLT serving → ml liquid
  assert.strictEqual(milk.name, 'Whole Milk (FairLife)', 'logged name keeps the brand suffix');
  assert.strictEqual(milk.usda_fdc_id, 999001);
  assert.strictEqual(milk.is_liquid, true);
  assert.strictEqual(milk.has_serving, true);
  assert.strictEqual(milk.serving_amount, 240);
  assert.strictEqual(milk.serving_unit, 'ml', 'UNECE MLT maps to ml');
  assert.strictEqual(milk.serving_description, '1 cup');
  assert.strictEqual(milk.grams, null, 'ml has no fabricated gram weight');
  assert.strictEqual(milk.calories, 146);           // 61/100ml × 240

  const egg = nuNormalizeUsdaFood(EGG);             // no serving → honest 100 g basis
  assert.strictEqual(egg.name, 'Egg, whole, cooked, hard-boiled');
  assert.strictEqual(egg.has_serving, false);
  assert.strictEqual(egg.serving_description, '100 g');
  assert.strictEqual(egg.serving_amount, 100);
  assert.strictEqual(egg.serving_unit, 'g');
  assert.strictEqual(egg.grams, 100);
  assert.strictEqual(egg.calories, 155);

  const bar = nuNormalizeUsdaFood(QUEST_CC);        // 60 g manufacturer serving
  assert.strictEqual(bar.serving_description, '1 bar');
  assert.strictEqual(bar.grams, 60);
  assert.strictEqual(bar.calories, 190);            // 317/100g × 60
  assert.strictEqual(bar.raw, QUEST_CC, 'raw payload rides along for provenance');
});

/* ── SaveSrc contract (Phase 4.2.1c) ────────────────────────────────── */

test('nuBuildSaveSrc normalization is pinned (the SaveSrc contract)', () => {
  const src = nuBuildSaveSrc({
    name: 'X', usda_fdc_id: 42, brand: '', gtin_upc: undefined,
    serving_amount: undefined, serving_unit: '', serving_description: null,
    grams: 0, fiber: undefined, sugar: '2.5',
    calories: 100, protein: 10, carbs: 20, fat: 5, raw: null,
  });
  assert.deepStrictEqual(src, {
    name: 'X', usda_fdc_id: 42, brand: null, gtin_upc: null,
    serving_amount: null, serving_unit: null, serving_description: null,
    grams: 0,                    // 0 g is a value, not absence — must survive
    fiber: 0, sugar: 2.5,
    calories: 100, protein: 10, carbs: 20, fat: 5, raw: null,
  });
});

test('nuLogSavedMeal replays through nuBuildSaveSrc — src field-for-field', async () => {
  const usdaItem = {
    food_key: 'usda:999002', name: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR (Quest Nutrition)',
    servings: 2, calories: 190, protein: 21, carbs: 22.2, fat: 7.2,
    source: 'usda', usda_fdc_id: 999002, brand: 'Quest Nutrition', gtin_upc: '',
    serving_amount: 60, serving_unit: 'g', serving_description: '1 bar',
    grams: 60, fiber: 13.8, sugar: 1.2, raw_food: QUEST_CC,
  };
  const manualItem = { name: 'My Shake', servings: 1, calories: 200, protein: 30,
    carbs: 10, fat: 4, usda_fdc_id: null };

  const saved = [];
  global.nuSaveLog = async (uid, entry) => { saved.push(entry); return { data: { id: 'x' }, error: null }; };
  const n = await nuLogSavedMeal({ items: [usdaItem, manualItem] }, 'lunch', '2026-07-16');
  assert.strictEqual(n, 2);

  // exact 15-field SaveSrc — byte-for-byte what the pre-4.2.1c literal built
  assert.deepStrictEqual(saved[0].src, {
    name: usdaItem.name, usda_fdc_id: 999002,
    brand: 'Quest Nutrition', gtin_upc: null,
    serving_amount: 60, serving_unit: 'g', serving_description: '1 bar',
    grams: 60, fiber: 13.8, sugar: 1.2,
    calories: 190, protein: 21, carbs: 22.2, fat: 7.2,
    raw: QUEST_CC,
  });
  assert.strictEqual(saved[0].servings, 2);
  assert.strictEqual(saved[0].meal, 'lunch');
  assert.strictEqual(saved[1].src, null, 'manual items carry no provenance');
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
