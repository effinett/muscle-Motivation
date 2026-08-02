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
// The common GENERIC USDA milk: reports its serving in GRAMS, so is_liquid=false —
// the live "a splash of milk" case. The milk FAMILY (liquid form) must still make a
// splash resolvable in ml (Phase 4.2.7), not fall to the default cup.
const GMILK = {
  fdcId: 746782, description: 'Milk, whole, 3.25% milkfat, with added vitamin D',
  brand: '', group: 'generic', foodCategory: 'Dairy and Egg Products',
  servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 },
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
  almonds: [ALMONDS], 'whole milk': [GMILK],
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
// pages (nutrition.html, app.html). Phase 4.2.5: food-portion.js loads after
// food-core.js (it reuses its globals) and before nutrition.js.
// Phase 4.2.10c: food-display.js loads after food-core (reuses its globals),
// before nutrition.js — same order as the pages — so the shared presentation
// model (FoodDisplay) is available to the rendering wiring + identity pins.
['food-core.js', 'food-portion.js', 'food-display.js', 'nutrition.js'].forEach(function (f) {
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

test('handfuls: deterministic category-aware estimates, never 100 g', async () => {
  // Phase 4.2.5: the flat NU_APPROX_UNITS table became category-aware. A handful
  // of nuts is the canonical 28 g serving; small/large apply the 0.7/1.4 size
  // multipliers → 20 g / 39 g (the former flat 40 g became 39 g under the clean
  // multiplier — within the estimate's own range, and now consistent across every
  // family). The critical guarantee is unchanged: a handful is never ~100 g.
  const hand = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful' }));
  assert.strictEqual(hand.grams, 28);
  assert.strictEqual(hand.serving_description, 'handful (~28 g)');
  assert.strictEqual(hand.estimated, true, 'flagged as an estimate');
  assert.strictEqual(hand.portion.family, 'nuts', 'category-aware');
  assert.strictEqual(hand.perUnit.calories, 162);        // 579 × 0.28

  const small = await nuAiResolveItem(item({ query: 'almonds', unit: 'small handful' }));
  assert.strictEqual(small.grams, 20);
  assert.strictEqual(small.perUnit.calories, 116);

  const large = await nuAiResolveItem(item({ query: 'almonds', quantity: 2, unit: 'large handfuls' }));
  assert.strictEqual(large.grams, 39, 'plural normalizes; large = 1.4×');
  assert.strictEqual(large.servings, 2, 'handful counts DO multiply');

  // an explicit weight still beats the hand estimate
  const weighed = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful', grams: 30 }));
  assert.strictEqual(weighed.grams, 30);
  assert.strictEqual(weighed.servings, 1);
});

test('4.2.7: vague quantifier recovered from RAW TEXT when the parser drops the unit', async () => {
  // The REAL AI Quick Log path: the parser returns unit=null for "a splash of
  // milk" but the phrase survives in `text`. Recovery must restore "splash" (a
  // pure quantifier, never a food noun) and produce the shared splash estimate —
  // NEVER the food's default 1-cup serving. Generalizes beyond small_amount.
  const splash = await nuAiResolveItem(item({ query: 'milk', text: 'a splash of milk', unit: null }));
  assert.strictEqual(splash.unmatched, false);
  assert.strictEqual(splash.food.usda_fdc_id, 999001, 'semantically-correct milk candidate');
  assert.strictEqual(splash.estimated, true, 'marked estimated, not exact');
  assert.match(splash.serving_description, /splash \(~15 ml\)/, 'shared splash approximation, not 1 cup');
  assert.notStrictEqual(splash.serving_description, '1 cup', 'never silently substitutes the default serving');
  assert.strictEqual(splash.grams, null, 'no fabricated gram weight for a liquid');
  assert.strictEqual(splash.servings, 1);

  // Leading verb / filler survives ("add a splash of milk").
  const added = await nuAiResolveItem(item({ query: 'milk', text: 'add a splash of milk', unit: null }));
  assert.strictEqual(added.estimated, true);
  assert.match(added.serving_description, /splash \(~15 ml\)/);

  // Generalizes to another pure quantifier: handful, recovered from raw text.
  const hand = await nuAiResolveItem(item({ query: 'almonds', text: 'a handful of almonds', unit: null }));
  assert.strictEqual(hand.estimated, true);
  assert.strictEqual(hand.serving_description, 'handful (~28 g)');
});

test('4.2.7: splash of a GRAM-serving milk (is_liquid=false) still resolves in mL, not 1 cup', async () => {
  // The live case: the generic USDA milk reports grams (is_liquid=false). The milk
  // FAMILY is a liquid form, so a splash is a ~15 mL estimate — NEVER the default
  // 1-cup serving and NEVER a "didn't match a size" 100 g fallback.
  const r = await nuAiResolveItem(item({ query: 'whole milk', text: 'a splash of whole milk', unit: null }));
  assert.strictEqual(r.unmatched, false);
  assert.strictEqual(r.food.usda_fdc_id, 746782, 'the gram-serving generic milk');
  assert.strictEqual(r.food.is_liquid, false, 'USDA gives it a gram serving');
  assert.strictEqual(r.estimated, true, 'marked estimated');
  assert.notStrictEqual(r.unitUnresolved, true, 'NOT a "didn’t match a size" fallback');
  assert.match(r.serving_description, /splash \(~15 ml\)/, 'liquid-family splash in mL, not 1 cup');
  assert.strictEqual(r.grams, null, 'no fabricated gram weight for a liquid-family estimate');
  // nutrition from ~15 ml, not 244 g (1 cup): 61 kcal/100 × 15 ≈ 9 kcal
  assert.ok(r.perUnit.calories > 6 && r.perUnit.calories < 12, '~15 ml worth, not a cup (149)');
});

test('4.2.7: an EXPLICIT exact quantity always beats a raw-text vague token', async () => {
  // "1 cup milk with a splash of vanilla": the milk item carries an explicit
  // unit=cup — the unrelated "splash" token in the raw text must NOT hijack it.
  // Recovery is gated on the parser giving NO unit, so exact quantities win.
  const r = await nuAiResolveItem(item({
    query: 'milk', text: '1 cup milk with a splash of vanilla', unit: 'cup', quantity: 1 }));
  assert.strictEqual(r.unmatched, false);
  assert.notStrictEqual(r.estimated, true, 'the exact cup is used, not a splash estimate');
  assert.doesNotMatch(r.serving_description || '', /splash/i, 'the vanilla splash never touches the milk');
});

test('4.2.7: a recovered vague unit that is nonsensical for the food stays safe (no fabrication)', async () => {
  // "a splash of almonds" (unit dropped) → splash recovered, but a splash is a
  // LIQUID measure incompatible with a solid → the safe unresolved flag, exactly
  // like the explicit-unit case. Never invents a weight.
  const r = await nuAiResolveItem(item({ query: 'almonds', text: 'a splash of almonds', unit: null }));
  assert.strictEqual(r.unitUnresolved, true, 'flagged, not fabricated');
  assert.strictEqual(r.servings, 1);
});

test('4.2.7: raw-text recovery needs the raw phrase (manual Search, with no text, is unaffected)', async () => {
  // Parity guard: recovery keys on `text`. A manual food pick (no vague phrase,
  // no unit) resolves to the normal default serving — Search never invents a
  // vague portion out of nothing. Only the text-logging surfaces carry a phrase.
  const r = await nuAiResolveItem(item({ query: 'milk', text: '', unit: null }));
  assert.notStrictEqual(r.estimated, true, 'no phrase → no recovered estimate');
});

test('4.2.5: nutrition.js portion-correction session seam (capture → read)', async () => {
  // Exercises the REAL browser wiring in nutrition.js: nuRecordPortionCorrection
  // (capture) → nu_portionCorrections (session store) → nuAiResolveItem (read).
  nu_portionCorrections.length = 0;                       // clean session
  const before = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful' }));
  assert.strictEqual(before.grams, 28, 'default estimate first');

  nuRecordPortionCorrection(before, 35);                  // user corrects the estimate
  const after = await nuAiResolveItem(item({ query: 'almonds', unit: 'handful' }));
  assert.strictEqual(after.grams, 35, 'the correction is reused for the same food + phrase');
  assert.strictEqual(after.portion.provenance.correctionApplied, true);

  // Reinforcing the same correction keeps it (count bumps, still applies).
  nuRecordPortionCorrection(after, 35);
  assert.strictEqual(nu_portionCorrections[0].reinforcement_count, 2);

  // A different vague class for the same food does NOT inherit it.
  const bowl = await nuAiResolveItem(item({ query: 'almonds', unit: 'small bowl' }));
  assert.ok(!bowl.portion || !bowl.portion.provenance.correctionApplied);
  nu_portionCorrections.length = 0;                       // leave the session clean
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

/* ── Phase 4.2.10c: display is presentation-only, identity lives on `raw` ──── */
test('10c: clarification choices carry the full raw candidate; display never replaces identity', async () => {
  const bar = await nuAiResolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(bar.needsChoice, true);
  bar.choices.forEach(function (c) {
    assert.ok(c.raw && c.raw.fdcId != null, 'each choice keeps its raw candidate + canonical id');
    const cd = FoodDisplay.buildChoiceDisplay(c.raw);      // display is DERIVED from raw
    assert.strictEqual(cd.fullName, c.raw.description, 'display keeps the canonical name verbatim');
  });
  // Selecting replays the RAW candidate's identity — not the simplified label.
  const picked = await nuAiResolveChoice(bar, 2);
  assert.strictEqual(picked.food.usda_fdc_id, bar.choices[2].raw.fdcId, 'raw fdcId → resolved usda_fdc_id');
});

test('10c wiring: recents render through the shared compact label grammar', () => {
  // Mock the two DOM nodes nuRenderRecent writes to, then inspect the HTML.
  const els = { nuRecentWrap: { style: {} }, nuRecentChips: { innerHTML: '' } };
  const origGet = document.getElementById;
  document.getElementById = function (id) { return els[id] || null; };
  try {
    nuRenderRecent([{ name: 'Chicken, broiler, breast, meat only, cooked, roasted', usda_fdc_id: 5, source: 'usda' }]);
  } finally { document.getElementById = origGet; }
  const visible = els.nuRecentChips.innerHTML.replace(/(?:aria-label|title)="[^"]*"/g, '');
  assert.ok(/Chicken Breast/.test(visible), 'chip uses the shared grammar');
  assert.ok(!/broiler|meat only/.test(visible), 'the raw canonical wording is gone from the visible chip (shared grammar only)');
});

test('10c: a simplified display name never enters the food_key (id-based identity)', () => {
  const src = { usda_fdc_id: 999004, source: 'usda', name: 'BAREBELLS PROTEIN BAR CARAMEL CASHEW', brand: 'Barebells' };
  const display = FoodDisplay.buildFoodDisplay(src);
  assert.notStrictEqual(display.name, src.name, 'the display name IS simplified');
  // the key is built from the canonical name/id — the simplified label is absent.
  const key = nuFoodKey({ usda_fdc_id: src.usda_fdc_id, name: src.name });
  assert.ok(key.indexOf('999004') !== -1, 'food_key is id-based');
  assert.strictEqual(key.indexOf(display.name), -1, 'simplified label never enters the key');
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

test('confidence guard (4.2.7): top candidate hard-mismatch, sole → unresolved', () => {
  // Ranking stamps mismatch=true when the user explicitly named a form/species/
  // identity the top hit contradicts (e.g. no real "fairlife protein bar" exists —
  // only Fairlife MILK survives the strict branded keep-gate). Never auto-resolve
  // an incompatible sole survivor.
  const milkOnly = [{ fdcId: 5551, description: 'Fairlife Whole Milk', brand: 'fairlife',
    group: 'branded', mismatch: true, nutrients: { kcal: 61, protein: 5, carbs: 5, fat: 3 } }];
  const v = nuAssessConfidence(item({ query: 'fairlife protein bar', brand: 'fairlife' }), milkOnly);
  assert.strictEqual(v.disposition, 'unresolved');
  assert.strictEqual(v.reasons[0].code, 'top_hard_mismatch_unresolved');
});

test('confidence guard (4.2.7): top hard-mismatch with alternatives → choose_candidate', () => {
  const pool = [
    { fdcId: 5551, description: 'Fairlife Whole Milk', brand: 'fairlife', group: 'branded',
      mismatch: true, nutrients: { kcal: 61, protein: 5, carbs: 5, fat: 3 } },
    { fdcId: 5552, description: 'Chocolate Protein Shake', brand: 'X', group: 'branded',
      mismatch: false, nutrients: { kcal: 160, protein: 30, carbs: 5, fat: 3 } },
  ];
  const v = nuAssessConfidence(item({ query: 'fairlife protein bar', brand: 'fairlife' }), pool);
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.reasons[0].code, 'top_hard_mismatch');
});

test('confidence guard (4.2.7): a correctly-matched top hit is NOT flagged (no over-clarify)', () => {
  // The common case: ranking sets mismatch=false, so ordinary logging is untouched.
  const v = nuAssessConfidence(item({ query: 'egg' }),
    SEARCHES.egg.map(function (f) { return Object.assign({ mismatch: false }, f); }));
  assert.strictEqual(v.disposition, 'auto_resolve');
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

/* ── Path C: material-ambiguity escalation (Phase 4.2.10b) ───────────────── */
// A candidate carrying the ranking-stamped `identityScore` the escalation reads.
let _pcId = 990000;
function pc(desc, cat, score, idScore, n) {
  return { fdcId: ++_pcId, description: desc, brand: '', group: 'generic',
    foodCategory: cat, score: score, identityScore: idScore, nutrients: n };
}
const SOUP_TIE = () => [
  pc('Soup, tomato, canned', 'Soups, Sauces, and Gravies', 4050, 2000, { kcal: 60, protein: 1.7, carbs: 13, fat: 0.6, sugar: 8 }),
  pc('Soup, vegetable, canned', 'Soups, Sauces, and Gravies', 4050, 2000, { kcal: 40, protein: 1.5, carbs: 7, fat: 0.9, sugar: 2 }),
  pc('Soup, cream of mushroom, canned', 'Soups, Sauces, and Gravies', 4050, 2000, { kcal: 79, protein: 1.8, carbs: 7, fat: 5, sugar: 1 }),
];

test('Path C: tied material subtypes, no defensible default → choose_candidate', () => {
  const v = nuAssessConfidence(item({ query: 'soup' }), SOUP_TIE());
  assert.strictEqual(v.disposition, 'choose_candidate');
  assert.strictEqual(v.reasons[0].code, 'material_ambiguity_escalation');
  assert.strictEqual(v.ambiguity[0], 'material_subtype_tie');
  assert.strictEqual(v.material, true);
});

test('Path C: a stronger-identity preferred default stays auto (chicken→breast)', () => {
  const pool = [
    pc('Chicken, breast, roasted', 'Poultry Products', 7300, 5250, { kcal: 165, protein: 31, carbs: 0, fat: 3.6, sugar: 0 }),
    pc('Chicken, thigh, cooked', 'Poultry Products', 7200, 4950, { kcal: 209, protein: 26, carbs: 0, fat: 10.9, sugar: 0 }),
  ];
  const v = nuAssessConfidence(item({ query: 'chicken' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve');
  assert.ok(v.reasons.some((r) => r.code === 'default_preserved'), 'records why the default was kept');
});

test('Path C: an immaterial top cluster stays auto (coffee→brewed)', () => {
  const pool = [
    pc('Coffee, brewed, decaffeinated', 'Beverages', 4150, 2100, { kcal: 0, protein: 0.1, carbs: 0, fat: 0, sugar: 0 }),
    pc('Coffee, brewed, prepared', 'Beverages', 4150, 2100, { kcal: 1, protein: 0.1, carbs: 0, fat: 0, sugar: 0 }),
    pc('Coffee, with milk and sugar', 'Beverages', 4050, 2000, { kcal: 56, protein: 3, carbs: 7, fat: 2, sugar: 6 }),
  ];
  const v = nuAssessConfidence(item({ query: 'coffee' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve');
});

test('Path C: an explicit query modifier keeps a specific query auto (sweet tea)', () => {
  // sweetened tea wins on total score (polarity) but not on identityScore — the
  // explicit "sweet" modifier is what keeps it from escalating against tea cake.
  const pool = [
    pc('Tea, iced, sweetened with sugar', 'Beverages', 410, 0, { kcal: 30, protein: 0, carbs: 8, fat: 0, sugar: 7 }),
    pc('Tea cake, sweet', 'Baked Products', 210, -200, { kcal: 350, protein: 5, carbs: 55, fat: 12, sugar: 30 }),
    pc('Tea, iced, unsweetened', 'Beverages', 110, 100, { kcal: 1, protein: 0, carbs: 0, fat: 0, sugar: 0 }),
  ];
  const v = nuAssessConfidence(item({ query: 'sweet tea' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve');
});

test('Path C: a decisively-beaten material competitor never escalates (apple→raw)', () => {
  const pool = [
    pc('Apples, raw, with skin', 'Fruits and Fruit Juices', 6200, 4300, { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, sugar: 10 }),
    pc('Apple pie, prepared', 'Baked Products', 2000, 100, { kcal: 265, protein: 2.4, carbs: 37, fat: 12, sugar: 16 }),
  ];
  const v = nuAssessConfidence(item({ query: 'apple' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve', 'the material rival is far below → no ambiguity');
});

test('Path C: NOT applied without ranking-stamped identityScore (legacy parity)', () => {
  const pool = SOUP_TIE().map((f) => { const g = Object.assign({}, f); delete g.identityScore; return g; });
  const v = nuAssessConfidence(item({ query: 'soup' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve', 'no identity evidence → pre-4.2.10b behavior preserved');
});

test('Path C: policy flag off → escalation dormant', () => {
  const v = nuAssessConfidence(item({ query: 'soup' }), SOUP_TIE(), { materialAmbiguity: false });
  assert.strictEqual(v.disposition, 'auto_resolve');
});

/* ── Explicit-family consistency (Phase 4.2.10b) ──────────────────────────── */
test('explicit family: a hard-mismatched family is never a clarification option', () => {
  // "protein powder" must not offer greek yogurt (ranking stamps mismatch=true on
  // the incompatible form) — the only eligible candidate is the powder → auto.
  const pool = [
    { fdcId: 1, description: 'Protein powder, whey', brand: 'ON', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: false, score: 3000, identityScore: 1000, nutrients: { kcal: 400, protein: 80, carbs: 8, fat: 6, sugar: 4 } },
    { fdcId: 2, description: 'Yogurt, Greek, plain, nonfat', brand: '', group: 'generic', foodCategory: 'Dairy and Egg Products', mismatch: true, score: -200, identityScore: 0, nutrients: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.2 } },
  ];
  const v = nuAssessConfidence(item({ query: 'protein powder' }), pool);
  assert.strictEqual(v.disposition, 'auto_resolve', 'only the powder is eligible → auto');
  assert.ok(!v.alternatives.some((a) => /Yogurt/i.test(a.description)), 'yogurt never appears as an option');
});

test('explicit family: several same-family brands still clarify (no forced auto)', () => {
  const pool = [
    { fdcId: 1, description: 'Whey Protein Powder', brand: 'ON', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: false, score: 3000, identityScore: 1000, nutrients: { kcal: 400, protein: 80, carbs: 8, fat: 6, sugar: 4 } },
    { fdcId: 2, description: 'Plant Protein Powder', brand: 'Vega', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: false, score: 2900, identityScore: 1000, nutrients: { kcal: 380, protein: 24, carbs: 30, fat: 8, sugar: 5 } },
    { fdcId: 3, description: 'Protein bar, chocolate', brand: 'Quest', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: true, score: 1000, identityScore: 500, nutrients: { kcal: 350, protein: 33, carbs: 45, fat: 14, sugar: 3 } },
  ];
  const v = nuAssessConfidence(item({ query: 'protein powder' }), pool);
  assert.ok(v.disposition === 'choose_candidate' || v.disposition === 'clarify_input',
    'two distinct powder brands remain → asks (never a forced auto)');
  assert.ok(!v.alternatives.some((a) => /bar/i.test(a.description)), 'the bar (wrong family) is excluded');
  assert.strictEqual(v.alternatives.length, 2, 'both powders offered, brand choice within the family');
});

test('bare "protein" (no explicit form) keeps every family and still clarifies', () => {
  const pool = [
    { fdcId: 1, description: 'Protein powder, whey', brand: 'ON', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: false, score: 2750, identityScore: 800, nutrients: { kcal: 400, protein: 80, carbs: 8, fat: 6, sugar: 4 } },
    { fdcId: 2, description: 'Protein bar, chocolate', brand: 'Quest', group: 'branded', foodCategory: 'Sports Nutrition', mismatch: false, score: 2350, identityScore: 700, nutrients: { kcal: 350, protein: 33, carbs: 45, fat: 14, sugar: 3 } },
  ];
  const v = nuAssessConfidence(item({ query: 'protein' }), pool);
  assert.strictEqual(v.disposition, 'choose_candidate', 'no explicit form → families are not filtered');
  assert.strictEqual(v.alternatives.length, 2);
});

test('Path C helpers: structured default-evidence + ambiguity reasons', () => {
  const soup = SOUP_TIE();
  const rivals = nuCloseMaterialRivals(soup[0], soup);
  assert.ok(rivals.length >= 1, 'vegetable/cream are close material rivals of tomato');
  const def = nuDefaultEvidence(item({ query: 'soup' }), soup[0], soup, rivals);
  assert.strictEqual(def.defensible, false, 'a bare tie has no defensible default');
  assert.strictEqual(nuAmbiguityReason(soup[0], soup[1]), 'material_subtype_tie');
  // sweetness axis
  const sweet = pc('Tea, sweetened', 'Beverages', 1, 1, { kcal: 30, sugar: 7 });
  const unsweet = pc('Tea, unsweetened', 'Beverages', 1, 1, { kcal: 1, sugar: 0 });
  assert.strictEqual(nuAmbiguityReason(sweet, unsweet), 'sweetness_ambiguity');
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

/* ── Phase 4.2.5: Vague Portion Intelligence through the resolver ───────── */

// Purpose-built fixtures (kept local so the vm SEARCHES map is untouched). These
// exercise the interpreter END-TO-END through nuCreateResolver → resolveFood.
const P25 = {
  almonds:  [{ fdcId: 170567, description: 'Nuts, almonds', group: 'generic',
               foodCategory: 'Nut and Seed Products',
               nutrients: { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5, sugar: 4.4 } }],
  spinach:  [{ fdcId: 168462, description: 'Spinach, raw', group: 'generic',
               foodCategory: 'Vegetables and Vegetable Products',
               nutrients: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4 } }],
  milk:     [{ fdcId: 746782, description: 'Milk, whole', group: 'generic', is_liquid: true,
               servingSize: 240, servingSizeUnit: 'ml', householdServing: '1 cup',
               nutrients: { kcal: 61, protein: 3.1, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 } }],
  'olive oil': [{ fdcId: 171413, description: 'Oil, olive, salad or cooking', group: 'generic',
               foodCategory: 'Fats and Oils',
               nutrients: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0 } }],
  salt:     [{ fdcId: 173468, description: 'Salt, table', group: 'generic',
               nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 } }],
  cereal:   [{ fdcId: 173733, description: 'Cheerios cereal', group: 'branded',
               foodCategory: 'Breakfast Cereals',
               nutrients: { kcal: 379, protein: 12, carbs: 74, fat: 7, fiber: 10, sugar: 4 } }],
  'mystery stew': [{ fdcId: 900001, description: 'mixed prepared food', group: 'generic',
               nutrients: { kcal: 150, protein: 8, carbs: 15, fat: 6, fiber: 2, sugar: 3 } }],
  rice:     [{ fdcId: 168878, description: 'Rice, white, cooked', group: 'generic',
               foodCategory: 'Cereal Grains and Pasta', servingSize: 158, servingSizeUnit: 'g',
               householdServing: '1 cup', nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1 } }],
  'peanut butter': [{ fdcId: 172470, description: 'Peanut butter, smooth', group: 'generic',
               foodCategory: 'Legumes and Legume Products',
               nutrients: { kcal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9 } }],
  chicken:  [{ fdcId: 171534, description: 'Chicken, breast, cooked, roasted', group: 'generic',
               foodCategory: 'Poultry Products',
               nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } }],
  'little gem lettuce': [{ fdcId: 169247, description: 'Lettuce, cos or romaine, raw', group: 'generic',
               foodCategory: 'Vegetables and Vegetable Products',
               nutrients: { kcal: 17, protein: 1.2, carbs: 3.3, fat: 0.3, fiber: 2.1, sugar: 1.2 } }],
};
function p25resolver() {
  const core = require('./food-core.js');
  return core.nuCreateResolver({ search: async (q) => P25[q] || [], portions: async () => [] });
}

test('4.2.5: handful is category-aware through the resolver, and flagged estimated', async () => {
  const r = p25resolver();
  const almond = await r.resolveItem(item({ query: 'almonds', unit: 'handful' }));
  assert.strictEqual(almond.grams, 28);
  assert.strictEqual(almond.estimated, true);
  assert.strictEqual(almond.matchedUnit, true);
  assert.strictEqual(almond.serving_description, 'handful (~28 g)');
  assert.strictEqual(almond.portion.provenance.source, 'verified-table');

  const spinach = await r.resolveItem(item({ query: 'spinach', unit: 'handful' }));
  assert.strictEqual(spinach.grams, 12, 'a handful of spinach ≠ a handful of almonds');
});

test('4.2.5: liquids/condiments estimate in the right unit; grams never fabricated', async () => {
  const r = p25resolver();
  const splash = await r.resolveItem(item({ query: 'milk', unit: 'splash' }));
  assert.strictEqual(splash.serving_unit, 'ml');
  assert.strictEqual(splash.grams, null, 'no fabricated gram weight for a liquid');
  assert.strictEqual(splash.serving_description, 'splash (~15 ml)');
  assert.ok(!splash.unitUnresolved);

  const drizzle = await r.resolveItem(item({ query: 'olive oil', unit: 'drizzle' }));
  assert.strictEqual(drizzle.estimated, true);
  assert.strictEqual(drizzle.grams, 9);

  const pinch = await r.resolveItem(item({ query: 'salt', unit: 'pinch' }));
  assert.strictEqual(pinch.estimated, true);
  assert.strictEqual(pinch.grams, 0.4);
});

test('4.2.5: nonsensical vague phrases fall back + flag, never fabricate', async () => {
  const r = p25resolver();
  const splashNuts = await r.resolveItem(item({ query: 'almonds', unit: 'splash' }));
  assert.strictEqual(splashNuts.unitUnresolved, true, 'a splash of almonds → flagged, not estimated');
  assert.strictEqual(splashNuts.servings, 1, 'never multiply an unresolved unit');
  assert.strictEqual(splashNuts.portion.compatible, false);

  const bowlOil = await r.resolveItem(item({ query: 'olive oil', unit: 'bowl' }));
  assert.strictEqual(bowlOil.unitUnresolved, true);
});

test('4.2.5: exact quantities ALWAYS win over a vague phrase', async () => {
  const r = p25resolver();
  // "a handful of almonds, about 1 oz" — parse gives the explicit weight
  const weighed = await r.resolveItem(item({ query: 'almonds', unit: 'handful', grams: 28.35 }));
  assert.strictEqual(weighed.grams, 28.35, 'the stated weight wins, not the handful estimate');
  assert.strictEqual(weighed.servings, 1);
  assert.ok(!weighed.estimated, 'an exact weight is not an estimate');
});

test('4.2.5: low-confidence container portion asks, then the answer resolves it', async () => {
  const r = p25resolver();
  const some = await r.resolveItem(item({ text: 'some food', query: 'mystery stew', unit: 'bowl' }));
  assert.strictEqual(some.needsClarification, true, 'un-sized bowl of an unknown food → ask');
  assert.strictEqual(some.clarification.type, 'portion');

  // Answering "Large" (option index 2) re-enters the SAME resolver and resolves.
  const answered = await r.resolveClarification(some, 2);
  assert.ok(!answered.needsClarification, 'a sized bowl resolves — never re-asks');
  assert.strictEqual(answered.estimated, true);
  assert.ok(answered.grams > 0);
});

test('4.2.5: a known-category bowl resolves directly (no needless clarify)', async () => {
  const r = p25resolver();
  const bowl = await r.resolveItem(item({ query: 'cereal', unit: 'bowl' }));
  assert.ok(!bowl.needsClarification, 'a bowl of cereal has a category default');
  assert.strictEqual(bowl.grams, 40);
  assert.strictEqual(bowl.estimated, true);
});

test('4.2.5: session portion correction overrides the default, isolated by food+class', async () => {
  const core = require('./food-core.js');
  const corr = [{ food_key: 'usda:170567', portion_class: 'handful', grams: 35, reinforcement_count: 2 }];
  const r = core.nuCreateResolver({ search: async (q) => P25[q] || [], portions: async () => [] });

  // Same food + same phrase → the correction wins.
  const corrected = await r.resolveItem(Object.assign(item({ query: 'almonds', unit: 'handful' }),
    { portionCorrections: corr }));
  assert.strictEqual(corrected.grams, 35);
  assert.strictEqual(corrected.portion.provenance.correctionApplied, true);
  assert.strictEqual(corrected.portion.provenance.defaultAmount, 28);

  // Different food (spinach) → correction does NOT leak; default estimate stands.
  const other = await r.resolveItem(Object.assign(item({ query: 'spinach', unit: 'handful' }),
    { portionCorrections: corr }));
  assert.strictEqual(other.grams, 12);
  assert.ok(!other.portion.provenance.correctionApplied);

  // Different vague class (bowl) for the same food → correction does NOT apply.
  const bowl = await r.resolveItem(Object.assign(item({ query: 'almonds', unit: 'bowl' }),
    { portionCorrections: corr }));
  assert.ok(!bowl.portion || !bowl.portion.provenance.correctionApplied);
});

test('4.2.5 hardening: dropped quantifiers (unit=null) are recovered from raw text → clarify', async () => {
  // The AI parser drops "some"/"a little"/"a bit of" (arrives unit=null but the
  // phrase survives in `text`). The resolver must recover it and ASK, not silently
  // log the food's default serving. Parsed shapes mirror the REAL production parser.
  const r = p25resolver();
  const phrases = [
    { text: 'some rice', query: 'rice' },
    { text: 'a little rice', query: 'rice' },
    { text: 'a bit of rice', query: 'rice' },
    { text: 'some peanut butter', query: 'peanut butter' },
    { text: 'a little milk', query: 'milk' },
    { text: 'some chicken', query: 'chicken' },
    { text: 'some almonds', query: 'almonds' },
  ];
  for (const p of phrases) {
    const it = await r.resolveItem(item({ text: p.text, query: p.query, unit: null }));
    assert.strictEqual(it.needsClarification, true, `"${p.text}" must clarify, not silently default`);
    assert.strictEqual(it.clarification.type, 'portion', `"${p.text}" → portion clarification`);
    assert.deepStrictEqual(it.clarification.options.map((o) => o.label),
      ['Small amount', 'Medium amount', 'Large amount'], `"${p.text}" clean labels`);
    assert.ok(!it.needsChoice && !it.unmatched);
  }
});

test('4.2.5 hardening: answering a recovered clarification resolves, estimated, no loop', async () => {
  const r = p25resolver();
  const it = await r.resolveItem(item({ text: 'some rice', query: 'rice', unit: null }));
  assert.strictEqual(it.needsClarification, true);
  const ans = await r.resolveClarification(it, 1);           // "Medium amount"
  assert.ok(!ans.needsClarification, 'must not re-ask the same portion dimension (loop guard)');
  assert.strictEqual(ans.estimated, true, 'resolved amount is honestly flagged estimated');
  assert.ok(/~/.test(ans.serving_description), 'serving text carries the ~ estimate marker');
  assert.strictEqual(ans.food.usda_fdc_id, 168878);
});

test('4.2.5 hardening: explicit quantity ALWAYS wins over a recovered quantifier', async () => {
  const r = p25resolver();
  // explicit grams present → exact wins, no clarify, no estimate
  const g = await r.resolveItem(item({ text: 'some rice, 150 g', query: 'rice', quantity: 150, unit: 'g', grams: 150 }));
  assert.strictEqual(g.grams, 150);
  assert.ok(!g.needsClarification && !g.estimated, 'explicit weight is exact, not an estimate');

  // explicit unit present ("tbsp") → rawText "a little" is NEVER consulted
  const tbsp = await r.resolveItem(item({ text: 'a little milk', query: 'milk', quantity: 1, unit: 'tbsp' }));
  assert.ok(!tbsp.needsClarification, 'an explicit unit is honored, quantifier ignored');
  assert.strictEqual(tbsp.serving_description, '1 tbsp (15 ml)');
  assert.ok(!tbsp.estimated);
});

test('4.2.5 hardening: a food NAMED with a quantifier word is not misread', async () => {
  const r = p25resolver();
  // query "little gem lettuce" contains "little" — query-filtering must prevent a
  // false portion clarification; it resolves as a normal food.
  const it = await r.resolveItem(item({ text: 'little gem lettuce', query: 'little gem lettuce', unit: null }));
  assert.ok(!it.needsClarification, 'must NOT trigger a portion clarification from a food name');
  assert.strictEqual(it.food.usda_fdc_id, 169247);

  // a plain bare-count food is unaffected
  const eggs = await r.resolveItem(item({ text: '2 eggs', query: 'almonds', quantity: 2, unit: null }));
  assert.ok(!eggs.needsClarification);
});

test('correction memory (4.2.4): resolver performs NO reranking — trusts source order', async () => {
  // Server-authoritative design: rankFoodCandidates (inside /api/usda-search) is
  // the ONLY ranking authority; correction memory enters there via options.signals.
  // The resolver must keep trusting the ordered candidate contract (foods[0] /
  // foods.slice) and must have NO memory input of its own.
  const core = require('./food-core.js');
  // nuCreateResolver takes exactly the source adapter — no memory/rerank hook.
  assert.strictEqual(core.nuCreateResolver.length, 1);

  // Whatever order the source returns is exactly what the resolver acts on: a
  // chooser preserves source order, and index 0 is always the source's top hit.
  const ORDER = [QUEST_CC, QUEST_CNC, BAREBELLS];
  const r = core.nuCreateResolver({ search: async () => ORDER, portions: async () => [] });
  const bar = await r.resolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(bar.needsChoice, true);
  assert.strictEqual(bar.choices[0].raw.fdcId, QUEST_CC.fdcId, 'chooser top = source foods[0], never reordered');
  // Reverse the source order → the resolver's top follows it, proving it does not
  // impose any ranking (correction or otherwise) of its own.
  const r2 = core.nuCreateResolver({ search: async () => ORDER.slice().reverse(), portions: async () => [] });
  const bar2 = await r2.resolveItem(item({ query: 'protein bar' }));
  assert.strictEqual(bar2.choices[0].raw.fdcId, BAREBELLS.fdcId, 'resolver mirrors source order exactly');
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

/* ── Phase 4.2.6: Meal-Level Reasoning through the resolver ──────────────────
 * require() the shared cores directly (no vm/browser globals) and drive a fake
 * adapter that reranks its pool with the meal signal EXACTLY as the server does
 * (client sends the per-item projection → /api/usda-search ranks with it → the
 * resolver consumes the order). Proves: meal-assisted provenance, confidence
 * meal evidence, the dormant-by-default gate, and single-food/no-context parity. */
{
  const core26 = require('./food-core.js');
  const meal26 = require('./food-meal.js');
  const ranking26 = require('./food-ranking.js');

  // Adapter that mirrors the server: when a meal projection rides along, rank the
  // pool through the shared ranker + meal signal; otherwise plain ranking.
  function mealAdapter(pools) {
    return {
      search: async (q, ctx) => {
        const pool = (pools[q] || []).map((x) => Object.assign({}, x));
        const signals = [];
        if (ctx && ctx.mealContext) signals.push(meal26.nuMealSignal(ctx.mealContext));
        return ranking26.rankFoodCandidates(q, pool, signals.length ? { signals } : undefined).foods;
      },
      portions: async () => [],
    };
  }

  const POOLS = {
    cola: [
      { fdcId: 501, description: 'Cola cake', brand: 'A', dataType: 'Branded',
        foodCategory: 'Sweets', nutrients: { kcal: 350, protein: 3, carbs: 60, fat: 12 } },
      { fdcId: 502, description: 'Cola soft drink', brand: 'B', dataType: 'Branded',
        foodCategory: 'Beverages', nutrients: { kcal: 41, protein: 0, carbs: 11, fat: 0 } },
    ],
    chicken: [
      { fdcId: 511, description: 'Chicken, breast, cooked, roasted', dataType: 'SR Legacy',
        foodCategory: 'Poultry Products', nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } },
    ],
    'green beans': [
      { fdcId: 521, description: 'Beans, snap, green, cooked, boiled, drained', dataType: 'SR Legacy',
        foodCategory: 'Vegetables and Vegetable Products', nutrients: { kcal: 35, protein: 1.9, carbs: 7.9, fat: 0.3 } },
    ],
  };

  function item26(o) {
    return Object.assign({ text: '', query: '', brand: null, quantity: 1, unit: null, grams: null }, o);
  }

  test('4.2.6: meal context reranks a chooser so the beverage leads', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    const ctx = meal26.nuBuildMealContext('burger fries and coke',
      [{ query: 'burger' }, { query: 'fries' }, { query: 'cola' }]);
    const proj = meal26.nuMealItemProjection(ctx, 2);   // coke → beverage projection
    assert.ok(proj && proj.beverage);
    // Two branded cola candidates with no brand named stay a chooser (ask, never
    // guess a brand) — but the meal beverage cue orders the real drink first.
    const withMeal = await r.resolveItem(item26({ query: 'cola', mealContext: proj, mealIndex: 2 }));
    const without = await r.resolveItem(item26({ query: 'cola' }));
    assert.strictEqual(withMeal.needsChoice, true);
    assert.strictEqual(withMeal.choices[0].raw.fdcId, 502, 'meal cue floats the drink to the top of the chooser');
    assert.notStrictEqual(without.choices[0].raw.fdcId, 502, 'without the meal cue the solid led');
  });

  test('4.2.6: cooked-meal expectation resolves a commodity + records provenance', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    const ctx = meal26.nuBuildMealContext('steak mashed potatoes and green beans',
      [{ query: 'steak' }, { query: 'mashed potatoes' }, { query: 'green beans' }]);
    const proj = meal26.nuMealItemProjection(ctx, 2);   // green beans → cookedExpected
    assert.ok(proj && proj.cookedExpected);
    const resolved = await r.resolveItem(item26({ query: 'green beans', mealContext: proj, mealIndex: 2 }));
    assert.strictEqual(resolved.food.usda_fdc_id, 521);
    assert.ok(resolved.meal, 'meal provenance present');
    assert.strictEqual(resolved.meal.role, 'side');
    assert.strictEqual(resolved.meal.support, true, 'cooked candidate matches the cooked meal');
    assert.ok(resolved.meal.reasons.includes('cooked_match'));
  });

  test('4.2.6: single-food resolution is byte-for-byte unchanged (no meal context)', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    const resolved = await r.resolveItem(item26({ query: 'chicken' }));   // no mealContext
    // Auto-resolves exactly as before, and NO meal provenance is attached.
    assert.strictEqual(resolved.food.usda_fdc_id, 511);
    assert.strictEqual(resolved.meal, null, 'no meal provenance without a meal context');
  });

  test('4.2.6: confidence records meal evidence; disposition gated OFF by default', () => {
    const proj = { v: 1, animal: 'chicken', companionCats: ['carb'] };
    const foods = [
      { description: 'Turkey, breast, roasted', foodCategory: 'Poultry Products',
        nutrients: { kcal: 135, protein: 30, carbs: 0, fat: 1 }, score: 1000, group: 'generic' },
      { description: 'Chicken, breast, roasted', foodCategory: 'Poultry Products',
        nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, score: 940, group: 'generic' },
    ];
    // Default policy (mealContext OFF): meal evidence is recorded but the
    // disposition is unchanged from the no-meal baseline.
    const baseline = core26.nuAssessConfidence({ query: 'chicken' }, foods);
    const withMeal = core26.nuAssessConfidence({ query: 'chicken', mealContext: proj }, foods);
    assert.strictEqual(withMeal.disposition, baseline.disposition, 'gate off → no disposition change');
    assert.ok(withMeal.meal, 'meal evidence recorded even when the gate is off');
    assert.strictEqual(withMeal.meal.conflict, true, 'top turkey conflicts with the chicken item');
  });

  test('4.2.6: gated ON, a meal conflict on the top pick can escalate to a chooser', () => {
    const proj = { v: 1, animal: 'chicken', companionCats: ['carb'] };
    const foods = [
      { description: 'Turkey, breast, roasted', foodCategory: 'Poultry Products',
        nutrients: { kcal: 135, protein: 30, carbs: 0, fat: 1 }, score: 1000, group: 'generic' },
      { description: 'Chicken, breast, roasted', foodCategory: 'Poultry Products',
        nutrients: { kcal: 400, protein: 31, carbs: 0, fat: 20 }, score: 940, group: 'generic' },
    ];
    const off = core26.nuAssessConfidence({ query: 'chicken', mealContext: proj }, foods);
    const on = core26.nuAssessConfidence({ query: 'chicken', mealContext: proj }, foods, { mealContext: true });
    assert.strictEqual(off.disposition, 'auto_resolve', 'default: turkey auto-resolves (parity)');
    assert.strictEqual(on.disposition, 'choose_candidate', 'gated on: conflict escalates to a chooser');
  });

  test('4.2.6: a malformed meal context degrades safely to normal resolution', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    // An unknown-version projection is ignored by the signal and provenance alike.
    const resolved = await r.resolveItem(item26({ query: 'chicken', mealContext: { v: 99 }, mealIndex: 0 }));
    assert.strictEqual(resolved.food.usda_fdc_id, 511);
    assert.strictEqual(resolved.meal, null, 'invalid projection → no provenance, no effect');
  });

  /* ── integration with the other intelligence layers (requirement 3) ─────── */

  const memory26 = require('./food-memory.js');

  test('4.2.6 × 4.2.4: correction memory still targets the right item inside a meal', async () => {
    // The user previously corrected "cola" → the drink (fdcId 502). Inside a meal,
    // BOTH the correction and the beverage cue apply through the shared signals
    // seam; the corrected drink leads the chooser (correction is not lost).
    const proj = { v: 1, beverage: true, companionCats: ['carb'] };
    const pool = POOLS.cola;
    const corr = memory26.nmCorrectionSignal([memory26.nmBuildCorrectionEvent({
      request: { query: 'cola' }, choices: [{ raw: pool[0] }, { raw: pool[1] }], chosenIndex: 1,
    })], { query: 'cola' });
    const src = {
      search: async () => ranking26.rankFoodCandidates('cola', POOLS.cola.map((x) => Object.assign({}, x)),
        { signals: [corr, meal26.nuMealSignal(proj)] }).foods,
      portions: async () => [],
    };
    const out = await core26.nuCreateResolver(src).resolveItem(item26({ query: 'cola', mealContext: proj, mealIndex: 2 }));
    const topFdc = out.needsChoice ? out.choices[0].raw.fdcId : out.food.usda_fdc_id;
    assert.strictEqual(topFdc, 502, 'the corrected drink leads even with meal context applied');
  });

  test('4.2.6 × 4.2.5: a vague portion inside a meal stays estimated + carries provenance', async () => {
    // P25 fixtures + a meal projection: the vague "handful" is still estimated
    // (portion intelligence intact) AND meal provenance is recorded.
    const r = core26.nuCreateResolver({ search: async (q) => P25[q] || [], portions: async () => [] });
    const proj = { v: 1, cookedExpected: false, companionCats: ['carb'], role: 'side' };
    const almond = await r.resolveItem(item({ query: 'almonds', unit: 'handful', mealContext: proj, mealIndex: 1 }));
    assert.strictEqual(almond.estimated, true, 'vague portion still estimated within a meal');
    assert.strictEqual(almond.grams, 28, 'estimate preserved');
    assert.ok(almond.meal, 'meal provenance present alongside the estimate');
  });

  test('4.2.6: one unresolved item never blocks the others (independent resolution)', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    const ctx = meal26.nuBuildMealContext('chicken and zzz',
      [{ query: 'chicken' }, { query: 'zzz' }]);
    const results = await Promise.all([
      r.resolveItem(item26({ query: 'chicken', mealContext: meal26.nuMealItemProjection(ctx, 0), mealIndex: 0 })),
      r.resolveItem(item26({ query: 'zzz', mealContext: meal26.nuMealItemProjection(ctx, 1), mealIndex: 1 })),
    ]);
    assert.strictEqual(results[0].food.usda_fdc_id, 511, 'good item resolves');
    assert.strictEqual(results[1].unmatched, true, 'missing item is unmatched, independently');
  });

  test('4.2.6: separate foods stay separate — one resolved item per food, no merge', async () => {
    const r = core26.nuCreateResolver(mealAdapter(POOLS));
    const items = [{ text: 'chicken', query: 'chicken', brand: null, quantity: 1, unit: null, grams: null },
                   { text: 'green beans', query: 'green beans', brand: null, quantity: 1, unit: null, grams: null }];
    const ctx = meal26.nuBuildMealContext('chicken and green beans', items);
    const out = await Promise.all(items.map((it, i) =>
      r.resolveItem(Object.assign({}, it, { mealContext: meal26.nuMealItemProjection(ctx, i), mealIndex: i }))));
    assert.strictEqual(out.length, 2, 'two foods in → two resolved items out (never merged)');
    assert.strictEqual(out[0].food.usda_fdc_id, 511);
    assert.strictEqual(out[1].food.usda_fdc_id, 521);
  });

  test('4.2.6: a 1-item mixed dish is never split (context inactive)', () => {
    // "chicken caesar salad" is one parsed item → nuBuildMealContext is inert, so
    // there is no projection and nothing that could split it.
    const ctx = meal26.nuBuildMealContext('chicken caesar salad', [{ query: 'chicken caesar salad' }]);
    assert.strictEqual(ctx.active, false);
    assert.strictEqual(meal26.nuMealItemProjection(ctx, 0), null);
  });
}
