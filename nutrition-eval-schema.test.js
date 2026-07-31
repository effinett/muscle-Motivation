// Phase 4.2.9 — tests for the nutrition-evaluation SCHEMA + fixture suite.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const schema = require('./nutrition-evaluation/schema.js');
const { load } = require('./nutrition-evaluation/fixtures/index.js');

test('the shipped fixture suite validates with zero errors', () => {
  const errs = schema.validateSuite(load());
  assert.deepStrictEqual(errs, [], errs.join('\n'));
});

test('every case id is globally unique', () => {
  const ids = load().map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('validateCase rejects an unknown category', () => {
  const errs = schema.validateCase({ id: 'x', category: 'bogus', input: {} }, 0);
  assert.ok(errs.some((e) => /unknown category/.test(e)));
});

test('validateCase rejects a non-slug id', () => {
  const errs = schema.validateCase({ id: 'has spaces!', category: 'display', input: { food: {} }, expected: { display: {} } }, 0);
  assert.ok(errs.some((e) => /stable slug/.test(e)));
});

test('validateSuite flags duplicate ids', () => {
  const dup = [
    { id: 'dup', category: 'display', input: { food: {} }, expected: { display: { name: 'a' } } },
    { id: 'dup', category: 'display', input: { food: {} }, expected: { display: { name: 'b' } } },
  ];
  assert.ok(schema.validateSuite(dup).some((e) => /duplicate id/.test(e)));
});

test('regression case must declare via + phase', () => {
  const errs = schema.validateCase({ id: 'r', category: 'regression', input: { query: 'x' }, expected: {} }, 0);
  assert.ok(errs.some((e) => /via ∈/.test(e)));
  assert.ok(errs.some((e) => /needs a phase/.test(e)));
});

test('ranking case requires a candidate expectation', () => {
  const errs = schema.validateCase({ id: 'r', category: 'ranking', input: { query: 'x' }, expected: {} }, 0);
  assert.ok(errs.some((e) => /ranking expects/.test(e)));
});

test('meal case requires text + meal expectation', () => {
  const errs = schema.validateCase({ id: 'm', category: 'meal', input: {}, expected: {} }, 0);
  assert.ok(errs.some((e) => /meal case/.test(e)));
});

test('CATEGORIES and DIAGNOSTIC_STAGES are stable non-empty lists', () => {
  assert.ok(schema.CATEGORIES.includes('ranking'));
  assert.ok(schema.DIAGNOSTIC_STAGES[0] === 'fixture-error');
  assert.ok(schema.DIAGNOSTIC_STAGES.includes('production-defect'));
});
