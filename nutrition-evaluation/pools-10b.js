// Phase 4.2.10b — realistic multi-candidate pools for the confidence/ambiguity
// EVIDENCE checkpoint. These model plausible USDA/OpenFoodFacts result sets
// (many candidates, materially different macros) so the eval can measure whether
// bare beverage/generic terms auto-resolve or clarify with GENUINE ambiguity —
// not the thin/tied single-candidate fixtures the 4.2.9 corpus carried.
//
// EVIDENCE ONLY. No production logic is touched. Pools are keyed `p10b-*` so they
// never shadow the frozen benchmark corpus; every 10b case points at one via the
// case-level `pool` field. Candidate shapes are the exact trimmed Candidate the
// ranker consumes (description/brand/group/dataType/foodCategory/nutrients/serving).

'use strict';

let _id = 8810000;
function g(description, cat, kcal, protein, carbs, fat, sugar, extra) {
  return Object.assign({
    fdcId: ++_id, description, brand: '', group: 'generic', dataType: 'SR Legacy',
    foodCategory: cat, nutrients: { kcal, protein, carbs, fat, fiber: 0, sugar: sugar || 0 },
  }, extra || {});
}
function b(description, brand, cat, kcal, protein, carbs, fat, sugar, extra) {
  return Object.assign(g(description, cat, kcal, protein, carbs, fat, sugar, extra),
    { brand, group: 'branded', dataType: 'Branded' }, extra || {});
}
const cup = (ml) => ({ servingSize: ml, servingSizeUnit: 'MLT', householdServing: '1 cup' });
const svg = (gr, hh) => ({ servingSize: gr, servingSizeUnit: 'g', householdServing: hh });

/* ── Coffee family ─────────────────────────────────────────────────────────── */
const COFFEE = [
  g('Coffee, brewed, prepared with tap water', 'Beverages', 1, 0.1, 0, 0, 0, cup(237)),
  g('Coffee, instant, prepared', 'Beverages', 4, 0.1, 0.7, 0, 0, cup(237)),
  g('Coffee, brewed, decaffeinated', 'Beverages', 0, 0.1, 0, 0, 0, cup(237)),
  g('Coffee, with milk and sugar', 'Beverages', 56, 3, 7, 2, 6, cup(240)),
  b('STARBUCKS Bottled Frappuccino Coffee Drink', 'Starbucks', 'Beverages', 82, 2.5, 15, 1.2, 14, cup(240)),
  g('Latte, coffee, with whole milk', 'Beverages', 63, 3.3, 5, 3.3, 5, cup(240)),
  g('Coffee cake, cinnamon, with crumb topping', 'Baked Products', 340, 5, 52, 13, 28, svg(63, '1 piece')),
  b('Coffee flavored yogurt, lowfat', 'Chobani', 'Dairy and Egg Products', 95, 5, 15, 1.5, 14, svg(150, '1 container')),
];

/* ── Tea family ────────────────────────────────────────────────────────────── */
const TEA = [
  g('Tea, black, brewed, prepared with tap water', 'Beverages', 1, 0, 0.3, 0, 0, cup(237)),
  g('Tea, green, brewed, prepared', 'Beverages', 1, 0.2, 0, 0, 0, cup(237)),
  g('Tea, iced, unsweetened, brewed', 'Beverages', 1, 0, 0.2, 0, 0, cup(240)),
  g('Tea, iced, sweetened with sugar', 'Beverages', 30, 0, 8, 0, 7, cup(240)),
  g('Tea, with milk', 'Beverages', 28, 1.3, 3, 1.2, 3, cup(240)),
  b('GOLD PEAK Sweetened Iced Tea, bottled', 'Gold Peak', 'Beverages', 33, 0, 8.3, 0, 8, cup(240)),
  g('Chai, spiced tea latte, with milk', 'Beverages', 120, 3.5, 20, 3, 18, cup(240)),
  g('Tea cake, sweet', 'Baked Products', 350, 5, 55, 12, 30, svg(60, '1 piece')),
];

/* ── Soup family ───────────────────────────────────────────────────────────── */
const SOUP = [
  g('Soup, chicken noodle, canned, prepared with water', 'Soups, Sauces, and Gravies', 36, 2, 4.5, 1, 0.5, cup(240)),
  g('Soup, tomato, canned, prepared with water', 'Soups, Sauces, and Gravies', 60, 1.7, 13, 0.6, 8, cup(240)),
  g('Soup, vegetable, canned, prepared with water', 'Soups, Sauces, and Gravies', 40, 1.5, 7, 0.9, 2, cup(240)),
  g('Soup, cream of mushroom, canned, prepared with water', 'Soups, Sauces, and Gravies', 79, 1.8, 7, 5, 1, cup(240)),
  g('Soup, chicken noodle, condensed, undiluted', 'Soups, Sauces, and Gravies', 60, 3, 8, 2, 1, svg(126, '1 can')),
  g('Restaurant, soup, chicken noodle', 'Restaurant Foods', 90, 5, 10, 3, 1, svg(245, '1 bowl')),
];

/* ── Cereal family ─────────────────────────────────────────────────────────── */
const CEREAL = [
  g('Cereals ready-to-eat, plain, unsweetened', 'Breakfast Cereals', 379, 8, 84, 4, 5, svg(30, '1 cup')),
  g('Cereals ready-to-eat, oat, toasted (plain)', 'Breakfast Cereals', 367, 12, 73, 6, 4, svg(28, '1 cup')),
  b('FROSTED FLAKES sweetened corn cereal', 'Kelloggs', 'Breakfast Cereals', 375, 3.3, 91, 0, 37, svg(29, '1 cup')),
  g('Granola, homemade, with oats and honey', 'Breakfast Cereals', 471, 10, 64, 20, 25, svg(45, '1/2 cup')),
  g('Oatmeal, cooked, prepared with water', 'Breakfast Cereals', 71, 2.5, 12, 1.5, 0.5, svg(234, '1 cup')),
  g('Cereal with milk, ready-to-eat with 2% milk', 'Breakfast Cereals', 150, 6, 24, 4, 12, svg(150, '1 cup')),
];

/* ── Protein products ──────────────────────────────────────────────────────── */
const PROTEIN = [
  b('Protein powder, whey, unflavored, dry', 'Optimum Nutrition', 'Sports Nutrition', 400, 80, 8, 6, 4, svg(31, '1 scoop')),
  b('Protein shake, ready-to-drink, chocolate', 'Fairlife', 'Sports Nutrition', 60, 10, 5, 1.5, 3, cup(240)),
  b('Meal replacement shake, bottled', 'Ensure', 'Sports Nutrition', 92, 3.7, 14, 2.6, 8, cup(240)),
  b('Protein bar, chocolate chip cookie dough', 'Quest Nutrition', 'Sports Nutrition', 350, 33, 45, 14, 3, svg(60, '1 bar')),
  g('Yogurt, Greek, plain, nonfat (high protein)', 'Dairy and Egg Products', 59, 10.2, 3.6, 0.4, 3.2, svg(170, '1 container')),
];

/* ── Broad generic-collision pools ─────────────────────────────────────────── */
const APPLE = [
  g('Apples, raw, with skin', 'Fruits and Fruit Juices', 52, 0.3, 14, 0.2, 10, svg(182, '1 medium')),
  g('Apple pie, prepared from recipe', 'Baked Products', 265, 2.4, 37, 12, 16, svg(125, '1 piece')),
  g('Applesauce, canned, unsweetened', 'Fruits and Fruit Juices', 42, 0.2, 11, 0.1, 9, svg(122, '1/2 cup')),
  g('Apple juice, canned or bottled, unsweetened', 'Fruits and Fruit Juices', 46, 0.1, 11, 0.1, 10, cup(240)),
  g('Apples, dried, sulfured, uncooked', 'Fruits and Fruit Juices', 243, 0.9, 65, 0.3, 57, svg(28, '1 oz')),
];
const ORANGE = [
  g('Oranges, raw, all commercial varieties', 'Fruits and Fruit Juices', 47, 0.9, 12, 0.1, 9, svg(131, '1 fruit')),
  g('Orange juice, raw', 'Fruits and Fruit Juices', 45, 0.7, 10, 0.2, 8, cup(248)),
  g('Mandarin oranges, canned in juice', 'Fruits and Fruit Juices', 64, 0.6, 17, 0.1, 15, svg(189, '1 cup')),
  b('Orange chocolate candy', 'Terrys', 'Sweets', 535, 6, 58, 30, 55, svg(20, '1 serving')),
];
const TURKEY = [
  g('Turkey, breast, meat only, roasted', 'Poultry Products', 135, 30, 0, 1, 0, svg(85, '3 oz')),
  g('Turkey, ground, cooked', 'Poultry Products', 203, 27, 0, 10, 0, svg(85, '3 oz')),
  g('Turkey, whole, meat and skin, roasted', 'Poultry Products', 189, 28, 0, 8, 0, svg(85, '3 oz')),
  g('Turkey, deli, sliced, oven roasted', 'Poultry Products', 104, 17, 4, 2.5, 2, svg(56, '2 oz')),
];
const CHICKEN = [
  g('Chicken, broiler, breast, meat only, cooked, roasted', 'Poultry Products', 165, 31, 0, 3.6, 0, svg(85, '3 oz')),
  g('Chicken, broiler, thigh, meat only, cooked', 'Poultry Products', 209, 26, 0, 10.9, 0, svg(85, '3 oz')),
  g('Chicken, whole, meat and skin, roasted', 'Poultry Products', 239, 27, 0, 14, 0, svg(85, '3 oz')),
  g('Chicken, breast, fried, batter', 'Poultry Products', 260, 24, 9, 13, 0, svg(85, '3 oz')),
  b('Chicken nuggets, breaded', 'Tyson', 'Poultry Products', 296, 15, 16, 19, 0, svg(85, '4 pieces')),
];
const RICE = [
  g('Rice, white, long-grain, cooked', 'Cereal Grains and Pasta', 130, 2.7, 28, 0.3, 0.1, svg(158, '1 cup')),
  g('Rice, brown, long-grain, cooked', 'Cereal Grains and Pasta', 123, 2.7, 26, 1, 0.4, svg(195, '1 cup')),
  g('Fried rice, with egg', 'Mixed Dishes', 174, 4, 25, 6, 1, svg(198, '1 cup')),
  g('Rice pudding, prepared', 'Sweets', 130, 3.2, 24, 2, 15, svg(147, '1/2 cup')),
];
const BREAD = [
  g('Bread, white, commercially prepared', 'Baked Products', 266, 8, 49, 3.3, 5, svg(28, '1 slice')),
  g('Bread, whole-wheat, commercially prepared', 'Baked Products', 254, 12, 43, 3.5, 6, svg(28, '1 slice')),
  g('Bread, sourdough', 'Baked Products', 289, 12, 56, 2, 3, svg(59, '1 slice')),
  g('Banana bread, prepared from recipe', 'Baked Products', 326, 4.3, 54, 10, 30, svg(60, '1 slice')),
];
const CHEESE = [
  g('Cheese, cheddar', 'Dairy and Egg Products', 403, 25, 3.4, 33, 0.5, svg(28, '1 oz')),
  g('Cheese, mozzarella, whole milk', 'Dairy and Egg Products', 300, 22, 2.2, 22, 1, svg(28, '1 oz')),
  g('Cheese, cream', 'Dairy and Egg Products', 342, 6, 4.1, 34, 3.2, svg(28, '1 oz')),
  g('Cheese, cottage, creamed, large or small curd', 'Dairy and Egg Products', 98, 11, 3.4, 4.3, 2.7, svg(113, '1/2 cup')),
  b('American cheese, processed slices', 'Kraft', 'Dairy and Egg Products', 371, 20, 8, 30, 5, svg(19, '1 slice')),
];
const SALMON = [
  g('Salmon, Atlantic, wild, raw', 'Finfish and Shellfish Products', 142, 20, 0, 6.3, 0, svg(85, '3 oz')),
  g('Salmon, Atlantic, cooked, dry heat', 'Finfish and Shellfish Products', 206, 22, 0, 12, 0, svg(85, '3 oz')),
  g('Salmon, smoked (lox)', 'Finfish and Shellfish Products', 117, 18, 0, 4.3, 0, svg(85, '3 oz')),
  g('Salmon, pink, canned, drained', 'Finfish and Shellfish Products', 139, 20, 0, 6, 0, svg(85, '3 oz')),
];
const YOGURT = [
  g('Yogurt, plain, nonfat', 'Dairy and Egg Products', 56, 5.7, 7.7, 0.2, 7.7, svg(170, '1 container')),
  g('Yogurt, Greek, plain, nonfat', 'Dairy and Egg Products', 59, 10.2, 3.6, 0.4, 3.2, svg(170, '1 container')),
  g('Yogurt, plain, whole milk', 'Dairy and Egg Products', 61, 3.5, 4.7, 3.3, 4.7, svg(170, '1 container')),
  b('Strawberry fruit yogurt, lowfat', 'Yoplait', 'Dairy and Egg Products', 99, 4, 19, 1, 18, svg(170, '1 container')),
  b('Drinkable yogurt, strawberry', 'Danone', 'Dairy and Egg Products', 71, 3, 13, 1, 12, cup(200)),
];
const SHAKE = [
  b('Protein shake, ready-to-drink, chocolate', 'Fairlife', 'Sports Nutrition', 60, 10, 5, 1.5, 3, cup(240)),
  b('Milkshake, chocolate, fast food', 'McDonalds', 'Sweets', 119, 3, 21, 3, 19, cup(240)),
  b('Meal replacement shake, vanilla', 'Ensure', 'Sports Nutrition', 92, 3.7, 14, 2.6, 8, cup(240)),
];
const BAR = [
  b('Protein bar, chocolate chip cookie dough', 'Quest Nutrition', 'Sports Nutrition', 350, 33, 45, 14, 3, svg(60, '1 bar')),
  g('Granola bar, oats and honey', 'Snacks', 471, 8, 64, 20, 25, svg(28, '1 bar')),
  b('Chocolate candy bar, milk chocolate', 'Hershey', 'Sweets', 535, 7.7, 59, 30, 51, svg(43, '1 bar')),
  b('Energy bar, mixed nuts', 'Clif', 'Sports Nutrition', 400, 10, 66, 11, 30, svg(68, '1 bar')),
];

const SEARCHES_10B = {
  'p10b-coffee': COFFEE, 'p10b-tea': TEA, 'p10b-soup': SOUP, 'p10b-cereal': CEREAL,
  'p10b-protein': PROTEIN, 'p10b-apple': APPLE, 'p10b-orange': ORANGE, 'p10b-turkey': TURKEY,
  'p10b-chicken': CHICKEN, 'p10b-rice': RICE, 'p10b-bread': BREAD, 'p10b-cheese': CHEESE,
  'p10b-salmon': SALMON, 'p10b-yogurt': YOGURT, 'p10b-shake': SHAKE, 'p10b-bar': BAR,
};

// Minimal portions (a usable serving per lead) so resolution never dies on a
// missing portion; not the focus of this checkpoint.
const PORTIONS_10B = {};
Object.keys(SEARCHES_10B).forEach((k) => {
  SEARCHES_10B[k].forEach((f) => {
    const hh = f.householdServing || '1 serving';
    const gr = f.servingSize || 100;
    PORTIONS_10B[f.fdcId] = [{ label: hh, gramWeight: gr, amount: 1 }];
  });
});

module.exports = { SEARCHES_10B, PORTIONS_10B };
