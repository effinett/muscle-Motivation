// Phase 4.2.9 — canned candidate pools for the deterministic nutrition eval.
//
// Reuses the EXISTING benchmark fixtures (benchmarks/fixtures.js) verbatim — the
// same trimmed Candidate / Portion shapes /api/usda-search + /api/usda-food
// return — and layers a small set of ADDITIONAL pools this suite needs (new
// collision families, brand/generic pairs, restaurant items) WITHOUT editing the
// 121-case corpus's fixtures. New keys never shadow existing ones (asserted in
// tests); on a key clash the existing benchmark pool wins, by design.
//
// Keeping the extension here (not in benchmarks/fixtures.js) preserves the rule
// that the frozen 121-case corpus's inputs never change to serve a new suite.

'use strict';

const base = require('../benchmarks/fixtures.js');

/* ── additional foods (ids in private 8.8xxxxx range to avoid collisions) ── */

function food(fdcId, description, extra) {
  return Object.assign({
    fdcId, description, brand: '', group: 'generic',
    nutrients: { kcal: 100, protein: 5, carbs: 10, fat: 3, fiber: 1, sugar: 2 },
  }, extra || {});
}
function branded(fdcId, description, brand, extra) {
  return Object.assign(food(fdcId, description, { group: 'branded', dataType: 'Branded', brand }), extra || {});
}

// Brand-vs-generic: whole milk (Fairlife branded + generic) — dairy family,
// pins 4.2.7 Fairlife-family + weak-serving-metadata behavior via a fresh pool.
const FAIRLIFE_WM = branded(8800101, 'Fairlife Whole Milk, Ultra-Filtered', 'Fairlife', {
  servingSize: 240, servingSizeUnit: 'MLT', householdServing: '1 cup',
  nutrients: { kcal: 60, protein: 5, carbs: 6, fat: 4.5, fiber: 0, sugar: 6 } });
const GENERIC_WM = food(8800102, 'Milk, whole, 3.25% milkfat', {
  foodCategory: 'Dairy and Egg Products', servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 } });

// Greek yogurt brand-vs-generic (a second dairy family used by display/ranking).
const CHOBANI = branded(8800111, 'CHOBANI NONFAT GREEK YOGURT PLAIN', 'Chobani', {
  servingSize: 150, servingSizeUnit: 'g', householdServing: '1 container',
  nutrients: { kcal: 59, protein: 10, carbs: 3.6, fat: 0, fiber: 0, sugar: 3.6 } });
const GENERIC_GY = food(8800112, 'Yogurt, Greek, plain, nonfat', {
  foodCategory: 'Dairy and Egg Products', servingSize: 170, servingSizeUnit: 'g', householdServing: '1 container',
  nutrients: { kcal: 59, protein: 10.2, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2 } });

// Restaurant items (generic USDA "Restaurant, ..." records + a fast-food set).
const REST_PIZZA = food(8800201, 'Restaurant, pizza, cheese, regular crust', {
  foodCategory: 'Restaurant Foods',
  nutrients: { kcal: 268, protein: 11, carbs: 33, fat: 10, fiber: 2, sugar: 4 } });
const REST_FRIES = food(8800202, 'Restaurant, french fries', {
  foodCategory: 'Restaurant Foods',
  nutrients: { kcal: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, sugar: 0.3 } });
const SUB_TURKEY = food(8800203, 'Restaurant, sandwich, turkey, on wheat', {
  foodCategory: 'Restaurant Foods',
  nutrients: { kcal: 210, protein: 14, carbs: 28, fat: 5, fiber: 3, sugar: 4 } });

// Collision: "cream" query token overlaps ice-cream / cream-cheese / heavy-cream.
const HEAVY_CREAM = food(8800301, 'Cream, fluid, heavy whipping', {
  foodCategory: 'Dairy and Egg Products', servingSize: 15, servingSizeUnit: 'g', householdServing: '1 tbsp',
  nutrients: { kcal: 340, protein: 2.8, carbs: 2.8, fat: 36, fiber: 0, sugar: 2.9 } });
const ICE_CREAM = food(8800302, 'Ice cream, vanilla', {
  foodCategory: 'Sweets', nutrients: { kcal: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0.7, sugar: 21 } });
const CREAM_CHEESE = food(8800303, 'Cheese, cream', {
  foodCategory: 'Dairy and Egg Products', nutrients: { kcal: 342, protein: 6, carbs: 4.1, fat: 34, fiber: 0, sugar: 3.2 } });

const EXTRA_SEARCHES = {
  'fairlife whole milk 2': [FAIRLIFE_WM, GENERIC_WM],
  'whole milk generic-pair': [GENERIC_WM, FAIRLIFE_WM],
  'chobani greek yogurt': [CHOBANI, GENERIC_GY],
  'greek yogurt plain nonfat': [GENERIC_GY, CHOBANI],
  'restaurant pizza': [REST_PIZZA],
  'restaurant french fries': [REST_FRIES],
  'turkey sandwich': [SUB_TURKEY],
  'heavy cream query': [HEAVY_CREAM, ICE_CREAM, CREAM_CHEESE],
};

const EXTRA_PORTIONS = {
  8800101: [], 8800102: [{ label: '1 cup', gramWeight: 244, amount: 1 }],
  8800111: [{ label: '1 container', gramWeight: 150, amount: 1 }],
  8800112: [{ label: '1 container', gramWeight: 170, amount: 1 }],
  8800201: [{ label: '1 slice', gramWeight: 107, amount: 1 }],
  8800202: [{ label: '1 serving', gramWeight: 117, amount: 1 }],
  8800203: [{ label: '1 sandwich', gramWeight: 200, amount: 1 }],
  8800301: [{ label: '1 tbsp', gramWeight: 15, amount: 1 }],
  8800302: [{ label: '0.5 cup', gramWeight: 66, amount: 1 }],
  8800303: [{ label: '1 tbsp', gramWeight: 14, amount: 1 }],
};

// Existing benchmark pools win on any accidental key clash (frozen corpus first).
const POOLS = Object.assign({}, EXTRA_SEARCHES, base.FIXTURE_SEARCHES);
const PORTIONS = Object.assign({}, EXTRA_PORTIONS, base.FIXTURE_PORTIONS);

module.exports = { POOLS, PORTIONS, EXTRA_SEARCHES, EXTRA_PORTIONS };
