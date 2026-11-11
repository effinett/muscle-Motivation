// Volume conversion inside the shared serving chooser (roadmap 5.4.12).
// Run via `npm test` (node --test). Pure — no DOM, network or database.
//
// nuAiChooseServing is the ONE serving rule AI Quick Log and the search box
// share. These tests pin the volume fallback added to it: an explicit cup /
// spoon / fl oz / ml amount the food has no label for is converted through a
// verified anchor (nuVolumeAmount), precedence over existing branches is
// unchanged, and nothing is ever converted without an anchor.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const core = require('./food-core.js');

const milkRaw = () => ({ fdcId: 1, description: 'Milk, whole', dataType: 'SR Legacy',
  nutrients: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5 } });
const chickenRaw = () => ({ fdcId: 2, description: 'Chicken, breast, grilled', dataType: 'SR Legacy',
  nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0 } });
const colaRaw = () => ({ fdcId: 3, description: 'COLA', dataType: 'Branded', brand: 'Acme',
  servingSize: 355, servingSizeUnit: 'ml', householdServing: '1 can',
  nutrients: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6 } });
const CUP = [{ label: '1 cup', amount: 1, gramWeight: 244 }];

function choose(raw, portions, parsed) {
  const f = core.nuNormalizeUsdaFood(raw);
  const opts = core.nuBuildServingOptions(f, portions);
  return core.nuAiChooseServing(f, opts, portions, Object.assign({ quantity: 1, unit: null, grams: null, text: '' }, parsed));
}

test('a spoon amount on a food with only a cup serving converts through that cup', () => {
  const sv = choose(milkRaw(), CUP, { quantity: 2, unit: 'tbsp' });
  assert.strictEqual(sv.grams, 31, '244 g × 30 ml / 240 ml = 30.5');
  assert.strictEqual(sv.description, '2 tbsp (31 g)');
  assert.strictEqual(sv.wholeQuantity, true, 'the amount is the TOTAL — never multiplied by quantity again');
  assert.strictEqual(sv.matchedUnit, true);
  assert.strictEqual(sv.converted, true);
  assert.strictEqual(sv.conversionAnchor, '1 cup');
  assert.strictEqual(sv.perUnit.calories, Math.round(61 * 0.31));
});

test('every spelling a parser may send is understood', () => {
  for (const unit of ['tablespoon', 'tablespoons', 'tbsp']) {
    assert.strictEqual(choose(milkRaw(), CUP, { quantity: 2, unit }).grams, 31, unit);
  }
  for (const unit of ['ml', 'milliliters', 'millilitre']) {
    assert.strictEqual(choose(milkRaw(), CUP, { quantity: 250, unit }).grams, 254, unit);
  }
  for (const unit of ['fl oz', 'fl. oz', 'floz', 'fluid ounces']) {
    assert.strictEqual(choose(milkRaw(), CUP, { quantity: 8, unit }).grams, 241, unit);
  }
  const labelled = choose(milkRaw(), CUP, { quantity: 0.25, unit: 'cup' });
  assert.ok(labelled.description === '1 cup' && !labelled.converted,
    'a unit the food HAS a label for still uses that label (branch 2), unchanged');
});

test('a fluid ounce is a volume: label first, then conversion, then the legacy oz match', () => {
  // (a) weight food with a volume anchor → converted (was 8 × the 1 oz weight option)
  const conv = choose(milkRaw(), CUP, { quantity: 8, unit: 'fl oz' });
  assert.strictEqual(conv.converted, true);
  assert.strictEqual(conv.grams, 241);
  // (b) a food with its own fl oz label keeps using it
  const liquid = choose(colaRaw(), [], { quantity: 8, unit: 'fl oz' });
  assert.match(String(liquid.label || liquid.description), /fl oz|ml/i);
  assert.strictEqual(liquid.matchedUnit, true);
  // (c) no anchor at all → exactly the behaviour before this change
  const legacy = choose(chickenRaw(), [], { quantity: 8, unit: 'fl oz' });
  assert.ok(!legacy.converted, 'nothing is converted without an anchor');
  assert.match(String(legacy.label), /oz/);
});

test('no anchor → no conversion: the default serving comes back unflagged-as-matched', () => {
  const sv = choose(chickenRaw(), [], { quantity: 1, unit: 'cup' });
  assert.ok(!sv.converted);
  assert.ok(!sv.matchedUnit, 'the unit stays unresolved so the review row flags it');
});

test('precedence is unchanged: stated weight and verified labels still win', () => {
  const weight = choose(milkRaw(), CUP, { quantity: 6, unit: 'oz', grams: 170 });
  assert.strictEqual(weight.grams, 170);
  assert.ok(!weight.converted);
  const label = choose(milkRaw(), CUP, { quantity: 2, unit: 'cup' });
  assert.ok(!label.converted && label.grams === 244 && label.unitCount === 1);
});

test('a drink measured in ml: cup and fl oz become ml; tsp/tbsp keep the long-standing branch', () => {
  const cup = choose(colaRaw(), [], { quantity: 1.5, unit: 'cup' });
  assert.strictEqual(cup.matchedUnit, true);
  const tbsp = choose(colaRaw(), [], { quantity: 2, unit: 'tbsp' });
  assert.strictEqual(tbsp.unit, 'ml');
  assert.strictEqual(tbsp.amount, 15, 'per-unit 15 ml (resolver multiplies by quantity) — unchanged');
  assert.ok(!tbsp.converted);
});

test('the resolver logs ONE serving of the converted total', async () => {
  const source = {
    search: async () => [Object.assign(milkRaw(), { group: 'generic', foodCategory: 'Dairy and Egg Products' })],
    portions: async () => CUP,
  };
  const r = await core.nuCreateResolver(source).resolveFood(
    Object.assign(milkRaw(), { group: 'generic', foodCategory: 'Dairy and Egg Products' }),
    { text: '3 tbsp milk', query: 'milk', quantity: 3, unit: 'tbsp', grams: null });
  assert.strictEqual(r.servings, 1);
  assert.strictEqual(r.grams, 46, '244 × 45/240 = 45.75');
  assert.strictEqual(r.serving_description, '3 tbsp (46 g)');
  assert.strictEqual(core.nuScaleMacros(r.perUnit, r.servings).calories, 28);
});
