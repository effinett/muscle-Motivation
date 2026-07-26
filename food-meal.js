// food-meal.js — Shared Meal-Level Reasoning core (Phase 4.2.6)
//
// The pure, DOM-free, fetch-free intelligence that lets food resolution reason
// about a GROUP of foods as one meal instead of resolving each food in complete
// isolation. Like food-core.js / food-ranking.js / food-memory.js it runs in
// two runtimes:
//   • Browser — loaded via <script> AFTER food-core.js and food-ranking.js
//     (it reuses their globals: nText, tokenize, stem, stemTokens, NU_PREP_STATE).
//   • Node — guarded module.exports (same pattern as the other shared modules);
//     api/usda-search.js, tests, and benchmarks require() the EXACT production
//     logic and run it offline.
//
// ── Where this sits in the architecture (server-authoritative, one seam) ──────
// rankFoodCandidates (food-ranking.js) stays the ONLY ranking authority and runs
// SERVER-SIDE inside /api/usda-search. Meal reasoning NEVER reranks on a surface
// and nuCreateResolver still trusts the returned order. Instead, mirroring
// Correction Memory (Phase 4.2.4):
//   1. The client builds ONE immutable MealContext from the parsed items + the
//      raw meal text (nuBuildMealContext), heuristically — NO AI-parser schema
//      change, so old/cached parse payloads keep working.
//   2. Each item's resolution carries only its stable mealIndex + a minimal,
//      CANDIDATE-INDEPENDENT per-item projection (nuMealItemProjection), which
//      the client serializes into an `X-Meal-Context` header
//      (nuSerializeMealContext).
//   3. usda-search validates that projection as UNTRUSTED evidence
//      (nuParseMealContext: size/version/enum/array bounds, fail-open) and builds
//      ONE nuMealSignal, injected through the existing options.signals seam.
// The projection is derived ONLY from the user's own meal text/parsed items —
// never candidate ids, rankings, or confidence results — so it can influence
// ordering but never usurps server ranking authority. A candidate not in the
// normally-retrieved set can never be fabricated or boosted into existence.
//
// ── Scope discipline (Phase 4.2.6 non-goals) ─────────────────────────────────
// Meal reasoning improves RESOLUTION of foods entered together. It is NOT a
// recipe engine, macro optimizer, or splitter/merger: foods stay whatever the
// parser returned (separate entries preserved; a mixed dish like "chicken caesar
// salad" stays one item because the parser kept it one — this file never merges
// or splits). It must not paper over GLOBAL ranking defects (chicken→turkey,
// fairlife bar→milk) for the SINGLE-food case; those remain separate
// ranking-quality work. Meal context only ever activates for a ≥2-item meal.

'use strict';

/* ── Shared primitives (reused, never re-implemented) ─────────────────────────
 * In Node we require the sibling modules; in the browser their top-level
 * declarations are already globals loaded before this file. Acquire once. */
var _mrank = (typeof require === 'function') ? require('./food-ranking.js') : null;
var _mcore = (typeof require === 'function') ? require('./food-core.js') : null;

function _mText(s)      { return _mrank ? _mrank.nText(s)      : nText(s); }
function _mTokenize(s)  { return _mrank ? _mrank.tokenize(s)   : tokenize(s); }
function _mStem(s)      { return _mrank ? _mrank.stem(s)       : stem(s); }
function _mStemTokens(a){ return _mrank ? _mrank.stemTokens(a) : stemTokens(a); }
function _mPrepState()  { return _mcore ? _mcore.NU_PREP_STATE : NU_PREP_STATE; }

/* ── Centralized policy — every meal-reasoning constant lives here ─────────────
 * Meal signals are TIE-BREAKERS. They are sized DELIBERATELY BELOW the direct
 * query-text evidence in RANK_WEIGHTS (food-ranking.js): nameIsQuery 2000,
 * exactFullName 1800, baseFood/brandIntent 1500, phraseMatch 1000. A strong
 * exact match therefore always dominates any meal adjustment. They also stay
 * well inside the two HARD safety floors (implausibleKcal -2000, emptyMacroPanel
 * -1500) — the per-candidate sum is clamped to ±MEAL_WEIGHTS.totalCap (500), so
 * meal context can flip a genuinely close ordering but can never punch a
 * label-error/empty-panel candidate up, nor rewrite a decisive lead. Tune here,
 * never in code. */
var MEAL_WEIGHTS = {
  // Beverage vs solid consistency (the strongest meal cue: a Coke is a drink, a
  // protein bar is not — this keeps a beverage from distorting solid ranking and
  // vice-versa). Comparable to a preferred-cut / intent-top nudge in magnitude.
  beverageMatch: 240,      // beverage candidate for a beverage-role item
  beverageConflict: -320,  // beverage candidate for a solid item (or solid for a beverage item)

  // Shared-preparation expectation: when the meal is clearly cooked and THIS item
  // is a raw/cooked-ambiguous commodity with no preparation of its own, favor the
  // cooked/prepared candidate over the raw commodity ("steak, mashed potatoes and
  // green beans" → cooked green beans, not "Beans, snap, green, raw").
  cookedMatch: 160,        // cooked/prepared candidate when the meal implies cooked
  rawConflict: -240,       // raw commodity candidate when the meal implies cooked

  // Meal consistency: the item names one animal but the candidate is a different
  // animal subtype (chicken item, turkey candidate). Bounded penalty, NOT a hard
  // filter — the candidate still ranks, just lower, so a legitimate mixed dish is
  // never removed.
  animalConflict: -300,

  // Absolute bound on the |sum| of meal contributions for a single candidate.
  totalCap: 500,
};

// Hard bounds on the serialized per-item projection (validation + DoS-resistance,
// same discipline as food-memory's session context). Anything exceeding a bound
// is REJECTED whole (fail-open → normal ranking), never truncated-and-trusted.
var MEAL_LIMITS = {
  maxPayloadChars: 2000,   // reject an oversized serialized projection outright
  maxItems: 10,            // matches ai-food-parse MAX_ITEMS
  maxCompanionCats: 8,     // bounded companion-category list
  maxNameLen: 40,          // bounded animal/role/category token echoes
};

// Full client MealContext schema version (the immutable per-meal structure).
var MEAL_SCHEMA_VERSION = 1;
// Per-item transport projection version — DISTINCT from MEAL_SCHEMA_VERSION so
// the wire format can evolve independently of the in-memory context. An unknown
// projection version is IGNORED safely (never partially interpreted).
var MEAL_PROJECTION_VERSION = 1;

/* ── Meal vocabulary (conservative, extend here not in code) ──────────────────
 * These are the user's OWN words (the meal text / parsed queries), never
 * candidate data — so this is legitimate evidence, not an authority source. All
 * matching is stem-aware via food-ranking's stemmer. */

// Strong beverage nouns — an item whose query names one of these is a beverage.
// Deliberately conservative: "milk"/"shake" are NOT here (milk in cereal, a food
// shake) so a dairy/food query is never mis-forced to a drink.
var NM_BEVERAGE = {
  coffee: 1, espresso: 1, latte: 1, cappuccino: 1, tea: 1, soda: 1, pop: 1,
  cola: 1, coke: 1, pepsi: 1, sprite: 1, lemonade: 1, juice: 1, water: 1,
  gatorade: 1, powerade: 1, kombucha: 1, beer: 1, wine: 1, cider: 1, cocktail: 1,
  smoothie: 1, americano: 1, mocha: 1, frappuccino: 1, seltzer: 1, soft: 1,
};

// Condiment / topping / sauce nouns — small add-ons, usually introduced with
// "with". A condiment-role item never competes as a meal main.
var NM_CONDIMENT = {
  mayo: 1, mayonnaise: 1, ketchup: 1, mustard: 1, ranch: 1, dressing: 1,
  salsa: 1, sauce: 1, syrup: 1, honey: 1, jam: 1, jelly: 1, gravy: 1,
  hummus: 1, guacamole: 1, relish: 1, sriracha: 1, vinaigrette: 1, aioli: 1,
  dip: 1, spread: 1, marinara: 1, pesto: 1,
};

// Animal proteins — for the meal-consistency (wrong-subtype) check. Stem forms.
var NM_ANIMAL = {
  chicken: 1, turkey: 1, beef: 1, steak: 1, pork: 1, ham: 1, bacon: 1,
  fish: 1, salmon: 1, tuna: 1, cod: 1, tilapia: 1, shrimp: 1, crab: 1,
  lobster: 1, lamb: 1, duck: 1, veal: 1, bison: 1, sausage: 1,
};
// Animals that co-occur legitimately in one product (a "turkey bacon", a
// "surf and turf") — treat as compatible so a real combo is never penalized.
var NM_ANIMAL_COMPAT = {
  bacon: 1, sausage: 1, ham: 1,   // cured/processed cuts cross species names
};

// Raw/cooked-ambiguous whole-food commodities: foods USDA carries in BOTH a raw
// and a cooked/prepared form, so a bare query ("green beans", "rice") is
// genuinely ambiguous and a cooked-meal context is real evidence. Stem forms.
var NM_COMMODITY = {
  chicken: 1, turkey: 1, beef: 1, steak: 1, pork: 1, fish: 1, salmon: 1,
  shrimp: 1, egg: 1, rice: 1, potato: 1, bean: 1, broccoli: 1, carrot: 1,
  spinach: 1, asparagus: 1, pea: 1, corn: 1, kale: 1, vegetable: 1, veggie: 1,
  green: 1, lentil: 1, quinoa: 1, oat: 1,
};

// Coarse food categories from the user's query tokens. Conservative name-based
// classification of the USER'S item (candidate categories use structured USDA
// metadata instead — see the candidate classifiers). Stem forms.
var NM_CATEGORY = {
  // protein
  chicken: 'protein', turkey: 'protein', beef: 'protein', steak: 'protein',
  pork: 'protein', fish: 'protein', salmon: 'protein', tuna: 'protein',
  shrimp: 'protein', egg: 'protein', tofu: 'protein', bacon: 'protein',
  sausage: 'protein', ham: 'protein', yogurt: 'protein', protein: 'protein',
  // carb
  rice: 'carb', bread: 'carb', toast: 'carb', pasta: 'carb', potato: 'carb',
  oat: 'carb', oatmeal: 'carb', bagel: 'carb', tortilla: 'carb', noodle: 'carb',
  quinoa: 'carb', cereal: 'carb', granola: 'carb', fries: 'carb', bun: 'carb',
  pancake: 'carb', waffle: 'carb', cracker: 'carb',
  // vegetable
  broccoli: 'veg', spinach: 'veg', carrot: 'veg', lettuce: 'veg', salad: 'veg',
  green: 'veg', pepper: 'veg', onion: 'veg', tomato: 'veg', cucumber: 'veg',
  kale: 'veg', asparagus: 'veg', vegetable: 'veg', veggie: 'veg', bean: 'veg',
  // fruit
  banana: 'fruit', apple: 'fruit', berry: 'fruit', blueberry: 'fruit',
  strawberry: 'fruit', orange: 'fruit', grape: 'fruit', mango: 'fruit',
  pineapple: 'fruit', peach: 'fruit',
  // fat / nut
  avocado: 'fat', nut: 'fat', almond: 'fat', peanut: 'fat', walnut: 'fat',
  // dairy
  milk: 'dairy', cheese: 'dairy',
};

// The 'cooked' bucket of preparations (used to decide the meal is a cooked meal).
// Reads NU_PREP_STATE plus a couple of prep words it doesn't carry (mashed/sauteed
// aren't identity states there but ARE clear cooking cues in a meal).
var NM_COOK_EXTRA = { mashed: 1, sauteed: 1, sautéed: 1, seared: 1, poached: 1, scrambled: 1 };

/* ── Per-item classification (from the user's query — candidate-independent) ──
 * The stemmer maps plural/inflected words to a base (fries→fry, potatoes→potato),
 * so every lexicon lookup checks BOTH the raw token and its stem against the
 * table. Tables are written in natural singular form and matched either way. */

// Ordered token list for a query: each entry is a raw token; its stem is
// resolved at lookup time (order-preserving so the FIRST-typed food wins).
function _tokensOf(query) {
  return _mTokenize(_mText(query || ''));
}

// First token (in query order) present as a key in `table` (by raw form or stem)
// → the table's value; else null. For presence tables (value 1) this is truthy.
function _lookupOrdered(query, table) {
  var toks = _tokensOf(query);
  for (var i = 0; i < toks.length; i++) {
    if (table[toks[i]] != null) return table[toks[i]];
    var s = _mStem(toks[i]);
    if (table[s] != null) return table[s];
  }
  return null;
}

// The prep STATE(S) the user stated for THIS item (raw/cooked/dry/prepared), from
// their own query — item-local preparation, which always overrides shared prep.
function nuMealLocalPrep(query) {
  var prep = _mPrepState();
  var states = {};
  _tokensOf(query).forEach(function (t) {
    var s = _mStem(t);
    if (prep[t]) states[prep[t]] = 1;
    else if (prep[s]) states[prep[s]] = 1;
    if (NM_COOK_EXTRA[t] || NM_COOK_EXTRA[s]) states.cooked = 1;
  });
  return Object.keys(states);
}

// Coarse category of the user's item, or null (first-typed food wins).
function nuMealCategory(query) {
  var v = _lookupOrdered(query, NM_CATEGORY);
  return (typeof v === 'string') ? v : null;
}

// Is this item a beverage (by the user's own words)?
function nuMealIsBeverage(query, brand) {
  // "shake"/"smoothie" read as a drink; plain "milk" stays a food.
  var toks = _tokensOf((query || '') + ' ' + (brand || ''));
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i], s = _mStem(t);
    if (NM_BEVERAGE[t] || NM_BEVERAGE[s]) return true;
    if (t === 'shake' || s === 'shake' || t === 'smoothie' || s === 'smoothie') return true;
  }
  return false;
}

// The single animal protein the user named for this item, or null. Returns null
// when two DIFFERENT animals are named (not a single-animal item).
function nuMealAnimal(query) {
  var toks = _tokensOf(query), found = null;
  for (var i = 0; i < toks.length; i++) {
    var s = _mStem(toks[i]);
    var key = NM_ANIMAL[toks[i]] ? toks[i] : (NM_ANIMAL[s] ? s : null);
    if (key && !NM_ANIMAL_COMPAT[key]) {
      if (found && found !== key) return null;
      found = key;
    }
  }
  return found;
}

// Is this a raw/cooked-ambiguous commodity?
function nuMealIsCommodity(query) {
  var toks = _tokensOf(query);
  for (var i = 0; i < toks.length; i++) {
    if (NM_COMMODITY[toks[i]] || NM_COMMODITY[_mStem(toks[i])]) return true;
  }
  return false;
}

// Item ROLE — a SIGNAL, never a guarantee. Conservative and only used for
// provenance/diagnostics + weak evidence (roles do not themselves drive the
// ranking signal; the concrete beverage/cooked/animal cues do).
function nuMealRole(item) {
  var q = (item && item.query) || '';
  if (nuMealIsBeverage(q, item && item.brand)) return 'beverage';
  if (_lookupOrdered(q, NM_CONDIMENT)) return 'condiment';
  var cat = nuMealCategory(q);
  if (cat === 'protein') return 'main';
  if (cat === 'veg' || cat === 'carb' || cat === 'fruit') return 'side';
  return null;
}

/* ── Build the immutable MealContext (once per parsed meal) ────────────────── */

// Build one immutable MealContext from the raw meal text + the parsed items.
// Returns { active:false } for a <2-item meal so single-food resolution is
// guaranteed byte-for-byte unchanged (no projection, no header, no signal).
// Never throws — any failure yields an inert { active:false } context.
function nuBuildMealContext(mealText, items, opts) {
  try {
    var list = Array.isArray(items) ? items.slice(0, MEAL_LIMITS.maxItems) : [];
    if (list.length < 2) return { active: false, version: MEAL_SCHEMA_VERSION };

    var perItem = list.map(function (it, i) {
      var q = (it && it.query) || '';
      // Item-local preparation is read from the ORIGINAL phrase (query + text): an
      // explicit "raw"/"fried" the parser stripped from the terse query must still
      // override shared preparation (adjustment 8). Identity cues (category,
      // animal, beverage, commodity) stay on the clean query term.
      var phrase = (q + ' ' + ((it && it.text) || '')).trim();
      return {
        index: i,
        query: String(q).slice(0, MEAL_LIMITS.maxNameLen),
        category: nuMealCategory(q),
        beverage: nuMealIsBeverage(q, it && it.brand),
        animal: nuMealAnimal(q),
        commodity: nuMealIsCommodity(q),
        localPrep: nuMealLocalPrep(phrase),
        role: nuMealRole(it),
      };
    });

    // Is this a COOKED meal? True when ANY item carries an explicit cooking
    // preparation. This is the ONLY basis for spreading a cooked expectation —
    // never inferred from category or meal type. (Conservative grammar,
    // adjustment 8: a raw meal, e.g. "banana and yogurt", spreads nothing.)
    var mealCooked = perItem.some(function (p) { return p.localPrep.indexOf('cooked') >= 0; });

    // Dominant categories across the meal (deduped, bounded) — provenance + weak
    // context only.
    var catSet = {};
    perItem.forEach(function (p) { if (p.category) catSet[p.category] = (catSet[p.category] || 0) + 1; });

    var mealType = (opts && typeof opts.mealType === 'string') ? opts.mealType : null;

    return {
      active: true,
      version: MEAL_SCHEMA_VERSION,
      mealText: String(mealText || '').slice(0, 200),
      itemCount: perItem.length,
      items: perItem,
      mealCooked: mealCooked,
      categories: catSet,
      mealType: mealType,
    };
  } catch (e) {
    return { active: false, version: MEAL_SCHEMA_VERSION };
  }
}

/* ── Per-item projection (minimal, candidate-independent, wire-ready) ───────── */

// The bounded evidence for resolving ONE item, fully resolved on the client so
// the server signal is a pure application of it. Contains ONLY user-meal-derived
// facts — no candidate ids, rankings, or confidence. Returns null when there is
// nothing to apply (so no header is sent).
function nuMealItemProjection(context, index) {
  if (!context || !context.active || !Array.isArray(context.items)) return null;
  var me = context.items[index];
  if (!me) return null;

  // Cooked expectation for THIS item: the meal is cooked, this item is a
  // raw/cooked-ambiguous commodity, and the user gave it NO raw/dry preparation
  // of its own (explicit item-local prep always wins). A cooking prep on the item
  // itself also yields the expectation (harmless — it already wants cooked).
  var localRaw = me.localPrep.indexOf('raw') >= 0 || me.localPrep.indexOf('dry') >= 0;
  var cookedExpected = !!(me.commodity && !localRaw &&
    (context.mealCooked || me.localPrep.indexOf('cooked') >= 0));

  // Companion categories = categories present in OTHER items (deduped, bounded).
  var companion = {};
  context.items.forEach(function (p) {
    if (p.index !== index && p.category) companion[p.category] = 1;
  });
  var companionCats = Object.keys(companion).slice(0, MEAL_LIMITS.maxCompanionCats);

  // Emit a projection only when it carries at least one actionable cue.
  var actionable = me.beverage || cookedExpected || !!me.animal ||
    companionCats.length > 0;
  if (!actionable) return null;

  return {
    v: MEAL_PROJECTION_VERSION,
    beverage: !!me.beverage,
    cookedExpected: cookedExpected,
    animal: me.animal ? String(me.animal).slice(0, MEAL_LIMITS.maxNameLen) : null,
    commodity: !!me.commodity,
    companionCats: companionCats,
    role: me.role || null,
    mealType: context.mealType || null,
  };
}

/* ── Serialize / validate the projection for transport (untrusted on ingest) ── */

function nuSerializeMealContext(projection) {
  try {
    if (!projection) return '';
    var s = JSON.stringify(projection);
    if (s.length > MEAL_LIMITS.maxPayloadChars) return '';
    return s;
  } catch (e) { return ''; }
}

var NM_ROLES = { beverage: 1, condiment: 1, main: 1, side: 1, component: 1, mixed: 1 };
var NM_MEALTYPES = { breakfast: 1, lunch: 1, dinner: 1, snack: 1 };
var NM_CATS = { protein: 1, carb: 1, veg: 1, fruit: 1, fat: 1, dairy: 1, other: 1 };

// Parse + VALIDATE a serialized projection from the request header. UNTRUSTED
// input: every field is size/type/enum/version checked, arrays bounded, unknown
// versions ignored. Returns a clean projection or null — a null NEVER fails the
// search (the caller degrades to normal ranking). Fail-open by construction.
function nuParseMealContext(str) {
  try {
    if (typeof str !== 'string' || !str || str.length > MEAL_LIMITS.maxPayloadChars) return null;
    var o = JSON.parse(str);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (o.v !== MEAL_PROJECTION_VERSION) return null;               // unknown version → ignore safely
    return nuValidateProjection(o);
  } catch (e) { return null; }
}

// Validate a projection object (from the header OR a direct in-process caller).
// Returns a normalized projection, or null when it is malformed/inactionable.
function nuValidateProjection(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (o.v !== MEAL_PROJECTION_VERSION) return null;

  var beverage = o.beverage === true;
  var cookedExpected = o.cookedExpected === true;
  var commodity = o.commodity === true;

  var animal = null;
  if (typeof o.animal === 'string' && o.animal && o.animal.length <= MEAL_LIMITS.maxNameLen) {
    var a = _mText(o.animal);
    if (NM_ANIMAL[a] || NM_ANIMAL[_mStem(a)]) animal = _mStem(a);
  }

  var companionCats = [];
  if (Array.isArray(o.companionCats)) {
    for (var i = 0; i < o.companionCats.length && companionCats.length < MEAL_LIMITS.maxCompanionCats; i++) {
      var c = o.companionCats[i];
      if (typeof c === 'string' && NM_CATS[c] && companionCats.indexOf(c) === -1) companionCats.push(c);
    }
  }

  var role = (typeof o.role === 'string' && NM_ROLES[o.role]) ? o.role : null;
  var mealType = (typeof o.mealType === 'string' && NM_MEALTYPES[o.mealType]) ? o.mealType : null;

  // Must still carry at least one actionable cue after validation.
  if (!beverage && !cookedExpected && !animal && companionCats.length === 0) return null;

  return {
    v: MEAL_PROJECTION_VERSION,
    beverage: beverage,
    cookedExpected: cookedExpected,
    animal: animal,
    commodity: commodity,
    companionCats: companionCats,
    role: role,
    mealType: mealType,
  };
}

/* ── Candidate classification (reuse STRUCTURED USDA metadata; name fallback) ──
 * The signal + confidence assess a trimmed candidate: { description, foodCategory,
 * dataType, servingSizeUnit, nutrients{...} }. Category-based classification is
 * preferred (structured metadata); a conservative name-based check is the
 * fallback, independently tested. */

function _candText(f) {
  return _mText((f && (f.description || f.name)) || '');
}
// Raw+stem token set of a candidate's description + brand.
function _candTokens(f) {
  var set = {};
  (_candText(f) + ' ' + _mText((f && f.brand) || '')).split(/\s+/).forEach(function (t) {
    if (!t) return; set[t] = 1; var s = _mStem(t); if (s) set[s] = 1;
  });
  return set;
}
function _tokSetHasAny(set, table) {
  var keys = Object.keys(table);
  for (var i = 0; i < keys.length; i++) if (set[keys[i]] || set[_mStem(keys[i])]) return true;
  return false;
}

// Beverage candidate. STRUCTURED USDA metadata is authoritative: a beverage/drink
// foodCategory → yes. Any OTHER named category is trusted as NOT a beverage, so a
// solid whose NAME happens to contain a drink word ("cola cake" → Sweets, "coffee
// cake" → Baked) is never misread. The description-name fallback fires ONLY when
// the candidate has no category at all (some SR entries, e.g. "Soda, cola") — a
// deliberately conservative fallback (adjustment 10). Consequence: a fruit-juice
// entry filed under "Fruits and Fruit Juices" is not treated as a beverage — an
// accepted, documented limitation, safe because it only forgoes a nudge.
function nuMealCandidateIsBeverage(f) {
  var cat = _mText(f && f.foodCategory);
  if (/beverage|drink/.test(cat)) return true;
  var set = _candTokens(f);
  // Fruit-juice drinks live under a "Fruits and Fruit Juices" category alongside
  // raw fruit. Distinguish by the NAME: "Orange juice" (has a juice/drink word) is
  // a beverage; "Oranges, raw" (same category, no juice word) is not.
  if (/juice/.test(cat) && (set.juice || set.drink)) return true;
  if (cat) return false;                       // any other structured category → trust it
  return _tokSetHasAny(set, NM_BEVERAGE);       // no category → conservative name fallback
}

// Preparation state a candidate's description declares (raw / cooked / dry), via
// the shared NU_PREP_STATE vocabulary. Returns a set.
function nuMealCandidatePrep(f) {
  var prep = _mPrepState();
  var out = {};
  _candText(f).split(/\s+/).forEach(function (t) {
    var s = _mStem(t);
    if (prep[t]) out[prep[t]] = 1;
    else if (prep[s]) out[prep[s]] = 1;
    if (NM_COOK_EXTRA[t] || NM_COOK_EXTRA[s]) out.cooked = 1;
  });
  return out;
}

// The animal a candidate names (first found), or null.
function nuMealCandidateAnimal(f) {
  var set = _candTokens(f);
  var keys = Object.keys(NM_ANIMAL);
  for (var i = 0; i < keys.length; i++) {
    if (NM_ANIMAL_COMPAT[keys[i]]) continue;
    if (set[keys[i]] || set[_mStem(keys[i])]) return keys[i];
  }
  return null;
}

/* ── The ranking signal ────────────────────────────────────────────────────
 * Build a pure (candidate, features, ctx) → number pass for options.signals,
 * from a VALIDATED projection (accepts a plain object directly, so server tests,
 * benchmarks, and future non-HTTP callers never depend on header serialization).
 * Every contribution is a named MEAL_WEIGHTS entry; the per-candidate sum is
 * clamped to ±totalCap so meal context breaks close ties without ever overriding
 * decisive query evidence or the ranking safety floors. */
function nuMealSignal(projection) {
  var p = nuValidateProjection(projection);
  if (!p) return function () { return 0; };

  return function (f) {
    if (!f) return 0;
    var s = 0;

    // (1) Beverage vs solid consistency.
    var isBev = nuMealCandidateIsBeverage(f);
    if (p.beverage) {
      s += isBev ? MEAL_WEIGHTS.beverageMatch : MEAL_WEIGHTS.beverageConflict;
    } else if (isBev) {
      // A beverage candidate for a clearly-solid item (a Coke record surfacing for
      // "protein bar") — demote, never remove.
      s += MEAL_WEIGHTS.beverageConflict;
    }

    // (2) Shared cooked expectation for a commodity item.
    if (p.cookedExpected) {
      var prep = nuMealCandidatePrep(f);
      if (prep.cooked || prep.prepared) s += MEAL_WEIGHTS.cookedMatch;
      else if (prep.raw || prep.dry) s += MEAL_WEIGHTS.rawConflict;
    }

    // (3) Meal-consistency: a different animal than the one the item named.
    if (p.animal) {
      var ca = nuMealCandidateAnimal(f);
      if (ca && _mStem(ca) !== _mStem(p.animal)) s += MEAL_WEIGHTS.animalConflict;
    }

    // Bounded — meal context is a tie-breaker, never an override.
    if (s > MEAL_WEIGHTS.totalCap) s = MEAL_WEIGHTS.totalCap;
    if (s < -MEAL_WEIGHTS.totalCap) s = -MEAL_WEIGHTS.totalCap;
    return s;
  };
}

/* ── Confidence evidence (always computed when context exists) ───────────────
 * Assess how the TOP candidate sits within the meal — SUPPORT (it fits) vs
 * CONFLICT (it contradicts the meal). Pure and side-effect-free. The confidence
 * layer (food-core nuAssessConfidence) always records this as evidence/provenance;
 * whether it may CHANGE a disposition is gated separately (policy.mealContext),
 * so diagnostics exist without silently increasing clarifications. */
function nuMealAssess(projection, candidate) {
  var p = nuValidateProjection(projection);
  if (!p || !candidate) return { active: false, support: false, conflict: false, reasons: [] };
  var reasons = [];
  var support = false, conflict = false;

  var isBev = nuMealCandidateIsBeverage(candidate);
  if (p.beverage && isBev) { support = true; reasons.push('beverage_match'); }
  if (p.beverage && !isBev) { conflict = true; reasons.push('beverage_expected'); }
  if (!p.beverage && isBev) { conflict = true; reasons.push('beverage_unexpected'); }

  if (p.cookedExpected) {
    var prep = nuMealCandidatePrep(candidate);
    if (prep.cooked || prep.prepared) { support = true; reasons.push('cooked_match'); }
    else if (prep.raw || prep.dry) { conflict = true; reasons.push('raw_in_cooked_meal'); }
  }

  if (p.animal) {
    var ca = nuMealCandidateAnimal(candidate);
    if (ca && _mStem(ca) !== _mStem(p.animal)) { conflict = true; reasons.push('animal_mismatch'); }
    else if (ca) { support = true; reasons.push('animal_match'); }
  }

  return { active: true, support: support, conflict: conflict, reasons: reasons };
}

/* ── Node export (guarded — browser globals otherwise) ─────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MEAL_WEIGHTS: MEAL_WEIGHTS,
    MEAL_LIMITS: MEAL_LIMITS,
    MEAL_SCHEMA_VERSION: MEAL_SCHEMA_VERSION,
    MEAL_PROJECTION_VERSION: MEAL_PROJECTION_VERSION,
    nuBuildMealContext: nuBuildMealContext,
    nuMealItemProjection: nuMealItemProjection,
    nuSerializeMealContext: nuSerializeMealContext,
    nuParseMealContext: nuParseMealContext,
    nuValidateProjection: nuValidateProjection,
    nuMealSignal: nuMealSignal,
    nuMealAssess: nuMealAssess,
    // classifiers (exported for focused tests)
    nuMealCategory: nuMealCategory,
    nuMealIsBeverage: nuMealIsBeverage,
    nuMealAnimal: nuMealAnimal,
    nuMealIsCommodity: nuMealIsCommodity,
    nuMealLocalPrep: nuMealLocalPrep,
    nuMealRole: nuMealRole,
    nuMealCandidateIsBeverage: nuMealCandidateIsBeverage,
    nuMealCandidatePrep: nuMealCandidatePrep,
    nuMealCandidateAnimal: nuMealCandidateAnimal,
  };
}
