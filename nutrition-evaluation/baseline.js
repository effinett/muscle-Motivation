// Phase 4.2.9 — baseline snapshot + comparison.
//
// The baseline is a committed, versioned snapshot of an evaluation run against a
// known production SHA. Future runs compare against it to surface metric
// movement and per-case outcome changes. The baseline is NEVER silently
// overwritten — updating requires `node nutrition-evaluation/runner.js --update-baseline`
// (documented in the README).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASELINE_PATH = path.join(__dirname, 'baseline.json');

// Reduce a full run to the committed baseline shape (small + diff-friendly).
function toBaseline(run) {
  const cases = {};
  for (const r of run.records) cases[r.id] = { pass: !!r.pass, stage: r.stage || null, category: r.effectiveCategory };
  return {
    schemaVersion: run.schemaVersion,
    caseSetVersion: run.caseSetVersion,
    sha: run.sha,
    generatedAt: run.generatedAt,
    totalCases: run.records.length,
    categoryCounts: countByCategory(run.records),
    metrics: flattenMetrics(run.metrics),
    cases,
  };
}

function countByCategory(records) {
  const out = {};
  for (const r of records) out[r.effectiveCategory] = (out[r.effectiveCategory] || 0) + 1;
  return out;
}

// Flatten the nested metrics object into {name: pct} for compact baselines.
function flattenMetrics(m) {
  const f = {};
  m = m || {};
  const put = (k, v) => { if (v && typeof v.pct === 'number') f[k] = v.pct; };
  put('overall', m.overall);
  put('top1', m.top1Accuracy);
  put('acceptable', m.acceptableCandidateAccuracy);
  for (const k of Object.keys(m.retrievalRecall || {})) put('recall' + k, m.retrievalRecall[k]);
  if (m.clarification) { put('clarificationPrecision', m.clarification.precision); put('clarificationRecall', m.clarification.recall); }
  put('falseConfidence', m.falseConfidenceRate);
  put('portion', m.portionAccuracy);
  if (m.mealAccuracy) { put('mealCase', m.mealAccuracy.case); put('mealItem', m.mealAccuracy.item); }
  if (m.parsingAccuracy) { put('parsingCase', m.parsingAccuracy.case); put('parsingField', m.parsingAccuracy.field); }
  put('display', m.displayAccuracy);
  return f;
}

function load() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}

function save(baseline) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
}

// Compare a fresh run against a stored baseline.
function compare(baseline, run) {
  if (!baseline) return { firstRun: true, added: [], removed: [], changed: [], metricDeltas: {}, regressions: [] };
  const cur = toBaseline(run);
  const added = [];
  const removed = [];
  const changed = [];
  const regressions = []; // regression-category cases that were passing and now fail

  const baseIds = new Set(Object.keys(baseline.cases || {}));
  const curIds = new Set(Object.keys(cur.cases));
  for (const id of curIds) if (!baseIds.has(id)) added.push(id);
  for (const id of baseIds) if (!curIds.has(id)) removed.push(id);
  for (const id of curIds) {
    if (!baseIds.has(id)) continue;
    const b = baseline.cases[id];
    const c = cur.cases[id];
    if (b.pass !== c.pass || b.stage !== c.stage) {
      changed.push({ id, from: { pass: b.pass, stage: b.stage }, to: { pass: c.pass, stage: c.stage } });
      if (b.pass && !c.pass) {
        const rec = run.records.find((r) => r.id === id);
        if (rec && (rec.category === 'regression')) regressions.push(id);
      }
    }
  }

  const metricDeltas = {};
  for (const k of Object.keys(cur.metrics)) {
    const before = baseline.metrics ? baseline.metrics[k] : undefined;
    if (typeof before === 'number') metricDeltas[k] = +(cur.metrics[k] - before).toFixed(1);
    else metricDeltas[k] = null; // new metric
  }

  return { firstRun: false, added: added.sort(), removed: removed.sort(), changed, metricDeltas, regressions };
}

module.exports = { BASELINE_PATH, toBaseline, flattenMetrics, countByCategory, load, save, compare };
