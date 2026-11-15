// /api/usda-food portion trimming. Run via `npm test` (node --test). Pure.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { trimPortions } = require('./api/usda-food.js')._internals;

test('FNDDS numeric modifier codes never reach a label ("1 90000" → "1 serving")', () => {
  const portions = trimPortions({ foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 160, portionDescription: '1 large', modifier: '90000', measureUnit: { name: 'undetermined' } },
    { sequenceNumber: 2, amount: 1, gramWeight: 105, portionDescription: 'Quantity not specified', modifier: '90000', measureUnit: { name: 'undetermined' } },
  ] });
  assert.deepStrictEqual(portions.map((p) => p.label).sort(), ['1 large', '1 serving']);
});

test('word modifiers and real units are untouched (SR / Foundation shapes)', () => {
  const portions = trimPortions({ foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 118, modifier: 'medium (7" to 7-7/8" long)', measureUnit: { name: 'undetermined' } },
    { sequenceNumber: 2, amount: 1, gramWeight: 150, modifier: 'mashed', measureUnit: { name: 'cup' } },
    { sequenceNumber: 3, amount: 2, gramWeight: 32, measureUnit: { name: 'tbsp' } },
  ] });
  const labels = portions.map((p) => p.label);
  assert.ok(labels.includes('1 medium (7" to 7-7/8" long)'));
  assert.ok(labels.includes('1 cup, mashed'));
  assert.ok(labels.includes('2 tbsp'));
});

test('FNDDS dishes: a whole-item size beats "1 cup" (one burrito, not 120 g of one)', () => {
  const portions = trimPortions({ dataType: 'Survey (FNDDS)', foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 120, portionDescription: '1 cup' },
    { sequenceNumber: 2, amount: 1, gramWeight: 330, portionDescription: '1 large' },
    { sequenceNumber: 3, amount: 1, gramWeight: 110, portionDescription: '1 miniature' },
  ] });
  assert.strictEqual(portions[0].label, '1 large');
});

test('the cup rule is FNDDS-only and needs an item size (soup, salad, SR foods keep their cup)', () => {
  const soup = trimPortions({ dataType: 'Survey (FNDDS)', foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 245, portionDescription: '1 cup' },
    { sequenceNumber: 2, amount: 1, gramWeight: 245, portionDescription: 'Quantity not specified', modifier: '90000' },
  ] });
  assert.strictEqual(soup[0].label, '1 cup');
  const sr = trimPortions({ dataType: 'SR Legacy', foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 120, measureUnit: { name: 'cup' } },
    { sequenceNumber: 2, amount: 1, gramWeight: 330, modifier: 'large', measureUnit: { name: 'undetermined' } },
  ] });
  assert.strictEqual(sr[0].label, '1 cup', 'non-survey ordering is unchanged');
});

test('"Guideline amount per hot dog" rows are never the default serving', () => {
  const portions = trimPortions({ dataType: 'Survey (FNDDS)', foodPortions: [
    { sequenceNumber: 1, amount: 1, gramWeight: 64, portionDescription: 'Guideline amount per cup of french fries' },
    { sequenceNumber: 2, amount: 1, gramWeight: 64, portionDescription: 'Guideline amount per hot dog or per hamburger' },
    { sequenceNumber: 3, amount: 1, gramWeight: 255, portionDescription: '1 cup' },
  ] });
  assert.strictEqual(portions[0].label, '1 cup');
});
