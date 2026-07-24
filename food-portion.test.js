// food-portion.test.js — unit tests for the Vague Portion Intelligence core
// (Phase 4.2.5). Pure module: no DOM, no fetch, no keys. Run via `npm test`.
//
// Coverage: phrase detection + taxonomy normalization, food-family
// classification, category-aware estimates, modifiers, ranges, confidence
// ceilings, form compatibility (rejecting nonsensical pairings), correction-
// memory override, clarification decisions, and provenance.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fp = require('./food-portion.js');

// Small helpers to keep cases terse.
function food(description, extra) { return Object.assign({ description: description }, extra || {}); }
function interp(unit, description, per100, extra) {
  return fp.nuInterpretVaguePortion(Object.assign({
    unit: unit, food: food(description, (extra && extra.food) || {}),
    per100: per100 || { kcal: 100, protein: 5, carbs: 10, fat: 3 },
    isLiquid: !!(extra && extra.isLiquid),
    correction: (extra && extra.correction) || null,
  }, extra && extra.top || {}));
}
const NUTS = { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5, sugar: 4.4 };

/* ── phrase detection + taxonomy normalization ──────────────────────────── */

test('detect: base classes and synonyms normalize to one class', () => {
  assert.strictEqual(fp.nuDetectPortionPhrase('handful').portionClass, 'handful');
  assert.strictEqual(fp.nuDetectPortionPhrase('handfuls').portionClass, 'handful');   // plural
  assert.strictEqual(fp.nuDetectPortionPhrase('spoon').portionClass, 'spoonful');     // synonym
  assert.strictEqual(fp.nuDetectPortionPhrase('bowlful').portionClass, 'bowl');
  assert.strictEqual(fp.nuDetectPortionPhrase('chunk').portionClass, 'piece');
  assert.strictEqual(fp.nuDetectPortionPhrase('bit').portionClass, 'small_amount');
});

test('detect: modifiers are extracted separately from the class', () => {
  const d = fp.nuDetectPortionPhrase('large handful');
  assert.strictEqual(d.portionClass, 'handful');
  assert.strictEqual(d.modifier, 'large');
  assert.strictEqual(fp.nuDetectPortionPhrase('small handful').modifier, 'small');
  assert.strictEqual(fp.nuDetectPortionPhrase('generous drizzle').modifier, 'large');   // synonym
  assert.strictEqual(fp.nuDetectPortionPhrase('heaping spoonful').modifier, 'heaping');
  // ordering doesn't matter
  assert.strictEqual(fp.nuDetectPortionPhrase('handful, large').modifier, 'large');
});

test('detect: a real unit is NOT a vague phrase', () => {
  for (const u of ['oz', 'g', 'gram', 'ml', 'cup', 'tbsp', 'tsp', 'slice']) {
    // slice IS in the taxonomy, so it detects; the rest must be null
    if (u === 'slice') continue;
    assert.strictEqual(fp.nuDetectPortionPhrase(u), null, u + ' should not be vague');
  }
});

/* ── food-family classification ─────────────────────────────────────────── */

test('family: description keyword wins, plurals match', () => {
  assert.strictEqual(fp.nuFoodFamily(food('Nuts, almonds')), 'nuts');
  assert.strictEqual(fp.nuFoodFamily(food('Blueberries, raw')), 'berries');   // plural stem
  assert.strictEqual(fp.nuFoodFamily(food('Spinach, raw')), 'leafy_greens');
  assert.strictEqual(fp.nuFoodFamily(food('Potato chips')), 'chips');
  assert.strictEqual(fp.nuFoodFamily(food('Olive oil')), 'oil');
  assert.strictEqual(fp.nuFoodFamily(food('Chicken noodle soup')), 'soup');   // soup beats pasta
  assert.strictEqual(fp.nuFoodFamily(food('Salt, table')), 'salt');
  assert.strictEqual(fp.nuFoodFamily(food('mystery item')), 'generic');
});

test('family: falls back to USDA foodCategory when description is unspecific', () => {
  assert.strictEqual(fp.nuFoodFamily(food('generic', { foodCategory: 'Nut and Seed Products' })), 'nuts');
  assert.strictEqual(fp.nuFoodFamily(food('generic', { foodCategory: 'Fats and Oils' })), 'oil');
});

/* ── category-aware estimates: THE core requirement ─────────────────────── */

test('handful is category-aware — almonds ≠ spinach, and NEVER ~100 g', () => {
  const almond = interp('handful', 'Nuts, almonds', NUTS);
  assert.strictEqual(almond.estimatedAmount, 28);
  assert.strictEqual(almond.family, 'nuts');
  assert.ok(almond.estimatedAmount < 60, 'a handful of almonds must never be ~100 g');

  assert.strictEqual(interp('handful', 'Spinach, raw', { kcal: 23 }).estimatedAmount, 12);
  assert.strictEqual(interp('handful', 'Blueberries, raw', { kcal: 57 }).estimatedAmount, 45);
  assert.strictEqual(interp('handful', 'Potato chips', { kcal: 536 }).estimatedAmount, 18);
  assert.strictEqual(interp('handful', 'Popcorn, air-popped', { kcal: 387 }).estimatedAmount, 8);
});

test('estimate carries a range and per-serving macros scaled from the panel', () => {
  const r = interp('handful', 'Nuts, almonds', NUTS);
  assert.deepStrictEqual(r.range, { min: 20, max: 35 });
  assert.strictEqual(r.estimatedUnit, 'g');
  assert.strictEqual(r.perUnit.calories, 162);   // 579 × 0.28, macros never invented
  assert.strictEqual(r.basis, 'category-table');
  assert.strictEqual(r.provenance.source, 'verified-table');
});

test('same input + context is deterministic (no drift across calls)', () => {
  const a = interp('large handful', 'Nuts, almonds', NUTS);
  const b = interp('large handful', 'Nuts, almonds', NUTS);
  assert.deepStrictEqual(a, b);
});

/* ── modifiers ──────────────────────────────────────────────────────────── */

test('modifiers scale deterministically and per class', () => {
  assert.strictEqual(interp('small handful', 'Nuts, almonds', NUTS).estimatedAmount, 20);   // 0.7×28
  assert.strictEqual(interp('large handful', 'Nuts, almonds', NUTS).estimatedAmount, 39);   // 1.4×28
  // heaping vs level spoonful differ
  const heap = interp('heaping spoonful', 'Peanut butter', { kcal: 588 });
  const level = interp('level spoonful', 'Peanut butter', { kcal: 588 });
  assert.ok(heap.estimatedAmount > level.estimatedAmount, 'heaping > level');
});

test('contradictory modifiers never multiply — they clarify', () => {
  const r = interp('small huge bowl', 'Cheerios cereal', { kcal: 379 });
  assert.strictEqual(r.requiresClarification, true);
  assert.ok(r.clarification, 'offers a size question');
});

/* ── form compatibility: reject the nonsensical ─────────────────────────── */

test('nonsensical pairings are unsupported, not silently estimated', () => {
  assert.strictEqual(interp('splash', 'Nuts, almonds', NUTS).compatible, false);
  assert.strictEqual(interp('pinch', 'Chicken breast', { kcal: 165 }).compatible, false);
  assert.strictEqual(interp('bowl', 'Olive oil', { kcal: 884 }).compatible, false);
  const water = interp('handful', 'Water', { kcal: 0 }, { isLiquid: true });
  assert.strictEqual(water.compatible, false);
  // unsupported carries NO fabricated amount
  assert.strictEqual(interp('splash', 'Nuts, almonds', NUTS).estimatedAmount, null);
});

test('sensible liquid/condiment pairings resolve without clarifying', () => {
  const splash = interp('splash', 'Whole Milk', { kcal: 61 }, { isLiquid: true });
  assert.strictEqual(splash.estimatedUnit, 'ml');
  assert.strictEqual(splash.estimatedAmount, 15);
  assert.strictEqual(splash.requiresClarification, false);
  assert.strictEqual(interp('pinch', 'Salt, table', {}).requiresClarification, false);
  assert.strictEqual(interp('drizzle', 'Olive oil', { kcal: 884 }).requiresClarification, false);
});

/* ── confidence + clarification decisions ───────────────────────────────── */

test('container-dependent + unknown category → clarify; known category resolves', () => {
  assert.strictEqual(interp('bowl', 'Cheerios cereal', { kcal: 379 }).requiresClarification, false);
  assert.strictEqual(interp('bowl', 'mystery food', { kcal: 200 }).requiresClarification, true);
  assert.strictEqual(interp('some', 'Rice, white, cooked', { kcal: 130 }).requiresClarification, true);
  // a piece of chicken is cut/size dependent → ask
  assert.strictEqual(interp('piece', 'Chicken breast, cooked', { kcal: 165 }).requiresClarification, true);
  // a slice of bread has a standard weight → resolve
  assert.strictEqual(interp('slice', 'Bread, white', { kcal: 266 }).requiresClarification, false);
});

test('a user-supplied size on a container class resolves it', () => {
  const small = interp('small bowl', 'Cheerios cereal', { kcal: 379 });
  assert.strictEqual(small.requiresClarification, false);
  assert.ok(small.confidence >= fp.NU_PT_CLARIFY_BELOW);
  assert.strictEqual(small.estimatedAmount, 28);   // 0.7×40
});

test('clarification reuses the {type,target,options[{label,patch}]} contract', () => {
  const c = interp('bowl', 'mystery food', { kcal: 200 }).clarification;
  assert.strictEqual(c.type, 'portion');
  assert.strictEqual(c.target, 'unit');
  assert.strictEqual(c.options.length, 3);
  assert.deepStrictEqual(c.options[2].patch, { unit: 'large bowl' });   // re-enters as a sized phrase
  assert.strictEqual(c.allowFreeText, false);
});

/* ── correction memory override ─────────────────────────────────────────── */

test('a matched correction overrides the default estimate, with provenance', () => {
  const r = interp('handful', 'Nuts, almonds', NUTS, { correction: { grams: 35, confidence: 0.9 } });
  assert.strictEqual(r.basis, 'correction-memory');
  assert.strictEqual(r.estimatedAmount, 35);
  assert.strictEqual(r.provenance.correctionApplied, true);
  assert.strictEqual(r.provenance.defaultAmount, 28, 'records what the default WOULD have been');
  assert.strictEqual(r.provenance.correctedAmount, 35);
  assert.strictEqual(r.perUnit.calories, 203);   // 579 × 0.35, from the panel
});

test('nuMatchPortionCorrection isolates by food identity AND portion class', () => {
  const corrections = [
    { food_key: 'usda:170567', portion_class: 'handful', grams: 35, reinforcement_count: 2 },
  ];
  assert.ok(fp.nuMatchPortionCorrection(corrections, 'usda:170567', 'handful'));
  // different food → no inheritance
  assert.strictEqual(fp.nuMatchPortionCorrection(corrections, 'usda:999999', 'handful'), null);
  // different vague class → no inheritance
  assert.strictEqual(fp.nuMatchPortionCorrection(corrections, 'usda:170567', 'bowl'), null);
});

test('nuMatchPortionCorrection prefers the most-reinforced correction', () => {
  const corrections = [
    { food_key: 'usda:1', portion_class: 'handful', grams: 30, reinforcement_count: 1 },
    { food_key: 'usda:1', portion_class: 'handful', grams: 40, reinforcement_count: 5 },
  ];
  assert.strictEqual(fp.nuMatchPortionCorrection(corrections, 'usda:1', 'handful').grams, 40);
});

test('nuBuildPortionCorrection shapes a data-minimal record; rejects bad input', () => {
  const rec = fp.nuBuildPortionCorrection({ food_key: 'usda:1', portion_class: 'handful', grams: 35, family: 'nuts' });
  assert.strictEqual(rec.grams, 35);
  assert.strictEqual(rec.portion_class, 'handful');
  assert.strictEqual(rec.reinforcement_count, 1);
  assert.strictEqual(fp.nuBuildPortionCorrection({ food_key: 'usda:1', grams: 0 }), null);
  assert.strictEqual(fp.nuBuildPortionCorrection({ grams: 35, portion_class: 'handful' }), null);
});

/* ── provenance + explanation never overstate precision ─────────────────── */

test('explanation reads as an estimate, never as an exact measurement', () => {
  const r = interp('handful', 'Nuts, almonds', NUTS);
  assert.match(r.explanation, /estimated/i);
  assert.match(r.explanation, /~/);         // approximate marker
  assert.doesNotMatch(r.explanation, /exactly|precise/i);
});

test('not a vague phrase → detected:false (caller keeps normal handling)', () => {
  assert.strictEqual(fp.nuInterpretVaguePortion({ unit: 'oz', food: food('Nuts, almonds'), per100: NUTS }).detected, false);
  assert.strictEqual(fp.nuInterpretVaguePortion({ unit: null }).detected, false);
});
