// Phase 4.2.9 — tests for report generation + end-to-end runner behavior.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const report = require('./nutrition-evaluation/report.js');

function fakeRun() {
  const metrics = require('./nutrition-evaluation/metrics.js');
  return {
    schemaVersion: 's', caseSetVersion: 'v', generatedAt: '2026-07-31T00:00:00.000Z',
    sha: 'abc1234', branch: 'main', node: process.version, productionLogicChanged: false,
    legacyBench: '121/121',
    categoryCounts: { ranking: 1, display: 1 },
    metrics: metrics.compute([
      { id: 'a', effectiveCategory: 'ranking', pass: true, signals: { top1Applicable: true, top1: true, topAcceptable: true, recall: { '@1': true, '@3': true, '@5': true, '@10': true } } },
      { id: 'b', effectiveCategory: 'display', pass: false, stage: 'display', detail: 'name mismatch', signals: {} },
    ]),
    records: [
      { id: 'a', effectiveCategory: 'ranking', pass: true, stage: null, detail: '', signals: {} },
      { id: 'b', effectiveCategory: 'display', pass: false, stage: 'display', detail: 'name mismatch', signals: {}, informational: false, known_fail: false },
    ],
  };
}

test('toMarkdown includes headline metrics and a failures section', () => {
  const md = report.toMarkdown(fakeRun(), { firstRun: true });
  assert.match(md, /# Nutrition Evaluation Report/);
  assert.match(md, /False-confidence rate/);
  assert.match(md, /Scored failures \(1\)/);
  assert.match(md, /`b`.*display.*name mismatch/);
});

test('toJSON exposes failures, diagnostic stages, and baseline comparison', () => {
  const json = report.toJSON(fakeRun(), { firstRun: false, added: ['x'], removed: [], changed: [], metricDeltas: {}, regressions: [] });
  assert.strictEqual(json.totalCases, 2);
  assert.strictEqual(json.failures.length, 1);
  assert.strictEqual(json.failures[0].id, 'b');
  assert.strictEqual(json.diagnosticStages.display, 1);
  assert.deepStrictEqual(json.baselineComparison.added, ['x']);
});

test('runner executes end-to-end, validates, and writes a report (deterministic, offline)', () => {
  const out = cp.execSync('node ' + path.join(__dirname, 'nutrition-evaluation', 'runner.js') + ' --no-gate', {
    cwd: __dirname, encoding: 'utf8',
    env: Object.assign({}, process.env, { NUTRITION_EVAL_REPORT_DIR: path.join(require('node:os').tmpdir(), 'nut-eval-' + process.pid + '-a') }),
  });
  assert.match(out, /nutrition evaluation/);
  assert.match(out, /overall \d/);
  assert.match(out, /report →/);
});

test('runner run is deterministic across two invocations (same metrics line)', () => {
  const run = () => cp.execSync('node ' + path.join(__dirname, 'nutrition-evaluation', 'runner.js') + ' --no-gate', {
    cwd: __dirname, encoding: 'utf8',
    env: Object.assign({}, process.env, { NUTRITION_EVAL_REPORT_DIR: path.join(require('node:os').tmpdir(), 'nut-eval-' + process.pid + '-b') }),
  }).split('\n').find((l) => l.startsWith('overall '));
  assert.strictEqual(run(), run());
});
