// Phase 4.2.11 — release-gate metric-direction contract.
//
// The metric-delta gate needs to know, per metric, which direction is a
// regression. Most nutrition metrics are pass/accuracy rates where a DROP is
// bad (higher_is_better). false-confidence is the exception: it is a rate of
// "confidently resolved but wrong", so an INCREASE is the regression
// (lower_is_better). Before Phase 4.2.11 the gate assumed every metric was
// higher_is_better (`delta < -tol`), which silently missed a worsening
// false-confidence rate.
//
// This module makes direction EXPLICIT and generalizable. Adding a future
// lower-is-better metric is a one-line entry here, not a code change in the
// runner. Direction is looked up by exact metric name — never guessed from the
// name string.
//
// Pure + dependency-free (browser-irrelevant, but same guarded-exports shape as
// the rest of the suite so tests can require it).

'use strict';

const HIGHER = 'higher_is_better';
const LOWER = 'lower_is_better';

// Keys MUST match the flattened metric names produced by baseline.flattenMetrics
// (overall, top1, acceptable, recall@1/@3/@5/@10, clarificationPrecision,
// clarificationRecall, falseConfidence, portion, mealCase, mealItem,
// parsingCase, parsingField, display). A dedicated test pins that every metric
// the suite can emit has a declared direction here.
const METRIC_DIRECTIONS = {
  overall: HIGHER,
  top1: HIGHER,
  acceptable: HIGHER,
  'recall@1': HIGHER,
  'recall@3': HIGHER,
  'recall@5': HIGHER,
  'recall@10': HIGHER,
  clarificationPrecision: HIGHER,
  clarificationRecall: HIGHER,
  falseConfidence: LOWER,
  portion: HIGHER,
  mealCase: HIGHER,
  mealItem: HIGHER,
  parsingCase: HIGHER,
  parsingField: HIGHER,
  display: HIGHER,
};

// Declared direction for a metric, or null if undeclared.
function directionOf(name) {
  return Object.prototype.hasOwnProperty.call(METRIC_DIRECTIONS, name)
    ? METRIC_DIRECTIONS[name]
    : null;
}

// Decide whether a single metric's movement is a gate-failing regression.
//   delta = current − baseline, in percentage points (as baseline.compare emits).
//   tol   = the accepted movement before the gate trips (pct points).
// Returns a violation object { metric, delta, direction, tol, message } or null.
//
// Semantics:
//   • null/undefined/NaN delta → new or absent metric, nothing to compare → null.
//   • higher_is_better → violation when delta < −tol (a real drop).
//   • lower_is_better  → violation when delta >  tol (a real rise = worse).
//   • UNDECLARED direction → FAIL-SAFE: any movement beyond tol (either way) is a
//     violation asking the author to declare the metric's direction. Movement
//     within tolerance is ignored so undeclared-but-static metrics never nag.
function metricViolation(name, delta, tol) {
  if (delta === null || delta === undefined || typeof delta !== 'number' || Number.isNaN(delta)) {
    return null;
  }
  const direction = directionOf(name);
  if (direction === null) {
    if (Math.abs(delta) > tol) {
      return {
        metric: name, delta, direction: 'undeclared', tol,
        message: `metric "${name}" moved ${delta > 0 ? '+' : ''}${delta} pct but has no declared ` +
          `direction — declare it in nutrition-evaluation/gate.js METRIC_DIRECTIONS`,
      };
    }
    return null;
  }
  if (direction === HIGHER && delta < -tol) {
    return {
      metric: name, delta, direction, tol,
      message: `metric "${name}" regressed ${delta} pct (higher_is_better, tolerance -${tol})`,
    };
  }
  if (direction === LOWER && delta > tol) {
    return {
      metric: name, delta, direction, tol,
      message: `metric "${name}" worsened +${delta} pct (lower_is_better, tolerance +${tol})`,
    };
  }
  return null;
}

// Evaluate every metric delta and return the list of violations (empty = clean).
function checkMetricDeltas(metricDeltas, tol) {
  const violations = [];
  for (const k of Object.keys(metricDeltas || {})) {
    const v = metricViolation(k, metricDeltas[k], tol);
    if (v) violations.push(v);
  }
  return violations;
}

module.exports = {
  HIGHER, LOWER, METRIC_DIRECTIONS,
  directionOf, metricViolation, checkMetricDeltas,
};
