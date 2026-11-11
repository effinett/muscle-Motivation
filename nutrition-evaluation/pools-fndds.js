// Roadmap 5.4.11 — composed-dish pools (USDA FNDDS survey foods).
//
// Captured from the LIVE USDA FoodData Central API on 2026-11-11 (real fdcIds,
// descriptions, categories and per-100 g values as /api/usda-search trims them):
// the top Foundation/SR Legacy and Branded rows the pre-FNDDS search returned,
// plus the FNDDS rows the new survey fetch adds. They pin the behavior that
// matters: an FNDDS DISH outranks the weak SR/branded matches that used to lead
// ("caesar salad" → dressing, "taco" → a Taco Bell burrito, "sushi" → sushi rice),
// while an FNDDS SINGLE FOOD ("Chicken breast, rotisserie") never displaces the
// Foundation/SR canonical record. Keys are `pfn-*` so nothing is shadowed.

'use strict';

function row(fdcId, description, dataType, foodCategory, n, extra) {
  return Object.assign({
    fdcId, description, dataType, foodCategory, brand: '',
    group: dataType === 'Branded' ? 'branded' : 'generic',
    servingSize: null, servingSizeUnit: '', householdServing: '',
    nutrients: { kcal: n[0], protein: n[1], carbs: n[2], fat: n[3], fiber: n[4], sugar: n[5] },
  }, extra || {});
}
const SR = (id, d, c, n) => row(id, d, 'SR Legacy', c, n);
const FD = (id, d, c, n) => row(id, d, 'Foundation', c, n);
const SV = (id, d, c, n) => row(id, d, 'Survey (FNDDS)', c, n);
const BR = (id, d, brand, c, n, size, unit, hh) => row(id, d, 'Branded', c, n,
  { brand, servingSize: size, servingSizeUnit: unit, householdServing: hh });

const CAESAR = [
  SR(171045, 'Salad dressing, caesar, fat-free', 'Fats and Oils', [131, 1.47, 30.7, 0.23, 0.2, 8.82]),
  SR(169877, 'Salad dressing, caesar, low calorie', 'Fats and Oils', [110, 0.3, 18.6, 4.4, 0.1, 16.3]),
  SR(169055, 'Salad dressing, caesar dressing, regular', 'Fats and Oils', [542, 2.17, 3.3, 57.8, 0.5, 2.81]),
  SR(173312, "McDONALD'S, Bacon Ranch Salad with Grilled Chicken", 'Fast Foods', [81, 10.3, 3.64, 3.14, 1, 1.73]),
  BR(1946091, 'CAESAR SALAD WITH GRILLED CHICKEN BREAST', 'Gilbert Foods LLC.', 'Pickles, Olives, Peppers & Relishes', [155, 8.71, 5.3, 11, 1.1, 1.14], 264, 'g', '1 PACKAGE'),
  BR(2096004, 'CAESAR SALAD', 'WHOLE FOODS MARKET', 'Pickles, Olives, Peppers & Relishes', [189, 5.91, 7.48, 15.8, 2, 1.57], 254, 'g', '1 SALAD'),
  SV(2709591, 'Caesar salad, with romaine, no dressing', 'Lettuce and lettuce salads', [77, 4, 7.49, 3.41, 1.8, 1.23]),
  SV(2706818, 'Chicken or turkey caesar garden salad, chicken and/or turkey, lettuce, tomato, cheese, no dressing', 'Poultry mixed dishes', [63, 8.52, 2.99, 1.94, 1, 0.99]),
];
const TACO = [
  SR(170734, 'TACO BELL, Bean Burrito', 'Fast Foods', [209, 7.35, 31.2, 6.05, 4.2, 1.73]),
  SR(170733, 'TACO BELL, Soft Taco with steak', 'Fast Foods', [225, 11.8, 17.2, 12.1, 1.6, 0]),
  SR(170735, 'TACO BELL, BURRITO SUPREME with beef', 'Fast Foods', [183, 7.03, 23.4, 6.8, 3.7, 2.1]),
  BR(2642400, 'TACO SHELLS', 'GREAT VALUE', 'Mexican Dinner Mixes', [469, 6.25, 71.9, 25, 6.2, 0], 32, 'GRM', '3 shells'),
  BR(2159152, 'TACO SEASONING, TACO', 'GOOD & GATHER', 'Seasoning Mixes, Salts, Marinades & Tenderizers', [250, 0, 66.7, 0, 0, 0], 6, 'g', '1 Tbsp'),
  SV(2708514, 'Taco, NFS', 'Burritos and tacos', [246, 15.31, 15.62, 13.56, 2.2, 0.33]),
  SV(2709740, 'Taco sauce', 'Tomato-based condiments', [11, 1.16, 0.72, 0.68, 0.5, 0.12]),
  SV(2708529, 'Taco, fish', 'Burritos and tacos', [275, 11.62, 22.99, 15.29, 2.5, 0.43]),
  SV(2707827, 'Taco shell, flour', 'Tortillas', [511, 8.83, 53.2, 29.07, 3.8, 4]),
  SV(2708533, 'Taco, cheese only', 'Burritos and tacos', [275, 12.19, 27.75, 13.45, 3.8, 0.86]),
];
const CHICKEN_BURRITO = [
  SR(171116, 'Chicken, ground, raw', 'Poultry Products', [143, 17.4, 0.04, 8.1, 0, 0]),
  FD(2514746, 'Chicken, ground, with additives, raw', 'Poultry Products', [138, 17.9, 0, 7.16, 0, 0]),
  FD(2759004, 'Lunchmeat, chicken breast, sliced', 'Sausages and Luncheon Meats', [100, 16.4, 3.1, 2.46, 0, 1.14]),
  SR(170334, 'TACO BELL, BURRITO SUPREME with chicken', 'Fast Foods', [179, 9.84, 20.5, 6.42, 2.4, 0]),
  BR(2404908, 'CHICKEN VERDE BURRITO, CHICKEN', 'WHOLE FOODS MARKET', 'Prepared Wraps and Burittos', [179, 8.57, 24.3, 5, 2.1, 1.43], 140, 'g', '5 ONZ'),
  SV(2708543, 'Burrito, chicken, cheese', 'Burritos and tacos', [244, 13.74, 28.33, 8.06, 2, 2.16]),
  SV(2708560, 'Burrito bowl, chicken', 'Other Mexican mixed dishes', [161, 21.04, 0.27, 8.11, 0, 0.09]),
  SV(2708545, 'Burrito, chicken, with beans, cheese', 'Burritos and tacos', [203, 11.45, 23.87, 6.71, 2.5, 1.68]),
];
const CHICKEN_BREAST = [
  FD(2646170, 'Chicken, breast, boneless, skinless, raw', 'Poultry Products', [112, 22.5, 0, 1.93, 0, 0]),
  FD(2727569, 'Chicken, breast, meat and skin, raw', 'Poultry Products', [133, 21.4, 0, 4.78, 0, 0]),
  SR(174608, 'Chicken breast, roll, oven-roasted', 'Sausages and Luncheon Meats', [134, 14.6, 1.79, 7.65, 0, 0.43]),
  BR(2125496, 'CHICKEN BREAST TENDERLOINS', 'TYSON', 'Frozen Poultry, Chicken & Turkey', [89, 19.6, 0, 0.45, 0, 0], 112, 'g', '4 ONZ'),
  SV(2705964, 'Chicken breast, rotisserie, skin not eaten', 'Chicken, whole pieces', [144, 28.04, 0, 3.57, 0, 0]),
  SV(2705963, 'Chicken breast, rotisserie, skin eaten', 'Chicken, whole pieces', [175, 26.37, 0.09, 7.67, 0, 0.09]),
  SV(2705971, 'Chicken breast, sauteed, skin eaten', 'Chicken, whole pieces', [206, 25.72, 0, 10.62, 0, 0]),
  SV(2705965, 'Chicken breast, stewed, skin eaten', 'Chicken, whole pieces', [181, 24.7, 0, 8.28, 0, 0]),
];
const PANCAKES = [
  SR(174086, 'Pancakes, plain, reduced fat', 'Baked Products', [269, 5.71, 57.3, 1.9, 1, 8.57]),
  SR(175009, 'Pancakes, plain, prepared from recipe', 'Baked Products', [227, 6.4, 28.3, 9.7, 0, 0]),
  SR(172773, 'Pancakes, blueberry, prepared from recipe', 'Baked Products', [222, 6.1, 29, 9.2, 0, 0]),
  BR(2158651, 'BUTTERMILK PANCAKES, BUTTERMILK', '365 WHOLE FOODS MARKET', 'Frozen Pancakes, Waffles, French Toast & Crepes', [248, 5.98, 40.2, 6.84, 0.9, 6.84], 117, 'g', '3 pancakes'),
  BR(373609, 'POTATO PANCAKES', "TRADER JOE'S", 'French Fries, Potatoes & Onion Rings', [200, 5.33, 29.3, 6.67, 2.7, 5.33], 75, 'g', '2 PANCAKES'),
  SV(2708294, 'Pancakes, NFS', 'Pancakes, waffles, French toast', [282, 7.41, 35.32, 12.07, 2.1, 7.05]),
  SV(2708343, 'Chinese pancake', 'Pancakes, waffles, French toast', [207, 4.05, 45.38, 0.38, 0.7, 0.07]),
  SV(2710273, 'Pancake syrup', 'Jams, syrups, toppings', [265, 0, 69.6, 0.1, 0, 42]),
  SV(2708306, 'Pancakes, fruit', 'Pancakes, waffles, French toast', [232, 5.86, 30.63, 9.54, 2.4, 7.7]),
];
const SUSHI = [
  BR(2389292, 'SHORT GRAIN WHITE SUSHI RICE', '365 WHOLE FOODS MARKET', 'Rice', [356, 6.67, 80, 0, 0, 0], 45, 'g', '0.25 cup dry'),
  BR(2013106, 'SUSHI CHEF, PREMIUM SUSHI RICE', 'SUSHI CHEF', 'Rice', [340, 5.66, 79.2, 0, 0, 0], 53, 'g', '0.25 cup'),
  SV(2708959, 'Sushi, NFS', 'Egg rolls, dumplings, sushi', [94, 2.92, 18.39, 0.67, 1, 2.13]),
  SV(2708972, 'Sushi, topped with egg', 'Egg rolls, dumplings, sushi', [119, 7.32, 10.25, 5.23, 0.4, 0.69]),
  SV(2708961, 'Sushi roll, California', 'Egg rolls, dumplings, sushi', [94, 2.92, 18.39, 0.67, 1, 2.13]),
];

const SEARCHES_FNDDS = {
  'pfn-caesar-salad': CAESAR, 'pfn-taco': TACO, 'pfn-chicken-burrito': CHICKEN_BURRITO,
  'pfn-chicken-breast': CHICKEN_BREAST, 'pfn-pancakes': PANCAKES, 'pfn-sushi': SUSHI,
};

// Portions for the FNDDS leads as live /api/usda-food returned them (2026-11-11),
// so a resolved dish logs a real household serving; other rows get their label
// serving or 100 g (same convention as pools-10b.js).
const LIVE_PORTIONS = {
  2708514: [{ label: '1 large', gramWeight: 160, amount: 1 }, { label: '1 cup', gramWeight: 120, amount: 1 }],
  2709591: [{ label: '1 cup', gramWeight: 79, amount: 1 }],
  2708294: [{ label: '1 medium pancake', gramWeight: 50, amount: 1 }, { label: '1 large pancake', gramWeight: 90, amount: 1 }],
  2708543: [{ label: '1 cup', gramWeight: 120, amount: 1 }, { label: '1 large', gramWeight: 330, amount: 1 }],
  2708959: [{ label: '1 piece', gramWeight: 30, amount: 1 }, { label: '1 cup', gramWeight: 150, amount: 1 }],
};
const PORTIONS_FNDDS = {};
Object.keys(SEARCHES_FNDDS).forEach((k) => {
  SEARCHES_FNDDS[k].forEach((f) => {
    PORTIONS_FNDDS[f.fdcId] = LIVE_PORTIONS[f.fdcId] ||
      [{ label: f.householdServing || '1 serving', gramWeight: f.servingSize || 100, amount: 1 }];
  });
});

module.exports = { SEARCHES_FNDDS, PORTIONS_FNDDS };
