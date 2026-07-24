// food-portion.js — Shared Vague Portion Intelligence core (Phase 4.2.5)
//
// The pure, DOM-free, fetch-free intelligence that turns imprecise human portion
// language ("a handful of almonds", "a splash of milk", "half a plate of pasta")
// into reasonable, EXPLAINABLE, deterministic quantity estimates. Like
// food-core.js / food-ranking.js / food-memory.js it runs in two runtimes:
//   • Browser — loaded via <script> AFTER food-core.js (it reuses its globals:
//     nuScalePer100, nuRound, nuRound1, nuTitleCase). Load order on nutrition.html:
//     food-core.js → food-ranking.js → food-memory.js → food-portion.js → nutrition.js.
//   • Node — guarded module.exports (same pattern as the other shared modules);
//     the resolver, tests, and benchmarks require() the EXACT production logic.
//
// ── Where this sits in the architecture (one interpreter, every surface) ──────
// Serving selection for a resolved food is owned by food-core.js nuAiChooseServing.
// This module is the VAGUE branch of that decision: when the user's measure is a
// vague phrase not satisfied by an explicit weight or a verified USDA household
// serving, nuAiChooseServing calls nuInterpretVaguePortion to produce a
// category-aware estimate (or a clarification/unsupported signal). Search, AI
// Quick Log, Saved Meals, Barcode, and future Voice/Photo/AI Coach all reach it
// through that single seam — no feature owns its own portion logic.
//
// ── The product rule (never violated) ────────────────────────────────────────
// Prefer verified deterministic portion knowledge. Use user correction memory
// when available. Ask for clarification when uncertainty is too high. NEVER
// present an invented estimate as an exact measured quantity — every estimate
// carries a "~" in its label, an explicit range, a confidence, and provenance.
//
// ── Determinism ──────────────────────────────────────────────────────────────
// The same (phrase, food, correction) always yields the same result. No RNG, no
// LLM, no network. The AI parser may HINT the phrase (unit string), but every
// gram value is produced here from the verified tables below, never by the model.

'use strict';

/* ── Shared primitives (reused, never re-implemented) ───────────────────────── */
var _pcore = (typeof require === 'function') ? require('./food-core.js') : null;
function _scalePer100(n, g) { return _pcore ? _pcore.nuScalePer100(n, g) : nuScalePer100(n, g); }
function _round(v)          { return _pcore ? _pcore.nuRound(v)        : nuRound(v); }
function _round1(v)         { return _pcore ? _pcore.nuRound1(v)       : nuRound1(v); }
function _titleCase(s)      { return _pcore ? _pcore.nuTitleCase(s)    : nuTitleCase(s); }

/* ── Portion taxonomy ─────────────────────────────────────────────────────────
 * Synonymous phrases collapse to ONE canonical class. Each class declares the
 * physical FORM it is meaningful for (so "a splash of almonds" is rejected rather
 * than silently estimated) and whether it is CONTAINER-DEPENDENT (a bowl/plate is
 * inherently size-uncertain → lower confidence, clarify sooner). Extend a synonym
 * here; never scatter one-off string comparisons through the resolver. */

// Physical form buckets a food can occupy, derived from its family (below).
var NU_PT_FORM = {
  SOLID: 'solid',            // countable/scoopable solids (nuts, chips, greens…)
  LIQUID: 'liquid',          // pourable liquids (milk, cream, juice, broth)
  POURABLE: 'pourable',      // viscous pourables (oil, syrup, honey, dressing, sauce)
  SEASONING: 'seasoning',    // salt, spices, powders taken in tiny amounts
  MEAL: 'meal',              // composite dishes served on a plate/bowl
};

// class → { forms:[allowed physical forms], container:bool, count:bool }.
// `count` classes ("several", "few") are quantity multipliers, not size measures.
var NU_PORTION_CLASSES = {
  handful:      { forms: ['solid'],                        container: false },
  pinch:        { forms: ['seasoning'],                    container: false },
  dash:         { forms: ['seasoning', 'liquid', 'pourable'], container: false },
  splash:       { forms: ['liquid'],                       container: false },
  drizzle:      { forms: ['pourable'],                     container: false },
  spoonful:     { forms: ['solid', 'pourable', 'seasoning', 'liquid'], container: false },
  scoop:        { forms: ['solid', 'pourable'],            container: false },
  slice:        { forms: ['solid', 'meal'],                container: false },
  piece:        { forms: ['solid', 'meal'],                container: false },
  cupful:       { forms: ['solid', 'liquid', 'pourable'],  container: true  },
  bowl:         { forms: ['solid', 'liquid', 'meal'],      container: true  },
  plate:        { forms: ['solid', 'meal'],                container: true  },
  serving:      { forms: ['solid', 'liquid', 'pourable', 'meal'], container: true },
  portion:      { forms: ['solid', 'liquid', 'pourable', 'meal'], container: true },
  helping:      { forms: ['solid', 'meal'],                container: true  },
  small_amount: { forms: ['solid', 'liquid', 'pourable', 'seasoning', 'meal'], container: true },
  several:      { forms: ['solid'],                        container: false, count: true },
  few:          { forms: ['solid'],                        container: false, count: true },
};

// Phrase → { class, modifier, count }. Longest phrases first so "small handful"
// beats "handful". Modifiers are captured separately (below); this table only
// needs the base nouns + a few fixed multi-word idioms.
var NU_PORTION_SYNONYMS = {
  'handful': 'handful', 'handfull': 'handful',
  'pinch': 'pinch',
  'dash': 'dash',
  'splash': 'splash', 'splish': 'splash',
  'drizzle': 'drizzle',
  'spoonful': 'spoonful', 'spoon': 'spoonful', 'scoopful': 'scoop',
  'scoop': 'scoop',
  'slice': 'slice',
  'piece': 'piece', 'chunk': 'piece',
  'cupful': 'cupful',
  'bowl': 'bowl', 'bowlful': 'bowl',
  'plate': 'plate', 'plateful': 'plate',
  'serving': 'serving', 'serve': 'serving',
  'portion': 'portion',
  'helping': 'helping',
  'bit': 'small_amount', 'little': 'small_amount', 'some': 'small_amount', 'touch': 'small_amount',
  'several': 'several', 'few': 'few', 'couple': 'few',
};

// Size / intensity modifiers → canonical modifier token. Applied as a multiplier
// (NU_PT_MOD_MULT). "big", "generous", "large" all mean the same size bump.
var NU_PORTION_MODIFIERS = {
  tiny: 'tiny', teeny: 'tiny',
  small: 'small', little: 'small', light: 'small', scant: 'small',
  medium: 'medium', regular: 'medium', normal: 'medium', standard: 'medium',
  large: 'large', big: 'large', generous: 'large', huge: 'large', good: 'large',
  heaping: 'heaping', heaped: 'heaping', rounded: 'heaping',
  level: 'level', flat: 'level',
  packed: 'packed', tight: 'packed',
  loose: 'loose',
  thin: 'thin', thick: 'thick',
  single: 'single', double: 'double', triple: 'triple',
};

// Multiplier by modifier. Chosen so a small/large handful of nuts lands on the
// canonical ~20 g / ~40 g serving sizes off a 28 g base. Class-specific overrides
// live in NU_PT_MOD_BY_CLASS (e.g. "double" is a count, not a size, for handful).
var NU_PT_MOD_MULT = {
  tiny: 0.5, small: 0.7, medium: 1.0, large: 1.4,
  heaping: 1.4, level: 0.85, packed: 1.3, loose: 0.9,
  thin: 0.7, thick: 1.4, single: 1.0, double: 2.0, triple: 3.0,
};

// A pair of opposite-direction modifiers in one phrase ("small huge bowl") is
// contradictory — we never multiply them, we clarify.
var NU_PT_MOD_SIGN = {
  tiny: -1, small: -1, level: -1, thin: -1,
  large: 1, heaping: 1, packed: 1, thick: 1, double: 1, triple: 1,
};

/* ── Food-family classification ───────────────────────────────────────────────
 * A vague phrase must never resolve from the phrase alone when the food category
 * materially changes the expected quantity (a handful of almonds ≠ a handful of
 * spinach). Family is keyed on WHAT THE FOOD IS — its USDA description first
 * (most specific), then its USDA foodCategory — never on what the user typed.
 * Order matters: the first matching rule wins, so specific families precede
 * broad ones. Unknown → 'generic' (estimated only where form-safe, low
 * confidence). */
// Regexes use a LEADING word boundary and stemmed roots (no trailing \b) so
// plurals match ("blueberr" → "blueberries"). First match wins → specific before
// broad; "noodle soup" must classify as soup, so soup precedes pasta.
var NU_FAMILY_DESC = [
  // [family, /description regex/]
  ['peanut_butter', /\b(peanut|almond|cashew|nut)\s*butter/],
  ['protein_powder', /\b(protein powder|whey|casein|protein isolate)/],
  ['soup', /\b(soup|broth|chowder|bisque|stew)/],
  ['pizza', /\bpizza/],
  ['nuts', /\b(almond|cashew|walnut|pecan|pistachio|peanut|hazelnut|macadamia|nut)/],
  ['seeds', /\b(seed|sunflower seed|pumpkin seed|chia|flax)/],
  ['leafy_greens', /\b(spinach|kale|lettuce|arugula|green|salad green|romaine|chard|rocket)/],
  ['berries', /\b(blueberr|strawberr|raspberr|blackberr|berry|berries)/],
  ['dried_fruit', /\b(raisin|craisin|prune|dried fruit)/],
  ['popcorn', /\bpopcorn/],
  ['chips', /\b(chip|crisp|tortilla chip|potato chip)/],
  ['crackers', /\b(cracker|pretzel)/],
  ['shredded_cheese', /\b(shredded|grated)\b[^,]*chees|chees[^,]*\b(shredded|grated)/],
  ['candy', /\b(candy|gummy|gummies|jelly bean|skittles|chocolate chip)/],
  ['ice_cream', /\bice cream|\bgelato|\bfrozen yogurt/],
  ['cheese', /\bchees/],
  ['yogurt', /\byogh?urt/],
  ['cereal', /\b(cereal|cheerio|granola|corn flake|bran flake)/],
  ['oats', /\b(oat|oatmeal|porridge)/],
  ['rice', /\brice/],
  ['pasta', /\b(pasta|spaghetti|penne|macaroni|noodle|linguine|fettuccine)/],
  ['bread', /\b(bread|toast|bagel|bun|roll|baguette|pita|tortilla)/],
  ['oil', /\boil/],
  ['dressing', /\b(dressing|vinaigrette|mayo|mayonnaise|aioli)/],
  ['syrup', /\b(syrup|maple)/],
  ['honey', /\bhoney/],
  ['sauce', /\b(sauce|ketchup|gravy|salsa|soy sauce|hot sauce|sriracha)/],
  ['salt', /\bsalt/],
  ['spice', /\b(pepper|spice|cinnamon|paprika|cumin|garlic powder|onion powder|oregano|nutmeg)/],
  ['sugar', /\bsugar/],
  ['meat', /\b(chicken|turkey|beef|steak|pork|salmon|fish|tuna|shrimp|bacon|ham|breast|thigh|meat)/],
  ['fruit', /\b(apple|banana|orange|pear|peach|mango|grape|melon|fruit)/],
];
var NU_FAMILY_CATEGORY = [
  ['nuts', /nut and seed/i],
  ['leafy_greens', /vegetable/i],
  ['fruit', /fruit/i],
  ['cereal', /breakfast cereal/i],
  ['oats', /cereal grains/i],
  ['pasta', /pasta/i],
  ['oil', /fats and oils/i],
  ['spice', /spices and herbs/i],
  ['cheese', /dairy/i],
  ['meat', /(poultry|beef|pork|sausage|finfish|lamb|veal)/i],
  ['soup', /soups, sauces/i],
  ['bread', /baked/i],
  ['candy', /sweets/i],
  ['chips', /snacks/i],
];

// Family → physical form. Drives phrase/food COMPATIBILITY. A family absent here
// is treated as a solid.
var NU_FAMILY_FORM = {
  oil: 'pourable', dressing: 'pourable', syrup: 'pourable', honey: 'pourable',
  sauce: 'pourable', peanut_butter: 'pourable',
  salt: 'seasoning', spice: 'seasoning', sugar: 'seasoning',
  // protein_powder is a scoopable solid (a "scoop"/"spoonful" of it), not a
  // tiny-amount seasoning — leaving it to default 'solid'.
  soup: 'liquid',
  // meal-form composites (a "plate"/"bowl" of these makes sense)
  pasta: 'meal_solid', rice: 'meal_solid', pizza: 'meal',
};

// Classify a normalized/raw food into a family. Accepts either the normalized
// NormalizedFood (description/name + is_liquid + raw.foodCategory) or the trimmed
// candidate (description/foodCategory). Pure and deterministic.
function nuFoodFamily(food) {
  if (!food) return 'generic';
  var desc = String(food.description || food.name || '').toLowerCase();
  var cat = String(food.foodCategory || (food.raw && food.raw.foodCategory) || '');
  for (var i = 0; i < NU_FAMILY_DESC.length; i++) {
    if (NU_FAMILY_DESC[i][1].test(desc)) return NU_FAMILY_DESC[i][0];
  }
  for (var j = 0; j < NU_FAMILY_CATEGORY.length; j++) {
    if (NU_FAMILY_CATEGORY[j][1].test(cat)) return NU_FAMILY_CATEGORY[j][0];
  }
  return 'generic';
}

// The physical form a family occupies. A food flagged is_liquid overrides to
// LIQUID unless it is a known pourable/seasoning (oil stays pourable). Used only
// for compatibility; families default to solid.
function nuFamilyForm(family, isLiquid) {
  var f = NU_FAMILY_FORM[family];
  if (f === 'meal_solid') return isLiquid ? 'liquid' : 'solid';   // pasta/rice: solid meal component
  if (f) return f;
  if (isLiquid) return 'liquid';
  return 'solid';
}

/* ── Deterministic estimate tables ────────────────────────────────────────────
 * class → family → { g, min, max }  (grams; ml for liquid foods — the number is
 * the same, the UNIT is chosen from the food's form at estimate time).
 * `_` is the class's family-agnostic default (used, at reduced confidence, when
 * the family is unknown but the class is still estimable). Ranges are real: a
 * vague phrase is inherently imprecise, so we keep min/max and log a documented
 * representative (the `g`, near the median). Do not extend without a defensible
 * source; these mirror common USDA/FNDDS household weights. */
var NU_PORTION_GRAMS = {
  handful: {
    nuts:            { g: 28, min: 20, max: 35 },
    seeds:           { g: 28, min: 18, max: 35 },
    leafy_greens:    { g: 12, min: 8,  max: 20 },
    berries:         { g: 45, min: 30, max: 60 },
    fruit:           { g: 45, min: 30, max: 60 },
    dried_fruit:     { g: 35, min: 25, max: 45 },
    chips:           { g: 18, min: 12, max: 28 },
    crackers:        { g: 20, min: 14, max: 30 },
    popcorn:         { g: 8,  min: 5,  max: 12 },
    shredded_cheese: { g: 28, min: 20, max: 35 },
    candy:           { g: 30, min: 20, max: 45 },
    cereal:          { g: 15, min: 10, max: 25 },
    _:               { g: 28, min: 18, max: 40 },
  },
  pinch: {
    salt:  { g: 0.4, min: 0.3, max: 0.6 },
    spice: { g: 0.5, min: 0.3, max: 1 },
    sugar: { g: 0.5, min: 0.3, max: 1 },
    _:     { g: 0.5, min: 0.3, max: 1 },
  },
  dash: {
    salt:  { g: 0.6, min: 0.3, max: 1 },
    spice: { g: 0.6, min: 0.3, max: 1 },
    sauce: { g: 3,   min: 2,   max: 6 },
    _:     { g: 3,   min: 1,   max: 6 },
  },
  splash: {
    _: { g: 15, min: 8, max: 25 },            // ~1 tbsp of a liquid
  },
  drizzle: {
    oil:      { g: 9,  min: 5,  max: 14 },
    dressing: { g: 15, min: 10, max: 25 },
    syrup:    { g: 20, min: 12, max: 30 },
    honey:    { g: 21, min: 12, max: 30 },
    sauce:    { g: 16, min: 10, max: 25 },
    _:        { g: 12, min: 6,  max: 20 },
  },
  spoonful: {
    peanut_butter: { g: 16, min: 12, max: 24 },
    sugar:         { g: 12, min: 8,  max: 16 },
    honey:         { g: 21, min: 15, max: 28 },
    rice:          { g: 15, min: 10, max: 25 },
    _:             { g: 15, min: 10, max: 22 },   // ~1 tablespoon
  },
  scoop: {
    protein_powder: { g: 31, min: 28, max: 35 },
    ice_cream:      { g: 66, min: 50, max: 90 },
    _:              { g: 40, min: 25, max: 60 },
  },
  slice: {
    bread:  { g: 28, min: 22, max: 40 },
    cheese: { g: 20, min: 14, max: 28 },
    pizza:  { g: 107, min: 80, max: 140 },
    _:      { g: 30, min: 18, max: 60 },
  },
  piece: {
    meat:   { g: 85, min: 55, max: 140 },
    bread:  { g: 28, min: 22, max: 40 },
    cheese: { g: 28, min: 18, max: 40 },
    fruit:  { g: 120, min: 80, max: 180 },
    candy:  { g: 8,  min: 4,  max: 15 },
    pizza:  { g: 107, min: 80, max: 140 },
    _:      { g: 60, min: 30, max: 120 },
  },
  cupful: {
    leafy_greens: { g: 30, min: 20, max: 45 },
    rice:         { g: 158, min: 130, max: 200 },
    pasta:        { g: 140, min: 110, max: 180 },
    cereal:       { g: 40, min: 28, max: 60 },
    berries:      { g: 150, min: 120, max: 180 },
    sugar:        { g: 200, min: 180, max: 220 },
    _:            { g: 120, min: 80, max: 180 },
  },
  bowl: {
    cereal:    { g: 40, min: 30, max: 60 },       // dry cereal in a bowl
    oats:      { g: 40, min: 30, max: 60 },
    soup:      { g: 245, min: 200, max: 350 },
    rice:      { g: 158, min: 120, max: 220 },
    pasta:     { g: 140, min: 110, max: 200 },
    yogurt:    { g: 170, min: 130, max: 245 },
    ice_cream: { g: 130, min: 90,  max: 180 },
    berries:   { g: 140, min: 100, max: 180 },
    leafy_greens: { g: 70, min: 45, max: 100 },
    _:         { g: 200, min: 120, max: 350 },
  },
  plate: {
    pasta: { g: 200, min: 150, max: 300 },
    rice:  { g: 200, min: 150, max: 300 },
    meat:  { g: 150, min: 100, max: 220 },
    _:     { g: 250, min: 150, max: 400 },
  },
  serving: {
    _: { g: 100, min: 60, max: 180 },
  },
  portion: {
    _: { g: 100, min: 60, max: 180 },
  },
  helping: {
    _: { g: 150, min: 90, max: 250 },
  },
  small_amount: {
    _: { g: 15, min: 5, max: 40 },
  },
};

// Base confidence per class (when the family is KNOWN). Container-dependent
// classes sit lower — their size varies with the vessel, not the food. Generic
// (family unknown) subtracts NU_PT_GENERIC_PENALTY. All confidence tuning is
// centralized here; the resolver never hardcodes a confidence.
var NU_PT_BASE_CONF = {
  handful: 0.82, pinch: 0.8, dash: 0.72, splash: 0.75, drizzle: 0.72,
  spoonful: 0.7, scoop: 0.74, slice: 0.74, piece: 0.55,
  cupful: 0.62, bowl: 0.55, plate: 0.45,
  serving: 0.5, portion: 0.5, helping: 0.48,
  small_amount: 0.35, several: 0.4, few: 0.4,
};
var NU_PT_GENERIC_PENALTY = 0.22;   // family unknown → we are guessing more
// Classes whose estimate does not depend on the food family (a splash is ~1 tbsp
// of ANY liquid) → the `_` table entry is verified, so no generic penalty.
var NU_PT_FAMILY_AGNOSTIC = { splash: 1 };
// piece-of-meat is especially cut/size dependent → below the clarify floor so it
// asks ("a piece of chicken" → how big?).
var NU_PT_PIECE_MEAT_CONF = 0.48;
// Below this a MATERIAL estimate should ask instead of silently logging.
var NU_PT_CLARIFY_BELOW = 0.5;
// A user-supplied size modifier on a container-dependent class resolves the main
// uncertainty (they told us the size), so confidence is lifted above clarify.
var NU_PT_SIZED_CONTAINER_CONF = 0.62;

// Count words → a numeric multiplier (a "couple"/"few" is ~2–3, "several" ~5).
var NU_PT_COUNT_VALUE = { few: 3, several: 5 };

/* ── Phrase detection + modifier extraction ───────────────────────────────────
 * Parse a unit string (already lowercased/singularized upstream, but we are
 * defensive) into { portionClass, modifier, modifiers[], count } or null when it
 * is not a vague phrase at all (a real unit like "oz"/"cup 240ml"/"tbsp" — those
 * stay with nuAiChooseServing's existing exact/verified/volume handling). */
function nuDetectPortionPhrase(unit) {
  var raw = String(unit == null ? '' : unit).toLowerCase().trim();
  if (!raw) return null;
  var toks = raw.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  var cls = null, mods = [];
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i].replace(/s$/, '');            // singularize (handfuls → handful)
    if (!cls && NU_PORTION_SYNONYMS[t]) { cls = NU_PORTION_SYNONYMS[t]; continue; }
    if (!cls && NU_PORTION_SYNONYMS[toks[i]]) { cls = NU_PORTION_SYNONYMS[toks[i]]; continue; }
    if (NU_PORTION_MODIFIERS[t]) mods.push(NU_PORTION_MODIFIERS[t]);
    else if (NU_PORTION_MODIFIERS[toks[i]]) mods.push(NU_PORTION_MODIFIERS[toks[i]]);
  }
  if (!cls) return null;
  // Dedupe modifiers, keep order.
  var seen = {}, umods = [];
  mods.forEach(function (m) { if (!seen[m]) { seen[m] = 1; umods.push(m); } });
  return { portionClass: cls, modifier: umods[0] || null, modifiers: umods };
}

// Are two of the modifiers pulling in opposite directions? ("small huge bowl")
function nuContradictoryModifiers(mods) {
  var pos = false, neg = false;
  (mods || []).forEach(function (m) {
    if (NU_PT_MOD_SIGN[m] === 1) pos = true;
    if (NU_PT_MOD_SIGN[m] === -1) neg = true;
  });
  return pos && neg;
}

// Effective size multiplier for (class, modifiers). "double"/"triple" on a
// non-count class act as size multipliers; on handful they behave as counts (a
// "double handful" is two handfuls) — but the parser already folds explicit
// counts into quantity, so here we treat double/triple uniformly as size.
function nuModifierMultiplier(portionClass, mods) {
  var mult = 1;
  (mods || []).forEach(function (m) {
    var k = NU_PT_MOD_MULT[m];
    if (k != null) mult *= k;
  });
  return mult;
}

/* ── The interpreter ──────────────────────────────────────────────────────────
 * nuInterpretVaguePortion is the ONE entry point every surface reaches (through
 * nuAiChooseServing). Pure: no DOM, no fetch, no mutation of its inputs.
 *
 * Input:
 *   { unit, food, per100, isLiquid, correction, quantity }
 *     unit        — the raw measure word from the ResolveRequest ("large handful")
 *     food        — normalized/raw food (for family + description in the explanation)
 *     per100      — the food's per-100 g/ml nutrient panel (macros come from here,
 *                   never invented). Absent ⇒ we cannot build perUnit → not applied.
 *     isLiquid    — the food's stable is_liquid flag (ml vs g estimate unit)
 *     correction  — an already-MATCHED portion correction { grams } for this
 *                   food+class, or null (matching is the caller's job; see
 *                   nuMatchPortionCorrection)
 *
 * Output (VaguePortion) — always structured, never throws:
 *   { detected, portionClass, phrase, modifier, family, form,
 *     compatible, estimatedAmount, estimatedUnit, range:{min,max},
 *     confidence, requiresClarification, clarification, basis, provenance,
 *     explanation }
 * detected:false ⇒ not a vague phrase → caller continues its normal handling. */
function nuInterpretVaguePortion(input) {
  input = input || {};
  var det = nuDetectPortionPhrase(input.unit);
  if (!det) return { detected: false };

  var cls = det.portionClass;
  var mods = det.modifiers || [];
  var food = input.food || null;
  var family = nuFoodFamily(food);
  var isLiquid = !!input.isLiquid;
  var form = nuFamilyForm(family, isLiquid);
  var spec = NU_PORTION_CLASSES[cls] || { forms: ['solid'], container: false };
  var phrase = (det.modifier ? det.modifier + ' ' : '') + cls.replace('_', ' ');

  function base(extra) {
    return Object.assign({
      detected: true, portionClass: cls, phrase: phrase, modifier: det.modifier || null,
      modifiers: mods, family: family, form: form,
      compatible: true, estimatedAmount: null, estimatedUnit: null,
      range: null, confidence: 0, requiresClarification: false, clarification: null,
      basis: 'unsupported', provenance: null, explanation: '',
    }, extra || {});
  }

  // (A) COUNT words ("several almonds") — a multiplier, not a size. We do NOT
  //     fabricate a gram weight; report the count so the caller can multiply an
  //     item/natural serving, and flag low confidence.
  if (spec.count) {
    return base({
      compatible: form === 'solid', count: NU_PT_COUNT_VALUE[cls] || 1,
      confidence: 0.4, basis: 'count',
      provenance: { kind: 'vague-portion-count', portionClass: cls, count: NU_PT_COUNT_VALUE[cls] || 1 },
      explanation: 'Interpreted “' + cls + '” as about ' + (NU_PT_COUNT_VALUE[cls] || 1) + '.',
    });
  }

  // (B) FORM COMPATIBILITY — reject nonsensical pairings outright rather than
  //     forcing an estimate ("a splash of almonds", "a pinch of chicken",
  //     "a handful of water", "a bowl of olive oil").
  var allowed = spec.forms.indexOf(form) !== -1 ||
    // meal-form composites also satisfy 'solid' classes (a slice/piece of a solid)
    (form === 'meal' && spec.forms.indexOf('meal') !== -1);
  if (!allowed) {
    return base({
      compatible: false, confidence: 0, basis: 'unsupported',
      provenance: { kind: 'vague-portion-unsupported', portionClass: cls, family: family, form: form },
      explanation: 'A “' + cls + '” isn’t a sensible measure for this food — please give a weight or serving.',
    });
  }

  // Estimate UNIT follows the food's stable is_liquid flag: a food USDA measures
  // in ml has no reliable gram weight, so we estimate in ml and never fabricate a
  // gram value (parity with the rest of the serving engine). `form` (from the
  // family) is used only for phrase COMPATIBILITY, not for the unit.
  var unit = isLiquid ? 'ml' : 'g';
  // Small amounts (seasonings, a splash) keep one decimal so a pinch of salt is
  // "~0.4 g", not a meaningless "~0 g"; larger amounts round to whole g/ml.
  function amt(v) { return (Math.abs(v) < 10) ? _round1(v) : _round(v); }

  // (C) CORRECTION MEMORY — a strong prior portion correction for this food+class
  //     overrides the default estimate (the user has taught us THEIR portion). It
  //     only ever replaces an otherwise-INFERRED estimate, never a verified
  //     serving (which is resolved before this interpreter is ever reached).
  if (input.correction && +input.correction.grams > 0) {
    var cg = +input.correction.grams;
    return base({
      confidence: Math.max(0.85, +input.correction.confidence || 0),
      basis: 'correction-memory',
      estimatedAmount: amt(cg), estimatedUnit: unit,
      range: { min: amt(cg), max: amt(cg) },
      perUnit: input.per100 ? _scalePer100(input.per100, cg) : null,
      provenance: {
        kind: 'vague-portion-estimate', source: 'correction-memory',
        portionClass: cls, family: family, modifier: det.modifier || null,
        defaultAmount: nuTableAmount(cls, family), correctedAmount: amt(cg), correctionApplied: true,
      },
      explanation: 'Using your usual corrected portion for ' + phrase + ' (~' + amt(cg) + ' ' + unit + ').',
    });
  }

  // (D) DETERMINISTIC ESTIMATE from the category table.
  var table = NU_PORTION_GRAMS[cls];
  var entry = table && (table[family] || table._);
  if (!entry) {
    // Class exists but is not estimable at all (no table / no default) → clarify.
    return base({
      requiresClarification: true, confidence: 0.3, basis: 'generic',
      clarification: nuPortionClarification(cls, family),
      provenance: { kind: 'vague-portion-estimate', portionClass: cls, family: family },
      explanation: 'About how much was it?',
    });
  }

  // Contradictory modifiers ("small huge bowl") → keep a neutral estimate but
  // always clarify (never silently pick one direction).
  var contradiction = nuContradictoryModifiers(mods);
  var mult = contradiction ? 1 : nuModifierMultiplier(cls, mods);
  var rounded = amt(entry.g * mult);
  var lo = amt(entry.min * mult), hi = amt(entry.max * mult);

  // Confidence: base by class, reduced when the family is unknown — EXCEPT for
  // classes whose estimate is family-agnostic by design (a splash is ~1 tbsp of
  // any liquid), where `_` IS the verified value, not a fallback guess.
  var familyKnown = !!(table && table[family]) || !!NU_PT_FAMILY_AGNOSTIC[cls];
  var conf = NU_PT_BASE_CONF[cls] != null ? NU_PT_BASE_CONF[cls] : 0.5;
  if (!familyKnown) conf -= NU_PT_GENERIC_PENALTY;
  if (cls === 'piece' && family === 'meat') conf = NU_PT_PIECE_MEAT_CONF;   // cut/size varies hugely
  // The user supplied a size ("large bowl", "large piece", "thick slice") →
  // the main uncertainty (how big) is answered, so confidence clears the floor.
  var sized = mods.length > 0 && !contradiction &&
    (spec.container || cls === 'piece' || cls === 'slice');
  if (sized && familyKnown) conf = Math.max(conf, NU_PT_SIZED_CONTAINER_CONF);

  // Ask only when the uncertainty MATERIALLY affects macros: a low-confidence
  // estimate the user has not sized, for an amount big enough to matter. A tiny
  // seasoning (< 5 g/ml) never triggers a clarify; a decisively-known handful
  // never does either. Contradictory sizing always asks.
  var material = (rounded >= 5);
  var needClar = contradiction ||
    (conf < NU_PT_CLARIFY_BELOW && material && !sized);
  var src = familyKnown ? 'verified-table' : 'generic';

  return base({
    confidence: conf, requiresClarification: needClar,
    basis: familyKnown ? 'category-table' : 'generic',
    estimatedAmount: rounded, estimatedUnit: unit,
    range: { min: lo, max: hi },
    perUnit: input.per100 ? _scalePer100(input.per100, rounded) : null,
    clarification: needClar ? nuPortionClarification(cls, family) : null,
    provenance: {
      kind: 'vague-portion-estimate', source: src,
      portionClass: cls, family: family, modifier: det.modifier || null, correctionApplied: false,
      containerDependent: !!spec.container,
    },
    explanation: contradiction
      ? 'That size is unclear — about how much was it?'
      : nuPortionExplanation(cls, family, det.modifier, rounded, unit),
  });
}

// The representative table amount for (class, family) — for correction provenance
// (what the default WOULD have been).
function nuTableAmount(cls, family) {
  var table = NU_PORTION_GRAMS[cls];
  var entry = table && (table[family] || table._);
  return entry ? entry.g : null;
}

// A concise, honest, non-overstated explanation string.
function nuPortionExplanation(cls, family, modifier, amount, unit) {
  var fam = (family && family !== 'generic') ? family.replace('_', ' ') : '';
  var sz = modifier ? (modifier + ' ') : '';
  var head = 'Estimated as ' + (/^[aeiou]/.test(sz || cls) ? 'an ' : 'a ') + sz + cls.replace('_', ' ');
  return head + (fam ? ' of ' + fam : '') + ' (~' + _round1(amount) + ' ' + unit + ').';
}

// A portion size clarification, reusing the Phase 4.2.3 clarification contract
// shape { type, target, prompt, options:[{label,patch}], allowFreeText }. The
// option patches set a SIZE-modified unit that re-enters the resolver: answering
// "Large" turns "bowl" into "large bowl", which the interpreter then resolves
// with confidence (the user has supplied the missing size). target 'unit' so the
// answer patches the ResolveRequest's unit, not its query.
function nuPortionClarification(cls, family) {
  var noun = cls.replace('_', ' ');
  return {
    type: 'portion', target: 'unit',
    prompt: 'About how much ' + (family && family !== 'generic' ? family.replace('_', ' ') : 'food') +
            ' was that?',
    options: [
      { label: 'Small ' + noun, patch: { unit: 'small ' + noun } },
      { label: 'Medium ' + noun, patch: { unit: 'medium ' + noun } },
      { label: 'Large ' + noun, patch: { unit: 'large ' + noun } },
    ],
    allowFreeText: false,
  };
}

/* ── Portion correction matching (pure override seam) ─────────────────────────
 * Portion corrections are a DIFFERENT axis than Phase 4.2.4 candidate-identity
 * corrections (which food, not how much). A portion correction pins a gram amount
 * to a (foodKey, portionClass) pair. This selects the strongest matching
 * correction for the current food + phrase, or null. Conservative: the food
 * identity AND the vague portion class must both match — a correction for a
 * handful of almonds never changes a handful of spinach (different food) or a
 * bowl of almonds (different class). Session-scoped by construction (the caller
 * supplies the list); persistent storage is a documented follow-up.
 *
 * A correction record: { food_key, portion_class, grams, reinforcement_count?,
 * last_used_at? }.
 *
 * PERSISTENCE STATUS (Phase 4.2.5): vague-portion corrections are SESSION-SCOPED
 * only — the caller supplies the list; nothing here reads or writes a database.
 * This is distinct from Phase 4.2.4 food-IDENTITY corrections, which remain
 * persistent in public.food_corrections. Persistent cross-session PORTION
 * corrections have NOT shipped and are a deliberate future follow-up (own table,
 * migration, and write UX). This pure matcher is the seam that follow-up plugs
 * into unchanged. */
function nuMatchPortionCorrection(corrections, foodKey, portionClass) {
  if (!Array.isArray(corrections) || !foodKey || !portionClass) return null;
  var best = null;
  for (var i = 0; i < corrections.length; i++) {
    var c = corrections[i];
    if (!c || +c.grams <= 0) continue;
    if (c.food_key !== foodKey) continue;               // identity must match
    if (c.portion_class !== portionClass) continue;     // class must match
    if (!best || (+c.reinforcement_count || 1) > (+best.reinforcement_count || 1)) best = c;
  }
  if (!best) return null;
  return { grams: +best.grams, reinforcement_count: +best.reinforcement_count || 1,
           confidence: 0.9, source: best.origin || 'session' };
}

// Build a portion-correction record from a user's explicit serving edit on a
// vague-portion row: they changed an ESTIMATED portion to a specific gram amount.
// Provenance-rich, data-minimal, mirrors food-memory.js discipline. The caller
// persists/echoes it; this module only shapes it.
function nuBuildPortionCorrection(o) {
  o = o || {};
  if (!o.food_key || !(+o.grams > 0) || !o.portion_class) return null;
  return {
    food_key: o.food_key,
    portion_class: o.portion_class,
    grams: +o.grams,
    family: o.family || null,
    origin: 'session',
    reinforcement_count: 1,
    last_used_at: new Date().toISOString(),
  };
}

/* ── Node exports (guarded — browsers ignore this block) ─────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NU_PORTION_CLASSES: NU_PORTION_CLASSES,
    NU_PORTION_SYNONYMS: NU_PORTION_SYNONYMS,
    NU_PORTION_MODIFIERS: NU_PORTION_MODIFIERS,
    NU_PT_MOD_MULT: NU_PT_MOD_MULT,
    NU_PORTION_GRAMS: NU_PORTION_GRAMS,
    NU_PT_BASE_CONF: NU_PT_BASE_CONF,
    NU_PT_CLARIFY_BELOW: NU_PT_CLARIFY_BELOW,
    nuDetectPortionPhrase: nuDetectPortionPhrase,
    nuContradictoryModifiers: nuContradictoryModifiers,
    nuModifierMultiplier: nuModifierMultiplier,
    nuFoodFamily: nuFoodFamily,
    nuFamilyForm: nuFamilyForm,
    nuInterpretVaguePortion: nuInterpretVaguePortion,
    nuTableAmount: nuTableAmount,
    nuPortionExplanation: nuPortionExplanation,
    nuPortionClarification: nuPortionClarification,
    nuMatchPortionCorrection: nuMatchPortionCorrection,
    nuBuildPortionCorrection: nuBuildPortionCorrection,
  };
}
