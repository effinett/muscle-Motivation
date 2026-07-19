// Canned USDA pools for the FIXTURE tier of the resolve benchmark
// (benchmarks/run-resolve.js). Deterministic, no network, no keys.
//
// Mirrors the payload shapes of nutrition-resolve.test.js — kept as an
// independent copy ON PURPOSE: the regression suite's fixtures must never
// change to serve the benchmark, and the benchmark corpus grows freely
// without touching the regression file. Foods use the trimmed Candidate
// shape /api/usda-search returns (nutrients per 100 g/ml).

'use strict';

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

const FIXTURE_SEARCHES = {
  egg: [EGG], toast: [BREAD], 'chicken breast': [CHICKEN], milk: [MILK], zzz: [],
  almonds: [ALMONDS],
  'protein bar': [QUEST_CC, QUEST_CNC, BAREBELLS],
  'quest bar': [QUEST_CC, QUEST_CNC],
  'jasmine rice': [JR1, JR2, JR3, JR4],
  'jasmine rice mixed': [JR1, JR_COOKED, JR2, JR3],
  'double cheeseburger': [FF_DOUBLE, MCD_DOUBLE],
  oats: [OATS],
  'rolled oats': [ROLLED_NO_CUP, OATS],
  'peanut butter': [PB_SR],
  'maple syrup': [SY1, SY2, SY3],
  'greek yogurt nonfat': [GREEK_NONFAT],
  'greek yogurt whole milk': [GREEK_WHOLE],
  'plain yogurt': [YOG_PLAIN_F, YOG_PLAIN_SR],
  hummus: [HUMMUS],
};

const FIXTURE_PORTIONS = {
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

module.exports = { FIXTURE_SEARCHES, FIXTURE_PORTIONS };
