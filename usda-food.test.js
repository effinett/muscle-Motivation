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
