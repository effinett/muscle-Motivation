// Phase 4.2.9 — earliest-failure diagnostic classification.
//
// Given a case and its score result, assign the EARLIEST pipeline stage that
// explains the failure (phase brief §9) so one upstream failure is not cascaded
// into several misleading downstream ones. A passing case has stage null.
//
// Precedence of information:
//   1. A fixture/evaluation error always wins (it invalidates everything after).
//   2. An author-declared `diagnosticStage` on a KNOWN-non-passing case (a case
//      the author has already triaged as external-data-ambiguity /
//      multiple-acceptable / production-defect) is honored — the author has
//      inspected the candidate data and made the call.
//   3. Otherwise the scorer's local stage (scorers already look upstream: e.g. a
//      ranking scorer reports `retrieval` when no acceptable candidate was even
//      retrieved).

'use strict';

const { DIAGNOSTIC_STAGES } = require('./schema.js');

const STAGE_ORDER = new Map(DIAGNOSTIC_STAGES.map((s, i) => [s, i]));

function classify(c, score) {
  if (score.pass) return null;
  if (score.stage === 'fixture-error') return 'fixture-error';
  // Author-triaged terminal stages for cases that are expected/known not to pass.
  const triaged = ['external-data-ambiguity', 'multiple-acceptable', 'production-defect'];
  if (c.diagnosticStage && triaged.includes(c.diagnosticStage) && (c.known_fail || c.informational)) {
    return c.diagnosticStage;
  }
  // Author override even without known_fail, if explicitly set to a triaged stage.
  if (c.diagnosticStage && triaged.includes(c.diagnosticStage)) return c.diagnosticStage;
  return score.stage || 'production-defect';
}

// Aggregate: count failing cases by earliest stage (deterministic stage order).
function summarize(records) {
  const counts = {};
  for (const s of DIAGNOSTIC_STAGES) counts[s] = 0;
  for (const r of records) {
    if (r.stage) counts[r.stage] = (counts[r.stage] || 0) + 1;
  }
  return counts;
}

// Sort stages by pipeline order for stable reporting.
function orderedStages(counts) {
  return Object.keys(counts)
    .filter((s) => counts[s] > 0)
    .sort((a, b) => (STAGE_ORDER.get(a) ?? 99) - (STAGE_ORDER.get(b) ?? 99));
}

module.exports = { classify, summarize, orderedStages, STAGE_ORDER };
