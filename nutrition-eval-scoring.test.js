// Phase 4.2.9 — tests for scoring, diagnostics, metrics, and baseline compare.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('./nutrition-evaluation/engine.js');
const scoring = require('./nutrition-evaluation/scoring.js');
const diagnostics = require('./nutrition-evaluation/diagnostics.js');
const metrics = require('./nutrition-evaluation/metrics.js');
const baseline = require('./nutrition-evaluation/baseline.js');

/* ── candidate helpers ─────────────────────────────────────────────────── */

test('acceptable matches by id, preferred, and name regex', () => {
  const cand = { fdcId: 42, description: 'Chicken, breast' };
  assert.ok(scoring.acceptable(cand, { acceptableCandidateIds: [42] }));
  assert.ok(scoring.acceptable(cand, { preferredCandidateId: 42 }));
  assert.ok(scoring.acceptable(cand, { acceptableNameRegex: 'chicken' }));
  assert.ok(!scoring.acceptable(cand, { acceptableCandidateIds: [7] }));
});

test('within honors numeric tolerance', () => {
  assert.ok(scoring.within(28, 30, 5));
  assert.ok(!scoring.within(28, 40, 5));
});

/* ── ranking scorer distinguishes retrieval vs ranking ─────────────────── */

test('ranking scorer classifies a not-retrieved acceptable as retrieval, not ranking', () => {
  // pool "chicken breast" has no turkey → acceptable turkey is never retrieved.
  const c = { id: 't', category: 'ranking', input: { query: 'chicken breast' }, expected: { acceptableNameRegex: 'turkey' } };
  const r = scoring.scoreRankingLike(c, engine);
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.stage, 'retrieval');
});

test('ranking scorer passes when the preferred candidate is first', async () => {
  const c = { id: 't2', category: 'ranking', input: { query: 'mayonnaise' }, expected: { preferredCandidateId: 730010, topNotRegex: 'bean' } };
  const r = scoring.scoreRankingLike(c, engine);
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.signals.top1, true);
});

/* ── preferred vs acceptable scoring ───────────────────────────────────── */

test('a non-preferred but acceptable top counts acceptable, not top1', () => {
  // preferred is a wrong id, but the name-regex accepts the real top.
  const c = { id: 't3', category: 'ranking', input: { query: 'mayonnaise' },
    expected: { preferredCandidateId: 999999, acceptableNameRegex: 'mayonnaise' } };
  const r = scoring.scoreRankingLike(c, engine);
  assert.strictEqual(r.signals.topAcceptable, true);
  assert.strictEqual(r.signals.top1, false);
});

/* ── portion tolerance ─────────────────────────────────────────────────── */

test('portion vague scorer applies estimatedAmount tolerance', async () => {
  const c = { id: 'p', category: 'portion', input: { unit: 'handful', food: { description: 'Nuts, almonds' } },
    expected: { portion: { detected: true, estimatedUnit: 'g', estimatedAmount: 30 } }, tolerances: { estimatedAmount: 8 } };
  const r = await scoring.scorePortion(c, engine);
  assert.strictEqual(r.pass, true);
});

/* ── meal item matching ────────────────────────────────────────────────── */

test('meal scorer checks per-item beverage classification', () => {
  const c = { id: 'm', category: 'meal', input: { text: 'coffee with milk', items: [{ query: 'coffee' }, { query: 'milk' }] },
    expected: { meal: { beverageIndexes: [0], notBeverageIndexes: [1] } } };
  const r = scoring.scoreMeal(c, engine);
  assert.strictEqual(r.pass, true);
  assert.ok(r.signals.itemChecks >= 2);
});

/* ── confidence + false-confidence ─────────────────────────────────────── */

test('confidence scorer flags a confident-but-wrong resolution', () => {
  const c = { id: 'cf', category: 'confidence', input: { query: 'coffee' },
    expected: { confidence: { disposition: 'choose_candidate', wrongIfConfident: true } } };
  const r = scoring.scoreConfidence(c, engine);
  assert.strictEqual(r.signals.isConfident, true);
  assert.strictEqual(r.signals.falseConfidence, true);
});

/* ── diagnostics ───────────────────────────────────────────────────────── */

test('classify honors an author-triaged terminal stage', () => {
  const stage = diagnostics.classify({ diagnosticStage: 'external-data-ambiguity', informational: true }, { pass: false, stage: 'retrieval' });
  assert.strictEqual(stage, 'external-data-ambiguity');
});

test('classify returns null on pass and scorer stage otherwise', () => {
  assert.strictEqual(diagnostics.classify({}, { pass: true, stage: null }), null);
  assert.strictEqual(diagnostics.classify({}, { pass: false, stage: 'ranking' }), 'ranking');
});

/* ── metrics ───────────────────────────────────────────────────────────── */

test('metrics compute top1 only over preferred cases and false-confidence over confident cases', () => {
  const records = [
    { id: 'a', effectiveCategory: 'ranking', pass: true, signals: { top1Applicable: true, top1: true, topAcceptable: true } },
    { id: 'b', effectiveCategory: 'ranking', pass: false, signals: { top1Applicable: true, top1: false, topAcceptable: false } },
    { id: 'c', effectiveCategory: 'ranking', pass: true, signals: { topAcceptable: true } }, // no top1 (not applicable)
    { id: 'd', effectiveCategory: 'confidence', pass: false, signals: { isConfident: true, falseConfidence: true } },
    { id: 'e', effectiveCategory: 'confidence', pass: true, signals: { isConfident: true, falseConfidence: false } },
  ];
  const m = metrics.compute(records);
  assert.strictEqual(m.top1Accuracy.d, 2);          // only a,b are top1-applicable
  assert.strictEqual(m.top1Accuracy.n, 1);
  assert.strictEqual(m.acceptableCandidateAccuracy.d, 3); // a,b,c have topAcceptable signal
  assert.strictEqual(m.falseConfidenceRate.n, 1);
  assert.strictEqual(m.falseConfidenceRate.d, 2);
});

test('metrics exclude informational and known_fail from scored pass rate', () => {
  const records = [
    { id: 'a', effectiveCategory: 'ranking', pass: true, signals: {} },
    { id: 'b', effectiveCategory: 'ranking', pass: false, informational: true, signals: {} },
    { id: 'c', effectiveCategory: 'ranking', pass: false, known_fail: true, signals: {} },
  ];
  const m = metrics.compute(records);
  assert.strictEqual(m.overall.n, 1);
  assert.strictEqual(m.overall.d, 1);
});

/* ── baseline comparison ───────────────────────────────────────────────── */

test('baseline compare detects added, removed, changed, and regression flips', () => {
  const base = {
    metrics: { overall: 90 },
    cases: {
      keep: { pass: true, stage: null, category: 'ranking' },
      regressed: { pass: true, stage: null, category: 'regression' },
      gone: { pass: true, stage: null, category: 'display' },
    },
  };
  const run = {
    schemaVersion: 's', caseSetVersion: 'v', sha: 'x', generatedAt: 't',
    metrics: { overall: metrics.rate(8, 10) },
    records: [
      { id: 'keep', effectiveCategory: 'ranking', category: 'ranking', pass: true, stage: null },
      { id: 'regressed', effectiveCategory: 'ranking', category: 'regression', pass: false, stage: 'ranking' },
      { id: 'added', effectiveCategory: 'display', category: 'display', pass: true, stage: null },
    ],
  };
  const cmp = baseline.compare(base, run);
  assert.deepStrictEqual(cmp.added, ['added']);
  assert.deepStrictEqual(cmp.removed, ['gone']);
  assert.deepStrictEqual(cmp.regressions, ['regressed']);
  assert.ok(cmp.changed.some((ch) => ch.id === 'regressed'));
  assert.strictEqual(cmp.metricDeltas.overall, -10); // 80 - 90
});

test('baseline compare treats a missing baseline as firstRun', () => {
  const cmp = baseline.compare(null, { records: [], metrics: {}, schemaVersion: '', caseSetVersion: '', sha: '', generatedAt: '' });
  assert.strictEqual(cmp.firstRun, true);
});
