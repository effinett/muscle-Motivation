// Phase 4.2.9 — report generation (human-readable + machine-readable).
//
// Pure string/object builders — the runner owns file writes and stdout. Kept
// deterministic (stable ordering, no wall-clock inside the body except the
// provided timestamp) so a report diff reflects real changes, not noise.

'use strict';

const diagnostics = require('./diagnostics.js');

function pctStr(m) { return m && m.pct != null ? `${m.pct}% (${m.n}/${m.d})` : 'n/a'; }

// Machine-readable artifact (the canonical JSON).
function toJSON(run, cmp) {
  return {
    schemaVersion: run.schemaVersion,
    caseSetVersion: run.caseSetVersion,
    generatedAt: run.generatedAt,
    sha: run.sha,
    branch: run.branch,
    node: run.node,
    productionLogicChanged: run.productionLogicChanged,
    totalCases: run.records.length,
    categoryCounts: run.categoryCounts,
    metrics: run.metrics,
    diagnosticStages: diagnostics.summarize(run.records),
    failures: run.records.filter((r) => !r.pass && !r.known_fail && !r.informational)
      .map((r) => ({ id: r.id, category: r.effectiveCategory, stage: r.stage, detail: r.detail })),
    informational: run.records.filter((r) => r.informational).map((r) => ({ id: r.id, stage: r.stage, detail: r.detail })),
    knownFailNowPassing: run.records.filter((r) => r.known_fail && r.pass).map((r) => r.id),
    baselineComparison: cmp || null,
  };
}

// Human-readable report (markdown).
function toMarkdown(run, cmp) {
  const m = run.metrics;
  const L = [];
  L.push('# Nutrition Evaluation Report');
  L.push('');
  L.push(`- **Date:** ${run.generatedAt}`);
  L.push(`- **SHA:** ${run.sha}  ·  **Branch:** ${run.branch}`);
  L.push(`- **Node:** ${run.node}  ·  **Schema:** ${run.schemaVersion}  ·  **Case-set:** ${run.caseSetVersion}`);
  L.push(`- **Production logic changed:** ${run.productionLogicChanged ? 'YES' : 'no'}`);
  L.push(`- **Existing food benchmark:** ${run.legacyBench || 'not run'}`);
  L.push('');
  L.push(`**Total cases:** ${run.records.length}`);
  L.push('');
  L.push('## Headline metrics');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Overall pass rate | ${pctStr(m.overall)} |`);
  L.push(`| Top-1 accuracy | ${pctStr(m.top1Accuracy)} |`);
  L.push(`| Acceptable-candidate accuracy | ${pctStr(m.acceptableCandidateAccuracy)} |`);
  L.push(`| Retrieval recall@1 / @3 / @5 / @10 | ${pctStr(m.retrievalRecall['@1'])} / ${pctStr(m.retrievalRecall['@3'])} / ${pctStr(m.retrievalRecall['@5'])} / ${pctStr(m.retrievalRecall['@10'])} |`);
  L.push(`| Clarification precision / recall | ${pctStr(m.clarification.precision)} / ${pctStr(m.clarification.recall)} |`);
  L.push(`| **False-confidence rate** | **${pctStr(m.falseConfidenceRate)}** |`);
  L.push(`| Portion accuracy | ${pctStr(m.portionAccuracy)} |`);
  L.push(`| Meal accuracy (case / item) | ${pctStr(m.mealAccuracy.case)} / ${pctStr(m.mealAccuracy.item)} |`);
  L.push(`| Parsing accuracy (case / field) | ${pctStr(m.parsingAccuracy.case)} / ${pctStr(m.parsingAccuracy.field)} |`);
  L.push(`| Display accuracy | ${pctStr(m.displayAccuracy)} |`);
  L.push('');
  L.push('## By category');
  L.push('');
  L.push('| Category | Pass | Fail | Informational | Known-fail | Total |');
  L.push('|---|---|---|---|---|---|');
  for (const cat of Object.keys(m.categoryBreakdown).sort()) {
    const b = m.categoryBreakdown[cat];
    L.push(`| ${cat} | ${b.pass} | ${b.fail} | ${b.informational} | ${b.known_fail} | ${b.total} |`);
  }
  L.push('');
  L.push('## Failures by diagnostic stage');
  L.push('');
  const stages = diagnostics.summarize(run.records);
  const ordered = diagnostics.orderedStages(stages);
  if (!ordered.length) L.push('_None._');
  else for (const s of ordered) L.push(`- **${s}:** ${stages[s]}`);
  L.push('');

  const fails = run.records.filter((r) => !r.pass && !r.known_fail && !r.informational);
  L.push(`## Scored failures (${fails.length})`);
  L.push('');
  if (!fails.length) L.push('_None._');
  else for (const r of fails) L.push(`- \`${r.id}\` [${r.effectiveCategory} · ${r.stage}] — ${r.detail}`);
  L.push('');

  const info = run.records.filter((r) => r.informational);
  if (info.length) {
    L.push(`## Informational / triaged (${info.length}, not release-gating)`);
    L.push('');
    for (const r of info) L.push(`- \`${r.id}\` [${r.stage || 'ok'}] — ${r.pass ? 'passes' : r.detail}${r.notes ? ' — ' + r.notes : ''}`);
    L.push('');
  }

  if (cmp && !cmp.firstRun) {
    L.push('## Baseline comparison');
    L.push('');
    L.push(`- Added cases: ${cmp.added.length}${cmp.added.length ? ' (' + cmp.added.slice(0, 20).join(', ') + (cmp.added.length > 20 ? ', …' : '') + ')' : ''}`);
    L.push(`- Removed cases: ${cmp.removed.length}`);
    L.push(`- Changed outcomes: ${cmp.changed.length}`);
    for (const ch of cmp.changed.slice(0, 40)) {
      L.push(`  - \`${ch.id}\`: ${ch.from.pass ? 'pass' : 'fail(' + ch.from.stage + ')'} → ${ch.to.pass ? 'pass' : 'fail(' + ch.to.stage + ')'}`);
    }
    L.push(`- Regression cases newly failing: ${cmp.regressions.length}${cmp.regressions.length ? ' — ' + cmp.regressions.join(', ') : ''}`);
    const moved = Object.keys(cmp.metricDeltas).filter((k) => cmp.metricDeltas[k]);
    L.push(`- Metric movement: ${moved.length ? moved.map((k) => `${k} ${cmp.metricDeltas[k] > 0 ? '+' : ''}${cmp.metricDeltas[k]}`).join(', ') : 'none'}`);
    L.push('');
  } else if (cmp && cmp.firstRun) {
    L.push('## Baseline comparison');
    L.push('');
    L.push('_No committed baseline — this run establishes it (or run with `--update-baseline`)._');
    L.push('');
  }
  return L.join('\n');
}

module.exports = { toJSON, toMarkdown, pctStr };
