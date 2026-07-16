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

// Colloquial hand measures → DETERMINISTIC gram estimates. These are fixed
// conversions applied here, never weights the model invents — the same phrase
// always produces the same grams, and the serving label carries "~" so the
// user sees it's an estimate. "handful of almonds" must never silently
// become 100 g. Weight foods only (a handful of milk isn't a measure).
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

// Pick the serving option that matches what the user said, using the SAME
// option list the food card builds. Priority:
//   1. explicit weight ("6 oz" → 170 g) — weight foods only, never ml→g
//   2. approximate hand measures ("handful" ≈ 28 g) — fixed table above
//   3. the household word they used ("slice", "cup") found in an option label
//   4. the card's own default (nuDefaultServingKey — portion/serving/100 g)
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
  if (parsed.unit) {
    var uFull = String(parsed.unit).toLowerCase().trim().replace(/s$/, '');
    var approx = NU_APPROX_UNITS[uFull];
    if (approx && per100 && !f.is_liquid) {
      return { perUnit: nuScalePer100(per100, approx), grams: approx, amount: approx, unit: 'g',
               description: uFull + ' (~' + approx + ' g)', matchedUnit: true };
    }
    // ≥2 chars so a bare 'g' can't substring-match every label. A matched
    // option carries unitCount so the resolver can divide the user's
    // quantity by the label's own count ("1/2 cup" serving ≠ half of it).
    var u = uFull.split(' ').pop();
    if (u.length >= 2) {
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].custom) continue;
        if (String(opts[i].label || '').toLowerCase().indexOf(u) !== -1) {
          return Object.assign({ unitCount: nuAiLabelCount(opts[i]), matchedUnit: true }, opts[i]);
        }
      }
    }
    // Liquids: tsp/tbsp are pure volume conversions (per-100ml panel × ml).
    var ml = NU_VOLUME_ML[u];
    if (ml && per100 && f.is_liquid) {
      return { perUnit: nuScalePer100(per100, ml), grams: null, amount: ml, unit: 'ml',
               description: '1 ' + u + ' (' + ml + ' ml)', matchedUnit: true };
    }
  }
  var key = nuDefaultServingKey(f, opts, portions);
  for (var j = 0; j < opts.length; j++) if (opts[j].key === key) return opts[j];
  return opts[0];
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

/* ── resolution orchestrator (Phase 4.2.1b) ────────────────────────────────
 * The full resolve pipeline behind AI logging (and any future surface),
 * decoupled from HOW candidates are fetched. `source` is the SourceAdapter:
 *   { search(query) → Promise<Candidate[]>,
 *     portions(fdcId) → Promise<Portion[]> }   // [] on any failure
 * The browser binds nuUsdaSearch/nuFetchUsdaDetail (nutrition.js); a server
 * route or benchmark binds its own. Bodies are the Phase 4.2 production
 * logic verbatim — only the two adapter call sites changed.
 * ─────────────────────────────────────────────────────────────────────────── */
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
    };
  }

  // Resolve one parsed item. Never throws — a failed search returns
  // { unmatched: true } and an ambiguous one returns { needsChoice: true } with
  // the distinct candidates, so the review sheet can ask instead of guessing.
  async function resolveItem(parsed) {
    var foods = [];
    try { foods = await source.search(parsed.query); } catch (e) {}
    if (!foods || !foods.length) return { parsed: parsed, unmatched: true };

    if (!nuAiIsConfident(parsed, foods[0])) {
      // Duplicates collapse first ("jasmine rice" → 4 identical products = ONE
      // option = no interruption). Restaurant-dish categories skip the dedupe —
      // a McDonald's and a homemade double cheeseburger can tie nutritionally
      // and still deserve the "where from?" ask.
      var candidates = foods.slice(0, 4);
      var askCat = NU_ASK_CATEGORIES[String(foods[0].foodCategory || '').toLowerCase()];
      var options = askCat ? candidates : nuAiDedupeChoices(candidates);
      if (askCat || options.length > 1) {
        return {
          parsed: parsed, needsChoice: true,
          // keep the trimmed payloads: picking one replays the normal resolve
          // path. kcal (per 100 g/ml) lets same-named options explain themselves.
          choices: options.map(function (rf) {
            return { raw: rf, name: rf.description || '', brand: rf.brand || '',
                     kcal: (rf.nutrients || {}).kcal };
          }),
        };
      }
    }
    // Resolve the top hit — but if the user gave a measure this food can't
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
    return resolved;
  }

  // The user picked candidate `ci` for an ambiguous item → full resolve.
  async function resolveChoice(item, ci) {
    var c = item.choices && item.choices[ci];
    if (!c) return item;
    return resolveFood(c.raw, item.parsed);
  }

  return { resolveFood: resolveFood, resolveItem: resolveItem, resolveChoice: resolveChoice };
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
    if (it.unmatched || it.needsChoice) return t;
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
    nuAiChooseServing: nuAiChooseServing,
    NU_ASK_CATEGORIES: NU_ASK_CATEGORIES,
    nuAiIsConfident: nuAiIsConfident,
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
