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

/* ── Phase 4.2.10b: correction-memory scenarios (evidence, dynamic pool ids) ──
 * The eval engine wires nmCorrectionSignal through the SAME options.signals seam
 * production uses. These pin the conservative correction model against Path C. */
const { POOLS } = require('./nutrition-evaluation/pools.js');
function keyOf(pool, re) { const c = POOLS[pool].find((x) => re.test(x.description)); return c ? ('usda:' + c.fdcId) : null; }
function topAfter(query, pool, corrections) {
  const r = engine.rankedPool({ input: { text: query, query }, pool, corrections });
  return r[0] ? r[0].description : null;
}
function dispAfter(query, pool, corrections) {
  return engine.assessConfidence({ input: { text: query, query }, pool, corrections }).disposition;
}

test('correction: a relevant correction resolves a near-tied case', () => {
  const before = topAfter('soup', 'p10b-soup', null);
  const corr = [{ query: 'soup', corrected_key: keyOf('p10b-soup', /vegetable/) }];
  const after = topAfter('soup', 'p10b-soup', corr);
  assert.match(after, /vegetable/i, 'the corrected soup floats to the top');
  assert.notStrictEqual(after, before);
});

test('correction: explicit "unsweetened" overrides a prior sweet-tea correction', () => {
  const corr = [{ query: 'tea', corrected_key: keyOf('p10b-tea', /iced, sweetened/) }];
  assert.match(topAfter('unsweetened tea', 'p10b-tea', corr), /unsweetened/i,
    'the explicit query wins over the older correction');
});

test('correction: explicit "coffee with milk" is not hijacked by a prior black-coffee correction', () => {
  const corr = [{ query: 'coffee', corrected_key: keyOf('p10b-coffee', /brewed, prepared/) }];
  assert.match(topAfter('coffee with milk', 'p10b-coffee', corr), /milk/i,
    'the explicit modifier query keeps its own resolution');
});

test('correction: a prior branded selection does not force that brand on an explicit generic query', () => {
  // correcting bare "yogurt" to a branded item must not override "plain yogurt".
  const corr = [{ query: 'yogurt', corrected_key: keyOf('p10b-yogurt', /Yoplait|Strawberry/) }];
  const top = topAfter('plain yogurt', 'p10b-yogurt', corr);
  assert.doesNotMatch(top, /Yoplait|Strawberry/i, 'explicit "plain" is not overridden by a branded correction');
});

test('correction: a bounded correction cannot flip a decisively-dominant canonical', () => {
  // correcting "coffee" to the branded bottled drink cannot beat brewed's ~2000-pt lead.
  const corr = [{ query: 'coffee', corrected_key: keyOf('p10b-coffee', /STARBUCKS/) }];
  assert.match(topAfter('coffee', 'p10b-coffee', corr), /brewed/i, 'conservative: identity is not fabricated');
});

test('correction: a broad query still clarifies when one correction is insufficient', () => {
  // a single correction on bare "protein" does not collapse the genuine family ambiguity.
  const corr = [{ query: 'protein', corrected_key: keyOf('p10b-protein', /bar/) }];
  assert.strictEqual(dispAfter('protein', 'p10b-protein', corr), 'choose_candidate');
});

/* ── Phase 4.2.10b: paraphrase stability (production-shaped normalized queries) ─
 * The AI parser strips leading/trailing QUANTITY words before resolution, so
 * equivalent phrasings reduce to the same normalized query. `normQ` models that
 * deterministic reduction; we assert the raw paraphrases converge AND share a
 * disposition. Word-ORDER variants ("coffee black", "milk tea") are a separate
 * ranking-order sensitivity documented in the report — the parser does not
 * reorder tokens, so they are NOT confidence paraphrases and are excluded here. */
function normQ(s) {
  return String(s)
    .replace(/^(a|one) (bowl|scoop|cup|glass|piece)( of)?\s+/i, '')
    .replace(/^(a|an|one|some)\s+/i, '')
    .replace(/\s+(one|a) (bowl|scoop|cup|glass|piece)$/i, '')
    .trim();
}
test('paraphrase: quantity-word variants normalize to one query with a stable disposition', () => {
  const groups = [
    { pool: 'p10b-coffee', raw: ['coffee', 'a coffee', 'one coffee'] },
    { pool: 'p10b-soup', raw: ['chicken soup', 'a bowl of chicken soup', 'chicken soup one bowl'] },
    { pool: 'p10b-protein', raw: ['protein powder', 'one scoop protein powder', 'a scoop of protein powder'] },
  ];
  for (const g of groups) {
    const normed = g.raw.map(normQ);
    assert.ok(normed.every((q) => q === normed[0]),
      `normalization diverged: ${JSON.stringify(g.raw)} → ${JSON.stringify(normed)}`);
    const disps = normed.map((q) => dispAfter(q, g.pool, null));
    assert.ok(disps.every((d) => d === disps[0]),
      `normalized paraphrases ${JSON.stringify(normed)} diverged: ${JSON.stringify(disps)}`);
  }
});
