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
  group: 'branded', dataType: 'Branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 317, protein: 35, carbs: 37, fat: 12, fiber: 23, sugar: 2 },
};
const QUEST_CNC = {
  fdcId: 999003, description: 'QUEST COOKIES & CREAM BAR', brand: 'Quest Nutrition',
  group: 'branded', dataType: 'Branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 317, protein: 35, carbs: 38, fat: 13, fiber: 20, sugar: 2 },
};
const BAREBELLS = {
  fdcId: 999004, description: 'BAREBELLS PROTEIN BAR CARAMEL CASHEW', brand: 'Barebells',
  group: 'branded', dataType: 'Branded', servingSize: 55, servingSizeUnit: 'g', householdServing: '1 bar',
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

// Phase 4.2.3 clarification fixtures — same base food separated by ONE dominant,
// material dimension (preparation / form), and an explicit brand mismatch.
const CHK_RAW = { fdcId: 700001, description: 'Chicken breast, raw', brand: 'Kirkland', group: 'branded',
  nutrients: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 } };
const CHK_COOKED = { fdcId: 700002, description: 'Chicken breast, cooked', brand: 'Kirkland', group: 'branded',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } };
const TUNA_WATER = { fdcId: 700030, description: 'Tuna, canned in water', brand: 'StarKist', group: 'branded',
  nutrients: { kcal: 86, protein: 19, carbs: 0, fat: 0.8, fiber: 0, sugar: 0 } };
const TUNA_OIL = { fdcId: 700031, description: 'Tuna, canned in oil', brand: 'StarKist', group: 'branded',
  nutrients: { kcal: 198, protein: 29, carbs: 0, fat: 8, fiber: 0, sugar: 0 } };
const MK_A = { fdcId: 700040, description: 'Whole Milk', brand: 'Horizon', group: 'branded',
  servingSize: 240, servingSizeUnit: 'MLT', nutrients: { kcal: 61, protein: 3.3, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5 } };
const MK_B = { fdcId: 700041, description: 'Skim Milk', brand: 'Horizon', group: 'branded',
  servingSize: 240, servingSizeUnit: 'MLT', nutrients: { kcal: 34, protein: 3.4, carbs: 5, fat: 0.2, fiber: 0, sugar: 5 } };

// ── Correction-memory fixtures (Phase 4.2.4) ────────────────────────────────
// Two distinct Fairlife bars (a chooser: different flavors, not alike) plus a
// Fairlife milk (a DIFFERENT product form) exercise generalization vs the
// product-conflict rejection boundary. Deterministic, ranked live by
// rankFoodCandidates in the runner's `rank` mode.
const FL_BAR_CHOC = { fdcId: 999101, description: 'FAIRLIFE CHOCOLATE PROTEIN BAR', brand: 'Fairlife',
  group: 'branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 320, protein: 20, carbs: 30, fat: 10, fiber: 5, sugar: 3 } };
const FL_BAR_CARAMEL = { fdcId: 999102, description: 'FAIRLIFE CARAMEL PROTEIN BAR', brand: 'Fairlife',
  group: 'branded', servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 330, protein: 21, carbs: 31, fat: 11, fiber: 4, sugar: 4 } };
const FL_MILK = { fdcId: 999103, description: 'FAIRLIFE WHOLE MILK', brand: 'Fairlife',
  group: 'branded', servingSize: 240, servingSizeUnit: 'MLT', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.3, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5 } };
// Cooked chicken breast twin (a chooser vs the raw entry) for the generic
// exact/normalized correction cases on the "chicken breast cooked" query.
const CHK_BREAST_RAW = { fdcId: 999111, description: 'Chicken, breast, meat only, raw', brand: '',
  group: 'generic', foodCategory: 'Poultry Products',
  nutrients: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, fiber: 0, sugar: 0 } };
const CHK_BREAST_COOKED = { fdcId: 999112, description: 'Chicken, breast, meat only, cooked, roasted', brand: '',
  group: 'generic', foodCategory: 'Poultry Products',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } };

/* ── Phase 4.2.5 vague-portion pools ─────────────────────────────────────── */
const SPINACH = { fdcId: 168462, description: 'Spinach, raw', brand: '', group: 'generic',
  foodCategory: 'Vegetables and Vegetable Products',
  nutrients: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4 } };
const BLUEBERRIES = { fdcId: 171711, description: 'Blueberries, raw', brand: '', group: 'generic',
  foodCategory: 'Fruits and Fruit Products',
  nutrients: { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4, sugar: 10 } };
const CHIPS = { fdcId: 170452, description: 'Potato chips, plain, salted', brand: '', group: 'generic',
  foodCategory: 'Snacks',
  nutrients: { kcal: 536, protein: 7, carbs: 53, fat: 34, fiber: 4.8, sugar: 0.6 } };
const SHRED_CHEESE = { fdcId: 328637, description: 'Cheese, cheddar, shredded', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 403, protein: 23, carbs: 3.4, fat: 33, fiber: 0, sugar: 0.5 } };
const OLIVE_OIL = { fdcId: 171413, description: 'Oil, olive, salad or cooking', brand: '', group: 'generic',
  foodCategory: 'Fats and Oils',
  nutrients: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0 } };
const DRESSING = { fdcId: 174837, description: 'Salad dressing, ranch dressing', brand: '', group: 'generic',
  foodCategory: 'Fats and Oils',
  nutrients: { kcal: 430, protein: 1.3, carbs: 6, fat: 45, fiber: 0, sugar: 4 } };
const HOT_SAUCE = { fdcId: 172255, description: 'Sauce, hot chile, sriracha', brand: '', group: 'generic',
  foodCategory: 'Soups, Sauces, and Gravies', is_liquid: true,
  servingSize: 5, servingSizeUnit: 'ml',
  nutrients: { kcal: 93, protein: 1.9, carbs: 19, fat: 0.9, fiber: 2.2, sugar: 15 } };
const SALT = { fdcId: 173468, description: 'Salt, table', brand: '', group: 'generic',
  foodCategory: 'Spices and Herbs',
  nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 } };
const CREAM = { fdcId: 170857, description: 'Cream, heavy whipping', brand: '', group: 'generic',
  is_liquid: true, servingSize: 15, servingSizeUnit: 'ml',
  nutrients: { kcal: 340, protein: 2.8, carbs: 2.8, fat: 36, fiber: 0, sugar: 2.9 } };
const CEREAL = { fdcId: 173733, description: 'Cheerios cereal', brand: 'General Mills', group: 'branded',
  foodCategory: 'Breakfast Cereals',
  nutrients: { kcal: 379, protein: 12, carbs: 74, fat: 7, fiber: 10, sugar: 4 } };
const SOUP = { fdcId: 174473, description: 'Soup, chicken noodle, canned, prepared', brand: '', group: 'generic',
  foodCategory: 'Soups, Sauces, and Gravies', is_liquid: true,
  servingSize: 245, servingSizeUnit: 'ml',
  nutrients: { kcal: 25, protein: 1.3, carbs: 3, fat: 0.8, fiber: 0.3, sugar: 0.4 } };
const RICE_COOKED = { fdcId: 168878, description: 'Rice, white, cooked', brand: '', group: 'generic',
  foodCategory: 'Cereal Grains and Pasta',
  nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1 } };
const PASTA_COOKED = { fdcId: 168927, description: 'Pasta, cooked', brand: '', group: 'generic',
  foodCategory: 'Cereal Grains and Pasta',
  nutrients: { kcal: 158, protein: 5.8, carbs: 31, fat: 0.9, fiber: 1.8, sugar: 0.6 } };
const CHEESE_BLOCK = { fdcId: 173410, description: 'Cheese, cheddar', brand: '', group: 'generic',
  foodCategory: 'Dairy and Egg Products',
  nutrients: { kcal: 403, protein: 23, carbs: 3.4, fat: 33, fiber: 0, sugar: 0.5 } };
const PIZZA = { fdcId: 170077, description: 'Pizza, cheese, regular crust', brand: '', group: 'generic',
  foodCategory: 'Baked Products',
  nutrients: { kcal: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, sugar: 3.6 } };
const PB_CUP = { fdcId: 172470, description: 'Peanut butter, smooth', brand: '', group: 'generic',
  foodCategory: 'Legumes and Legume Products',
  nutrients: { kcal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9 } };
const CHK_PIECE = { fdcId: 171534, description: 'Chicken, broiler, breast, meat only, cooked, roasted',
  brand: '', group: 'generic', foodCategory: 'Poultry Products',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } };

// ── Phase 4.2.6 meal-reasoning fixtures ──────────────────────────────────────
// A beverage vs a solid that share the "cola" name (beverage-consistency), and a
// raw/cooked commodity pair (shared-preparation expectation).
const COLA_CAKE = {
  fdcId: 620001, description: 'Cola cake', brand: 'A', group: 'branded', dataType: 'Branded',
  foodCategory: 'Sweets', nutrients: { kcal: 350, protein: 3, carbs: 60, fat: 12, fiber: 1, sugar: 40 },
};
const COLA_DRINK = {
  fdcId: 620002, description: 'Cola soft drink', brand: 'B', group: 'branded', dataType: 'Branded',
  foodCategory: 'Beverages', nutrients: { kcal: 41, protein: 0, carbs: 11, fat: 0, fiber: 0, sugar: 11 },
};
const GBEANS_RAW = {
  fdcId: 620010, description: 'Beans, snap, green, raw', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Vegetables and Vegetable Products',
  nutrients: { kcal: 31, protein: 1.8, carbs: 7, fat: 0.2, fiber: 2.7, sugar: 3.3 },
};
const GBEANS_COOKED = {
  fdcId: 620011, description: 'Beans, snap, green, cooked', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Vegetables and Vegetable Products',
  nutrients: { kcal: 35, protein: 1.9, carbs: 7.9, fat: 0.3, fiber: 3.2, sugar: 3.3 },
};
// Raw/cooked commodity pairs (shared-preparation expectation cases). Generic
// (SR Legacy) so the ranker treats them as whole foods; nutrients kept close so
// query evidence alone leaves the tie for meal context to break.
// Raw first (the canonical/principal form the ranker leads with for a bare
// commodity query), cooked second. A cooked-meal expectation is what flips the
// order; an explicitly-raw item keeps raw (proving no incorrect spread).
function rawCooked(base, rawId, cookedId, cat, veg) {
  return [
    { fdcId: rawId, description: base + ', raw', group: 'generic', dataType: 'SR Legacy',
      foodCategory: cat, nutrients: veg.raw },
    { fdcId: cookedId, description: base + ', cooked', group: 'generic', dataType: 'SR Legacy',
      foodCategory: cat, nutrients: veg.cooked },
  ];
}
const VEGCAT = 'Vegetables and Vegetable Products';
const BROCCOLI = rawCooked('Broccoli', 620020, 620021, VEGCAT,
  { raw: { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6, sugar: 1.7 },
    cooked: { kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4, fiber: 3.3, sugar: 1.4 } });
const POTATO = rawCooked('Potatoes', 620030, 620031, VEGCAT,
  { raw: { kcal: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, sugar: 0.8 },
    cooked: { kcal: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8, sugar: 0.9 } });
const CARROT = rawCooked('Carrots', 620040, 620041, VEGCAT,
  { raw: { kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8, sugar: 4.7 },
    cooked: { kcal: 35, protein: 0.8, carbs: 8.2, fat: 0.2, fiber: 3, sugar: 3.4 } });
const VEGGIES = rawCooked('Vegetables, mixed', 620050, 620051, VEGCAT,
  { raw: { kcal: 42, protein: 2.2, carbs: 8.7, fat: 0.3, fiber: 3.4, sugar: 3.1 },
    cooked: { kcal: 49, protein: 2.6, carbs: 9.9, fat: 0.3, fiber: 3.9, sugar: 2.8 } });

// Beverage vs solid (beverage-consistency) fixtures beyond the cola pair.
const COFFEE_BREW = {
  fdcId: 620060, description: 'Coffee, brewed', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Beverages', nutrients: { kcal: 1, protein: 0.1, carbs: 0, fat: 0, fiber: 0, sugar: 0 } };
const COFFEE_CAKE = {
  fdcId: 620061, description: 'Coffee cake, cinnamon', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Baked Products', nutrients: { kcal: 340, protein: 5, carbs: 55, fat: 12, fiber: 1, sugar: 25 } };
const OJ = {
  fdcId: 620070, description: 'Orange juice, raw', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Fruits and Fruit Juices', nutrients: { kcal: 45, protein: 0.7, carbs: 10, fat: 0.2, fiber: 0.2, sugar: 8 } };
const ORANGE_RAW = {
  fdcId: 620071, description: 'Oranges, raw', group: 'generic', dataType: 'SR Legacy',
  foodCategory: 'Fruits and Fruit Juices', nutrients: { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, sugar: 9 } };

// Single-candidate helpers (no-harm / separation / mixed-dish / condiment cases).
function one(id, desc, cat, n) {
  return [{ fdcId: id, description: desc, group: 'generic', dataType: 'SR Legacy', foodCategory: cat, nutrients: n }];
}
const BANANA_F = one(620080, 'Bananas, raw', 'Fruits and Fruit Juices', { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12 });
const GREEK_F  = one(620081, 'Yogurt, Greek, plain, nonfat', 'Dairy and Egg Products', { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2 });
const GRANOLA_F = one(620082, 'Granola, oats and honey', 'Breakfast Cereals', { kcal: 471, protein: 10, carbs: 64, fat: 20, fiber: 7, sugar: 24 });
const BERRIES_F = one(620083, 'Blueberries, raw', 'Fruits and Fruit Juices', { kcal: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4, sugar: 10 });
const OATMEAL_F = one(620084, 'Oats, rolled, dry', 'Cereal Grains and Pasta', { kcal: 379, protein: 13, carbs: 68, fat: 6.5, fiber: 10, sugar: 1 });
const AVOCADO_F = one(620085, 'Avocados, raw', 'Fruits and Fruit Juices', { kcal: 160, protein: 2, carbs: 8.5, fat: 15, fiber: 6.7, sugar: 0.7 });
const SALSA_F  = one(620086, 'Salsa, ready-to-serve', 'Soups, Sauces, and Gravies', { kcal: 36, protein: 1.5, carbs: 7, fat: 0.2, fiber: 1.8, sugar: 3.6 });
const MAYO_F   = one(620087, 'Mayonnaise, regular', 'Fats and Oils', { kcal: 680, protein: 1, carbs: 0.6, fat: 75, fiber: 0, sugar: 0.6 });
const KETCHUP_F = one(620088, 'Ketchup, tomato', 'Soups, Sauces, and Gravies', { kcal: 101, protein: 1.2, carbs: 27, fat: 0.1, fiber: 0.3, sugar: 22 });
const FRIES_F  = one(620089, 'Potatoes, french fried', 'Fast Foods', { kcal: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, sugar: 0.3 });
const RANCH_F  = one(620090, 'Salad dressing, ranch', 'Fats and Oils', { kcal: 430, protein: 1.3, carbs: 6, fat: 45, fiber: 0, sugar: 4 });
const SALAD_F  = one(620091, 'Lettuce, cos or romaine, raw', VEGCAT, { kcal: 17, protein: 1.2, carbs: 3.3, fat: 0.3, fiber: 2.1, sugar: 1.2 });
const STEAK_F  = one(620092, 'Beef, steak, cooked, grilled', 'Beef Products', { kcal: 271, protein: 25, carbs: 0, fat: 18, fiber: 0, sugar: 0 });
const TURKEY_F = one(620093, 'Turkey, breast, deli', 'Poultry Products', { kcal: 104, protein: 17, carbs: 4, fat: 1.7, fiber: 0, sugar: 2 });
const CAESAR_F = one(620094, 'Salad, Caesar, with chicken', 'Salads', { kcal: 180, protein: 12, carbs: 6, fat: 12, fiber: 2, sugar: 2 });
const TUNASAND_F = one(620095, 'Sandwich, tuna salad', 'Meals, Entrees, and Side Dishes', { kcal: 250, protein: 15, carbs: 25, fat: 10, fiber: 2, sugar: 3 });
const BURGER_F = one(620096, 'Hamburger, single patty, with bun', 'Fast Foods', { kcal: 254, protein: 12, carbs: 30, fat: 9, fiber: 1, sugar: 5 });

/* ── Phase 4.2.7 ranking-hardening fixtures ──────────────────────────────────
 * Candidate pools for the named production failures (generic-vs-subtype, food
 * family, species, product form, brand asymmetry) + serving-metadata quality.
 * Trimmed Candidate shape; dataType set so the ranker's branded/generic split is
 * faithful. Ranked live by rankFoodCandidates in the runner's `rank` mode. */
const R7_GLUT = { fdcId: 730002, description: 'Rice, white, glutinous, cooked', dataType: 'SR Legacy',
  group: 'generic', foodCategory: 'Cereal Grains and Pasta', servingSize: 174, servingSizeUnit: 'g',
  householdServing: '1 cup', nutrients: { kcal: 97, protein: 2, carbs: 21, fat: 0.2, fiber: 1, sugar: 0 } };
const M7_MAYO = { fdcId: 730010, description: 'Salad dressing, mayonnaise, regular', dataType: 'SR Legacy',
  group: 'generic', foodCategory: 'Fats and Oils', servingSize: 14, servingSizeUnit: 'g',
  householdServing: '1 tbsp', nutrients: { kcal: 680, protein: 1, carbs: 0.6, fat: 75, fiber: 0, sugar: 0.6 } };
const M7_BEAN = { fdcId: 730011, description: 'Beans, flor de mayo, mature seeds, cooked', dataType: 'SR Legacy',
  group: 'generic', foodCategory: 'Legumes and Legume Products', servingSize: 100, servingSizeUnit: 'g',
  householdServing: '1 cup', nutrients: { kcal: 120, protein: 8, carbs: 21, fat: 0.5, fiber: 7, sugar: 0.3 } };
const T7_TURKEY = { fdcId: 730020, description: 'Turkey, breast, meat only, roasted', dataType: 'SR Legacy',
  group: 'generic', foodCategory: 'Poultry Products', servingSize: 85, servingSizeUnit: 'g',
  householdServing: '3 oz', nutrients: { kcal: 135, protein: 30, carbs: 0, fat: 1, fiber: 0, sugar: 0 } };
const G7_MILK = { fdcId: 730040, description: 'Milk, whole, 3.25% milkfat, with added vitamin D',
  dataType: 'SR Legacy', group: 'generic', foodCategory: 'Dairy and Egg Products', is_liquid: true,
  servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 } };
// Serving-quality pair: SAME identity, one WITH a usable liquid serving, one
// WITHOUT. The dedupe keeps the better-scored (usable) twin, so identity is
// unchanged and only the portionable record survives (Part 3 / splash-of-milk).
const G7_MILK_SERV = { fdcId: 730041, description: 'Milk, whole', dataType: 'SR Legacy', group: 'generic',
  foodCategory: 'Dairy and Egg Products', is_liquid: true, servingSize: 244, servingSizeUnit: 'ml',
  householdServing: '1 cup', nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 } };
const G7_MILK_NOSERV = { fdcId: 730042, description: 'Milk, whole', dataType: 'Foundation', group: 'generic',
  foodCategory: 'Dairy and Egg Products', is_liquid: true, servingSize: null, servingSizeUnit: '',
  householdServing: '', nutrients: { kcal: 60, protein: 3.2, carbs: 4.7, fat: 3.2, fiber: 0, sugar: 5 } };
// The common GENERIC milk USDA reports in GRAMS (servingSizeUnit 'g' → is_liquid
// false). A "splash" must still resolve in mL via the liquid milk FAMILY, never the
// default 1-cup serving — the live "a splash of milk" case (Phase 4.2.7).
const G7_MILK_GRAMS = { fdcId: 730043, description: 'Milk, whole, 3.25% milkfat, with added vitamin D',
  dataType: 'SR Legacy', group: 'generic', foodCategory: 'Dairy and Egg Products',
  servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup',
  nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1 } };

const FIXTURE_SEARCHES = {
  'fairlife protein bar': [FL_BAR_CHOC, FL_BAR_CARAMEL, FL_MILK],
  'fairlife caramel protein bar': [FL_BAR_CHOC, FL_BAR_CARAMEL],
  'fairlife whole milk': [FL_MILK, FL_BAR_CHOC, FL_BAR_CARAMEL, G7_MILK],
  'chicken breast cooked': [CHK_BREAST_RAW, CHK_BREAST_COOKED, T7_TURKEY],
  'chicken breast prep': [CHK_RAW, CHK_COOKED],
  'tuna canned': [TUNA_WATER, TUNA_OIL],
  'organic milk': [MK_A, MK_B],
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
  // Phase 4.2.5 vague-portion queries
  spinach: [SPINACH], blueberries: [BLUEBERRIES], chips: [CHIPS],
  'shredded cheese': [SHRED_CHEESE], 'olive oil': [OLIVE_OIL], dressing: [DRESSING],
  'hot sauce': [HOT_SAUCE], salt: [SALT], cream: [CREAM], cereal: [CEREAL],
  soup: [SOUP], rice: [RICE_COOKED, R7_GLUT], pasta: [PASTA_COOKED], cheese: [CHEESE_BLOCK],
  pizza: [PIZZA], 'peanut butter smooth': [PB_CUP], chicken: [CHK_PIECE], bread: [BREAD],
  // Phase 4.2.6 meal-reasoning queries
  cola: [COLA_CAKE, COLA_DRINK], 'green beans': [GBEANS_RAW, GBEANS_COOKED],
  broccoli: BROCCOLI, potatoes: POTATO, carrots: CARROT, vegetables: VEGGIES,
  coffee: [COFFEE_CAKE, COFFEE_BREW], 'orange juice': [ORANGE_RAW, OJ],
  banana: BANANA_F, 'greek yogurt': GREEK_F, granola: GRANOLA_F, berries: BERRIES_F,
  oatmeal: OATMEAL_F, avocado: AVOCADO_F, salsa: SALSA_F, mayo: MAYO_F, ketchup: KETCHUP_F,
  fries: FRIES_F, ranch: RANCH_F, salad: SALAD_F, steak: STEAK_F, turkey: TURKEY_F,
  'caesar salad': CAESAR_F, 'tuna sandwich': TUNASAND_F, burger: BURGER_F,
  // Phase 4.2.7 ranking-hardening queries (ranked via `rank` mode)
  'glutinous rice': [RICE_COOKED, R7_GLUT],
  mayonnaise: [M7_MAYO, M7_BEAN],
  'flor de mayo beans': [M7_BEAN, M7_MAYO],
  'turkey breast cooked': [T7_TURKEY, CHK_BREAST_COOKED],
  'whole milk': [FL_MILK, G7_MILK],
  'plain whole milk': [G7_MILK_NOSERV, G7_MILK_SERV],
  'gram milk': [G7_MILK_GRAMS],
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
  700001: [], 700002: [], 700030: [], 700031: [], 700040: [], 700041: [],
  999101: [], 999102: [], 999103: [], 999111: [], 999112: [],
};

module.exports = { FIXTURE_SEARCHES, FIXTURE_PORTIONS };
