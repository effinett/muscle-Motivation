// Phase 4.2.9 — metric aggregation.
//
// Turns per-case records (from the runner) into the headline metrics the phase
// brief §8 requires. Every metric reports numerator/denominator so a rate is
// never mistaken for a count, and cases WITHOUT an objectively-preferred outcome
// are excluded from top-1 (they still count toward acceptable-candidate).
//
// A record is: { id, category, effectiveCategory, pass, stage, informational,
//   known_fail, signals }.

'use strict';

function rate(n, d) { return { n, d, pct: d ? +(100 * n / d).toFixed(1) : null }; }

function scored(records) {
  // Cases that count toward pass/fail (exclude known_fail + informational).
  return records.filter((r) => !r.known_fail && !r.informational);
}

function byCategory(records) {
  const out = {};
  for (const r of records) {
    const k = r.effectiveCategory;
    out[k] = out[k] || { pass: 0, fail: 0, total: 0, informational: 0, known_fail: 0 };
    out[k].total++;
    if (r.known_fail) out[k].known_fail++;
    else if (r.informational) out[k].informational++;
    else if (r.pass) out[k].pass++;
    else out[k].fail++;
  }
  return out;
}

function compute(records) {
  const S = scored(records);

  // Top-1: only cases with an objectively-preferred candidate.
  const top1Cases = S.filter((r) => r.signals && r.signals.top1Applicable);
  const top1 = rate(top1Cases.filter((r) => r.signals.top1 === true).length, top1Cases.length);

  // Acceptable-candidate: ranking/correction cases (top must be acceptable).
  const accCases = S.filter((r) => r.signals && typeof r.signals.topAcceptable === 'boolean');
  const acceptable = rate(accCases.filter((r) => r.signals.topAcceptable).length, accCases.length);

  // Retrieval recall@k across any case that produced a recall signal.
  const recallCases = S.filter((r) => r.signals && r.signals.recall);
  const recall = {};
  for (const k of ['@1', '@3', '@5', '@10']) {
    recall[k] = rate(recallCases.filter((r) => r.signals.recall[k]).length, recallCases.length);
  }

  // Clarification precision / recall.
  const clar = S.filter((r) => r.signals && 'expectedAsk' in r.signals);
  const tp = clar.filter((r) => r.signals.truePos).length;
  const fp = clar.filter((r) => r.signals.falsePos).length;
  const fn = clar.filter((r) => r.signals.falseNeg).length;
  const clarification = {
    precision: rate(tp, tp + fp),
    recall: rate(tp, tp + fn),
    correct: rate(clar.filter((r) => r.pass).length, clar.length),
    wrongDimension: clar.filter((r) => r.signals.wrongDim).length,
  };

  // False-confidence: confidently resolved but wrong.
  const confCases = S.filter((r) => r.signals && 'isConfident' in r.signals);
  const confident = confCases.filter((r) => r.signals.isConfident);
  const falseConfidence = rate(confident.filter((r) => r.signals.falseConfidence).length, confident.length);

  // Category pass-rates for the leaf metrics.
  const catPass = (cat) => {
    const list = S.filter((r) => r.effectiveCategory === cat);
    return rate(list.filter((r) => r.pass).length, list.length);
  };

  // Meal-item accuracy: item-level checks that passed.
  const mealCases = S.filter((r) => r.effectiveCategory === 'meal' && r.signals);
  const itemChecks = mealCases.reduce((a, r) => a + (r.signals.itemChecks || 0), 0);
  const itemChecksOk = mealCases.reduce((a, r) => a + (r.signals.itemChecksOk || 0), 0);

  // Parsing field accuracy.
  const parseCases = S.filter((r) => r.effectiveCategory === 'parsing' && r.signals);
  const parseFields = parseCases.reduce((a, r) => a + (r.signals.parsingFields || 0), 0);
  const parseFieldsOk = parseCases.reduce((a, r) => a + (r.signals.parsingFieldsOk || 0), 0);

  return {
    overall: rate(S.filter((r) => r.pass).length, S.length),
    top1Accuracy: top1,
    acceptableCandidateAccuracy: acceptable,
    retrievalRecall: recall,
    clarification,
    falseConfidenceRate: falseConfidence,
    portionAccuracy: catPass('portion'),
    mealAccuracy: { case: catPass('meal'), item: rate(itemChecksOk, itemChecks) },
    parsingAccuracy: { case: catPass('parsing'), field: rate(parseFieldsOk, parseFields) },
    displayAccuracy: catPass('display'),
    categoryBreakdown: byCategory(records),
  };
}

module.exports = { compute, rate, byCategory, scored };
