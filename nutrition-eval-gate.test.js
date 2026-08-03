// Phase 4.2.11 — release-gate metric-direction contract tests.
//
// Proves the direction-aware metric gate (nutrition-evaluation/gate.js):
//   1. higher_is_better DECREASE beyond tolerance          → fails
//   2. higher_is_better INCREASE                           → passes
//   3. lower_is_better  INCREASE beyond tolerance          → fails (false-conf regression)
//   4. lower_is_better  DECREASE                           → passes (improvement)
//   5. movement WITHIN tolerance (either direction)        → passes
//   6. UNDECLARED metric direction                         → fails safe
//
// Plus: every metric the suite can emit has a declared direction, and null/new
// metric deltas are ignored.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const gate = require('./nutrition-evaluation/gate.js');
const baseline = require('./nutrition-evaluation/baseline.js');
const committed = require('./nutrition-evaluation/baseline.json');

const TOL = 1.0; // must mirror METRIC_TOL in runner.js

/* ── 1. higher_is_better decrease fails ─────────────────────────────────── */
test('higher_is_better metric decrease beyond tolerance fails the gate', () => {
  const v = gate.metricViolation('overall', -1.5, TOL);
  assert.ok(v, 'expected a violation');
  assert.strictEqual(v.direction, 'higher_is_better');
  assert.strictEqual(gate.checkMetricDeltas({ overall: -1.5 }, TOL).length, 1);
});

/* ── 2. higher_is_better increase passes ────────────────────────────────── */
test('higher_is_better metric increase passes the gate', () => {
  assert.strictEqual(gate.metricViolation('display', +2.0, TOL), null);
  assert.strictEqual(gate.checkMetricDeltas({ display: +2.0, recall_at3: 0 }, TOL).length, 0);
});

/* ── 3. lower_is_better increase fails (the false-confidence fix) ────────── */
test('lower_is_better metric increase beyond tolerance fails the gate', () => {
  const v = gate.metricViolation('falseConfidence', +1.5, TOL);
  assert.ok(v, 'a rising false-confidence rate must fail');
  assert.strictEqual(v.direction, 'lower_is_better');
  assert.match(v.message, /worsened/);
  assert.strictEqual(gate.checkMetricDeltas({ falseConfidence: +1.5 }, TOL).length, 1);
});

/* ── 4. lower_is_better decrease passes (improvement) ───────────────────── */
test('lower_is_better metric decrease is an improvement, not a regression', () => {
  assert.strictEqual(gate.metricViolation('falseConfidence', -5.0, TOL), null);
  assert.strictEqual(gate.checkMetricDeltas({ falseConfidence: -5.0 }, TOL).length, 0);
});

/* ── 5. within tolerance behaves per the existing tolerance policy ──────── */
test('movement within tolerance passes for both directions', () => {
  // exactly at ±tol is NOT beyond tol (strict inequality preserved from pre-4.2.11)
  assert.strictEqual(gate.metricViolation('overall', -1.0, TOL), null);
  assert.strictEqual(gate.metricViolation('falseConfidence', +1.0, TOL), null);
  assert.strictEqual(gate.metricViolation('overall', -0.9, TOL), null);
  assert.strictEqual(gate.metricViolation('falseConfidence', +0.9, TOL), null);
});

/* ── 6. undeclared metric direction fails safe ──────────────────────────── */
test('undeclared metric direction fails safe on material movement', () => {
  assert.strictEqual(gate.directionOf('someFutureMetric'), null);
  const v = gate.metricViolation('someFutureMetric', +2.0, TOL);
  assert.ok(v, 'material movement of an undeclared metric must fail safe');
  assert.strictEqual(v.direction, 'undeclared');
  assert.match(v.message, /no declared\s+direction/);
  // a decrease of an undeclared metric is equally unjudgeable → also fails safe
  assert.ok(gate.metricViolation('someFutureMetric', -2.0, TOL));
  // but no material movement → nothing to judge → passes
  assert.strictEqual(gate.metricViolation('someFutureMetric', +0.5, TOL), null);
});

/* ── new/absent metric deltas are ignored ───────────────────────────────── */
test('null / undefined / NaN deltas are ignored (new or absent metric)', () => {
  assert.strictEqual(gate.metricViolation('overall', null, TOL), null);
  assert.strictEqual(gate.metricViolation('overall', undefined, TOL), null);
  assert.strictEqual(gate.metricViolation('overall', NaN, TOL), null);
  assert.strictEqual(gate.checkMetricDeltas({ overall: null, display: undefined }, TOL).length, 0);
});

/* ── coverage: every emittable metric has a declared direction ──────────── */
test('every committed-baseline metric has a declared direction', () => {
  for (const k of Object.keys(committed.metrics)) {
    assert.notStrictEqual(gate.directionOf(k), null, `metric "${k}" is missing a direction in gate.js`);
  }
});

test('flattenMetrics output keys all have declared directions', () => {
  // Build a full nested metrics object shaped like metrics.compute() output,
  // flatten it, and confirm every produced key is declared.
  const nested = {
    overall: { pct: 100 }, top1Accuracy: { pct: 100 }, acceptableCandidateAccuracy: { pct: 100 },
    retrievalRecall: { '@1': { pct: 95.8 }, '@3': { pct: 100 }, '@5': { pct: 100 }, '@10': { pct: 100 } },
    clarification: { precision: { pct: 100 }, recall: { pct: 100 } },
    falseConfidenceRate: { pct: 0 },
    portionAccuracy: { pct: 100 },
    mealAccuracy: { case: { pct: 100 }, item: { pct: 100 } },
    parsingAccuracy: { case: { pct: 100 }, field: { pct: 100 } },
    displayAccuracy: { pct: 100 },
  };
  const flat = baseline.flattenMetrics(nested);
  for (const k of Object.keys(flat)) {
    assert.notStrictEqual(gate.directionOf(k), null, `flattened metric "${k}" is missing a direction in gate.js`);
  }
});

/* ── false-confidence direction is explicitly lower_is_better ────────────── */
test('false-confidence is the lower_is_better metric; accuracy metrics are higher_is_better', () => {
  assert.strictEqual(gate.directionOf('falseConfidence'), gate.LOWER);
  for (const k of ['overall', 'top1', 'acceptable', 'recall@1', 'recall@3',
    'clarificationPrecision', 'clarificationRecall', 'display', 'portion']) {
    assert.strictEqual(gate.directionOf(k), gate.HIGHER, `${k} should be higher_is_better`);
  }
});
