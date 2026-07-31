// Phase 4.2.9 — nutrition evaluation runner.
//
//   npm run eval:nutrition                 # report, apply release gate, write artifacts
//   node nutrition-evaluation/runner.js --no-gate      # always exit 0
//   node nutrition-evaluation/runner.js --update-baseline   # record a NEW baseline
//   node nutrition-evaluation/runner.js --prod-changed      # mark productionLogicChanged
//   node nutrition-evaluation/runner.js --json         # print machine JSON to stdout
//
// Deterministic + offline: pure production seams over canned pools. No network,
// no DB, no keys, no writes to production data. Writes only the run artifacts
// under reports/nutrition-evaluation/ and (only on --update-baseline) baseline.json.
//
// Release gate (default, unless --no-gate / --update-baseline):
//   • fixture validation must pass                                 → exit 2
//   • no case may crash                                            → exit 2
//   • no NON-informational regression-category case may fail       → exit 1
//   • no committed metric may regress by more than METRIC_TOL pct  → exit 1
// Newly-added, non-regression failing cases are INFORMATIONAL until reviewed.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const schema = require('./schema.js');
const engine = require('./engine.js');
const scoring = require('./scoring.js');
const diagnostics = require('./diagnostics.js');
const metricsMod = require('./metrics.js');
const report = require('./report.js');
const baselineMod = require('./baseline.js');
const { load: loadFixtures, CASE_SET_VERSION } = require('./fixtures/index.js');

const METRIC_TOL = 1.0; // pct a committed metric may drop before the gate trips
// Report output dir — overridable (NUTRITION_EVAL_REPORT_DIR) so tests write to
// an isolated temp dir and never race the shared artifact.
const REPORT_DIR = process.env.NUTRITION_EVAL_REPORT_DIR
  || path.join(__dirname, '..', 'reports', 'nutrition-evaluation');

function git(args, dflt) {
  try { return cp.execSync('git ' + args, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return dflt; }
}

async function run() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const noGate = flag('--no-gate');
  const updateBaseline = flag('--update-baseline');
  const jsonOut = flag('--json');
  const prodChanged = flag('--prod-changed');

  const cases = loadFixtures();

  // 1) validate — fixture validity is always a hard gate.
  const errs = schema.validateSuite(cases);
  if (errs.length) {
    console.error('FIXTURE VALIDATION FAILED:');
    for (const e of errs.slice(0, 50)) console.error('  ' + e);
    if (errs.length > 50) console.error(`  … and ${errs.length - 50} more`);
    process.exit(2);
  }

  // 2) score every case.
  const records = [];
  for (const c of cases) {
    const effectiveCategory = c.category === 'regression' ? c.via : c.category;
    let score;
    try {
      score = await scoring.scoreCase(c, engine);
    } catch (e) {
      console.error(`CASE CRASHED: ${c.id} — ${e.message}`);
      if (!noGate) process.exit(2);
      score = { pass: false, stage: 'fixture-error', detail: 'threw: ' + e.message, signals: {} };
    }
    const stage = diagnostics.classify(c, score);
    records.push({
      id: c.id, category: c.category, effectiveCategory,
      pass: score.pass, stage, detail: score.detail, signals: score.signals || {},
      informational: !!c.informational, known_fail: !!c.known_fail, notes: c.notes || '',
    });
  }

  // 3) metrics + run object.
  const metrics = metricsMod.compute(records);
  const run = {
    schemaVersion: schema.SCHEMA_VERSION,
    caseSetVersion: CASE_SET_VERSION,
    generatedAt: new Date().toISOString(),
    sha: git('rev-parse HEAD', 'unknown'),
    branch: git('rev-parse --abbrev-ref HEAD', 'unknown'),
    node: process.version,
    productionLogicChanged: prodChanged,
    records, metrics,
    categoryCounts: baselineMod.countByCategory(records),
    legacyBench: null,
  };

  // 4) baseline compare.
  const baseline = baselineMod.load();
  const cmp = baselineMod.compare(baseline, run);

  // 5) write artifacts (never production data).
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonArtifact = report.toJSON(run, cmp);
  fs.writeFileSync(path.join(REPORT_DIR, 'latest.json'), JSON.stringify(jsonArtifact, null, 2) + '\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'latest.md'), report.toMarkdown(run, cmp));

  if (jsonOut) { console.log(JSON.stringify(jsonArtifact, null, 2)); }

  // 6) terminal summary.
  const S = metricsMod.scored(records);
  const passed = S.filter((r) => r.pass).length;
  console.log('\nnutrition evaluation —', run.generatedAt.slice(0, 10), '@', run.sha.slice(0, 8));
  console.log(`cases: ${records.length} | scored: ${S.length} | pass: ${passed} | fail: ${S.length - passed}` +
    ` | informational: ${records.filter((r) => r.informational).length} | known_fail: ${records.filter((r) => r.known_fail).length}`);
  console.log(`overall ${report.pctStr(metrics.overall)} | top1 ${report.pctStr(metrics.top1Accuracy)}` +
    ` | acceptable ${report.pctStr(metrics.acceptableCandidateAccuracy)} | recall@3 ${report.pctStr(metrics.retrievalRecall['@3'])}` +
    ` | false-confidence ${report.pctStr(metrics.falseConfidenceRate)}`);
  console.log(`portion ${report.pctStr(metrics.portionAccuracy)} | meal(item) ${report.pctStr(metrics.mealAccuracy.item)}` +
    ` | parsing(field) ${report.pctStr(metrics.parsingAccuracy.field)} | display ${report.pctStr(metrics.displayAccuracy)}` +
    ` | clarification P/R ${report.pctStr(metrics.clarification.precision)}/${report.pctStr(metrics.clarification.recall)}`);
  const stageCounts = diagnostics.summarize(records);
  const ordered = diagnostics.orderedStages(stageCounts);
  if (ordered.length) console.log('failures by stage: ' + ordered.map((s) => `${s} ${stageCounts[s]}`).join(' · '));
  for (const r of records.filter((r) => r.known_fail && r.pass)) {
    console.log(`◆ NOW PASSING (known_fail): ${r.id} — promote it`);
  }
  console.log(`report → ${path.relative(process.cwd(), path.join(REPORT_DIR, 'latest.md'))}`);

  // 7) update baseline (explicit only).
  if (updateBaseline) {
    baselineMod.save(baselineMod.toBaseline(run));
    console.log('baseline UPDATED →', path.relative(process.cwd(), baselineMod.BASELINE_PATH));
    process.exit(0);
  }

  // 8) gate.
  if (noGate) process.exit(0);
  let gateFail = false;
  const failingRegressions = records.filter((r) => r.category === 'regression' && !r.pass && !r.informational && !r.known_fail);
  if (failingRegressions.length) {
    gateFail = true;
    console.error(`GATE: ${failingRegressions.length} regression case(s) failing: ${failingRegressions.map((r) => r.id).join(', ')}`);
  }
  if (!cmp.firstRun) {
    for (const k of Object.keys(cmp.metricDeltas)) {
      const d = cmp.metricDeltas[k];
      if (typeof d === 'number' && d < -METRIC_TOL) {
        gateFail = true;
        console.error(`GATE: metric "${k}" regressed ${d} pct (tolerance -${METRIC_TOL})`);
      }
    }
    if (cmp.regressions.length) {
      gateFail = true;
      console.error(`GATE: regression cases changed pass→fail vs baseline: ${cmp.regressions.join(', ')}`);
    }
  }
  process.exit(gateFail ? 1 : 0);
}

run().catch((e) => { console.error('runner crashed:', e); process.exit(2); });
