// Category G — meal-level reasoning (food-meal.js nuBuildMealContext). Pure text
// classification: beverage/solid, cooked expectation, animal subtype, category.
//
// NOTE: item-COUNT / split-vs-keep is the AI parser's job (non-deterministic,
// out of scope for the deterministic suite). These cases take the parsed items
// as GIVEN and score the meal reasoning applied to them — exactly the boundary
// the pure core owns. Split/merge correctness lives in the (optional) live tier.

'use strict';

const M = (id, text, items, meal, extra) => Object.assign(
  { id, category: 'meal', input: { text, items: items.map((q) => (typeof q === 'string' ? { query: q } : q)) },
    expected: { meal } }, extra || {});

module.exports = [
  /* three-item plates */
  M('meal-chicken-rice-broccoli', 'chicken, rice and broccoli', ['chicken', 'rice', 'broccoli'],
    { itemCount: 3, notBeverageIndexes: [0, 1, 2], categories: ['protein', 'carb', 'veg'], animals: ['chicken', null, null] },
    { subcategory: '3-item', tags: ['meal-reasoning'] }),
  M('meal-steak-eggs-toast', 'steak, eggs and toast', ['steak', 'eggs', 'toast'],
    { itemCount: 3, notBeverageIndexes: [0, 1, 2] }, { subcategory: '3-item', tags: ['meal-reasoning'] }),

  /* two-item meals */
  M('meal-eggs-toast', 'eggs and toast', ['eggs', 'toast'],
    { itemCount: 2, notBeverageIndexes: [0, 1], categories: ['protein', 'carb'] }, { subcategory: '2-item', tags: ['meal-reasoning'] }),
  M('meal-yogurt-berries', 'yogurt with berries', ['yogurt', 'berries'],
    { itemCount: 2, categories: ['protein', 'fruit'] }, { subcategory: 'with', tags: ['meal-reasoning'] }),
  M('meal-burger-fries', 'burger and fries', ['burger', 'fries'],
    { itemCount: 2, notBeverageIndexes: [0, 1] }, { subcategory: '2-item', tags: ['meal-reasoning'] }),

  /* beverage-vs-solid: a drink is a beverage, its companion solid is not */
  M('meal-coffee-milk-beverage', 'coffee with milk', ['coffee', 'milk'],
    { itemCount: 2, beverageIndexes: [0], notBeverageIndexes: [1] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),
  M('meal-shake-banana', 'protein shake with banana', ['protein shake', 'banana'],
    { itemCount: 2, beverageIndexes: [0], notBeverageIndexes: [1], categories: ['protein', 'fruit'] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),

  /* solid food must NOT be force-classified as a beverage (4.2.6 regression class) */
  M('meal-eggs-not-beverage', 'scrambled eggs and orange juice', ['eggs', 'orange juice'],
    { notBeverageIndexes: [0], beverageIndexes: [1] }, { subcategory: 'no-false-beverage', tags: ['meal-reasoning', 'beverage'] }),

  /* shared cooked expectation — an explicit cooked item raises meal cooked, a raw item is not forced */
  M('meal-grilled-chicken-rice-cooked', 'grilled chicken with rice', ['grilled chicken', 'rice'],
    { mealCooked: true, categories: ['protein', 'carb'], animals: ['chicken', null] }, { subcategory: 'cooked', tags: ['meal-reasoning', 'shared-prep'] }),
  M('meal-raw-not-forced-cooked', 'banana and almonds', ['banana', 'almonds'],
    { mealCooked: false }, { subcategory: 'cooked', tags: ['meal-reasoning', 'shared-prep'] }),

  /* animal-subtype consistency */
  M('meal-chicken-subtype', 'chicken breast and rice', ['chicken breast', 'rice'],
    { animals: ['chicken', null] }, { subcategory: 'animal', tags: ['meal-reasoning', 'species'] }),

  /* more real-world combinations */
  M('meal-tea-milk', 'tea with milk', ['tea', 'milk'],
    { beverageIndexes: [0], notBeverageIndexes: [1] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),
  M('meal-smoothie-toast', 'smoothie and toast', ['smoothie', 'toast'],
    { beverageIndexes: [0], notBeverageIndexes: [1] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),
  M('meal-salmon-vegetables', 'salmon and vegetables', ['salmon', 'vegetables'],
    { categories: ['protein', 'veg'], notBeverageIndexes: [0, 1] }, { subcategory: '2-item', tags: ['meal-reasoning'] }),
  M('meal-oatmeal-berries', 'oatmeal with berries', ['oatmeal', 'berries'],
    { categories: ['carb', 'fruit'] }, { subcategory: 'with', tags: ['meal-reasoning'] }),
  M('meal-toast-peanut-butter', 'toast with peanut butter', ['toast', 'peanut butter'],
    { categories: ['carb', 'fat'], notBeverageIndexes: [0, 1] }, { subcategory: 'with', tags: ['meal-reasoning'] }),
  M('meal-rice-beans', 'rice and beans', ['rice', 'beans'],
    { categories: ['carb', 'veg'], notBeverageIndexes: [0, 1] }, { subcategory: '2-item', tags: ['meal-reasoning'] }),
  M('meal-chicken-water-beverage', 'grilled chicken and water', ['chicken', 'water'],
    { beverageIndexes: [1], notBeverageIndexes: [0] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),
  M('meal-juice-eggs', 'orange juice and eggs', ['orange juice', 'eggs'],
    { beverageIndexes: [0], notBeverageIndexes: [1] }, { subcategory: 'beverage', tags: ['meal-reasoning', 'beverage'] }),
];
