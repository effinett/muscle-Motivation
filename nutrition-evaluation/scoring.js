// Phase 4.2.9 — per-category scoring.
//
// Each scorer runs the relevant PURE production seam (via engine.js) and returns
// a normalized result:
//   { pass: bool, stage: <DIAGNOSTIC_STAGE|null>, detail: string, signals: {} }
// `signals` carries metric-grade facts (top1, acceptable, recall@k, portion
// deltas, etc.) that metrics.js aggregates. `stage` is the scorer's LOCAL view of
// where it failed; diagnostics.js may refine it to the earliest stage.
//
// Scoring never mutates the case and never touches production data.

'use strict';

/* ── candidate helpers ─────────────────────────────────────────────────── */

function candId(x) {
  if (!x) return null;
  return x.fdcId != null ? x.fdcId : (x.usda_fdc_id != null ? x.usda_fdc_id : null);
}
function candName(x) {
  if (!x) return '';
  return x.description || x.name || '';
}
function reOf(s) { return s instanceof RegExp ? s : new RegExp(s, 'i'); }

// Does a candidate satisfy an acceptable spec (ids OR name regex)?
function acceptable(cand, exp) {
  if (!cand) return false;
  const ids = exp.acceptableCandidateIds;
  if (Array.isArray(ids) && ids.includes(candId(cand))) return true;
  if (exp.acceptableNameRegex && reOf(exp.acceptableNameRegex).test(candName(cand))) return true;
  if (exp.preferredCandidateId != null && candId(cand) === exp.preferredCandidateId) return true;
  if (exp.topNameRegex && reOf(exp.topNameRegex).test(candName(cand))) return true;
  return false;
}
function anyAcceptable(list, exp) { return (list || []).some((c) => acceptable(c, exp)); }

function tol(tolerances, key, dflt) {
  const t = tolerances || {};
  return typeof t[key] === 'number' ? t[key] : dflt;
}
function within(got, want, t) {
  if (got == null || want == null) return got === want;
  return Math.abs(got - want) <= t;
}

/* ── A. parsing (deterministic post-parse seams) ───────────────────────── */

function scoreParsing(c, engine) {
  const exp = c.expected.parse || {};
  const bad = [];
  // Deterministic dropped-unit recovery (food-portion.nuDetectFromRawText).
  if (exp.detectFromRawText) {
    const d = engine.portion.nuDetectFromRawText(
      c.input.text || c.input.rawText || '', exp.detectFromRawText.query || c.input.query);
    const w = exp.detectFromRawText;
    if ('portionClass' in w && (!d || d.portionClass !== w.portionClass)) {
      bad.push(`rawDetect.portionClass got ${d && d.portionClass}, want ${w.portionClass}`);
    }
    if ('detected' in w && (!!d) !== !!w.detected) bad.push(`rawDetect.detected got ${!!d}, want ${w.detected}`);
    if ('modifier' in w && (!d || d.modifier !== w.modifier)) bad.push(`rawDetect.modifier got ${d && d.modifier}, want ${w.modifier}`);
  }
  // Query normalization (query-construction) via food-memory.nmNormQuery.
  if (exp.normQuery != null) {
    const got = engine.memory.nmNormQuery(c.input.text || c.input.query || '');
    if (got !== exp.normQuery) bad.push(`normQuery got ${JSON.stringify(got)}, want ${JSON.stringify(exp.normQuery)}`);
  }
  return { pass: bad.length === 0, stage: bad.length ? 'parsing' : null, detail: bad.join('; '),
    signals: { parsingFields: (exp.detectFromRawText ? 1 : 0) + (exp.normQuery != null ? 1 : 0),
      parsingFieldsOk: bad.length === 0 ? ((exp.detectFromRawText ? 1 : 0) + (exp.normQuery != null ? 1 : 0)) : 0 } };
}

/* ── B. retrieval ──────────────────────────────────────────────────────── */

function scoreRetrieval(c, engine) {
  const exp = c.expected;
  const raw = engine.rawPool(c);
  const ranked = engine.rankedPool(c);
  const retrievedAtAll = anyAcceptable(raw, exp);
  const recall = {};
  for (const k of [1, 3, 5, 10]) recall['@' + k] = anyAcceptable(ranked.slice(0, k), exp);
  const cut = exp.recallWithin || null; // require an acceptable within top-N
  const pass = cut ? !!recall['@' + cut] : retrievedAtAll;
  return {
    pass,
    stage: pass ? null : 'retrieval',
    detail: pass ? '' : (retrievedAtAll ? `acceptable not within top ${cut}` : 'no acceptable candidate retrieved'),
    signals: { retrievedAtAll, recall },
  };
}

/* ── C. ranking (+ correction shares this) ─────────────────────────────── */

function scoreRankingLike(c, engine) {
  const exp = c.expected;
  const ranked = engine.rankedPool(c);
  const top = ranked[0] || null;
  const inPool = anyAcceptable(ranked, exp);
  const topAcceptable = acceptable(top, exp);
  const top1Applicable = exp.preferredCandidateId != null;
  const top1 = top1Applicable ? (candId(top) === exp.preferredCandidateId) : null;
  let forbidden = false;
  if (exp.topNotRegex && top && reOf(exp.topNotRegex).test(candName(top))) forbidden = true;

  const pass = topAcceptable && !forbidden;
  let stage = null;
  if (!pass) {
    if (!inPool && !forbidden) stage = 'retrieval';   // never retrieved → not a ranking fault
    else stage = 'ranking';
  }
  return {
    pass, stage,
    detail: pass ? '' : (forbidden ? `top "${candName(top)}" matches forbidden /${exp.topNotRegex}/`
      : (!inPool ? 'no acceptable candidate in ranked pool' : `top "${candName(top)}" not acceptable`)),
    signals: { top1Applicable, top1, topAcceptable, inPool, topName: candName(top), topId: candId(top) },
  };
}

/* ── D. confidence ─────────────────────────────────────────────────────── */

function scoreConfidence(c, engine) {
  const want = c.expected.confidence || {};
  const verdict = engine.assessConfidence(c, want.policy);
  const bad = [];
  if (want.disposition && verdict.disposition !== want.disposition)
    bad.push(`disposition got ${verdict.disposition}, want ${want.disposition}`);
  if (want.level && verdict.level !== want.level) bad.push(`level got ${verdict.level}, want ${want.level}`);
  if ('material' in want && !!verdict.material !== !!want.material)
    bad.push(`material got ${!!verdict.material}, want ${!!want.material}`);
  if (want.alternatives != null && verdict.alternatives.length !== want.alternatives)
    bad.push(`alternatives got ${verdict.alternatives.length}, want ${want.alternatives}`);
  for (const a of want.ambiguity || []) if (!verdict.ambiguity.includes(a))
    bad.push(`ambiguity missing "${a}"`);
  if (want.reason && !verdict.reasons.some((r) => r.code === want.reason))
    bad.push(`reason "${want.reason}" absent`);
  if (want.clarificationType && (!verdict.clarification || verdict.clarification.type !== want.clarificationType))
    bad.push(`clarificationType got ${verdict.clarification && verdict.clarification.type}, want ${want.clarificationType}`);

  // false-confidence probe: a case may declare the confident answer is WRONG.
  const isConfident = verdict.disposition === 'auto' || verdict.level === 'high';
  return {
    pass: bad.length === 0, stage: bad.length ? 'confidence' : null, detail: bad.join('; '),
    signals: { isConfident, wrongIfConfident: !!want.wrongIfConfident,
      falseConfidence: isConfident && !!want.wrongIfConfident, disposition: verdict.disposition, level: verdict.level },
  };
}

/* ── E. clarification ──────────────────────────────────────────────────── */

function scoreClarification(c, engine) {
  const want = c.expected.clarification || {};
  const verdict = engine.assessConfidence(c, want.policy);
  const asked = verdict.disposition === 'choose_candidate' || verdict.disposition === 'clarify' ||
    !!verdict.clarification;
  const bad = [];
  if ('expected' in want && asked !== !!want.expected)
    bad.push(`clarification asked=${asked}, want ${want.expected}`);
  if (want.type && (!verdict.clarification || verdict.clarification.type !== want.type))
    bad.push(`clarification type got ${verdict.clarification && verdict.clarification.type}, want ${want.type}`);
  // clarification precision/recall bookkeeping
  const expectedAsk = !!want.expected;
  return {
    pass: bad.length === 0, stage: bad.length ? 'clarification' : null, detail: bad.join('; '),
    signals: {
      expectedAsk, asked,
      truePos: expectedAsk && asked, falsePos: !expectedAsk && asked,
      falseNeg: expectedAsk && !asked, wrongDim: !!(want.type && verdict.clarification && verdict.clarification.type !== want.type),
    },
  };
}

/* ── F. portion ────────────────────────────────────────────────────────── */

async function scorePortion(c, engine) {
  const exp = c.expected.portion || {};
  const bad = [];
  const t = c.tolerances || {};
  const signals = {};
  if ((c.input.via || 'vague') === 'resolver') {
    // Resolver-level portion (exact household unit / grams / serving).
    const { result: r } = await engine.resolve(c);
    if (r.needsChoice || r.unmatched) { bad.push(`portion resolver outcome was ${r.unmatched ? 'unmatched' : 'needsChoice'}`); }
    else {
      if ('servings' in exp && !within(r.servings, exp.servings, tol(t, 'servings', 0)))
        bad.push(`servings got ${r.servings}, want ${exp.servings}`);
      if ('grams' in exp && !within(r.grams, exp.grams, tol(t, 'grams', 0)))
        bad.push(`grams got ${r.grams}, want ${exp.grams}`);
      if (exp.serving_description_regex && !reOf(exp.serving_description_regex).test(r.serving_description || ''))
        bad.push(`serving_description "${r.serving_description}" !~ /${exp.serving_description_regex}/`);
      signals.servings = r.servings; signals.grams = r.grams;
    }
  } else {
    // Vague portion seam (nuInterpretVaguePortion) — input carries the seam args.
    const call = Object.assign({}, c.input);
    const v = engine.portion.nuInterpretVaguePortion(call);
    if ('detected' in exp && !!v.detected !== !!exp.detected) bad.push(`detected got ${!!v.detected}, want ${exp.detected}`);
    if (exp.basis && v.basis !== exp.basis) bad.push(`basis got ${v.basis}, want ${exp.basis}`);
    if (exp.estimatedUnit && v.estimatedUnit !== exp.estimatedUnit) bad.push(`estimatedUnit got ${v.estimatedUnit}, want ${exp.estimatedUnit}`);
    if ('estimatedAmount' in exp && !within(v.estimatedAmount, exp.estimatedAmount, tol(t, 'estimatedAmount', 0)))
      bad.push(`estimatedAmount got ${v.estimatedAmount}, want ${exp.estimatedAmount}`);
    if ('requiresClarification' in exp && !!v.requiresClarification !== !!exp.requiresClarification)
      bad.push(`requiresClarification got ${!!v.requiresClarification}, want ${exp.requiresClarification}`);
    if (exp.form && v.form !== exp.form) bad.push(`form got ${v.form}, want ${exp.form}`);
    signals.detected = !!v.detected; signals.basis = v.basis;
  }
  return { pass: bad.length === 0, stage: bad.length ? 'portion' : null, detail: bad.join('; '), signals };
}

/* ── G. meal reasoning ─────────────────────────────────────────────────── */

function scoreMeal(c, engine) {
  const exp = c.expected.meal || {};
  const items = Array.isArray(c.input.items) ? c.input.items : [];
  const ctx = engine.mealmod.nuBuildMealContext(c.input.text || '', items, { mealType: c.input.mealType || null });
  const bad = [];
  if ('itemCount' in exp && ctx.itemCount !== exp.itemCount) bad.push(`itemCount got ${ctx.itemCount}, want ${exp.itemCount}`);
  if ('mealCooked' in exp && !!ctx.mealCooked !== !!exp.mealCooked) bad.push(`mealCooked got ${!!ctx.mealCooked}, want ${exp.mealCooked}`);
  const at = (i) => ctx.items[i] || {};
  for (const i of exp.beverageIndexes || []) if (!at(i).beverage) bad.push(`item[${i}] expected beverage`);
  for (const i of exp.notBeverageIndexes || []) if (at(i).beverage) bad.push(`item[${i}] must NOT be beverage`);
  for (const i of exp.commodityIndexes || []) if (!at(i).commodity) bad.push(`item[${i}] expected commodity`);
  if (Array.isArray(exp.categories)) exp.categories.forEach((cat, i) => {
    if (cat != null && at(i).category !== cat) bad.push(`item[${i}].category got ${at(i).category}, want ${cat}`);
  });
  if (Array.isArray(exp.animals)) exp.animals.forEach((an, i) => {
    if (an != null && at(i).animal !== an) bad.push(`item[${i}].animal got ${at(i).animal}, want ${an}`);
  });
  // item-level correctness bookkeeping
  const itemChecks = (exp.categories || []).filter((x) => x != null).length +
    (exp.beverageIndexes || []).length + (exp.notBeverageIndexes || []).length;
  return { pass: bad.length === 0, stage: bad.length ? 'meal-reasoning' : null, detail: bad.join('; '),
    signals: { itemCountOk: !('itemCount' in exp) || ctx.itemCount === exp.itemCount, itemChecks,
      itemChecksOk: bad.length === 0 ? itemChecks : 0 } };
}

/* ── I. display ────────────────────────────────────────────────────────── */

function scoreDisplay(c, engine) {
  const exp = c.expected.display || {};
  const bad = [];
  const d = c.input.logEntry ? engine.display.buildLogDisplay(c.input.logEntry)
    : engine.display.buildFoodDisplay(c.input.food);
  if (exp.name != null && d.name !== exp.name) bad.push(`name got ${JSON.stringify(d.name)}, want ${JSON.stringify(exp.name)}`);
  if (exp.nameRegex && !reOf(exp.nameRegex).test(d.name || '')) bad.push(`name "${d.name}" !~ /${exp.nameRegex}/`);
  if (exp.notRegex && reOf(exp.notRegex).test(d.name || '')) bad.push(`name "${d.name}" matches forbidden /${exp.notRegex}/`);
  if (exp.serving != null && d.serving !== exp.serving) bad.push(`serving got ${JSON.stringify(d.serving)}, want ${JSON.stringify(exp.serving)}`);
  if (exp.servingRegex && !reOf(exp.servingRegex).test(d.serving || '')) bad.push(`serving "${d.serving}" !~ /${exp.servingRegex}/`);
  if ('estimated' in exp && !!d.estimated !== !!exp.estimated) bad.push(`estimated got ${!!d.estimated}, want ${exp.estimated}`);
  if (exp.brandIncludes && !(d.brand || '').includes(exp.brandIncludes)) bad.push(`brand "${d.brand}" missing "${exp.brandIncludes}"`);
  if (exp.varietyIncludes && !(d.variety || '').includes(exp.varietyIncludes)) bad.push(`variety "${d.variety}" missing "${exp.varietyIncludes}"`);
  if (exp.ariaIncludes && !(d.ariaLabel || '').includes(exp.ariaIncludes)) bad.push(`ariaLabel "${d.ariaLabel}" missing "${exp.ariaIncludes}"`);
  return { pass: bad.length === 0, stage: bad.length ? 'display' : null, detail: bad.join('; '), signals: { name: d.name } };
}

/* ── dispatcher ────────────────────────────────────────────────────────── */

async function scoreCase(c, engine) {
  const cat = c.category === 'regression' ? c.via : c.category;
  switch (cat) {
    case 'parsing': return scoreParsing(c, engine);
    case 'retrieval': return scoreRetrieval(c, engine);
    case 'ranking': return scoreRankingLike(c, engine);
    case 'correction': return scoreRankingLike(c, engine);
    case 'confidence': return scoreConfidence(c, engine);
    case 'clarification': return scoreClarification(c, engine);
    case 'portion': return scorePortion(c, engine);
    case 'meal': return scoreMeal(c, engine);
    case 'display': return scoreDisplay(c, engine);
    default: return { pass: false, stage: 'fixture-error', detail: `no scorer for category ${cat}`, signals: {} };
  }
}

module.exports = {
  candId, candName, acceptable, anyAcceptable, within,
  scoreParsing, scoreRetrieval, scoreRankingLike, scoreConfidence,
  scoreClarification, scorePortion, scoreMeal, scoreDisplay, scoreCase,
};
