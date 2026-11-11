// FNDDS (Survey) rows in the shared ranker — roadmap 5.4.11.
// Run via `npm test` (node --test). Pure: rankFoodCandidates over small pools.
//
// Rule under test: an FNDDS row in a DISH category competes at full strength;
// an FNDDS row in any other category (a single food) takes
// RANK_WEIGHTS.surveyNonDish so the Foundation/SR record stays canonical.
// Non-survey rows are never affected.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('./food-ranking.js');

const row = (fdcId, description, dataType, foodCategory, kcal) => ({
  fdcId, description, dataType, foodCategory, brand: '', servingSize: null, servingSizeUnit: '', householdServing: '',
  nutrients: { kcal: kcal || 150, protein: 10, carbs: 10, fat: 5, fiber: 1, sugar: 1 },
});
const SV = (id, d, c, k) => row(id, d, R.SURVEY_DATA_TYPE, c, k);
const top = (q, pool) => R.rankFoodCandidates(q, pool).foods[0];
const scoreOf = (q, pool, id) => R.rankFoodCandidates(q, pool).foods.find((f) => f.fdcId === id).score;

test('isSurveyDish: WWEIA dish categories (and any "sandwich" category) are dishes', () => {
  for (const c of ['Burritos and tacos', 'Pizza', 'Burgers', 'Lettuce and lettuce salads', 'Egg rolls, dumplings, sushi',
    'Cheese sandwiches', 'Meat and BBQ sandwiches', 'Pancakes, waffles, French toast']) {
    assert.ok(R.isSurveyDish({ foodCategory: c }), c);
  }
  for (const c of ['Chicken, whole pieces', 'Yeast breads', 'Nuts and seeds', 'Bananas', '', undefined]) {
    assert.ok(!R.isSurveyDish({ foodCategory: c }), String(c));
  }
});

test('a single-food survey row takes exactly surveyNonDish; a dish row takes nothing', () => {
  const q = 'chicken breast';
  const asDish = SV(2, 'Chicken breast, rotisserie, skin not eaten', 'Poultry mixed dishes');
  const asSingle = SV(2, 'Chicken breast, rotisserie, skin not eaten', 'Chicken, whole pieces');
  const d = scoreOf(q, [asDish], 2) - scoreOf(q, [asSingle], 2);
  assert.strictEqual(d, -R.RANK_WEIGHTS.surveyNonDish);
  assert.ok(R.RANK_WEIGHTS.surveyNonDish < 0);
});

test('the Foundation record stays #1 over survey single foods named like the query', () => {
  const pool = [
    row(2646170, 'Chicken, breast, boneless, skinless, raw', 'Foundation', 'Poultry Products', 112),
    SV(2705964, 'Chicken breast, rotisserie, skin not eaten', 'Chicken, whole pieces', 144),
    SV(2705971, 'Chicken breast, sauteed, skin eaten', 'Chicken, whole pieces', 206),
  ];
  assert.strictEqual(top('chicken breast', pool).fdcId, 2646170);
});

test('a survey dish outranks the weak SR matches that led before', () => {
  assert.strictEqual(top('caesar salad', [
    row(171045, 'Salad dressing, caesar, fat-free', 'SR Legacy', 'Fats and Oils', 131),
    SV(2709591, 'Caesar salad, with romaine, no dressing', 'Lettuce and lettuce salads', 77),
  ]).fdcId, 2709591);
  assert.strictEqual(top('taco', [
    row(170734, 'TACO BELL, Bean Burrito', 'SR Legacy', 'Fast Foods', 209),
    SV(2708514, 'Taco, NFS', 'Burritos and tacos', 246),
  ]).fdcId, 2708514);
});

test('"NFS" (not further specified) is the canonical survey dish', () => {
  assert.strictEqual(top('pancakes', [
    SV(1, 'Pancakes, whole grain', 'Pancakes, waffles, French toast', 273),
    SV(2, 'Pancakes, NFS', 'Pancakes, waffles, French toast', 282),
  ]).fdcId, 2);
});

test('pools without survey rows rank exactly as before (rule is survey-only)', () => {
  const pool = [
    row(1, 'Bananas, raw', 'SR Legacy', 'Fruits and Fruit Juices', 89),
    row(2, 'Bananas, dehydrated, or banana powder', 'SR Legacy', 'Fruits and Fruit Juices', 346),
    row(3, 'BANANA CHIPS', 'Branded', 'Chips, Pretzels & Snacks', 520),
  ];
  const saved = R.RANK_WEIGHTS.surveyNonDish;
  const a = R.rankFoodCandidates('banana', pool.map((f) => Object.assign({}, f))).foods.map((f) => [f.fdcId, f.score]);
  R.RANK_WEIGHTS.surveyNonDish = 0;
  try {
    const b = R.rankFoodCandidates('banana', pool.map((f) => Object.assign({}, f))).foods.map((f) => [f.fdcId, f.score]);
    assert.deepStrictEqual(a, b);
  } finally { R.RANK_WEIGHTS.surveyNonDish = saved; }
});
