// Category F — portion interpretation. Two paths:
//   • vague  : nuInterpretVaguePortion(input) directly (input carries the seam
//              args: unit, food, isLiquid, rawText, query). via defaults to 'vague'.
//   • resolver: full resolve over a canned pool (input.via = 'resolver') for exact
//              household units / counts / gram totals.
// Expectations authored from observed production output.

'use strict';

const V = (id, input, portion, extra) => Object.assign(
  { id, category: 'portion', input, expected: { portion } }, extra || {});
const R = (id, input, portion, extra) => Object.assign(
  { id, category: 'portion', input: Object.assign({ via: 'resolver' }, input), expected: { portion } }, extra || {});

const food = (description, foodCategory) => ({ description, foodCategory });

module.exports = [
  /* vague classes × families — estimated amount within tolerance */
  V('pt-handful-nuts', { unit: 'handful', food: food('Nuts, almonds') },
    { detected: true, basis: 'category-table', estimatedUnit: 'g', estimatedAmount: 28 }, { tolerances: { estimatedAmount: 8 }, subcategory: 'handful', tags: ['handful', 'vague-portion'] }),
  V('pt-scoop-protein', { unit: 'scoop', food: food('Whey protein powder') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 31 }, { tolerances: { estimatedAmount: 6 }, subcategory: 'scoop', tags: ['scoop', 'vague-portion'] }),
  V('pt-pinch-salt', { unit: 'pinch', food: food('Salt, table') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 0.4 }, { tolerances: { estimatedAmount: 0.3 }, subcategory: 'pinch', tags: ['pinch', 'seasoning', 'vague-portion'] }),
  V('pt-drizzle-oil', { unit: 'drizzle', food: food('Oil, olive'), isLiquid: true },
    { detected: true, estimatedUnit: 'ml', estimatedAmount: 9 }, { tolerances: { estimatedAmount: 4 }, subcategory: 'drizzle', tags: ['drizzle', 'vague-portion'] }),
  V('pt-slice-bread', { unit: 'slice', food: food('Bread, white') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 28 }, { tolerances: { estimatedAmount: 8 }, subcategory: 'slice', tags: ['slice', 'vague-portion'] }),
  V('pt-bowl-cereal', { unit: 'bowl', food: food('Cereal, corn flakes') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 40 }, { tolerances: { estimatedAmount: 20 }, subcategory: 'bowl', tags: ['bowl', 'vague-portion'] }),
  V('pt-splash-milk', { unit: 'splash', food: food('Milk, whole'), isLiquid: true },
    { detected: true, estimatedUnit: 'ml', estimatedAmount: 15, form: 'liquid' }, { tolerances: { estimatedAmount: 8 }, subcategory: 'splash', tags: ['splash', 'liquids', 'vague-portion'] }),

  /* clarification-worthy vague portions (big containers) */
  V('pt-plate-pasta-clarify', { unit: 'plate', food: food('Pasta, cooked') },
    { detected: true, requiresClarification: true }, { subcategory: 'ambiguous-container', tags: ['plate', 'vague-portion', 'clarify'] }),
  V('pt-piece-chicken-clarify', { unit: 'piece', food: food('Chicken breast') },
    { detected: true, requiresClarification: true }, { subcategory: 'ambiguous-count', tags: ['piece', 'vague-portion', 'clarify'] }),

  /* generic small-amount words */
  V('pt-some-rice', { unit: 'some', food: food('Rice, white, cooked') },
    { detected: true }, { subcategory: 'generic-vague', tags: ['vague-portion'] }),
  V('pt-a-little-milk', { unit: 'a little', food: food('Milk, whole'), isLiquid: true },
    { detected: true, form: 'liquid' }, { subcategory: 'generic-vague', tags: ['vague-portion', 'liquids'] }),

  /* dropped-unit recovery from raw text (parser dropped the quantifier) */
  V('pt-raw-splash-milk', { unit: null, rawText: 'a splash of milk', query: 'milk', isLiquid: true, food: food('Milk, whole') },
    { detected: true, estimatedUnit: 'ml' }, { subcategory: 'raw-recovery', tags: ['splash', 'vague-portion', 'raw-recovery'] }),
  V('pt-raw-handful-almonds', { unit: null, rawText: 'a handful of almonds', query: 'almonds', food: food('Nuts, almonds') },
    { detected: true, estimatedUnit: 'g' }, { subcategory: 'raw-recovery', tags: ['handful', 'vague-portion', 'raw-recovery'] }),

  /* NOT a portion: an exact unit must not be treated as vague */
  V('pt-cup-is-exact-not-vague', { unit: 'cup', food: food('Rice, white, cooked') },
    { detected: false }, { subcategory: 'exact-over-vague', tags: ['precedence', 'cup-table'] }),
  V('pt-oz-is-exact-not-vague', { unit: 'oz', food: food('Nuts, almonds') },
    { detected: false }, { subcategory: 'exact-over-vague', tags: ['precedence'] }),

  /* modifier scaling — small/large bowls, handfuls, scoops, plates */
  V('pt-small-bowl-rice', { unit: 'small bowl', food: food('Rice, white, cooked') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 111 }, { tolerances: { estimatedAmount: 40 }, subcategory: 'modifier', tags: ['bowl', 'modifier', 'vague-portion'] }),
  V('pt-large-bowl-rice', { unit: 'large bowl', food: food('Rice, white, cooked') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 221 }, { tolerances: { estimatedAmount: 60 }, subcategory: 'modifier', tags: ['bowl', 'modifier', 'vague-portion'] }),
  V('pt-small-handful-nuts', { unit: 'small handful', food: food('Nuts, almonds') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 20 }, { tolerances: { estimatedAmount: 8 }, subcategory: 'modifier', tags: ['handful', 'modifier', 'vague-portion'] }),
  V('pt-big-handful-nuts', { unit: 'big handful', food: food('Nuts, almonds') },
    { detected: true, estimatedUnit: 'g', estimatedAmount: 39 }, { tolerances: { estimatedAmount: 12 }, subcategory: 'modifier', tags: ['handful', 'modifier', 'vague-portion'] }),
  V('pt-generous-scoop-protein', { unit: 'generous scoop', food: food('Whey protein powder') },
    { detected: true, estimatedUnit: 'g' }, { subcategory: 'modifier', tags: ['scoop', 'modifier', 'vague-portion'] }),
  V('pt-small-plate-pasta', { unit: 'small plate', food: food('Pasta, cooked') },
    { detected: true, estimatedUnit: 'g' }, { subcategory: 'modifier', tags: ['plate', 'modifier', 'vague-portion'] }),

  /* additional families */
  V('pt-bowl-soup-liquid', { unit: 'bowl', food: food('Soup, chicken noodle'), isLiquid: true },
    { detected: true }, { subcategory: 'family', tags: ['bowl', 'liquids', 'vague-portion'] }),
  V('pt-slice-pizza', { unit: 'slice', food: food('Pizza, cheese') },
    { detected: true, estimatedUnit: 'g' }, { subcategory: 'family', tags: ['slice', 'vague-portion'] }),
  V('pt-piece-fruit-clarify', { unit: 'piece', food: food('Apple, raw') },
    { detected: true }, { subcategory: 'count', tags: ['piece', 'vague-portion'] }),

  /* resolver path: exact counts / household units / gram totals (pools proven in the 121 corpus) */
  R('pt-2-eggs', { query: 'egg', quantity: 2 },
    { servings: 2, grams: 50, serving_description_regex: '1 large' }, { subcategory: 'count', tags: ['portions', 'quantity'] }),
  R('pt-2-toast-slices', { query: 'toast', quantity: 2, unit: 'slice' },
    { servings: 2, grams: 25, serving_description_regex: 'slice' }, { subcategory: 'unit-match', tags: ['portions', 'slice'] }),
  R('pt-almonds-cup', { query: 'almonds', quantity: 1, unit: 'cup' },
    { grams: 143, serving_description_regex: 'cup' }, { subcategory: 'household-unit', tags: ['portions', 'cup-table'] }),
  R('pt-chicken-6oz-total', { query: 'chicken breast', quantity: 6, unit: 'oz', grams: 170 },
    { servings: 1, grams: 170 }, { subcategory: 'stated-weight-total', tags: ['weights', 'precedence'] }),
];
