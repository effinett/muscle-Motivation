/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Food PRESENTATION Core (`food-display.js`)
 * Phase 4.2.8 — Nutrition Intelligence Polish
 *
 * The presentation sibling of food-core.js (resolution), food-ranking.js
 * (ranking), food-memory.js (corrections), food-meal.js (meal reasoning) and
 * food-portion.js (portions): one pure, DOM-free, fetch-free, DB-free layer
 * that turns a RAW canonical food record into a CLEAN, display-ready model.
 *
 * The architectural contract (do not break):
 *
 *     Raw canonical food data goes in. A clean presentation model comes out.
 *
 * This module is DISPLAY ONLY. It NEVER mutates the food it is given, never
 * changes food identity, calories, macros, serving quantities, save payloads,
 * or correction-memory keys, and its output is NEVER fed back into ranking,
 * resolution, matching, or persistence. The original canonical name/description
 * always remains available (`fullName`) so nothing downstream loses fidelity.
 *
 * Runtimes (same guarded-exports pattern as the other cores):
 *   • Browser — loaded via <script src="food-display.js"> AFTER food-core.js on
 *     nutrition.html and app.html; defines the global `FoodDisplay`.
 *   • Node    — `require('./food-display.js')` for tests.
 *
 * Reuses food-core.js name intelligence (`nuAiDisplayName`, `nuTitleCase`) so
 * name simplification is defined ONCE. No duplicated normalization here.
 * ──────────────────────────────────────────────────────────────────────── */
'use strict';

/* ── food-core acquisition (browser globals or Node require) ─────────────── */
var _fdCore = (function () {
  if (typeof require === 'function') {
    try { return require('./food-core.js'); } catch (e) { /* browser */ }
  }
  return null;
})();
function _fdDisplayName(name) {
  if (_fdCore && typeof _fdCore.nuAiDisplayName === 'function') return _fdCore.nuAiDisplayName(name);
  if (typeof nuAiDisplayName === 'function') return nuAiDisplayName(name);
  return String(name == null ? '' : name).trim();
}
function _fdTitleCase(s) {
  if (_fdCore && typeof _fdCore.nuTitleCase === 'function') return _fdCore.nuTitleCase(s);
  if (typeof nuTitleCase === 'function') return nuTitleCase(s);
  return String(s == null ? '' : s);
}
function _fdRound(v) {
  if (_fdCore && typeof _fdCore.nuRound === 'function') return _fdCore.nuRound(v);
  if (typeof nuRound === 'function') return nuRound(v);
  return Math.round(+v || 0);
}
function _fdRound1(v) {
  if (_fdCore && typeof _fdCore.nuRound1 === 'function') return _fdCore.nuRound1(v);
  if (typeof nuRound1 === 'function') return nuRound1(v);
  return Math.round((+v || 0) * 10) / 10;
}

/* ── number + quantity formatting ─────────────────────────────────────────
 * Trailing-zero-free, fraction-aware. These fix the "1.0 cup" / "158.0 g" /
 * excessive-decimal cases and render common fractions as glyphs ("½ banana").
 * ─────────────────────────────────────────────────────────────────────────── */
var FD_FRACTIONS = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.33': '⅓', '0.67': '⅔' };

// Compact numeric string: 2 → "2", 1.5 → "1.5", 158.0 → "158". Never NaN/Inf.
function fdNum(n) {
  var v = +n;
  if (!isFinite(v)) return '';
  var r = Math.round(v * 100) / 100;
  var s = r.toFixed(2);
  s = s.replace(/\.?0+$/, '');          // strip trailing zeros + a bare dot
  return s;
}

// Quantity for a label: whole → "2", common fraction → "½", "1½"; else fdNum.
function fdQty(n) {
  var v = +n;
  if (!isFinite(v) || v < 0) return '';
  var whole = Math.floor(v);
  var frac = Math.round((v - whole) * 100) / 100;
  var glyph = FD_FRACTIONS[String(frac)];
  if (glyph) return (whole ? whole : '') + glyph;
  return fdNum(v);
}

/* ── serving / portion labels ─────────────────────────────────────────────
 * serving_description arrives from the serving engine in a small set of shapes:
 *   "1 cup (158 g)"     household portion      → "1 cup · 158 g"
 *   "1 large (50 g)"    "                       → "1 large · 50 g"
 *   "170 g" / "100 ml"  metric                  → "170 g"
 *   "splash (~15 ml)"   VAGUE / estimated       → "Splash · ~15 ml"  (estimated)
 *   "1 serving"         generic                 → "1 serving"
 * The job here is sanitization (kill "1 1 serving", "serving serving", "1 unit",
 * empty parens, "null", trailing zeros) + a consistent "MAIN · DETAIL" join, and
 * to detect the estimated flag from the "~" the portion engine already writes.
 * ─────────────────────────────────────────────────────────────────────────── */

// A serving is estimated when its own text carries the portion engine's "~"
// marker (or the word "estimated"). Presentation-only signal; the resolver's
// explicit `estimated` flag, when available, is always preferred by callers.
function fdIsEstimatedServing(desc) {
  var s = String(desc == null ? '' : desc).toLowerCase();
  return s.indexOf('~') >= 0 || /\bestimated\b/.test(s);
}

// Split "main (detail)" → { main, detail }. No parens → { main, detail:null }.
function fdSplitServing(desc) {
  var s = String(desc == null ? '' : desc).trim();
  if (!s) return { main: '', detail: null };
  var m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { main: m[1].trim(), detail: (m[2].trim() || null) };
  return { main: s, detail: null };
}

// Sanitize one unit phrase ("1 1 serving" → "1 serving", "158.0 g" → "158 g",
// "serving serving" → "serving", "1 unit" → "1 serving", "1.0 cup" → "1 cup").
function fdCleanPhrase(str, opts) {
  opts = opts || {};
  var s = String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  // Drop a redundant leading number immediately followed by another number
  // ("1 1 serving" → "1 serving").
  s = s.replace(/^\d+(?:\.\d+)?\s+(?=\d)/, '');
  // Trailing-zero cleanup inside any number token.
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, function (t) { return fdNum(t) || t; });
  // "unit"/"units" carries no meaning as a serving word → "serving".
  s = s.replace(/\bunits?\b/gi, 'serving');
  // Collapse an immediately repeated identical word ("serving serving").
  s = s.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
  s = s.trim();
  if (opts.capitalize && s) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// Full serving label for cards / dropdowns / search rows: "1 cup · 158 g".
// Falls back to amount+unit, then to "1 serving" — never null/empty parens.
function fdServingLabel(input, opts) {
  input = input || {};
  opts = opts || {};
  var desc = input.serving_description != null ? input.serving_description : input.description;
  var main, detail;
  if (desc != null && String(desc).trim()) {
    var parts = fdSplitServing(desc);
    main = fdCleanPhrase(parts.main, opts);
    detail = parts.detail != null ? fdCleanPhrase(parts.detail, {}) : null;
  } else {
    // Build from amount + unit when there is no description.
    var amt = input.serving_amount, unit = input.serving_unit;
    if (amt != null && unit) main = fdCleanPhrase(fdQty(amt) + ' ' + fdUnitWord(unit, +amt), opts);
    else main = '';
    detail = null;
  }
  if (!main && detail) { main = detail; detail = null; }
  if (!main) return opts.capitalize ? '1 Serving' : '1 serving';
  return detail ? (main + ' · ' + detail) : main;
}

// Compact serving for condensed daily-log rows. Returns { text, estimated } so
// the caller can render an estimated affordance without relying on colour alone.
// Estimated portions KEEP their "~amount" so a condensed row never looks exact.
function fdCompactServing(input) {
  input = input || {};
  var estimated = (input.estimated === true) ||
    fdIsEstimatedServing(input.serving_description != null ? input.serving_description : input.description);
  var text = fdServingLabel(input, { capitalize: true });
  return { text: text, estimated: estimated };
}

// Minimal unit-word pluralization when we build a label from amount+unit.
// Household words pluralize; metric/abbreviated units stay invariant.
var FD_INVARIANT_UNITS = { g: 1, kg: 1, mg: 1, ml: 1, l: 1, oz: 1, lb: 1,
  tbsp: 1, tsp: 1, 'fl oz': 1, serving: 0 /* handled specially */ };
function fdUnitWord(unit, count) {
  var u = String(unit == null ? '' : unit).trim().toLowerCase();
  if (!u) return '';
  if (u === 'serving') return (count === 1) ? 'serving' : 'servings';
  if (FD_INVARIANT_UNITS[u]) return u;
  if (count === 1) return u;
  if (/(s|x|z|ch|sh)$/.test(u)) return u + 'es';
  if (/[^aeiou]y$/.test(u)) return u.slice(0, -1) + 'ies';
  return u + 's';
}

/* ── name + brand ─────────────────────────────────────────────────────────
 * One simplification strategy for every surface, delegating the actual USDA
 * grammar work to food-core's nuAiDisplayName. Two extra responsibilities live
 * here: strip a trailing "(brand)" the resolver appended to `name`, and never
 * let the brand appear twice (name AND brand line).
 * ─────────────────────────────────────────────────────────────────────────── */

// Remove a trailing " (Brand)" suffix from a name when it matches the brand.
function fdStripBrandSuffix(name, brand) {
  var n = String(name == null ? '' : name).trim();
  var b = String(brand == null ? '' : brand).trim();
  if (b) {
    var suf = ' (' + b + ')';
    if (n.length >= suf.length && n.slice(-suf.length).toLowerCase() === suf.toLowerCase()) {
      return n.slice(0, -suf.length).trim();
    }
  }
  // Generic trailing "(…)" that duplicates any parenthetical brand tail.
  return n;
}

// Remove a LEADING brand run so the brand is secondary metadata, never the
// primary food identity ("Great Value Sourdough Bread" + brand "Great Value" →
// "Sourdough Bread"; "Fairlife Whole Milk" → "Whole Milk"). Strips only the
// contiguous leading name tokens that belong to the brand, and ONLY when ≥2
// meaningful words remain — so a brand that IS the product's identity survives
// ("Coca-Cola Classic" → "Classic" would be wrong, so it is kept intact, as is
// bare "Pepsi"). Presentation-only; the canonical name/identity is untouched.
function _fdBrandNorm(t) { return String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fdStripBrandPrefix(name, brand) {
  var n = String(name == null ? '' : name).trim();
  var b = String(brand == null ? '' : brand).trim();
  if (!n || !b) return n;
  var nt = n.split(/\s+/);
  var bset = {};
  b.split(/\s+/).forEach(function (t) { var k = _fdBrandNorm(t); if (k) bset[k] = 1; });
  var i = 0;
  while (i < nt.length && bset[_fdBrandNorm(nt[i])]) i++;
  var rest = nt.slice(i);
  if (i === 0 || rest.length < 2) return n;     // no brand prefix, or too little left → keep as-is
  return rest.join(' ');
}

// Simplified, human-scannable primary name. Brand is stripped first (both a
// trailing "(Brand)" suffix and a leading brand run) so it is never shown twice
// and is left to the secondary brand line; the rest is food-core's class-based
// USDA simplification.
function fdSimplifyName(name, brand) {
  var bare = fdStripBrandSuffix(name, brand);
  bare = fdStripBrandPrefix(bare, brand);
  var simplified = _fdDisplayName(bare);
  return simplified || _fdTitleCase(bare) || bare;
}

/* ── species / variety as SECONDARY metadata ────────────────────────────────
 * Some species/variety words read better as secondary metadata than as a
 * primary-name prefix ("Smoked Salmon" + variety "Chinook", not "Chinook Smoked
 * Salmon"). This is CONTEXTUAL — scoped to the base food the species qualifies —
 * so a variety a user names directly ("Fuji Apple") is never demoted. The
 * canonical name/identity is untouched; the species stays available on the model
 * (and always in fullName). Extend the table per recognized construction. */
var FD_SECONDARY_VARIETY = {
  salmon: { chinook: 1, king: 1, atlantic: 1, sockeye: 1, red: 1, coho: 1,
    silver: 1, pink: 1, humpback: 1, chum: 1, keta: 1 },
};

// Pull a known species/variety token out of the primary name → secondary field,
// but ONLY when a real multi-word food remains (so "Chinook Salmon" stays whole
// while "Chinook Smoked Salmon" → "Smoked Salmon" + "Chinook"). Pure, name-only.
function fdExtractVariety(name) {
  var n = String(name == null ? '' : name).trim();
  if (!n) return { name: n, variety: '' };
  var toks = n.split(/\s+/);
  var base = toks[toks.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  var set = FD_SECONDARY_VARIETY[base];
  if (!set) return { name: n, variety: '' };
  for (var i = 0; i < toks.length - 1; i++) {
    var t = toks[i].toLowerCase().replace(/[^a-z]/g, '');
    if (set[t]) {
      var rest = toks.slice(0, i).concat(toks.slice(i + 1));
      if (rest.length >= 2) return { name: rest.join(' '), variety: toks[i] };
      break;
    }
  }
  return { name: n, variety: '' };
}

// Append "(Lox)" to a smoked-salmon name ONLY when "lox" is present in an actual
// identity signal (canonical name, product name, brand, user text, correction
// memory, source metadata) — NEVER inferred from "smoked salmon" alone.
function fdApplyLox(name, signals) {
  var n = String(name == null ? '' : name);
  if (!/smoked\s+salmon/i.test(n)) return n;   // only smoked salmon is lox
  if (/\blox\b/i.test(n)) return n;            // already displayed
  var has = (signals || []).some(function (s) { return /\blox\b/i.test(String(s == null ? '' : s)); });
  return has ? (n + ' (Lox)') : n;
}

/* ── macros + calories ────────────────────────────────────────────────────── */

// "210" (kcal number, rounded). Consistent everywhere — the caller adds "kcal".
function fdCalories(n) { return _fdRound(n); }

// One macro summary format for every surface: "P 30 · C 12 · F 8" (whole grams
// by default so rows read consistently; { round1:true } keeps one decimal).
function fdMacroSummary(macros, opts) {
  macros = macros || {};
  opts = opts || {};
  var r = opts.round1 ? _fdRound1 : _fdRound;
  var parts = [];
  parts.push('P ' + r(macros.protein));
  parts.push('C ' + r(macros.carbs));
  parts.push('F ' + r(macros.fat));
  return parts.join(' · ');
}

/* ── the ONE primary-name pipeline ──────────────────────────────────────────
 * Every presentation model derives its primary name here so one food yields ONE
 * name on every surface (search, Review & Add, clarification choices, saved
 * meals, recents, favorites, log/history): simplify (brand-stripped) → pull a
 * species/variety out to secondary → evidence-gated "(Lox)". Display-only — the
 * verbatim canonical `fullName` is always returned alongside. */
function fdPresentName(food) {
  food = food || {};
  var brand = String(food.brand || '').trim();
  var canonical = food.description || food.name || '';
  var name = fdSimplifyName(food.name != null ? food.name : canonical, brand);
  var v = fdExtractVariety(name);
  name = v.name;
  name = fdApplyLox(name, [canonical, food.name, brand, food.manualName, food.query, food.text]);
  return { name: name, variety: v.variety || '', fullName: String(canonical).trim() || name || '' };
}

/* ── structured secondary metadata ───────────────────────────────────────────
 * Ordered secondary parts a card renders after the primary name (the UI joins
 * with " • "). Empty values are omitted, and any value already visible in the
 * primary name is suppressed (brand/variety never shown twice). The calorie basis
 * is an INTENTIONAL, documented difference — NOT an inconsistency:
 *   opts.calories='100g'  → "<n> kcal/100 g"  — CLARIFICATION CHOICES compare
 *       candidate food records, so they show a normalized per-100 g basis.
 *   opts.calories='total' → "<n> kcal"        — RESOLVED Review & Add rows and
 *       logged foods show the actual quantity-adjusted total.
 * Pure structured strings only — never HTML. */
function fdSecondaryParts(model, opts) {
  model = model || {}; opts = opts || {};
  var parts = [];
  var name = String(model.name || '').toLowerCase();
  var inName = function (s) { return s && name.indexOf(String(s).toLowerCase()) !== -1; };
  if (model.brand && !inName(model.brand)) parts.push(model.brand);
  if (model.variety && !inName(model.variety)) parts.push(model.variety);
  if (opts.serving && model.serving) parts.push(model.serving);
  if (opts.calories === '100g' && model.kcalPer100g != null) parts.push(model.kcalPer100g + ' kcal/100 g');
  else if (opts.calories === 'total' && model.calories != null) parts.push(model.calories + ' kcal');
  return parts;
}

/* ── full display models ──────────────────────────────────────────────────── */

// Build the presentation model for a normalized USDA food (search row / card /
// AI-sheet item / recent / favorite). PURE — `food` is never mutated. The caller
// still owns the DOM; this only supplies clean strings + flags.
//
// `food` may be a normalized USDA food (name, description, brand, serving_*,
// grams, calories/protein/carbs/fat) or any object carrying { name, brand }.
function buildFoodDisplay(food, opts) {
  food = food || {};
  opts = opts || {};
  var brand = String(food.brand || '').trim();
  var pres = fdPresentName(food);
  var name = pres.name, canonical = pres.fullName;
  var estimated = (food.estimated === true) || fdIsEstimatedServing(food.serving_description);

  var serving = fdServingLabel(food, {});
  var badges = [];
  if (opts.verified !== false && (food.usda_fdc_id != null || food.source === 'usda' || opts.verified === true)) {
    badges.push('USDA');
  }

  var cals = fdCalories(food.calories);
  var model = {
    name: name || String(canonical).trim() || 'Food',
    fullName: String(canonical).trim() || name || '',
    brand: brand,
    variety: pres.variety,
    serving: serving,
    estimated: estimated,
    calories: cals,
    caloriesLabel: cals + ' kcal',
    protein: _fdRound(food.protein),
    carbs: _fdRound(food.carbs),
    fat: _fdRound(food.fat),
    macroSummary: fdMacroSummary(food, opts),
    badges: badges,
  };
  // Identity secondary parts (brand • variety) — the UI appends serving/qty
  // calories/macros; a resolved row shows the quantity-adjusted TOTAL calories.
  model.secondaryParts = fdSecondaryParts(model, {});
  model.ariaLabel = fdAria(model);
  return model;
}

// Build the presentation model for a persisted daily-log row (food_logs). The
// stored macros are the TOTAL snapshot (already × servings), so they are shown
// as-is. Serving text may be absent (older rows / not selected in the query).
function buildLogDisplay(row, opts) {
  row = row || {};
  opts = opts || {};
  var brand = String(row.brand || '').trim();
  var isUsda = row.source === 'usda';
  // Manual entries keep the user's own words verbatim; USDA rows go through the
  // ONE shared name pipeline (same primary name + variety as every other surface).
  var pres = isUsda ? fdPresentName(row) : { name: String(row.name || '').trim(), variety: '', fullName: String(row.name || '').trim() };
  var servings = (+row.servings > 0) ? +row.servings : 1;
  var compact = fdCompactServing(row);
  var cals = fdCalories(row.calories);
  var model = {
    name: pres.name || 'Food',
    fullName: pres.fullName,
    brand: brand,
    variety: pres.variety,
    servings: servings,
    servingsLabel: (servings === 1) ? '' : (fdQty(servings) + '×'),
    serving: compact.text,
    estimated: compact.estimated,
    calories: cals,
    caloriesLabel: cals + ' kcal',
    macroSummary: fdMacroSummary(row, opts),
    hasServingText: !!(row.serving_description && String(row.serving_description).trim()),
  };
  model.secondaryParts = fdSecondaryParts(model, {});
  model.ariaLabel = fdAria(model);
  return model;
}

// Clarification-CHOICE model — built from the full RAW candidate so the chooser
// and the resolved row share one grammar. Primary name + brand/variety secondary,
// with a per-100 g calorie basis (a normalized comparison across records — see
// fdSecondaryParts). Display-only: the caller keeps `raw` and resolves from IT.
function buildChoiceDisplay(candidate) {
  candidate = candidate || {};
  var pres = fdPresentName(candidate);
  var brand = String(candidate.brand || '').trim();
  var kcalRaw = (candidate.nutrients && candidate.nutrients.kcal != null) ? candidate.nutrients.kcal
              : (candidate.kcal != null ? candidate.kcal : null);
  var model = {
    name: pres.name || 'Food',
    fullName: pres.fullName,
    brand: brand,
    variety: pres.variety,
    kcalPer100g: (kcalRaw != null && isFinite(+kcalRaw)) ? _fdRound(kcalRaw) : null,
    caloriesBasis: '100g',
  };
  model.secondaryParts = fdSecondaryParts(model, { calories: '100g' });
  var aria = [model.fullName || model.name];
  if (model.brand && aria[0].toLowerCase().indexOf(model.brand.toLowerCase()) === -1) aria.push(model.brand);
  if (model.variety && aria[0].toLowerCase().indexOf(model.variety.toLowerCase()) === -1) aria.push(model.variety);
  if (model.kcalPer100g != null) aria.push(model.kcalPer100g + ' kcal/100 g');
  model.ariaLabel = aria.filter(Boolean).join(', ');
  return model;
}

// Compact single-line label for chips (recents, saved-meal card preview): the
// shared simplified primary name only — no two-line card. The accessible label
// retains the full canonical name (+ brand) so a truncated chip stays identifiable.
function fdCompactLabel(food) {
  food = food || {};
  var pres = fdPresentName(food);
  var brand = String(food.brand || '').trim();
  var aria = [pres.fullName || pres.name];
  if (brand && aria[0].toLowerCase().indexOf(brand.toLowerCase()) === -1) aria.push(brand);
  return { name: pres.name || 'Food', variety: pres.variety, ariaLabel: aria.filter(Boolean).join(', ') };
}

// Accessible one-line description of a display model. Uses the FULL canonical
// name (not the simplified one) so assistive tech / non-hover mobile users get
// the complete food identity even when the visible label is truncated.
function fdAria(model) {
  var bits = [model.fullName || model.name];
  if (model.brand && bits[0].toLowerCase().indexOf(model.brand.toLowerCase()) === -1) bits.push(model.brand);
  if (model.serving) bits.push(model.serving);
  if (model.estimated) bits.push('estimated portion');
  bits.push(model.caloriesLabel);
  return bits.filter(Boolean).join(', ');
}

/* ── Node exports (guarded — browsers ignore this block) ───────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fdNum: fdNum,
    fdQty: fdQty,
    fdUnitWord: fdUnitWord,
    fdIsEstimatedServing: fdIsEstimatedServing,
    fdSplitServing: fdSplitServing,
    fdCleanPhrase: fdCleanPhrase,
    fdServingLabel: fdServingLabel,
    fdCompactServing: fdCompactServing,
    fdStripBrandSuffix: fdStripBrandSuffix,
    fdStripBrandPrefix: fdStripBrandPrefix,
    fdExtractVariety: fdExtractVariety,
    fdApplyLox: fdApplyLox,
    fdSimplifyName: fdSimplifyName,
    fdCalories: fdCalories,
    fdMacroSummary: fdMacroSummary,
    fdPresentName: fdPresentName,
    fdSecondaryParts: fdSecondaryParts,
    buildFoodDisplay: buildFoodDisplay,
    buildLogDisplay: buildLogDisplay,
    buildChoiceDisplay: buildChoiceDisplay,
    fdCompactLabel: fdCompactLabel,
  };
}

/* ── Browser global ──────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.FoodDisplay = {
    fdNum: fdNum,
    fdQty: fdQty,
    fdUnitWord: fdUnitWord,
    fdIsEstimatedServing: fdIsEstimatedServing,
    fdSplitServing: fdSplitServing,
    fdCleanPhrase: fdCleanPhrase,
    fdServingLabel: fdServingLabel,
    fdCompactServing: fdCompactServing,
    fdStripBrandSuffix: fdStripBrandSuffix,
    fdStripBrandPrefix: fdStripBrandPrefix,
    fdExtractVariety: fdExtractVariety,
    fdApplyLox: fdApplyLox,
    fdSimplifyName: fdSimplifyName,
    fdCalories: fdCalories,
    fdMacroSummary: fdMacroSummary,
    fdPresentName: fdPresentName,
    fdSecondaryParts: fdSecondaryParts,
    buildFoodDisplay: buildFoodDisplay,
    buildLogDisplay: buildLogDisplay,
    buildChoiceDisplay: buildChoiceDisplay,
    fdCompactLabel: fdCompactLabel,
  };
}
