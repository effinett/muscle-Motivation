/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Food-Resolution Core (Phase 4.2.1)
 *
 * The pure food-resolution intelligence shared by every logging surface:
 * manual search, AI text logging, barcode, saved meals, favorites/recents —
 * and every future one (voice, photo, AI Coach). No DOM, no fetch, no
 * Supabase: everything here is deterministic input → output.
 *
 * Dual runtime:
 *   • Browser — loaded via <script src="food-core.js"> BEFORE nutrition.js
 *     (nutrition.html, app.html); defines the same globals nutrition.js
 *     always used.
 *   • Node — guarded module.exports at the bottom (same pattern as
 *     snapshot.js/weight.js) so server routes, tests, and benchmarks can
 *     require() the exact production logic.
 *
 * Shared contracts (produced/consumed across files — do not reshape):
 *   ResolveRequest — { text, query, brand, quantity, unit, grams }
 *                    (the /api/ai-food-parse item schema)
 *   Candidate      — the trimmed USDA food /api/usda-search + /api/usda-barcode
 *                    return: { fdcId, description, dataType, foodCategory,
 *                    brand, gtinUpc, servingSize, servingSizeUnit,
 *                    householdServing, nutrients{kcal,protein,carbs,fat,
 *                    fiber,sugar}, group, score }
 *   NormalizedFood — nuNormalizeUsdaFood output (per-serving macros +
 *                    identity + is_liquid/has_serving flags + raw)
 *   Portion        — { label, gramWeight, amount } (/api/usda-food trimmed)
 *
 * Functions moved verbatim from nutrition.js (Phase 4.2.1a) — names and
 * behavior unchanged; nutrition.js and the pages call them exactly as before.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── scaling math ──────────────────────────────────────────────────────── */

function nuRound(n) { return Math.round((+n || 0)); }
function nuRound1(n) { return Math.round((+n || 0) * 10) / 10; }

// SHARED macro scaling — the ONE place per-serving macros are multiplied by a
// quantity. Used by the live detail readout AND the save payload so the displayed
// and stored values can never diverge. Calories round to whole; grams to 1 dp.
function nuScaleMacros(base, qty) {
  base = base || {};
  var q = +qty || 1;
  return {
    calories: nuRound((+base.calories || 0) * q),
    protein:  nuRound1((+base.protein || 0) * q),
    carbs:    nuRound1((+base.carbs   || 0) * q),
    fat:      nuRound1((+base.fat     || 0) * q),
    fiber:    nuRound1((+base.fiber   || 0) * q),
    sugar:    nuRound1((+base.sugar   || 0) * q),
  };
}

// Per-UNIT macros for `g` grams of a food, from its per-100 g nutrient panel.
// The single weight-accurate scaling used by every serving option below.
function nuScalePer100(n, g) {
  n = n || {}; var k = (+g || 0) / 100;
  return {
    calories: nuRound((+n.kcal   || 0) * k),
    protein:  nuRound1((+n.protein || 0) * k),
    carbs:    nuRound1((+n.carbs  || 0) * k),
    fat:      nuRound1((+n.fat    || 0) * k),
    fiber:    nuRound1((+n.fiber  || 0) * k),
    sugar:    nuRound1((+n.sugar  || 0) * k),
  };
}

/* ── candidate normalization ───────────────────────────────────────────── */

// Convert one trimmed USDA food (nutrients per 100 g + serving info) into a
// PER-SERVING object matching what the Add form / nuSaveLog expect.
function nuNormalizeUsdaFood(f) {
  var per100 = f.nutrients || {};
  var size = +f.servingSize;
  var unit = (f.servingSizeUnit || '').toLowerCase();
  // USDA branded data mixes plain units with UNECE codes — many records say
  // 'GRM'/'MLT' where others say 'g'/'ml'. Same measure, so map them across.
  if (unit === 'grm') unit = 'g';
  if (unit === 'mlt') unit = 'ml';
  var factor, grams, servingAmount, servingUnit, servingDesc;

  if (size > 0 && (unit === 'g' || unit === 'gram' || unit === 'grams' || unit === 'ml')) {
    factor = size / 100;                       // scale per-100g down to one serving
    grams = (unit === 'ml') ? null : size;     // ml has no reliable gram weight
    servingAmount = size; servingUnit = unit;
    servingDesc = f.householdServing || (nuRound1(size) + ' ' + unit);
  } else {
    factor = 1;                                // base unit is 100 g
    grams = 100; servingAmount = 100; servingUnit = 'g';
    servingDesc = f.householdServing || '100 g';
  }
  function sc(v) { return nuRound1((+v || 0) * factor); }

  return {
    usda_fdc_id: f.fdcId,
    name: f.brand ? (f.description + ' (' + f.brand + ')') : f.description,
    description: f.description || '',     // bare USDA name (card title; name keeps the brand suffix)
    brand: f.brand || '',
    group: f.group || 'generic',          // 'branded' | 'generic' (from the proxy ranking)
    has_serving: size > 0,                // did USDA give a real manufacturer serving?
    is_liquid: size > 0 && unit === 'ml', // stable flag: USDA measures this food in ml
    gtin_upc: f.gtinUpc || '',            // branded barcode (for future barcode lookup)
    serving_description: servingDesc,
    serving_amount: servingAmount,
    serving_unit: servingUnit,
    grams: grams,
    // per-serving macros
    calories: nuRound((+per100.kcal || 0) * factor),
    protein: sc(per100.protein),
    carbs:   sc(per100.carbs),
    fat:     sc(per100.fat),
    fiber:   sc(per100.fiber),
    sugar:   sc(per100.sugar),
    raw: f,
  };
}

/* ── serving engine ────────────────────────────────────────────────────── */

// Build the serving-size dropdown options for a normalized USDA food.
//   • USDA household portions (Phase 3.1.4 — from the detail endpoint; only when a
//     real gramWeight is provided) — e.g. "1 large (50 g)", "1 cup (158 g)".
//   • manufacturer serving (when USDA provided one)
//   • 100 g and 1 oz + custom grams (only for weight-based foods; never for ml,
//     where there is no reliable gram weight to convert)
// Each option carries the PER-UNIT macros so quantity simply multiplies them.
// `portions` is optional and additive — absent ⇒ exactly the Phase 3.1.2 options.
function nuBuildServingOptions(f, portions) {
  var opts = [];
  var per100 = f.raw && f.raw.nutrients ? f.raw.nutrients : null;
  // is_liquid is set once at normalize time — serving_unit mutates as the user
  // switches servings, so it can't be trusted to classify the food here.
  var weightBased = per100 && !f.is_liquid;

  // Accurate household servings first (gram-weighted, straight from USDA).
  if (per100 && portions && portions.length) {
    portions.forEach(function (p, idx) {
      var g = +p.gramWeight;
      if (!(g > 0)) return;                       // only real gram weights — never fabricate
      opts.push({ key: 'p' + idx, label: p.label + ' (' + nuRound(g) + ' g)',
        perUnit: nuScalePer100(per100, g), grams: g, amount: p.amount || 1, unit: 'serving',
        description: p.label });
    });
  }

  if (f.has_serving) {
    // The food's own serving. Recompute from per-100 g when grams are known so it
    // stays consistent with the other gram options; fall back to the ml per-serving.
    var per = (weightBased && f.grams) ? nuScalePer100(per100, f.grams)
      : { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar };
    opts.push({ key: 'serving', label: f.serving_description || '1 serving', perUnit: per,
      grams: f.grams != null ? f.grams : null, amount: f.serving_amount, unit: f.serving_unit,
      description: f.serving_description || '1 serving' });
  }
  if (weightBased) {
    opts.push({ key: '100g', label: '100 g', perUnit: nuScalePer100(per100, 100),
      grams: 100, amount: 100, unit: 'g', description: '100 g' });
    opts.push({ key: 'oz', label: '1 oz (28 g)', perUnit: nuScalePer100(per100, 28.3495),
      grams: 28.3495, amount: 1, unit: 'oz', description: '1 oz (28 g)' });
    opts.push({ key: 'lb', label: '1 lb (454 g)', perUnit: nuScalePer100(per100, 453.592),
      grams: 453.592, amount: 1, unit: 'lb', description: '1 lb (454 g)' });
    opts.push({ key: 'custom', label: 'Custom grams…', custom: true });
  } else if (per100 && f.is_liquid) {
    // Liquids: USDA nutrients are per 100 ml here (normalizer scaled by ml serving
    // size). Volume options only — never a fabricated gram weight (grams: null).
    opts.push({ key: '100ml', label: '100 ml', perUnit: nuScalePer100(per100, 100),
      grams: null, amount: 100, unit: 'ml', description: '100 ml' });
    opts.push({ key: 'floz', label: '1 fl oz (30 ml)', perUnit: nuScalePer100(per100, 29.5735),
      grams: null, amount: 1, unit: 'fl oz', description: '1 fl oz (30 ml)' });
    opts.push({ key: 'cupml', label: '1 cup (240 ml)', perUnit: nuScalePer100(per100, 240),
      grams: null, amount: 1, unit: 'cup', description: '1 cup (240 ml)' });
    opts.push({ key: 'custom', label: 'Custom ml…', custom: true });
  }
  if (!opts.length) {
    // Last resort (e.g. ml food with no serving): log the per-serving values as-is.
    opts.push({ key: 'serving', label: f.serving_description || '1 serving',
      perUnit: { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar },
      grams: f.grams, amount: f.serving_amount, unit: f.serving_unit, description: f.serving_description || '1 serving' });
  }
  return opts;
}

/* ── ONE serving-selection rule, shared by the search LIST and detail card ──
 * The list must preview EXACTLY the serving the card defaults to:
 *   • generic food with USDA household portions → first (most natural) portion
 *   • food with a manufacturer serving          → that serving
 *   • otherwise                                 → 100 g
 * Portions come from the same /api/usda-food cache in both places; nothing is
 * ever fabricated — no portions means both places honestly show 100 g.
 * ─────────────────────────────────────────────────────────────────────────── */
function nuDefaultServingKey(f, opts, portions) {
  if (!f.has_serving && portions && portions.length && opts.length) return opts[0].key;
  if (f.has_serving) return 'serving';
  return opts[0] && opts[0].key;
}

// DEPRECATED (Phase 4.2.5): the flat hand-measure table was superseded by the
// category-aware Vague Portion Intelligence in food-portion.js
// (nuInterpretVaguePortion), which nuAiChooseServing now calls. A handful of nuts
// is still 28 g there, but a handful of spinach is 12 g, chips 18 g, etc. This
// constant is retained + exported only for backward compatibility; it is no
// longer consulted by the resolver. Do not add new callers.
var NU_APPROX_UNITS = { 'handful': 28, 'small handful': 20, 'large handful': 40 };

// Universal VOLUME units for liquids (per-100ml panels): a tbsp is 15 ml for
// every liquid — this is unit conversion, not a fabricated weight. Used only
// when no real USDA portion matched. cup/fl-oz already exist as options.
var NU_VOLUME_ML = { tsp: 5, teaspoon: 5, tbsp: 15, tablespoon: 15 };

// Verified cup weights for semi-solid families whose Foundation/SR records
// carry NO cup portion at all. yogurt: 245 g/cup per USDA FNDDS (fdcIds
// 2705418–2705424 — identical for Greek/regular and every fat level; SR
// 171284/170886/170887 concur for regular). LAST resort by construction:
// applied only after the matched food's own portions AND the alike-candidate
// retry both fail (Effi-approved 2026-07-13; do not extend without new
// verified values).
var NU_CUP_GRAMS = { yogurt: 245 };

// The table serving for a matched food, or null when it doesn't apply:
// cup units only, weight-based foods only, and the matched USDA description
// must START with the family word — keyed on what the food IS, never on
// what the user typed.
function nuAiCupServing(f, parsed) {
  var u = String(parsed.unit || '').toLowerCase().trim().replace(/s$/, '');
  if (u !== 'cup') return null;
  var per100 = f.raw && f.raw.nutrients ? f.raw.nutrients : null;
  if (!per100 || f.is_liquid) return null;
  var name = String(f.description || f.name || '').toLowerCase();
  for (var k in NU_CUP_GRAMS) {
    if (name.indexOf(k) === 0) {
      var g = NU_CUP_GRAMS[k];
      return { perUnit: nuScalePer100(per100, g), grams: g, amount: g, unit: 'g',
               description: '1 cup (~' + g + ' g)' };
    }
  }
  return null;
}

// Leading count in a serving label: "2 tbsp (32 g)" → 2, "0.5 cup" → 0.5,
// "1/2 cup" → 0.5, "1 large" → 1. The user's quantity is in THEIR unit, so
// servings = quantity ÷ this count — "1/2 cup oats" on a "0.5 cup" serving is
// ONE serving, and "1 tbsp peanut butter" on a "2 tbsp" portion is HALF.
function nuAiLabelCount(opt) {
  var m = String(opt.description || opt.label || '').match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/);
  if (!m) return 1;
  var t = m[1];
  if (t.indexOf('/') >= 0) {
    var p = t.split('/');
    var v = (+p[0]) / (+p[1]);
    return v > 0 ? v : 1;
  }
  return (+t > 0) ? +t : 1;
}

// The shared Vague Portion Intelligence module (Phase 4.2.5). Acquired lazily so
// there is no load-time cycle: food-portion.js requires food-core.js, so
// food-core must NOT require food-portion during its own load. In Node we
// require() at call time (both modules are fully loaded by then); in the browser
// food-portion.js is loaded as a <script> before nutrition.js and defines the
// globals referenced here. Returns null if the module is absent (parity fallback).
function nuPortionModule() {
  if (typeof require === 'function') {
    try { return require('./food-portion.js'); } catch (e) { return null; }
  }
  return (typeof nuInterpretVaguePortion === 'function')
    ? { nuInterpretVaguePortion: nuInterpretVaguePortion,
        nuDetectPortionPhrase: (typeof nuDetectPortionPhrase === 'function') ? nuDetectPortionPhrase : null,
        nuDetectFromRawText: (typeof nuDetectFromRawText === 'function') ? nuDetectFromRawText : null,
        nuMatchPortionCorrection: (typeof nuMatchPortionCorrection === 'function') ? nuMatchPortionCorrection : null }
    : null;
}

// The card's own default serving (portion/serving/100 g), extracted so both the
// normal fall-through and the unsupported-vague fallback share one rule.
function nuDefaultChosenServing(f, opts, portions) {
  var key = nuDefaultServingKey(f, opts, portions);
  for (var j = 0; j < opts.length; j++) if (opts[j].key === key) return opts[j];
  return opts[0];
}

// The VAGUE branch of serving selection (Phase 4.2.5). Runs the shared
// interpreter for the resolved food and turns a supported estimate into a serving
// descriptor (matchedUnit + estimated + the full VaguePortion as `portion`).
// Returns:
//   • null                          — not a vague phrase → caller continues
//   • { …serving…, portion, … }     — a supported/clarify estimate to use
//   • { unsupported: true, portion } — a vague phrase we can't honor (a splash of
//                                      almonds) → caller falls back + flags it
// Deterministic; never throws (a missing module or panel degrades to null).
function nuVaguePortionServing(f, per100, parsed) {
  var mod = nuPortionModule();
  if (!mod || typeof mod.nuInterpretVaguePortion !== 'function') return null;
  // Session portion-correction override (Phase 4.2.5): match the user's prior
  // corrections for THIS food identity + THIS vague class only. The corrections
  // list is supplied on the request (parsed.portionCorrections) — the resolver
  // stays pure; the browser/session or a test provides it. Persistent
  // cross-session storage is a documented follow-up.
  var correction = null;
  if (typeof mod.nuMatchPortionCorrection === 'function' && parsed.portionCorrections) {
    // Same class the interpreter will use: the explicit unit, or a small-amount
    // quantifier recovered from the raw phrase when the parser gave no unit.
    var det = mod.nuDetectPortionPhrase(parsed.unit);
    if (!det && !parsed.unit && typeof mod.nuDetectFromRawText === 'function') {
      det = mod.nuDetectFromRawText(parsed.text, parsed.query);
    }
    if (det) correction = mod.nuMatchPortionCorrection(parsed.portionCorrections, nuFoodKey(f), det.portionClass);
  }
  var vp = mod.nuInterpretVaguePortion({
    unit: parsed.unit, rawText: parsed.text, query: parsed.query,
    quantity: parsed.quantity, food: f, per100: per100,
    isLiquid: !!f.is_liquid, correction: correction,
  });
  if (!vp || !vp.detected) return null;                 // real/unknown unit → normal handling
  if (!vp.compatible || vp.estimatedAmount == null || !per100) {
    return { unsupported: true, portion: vp };          // nonsensical or unestimable → fall back + flag
  }
  var unit = vp.estimatedUnit;
  var grams = (unit === 'g') ? vp.estimatedAmount : null;  // never fabricate a gram weight for a liquid
  return {
    perUnit: vp.perUnit || nuScalePer100(per100, vp.estimatedAmount),
    grams: grams, amount: vp.estimatedAmount, unit: unit,
    description: vp.phrase + ' (~' + vp.estimatedAmount + ' ' + unit + ')',
    matchedUnit: true, estimated: true, portion: vp,
  };
}

// Pick the serving option that matches what the user said, using the SAME
// option list the food card builds. Priority (Phase 4.2.5 precedence — exact and
// verified data always beat an inference):
//   1. explicit weight ("6 oz" → 170 g) — weight foods only, never ml→g
//   2. the household word they used ("slice", "cup") found in a verified option label
//   3. vague-portion intelligence ("handful"/"splash"/"bowl", or a "some"/"a little"
//      quantifier recovered from the raw phrase when the parser dropped it) —
//      category-aware estimate, correction override, range/confidence/provenance
//   4. liquids: tsp/tbsp volume conversion
//   5. the card's own default (nuDefaultServingKey — portion/serving/100 g)
function nuAiChooseServing(f, opts, portions, parsed) {
  var per100 = f.raw && f.raw.nutrients ? f.raw.nutrients : null;
  if (+parsed.grams > 0 && per100 && !f.is_liquid) {
    // grams is the TOTAL stated weight ("6 oz" → quantity 6, unit oz,
    // grams 170) — wholeQuantity tells the resolver NOT to multiply by
    // quantity again, or 6 oz of chicken would log as 6 × 170 g.
    var g = +parsed.grams;
    return { perUnit: nuScalePer100(per100, g), grams: g, amount: g, unit: 'g',
             description: nuRound(g) + ' g', wholeQuantity: true, matchedUnit: true };
  }
  // (2) VERIFIED household serving — only when the user gave an explicit unit. A
  // real USDA serving/portion label always wins over a vague estimate, so this
  // runs before the vague branch.
  var u = null;
  if (parsed.unit) {
    var uFull = String(parsed.unit).toLowerCase().trim().replace(/s$/, '');
    // ≥2 chars so a bare 'g' can't substring-match every label. A matched
    // option carries unitCount so the resolver can divide the user's quantity by
    // the label's own count ("1/2 cup" serving ≠ half of it).
    u = uFull.split(' ').pop();
    if (u.length >= 2) {
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].custom) continue;
        if (String(opts[i].label || '').toLowerCase().indexOf(u) !== -1) {
          return Object.assign({ unitCount: nuAiLabelCount(opts[i]), matchedUnit: true }, opts[i]);
        }
      }
    }
  }
  // (3) Vague portion intelligence — runs whether or not an explicit unit was
  // given, so a small-amount quantifier the parser dropped ("some rice" → unit
  // null) is recovered from parsed.text by the interpreter. Never overrides the
  // explicit-weight (1) or verified-serving (2) branches above.
  var vp = nuVaguePortionServing(f, per100, parsed);
  if (vp) {
    if (!vp.unsupported) return vp;
    var dfb = Object.assign({}, nuDefaultChosenServing(f, opts, portions));
    dfb.portion = vp.portion;                       // provenance travels; matchedUnit stays unset → row flags it
    return dfb;
  }
  // (4) Liquids: tsp/tbsp are pure volume conversions (per-100ml panel × ml).
  if (parsed.unit && per100 && f.is_liquid) {
    var ml = NU_VOLUME_ML[u];
    if (ml) {
      return { perUnit: nuScalePer100(per100, ml), grams: null, amount: ml, unit: 'ml',
               description: '1 ' + u + ' (' + ml + ' ml)', matchedUnit: true };
    }
  }
  return nuDefaultChosenServing(f, opts, portions);
}

/* ── confidence & chooser ──────────────────────────────────────────────── */

// Restaurant/prepared-dish categories where "where from?" matters more than
// any single top hit — a double cheeseburger varies hugely between homemade,
// McDonald's, and Five Guys, so the review sheet always asks instead of
// auto-picking one (ask-never-guess rule).
var NU_ASK_CATEGORIES = { 'fast foods': 1, 'restaurant foods': 1 };

// Confidence rule for auto-selecting the top search hit. The proxy's ranking
// already encodes it: a GENERIC lead means the canonical-food scoring was
// solid ("chicken" → breast); a BRANDED lead without the user naming that
// brand means a crowded guess ("protein bar", "cereal") — never auto-pick one
// brand for them. Naming the brand ("quest bar") restores confidence. And a
// restaurant-dish category is never confident, whoever leads.
//
// COMPATIBILITY WRAPPER (Phase 4.2.3, checkpoint 2): resolveItem no longer calls
// this — the shared nuAssessConfidence verdict now owns the interrupt decision.
// Retained, exported, and behaviorally UNCHANGED for any external caller and for
// the H1–H4 parity tests. Its single-food semantics (judge one top hit, not the
// pool) differ from the verdict's, so it is intentionally NOT re-expressed as a
// thin delegate — that would change its meaning. See the migration report.
function nuAiIsConfident(parsed, topFood) {
  if (NU_ASK_CATEGORIES[String(topFood.foodCategory || '').toLowerCase()]) return false;
  if ((topFood.group || 'generic') !== 'branded') return true;
  var b = (parsed.brand || '').toLowerCase().split(' ')[0];
  if (b && String(topFood.brand || '').toLowerCase().indexOf(b) !== -1) return true;
  return false;
}

// Are these candidates the SAME food, nutritionally? Compared on the uniform
// per-100g panels the proxy returns. Tolerances are tight enough that real
// differences keep the chooser: dry vs cooked rice (~360 vs ~130 kcal),
// Cheerios vs Froot Loops (sugar), Quest vs Barebells (kcal/fat) all still
// ask — but four near-identical jasmine rices collapse to one.
function nuAiChoicesAlike(foods) {
  if (foods.length < 2) return true;
  function spreadOk(key, absTol, relTol) {
    var vals = foods.map(function (f) { return +((f.nutrients || {})[key]) || 0; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    return (max - min) <= Math.max(absTol, ((min + max) / 2) * relTol);
  }
  return spreadOk('kcal', 30, 0.15) && spreadOk('protein', 2.5, 0.2) &&
         spreadOk('carbs', 5, 0.2) && spreadOk('fat', 2.5, 0.2) &&
         spreadOk('sugar', 5, 0.25);
}

// Order-free name signature: unique singularized tokens, sorted. "JASMINE
// RICE" and "JASMINE RICE, JASMINE" are the same name; "QUEST CHOCOLATE CHIP"
// and "QUEST COOKIES & CREAM" are not (flavors are a real choice).
// Marketing filler that doesn't distinguish foods — "PURE MAPLE SYRUP",
// "ORGANIC MAPLE SYRUP", and "MAPLE SYRUP" are the same name.
var NU_SIG_FILLER = { pure: 1, organic: 1, natural: 1, original: 1, premium: 1, classic: 1, real: 1, '100': 1 };

function nuAiNameSig(desc) {
  var seen = {}, out = [];
  String(desc || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(function (t) {
    if (!t || NU_SIG_FILLER[t]) return;
    var s = t.replace(/s$/, '');
    if (s && !seen[s] && !NU_SIG_FILLER[s]) { seen[s] = 1; out.push(s); }
  });
  return out.sort().join(' ');
}

// Collapse TRUE duplicates: same name signature AND nutritionally alike.
// Four interchangeable jasmine rices become one option; a cooked-basis panel
// or a different flavor survives as its own option.
function nuAiDedupeChoices(cands) {
  var kept = [];
  cands.forEach(function (c) {
    var dup = kept.some(function (k) {
      return nuAiNameSig(k.description) === nuAiNameSig(c.description) &&
             nuAiChoicesAlike([k, c]);
    });
    if (!dup) kept.push(c);
  });
  return kept;
}

/* ── shared confidence & ambiguity contract (Phase 4.2.3, checkpoint 1) ─────
 * nuAssessConfidence is the ONE place every surface (AI Quick Log today;
 * Manual Search, Voice, Photo, AI Coach later) reads "should we interrupt the
 * user, and how" from the Phase 4.2.2 ORDERED-CANDIDATE contract. It is a pure
 * CONSUMER of ranking evidence — it never reorders candidates (ranking owns
 * order; confidence owns interpretation).
 *
 * Provider-neutral BY CONTRACT: it reads only the shared ResolveRequest
 * (request.brand, request.query) and the normalized Candidate fields
 * (group, score, foodCategory, brand, description, nutrients) — never a
 * USDA-specific field name. Brand intent is derived from request.brand (the
 * shared request already carries it), NOT propagated from private ranking
 * context, so ranking output is untouched.
 *
 * Verdict shape (structured evidence, NOT a synthetic 0..1 score — a numeric
 * confidence scalar is deliberately deferred until a consumer needs it / it can
 * be calibrated, Phase 4.2.7):
 *   { disposition, level, candidate, alternatives, ambiguity[], reasons[],
 *     material, evidence:{topScore,runnerUpScore,gap,scoreAvailable},
 *     clarification }
 *
 * disposition — the decision model:
 *   'auto_resolve'    (level high)   — one clear winner → resolve automatically
 *   'choose_candidate'(level medium) — ≥2 plausible, material, distinct foods → bounded choice
 *   'unresolved'      (level low)    — no viable candidate → safe terminal
 *   'clarify_input'   (level low)    — a chooser fully explained by ONE dominant,
 *       material dimension (brand / preparation / form) → one focused question
 *       (see the clarification section below). CONSERVATIVE + ACTIVE (checkpoint 4,
 *       policy.targetedClarification defaults ON): only ever refines an already-
 *       interruptible choose_candidate, so it never turns an auto_resolve into an
 *       interruption. resolveItem surfaces it as a `needsClarification` review item.
 *   Ambiguity types: identity, brand, category, preparation, form. The PORTION
 *   axis stays with resolveFood (unitUnresolved) — portion-basis clarification
 *   belongs to the serving layer, not this candidate-level pass (future work).
 *
 * Third arg `policy` (optional) is an explicit per-call override
 * { scoreEscalation?, targetedClarification? } for tests and future activation;
 * omitted → the shipped NU_CONFIDENCE defaults. When scores are absent the
 * verdict degrades to today's group-based behavior, so consumption is parity-safe.
 * ─────────────────────────────────────────────────────────────────────────── */

// Tunable confidence policy. INITIAL HYPOTHESES — the score-gap band will be
// calibrated against benchmark score distributions in Phase 4.2.7; do not treat
// these as settled constants. All confidence tuning happens here, not in code.
var NU_CONFIDENCE = {
  gapDecisive: 800,   // top-vs-runner-up score lead treated as a clear winner
  maxAlternatives: 4, // bounded chooser set (matches foods.slice(0,4) today)
  // Score-gap / brand-variant ESCALATIONS (a generic or matched-brand lead that
  // today auto-resolves becoming a chooser when a materially-different runner-up
  // is close on score). These are the ONLY verdict paths that diverge from the
  // legacy nuAiIsConfident decision, so they ship OFF: with the flag false the
  // verdict reproduces today's behavior exactly (Checkpoint 2 parity migration).
  // Turned on only with benchmark calibration + approval in a later checkpoint.
  scoreEscalation: false,
  // Targeted clarification (Phase 4.2.3): a bounded chooser that is fully
  // explained by ONE dominant, material dimension (brand / preparation / form)
  // becomes a single focused question instead. A SEPARATE policy from
  // scoreEscalation (never a catch-all). ACTIVE (checkpoint 4): it only refines
  // an already-interruptible choose_candidate base, so no auto_resolve case is
  // ever turned into an interruption while scoreEscalation stays false.
  targetedClarification: true,
  // Meal-context DISPOSITION changes (Phase 4.2.6). Meal evidence is ALWAYS
  // computed and recorded as diagnostics/provenance when a meal context exists;
  // this flag gates ONLY whether that evidence may CHANGE a disposition (suppress
  // a clarification the meal strongly supports, or escalate an auto_resolve the
  // meal contradicts into a chooser). Ships OFF so meal context never silently
  // increases clarifications — with it false, meal context influences RANKING and
  // provenance only, and the disposition is byte-for-byte today's.
  mealContext: false,
};

// Effective policy for one assessment: an explicit per-call override (used by
// tests and future activation) wins over the shipped NU_CONFIDENCE defaults, so
// production behavior never depends on mutating shared global config.
function nuResolvePolicy(policy) {
  return {
    scoreEscalation: (policy && 'scoreEscalation' in policy)
      ? !!policy.scoreEscalation : NU_CONFIDENCE.scoreEscalation,
    targetedClarification: (policy && 'targetedClarification' in policy)
      ? !!policy.targetedClarification : NU_CONFIDENCE.targetedClarification,
    mealContext: (policy && 'mealContext' in policy)
      ? !!policy.mealContext : NU_CONFIDENCE.mealContext,
  };
}

/* ── Meal-reasoning bridge (Phase 4.2.6) ─────────────────────────────────────
 * Lazily reach the shared meal-reasoning core (food-meal.js) WITHOUT a
 * load-order or circular-require problem: prefer the browser global (food-meal.js
 * loads AFTER food-core.js, so the global exists by resolve time), and fall back
 * to a guarded Node require. Returns null when the module is absent (app.html, or
 * a test VM that didn't load it) — meal reasoning then simply doesn't apply and
 * resolution behaves exactly as before. Never throws. */
var _nuMealMod = null, _nuMealTried = false;
function nuMealApi() {
  if (typeof nuMealAssess === 'function') return { assess: nuMealAssess };
  if (!_nuMealTried && typeof require === 'function') {
    _nuMealTried = true;
    try { _nuMealMod = require('./food-meal.js'); } catch (e) { _nuMealMod = null; }
  }
  return _nuMealMod ? { assess: _nuMealMod.nuMealAssess } : null;
}

// Attach meal evidence to a finished verdict (always, as diagnostics), and apply
// the GATED disposition change (only when policy.mealContext is on). Pure w.r.t.
// inputs except the freshly-built verdict it owns; safe to mutate that in place.
function nuFinalizeMeal(verdict, request, list, policy) {
  var proj = request && request.mealContext;
  if (!proj) return verdict;
  var api = nuMealApi();
  if (!api || typeof api.assess !== 'function') return verdict;
  var ev;
  try { ev = api.assess(proj, verdict.candidate || (list && list[0]) || null); } catch (e) { ev = null; }
  if (!ev || !ev.active) return verdict;

  // Always-on diagnostics/provenance (present regardless of the gate).
  verdict.meal = { support: !!ev.support, conflict: !!ev.conflict, reasons: ev.reasons || [] };
  (ev.reasons || []).forEach(function (r) { verdict.reasons.push({ code: 'meal_' + r, detail: '' }); });

  if (!policy.mealContext) return verdict;   // gate off → annotation only (parity)

  if (verdict.disposition === 'clarify_input' && ev.support && !ev.conflict) {
    // The rest of the meal strongly supports the top candidate → don't ask.
    verdict.disposition = 'auto_resolve';
    verdict.level = NU_DISPOSITION_LEVEL.auto_resolve;
    verdict.alternatives = [];
    verdict.clarification = null;
    verdict.reasons.push({ code: 'meal_support_suppressed_clarification', detail: '' });
  } else if (verdict.disposition === 'auto_resolve' && ev.conflict) {
    var distinct = nuAiDedupeChoices((list || []).slice(0, NU_CONFIDENCE.maxAlternatives));
    if (distinct.length >= 2) {
      verdict.disposition = 'choose_candidate';
      verdict.level = NU_DISPOSITION_LEVEL.choose_candidate;
      verdict.alternatives = distinct;
      verdict.ambiguity = verdict.ambiguity.concat(['identity']);
      verdict.material = true;
      verdict.reasons.push({ code: 'meal_conflict_escalated', detail: '' });
    }
  }
  return verdict;
}

// Preparation STATES — a small shared, identity-level vocabulary (synonyms →
// one canonical state), NOT a per-food table. A candidate carrying one state and
// not another is a different preparation of the same base food. Kept compact on
// purpose; extend a synonym here, never add food-specific logic.
var NU_PREP_STATE = {
  raw: 'raw', uncooked: 'raw',
  cooked: 'cooked', boiled: 'cooked', roasted: 'cooked', grilled: 'cooked',
  baked: 'cooked', braised: 'cooked', steamed: 'cooked', stewed: 'cooked', fried: 'cooked',
  dry: 'dry', dried: 'dry',
  prepared: 'prepared',
};
// Minimal connective stopwords stripped before comparing candidate descriptors
// (so "canned IN water" vs "canned IN oil" distinguish on water/oil).
var NU_DESC_STOP = { a: 1, an: 1, the: 1, of: 1, with: 1, in: 1, and: 1, or: 1, for: 1, style: 1 };

var NU_DISPOSITION_LEVEL = {
  auto_resolve: 'high', choose_candidate: 'medium', clarify_input: 'low', unresolved: 'low',
};

function nuVerdict(disposition, candidate, alternatives, ambiguity, reasons, material, evidence, clarification) {
  return {
    disposition: disposition,
    level: NU_DISPOSITION_LEVEL[disposition] || 'low',
    candidate: candidate || null,
    alternatives: alternatives || [],
    ambiguity: ambiguity || [],
    reasons: reasons || [],
    material: !!material,
    evidence: evidence,
    clarification: clarification || null,
  };
}

// Score evidence from the ordered pool. scoreAvailable is false for adapters
// that don't stamp scores (older callers, some tests) — the verdict then falls
// back to group-based reasoning, preserving today's behavior.
function nuConfEvidence(list) {
  var top = list[0], next = list[1];
  var ts = (top && typeof top.score === 'number' && isFinite(top.score)) ? top.score : null;
  var rs = (next && typeof next.score === 'number' && isFinite(next.score)) ? next.score : null;
  return {
    topScore: ts,
    runnerUpScore: rs,
    gap: (ts != null && rs != null) ? (ts - rs) : null,
    scoreAvailable: ts != null,
  };
}

// Brand-intent state from the SHARED REQUEST (never re-derived from ranking
// internals): did the user name a brand, and does the leading candidate carry
// it? Same first-token match nuAiIsConfident uses, kept for parity.
function nuConfBrandState(request, top) {
  var b = String((request && request.brand) || '').toLowerCase().trim().split(' ')[0];
  if (!b) return 'none';
  return String((top && top.brand) || '').toLowerCase().indexOf(b) !== -1 ? 'matched' : 'mismatched';
}

// The BASE (Checkpoint 2 parity) disposition for a ≥2-distinct set: the identity/
// brand decision nuAiIsConfident used to make. The two score-gap escalations are
// gated by policy.scoreEscalation (ship OFF → today's auto-pick). Returned as a
// verdict so nuAssessConfidence can inspect it before a clarification refinement.
function nuBaseDisposition(request, top, distinct, branded, brand, material, evidence, policy) {
  if (!branded) {
    // Generic lead — canonical scoring resolved cleanly; today auto-picks (H2),
    // unless a close, material runner-up escalates (gated; gap null → auto).
    var contested = policy.scoreEscalation &&
      material && evidence.gap != null && evidence.gap < NU_CONFIDENCE.gapDecisive;
    return contested
      ? nuVerdict('choose_candidate', top, distinct, ['identity'],
          [{ code: 'close_material_runner_up', detail: 'gap ' + evidence.gap + ' < ' + NU_CONFIDENCE.gapDecisive }], true, evidence)
      : nuVerdict('auto_resolve', top, [], [],
          [{ code: 'generic_canonical', detail: top.description || '' }], material, evidence);
  }
  if (brand === 'matched') {
    // Named brand, matched — auto-resolve unless material same-brand variants
    // escalate (gated; today auto-resolves).
    return (policy.scoreEscalation && material)
      ? nuVerdict('choose_candidate', top, distinct, ['identity'],
          [{ code: 'brand_matched_variants', detail: top.brand || '' }], true, evidence)
      : nuVerdict('auto_resolve', top, [], [],
          [{ code: 'brand_matched', detail: top.brand || '' }], false, evidence);
  }
  if (brand === 'mismatched') {
    // User named a brand we did NOT land on → brand ambiguity.
    return nuVerdict('choose_candidate', top, distinct, ['brand'],
      [{ code: 'brand_requested_unmatched', detail: String(request.brand || '') }], material, evidence);
  }
  // No brand named + branded lead — the crowded "protein bar"/"cereal" guess
  // (H4). Never auto-pick one brand for the user.
  return nuVerdict('choose_candidate', top, distinct, ['identity'],
    [{ code: 'branded_crowd', detail: top.description || '' }], material, evidence);
}

// Assess confidence for one resolution request against its ORDERED candidates.
// Pure and deterministic; never throws on shape (missing fields degrade safely).
function nuAssessConfidence(request, foods, policy) {
  policy = nuResolvePolicy(policy);
  request = request || {};
  var list = Array.isArray(foods) ? foods : [];
  var evidence = nuConfEvidence(list);

  // (0) No candidates → safe terminal (mirrors resolveItem's unmatched).
  if (!list.length) {
    return nuFinalizeMeal(nuVerdict('unresolved', null, [], ['identity'],
      [{ code: 'no_candidates', detail: 'search returned no candidates' }], false, evidence),
      request, list, policy);
  }

  var top = list[0];
  var cat = String(top.foodCategory || '').toLowerCase();

  // (1) Restaurant/prepared-dish category → always a bounded choice, whoever
  //     leads. Material by policy (homemade vs chain differ hugely); dedupe is
  //     deliberately skipped so nutritionally-tied dishes still ask "where from?"
  //     (parity with resolveItem's askCat branch + nuAiIsConfident H1). A
  //     multi-source dish is not one dominant dimension → never a clarification.
  if (NU_ASK_CATEGORIES[cat]) {
    return nuFinalizeMeal(nuVerdict('choose_candidate', top, list.slice(0, NU_CONFIDENCE.maxAlternatives),
      ['category'], [{ code: 'ask_category', detail: cat }], true, evidence),
      request, list, policy);
  }

  // TRUE distinct foods: collapse near-identical products via the shared
  // materiality dedupe (four jasmine rices → one). Same helper the chooser uses.
  var distinct = nuAiDedupeChoices(list.slice(0, NU_CONFIDENCE.maxAlternatives));
  var branded = (top.group || 'generic') === 'branded';
  var brand = nuConfBrandState(request, top);

  // (1b) HARD identity/form mismatch on the LEADING candidate (Phase 4.2.7):
  //      ranking sets `mismatch` when the user EXPLICITLY named a species /
  //      product form / collision-prone identity the top hit contradicts (e.g. no
  //      real "fairlife protein bar" exists — only Fairlife milk survives). Such a
  //      result must never be presented with certainty: offer a bounded choice
  //      when other distinct foods exist, else a safe unresolved terminal. High
  //      precision — `mismatch` is false for a normal, correctly-matched top hit,
  //      so ordinary logging is untouched (no new clarifications on clean queries).
  if (top.mismatch === true) {
    if (distinct.length >= 2) {
      return nuFinalizeMeal(nuVerdict('choose_candidate', top, distinct, ['identity'],
        [{ code: 'top_hard_mismatch', detail: top.description || '' }], true, evidence),
        request, list, policy);
    }
    return nuFinalizeMeal(nuVerdict('unresolved', null, [], ['identity'],
      [{ code: 'top_hard_mismatch_unresolved', detail: top.description || '' }], false, evidence),
      request, list, policy);
  }

  // (2) One distinct food after dedupe → no identity ambiguity → auto-resolve.
  //     (Parity: resolveItem auto-picks when dedupe collapses to a single
  //     option, e.g. a lone branded "milk" with no brand named.)
  if (distinct.length <= 1) {
    var soleCode = branded ? (brand === 'matched' ? 'brand_matched' : 'single_candidate')
                           : 'generic_canonical';
    return nuFinalizeMeal(nuVerdict('auto_resolve', top, [], [],
      [{ code: soleCode, detail: top.description || '' }], false, evidence),
      request, list, policy);
  }

  // ≥2 distinct foods remain — is the disagreement nutritionally MATERIAL?
  var material = !nuAiChoicesAlike(distinct);

  // BASE disposition (the Checkpoint 2 parity decision), built but not yet
  // returned so the clarification refinement can inspect it below.
  var base = nuBaseDisposition(request, top, distinct, branded, brand, material, evidence, policy);

  // (5) Targeted-clarification refinement (active by default; skipped when
  //     policy.targetedClarification is disabled).
  //     A bounded chooser fully explained by ONE dominant, material dimension is
  //     better asked as a single focused question. Only refines a non-category
  //     chooser — auto-resolve and category are never turned into questions.
  if (policy.targetedClarification && base.disposition === 'choose_candidate' && base.material) {
    var clar = nuDetectClarification(request, top, distinct, brand);
    if (clar) {
      return nuFinalizeMeal(nuVerdict('clarify_input', top, distinct, [clar.type],
        [{ code: 'targeted_clarification', detail: clar.type }], true, evidence, clar),
        request, list, policy);
    }
  }
  return nuFinalizeMeal(base, request, list, policy);
}

/* ── targeted clarification (Phase 4.2.3, checkpoint 4 — active) ────────────
 * Deterministic detection of the ONE dominant dimension behind an ambiguous
 * candidate set, and the surface-neutral question to resolve it. Pure: reads
 * only the shared request + normalized candidate descriptions. No LLM, no
 * per-food logic, no persistence. Answers re-enter the SAME resolver via a
 * request patch (nuApplyClarification) — never a parallel resolution path.
 *
 * MINIMAL Clarification contract (Checkpoint 3.5): { type, target, prompt,
 * options:[{label,patch}], allowFreeText }. Decision metadata is NOT duplicated
 * here — the ambiguity type lives on verdict.ambiguity and the reason on
 * verdict.reasons (one canonical location). Candidate rows are NOT embedded:
 * a UI renders `options` + `prompt`, and falls back to verdict.alternatives for
 * any "pick from the list" affordance — so no raw/stale candidate objects,
 * provider-specific fields, or nutrient payloads travel inside the clarification.
 *
 * ELIGIBILITY is independent of scoreEscalation: clarification only refines an
 * ALREADY-interruptible (choose_candidate) base, so it never needs the
 * provisional gapDecisive threshold. A generic/matched-brand case that is
 * auto-resolved today stays auto (dormant) unless scoreEscalation makes it
 * interruptible; targetedClarification then only changes HOW it is presented.
 *
 * PORTION boundary: portion-basis ambiguity is intentionally NOT detected here.
 * resolveFood/serving resolution own it (unitUnresolved); a candidate-level pass
 * only ever reports portion uncertainty already surfaced elsewhere. Targeted
 * portion questions belong to a later serving-layer checkpoint / Phase 4.2.5. */

// Local text normalizer (food-core is loaded WITHOUT food-ranking's nText):
// lowercase, non-alphanumerics → spaces. Both sides normalize identically.
function nuClarNorm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// The ONE query-patch primitive for clarification answers: append `addition`'s
// tokens to `query` with correct spacing, skipping any token already present
// (case-insensitive). Deterministic and idempotent — applying the same answer
// twice never duplicates a token ("chicken breast" + "cooked" → "chicken breast
// cooked"; applied again → unchanged). Preserves the original query text.
function nuPatchQuery(query, addition) {
  var base = String(query == null ? '' : query).trim();
  var have = {};
  nuClarNorm(base).split(' ').forEach(function (t) { if (t) have[t] = 1; });
  var add = nuClarNorm(addition).split(' ').filter(function (t) { return t && !have[t]; });
  if (!add.length) return base;                 // already present → no-op (dedupe)
  return (base ? base + ' ' : '') + add.join(' ');
}

// Distinguishing descriptor tokens per candidate: each candidate's description
// tokens minus the stopwords, minus the query, minus the tokens SHARED by every
// candidate. What's left is exactly what separates the candidates from each
// other, so a clean single-dimension split is detectable.
function nuDistinguishingTokens(distinct, request) {
  var sets = distinct.map(function (c) {
    var out = {};
    nuClarNorm(c.description).split(' ').forEach(function (t) { if (t && !NU_DESC_STOP[t]) out[t] = 1; });
    return out;
  });
  var shared = Object.assign({}, sets[0]);
  for (var i = 1; i < sets.length; i++) {
    Object.keys(shared).forEach(function (t) { if (!sets[i][t]) delete shared[t]; });
  }
  var q = {};
  nuClarNorm(request.query || '').split(' ').forEach(function (t) { if (t) q[t] = 1; });
  return sets.map(function (s) {
    return Object.keys(s).filter(function (t) { return !shared[t] && !q[t]; }).sort();
  });
}

// Did the user already state a preparation state in their own words?
function nuRequestHasPrep(request) {
  var toks = nuClarNorm((request.query || '') + ' ' + (request.text || '')).split(' ');
  for (var i = 0; i < toks.length; i++) if (NU_PREP_STATE[toks[i]]) return true;
  return false;
}

// Preparation dimension: every candidate is separated by exactly one prep-state
// token and NOTHING else (non-prep distinguishing tokens are empty), and ≥2
// distinct states appear. "raw vs cooked", "dry vs prepared".
function nuClarifyPrep(request, distinct) {
  if (nuRequestHasPrep(request)) return null;               // user already said it
  var dist = nuDistinguishingTokens(distinct, request);
  var states = {};
  for (var i = 0; i < dist.length; i++) {
    var prep = dist[i].filter(function (t) { return NU_PREP_STATE[t]; });
    var nonPrep = dist[i].filter(function (t) { return !NU_PREP_STATE[t]; });
    if (nonPrep.length || prep.length !== 1) return null;   // not a pure prep split
    states[NU_PREP_STATE[prep[0]]] = 1;
  }
  var st = Object.keys(states).sort();
  if (st.length < 2) return null;
  return {
    type: 'preparation', target: 'query',
    prompt: 'Is this ' + st.join(' or ') + '?',
    options: st.map(function (s) {
      return { label: nuTitleCase(s), patch: { query: nuPatchQuery(request.query, s) } };
    }),
    allowFreeText: false,
  };
}

// Food-form dimension: prep state is identical across candidates and each is
// separated by exactly one non-prep token, with ≥2 distinct tokens (e.g. tuna
// in "water" vs "oil"). One clear material distinction, deterministically named.
function nuClarifyForm(request, distinct) {
  var dist = nuDistinguishingTokens(distinct, request);
  var forms = {};
  for (var i = 0; i < dist.length; i++) {
    if (dist[i].some(function (t) { return NU_PREP_STATE[t]; })) return null;  // prep involved → not pure form
    if (dist[i].length !== 1) return null;                  // not a single distinguishing token
    forms[dist[i][0]] = 1;
  }
  var fk = Object.keys(forms).sort();
  if (fk.length < 2) return null;
  return {
    type: 'form', target: 'query',
    prompt: 'Which one — ' + fk.join(' or ') + '?',
    options: fk.map(function (f) {
      return { label: nuTitleCase(f), patch: { query: nuPatchQuery(request.query, f) } };
    }),
    allowFreeText: false,
  };
}

// Brand dimension: the user named a brand we did NOT land on. Its UNIQUE value
// over the chooser is asking for information the candidate rows can't convey —
// the named brand is absent, and a free-text correction (or clearing the brand)
// materially changes the next resolution. It deliberately does NOT re-list the
// candidates (that is the chooser's job / verdict.alternatives); it offers the
// free-text correction + a "search all brands" action only.
function nuClarifyBrand(request, top, distinct) {
  if (!request.brand || nuConfBrandState(request, top) !== 'mismatched') return null;
  return {
    type: 'brand', target: 'brand',
    prompt: 'We couldn’t find the brand “' + request.brand + '”. Type the correct brand, or search all brands.',
    options: [{ label: 'Search all brands', patch: { brand: '' } }],
    allowFreeText: true,
  };
}

// The single dominant dimension behind an ambiguous set, or null when none is
// dominant (mixed dimensions, or already-answered) → the caller keeps the
// chooser. Loop prevention: a dimension already in request.clarified is skipped.
function nuDetectClarification(request, top, distinct, brandState) {
  var answered = request.clarified || [];
  // Explicit brand intent is the dominant issue when present and unmatched.
  if (answered.indexOf('brand') === -1) {
    var b = nuClarifyBrand(request, top, distinct);
    if (b) return b;
  }
  var prep = answered.indexOf('preparation') === -1 ? nuClarifyPrep(request, distinct) : null;
  var form = answered.indexOf('form') === -1 ? nuClarifyForm(request, distinct) : null;
  if (prep && form) return null;              // ≥2 competing dimensions → not dominant → chooser
  return prep || form || null;
}

// Apply a clarification answer → a deterministic patch to the SHARED request
// that re-enters the same resolver. `choice` is an option index (structured) or
// a free-text string (only when allowFreeText). Records the resolved dimension
// in `clarified` so the same dimension is never asked twice (loop prevention).
function nuApplyClarification(request, clarification, choice) {
  request = request || {};
  var patch = {};
  if (typeof choice === 'number' && clarification.options && clarification.options[choice]) {
    patch = clarification.options[choice].patch || {};
  } else if (typeof choice === 'string' && clarification.allowFreeText) {
    patch[clarification.target] = choice;
  }
  var next = Object.assign({}, request, patch);
  var prev = request.clarified || [];
  next.clarified = prev.indexOf(clarification.type) === -1 ? prev.concat([clarification.type]) : prev.slice();
  return next;
}

/* ── resolution orchestrator (Phase 4.2.1b) ────────────────────────────────
 * The full resolve pipeline behind AI logging (and any future surface),
 * decoupled from HOW candidates are fetched. `source` is the SourceAdapter:
 *   { search(query) → Promise<Candidate[]>,
 *     portions(fdcId) → Promise<Portion[]> }   // [] on any failure
 * The browser binds nuUsdaSearch/nuFetchUsdaDetail (nutrition.js); a server
 * route or benchmark binds its own. Bodies are the Phase 4.2 production
 * logic verbatim — only the two adapter call sites changed.
 *
 * ORDERED-CANDIDATE CONTRACT (Phase 4.2.2): search() must return candidates
 * ALREADY ranked best-first — in production that is /api/usda-search, whose
 * ordering comes from the shared ranking core (food-ranking.js
 * rankFoodCandidates). The resolver deliberately trusts foods[0] /
 * foods.slice(0, n) and performs NO reranking of its own — one ranking
 * brain, every surface. An adapter that feeds raw (unranked) USDA output
 * violates the contract: route it through rankFoodCandidates first.
 * ─────────────────────────────────────────────────────────────────────────── */
// Trim ordered candidates into the chooser-row shape both needsChoice and the
// clarification fallback use — one place, one shape. kcal (per 100 g/ml) lets
// same-named options explain themselves; picking one replays the resolve path.
function nuChoiceRows(alternatives) {
  return (alternatives || []).map(function (rf) {
    return { raw: rf, name: rf.description || '', brand: rf.brand || '',
             kcal: (rf.nutrients || {}).kcal };
  });
}

function nuCreateResolver(source) {

  // Turn one trimmed search food + the parsed quantity/unit into a resolved
  // review-sheet item (portions + serving options exactly like the food card).
  async function resolveFood(rawFood, parsed) {
    var f = nuNormalizeUsdaFood(rawFood);
    var portions = [];
    if (f.usda_fdc_id != null) {
      try { portions = await source.portions(f.usda_fdc_id); } catch (e) { portions = []; }
    }
    if (f.raw && portions.length) f.raw.portions = portions; // same raw enrichment as the card path

    var opts = nuBuildServingOptions(f, portions);
    var sv = nuAiChooseServing(f, opts, portions, parsed);
    var qty = (+parsed.quantity > 0) ? +parsed.quantity : 1;
    // The label's own count divides the quantity ("1 tbsp" of a "2 tbsp"
    // portion = 0.5 servings); stated total weights always mean ONE serving.
    var servings = sv.wholeQuantity ? 1 : qty / (sv.unitCount > 0 ? sv.unitCount : 1);
    return {
      parsed: parsed, food: f, unmatched: false,
      matchedUnit: !!sv.matchedUnit,
      servings: Math.round(servings * 100) / 100,
      perUnit: sv.perUnit,
      serving_description: sv.description || null,
      serving_amount: sv.amount != null ? sv.amount : null,
      serving_unit: sv.unit || null,
      grams: sv.grams != null ? sv.grams : null,
      // Phase 4.2.5 vague-portion provenance — present only when a vague phrase
      // was interpreted. `estimated` marks the amount as inferred (never exact);
      // `portion` carries the full VaguePortion (class, family, range, confidence,
      // clarification, provenance) for labeling, saving, and clarification.
      estimated: !!sv.estimated,
      portion: sv.portion || null,
      // Phase 4.2.6 meal-assisted provenance — present only when this item carried
      // a meal context. Records HOW the meal influenced this pick (role/support/
      // conflict/reasons + context version) for diagnostics, benchmarks, and
      // future correction learning; never shown to users, never persisted whole.
      meal: nuMealProvenance(parsed, rawFood),
    };
  }

  // Diagnostic meal-provenance for a resolved candidate, or null when the item
  // had no meal context / the meal core is absent. Small + stable by design.
  function nuMealProvenance(parsed, rawFood) {
    var proj = parsed && parsed.mealContext;
    if (!proj) return null;
    var api = nuMealApi();
    if (!api || typeof api.assess !== 'function') return null;
    var ev;
    try { ev = api.assess(proj, rawFood); } catch (e) { ev = null; }
    if (!ev || !ev.active) return null;
    return {
      role: proj.role || null,
      support: !!ev.support,
      conflict: !!ev.conflict,
      reasons: ev.reasons || [],
      contextVersion: proj.v,
    };
  }

  // Resolve one parsed item. Never throws — a failed search returns
  // { unmatched: true } and an ambiguous one returns { needsChoice: true } with
  // the distinct candidates, so the review sheet can ask instead of guessing.
  async function resolveItem(parsed) {
    var foods = [];
    // Phase 4.2.6: pass the item's meal context to the search adapter (the browser
    // adapter serializes it into the X-Meal-Context header; fixture/live adapters
    // ignore the 2nd arg). No meal context → identical single-item search as before.
    var searchCtx = (parsed && parsed.mealContext)
      ? { mealContext: parsed.mealContext, mealIndex: parsed.mealIndex } : undefined;
    try { foods = await source.search(parsed.query, searchCtx); } catch (e) {}

    // Phase 4.2.3: the shared confidence verdict — assessed on the EXACT ordered
    // candidate array just returned (no second search) — owns the interrupt
    // decision that nuAiIsConfident + the inline dedupe/needsChoice block used to
    // make. The chooser set is the verdict's own bounded, deduped alternatives
    // (restaurant categories keep the undeduped top-4, exactly as before).
    // Parity migration: only the two shipped dispositions are acted on; the
    // score-gap / brand-variant escalations stay dormant behind
    // NU_CONFIDENCE.scoreEscalation, so this is byte-for-byte today's behavior.
    // No policy override → production defaults (scoreEscalation OFF,
    // targetedClarification ON), so the identity decision is exactly
    // Checkpoint 2's: only an already-interruptible choose_candidate base can
    // become a clarify_input, never an auto_resolve.
    var verdict = nuAssessConfidence(parsed, foods);
    if (verdict.disposition === 'unresolved') return { parsed: parsed, unmatched: true };
    if (verdict.disposition === 'clarify_input') {
      // Additive, provider-neutral shape: the deterministic question + a fallback
      // chooser (same trimmed candidate rows as needsChoice) so the UI can offer
      // "pick from the list" without re-deriving anything.
      return {
        parsed: parsed, needsClarification: true,
        clarification: verdict.clarification,
        choices: nuChoiceRows(verdict.alternatives),
      };
    }
    if (verdict.disposition === 'choose_candidate') {
      return { parsed: parsed, needsChoice: true, choices: nuChoiceRows(verdict.alternatives) };
    }
    // auto_resolve → resolve the top hit — but if the user gave a measure this food can't
    // express ("1/2 cup" of an oats entry with no cup portion), try the next
    // candidates for one that CAN. Guarded: an alternative must be
    // NUTRITIONALLY ALIKE to the top hit — the same food in a different data
    // representation — so the retry can never drift from dry oats to a cooked
    // entry just because the cooked one knows what a cup is.
    var resolved = await resolveFood(foods[0], parsed);
    if (parsed.unit && !resolved.matchedUnit) {
      // 8-deep scan: the same food's household-measure twin often sits mid-list
      // (Quaker Quick Oats' "0.5 cup" behind two Foundation entries). The alike
      // gate keeps this cheap — only same-food candidates fetch portions.
      for (var ci = 1; ci < Math.min(foods.length, 8); ci++) {
        if (!nuAiChoicesAlike([foods[0], foods[ci]])) continue;
        var alt = await resolveFood(foods[ci], parsed);
        if (alt.matchedUnit) { resolved = alt; break; }
      }
    }
    if (parsed.unit && !resolved.matchedUnit) {
      // Third rung: the verified cup table (yogurt 245 g/cup) — only reached
      // when the matched food's own portions AND the alike retry both failed,
      // so a native USDA cup always wins over the table.
      var cup = nuAiCupServing(resolved.food, parsed);
      if (cup) {
        var cq = (+parsed.quantity > 0) ? +parsed.quantity : 1;
        resolved.perUnit = cup.perUnit;
        resolved.serving_description = cup.description;
        resolved.serving_amount = cup.amount;
        resolved.serving_unit = cup.unit;
        resolved.grams = cup.grams;
        resolved.matchedUnit = true;
        resolved.servings = Math.round(cq * 100) / 100;   // fractional cups multiply
        return resolved;
      }
      // No record could express the user's measure. Their quantity is
      // denominated in THEIR unit, not in servings — applying it to a
      // mismatched serving silently halves or doubles the food ("half a cup"
      // × a half-cup serving = a quarter cup). Log ONE default serving and
      // flag the row so the user can adjust with the true size in view.
      resolved.servings = 1;
      resolved.unitUnresolved = true;
    }
    // Phase 4.2.5: a vague portion whose size the food category can't pin down
    // tightly enough (an un-sized bowl of an unknown food, "some rice", a piece
    // of chicken) → ask ONE focused size question, reusing the needsClarification
    // path (same surface-neutral contract as Phase 4.2.3). The estimate is kept
    // on `resolved` as a fallback. Loop-guarded: a portion dimension already
    // answered (parsed.clarified) is never re-asked — the estimate stands.
    if (resolved.portion && resolved.portion.requiresClarification &&
        resolved.portion.clarification &&
        (parsed.clarified || []).indexOf('portion') === -1) {
      return {
        parsed: parsed, needsClarification: true,
        clarification: resolved.portion.clarification,
        choices: [], resolved: resolved,
      };
    }
    return resolved;
  }

  // The user picked candidate `ci` for an ambiguous item → full resolve.
  async function resolveChoice(item, ci) {
    var c = item.choices && item.choices[ci];
    if (!c) return item;
    return resolveFood(c.raw, item.parsed);
  }

  // The user answered a clarification (`choice` = an option index, or free text
  // when allowFreeText) → patch the shared request and RE-ENTER resolveItem (one
  // engine, no parallel path). Malformed/empty answers are rejected: the same
  // clarification item is returned so the UI keeps the question visible. The
  // patched request records the answered dimension, so re-entry can resolve,
  // present a chooser, surface a DIFFERENT dimension, or become unmatched — but
  // never re-ask the same dimension (loop prevention lives in nuDetectClarification).
  async function resolveClarification(item, choice) {
    var c = item && item.clarification;
    if (!c) return item;
    var valid = (typeof choice === 'number' && c.options && choice >= 0 && choice < c.options.length) ||
                (typeof choice === 'string' && c.allowFreeText && choice.trim() !== '');
    if (!valid) return item;                         // keep the clarification (UI shows a local error)
    var patched = nuApplyClarification(item.parsed, c, typeof choice === 'string' ? choice.trim() : choice);
    return resolveItem(patched);
  }

  return { resolveFood: resolveFood, resolveItem: resolveItem, resolveChoice: resolveChoice,
    resolveClarification: resolveClarification };
}

/* ── food identity ─────────────────────────────────────────────────────────
 * One stable identity across USDA search, barcode, and manual foods:
 *   • USDA/barcode → 'usda:<fdcId>' (barcode matches are USDA branded foods, so
 *     the same product favorited from search and from a scan is ONE favorite;
 *     its gtin_upc is stored alongside).
 *   • Manual/custom → 'custom:<normalized name>' — the same (user_id, name)
 *     identity the foods table already uses for manual foods.
 * PERSISTED: user_food_favorites.food_key and saved-meal items store this
 * output — the format is pinned by regression test and must never change.
 * ─────────────────────────────────────────────────────────────────────────── */
function nuFoodKey(o) {
  if (o && o.usda_fdc_id != null && String(o.usda_fdc_id) !== '') {
    return 'usda:' + String(o.usda_fdc_id);
  }
  var name = String(o && o.name ? o.name : '').trim().toLowerCase();
  return name ? 'custom:' + name : null;
}

/* ── SaveSrc contract (Phase 4.2.1c) ───────────────────────────────────────
 * The ONE place the `src` provenance object nuSaveLog consumes is shaped.
 * Input: canonical fields (identity + the chosen serving + PER-UNIT macros +
 * the trimmed raw payload). Output: the exact 15-field SaveSrc contract —
 * every replay path (AI quick log, saved meals, future voice/photo/coach
 * actions) builds through here so the shape can never drift between callers.
 * Normalization matches what the two Phase 4.2 call sites always did:
 * ''/undefined → null for identity/serving fields, +n||0 for fiber/sugar,
 * macros pass through untouched.
 * ─────────────────────────────────────────────────────────────────────────── */
function nuBuildSaveSrc(o) {
  return {
    name: o.name, usda_fdc_id: o.usda_fdc_id,
    brand: o.brand || null, gtin_upc: o.gtin_upc || null,
    serving_amount: o.serving_amount != null ? o.serving_amount : null,
    serving_unit: o.serving_unit || null,
    serving_description: o.serving_description || null,
    grams: o.grams != null ? o.grams : null,
    fiber: +o.fiber || 0, sugar: +o.sugar || 0,
    calories: o.calories, protein: o.protein, carbs: o.carbs, fat: o.fat,
    raw: o.raw || null,
  };
}

/* ── display names ─────────────────────────────────────────────────────── */

// Display-only chip label: drop a trailing measure ("...,6 oz") and low-info
// qualifier words ("Fairlife Protein Shake" -> "Fairlife Shake"). Already-short
// names pass through untouched. The full name is always kept in nu_recentFoods.
// "protein" and "greek" are intentionally NOT here — they're meaningful food
// distinctions, not noise. We only strip fat/diet descriptors and packaging words.
var NU_FILLER = [
  'pro','organic','original','natural','plain','unsweetened',
  'nonfat','non-fat','low-fat','lowfat','reduced-fat','reduced','fat-free',
  'whole','skim','lean','raw','cooked','fresh','grass-fed','free-range',
  'boneless','skinless'
];
function nuShortLabel(name) {
  var full = String(name == null ? '' : name).trim();
  var base = full.split(',')[0].trim();          // drop ", 6 oz"-style measures
  var kept = base.split(/\s+/).filter(function (w) {
    var lw = w.toLowerCase().replace(/[().]/g, '');
    if (/^\d+(\.\d+)?%$/.test(lw)) return false;  // 2%, 0%, 1.5%
    return NU_FILLER.indexOf(lw) === -1;
  });
  var short = kept.join(' ').replace(/\s+/g, ' ').trim();
  // Never hard-truncate (that loses the food's identity) — the chip's CSS
  // max-width + text-overflow ellipsis handles any pathologically long name.
  return short || base || full;
}

/* ── Friendly display names (P7) ───────────────────────────────────────────
 * "Apples, fuji, with skin, raw" reads as "Fuji Apple"; "Chicken, broilers
 * or fryers, breast, meat only, cooked" as "Chicken Breast". DISPLAY ONLY:
 * the full USDA description keeps living in title="", the food picker, and
 * everything saved — identity/provenance are untouched. Class-based segment
 * rules over USDA's comma grammar, never per-food strings.
 * ────────────────────────────────────────────────────────────────────────── */

// Whole segments that carry no identity in a row title: prep states,
// packaging, data-source qualifiers, percentages. Matched per segment.
var NU_NAME_NOISE = [
  /^(raw|cooked|fresh|frozen|canned|dried|drained|prepared|unprepared|heated|oven-heated|microwaved)$/,
  /^(boiled|hard-boiled|soft-boiled|scrambled|poached|braised|broiled|grilled|roasted|baked|toasted|steamed|stewed|pan-fried)$/,
  /^(whole|plain|regular|solids?|liquids?|year round average|all commercial varieties|commercially prepared|restaurant-prepared|ready-to-serve|ready-to-eat|shelf stable)$/,
  /^(enriched|unenriched|fortified|salted|unsalted|sweetened|unsweetened|pasteurized|homogenized)$/,
  /^(with|without|no|includes|from|made|contains)\b/,   // "with skin", "without salt", "includes foods for…"
  /\badded\b/,                                          // "salt added in processing", "vitamin D added"
  /\d+(\.\d+)?\s*%/,                                    // "3.25% milkfat", "85% lean"
  /\bstyle$/,                                           // "smooth style", "chunk style"
  /^(meat only|meat and skin|skin removed|boneless|skinless|bone-in|skin-on)$/,
  /^(broilers?|fryers?|roasters?|broilers? or fryers?)\b/,
  /\b(separable|trimmed to)\b/,                         // beef retail-cut boilerplate
];

// Category-echo principals USDA prefixes entries with ("Fast foods,
// cheeseburger…", "Nuts, almonds", "Fish, salmon…") — drop while a real
// name remains behind them.
var NU_NAME_DROP = {
  'fast foods': 1, 'fish': 1, 'nuts': 1, 'seeds': 1, 'beverages': 1,
  'snacks': 1, 'candies': 1, 'school lunch': 1, 'restaurant': 1,
  'game meat': 1, 'crustaceans': 1, 'mollusks': 1, 'cereals ready-to-eat': 1,
};

// Cuts/parts read AFTER the food ("Chicken Breast"); other single-word
// qualifiers are varieties that read BEFORE it ("Fuji Apple", "White Bread").
var NU_NAME_CUTS = {
  breast: 1, thigh: 1, wing: 1, wings: 1, drumstick: 1, leg: 1, loin: 1,
  tenderloin: 1, fillet: 1, filet: 1, flank: 1, brisket: 1, rib: 1, ribs: 1,
  shank: 1, chuck: 1, round: 1, sirloin: 1, ribeye: 1, rump: 1, shoulder: 1,
  belly: 1, steak: 1,
};

// USDA pluralizes list entries ("Apples, fuji") — singularize the principal
// when a variety precedes it, except foods whose name IS plural.
var NU_NAME_KEEP_PLURAL = {
  oats: 1, grits: 1, greens: 1, beans: 1, peas: 1, lentils: 1, fries: 1,
  almonds: 1, walnuts: 1, cashews: 1, peanuts: 1, pistachios: 1, pecans: 1,
  chips: 1, sprouts: 1, noodles: 1, berries: 1, blueberries: 1, strawberries: 1,
  raspberries: 1, blackberries: 1, cherries: 1, grapes: 1,
};

function nuNameSingular(seg) {
  return seg.replace(/([A-Za-z]+)$/, function (t) {
    if (t.length <= 3 || NU_NAME_KEEP_PLURAL[t.toLowerCase()]) return t;
    if (/ies$/i.test(t)) return t.slice(0, -3) + (t === t.toUpperCase() ? 'Y' : 'y');
    if (/oes$/i.test(t)) return t.slice(0, -2);
    if (/(ss|us|is)$/i.test(t)) return t;               // hummus, couscous, molasses
    if (/s$/i.test(t)) return t.slice(0, -1);
    return t;
  });
}

// Title-case a phrase: ALLCAPS and lowercase words normalize; hyphen parts
// capitalize ("whole-wheat" → "Whole-Wheat"); Mc names keep their camel.
function nuTitleCase(s) {
  return s.split(' ').map(function (w) {
    if (!w) return w;
    // normalize ALLCAPS and shouting-mostly words (McDONALD'S); leave true mixed case
    if (w !== w.toUpperCase() && w !== w.toLowerCase() && !/[A-Z]{3,}/.test(w)) return w;
    return w.toLowerCase().split('-').map(function (p) {
      p = p.replace(/^mc(\w)/, function (m, c) { return 'mc' + c.toUpperCase(); });
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join('-');
  }).join(' ');
}

// Friendly row title. Full name is preserved by every caller in title="".
function nuAiDisplayName(name) {
  var full = String(name == null ? '' : name).trim();
  var segs = full.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);

  var kept = segs.filter(function (s) {
    var ls = s.toLowerCase();
    for (var i = 0; i < NU_NAME_NOISE.length; i++) if (NU_NAME_NOISE[i].test(ls)) return false;
    return true;
  });
  if (!kept.length) kept = [segs[0] || full];
  while (kept.length > 1 && NU_NAME_DROP[kept[0].toLowerCase()]) kept.shift();

  var principal = kept[0];
  var before = [], after = [];
  kept.slice(1, 3).forEach(function (q) {
    var lq = q.toLowerCase();
    if (NU_NAME_CUTS[lq]) after.push(q);
    else if (lq.indexOf(' ') === -1) before.push(q);    // single-word variety → in front
    else after.push(q);                                 // multi-word detail keeps USDA order
  });
  if (before.length) principal = nuNameSingular(principal);

  var out = nuTitleCase(before.concat([principal]).concat(after).join(' '));
  // word-boundary length cap; the CSS two-line clamp is the backstop
  if (out.length > 44) out = out.slice(0, 44).replace(/\s+\S*$/, '');
  return out || full;
}

// (Category emoji hints were tried here and removed — Effi prefers clean
// text-only rows in the review sheet.)

/* ── totals ────────────────────────────────────────────────────────────── */

// Sheet totals (resolved items only) — same shape as nuSavedMealTotals.
function nuAiTotals(items) {
  return (items || []).reduce(function (t, it) {
    if (it.unmatched || it.needsChoice || it.needsClarification) return t;
    var q = (+it.servings > 0) ? +it.servings : 1;
    t.calories += (+it.perUnit.calories || 0) * q;
    t.protein  += (+it.perUnit.protein  || 0) * q;
    return t;
  }, { calories: 0, protein: 0 });
}

/* ── Node exports (guarded — browsers ignore this block) ───────────────── */
// Pure resolution logic only: no UI, no persistence, no fetch wrappers.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    nuRound: nuRound,
    nuRound1: nuRound1,
    nuScaleMacros: nuScaleMacros,
    nuScalePer100: nuScalePer100,
    nuNormalizeUsdaFood: nuNormalizeUsdaFood,
    nuBuildServingOptions: nuBuildServingOptions,
    nuDefaultServingKey: nuDefaultServingKey,
    NU_APPROX_UNITS: NU_APPROX_UNITS,
    NU_VOLUME_ML: NU_VOLUME_ML,
    NU_CUP_GRAMS: NU_CUP_GRAMS,
    nuAiCupServing: nuAiCupServing,
    nuAiLabelCount: nuAiLabelCount,
    nuDefaultChosenServing: nuDefaultChosenServing,
    nuVaguePortionServing: nuVaguePortionServing,
    nuAiChooseServing: nuAiChooseServing,
    NU_ASK_CATEGORIES: NU_ASK_CATEGORIES,
    nuAiIsConfident: nuAiIsConfident,
    NU_CONFIDENCE: NU_CONFIDENCE,
    NU_DISPOSITION_LEVEL: NU_DISPOSITION_LEVEL,
    NU_PREP_STATE: NU_PREP_STATE,
    nuResolvePolicy: nuResolvePolicy,
    nuAssessConfidence: nuAssessConfidence,
    nuDetectClarification: nuDetectClarification,
    nuApplyClarification: nuApplyClarification,
    nuPatchQuery: nuPatchQuery,
    nuAiChoicesAlike: nuAiChoicesAlike,
    NU_SIG_FILLER: NU_SIG_FILLER,
    nuAiNameSig: nuAiNameSig,
    nuAiDedupeChoices: nuAiDedupeChoices,
    nuCreateResolver: nuCreateResolver,
    nuFoodKey: nuFoodKey,
    nuBuildSaveSrc: nuBuildSaveSrc,
    NU_FILLER: NU_FILLER,
    nuShortLabel: nuShortLabel,
    nuNameSingular: nuNameSingular,
    nuTitleCase: nuTitleCase,
    nuAiDisplayName: nuAiDisplayName,
    nuAiTotals: nuAiTotals,
  };
}
