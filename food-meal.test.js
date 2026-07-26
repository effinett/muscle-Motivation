// food-meal.test.js — Shared Meal-Level Reasoning core (Phase 4.2.6).
// Pure Node tests (no network, no DOM): require() the exact production module,
// plus food-ranking.js for the ablation tests that prove meal signals are
// bounded tie-breakers layered on the real ranker. Run via `npm test`.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const meal = require('./food-meal.js');
const ranking = require('./food-ranking.js');

/* ── nuBuildMealContext ──────────────────────────────────────────────────── */

test('build: a <2-item meal is inert (single-food parity)', () => {
  const c = meal.nuBuildMealContext('chicken', [{ query: 'chicken' }]);
  assert.strictEqual(c.active, false);
  assert.strictEqual(meal.nuMealItemProjection(c, 0), null);
});

test('build: a ≥2-item meal is active with per-item classification', () => {
  const c = meal.nuBuildMealContext('chicken rice and broccoli',
    [{ query: 'chicken' }, { query: 'rice' }, { query: 'broccoli' }]);
  assert.strictEqual(c.active, true);
  assert.strictEqual(c.itemCount, 3);
  assert.strictEqual(c.items[0].animal, 'chicken');
  assert.strictEqual(c.items[1].category, 'carb');
  assert.strictEqual(c.items[2].category, 'veg');
});

test('build: never throws on malformed input → inert context', () => {
  assert.strictEqual(meal.nuBuildMealContext(null, null).active, false);
  assert.strictEqual(meal.nuBuildMealContext(undefined, [{}, {}]).active, true); // 2 empty items ok
});

/* ── projection: companion + beverage + animal ───────────────────────────── */

test('projection: beverage item is flagged, companions collected', () => {
  const c = meal.nuBuildMealContext('burger fries and coke',
    [{ query: 'burger' }, { query: 'fries' }, { query: 'coke' }]);
  const p = meal.nuMealItemProjection(c, 2);
  assert.strictEqual(p.beverage, true);
  assert.deepStrictEqual(p.companionCats, ['carb']);   // fries → carb (burger uncategorized)
});

test('projection: solid companion item is not a beverage', () => {
  const c = meal.nuBuildMealContext('burger fries and coke',
    [{ query: 'burger' }, { query: 'fries' }, { query: 'coke' }]);
  assert.strictEqual(c.items[1].beverage, false);   // fries classified as a solid
  assert.strictEqual(c.items[1].category, 'carb');
});

test('projection: null when an item carries no actionable meal cue', () => {
  // "fries" here has no beverage/animal/cooked cue and its companions (burger,
  // coke) are uncategorized → nothing actionable → no projection, no header.
  const c = meal.nuBuildMealContext('burger fries and coke',
    [{ query: 'burger' }, { query: 'fries' }, { query: 'coke' }]);
  assert.strictEqual(meal.nuMealItemProjection(c, 1), null);
});

test('projection: item names the animal for the consistency check', () => {
  const c = meal.nuBuildMealContext('chicken rice and broccoli',
    [{ query: 'chicken' }, { query: 'rice' }, { query: 'broccoli' }]);
  assert.strictEqual(meal.nuMealItemProjection(c, 0).animal, 'chicken');
});

/* ── shared-preparation grammar (adjustment 8: evidence-based only) ──────── */

test('shared prep: cooked meal spreads a cooked expectation to a bare commodity', () => {
  // "steak, mashed potatoes and green beans": mashed = a cooking prep → the meal
  // is cooked → green beans (a bare raw/cooked commodity) expects cooked.
  const c = meal.nuBuildMealContext('steak mashed potatoes and green beans',
    [{ query: 'steak' }, { query: 'mashed potatoes' }, { query: 'green beans' }]);
  assert.strictEqual(meal.nuMealItemProjection(c, 2).cookedExpected, true);
});

test('shared prep NEGATIVE: explicit raw on the item overrides shared prep', () => {
  // "grilled chicken and raw vegetables": vegetables are explicitly raw → no
  // cooked expectation is spread onto them.
  const c = meal.nuBuildMealContext('grilled chicken and raw vegetables',
    [{ query: 'grilled chicken' }, { query: 'raw vegetables' }]);
  assert.strictEqual(meal.nuMealItemProjection(c, 1).cookedExpected, false);
});

test('shared prep NEGATIVE: toast is not a raw/cooked commodity → unaffected', () => {
  // "fried eggs and toast": toast is not a raw/cooked-ambiguous commodity, so
  // "fried" must not spread onto it.
  const c = meal.nuBuildMealContext('fried eggs and toast',
    [{ query: 'fried eggs' }, { query: 'toast' }]);
  const p = meal.nuMealItemProjection(c, 1);   // toast
  assert.ok(!p || p.cookedExpected === false);
});

test('shared prep: item-local cooking prep is honored', () => {
  const c = meal.nuBuildMealContext('roasted chicken with steamed broccoli',
    [{ query: 'roasted chicken' }, { query: 'steamed broccoli' }]);
  assert.strictEqual(meal.nuMealItemProjection(c, 1).cookedExpected, true);
});

test('shared prep NEGATIVE: a beverage is never given a cooked expectation', () => {
  const c = meal.nuBuildMealContext('coffee with grilled chicken',
    [{ query: 'coffee' }, { query: 'grilled chicken' }]);
  const p = meal.nuMealItemProjection(c, 0);   // coffee
  assert.ok(!p || p.cookedExpected === false);
});

test('shared prep NEGATIVE: a raw meal (no cooking prep) spreads nothing', () => {
  const c = meal.nuBuildMealContext('banana and greek yogurt',
    [{ query: 'banana' }, { query: 'greek yogurt' }]);
  assert.strictEqual(c.mealCooked, false);
});

/* ── validation / transport (adjustment 4 + 12: fail-open, versioned) ────── */

test('validate: unknown projection version is ignored', () => {
  assert.strictEqual(meal.nuParseMealContext(JSON.stringify({ v: 99, beverage: true })), null);
  assert.strictEqual(meal.nuValidateProjection({ v: 2, beverage: true }), null);
});

test('validate: oversized payload is rejected outright', () => {
  assert.strictEqual(meal.nuParseMealContext('x'.repeat(meal.MEAL_LIMITS.maxPayloadChars + 1)), null);
});

test('validate: malformed JSON / non-object fails open to null', () => {
  assert.strictEqual(meal.nuParseMealContext('{not json'), null);
  assert.strictEqual(meal.nuParseMealContext('[1,2,3]'), null);
  assert.strictEqual(meal.nuParseMealContext(''), null);
  assert.strictEqual(meal.nuParseMealContext(null), null);
});

test('validate: enums are allowlisted; junk role/mealType/cats dropped', () => {
  const v = meal.nuValidateProjection({ v: 1, beverage: true, role: 'hacker',
    mealType: 'brunch', companionCats: ['carb', 'evil', 'veg', 'carb'] });
  assert.strictEqual(v.role, null);
  assert.strictEqual(v.mealType, null);
  assert.deepStrictEqual(v.companionCats, ['carb', 'veg']);   // junk + dupes removed
});

test('validate: companionCats is length-bounded', () => {
  const many = [];
  for (let i = 0; i < 50; i++) many.push('carb');
  const v = meal.nuValidateProjection({ v: 1, beverage: true, companionCats: many });
  assert.ok(v.companionCats.length <= meal.MEAL_LIMITS.maxCompanionCats);
});

test('validate: a non-actionable projection is rejected (no header sent)', () => {
  assert.strictEqual(meal.nuValidateProjection({ v: 1, beverage: false, cookedExpected: false,
    animal: null, companionCats: [] }), null);
});

test('validate: an unrecognized animal is dropped (not trusted verbatim)', () => {
  const v = meal.nuValidateProjection({ v: 1, animal: 'dragon', companionCats: ['carb'] });
  assert.strictEqual(v.animal, null);
});

test('validate: extra untrusted fields are dropped (only known keys survive)', () => {
  const v = meal.nuValidateProjection({ v: 1, beverage: true, companionCats: ['carb'],
    evil: 'DROP ME', __proto__hack: 1, animal: 'chicken', extra: { nested: true } });
  assert.deepStrictEqual(Object.keys(v).sort(),
    ['animal', 'beverage', 'commodity', 'companionCats', 'cookedExpected', 'mealType', 'role', 'v'].sort());
  assert.ok(!('evil' in v) && !('extra' in v), 'untrusted fields are not echoed');
});

test('validate: missing required version field → null', () => {
  assert.strictEqual(meal.nuValidateProjection({ beverage: true, companionCats: ['carb'] }), null);
  assert.strictEqual(meal.nuParseMealContext(JSON.stringify({ beverage: true })), null);
});

test('validate: wrong-typed fields are coerced/ignored, never trusted', () => {
  const v = meal.nuValidateProjection({ v: 1, beverage: 'yes', cookedExpected: 1,
    companionCats: 'carb', animal: 42, role: 7 });
  // Non-strict-true booleans → false; non-array companionCats → []; non-string
  // animal/role → null. With nothing actionable left, the projection is rejected.
  assert.strictEqual(v, null);
});

test('build: item count is capped at MEAL_LIMITS.maxItems', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ query: 'egg' });
  const c = meal.nuBuildMealContext('big meal', many);
  assert.ok(c.itemCount <= meal.MEAL_LIMITS.maxItems);
  assert.ok(c.items.length <= meal.MEAL_LIMITS.maxItems);
});

test('serialize: round-trips a valid projection; over-cap serializes empty', () => {
  const p = { v: 1, beverage: true, cookedExpected: false, animal: null, commodity: false,
    companionCats: ['carb'], role: 'beverage', mealType: null };
  assert.deepStrictEqual(meal.nuParseMealContext(meal.nuSerializeMealContext(p)), p);
  assert.strictEqual(meal.nuSerializeMealContext(null), '');
});

/* ── nuMealSignal: bounded, direct-object, correct sign ──────────────────── */

test('signal: accepts a validated projection object directly (no HTTP dependency)', () => {
  const sig = meal.nuMealSignal({ v: 1, beverage: true, companionCats: ['carb'] });
  assert.strictEqual(typeof sig, 'function');
  assert.ok(sig({ foodCategory: 'Beverages', description: 'Cola' }) > 0);
});

test('signal: a malformed projection yields an inert (always-0) pass', () => {
  const sig = meal.nuMealSignal({ v: 99 });
  assert.strictEqual(sig({ description: 'anything' }), 0);
});

test('signal: beverage item boosts beverage, penalizes solid', () => {
  const sig = meal.nuMealSignal({ v: 1, beverage: true, companionCats: ['carb'] });
  assert.strictEqual(sig({ foodCategory: 'Beverages', description: 'Soda, cola' }), meal.MEAL_WEIGHTS.beverageMatch);
  assert.strictEqual(sig({ foodCategory: 'Beef Products', description: 'Beef patty' }), meal.MEAL_WEIGHTS.beverageConflict);
});

test('signal: solid item penalizes a beverage candidate (drink for a bar)', () => {
  const sig = meal.nuMealSignal({ v: 1, beverage: false, companionCats: ['dairy'] });
  assert.strictEqual(sig({ foodCategory: 'Beverages', description: 'Cola' }), meal.MEAL_WEIGHTS.beverageConflict);
});

test('signal: cooked expectation favors cooked, demotes raw commodity', () => {
  const sig = meal.nuMealSignal({ v: 1, cookedExpected: true, commodity: true, companionCats: ['protein'] });
  assert.strictEqual(sig({ description: 'Beans, snap, green, cooked, boiled' }), meal.MEAL_WEIGHTS.cookedMatch);
  assert.strictEqual(sig({ description: 'Beans, snap, green, raw' }), meal.MEAL_WEIGHTS.rawConflict);
});

test('signal: animal-mismatch is penalized, matching animal is not', () => {
  const sig = meal.nuMealSignal({ v: 1, animal: 'chicken', companionCats: ['carb'] });
  assert.strictEqual(sig({ description: 'Turkey, breast, roasted' }), meal.MEAL_WEIGHTS.animalConflict);
  assert.strictEqual(sig({ description: 'Chicken, breast, roasted' }), 0);
});

test('signal: per-candidate sum is clamped to ±totalCap', () => {
  // Contrive a candidate that trips multiple negative cues at once.
  const sig = meal.nuMealSignal({ v: 1, beverage: false, cookedExpected: true, commodity: true,
    animal: 'chicken', companionCats: ['carb'] });
  const v = sig({ foodCategory: 'Beverages', description: 'Turkey drink, raw' });
  assert.ok(v >= -meal.MEAL_WEIGHTS.totalCap, 'never below -totalCap');
  assert.ok(v <= meal.MEAL_WEIGHTS.totalCap, 'never above totalCap');
});

/* ── ablation (adjustment 14): bounded tie-breaker over the REAL ranker ──── */

test('ablation: meal context does NOT override a decisive exact match', () => {
  // "banana" in a meal mis-cued as a beverage item: the exact fruit entry leads
  // the smoothie by ~4700 on pure query evidence. The beverage cue swings the two
  // by only beverageConflict/beverageMatch (bounded), so the exact match stays #1.
  const pool = [
    { fdcId: 1, description: 'Bananas, raw', dataType: 'SR Legacy',
      foodCategory: 'Fruits and Fruit Juices', nutrients: { kcal: 89 } },
    { fdcId: 2, description: 'Banana smoothie drink', dataType: 'Branded', brand: 'X',
      foodCategory: 'Beverages', nutrients: { kcal: 60 } },
  ];
  const sig = meal.nuMealSignal({ v: 1, beverage: true, companionCats: ['carb'] });
  const without = ranking.rankFoodCandidates('banana', pool.map(function (x) { return Object.assign({}, x); })).foods;
  const withMeal = ranking.rankFoodCandidates('banana', pool.map(function (x) { return Object.assign({}, x); }), { signals: [sig] }).foods;
  assert.strictEqual(without[0].fdcId, 1);
  assert.strictEqual(withMeal[0].fdcId, 1, 'decisive exact match survives the meal cue');
  // …and the contribution is exactly the bounded, signed weight — not an override.
  const s1 = without.find((f) => f.fdcId === 1).score;
  const s1m = withMeal.find((f) => f.fdcId === 1).score;
  const s2 = without.find((f) => f.fdcId === 2).score;
  const s2m = withMeal.find((f) => f.fdcId === 2).score;
  assert.strictEqual(s1m - s1, meal.MEAL_WEIGHTS.beverageConflict); // solid penalized
  assert.strictEqual(s2m - s2, meal.MEAL_WEIGHTS.beverageMatch);    // beverage boosted
});

test('ablation: meal context BREAKS a close tie (beverage vs solid)', () => {
  // Two "cola" candidates tied on query evidence — a solid ("Cola cake", Sweets)
  // and the real drink ("Cola soft drink", Beverages). For a beverage-role item
  // the meal cue lifts the drink ahead. Bounded: ±beverage weight, no override.
  const pool = [
    { fdcId: 1, description: 'Cola cake', dataType: 'Branded', brand: 'A',
      foodCategory: 'Sweets', nutrients: { kcal: 350 } },
    { fdcId: 2, description: 'Cola soft drink', dataType: 'Branded', brand: 'B',
      foodCategory: 'Beverages', nutrients: { kcal: 41 } },
  ];
  const sig = meal.nuMealSignal({ v: 1, beverage: true, companionCats: ['carb'] });
  const without = ranking.rankFoodCandidates('cola', pool.map(function (x) { return Object.assign({}, x); })).foods;
  const withMeal = ranking.rankFoodCandidates('cola', pool.map(function (x) { return Object.assign({}, x); }), { signals: [sig] }).foods;
  // Baseline: the two are tied → the shared ranker's own tie-break orders them.
  assert.strictEqual(without[0].score, without[1].score, 'baseline is a genuine tie');
  // With the beverage cue, the real drink leads (solid penalized, drink boosted).
  assert.strictEqual(withMeal[0].fdcId, 2);
});

test('ablation: identical behavior when the signal is absent', () => {
  const pool = [{ fdcId: 1, description: 'Chicken, breast, cooked', dataType: 'SR Legacy',
    foodCategory: 'Poultry Products', nutrients: { kcal: 165 } }];
  const a = ranking.rankFoodCandidates('chicken breast', pool.map(function (x) { return Object.assign({}, x); })).foods;
  const b = ranking.rankFoodCandidates('chicken breast', pool.map(function (x) { return Object.assign({}, x); }), { signals: [] }).foods;
  assert.deepStrictEqual(a.map((f) => f.fdcId), b.map((f) => f.fdcId));
});

/* ── nuMealAssess (confidence evidence) ──────────────────────────────────── */

test('assess: records support and conflict reasons', () => {
  const p = { v: 1, animal: 'chicken', companionCats: ['carb'] };
  assert.deepStrictEqual(meal.nuMealAssess(p, { description: 'Turkey breast' }),
    { active: true, support: false, conflict: true, reasons: ['animal_mismatch'] });
  const s = meal.nuMealAssess(p, { description: 'Chicken breast, roasted' });
  assert.strictEqual(s.support, true);
  assert.ok(s.reasons.includes('animal_match'));
});

test('assess: inert when no projection / no candidate', () => {
  assert.strictEqual(meal.nuMealAssess(null, { description: 'x' }).active, false);
  assert.strictEqual(meal.nuMealAssess({ v: 1, beverage: true }, null).active, false);
});

/* ── classifiers (adjustment 10: conservative, independently tested) ─────── */

test('classify: beverage nouns; milk stays a food', () => {
  assert.strictEqual(meal.nuMealIsBeverage('coffee'), true);
  assert.strictEqual(meal.nuMealIsBeverage('coke'), true);
  assert.strictEqual(meal.nuMealIsBeverage('protein shake'), true);
  assert.strictEqual(meal.nuMealIsBeverage('milk'), false);       // milk in cereal is not a drink
  assert.strictEqual(meal.nuMealIsBeverage('chicken'), false);
});

test('classify: candidate beverage detection uses structured category first', () => {
  assert.strictEqual(meal.nuMealCandidateIsBeverage({ foodCategory: 'Beverages', description: 'x' }), true);
  assert.strictEqual(meal.nuMealCandidateIsBeverage({ description: 'Soda, cola' }), true);
  assert.strictEqual(meal.nuMealCandidateIsBeverage({ foodCategory: 'Poultry Products', description: 'Chicken' }), false);
});

test('classify: animal detection is single-animal only', () => {
  assert.strictEqual(meal.nuMealAnimal('chicken breast'), 'chicken');
  assert.strictEqual(meal.nuMealAnimal('surf and turf shrimp beef'), null); // two animals → not single
});
