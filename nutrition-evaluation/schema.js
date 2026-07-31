// Phase 4.2.9 — Nutrition Evaluation case schema + fixture validation.
//
// Pure, DOM-free, fetch-free (browser-irrelevant; Node-only tool code). Defines
// the stable case shape used by every category fixture file, and validates a
// loaded suite so a malformed fixture fails LOUDLY at load time rather than
// silently scoring wrong.
//
// A case is one JSON-ish object. Fields are category-specific: only `id`,
// `category`, and `input` are universally required; each category reads its own
// sub-object under `expected`. Unused expectation fields are simply absent —
// never required for an irrelevant category (§7 of the phase brief).
//
// Design intent: this schema is the ONE source of truth for what a case may
// contain. Scoring, diagnostics, and the runner all key off CATEGORIES and
// DIAGNOSTIC_STAGES below — never off ad-hoc string literals.

'use strict';

const SCHEMA_VERSION = '4.2.9-1';

// Evaluation categories (phase brief §4). Every case declares exactly one.
const CATEGORIES = [
  'parsing',       // A — raw text → structured intent (pure post-parse seams)
  'retrieval',     // B — is an acceptable candidate in the retrieved pool
  'ranking',       // C — is the best candidate ranked first
  'confidence',    // D — is confidence calibrated (nuAssessConfidence)
  'clarification', // E — is the right clarification asked
  'portion',       // F — portion interpretation (exact + vague)
  'meal',          // G — meal-level reasoning (item count + identity)
  'correction',    // H — correction memory (pure seam)
  'display',       // I — presentation output (food-display.js)
  'regression',    // historical bug pin — carries its own `via` sub-category
];

// Earliest-failure diagnostic stages (phase brief §9). A failing case is
// assigned the EARLIEST applicable stage so one upstream failure is not
// cascaded into several misleading downstream ones.
const DIAGNOSTIC_STAGES = [
  'fixture-error',            // 1  malformed fixture / evaluation bug
  'parsing',                  // 2
  'query-construction',       // 3
  'retrieval',                // 4  acceptable candidate never retrieved
  'ranking',                  // 5  retrieved but not ranked first
  'confidence',               // 6  mis-calibrated confidence
  'clarification',            // 7
  'portion',                  // 8
  'meal-reasoning',           // 9
  'correction-memory',        // 10
  'display',                  // 11
  'external-data-ambiguity',  // 12 USDA lacks the ideal record
  'multiple-acceptable',      // 13 non-preferred but acceptable outcome
  'production-defect',        // 14 confirmed correctness defect
];

// `via` values allowed on a regression case — the underlying category it pins.
const REGRESSION_VIA = CATEGORIES.filter((c) => c !== 'regression');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Validate ONE case. Returns an array of error strings (empty = valid).
function validateCase(c, index) {
  const where = c && c.id ? `case "${c.id}"` : `case #${index}`;
  const errs = [];
  const bad = (m) => errs.push(`${where}: ${m}`);

  if (!isPlainObject(c)) { return [`case #${index}: not an object`]; }
  if (typeof c.id !== 'string' || !c.id.trim()) bad('missing/empty string id');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(c.id || '')) bad(`id "${c.id}" is not a stable slug (alnum . _ -)`);
  if (!CATEGORIES.includes(c.category)) bad(`unknown category "${c.category}" (allowed: ${CATEGORIES.join(', ')})`);
  if (!isPlainObject(c.input)) bad('missing input object');

  if ('tags' in c && !(Array.isArray(c.tags) && c.tags.every((t) => typeof t === 'string'))) {
    bad('tags must be a string[]');
  }
  if ('expected' in c && !isPlainObject(c.expected)) bad('expected must be an object');
  if ('tolerances' in c && !isPlainObject(c.tolerances)) bad('tolerances must be an object');
  if ('informational' in c && typeof c.informational !== 'boolean') bad('informational must be a boolean');
  if ('known_fail' in c && typeof c.known_fail !== 'boolean') bad('known_fail must be a boolean');
  if ('diagnosticStage' in c && !DIAGNOSTIC_STAGES.includes(c.diagnosticStage)) {
    bad(`diagnosticStage "${c.diagnosticStage}" not in DIAGNOSTIC_STAGES`);
  }

  // Regression cases must declare which underlying category they pin + a phase.
  if (c.category === 'regression') {
    if (!REGRESSION_VIA.includes(c.via)) bad(`regression case needs via ∈ {${REGRESSION_VIA.join(', ')}}`);
    if (typeof c.phase !== 'string' || !c.phase) bad('regression case needs a phase (e.g. "4.2.7")');
  }

  const cat = c.category === 'regression' ? c.via : c.category;
  const exp = isPlainObject(c.expected) ? c.expected : {};

  // Category-specific minimum-expectation checks (only the earliest wrong shape
  // is reported; absent optional fields are always fine).
  switch (cat) {
    case 'retrieval':
      if (!Array.isArray(exp.acceptableCandidateIds) && !exp.acceptableNameRegex) {
        bad('retrieval expects acceptableCandidateIds[] or acceptableNameRegex');
      }
      break;
    case 'ranking':
      if (exp.preferredCandidateId == null && !exp.topNameRegex && !exp.acceptableNameRegex && !Array.isArray(exp.acceptableCandidateIds)) {
        bad('ranking expects preferredCandidateId, acceptableCandidateIds[], acceptableNameRegex, or topNameRegex');
      }
      break;
    case 'confidence':
      if (!isPlainObject(exp.confidence)) bad('confidence case expects expected.confidence {disposition|level|...}');
      break;
    case 'clarification':
      if (!isPlainObject(exp.clarification)) bad('clarification case expects expected.clarification {expected:bool,type?}');
      break;
    case 'portion':
      if (!isPlainObject(exp.portion)) bad('portion case expects expected.portion {...}');
      break;
    case 'meal':
      if (!isPlainObject(exp.meal)) bad('meal case expects expected.meal {itemCount|...}');
      if (!isPlainObject(c.input) || typeof c.input.text !== 'string') bad('meal case input needs a text string');
      break;
    case 'correction':
      if (exp.preferredCandidateId == null && !exp.topNameRegex && !exp.acceptableNameRegex && !Array.isArray(exp.acceptableCandidateIds)) {
        bad('correction case expects a ranking expectation (preferredCandidateId/acceptableNameRegex/topNameRegex)');
      }
      break;
    case 'display':
      if (!isPlainObject(exp.display)) bad('display case expects expected.display {...}');
      if (!isPlainObject(c.input.food) && !isPlainObject(c.input.logEntry)) bad('display case input needs food{} or logEntry{}');
      break;
    case 'parsing':
      if (!isPlainObject(exp.parse)) bad('parsing case expects expected.parse {...}');
      break;
    default:
      break;
  }
  return errs;
}

// Validate a whole suite: per-case shape + globally-unique stable ids.
function validateSuite(cases) {
  const errs = [];
  if (!Array.isArray(cases)) return ['suite is not an array'];
  const seen = new Map();
  cases.forEach((c, i) => {
    for (const e of validateCase(c, i)) errs.push(e);
    if (c && typeof c.id === 'string') {
      if (seen.has(c.id)) errs.push(`duplicate id "${c.id}" (also at case #${seen.get(c.id)})`);
      else seen.set(c.id, i);
    }
  });
  return errs;
}

module.exports = {
  SCHEMA_VERSION,
  CATEGORIES,
  DIAGNOSTIC_STAGES,
  REGRESSION_VIA,
  isPlainObject,
  validateCase,
  validateSuite,
};
