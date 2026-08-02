/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Food-Ranking Core (Phase 4.2.2)
 *
 * The pure candidate-reranking intelligence behind every food search. One
 * ranking brain, one source of truth: /api/usda-search (the authoritative
 * ranking boundary) invokes it to order candidates BEFORE any surface sees
 * them, so Manual Search, AI Quick Log, the barcode scanner's search
 * fallback, and every future surface (Voice, Photo, AI Coach, Meal
 * Reasoning) consume one already-ranked candidate contract — no surface
 * reranks on its own. (A direct barcode HIT is one exact product and
 * saved-meal REPLAY uses stored items — neither ranks, by design.)
 *
 * Extracted from api/usda-search.js (Phase 4.2.2). Pure by contract: no
 * network, no auth, no env vars, no DOM — deterministic input → output, so
 * tests and benchmarks run the EXACT production ranking offline.
 *
 * Dual runtime (same pattern as food-core.js / snapshot.js / weight.js):
 *   • Node — module.exports below; api/usda-search.js, tests, and benchmarks
 *     require() it.
 *   • Browser — loadable via <script> if a future surface ever needs local
 *     reranking; no page loads it today (the proxy ranks server-side).
 *
 * Public contract:
 *   rankFoodCandidates(query, candidates, options) → { foods, counts, genericFirst }
 *     query      — the EFFECTIVE (already expanded) search query string
 *     candidates — trimmed USDA Candidate objects (see food-core.js contract);
 *                  branded vs generic is derived from dataType === 'Branded'
 *     options    — { brandedCap?, genericCap?, signals? } — `signals` is the
 *                  extension seam for future scoring passes (see below)
 *   Returned foods carry `group` ('branded'|'generic') and `score`; order is
 *   deterministic (score → shorter name → SR Legacy first).
 *
 * Extension seam (Phase 4.2.3+): options.signals is an array of pure
 * functions (candidate, features, ctx) → number, summed into each score.
 * Future phases plug in here WITHOUT touching candidate acquisition or
 * rewriting this engine: confidence interpretation (4.2.3), correction-
 * history preference (4.2.4), portion compatibility (4.2.5), meal-context
 * compatibility (4.2.6), personal preference (4.7). No built-in behavior
 * for those exists yet — this phase ships the seam only.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── Centralized ranking weights ─────────────────────────────────────────
 * EVERY score contribution lives here, named — no magic numbers inside the
 * scoring passes. Tuning ranking = editing this table (plus the config term
 * lists below); adding a signal = a new named weight + a small pass.
 * `…Cap` entries bound how often a per-item weight can repeat. */
const RANK_WEIGHTS = {
  // data sanity
  implausibleKcal: -2000,     // >950 kcal/100g: label-data error (kJ as kcal…)
  usdaProgramEntry: -400,     // "(Includes foods for USDA…)" institutional twins
  emptyMacroPanel: -1500,     // no kcal/protein/carbs/fat at all — useless to log
  researchParenthetical: -250,// "(Hopi)", "(shoyu)" research entries — tie-break down

  // phrase / token match quality
  phraseMatch: 1000,          // whole query phrase in brand+description (either word order)
  phraseStart: 600,           // description STARTS with the phrase
  brandTokenMatch: 250,       // per query token matching a brand token
  allTokensPresent: 200,      // every query token present (stem-aware)
  tokenPresent: 40,           // per present query token
  firstTokenStart: 80,        // description starts with the first query token
  missingToken: -250,         // per typed token ABSENT from the candidate text
  missingTokenCap: 3,         //   (missing-word penalty — phrase similarity, 4.2.2)

  // branded signals
  recognizedBrand: 900,       // recognized national brand (curated KNOWN_BRANDS)
  brandIntent: 1500,          // user typed this brand → its products dominate
  brandIntentDescToken: 250,  // brand word also in the description (Coca-Cola Classic > Sprite)
  brandIntentDescTokenCap: 2,
  brandFreqStep: 25,          // low-weight popularity proxy (catalog size in pool)
  brandFreqCap: 5,

  // generic / canonical signals
  nameIsQuery: 2000,          // the food's NAME is the query ("Honey" for honey)
  exactFullName: 1800,        // whole description = the query words, any order
  wholeCategory: 400,         // generic food in a whole-food USDA category
  principalExact: 300,        // principal segment IS the query ("Bananas, raw")
  baseFood: 1500,             // named + all tokens + a base-prep descriptor
  canonicalPositive: 100,     // per unqueried base-food descriptor (raw/cooked/whole…)
  canonicalPositiveCap: 2,
  canonicalNegative: -200,    // per unqueried derivative descriptor (salad/juice/bar…)
  canonicalNegativeCap: 3,
  preferredCut: 250,          // unqueried preferred cut/type (breast, fillet, sirloin)
  polarityMismatch: -400,     // query asserts an explicit polarity (sweet/unsweetened);
                              //   candidate asserts the OPPOSITE → penalize (symmetric)

  // food-specific intent (FOOD_INTENT maps)
  intentPrefer: 600,          // carries a preferred form the user did not type
  intentPenalize: -1100,      // carries a penalized derivative the user did not type
  intentTop: 300,             // tie-break toward the intended default form (rice: cooked)
  competingSubtype: -600,     // flaunts a SIBLING subtype while missing the typed one
                              //   ("jasmine rice" must never boost a white-rice entry
                              //    on its untyped 'white' — see scoreFoodIntent)

  // ── Phase 4.2.7 tiered identity/intent/quality signals ──────────────────
  // Sized to enforce the priority model (Checkpoint 1): PRIMARY IDENTITY beats
  // EXPLICIT INTENT beats CANDIDATE QUALITY. Provisional values tuned against the
  // benchmark corpus (see the Checkpoint 2 weight review) — a wrong species/family
  // can never win on preparation, category, brand, form, or serving overlap.
  // Tier 1 — primary identity
  speciesMismatch: -1800,     // query names an animal; candidate is a DIFFERENT animal
  familyIdentityMismatch: -1500, // query IS a food identity; candidate is an incompatible family
  // Tier 2 — explicit user intent
  productFormMismatch: -1300, // query names a product form; candidate is an incompatible form
  missingRequestedBrand: -600,// query named a known brand; candidate is generic/other-brand
  specialtySubtype: -350,     // generic query; candidate flaunts an unrequested specialty subtype
  specialtySubtypeCap: 2,
  // Tier 3 — candidate quality (tie-breaker band; NEVER flips identity)
  servingUsable: 90,          // usable gram/ml serving weight present
  servingHousehold: 40,       // parseable household measure ("1 cup", "2 tbsp")
  servingWeak: -120,          // branded row with NO usable serving AND no household measure
};

/* ── Ranking configuration (extend here — no code changes needed) ────────────
 * Moved verbatim from api/usda-search.js (Phase 4.2.2 extraction). */

// Recognizable national consumer brands. Used to float well-known products above
// obscure/regional ones for brand-y searches (milk, yogurt, protein bar…).
// Multi-word entries match as a substring of the brand; single words match a whole
// brand token (so "one" doesn't match "Stonefire"). Add brands by editing this list.
const KNOWN_BRANDS = [
  // dairy / milk
  'fairlife', 'lactaid', 'horizon', 'organic valley', 'dairypure', 'a2', 'darigold',
  'borden', 'silk', 'oatly', 'almond breeze', 'ripple', 'so delicious', 'land o lakes',
  // yogurt
  'chobani', 'oikos', 'fage', 'siggis', 'two good', 'yoplait', 'dannon', 'activia',
  'noosa', 'stonyfield', 'wallaby', 'powerful',
  // bars / protein
  'quest', 'barebells', 'one', 'pure protein', 'kirkland', 'clif', 'kind', 'rxbar',
  'no cow', 'built', 'larabar', 'perfect bar', 'gomacro', 'zone perfect', 'nature valley',
  'met rx', 'power crunch', 'pro bar', 'think',
  // protein / supplements / shakes
  'premier protein', 'muscle milk', 'core power', 'ensure', 'orgain', 'vega', 'ghost',
  'optimum nutrition', 'dymatize', 'isopure', 'bsn',
  // bread / bakery
  'daves killer', 'natures own', 'sara lee', 'wonder', 'pepperidge farm', 'oroweat',
  'arnold', 'thomas', 'martins', 'kings hawaiian', 'brownberry', 'mrs bairds',
  // cereal / grains / pantry
  'general mills', 'kelloggs', 'post', 'quaker', 'cheerios', 'kashi', 'bobs red mill',
  'barilla', 'ronzoni',
  // drinks
  'coca cola', 'pepsi', 'gatorade', 'powerade', 'red bull', 'monster', 'celsius',
  'bodyarmor', 'tropicana', 'minute maid', 'simply',
  // snacks / condiments / staples
  'kraft', 'nabisco', 'lays', 'doritos', 'cheetos', 'oreo', 'ritz', 'planters',
  'skippy', 'jif', 'peter pan', 'smuckers', 'hellmanns', 'heinz', 'hidden valley',
  'philadelphia', 'tillamook', 'sargento', 'kerrygold',
  // meat / deli
  'tyson', 'perdue', 'oscar mayer', 'hormel', 'jennie o', 'applegate', 'johnsonville',
  'hillshire', 'butterball',
  // frozen / meals
  'amys', 'healthy choice', 'lean cuisine', 'stouffers', 'birds eye', 'green giant',
  // store brands (broadly stocked)
  'great value', 'market pantry', 'simple truth', '365', 'good gather', 'trader joes',
];

// Whole-food USDA categories — produce, raw meat/fish, grains, legumes, nuts.
// A GENERIC result in one of these is an unprocessed whole food, so such searches
// lead with generic USDA entries. This is the scalable replacement for a per-food
// list: every fruit/vegetable/cut/grain is covered by its category automatically.
// USDA's category taxonomy is small and stable; extend here only if a category is
// missing. (Baked/Snacks/Sweets/Beverages are intentionally NOT here — those
// aisles are brand-driven. Dairy & Egg IS here: typing a generic dairy food —
// egg, milk, yogurt, cheese — must lead with the generic food per the product
// rule; a typed brand (Chobani, Fairlife) still wins via brand intent.)
const WHOLE_FOOD_CATEGORIES = new Set([
  'dairy and egg products',
  'fats and oils',
  'fruits and fruit juices',
  'vegetables and vegetable products',
  'legumes and legume products',
  'nut and seed products',
  'cereal grains and pasta',
  'finfish and shellfish products',
  'beef products',
  'pork products',
  'poultry products',
  'lamb, veal, and game products',
  'sausages and luncheon meats',
  // Prepared-dish queries ("double cheeseburger", "fries"): USDA's canonical
  // entries live in the Fast Foods category (Fast foods…, McDONALD'S…,
  // BURGER KING…). Without this, branded accessory products (HAMBURGER BUNS,
  // BURGER SAUCE, dinner kits) lead purely on phrase-match bonuses. Typed
  // brands still override via brand intent.
  'fast foods',
]);

// Canonical food preference. For a base-food search, reward the normal base food
// (raw/cooked/whole cuts) and penalize compound/processed/recipe foods that merely
// contain the word. INTENT-AWARE: a term is only applied when the user did NOT
// search it — so "orange juice", "rice flour", "egg whites", "salmon nuggets" still
// rank their literal food. Extend either list with plain phrases; no code changes.
const POSITIVE_TERMS = [
  'raw', 'cooked', 'boiled', 'baked', 'roasted', 'grilled', 'whole', 'large', 'medium',
  'fresh', 'with skin', 'boneless', 'skinless', 'breast', 'ground', 'fillet',
  'white rice', 'brown rice', 'jasmine', 'basmati', 'rolled oats', 'steel cut oats',
  'old fashioned oats', 'brewed',
];
// Derivative / processed / recipe descriptors. A food carrying one of these (that
// the user did NOT type) ranks below the base food — egg salad, apple pie, waffle
// cone, rice cakes, chicken feet, egg makers, etc. Add words here, not in code.
const NEGATIVE_TERMS = [
  'salad', 'substitute', 'dried', 'powder', 'flour', 'peel', 'juice', 'crackers',
  'chips', 'pancakes', 'buns', 'gnocchi', 'breaded', 'nuggets', 'spread', 'meatless',
  'taco', 'nachos', 'restaurant', 'baby food', 'babyfood', 'cereal', 'granola', 'bar',
  'muffin', 'cake', 'vinegar', 'oil', 'bran', 'mix', 'flavored', 'deli', 'sliced',
  'luncheon',
  // Phase 3.1.2 — more derivatives surfaced in live testing
  'patties', 'patty', 'fries', 'pie', 'cookies', 'cookie', 'dessert', 'bowl', 'cone',
  'dip', 'sauce', 'bratwurst', 'coating', 'mayonnaise', 'makers', 'maker', 'feet',
  'fritter', 'concentrate', 'pudding', 'jerky', 'sausage', 'soup', 'wrap', 'roll',
  'pizza', 'sandwich', 'smoothie',
  // Final quality pass — derivative aisles that beat base foods in live testing
  'candy', 'ice cream', 'syrup', 'drink', 'topping', 'filling', 'glaze',
  'noodles', 'bites', 'fried', 'tofu', 'diet',
  // Phase 4.2 live testing — dry/crisp toast products must never outrank bread
  // for a bread-intent query (intent-aware: typing "melba toast" still works)
  'melba', 'crispbread', 'rusk', 'rusks', 'zwieback', 'croutons', 'crouton',
];
// Base-prep descriptors that mark the unprocessed whole food (subset of positives).
const BASE_PREP_TERMS = ['raw', 'cooked', 'boiled', 'baked', 'roasted', 'grilled', 'fresh', 'whole', 'fillet'];
// Preferred cuts/types people overwhelmingly intend (chicken breast, beef sirloin,
// salmon fillet). A food carrying one — that the user did not type — is lifted over
// obscure parts/forms (chicken breast over chicken feet). Configurable, not in code.
const PREFERRED_CUT_TERMS = [
  'breast', 'thigh', 'tenderloin', 'drumstick', 'wing', 'fillet', 'filet',
  'sirloin', 'ribeye', 'loin', 'round', 'chuck', 'brisket',
];

// Brand aliases — common ways people type a brand. Maps a typed token to the
// canonical brand phrase used for brand-intent detection AND for the upstream
// USDA query (so "coke" actually fetches Coca-Cola products). Extend freely.
const BRAND_ALIASES = {
  coke: 'coca cola', cocacola: 'coca cola', cococola: 'coca cola', coca: 'coca cola',
};

// Cooking-form rewrites — a preparation word people use as a food noun maps to
// the base food it IS: "toast" is sliced bread, and toasting doesn't change the
// base-food identity. Modifiers pass through untouched ("whole wheat toast" →
// "whole wheat bread", "sourdough toast" → "sourdough bread"), so this is one
// GLOBAL query-normalization rule, not a per-food result. EXCEPTIONS: when any
// context word marks a DISTINCT product ("french toast", "melba toast", "texas
// toast", "cinnamon toast crunch"), the query is left alone — those are their
// own foods and must still match literally. Add a rewrite or an exception word
// to tune; no code changes.
const TERM_REWRITES = {
  toast:   { to: 'bread', unless: ['french', 'melba', 'texas', 'avocado', 'cinnamon', 'crunch'] },
  toasted: { to: 'bread', unless: ['french', 'melba', 'texas', 'avocado', 'cinnamon', 'crunch'] },
  // "oatmeal" IS oats (USDA files the generic under "oats"; typed literally it
  // drowns in oatmeal-bread/-cookie products) — except when a product word
  // marks a derivative the user actually named.
  oatmeal: { to: 'oats', unless: ['bread', 'cookie', 'cookies', 'muffin', 'raisin', 'crisp', 'stout', 'cream'] },
  // "mayo" IS mayonnaise — a complete condiment identity people type as shorthand.
  // Left literal when a bean-cultivar context is named ("flor de mayo" beans is a
  // DIFFERENT food that must still match), and the identity-family pass (below) is
  // the INDEPENDENT category safety net so a bean carrying the token 'mayo' can
  // never win a mayonnaise query even if it reaches the pool.
  mayo: { to: 'mayonnaise', unless: ['flor', 'de', 'bean', 'beans'] },
};

// Phrase-level shorthand people type that USDA text never contains. Applied to
// the normalized query string BEFORE tokenization (nText has already collapsed
// punctuation, so "pb&j" arrives as "pb j"). Ordered — most specific first.
const PHRASE_REWRITES = [
  [/\bpb\s*j\b|\bpbj\b/g, 'peanut butter jelly'],
  [/\bpb\b/g, 'peanut butter'],
];

// Typeahead vocabulary — the generic foods people most commonly search. When a
// SINGLE-token query (≥3 chars) is a strict prefix of an entry, the query is
// completed to that entry before hitting USDA ("blueb" → "blueberries"), so
// partial typing predicts the obvious food. This is one GLOBAL mechanism, not
// per-food ranking hacks: add/reorder entries to tune, no code changes. ORDER
// RESOLVES COLLISIONS — the first entry matching the prefix wins ("chi" →
// chicken before chickpeas). A token exactly equal to an entry never expands.
const COMMON_FOODS = [
  // proteins
  'chicken', 'chickpeas', 'egg', 'eggs', 'salmon', 'steak', 'shrimp', 'turkey',
  'tuna', 'tilapia', 'beef', 'ground beef', 'pork', 'bacon', 'ham', 'fish', 'tofu',
  // dairy
  'yogurt', 'greek yogurt', 'milk', 'cheese', 'cottage cheese', 'butter', 'cream',
  // fruits
  'banana', 'bananas', 'apple', 'apples', 'blueberries', 'blueberry', 'blackberries',
  'strawberries', 'strawberry', 'raspberries', 'orange', 'oranges', 'grapes', 'mango',
  'watermelon', 'waffle', 'pineapple', 'peach', 'pear', 'cherries', 'avocado', 'lemon',
  // vegetables
  'broccoli', 'brussels sprouts', 'spinach', 'carrots', 'cauliflower', 'cucumber',
  'lettuce', 'tomato', 'onion', 'peppers', 'potato', 'sweet potato', 'kale',
  'zucchini', 'asparagus', 'mushrooms', 'green beans', 'corn', 'celery',
  // grains / carbs
  'rice', 'oats', 'oatmeal', 'bread', 'pasta', 'quinoa', 'tortilla', 'bagel',
  'cereal', 'pancakes', 'granola',
  // beverages ('water' must be an exact entry or typeahead completes it to watermelon)
  'water', 'coffee', 'tea',
  // nuts / fats / other staples
  'peanut butter', 'peanuts', 'almonds', 'almond butter', 'walnuts', 'cashews',
  'protein', 'honey', 'hummus', 'olive oil', 'beans', 'lentils',
];

// Food-specific intent maps. When the query IS one of these base foods, strongly
// prefer the forms people overwhelmingly mean and strongly penalize derivatives —
// far beyond the generic word lists. Intent-aware: a prefer/penalize term is only
// applied when the user did NOT type it. Edit these maps to tune a food; no code.
//
// `prefer` doubles as the food's SUBTYPE vocabulary: when the user types one of
// these terms ("jasmine rice", "brown rice"), candidates carrying a SIBLING
// prefer-term without the typed one are competing subtypes — they never collect
// the prefer boost and take the competingSubtype penalty instead (Phase 4.2.2).
//
// `supplement`: a second, small generic USDA query merged into the pool when the
// user's query IS exactly this base food. USDA's own relevance buries the obvious
// cut/form — "chicken" returns no raw breast in its top 50 of 402, "rice" no plain
// cooked white rice in 50 of 141 — so ranking alone can never surface them.
// Burger-family intent, shared by cheeseburger/hamburger/burger keys below.
// "double cheeseburger" must offer REAL burgers — SR's fast-food/restaurant
// entries (Fast foods…, McDONALD'S…, BURGER KING…) and actual burger products —
// never dinner-kit/seasoning/frozen-meal derivatives that merely contain the
// word. The client shows a "which one?" chooser for the Fast Foods category,
// so ranking's job is getting the right candidates into the top 4.
// NOTE: restaurant names deliberately NOT in prefer — boosting "burger king"
// wholesale surfaced BK onion rings/hash browns for "burger". Preferring the
// burger words themselves lifts actual burgers from every restaurant instead.
const BURGER_PREFER = ['fast foods', 'hamburger', 'cheeseburger', 'beef', 'patty'];
const BURGER_PENALIZE = [
  'helper', 'macaroni', 'pasta', 'dinner', 'entree', 'kit', 'kits', 'skillet',
  'seasoning', 'seasoned', 'marinade', 'meal', 'meals', 'soup', 'dip', 'pizza',
  'crumbles', 'relish', 'bites',
];

const FOOD_INTENT = {
  cheeseburger: { prefer: BURGER_PREFER, penalize: BURGER_PENALIZE, supplement: 'fast foods cheeseburger' },
  hamburger:    { prefer: BURGER_PREFER, penalize: BURGER_PENALIZE, supplement: 'fast foods hamburger' },
  burger:       { prefer: BURGER_PREFER, penalize: BURGER_PENALIZE, supplement: 'fast foods hamburger' },
  'peanut butter': {
    prefer:   ['creamy', 'natural', 'organic', 'smooth', 'crunchy'],
    penalize: ['candy', 'coating', 'cereal', 'oatmeal', 'dessert', 'cup', 'cups', 'cookie', 'ice cream',
               'reduced fat', 'fortified'],
    // SR "smooth style" carries the real 2-tbsp household portion; the otherwise
    // tying Foundation "creamy" has NO portions and would default to 100 g.
    top: 'smooth',
  },
  milk: {
    prefer:   ['whole'],
    penalize: ['buttermilk', 'goat', 'sheep', 'human', 'condensed', 'evaporated', 'dry',
               'powdered', 'chocolate', 'eggnog', 'imitation', 'shake', 'canned'],
    // "Milk, whole, 3.25%…" is buried below USDA's top 50 for "milk", and even
    // "whole milk" returns cheese/yogurt first — this phrasing surfaces it at #1.
    supplement: 'milk whole 3.25',
  },
  bread: {
    prefer:   ['white', 'wheat', 'whole wheat'],
    penalize: ['dulce', 'dessert', 'stuffing', 'pita', 'naan'],
  },
  jelly: {
    // "jelly" — alone or next to bread/toast/sandwich/peanut butter — means the
    // fruit spread, never the candy aisle. Intent-aware as always: an explicit
    // "jelly beans" query typed the word, so the penalty doesn't apply there.
    prefer:   ['grape', 'strawberry', 'jam', 'preserves'],
    penalize: ['beans', 'bean', 'belly', 'gummy', 'gummies', 'donut', 'doughnut', 'roll'],
    // USDA's generic entry is "Jellies"; its relevance for "jelly" buries it.
    supplement: 'jelly jams preserves',
  },
  oats: {
    // People logging "oats"/"oatmeal" mean rolled oats (½-cup servings), not
    // raw groats whose 1-cup portion weighs twice as much.
    prefer:   ['rolled', 'old fashioned', 'quick'],
    penalize: ['bran', 'groats'],
    supplement: 'oats old fashioned rolled dry',
  },
  yogurt: {
    // "greek yogurt" must not land on fruit/flavored cups — plain is the base
    // food; flavors rank only when the user names them.
    prefer:   ['plain', 'greek'],
    penalize: ['fruit', 'vanilla', 'strawberry', 'blueberry', 'peach', 'cherry', 'honey',
               'flavored', 'drink', 'frozen', 'parfait', 'dressing', 'tzatziki', 'covered',
               'pretzels', 'raisins', 'smoothie'],
    supplement: 'yogurt greek plain whole milk',
  },
  salmon: {
    // 'canned' stays salmon-specific (NOT global): canned IS the common form
    // people mean for tuna, so a global penalty would hurt that search.
    prefer:   ['fillet', 'raw', 'grilled'],
    penalize: ['canned', 'smoked', 'jerky', 'lox'],
  },
  bacon: {
    prefer:   ['pork', 'cured'],
    penalize: ['turkey', 'meatless', 'rendered', 'grease', 'bits'],
  },
  rice: {
    prefer:   ['white', 'brown', 'jasmine', 'basmati', 'cooked', 'long grain'],
    penalize: ['crackers', 'cakes', 'flour', 'pilaf', 'pudding', 'mix', 'snack', 'cereal', 'vinegar', 'bran'],
    supplement: 'white rice cooked',
    top: 'cooked',           // people log cooked rice — break the raw/cooked tie
  },
  chicken: {
    prefer:   ['breast', 'tenderloin', 'thigh', 'drumstick', 'wing', 'whole', 'ground'],
    penalize: ['feet', 'spread', 'broth', 'bratwurst', 'salad', 'nuggets', 'canned', 'sausage', 'patty', 'patties',
               'giblets', 'gizzard', 'liver', 'heart', 'neck', 'back', 'tail', 'paws'],
    supplement: 'chicken breast',
  },
  waffle: {
    prefer:   ['plain', 'belgian', 'frozen', 'homemade', 'buttermilk'],
    penalize: ['fries', 'fry', 'fried', 'bowl', 'cone', 'cereal', 'crunch'],
  },
  egg: {
    // 'whole'/'large' only — listing white/yolk here tied them with the whole egg
    prefer:   ['whole', 'large'],
    penalize: ['substitute', 'replacer', 'salad', 'mayonnaise', 'noodles', 'makers', 'maker'],
  },
};

/* ── Phase 4.2.7 — identity / product-form / subtype / serving-quality config ──
 * New shared ranking dimensions, each a plain config table consumed by one
 * isolated scoring pass. Together they enforce the approved tier hierarchy:
 * PRIMARY IDENTITY (species, food-family) > EXPLICIT INTENT (brand, product form,
 * requested subtype) > CANDIDATE QUALITY (serving metadata). Extend a table here;
 * no code changes. All matching is intent-aware and stem-aware like the lists
 * above, so an explicitly-named species/form/subtype is never self-penalized. */

// Primary-animal identity. A query naming one animal must not resolve to a
// materially different animal (chicken → turkey) however much the preparation or
// USDA category overlaps. Token → canonical species. A species with a PARENT
// (salmon → fish) is compatible with a query for that parent, but two siblings
// under one parent (salmon vs tuna) are NOT compatible. Cured/processed
// cross-species cuts (bacon/sausage/ham) are excluded — they legitimately mix
// animal names — so they never assert a species identity here.
const ANIMAL_SPECIES = {
  chicken: 'chicken', turkey: 'turkey', duck: 'duck', goose: 'goose',
  beef: 'beef', steak: 'beef', veal: 'veal', bison: 'bison', buffalo: 'bison',
  pork: 'pork', lamb: 'lamb', mutton: 'lamb', goat: 'goat',
  fish: 'fish', salmon: 'salmon', tuna: 'tuna', cod: 'cod', tilapia: 'tilapia',
  halibut: 'halibut', trout: 'trout', sardine: 'sardine', mackerel: 'mackerel',
  shrimp: 'shrimp', crab: 'crab', lobster: 'lobster',
};
// Species → broader parent group. A query for the PARENT ("fish") accepts any
// child ("salmon"); a query for a CHILD does not accept a sibling.
const SPECIES_PARENT = {
  salmon: 'fish', tuna: 'fish', cod: 'fish', tilapia: 'fish', halibut: 'fish',
  trout: 'fish', sardine: 'fish', mackerel: 'fish',
};
// Animal tokens that are cross-species processed cuts — never a species identity
// (a "turkey bacon" must not read as species=turkey; "hot dog" isn't an animal).
const SPECIES_CROSS = { bacon: 1, sausage: 1, ham: 1, jerky: 1, hot: 1, dog: 1, dogs: 1 };

// Product-form intent. A query naming a form (bar/shake/drink/milk/powder…) must
// not resolve to an INCOMPATIBLE form of the same brand/food (Fairlife protein
// BAR must not land on Fairlife MILK). Token → canonical form.
const PRODUCT_FORMS = {
  bar: 'bar', bars: 'bar',
  shake: 'shake', shakes: 'shake',
  drink: 'drink', beverage: 'drink', rtd: 'drink',
  milk: 'milk',
  powder: 'powder', isolate: 'powder',
  yogurt: 'yogurt',
  cheese: 'cheese',
  cereal: 'cereal',
  bread: 'bread',
  sauce: 'sauce',
  dressing: 'dressing',
  butter: 'butter',
  juice: 'juice',
  chips: 'chips',
  cracker: 'cracker', crackers: 'cracker',
};
// Forms that are mutually acceptable (a "protein shake" IS a "protein drink"; a
// ready-to-drink shake reads as a drink). Each row is one interchangeable set.
const FORM_COMPAT = [
  ['shake', 'drink'],
];

// Standalone food identities prone to substring collisions inside unrelated food
// NAMES ("mayo" ⊂ "flor de mayo" bean). When the query IS such an identity, a
// candidate from an INCOMPATIBLE food family is a false match even if it carries
// the token. Identity token → the candidate families it may belong to. This is
// the category-compat safety net (Checkpoint 1): collisions are blocked by family,
// independent of any query text rewrite. Extend with collision-prone identities.
const IDENTITY_EXPECTED_FAMILY = {
  mayonnaise: ['fats_oils', 'condiment'],
  mayo: ['fats_oils', 'condiment'],
  ketchup: ['condiment', 'vegetable'],
  mustard: ['condiment', 'spice'],
};

// Coarse candidate food-family from the STRUCTURED USDA foodCategory (preferred
// over name text). Ordered — first match wins. Consumed by the identity-family
// and (indirectly) product-form passes. Unknown family → no identity penalty.
const CANDIDATE_FAMILY = [
  ['legume', /legume/i],
  ['dairy', /dairy/i],
  ['condiment', /salad dressing|condiment|gravy|gravies|\bdip/i],
  ['fats_oils', /fats and oils/i],
  ['spice', /spices and herbs/i],
  ['fruit', /fruit/i],
  ['vegetable', /vegetable/i],
  ['grain', /cereal grain|pasta/i],
  ['poultry', /poultry/i],
  ['beef', /beef products/i],
  ['pork', /pork products/i],
  ['fish', /finfish|shellfish/i],
  ['baked', /baked/i],
  ['sweets', /sweets/i],
  ['snacks', /snack/i],
  ['beverage', /beverage/i],
  ['nuts', /nut and seed/i],
];

// Specialty / niche subtype modifiers. For a GENERIC query (the plain base food,
// no subtype named), a candidate flaunting one of these UNREQUESTED specialty
// modifiers is not what "rice"/"milk" plainly mean — demote it. Intent-aware:
// when the user names the subtype ("glutinous rice"), it is neutral and the
// specialty candidate surfaces normally. Multi-word entries match as a phrase
// (both stems present) so "sweet" alone never hits "sweet potato". Reusable
// across foods — add a modifier here, not in code.
const SPECIALTY_SUBTYPES = [
  'glutinous', 'sticky', 'sushi', 'arborio', 'mochi', 'sweet rice', 'wild rice',
  'condensed', 'evaporated', 'eggnog', 'kefir',
];

/* ── Text normalization shared by the query pipeline AND scoring ─────────────
 * Forgiving matching means both sides normalize identically: lowercase,
 * apostrophes REMOVED ("REESE'S" ↔ "reeses"), any other punctuation → space
 * ("Coca-Cola" ↔ "coca cola"). '%' survives so "2% milk" matches "2% milkfat". */
function nText(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function tokenize(q) {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

// Quantity/unit/filler tokens users type that USDA text never contains
// ("2 eggs", "100g chicken", "cup of rice"). A unit word is only stripped in a
// MEASUREMENT position — right after a quantity or right before "of" — so food
// names that contain these words survive ("reeses pieces", "cheese slices").
// Stripping never empties the query.
const UNIT_WORDS = new Set([
  'g', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'ml', 'l', 'liter', 'liters', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons',
  'teaspoon', 'teaspoons', 'slice', 'slices', 'piece', 'pieces', 'serving', 'servings',
  'scoop', 'scoops', 'glass', 'bowl', 'handful', 'handfuls',
]);
const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'some', 'my', 'and', 'with']);
function isQuantityToken(t) {
  return /^\d+([./]\d+)?$/.test(t) || /^\d+(\.\d+)?(g|kg|oz|lb|lbs|ml|l)$/.test(t);
}
// "2 slices bread" → [bread]; "cup of rice" → [rice]; "reeses pieces" → intact.
function stripMeasurements(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (STOP_WORDS.has(t)) continue;
    if (isQuantityToken(t)) continue;
    if (UNIT_WORDS.has(t)) {
      const afterQty = i > 0 && isQuantityToken(toks[i - 1]);
      const beforeOf = i + 1 < toks.length && toks[i + 1] === 'of';
      if (afterQty || beforeOf) continue;
    }
    out.push(t);
  }
  return out;
}

/* ── Dictionary for spell correction + compound splitting ────────────────────
 * Derived from EVERY config list above (foods, brands, cuts, descriptors,
 * derivative terms, aliases) — growing any list automatically extends typo
 * tolerance. Order matters for ties: common foods first (most likely intent). */
const DICT_WORDS = (function () {
  const out = [];
  const seen = new Set();
  function add(phrase) {
    String(phrase).split(/\s+/).forEach(function (w) {
      w = nText(w).replace(/\s+/g, '');
      if (w.length >= 3 && !seen.has(w)) { seen.add(w); out.push(w); }
    });
  }
  COMMON_FOODS.forEach(add);
  Object.keys(FOOD_INTENT).forEach(add);
  Object.keys(FOOD_INTENT).forEach(function (k) {
    (FOOD_INTENT[k].prefer || []).forEach(add);
    (FOOD_INTENT[k].penalize || []).forEach(add);
  });
  PREFERRED_CUT_TERMS.forEach(add);
  POSITIVE_TERMS.forEach(add);
  NEGATIVE_TERMS.forEach(add);
  BASE_PREP_TERMS.forEach(add);
  KNOWN_BRANDS.forEach(add);
  Object.keys(BRAND_ALIASES).forEach(add);
  Object.keys(BRAND_ALIASES).forEach(function (k) { add(BRAND_ALIASES[k]); });
  Object.keys(TERM_REWRITES).forEach(add);
  Object.keys(TERM_REWRITES).forEach(function (k) {
    add(TERM_REWRITES[k].to);
    (TERM_REWRITES[k].unless || []).forEach(add);
  });
  return out;
})();
const DICT_SET = new Set(DICT_WORDS);

// Bounded Damerau-Levenshtein (optimal string alignment): returns the distance
// if ≤ max, else -1. Small strings + tiny bound → cheap.
function editDistanceLe(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return -1;
  const m = a.length, n = b.length;
  let prev2 = null;
  let prev = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);            // transposition (yogrut → yogurt)
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return -1;                      // whole row over budget → bail
    prev2 = prev; prev = cur;
  }
  return prev[n] <= max ? prev[n] : -1;
}

// Correct a token toward the dictionary. Guards against over-correction:
// exact words and PREFIXES of words pass through untouched (mid-typing is the
// typeahead's job), the first letter must match (typos rarely hit char 1),
// and short tokens are never corrected.
function spellCorrect(t) {
  if (t.length < 4 || DICT_SET.has(t)) return t;
  for (let i = 0; i < DICT_WORDS.length; i++) {
    if (DICT_WORDS[i].indexOf(t) === 0) return t;     // prefix of a known word
  }
  const max = t.length >= 8 ? 2 : 1;
  let best = null, bestD = max + 1;
  for (let i = 0; i < DICT_WORDS.length; i++) {
    const w = DICT_WORDS[i];
    if (w[0] !== t[0]) continue;
    const d = editDistanceLe(t, w, Math.min(max, bestD - 1));
    if (d >= 0 && d < bestD) { bestD = d; best = w; if (bestD === 1) break; }
  }
  return best || t;
}

// "peanutbutter" → "peanut butter": split a non-dictionary token into two
// dictionary words. General — covers any missing-space compound of known words.
function splitCompound(t) {
  if (t.length < 6 || DICT_SET.has(t)) return null;
  for (let i = 3; i <= t.length - 3; i++) {
    const a = t.slice(0, i), b = t.slice(i);
    if (DICT_SET.has(a) && DICT_SET.has(b)) return [a, b];
  }
  return null;
}

// Typeahead completion against COMMON_FOODS entry PHRASES. All tokens must
// align with the entry's words in order; the last may be a prefix. Covers both
// the single-token case ("blueb" → blueberries, "peanut" → peanut butter) and
// multi-word typing ("greek yog" → greek yogurt, "sweet pot" → sweet potato).
// A phrase the user typed out exactly is never changed.
function completeEntry(toks) {
  if (!toks.length || toks.length > 3) return null;
  const last = toks[toks.length - 1];
  if (last.length < 3) return null;
  const typed = toks.join(' ');
  for (let i = 0; i < COMMON_FOODS.length; i++) {
    if (COMMON_FOODS[i] === typed) return null;       // complete phrase — respect it
  }
  for (let i = 0; i < COMMON_FOODS.length; i++) {
    const words = COMMON_FOODS[i].split(/\s+/);
    if (words.length < toks.length) continue;
    let ok = true;
    for (let j = 0; j < toks.length - 1; j++) if (words[j] !== toks[j]) { ok = false; break; }
    if (!ok || words[toks.length - 1].indexOf(last) !== 0) continue;
    return words;                                     // first (highest-priority) match wins
  }
  return null;
}

// Rewrite the raw query BEFORE it hits USDA (and before scoring). Layers, all
// local and config-driven: normalize punctuation/case → strip quantities,
// units, stopwords → brand aliases → compound splitting → spell correction →
// dedupe → typeahead completion. Every layer generalizes: it acts on classes
// of input (typos, compounds, prefixes), never on individual foods.
function expandQuery(q) {
  const original = nText(q);
  // phrase shorthand ("pb j"/"pbj" → peanut butter jelly) before tokenization
  let phrased = original;
  PHRASE_REWRITES.forEach(function (pr) { phrased = phrased.replace(pr[0], pr[1]); });
  let toks = phrased.split(/\s+/).filter(Boolean);
  let changed = phrased !== original;

  // quantities/units/stopwords — "2 eggs", "100g chicken", "cup of rice"
  const kept = stripMeasurements(toks);
  if (kept.length && kept.length !== toks.length) { toks = kept; changed = true; }

  // brand aliases (may expand to multiple words: coke → coca cola)
  let aliased = [];
  toks.forEach(function (t) {
    const alias = BRAND_ALIASES[t.replace(/[^a-z0-9]/g, '')];
    if (alias) { aliased = aliased.concat(alias.split(/\s+/)); changed = true; }
    else aliased.push(t);
  });
  toks = aliased;

  // cooking-form rewrites ("whole wheat toast" → "whole wheat bread") unless a
  // context word marks a distinct product (french/melba/texas toast, cereal)
  let rewritten = [];
  toks.forEach(function (t) {
    const rw = TERM_REWRITES[t];
    if (rw && !toks.some(function (o) { return rw.unless.indexOf(o) !== -1; })) {
      rewritten.push(rw.to); changed = true;
    } else {
      rewritten.push(t);
    }
  });
  toks = rewritten;

  // compound splitting ("peanutbutter" → peanut butter). Spell correction is
  // deliberately NOT applied here: a legitimate word could sit at edit
  // distance 1 from a dictionary word ("dates" ↔ brand word "daves"), so
  // correction only runs in the zero-result recovery ladder, where the exact
  // query has already proven fruitless.
  let fixed = [];
  toks.forEach(function (t) {
    const sp = splitCompound(t);
    if (sp) { fixed = fixed.concat(sp); changed = true; return; }
    fixed.push(t);
  });
  toks = fixed;

  // dedupe (alias expansion can double a word: "coca cola" → coca cola cola)
  const deduped = toks.filter(function (t, i) { return toks.indexOf(t) === i; });
  if (deduped.length !== toks.length) { toks = deduped; changed = true; }

  // typeahead completion (single- and multi-word)
  const completed = completeEntry(toks);
  if (completed) { toks = completed; changed = true; }

  const eq = toks.join(' ');
  return { query: eq || original || q, expanded: changed && eq !== original };
}

// Rule-based singularizer (not a word list): handles regular English plurals so
// potatoes→potato, tomatoes→tomato, berries→berry, loaves→loaf, eggs→egg. Applied
// to BOTH the query and any compared text, so even an imperfect stem (asparagus→
// asparagu) still matches because both sides stem identically. Consistency > purity.
function stem(t) {
  t = t.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (t.length <= 3) return t;
  if (/ies$/.test(t)) return t.slice(0, -3) + 'y';                 // berries → berry
  if (/ves$/.test(t)) return t.slice(0, -3) + 'f';                 // loaves → loaf, leaves → leaf
  if (/(?:ses|xes|zes|ches|shes|oes)$/.test(t)) return t.slice(0, -2); // potatoes→potato, dishes→dish, boxes→box
  if (/ss$/.test(t)) return t;                                     // glass, molasses — leave alone
  if (/s$/.test(t)) return t.slice(0, -1);                          // apples → apple
  return t;
}
function stemTokens(toks) { return toks.map(stem); }

// Pre-stem the canonical term lists once (each term → array of stems).
const POSITIVE_STEMS = POSITIVE_TERMS.map(function (t) { return stemTokens(t.split(/\s+/)); });
const NEGATIVE_STEMS = NEGATIVE_TERMS.map(function (t) { return stemTokens(t.split(/\s+/)); });
const BASE_PREP_STEMS = BASE_PREP_TERMS.map(function (t) { return stemTokens(t.split(/\s+/)); });
const PREFERRED_CUT_STEMS = PREFERRED_CUT_TERMS.map(function (t) { return stemTokens(t.split(/\s+/)); });

// Pre-split KNOWN_BRANDS into word arrays for full-entry matching.
const KNOWN_BRAND_ENTRIES = KNOWN_BRANDS.map(function (b) { return b.split(/\s+/); });

// Pre-stem the food-intent maps once: { keyStems, prefer:[[stems]], penalize:[[stems]] },
// longest key first so "peanut butter" wins over a single-word key.
const FOOD_INTENT_LIST = Object.keys(FOOD_INTENT).map(function (k) {
  return {
    keyStems: stemTokens(k.split(/\s+/)),
    prefer:   FOOD_INTENT[k].prefer.map(function (t) { return stemTokens(t.split(/\s+/)); }),
    penalize: FOOD_INTENT[k].penalize.map(function (t) { return stemTokens(t.split(/\s+/)); }),
    supplement: FOOD_INTENT[k].supplement || null,
    top: FOOD_INTENT[k].top ? [stemTokens(FOOD_INTENT[k].top.split(/\s+/))] : null,
  };
}).sort(function (a, b) { return b.keyStems.length - a.keyStems.length; });

/* ── Phase 4.2.7 classifiers (pure, stem-aware, candidate-independent) ──────── */

const SPECIALTY_SUBTYPE_STEMS = SPECIALTY_SUBTYPES.map(function (t) { return stemTokens(t.split(/\s+/)); });

// Canonical species named in a token list (query or candidate), excluding
// cross-species processed cuts. Returns a de-duplicated array of canonical
// species (usually 0 or 1). Stem-aware so "salmons"/"steaks" still classify.
function speciesOf(toks) {
  var out = [], seen = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i], s = stem(t);
    if (SPECIES_CROSS[t] || SPECIES_CROSS[s]) continue;
    var sp = ANIMAL_SPECIES[t] || ANIMAL_SPECIES[s];
    if (sp && !seen[sp]) { seen[sp] = 1; out.push(sp); }
  }
  return out;
}

// Are two canonical species compatible? Equal, or one is the other's parent
// group (salmon ↔ fish). Two siblings under one parent (salmon vs tuna) are NOT.
function speciesCompatible(a, b) {
  if (a === b) return true;
  return SPECIES_PARENT[a] === b || SPECIES_PARENT[b] === a;
}

// Canonical product forms present in a token list. Stem-aware.
function formsOf(toks) {
  var out = [], seen = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i], s = stem(t);
    var fm = PRODUCT_FORMS[t] || PRODUCT_FORMS[s];
    if (fm && !seen[fm]) { seen[fm] = 1; out.push(fm); }
  }
  return out;
}

// Are two canonical forms compatible? Equal, or in the same FORM_COMPAT set.
function formsCompatible(a, b) {
  if (a === b) return true;
  for (var i = 0; i < FORM_COMPAT.length; i++) {
    if (FORM_COMPAT[i].indexOf(a) >= 0 && FORM_COMPAT[i].indexOf(b) >= 0) return true;
  }
  return false;
}

// Coarse candidate food-family from the structured USDA foodCategory (name text
// as a weak fallback). '' when unknown — an unknown family is never penalized.
function candidateFamily(f) {
  var cat = String((f && f.foodCategory) || '');
  var hay = cat || String((f && f.description) || '');
  for (var i = 0; i < CANDIDATE_FAMILY.length; i++) {
    if (CANDIDATE_FAMILY[i][1].test(hay)) return CANDIDATE_FAMILY[i][0];
  }
  return '';
}

// The single food-identity in the query that carries an expected-family
// constraint, or null. Only fires for a query that IS (essentially) that identity
// so a longer descriptive query ("mayonnaise potato salad") is not over-constrained.
function queryIdentityFamily(qStems) {
  for (var key in IDENTITY_EXPECTED_FAMILY) {
    var ks = stemTokens(key.split(/\s+/));
    if (ks.length === qStems.length && ks.every(function (s) { return qStems.indexOf(s) >= 0; })) {
      return { token: key, families: IDENTITY_EXPECTED_FAMILY[key] };
    }
  }
  return null;
}

// A candidate serving is "usable" for portioning when it carries a real gram/ml
// weight; a household measure ("1 cup") is a secondary usable signal. Reused by
// the serving-quality pass and exported for the resolver/benchmarks.
var SERVING_WEIGHT_UNITS = { g: 1, gram: 1, grams: 1, grm: 1, ml: 1, mlt: 1, milliliter: 1, milliliters: 1 };
function hasUsableServingWeight(f) {
  var size = +((f && f.servingSize));
  var unit = String((f && f.servingSizeUnit) || '').toLowerCase();
  return isFinite(size) && size > 0 && !!SERVING_WEIGHT_UNITS[unit];
}
function hasHouseholdMeasure(f) {
  var hh = String((f && f.householdServing) || '').trim();
  if (!hh) return false;
  // A parseable household measure has a number OR a recognized measure word.
  if (/\d/.test(hh)) return true;
  return /\b(cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|slice|piece|bar|bottle|can|container|scoop|packet|stick)\b/i.test(hh);
}

// The supplemental generic query for this search, if any: fires only when the
// query IS exactly the intent's base food ("chicken", not "chicken broth").
function supplementFor(effQuery) {
  const qStems = stemTokens(tokenize(effQuery));
  const intent = pickFoodIntent(qStems);
  if (!intent || !intent.supplement) return null;
  return intent.keyStems.length === qStems.length ? intent.supplement : null;
}

// After a fuzzy retry, replace each query token with the nearest word (edit
// distance ≤2) that actually appears in the matched foods — data-driven spell
// correction, so ranking scores against real USDA text instead of the typo.
function correctFromPool(effQuery, pool) {
  const words = new Set();
  pool.slice(0, 80).forEach(function (f) {
    nText((f.description || '') + ' ' + (f.brand || '')).split(' ').forEach(function (w) {
      if (w.length >= 3) words.add(w);
    });
  });
  const list = Array.from(words);
  return effQuery.split(' ').map(function (t) {
    if (t.length < 4 || words.has(t)) return t;
    let best = t, bestD = 3;
    for (let i = 0; i < list.length; i++) {
      const d = editDistanceLe(t, list[i], Math.min(2, bestD - 1));
      if (d >= 0 && d < bestD) { bestD = d; best = list[i]; if (bestD === 1) break; }
    }
    return best;
  }).join(' ');
}

// Brand-scoped supplemental BRANDED query, using USDA's Elasticsearch field
// syntax. USDA's own relevance for "kirkland peanut butter" returns 200 items
// with ZERO Kirkland peanut butter (likewise Fairlife shakes, Quest bars) — the
// pool must be supplemented; ranking can't surface what isn't fetched.
// "kirkland peanut butter" → "+brandName:kirkland +peanut +butter".
function brandSupplementQuery(effQuery) {
  const toks = tokenize(effQuery);
  const entries = queryBrandEntries(toks);
  if (!entries.length) return null;
  const bw = entries[0];                               // most specific matched brand
  const brandWords = new Set([].concat.apply([], entries));
  const rest = toks.map(function (t) { return t.replace(/[^a-z0-9]/g, ''); })
    .filter(function (t) { return t && !brandWords.has(t); });
  return bw.map(function (w) { return '+brandName:' + w; }).join(' ') +
    rest.map(function (w) { return ' +' + w; }).join('');
}

// The KNOWN_BRANDS entries FULLY present in the query (alias-aware), most
// specific first. Full-entry matching is what keeps generic words safe: "quest
// bar" matches the entry 'quest' but NOT 'pro bar', so bar/protein/milk alone
// never become brand intent (previously any single brand token did — "quest
// bar" wrongly boosted every "…Bar…" brand like Clif Bar and Company).
function queryBrandEntries(toks) {
  const words = [];
  toks.forEach(function (t) {
    const norm = t.replace(/[^a-z0-9]/g, '').toLowerCase();
    (BRAND_ALIASES[norm] || norm).split(/\s+/).forEach(function (w) { words.push(w); });
  });
  return KNOWN_BRAND_ENTRIES.filter(function (bw) {
    return bw.every(function (w) { return words.indexOf(w) >= 0; });
  }).sort(function (a, b) { return b.length - a.length; });
}

// The food-intent map whose key is fully present in the query, if any.
function pickFoodIntent(qStems) {
  for (let i = 0; i < FOOD_INTENT_LIST.length; i++) {
    const it = FOOD_INTENT_LIST[i];
    if (it.keyStems.every(function (s) { return qStems.indexOf(s) >= 0; })) return it;
  }
  return null;
}

// Does a branded food's brand contain ALL words of one matched brand entry?
function brandMatchesIntent(brand, brandIntent) {
  if (!brandIntent || !brandIntent.length) return false;
  const fbt = nText(brand).split(' ').filter(Boolean);
  return brandIntent.some(function (entry) {
    return entry.every(function (w) { return fbt.indexOf(w) >= 0; });
  });
}
function termInStems(termStems, stemSet) { return termStems.every(function (st) { return stemSet.has(st); }); }
function termInQuery(termStems, qStems) { return termStems.every(function (st) { return qStems.indexOf(st) >= 0; }); }
// Any term from `list` present in the food but NOT in the query.
function hasUnqueriedTerm(list, foodStemSet, qStems) {
  for (var i = 0; i < list.length; i++) {
    if (termInQuery(list[i], qStems)) continue;
    if (termInStems(list[i], foodStemSet)) return true;
  }
  return false;
}

// Is the brand a recognizable national brand? Single-word config entries must
// match a whole brand token; multi-word entries match as a normalized substring.
function brandRecognized(brand) {
  if (!brand) return false;
  // Shared normalizer: hyphenated brands match (Coca-Cola → coca cola) and
  // apostrophe brands collapse (REESE'S → reeses).
  const toks = nText(brand).split(' ').filter(Boolean);
  const flat = toks.join(' ');
  for (const b of KNOWN_BRANDS) {
    if (b.indexOf(' ') >= 0) { if (flat.indexOf(b) >= 0) return true; }
    else if (toks.indexOf(b) >= 0) return true;
  }
  return false;
}

// A generic food in a whole-food USDA category (banana, chicken breast, potato).
function isWholeCategory(f) {
  return WHOLE_FOOD_CATEGORIES.has((f.foodCategory || '').toLowerCase());
}

// Every query token present in the food's IDENTITY text (brand+description),
// stem-aware — but EXCLUDING parenthetical annotations. A query word appearing
// only inside "(…)" is a descriptor, not the food's identity ("protein" in
// "Yogurt, Greek, plain, nonfat (high protein)"), so it must NOT qualify a generic
// to lead a higher-scored branded set (the group-order safety the confidence layer
// depends on). Non-parenthetical identity words (the "hamburger" in "Fast foods,
// hamburger; single patty") still match. Used only by the generic-first decision.
function matchesAll(f, qStems) {
  const idText = ((f.brand || '') + ' ' + (f.description || '')).replace(/\([^)]*\)/g, ' ');
  const hayStems = stemTokens(idText.toLowerCase().split(/\s+/));
  return qStems.every(function (t) { return hayStems.indexOf(t) >= 0; });
}

// EXACT principal-name match: the query IS this food's name, word for word
// ("honey" ↔ "Honey", "milk" ↔ "Milk, whole…"). Stricter than the base-food
// gate (same length, not subset) and category-independent — staples in
// non-whole categories (honey → Sweets) must beat whole-category foods that
// merely contain the word (Ham, honey, smoked, cooked).
function isPrincipalExact(f, qStems) {
  const principal = (f.description || '').split(',')[0];
  const pStems = stemTokens(principal.toLowerCase().split(/\s+/).filter(Boolean));
  if (!pStems.length || pStems.length !== qStems.length) return false;
  return qStems.every(function (t) { return pStems.indexOf(t) >= 0; });
}

// The food's NAME is the query — either the principal segment ("Honey";
// "Cheese, cheddar" via word-order-free stems) or, when USDA prefixes the
// entry with its own category ("Beverages, coffee, brewed", "Snacks, banana
// chips"), comma-segment 2. The category-echo guard keeps flavor qualifiers
// out: "Ham, honey, smoked" — Ham is a food, not the Sausages category, so
// its 'honey' is a flavor, not the name.
function nameIsQuery(f, qStems) {
  if (isPrincipalExact(f, qStems)) return true;
  const segs = (f.description || '').split(',');
  if (segs.length < 2) return false;
  const seg1 = stemTokens(nText(segs[0]).split(' ').filter(Boolean));
  const cat = stemTokens(nText(f.foodCategory).split(' ').filter(Boolean));
  // substring, not equality: "Fish, salmon…" sits under "FINfish and Shellfish"
  const echo = seg1.length === 1 &&
    cat.some(function (c) { return c.indexOf(seg1[0]) >= 0; });
  if (!echo) return false;
  const s2 = stemTokens(nText(segs[1]).split(' ').filter(Boolean));
  return s2.length === qStems.length &&
    qStems.every(function (t) { return s2.indexOf(t) >= 0; });
}

/* ── Query context + candidate features ──────────────────────────────────
 * Everything derived from the QUERY is computed once per search
 * (buildQueryContext); everything derived from one CANDIDATE's text is
 * computed once per candidate (deriveFeatures) and shared by every scoring
 * pass — no repeated normalization or parsing inside the passes. */

// Per-search context shared by all scoring passes.
function buildQueryContext(query, candidates, options) {
  const qLower = String(query == null ? '' : query).toLowerCase();
  const toks = tokenize(qLower);
  const qStems = stemTokens(toks);
  const intent = pickFoodIntent(qStems);

  // Brand-frequency map over the branded candidates (low-weight popularity proxy).
  const freqMap = {};
  for (const f of candidates) {
    if (f.dataType === 'Branded' && f.brand) {
      const k = f.brand.toLowerCase();
      freqMap[k] = (freqMap[k] || 0) + 1;
    }
  }

  return {
    qLower: qLower,
    toks: toks,
    qStems: qStems,
    // Reversed two-word phrase for USDA's inverted names ("Oil, olive").
    qLowerRev: toks.length === 2 ? toks[1] + ' ' + toks[0] : '',
    freqMap: freqMap,
    brandIntent: queryBrandEntries(toks),
    intent: intent,
    // Subtype vocabulary the user actually typed, from the intent's prefer
    // list ("jasmine rice" → ['jasmine']). Drives the competing-subtype rule.
    typedPrefer: intent ? intent.prefer.filter(function (ts) { return termInQuery(ts, qStems); }) : [],
    // Phase 4.2.7 query-intent facets (candidate-independent, computed once):
    querySpecies: speciesOf(toks),        // animal(s) the user named → species pass
    queryForms: formsOf(toks),            // product form(s) the user named → form pass
    queryIdentity: queryIdentityFamily(qStems), // collision-prone identity → family pass
    // Extension seam (4.2.3+): extra pure scoring passes, summed per candidate.
    signals: (options && options.signals) || [],
  };
}

// Cross-reference parentheticals are annotations, not identity — "(Includes
// foods for USDA Food Distribution Program)", "(includes bread and butter
// pickles)". Stripped from MATCHING text (a pickle jar is not a phrase match
// for "bread butter") and from the duplicate-family key ("Cheese, cheddar
// (Includes foods for…)" IS "Cheese, cheddar" — the institutional twin
// collapses into the consumer entry). Real qualifiers ("rice (sake)") keep
// matching — only the 'includes…' note class is an annotation.
function stripAnnotations(desc) {
  return String(desc == null ? '' : desc).replace(/\(includes[^)]*\)?/gi, ' ');
}

// Per-candidate derived features, computed ONCE and shared by every pass.
function deriveFeatures(f, ctx) {
  // Same normalizer as the query pipeline: "Coca-Cola" phrase-matches
  // "coca cola", "REESE'S" token-matches "reeses".
  const desc = nText(stripAnnotations(f.description));
  const brand = nText(f.brand);
  const hay = (brand + ' ' + desc).trim();
  const foodStemSet = new Set(stemTokens(hay.split(/\s+/)));
  // Presence is stem-aware: "cashews" must count as present in "Nuts, cashew
  // nuts, raw" — literal substring alone fails every plural/singular mismatch.
  let present = 0;
  for (const t of ctx.toks) {
    if (hay.indexOf(t) >= 0 || foodStemSet.has(stem(t))) present++;
  }
  const intentPenalized = ctx.intent ? hasUnqueriedTerm(ctx.intent.penalize, foodStemSet, ctx.qStems) : false;
  // Processed/compound = carries a negative term the user did not search (e.g. salad,
  // spread, nuggets, deli) OR a food-specific intent penalty (e.g. waffle fries for
  // "waffle"). Such foods don't get the whole-food canonical/base boosts.
  const processed = hasUnqueriedTerm(NEGATIVE_STEMS, foodStemSet, ctx.qStems) || intentPenalized;
  // Phase 4.2.7 candidate facets, derived once and shared by the identity/form/
  // serving passes. Species/forms read the candidate NAME tokens; family reads the
  // structured USDA category; serving reads the trimmed serving metadata.
  var hayToks = hay.split(/\s+/).filter(Boolean);
  var servingUsable = hasUsableServingWeight(f);
  var servingHouse = hasHouseholdMeasure(f);
  var candForms = formsOf(hayToks);
  var candSpecies = speciesOf(hayToks);
  var candFamily = candidateFamily(f);
  // Hard identity/form mismatches: the user EXPLICITLY named a species / product
  // form / collision-prone identity, and this candidate asserts a KNOWN
  // incompatible one. Computed once and shared by the scoring passes, the
  // brand-intent gate, and the confidence guard (a top candidate with a hard
  // mismatch is never a confident auto-resolve).
  var speciesMismatch = ctx.querySpecies.length > 0 && candSpecies.length > 0 &&
    !ctx.querySpecies.some(function (q) {
      return candSpecies.some(function (c) { return speciesCompatible(q, c); });
    });
  var familyMismatch = !!ctx.queryIdentity && !!candFamily &&
    ctx.queryIdentity.families.indexOf(candFamily) < 0;
  var formMismatch = ctx.queryForms.length > 0 && candForms.length > 0 &&
    !ctx.queryForms.some(function (q) {
      return candForms.some(function (c) { return formsCompatible(q, c); });
    });
  return {
    desc: desc, brand: brand, hay: hay,
    foodStemSet: foodStemSet,
    isBranded: f.dataType === 'Branded',
    present: present,
    intentPenalized: intentPenalized,
    processed: processed,
    species: candSpecies,
    forms: candForms,
    speciesMismatch: speciesMismatch,
    familyMismatch: familyMismatch,
    formMismatch: formMismatch,
    hardMismatch: speciesMismatch || familyMismatch || formMismatch,
    family: candFamily,
    servingUsable: servingUsable,
    servingHouse: servingHouse,
    // Inspectable serving-quality label (Part 3 requirement 1: exposed as
    // candidate score metadata) — stamped onto kept candidates in rankPool.
    servingQuality: servingUsable ? 'usable' : (servingHouse ? 'household' : (f.dataType === 'Branded' ? 'weak' : 'generic')),
    // Phrase present in either word order (also reused by rankPool's keep gate).
    phrase: !!(ctx.qLower && (hay.indexOf(ctx.qLower) >= 0 ||
      (ctx.qLowerRev && hay.indexOf(ctx.qLowerRev) >= 0))),
  };
}

/* ── Scoring passes ───────────────────────────────────────────────────────
 * Each pass is one isolated, composable responsibility: (candidate, features,
 * ctx) → score contribution, weights from RANK_WEIGHTS only. scoreCandidate
 * sums them. Adding a signal = adding a pass + a named weight. */

// Data sanity: label errors and institutional twins rank below everything real.
function scoreDataSanity(f) {
  let s = 0;
  // Physical bound: nothing edible exceeds ~900 kcal/100g (pure fat). Branded
  // rows above it are label-data errors (kJ mislabeled as kcal, per-serving
  // values in the per-100g field) — demote them below everything legitimate.
  if (f.nutrients && +f.nutrients.kcal > 950) s += RANK_WEIGHTS.implausibleKcal;
  // USDA's food-distribution-program entries duplicate cleaner SR/Foundation
  // foods but carry institutional portion data (bulk cup weights) — rank the
  // consumer entry first.
  if (/includes foods for usda/i.test(f.description || '')) s += RANK_WEIGHTS.usdaProgramEntry;
  return s;
}

// Phrase similarity: the whole query as a phrase, word-order-insensitively for
// two-word queries — USDA names generics inverted ("Cheese, cheddar", "Oil,
// olive"), so "cheddar cheese" must hit them as strongly as the literal order.
function scorePhraseMatch(f, ft, ctx) {
  let s = 0;
  if (ft.phrase) s += RANK_WEIGHTS.phraseMatch;
  if (ctx.qLower && (ft.desc.indexOf(ctx.qLower) === 0 ||
      (ctx.qLowerRev && ft.desc.indexOf(ctx.qLowerRev) === 0))) s += RANK_WEIGHTS.phraseStart;
  return s;
}

// Token coverage: per-token credit, all-present bonus, first-word position —
// and the missing-word penalty (a candidate that lacks typed words is a worse
// phrase match than one that has them all: "grilled chicken breast" must
// outrank "chicken", which must outrank derivative part-matches).
function scoreTokenCoverage(f, ft, ctx) {
  let s = 0;
  const btoks = ft.brand.split(/\s+/);
  for (const t of ctx.toks) if (btoks.indexOf(t) >= 0) s += RANK_WEIGHTS.brandTokenMatch;
  if (ctx.toks.length && ft.present === ctx.toks.length) s += RANK_WEIGHTS.allTokensPresent;
  s += ft.present * RANK_WEIGHTS.tokenPresent;
  if (ctx.toks.length && ft.desc.indexOf(ctx.toks[0]) === 0) s += RANK_WEIGHTS.firstTokenStart;
  const missing = ctx.toks.length - ft.present;
  if (missing > 0) s += Math.min(missing, RANK_WEIGHTS.missingTokenCap) * RANK_WEIGHTS.missingToken;
  return s;
}

// Branded signals: curated brand recognition, explicit brand intent, and a
// capped catalog-size nudge.
function scoreBrandSignals(f, ft, ctx) {
  if (!ft.isBranded) return 0;
  let s = 0;
  if (brandRecognized(f.brand)) s += RANK_WEIGHTS.recognizedBrand;
  // BRAND INTENT: the user typed a brand (Kirkland, Fairlife, Coke…) and this
  // product is that brand → make it dominant over generic text matches. The
  // product whose description also carries the brand word (Coca-Cola Classic)
  // outranks sibling brands under the same owner (Sprite).
  // PRODUCT-FORM GATE (Phase 4.2.7): when the candidate's form is incompatible
  // with an explicitly requested form (Fairlife MILK for "fairlife protein bar"),
  // the brand-intent boost is SUPPRESSED — a correct brand must never override the
  // wrong product form (the productFormMismatch penalty still applies on top).
  if (!ft.formMismatch && brandMatchesIntent(ft.brand, ctx.brandIntent)) {
    s += RANK_WEIGHTS.brandIntent;
    let descHits = 0;
    ctx.brandIntent.forEach(function (entry) {
      entry.forEach(function (bt) { if (ft.desc.indexOf(bt) >= 0) descHits++; });
    });
    s += Math.min(descHits, RANK_WEIGHTS.brandIntentDescTokenCap) * RANK_WEIGHTS.brandIntentDescToken;
  }
  // Low-weight popularity proxy: a brand with many products in the pool is likely
  // a larger catalog. Capped so it nudges unlisted brands, never overrides above.
  const freq = (ctx.freqMap && f.brand) ? (ctx.freqMap[f.brand.toLowerCase()] || 0) : 0;
  if (freq > 1) s += Math.min(freq - 1, RANK_WEIGHTS.brandFreqCap) * RANK_WEIGHTS.brandFreqStep;
  return s;
}

// Generic canonical-name signals: exact-name matches, whole-food category,
// base-food preference, and data-quality demotions for generic entries.
function scoreGenericCanonical(f, ft, ctx) {
  if (ft.isBranded) return 0;
  let s = 0;
  // EXACT name match (query IS the food): honey → "Honey" beats "Ham, honey,
  // smoked"; coffee → "Beverages, coffee, brewed" beats coffee-flavored
  // products. See nameIsQuery for the category-echo rules.
  const named = !ft.processed && nameIsQuery(f, ctx.qStems);
  if (named) s += RANK_WEIGHTS.nameIsQuery;
  // EXACT full name, any word order: "Cheese, cheddar" IS "cheddar cheese" —
  // the whole description is the query's words and nothing else.
  if (!ft.processed && ctx.qStems.length >= 2) {
    const descStems = stemTokens(ft.desc.split(' ').filter(Boolean));
    const dSet = new Set(descStems);
    if (dSet.size === ctx.qStems.length &&
        ctx.qStems.every(function (t) { return dSet.has(t); })) s += RANK_WEIGHTS.exactFullName;
  }
  if (isWholeCategory(f)) {
    // Whole-food relevance from USDA category (algorithmic, not a food list).
    s += RANK_WEIGHTS.wholeCategory;
    if (!ft.processed) {
      if (isPrincipalExact(f, ctx.qStems)) s += RANK_WEIGHTS.principalExact; // the canonical raw food (e.g. "Bananas, raw")
      // BASE-FOOD bonus: the unprocessed whole food — every query word present and a
      // base descriptor (raw/cooked/whole/fillet…). Lifts it over recipe/processed
      // items that merely match the text better (USDA names raw foods awkwardly:
      // "Fish, salmon…", "Chicken, …, breast"). Strictly gated: the item's NAME
      // must be (or canonically contain) the query — an unrelated food that just
      // STARTS with the word ("Water convolvulus" for "water", "Guavas,
      // strawberry" for "strawberry") never collects it.
      const matchAllStems = ctx.qStems.length > 0 &&
        ctx.qStems.every(function (st) { return ft.foodStemSet.has(st); });
      if (matchAllStems && named &&
          hasUnqueriedTerm(BASE_PREP_STEMS, ft.foodStemSet, ctx.qStems)) s += RANK_WEIGHTS.baseFood;
    }
  }
  // Completely empty macro panel (no kcal, protein, carbs, or fat) = a data
  // gap in USDA (some Foundation search rows) — useless to log, so demote.
  const n = f.nutrients || {};
  if (!(+n.kcal) && !(+n.protein) && !(+n.carbs) && !(+n.fat)) s += RANK_WEIGHTS.emptyMacroPanel;
  // Parenthetical qualifiers mark specialized research entries — "(Hopi)",
  // "(Navajo)", "(shoyu)" — a tie-break penalty keeps the mainstream item
  // first. USDA's own "(Includes foods for…)" program note is exempt.
  const paren = (f.description || '').match(/\(([^)]*)/);
  if (paren && !/^includes/i.test(paren[1])) s += RANK_WEIGHTS.researchParenthetical;
  return s;
}

// Canonical food preference (both groups): favor base foods, demote processed/
// compound ones — but only for terms the user did not search.
function scoreCanonicalTerms(f, ft, ctx) {
  var pos = 0, neg = 0, i;
  for (i = 0; i < POSITIVE_STEMS.length; i++) {
    if (termInQuery(POSITIVE_STEMS[i], ctx.qStems)) continue;   // user searched it → neutral
    if (termInStems(POSITIVE_STEMS[i], ft.foodStemSet)) pos++;
  }
  for (i = 0; i < NEGATIVE_STEMS.length; i++) {
    if (termInQuery(NEGATIVE_STEMS[i], ctx.qStems)) continue;   // user searched it → neutral
    if (termInStems(NEGATIVE_STEMS[i], ft.foodStemSet)) neg++;
  }
  let s = Math.min(pos, RANK_WEIGHTS.canonicalPositiveCap) * RANK_WEIGHTS.canonicalPositive +
          Math.min(neg, RANK_WEIGHTS.canonicalNegativeCap) * RANK_WEIGHTS.canonicalNegative;
  // Preferred cut/type the user did not type — lifts the common form people mean
  // (chicken breast, salmon fillet, beef sirloin) over obscure parts/derivatives.
  if (!ft.processed && hasUnqueriedTerm(PREFERRED_CUT_STEMS, ft.foodStemSet, ctx.qStems)) {
    s += RANK_WEIGHTS.preferredCut;
  }
  return s;
}

// Food-specific intent (rice/chicken/waffle/egg/peanut butter): strong prefer
// for the intended form, strong penalty for derivatives — enough to beat a
// derivative's better text match (e.g. "Waffle Cut Fries" starting with the
// query word). SUBTYPE-AWARE (Phase 4.2.2): the prefer list doubles as the
// food's subtype vocabulary. When the user typed one of its terms ("jasmine
// rice"), a candidate carrying a SIBLING term without the typed one ("Rice,
// white, cooked") is a competing subtype — it never collects the prefer boost
// and is penalized instead, so the typed variety always outranks its siblings.
function scoreFoodIntent(f, ft, ctx) {
  if (!ctx.intent) return 0;
  let s = 0;
  const carriesUnqueriedPrefer = hasUnqueriedTerm(ctx.intent.prefer, ft.foodStemSet, ctx.qStems);
  const carriesAllTyped = ctx.typedPrefer.length > 0 &&
    ctx.typedPrefer.every(function (ts) { return termInStems(ts, ft.foodStemSet); });
  if (carriesUnqueriedPrefer) {
    if (ctx.typedPrefer.length === 0 || carriesAllTyped) {
      // No subtype typed, or the candidate honors the typed one — the prefer
      // boost behaves exactly as before ("brown rice" still lifts brown+cooked).
      s += RANK_WEIGHTS.intentPrefer;
    } else {
      // Sibling subtype without the typed one — a white-rice entry must never
      // outrank jasmine on its untyped 'white'.
      s += RANK_WEIGHTS.competingSubtype;
    }
  }
  if (ft.intentPenalized) s += RANK_WEIGHTS.intentPenalize;
  // `top` breaks ties among equally-preferred forms (rice: cooked over raw).
  if (!ft.processed && ctx.intent.top &&
      hasUnqueriedTerm(ctx.intent.top, ft.foodStemSet, ctx.qStems)) s += RANK_WEIGHTS.intentTop;
  return s;
}

/* ── Phase 4.2.7 tiered passes ──────────────────────────────────────────────
 * PRIMARY IDENTITY, then EXPLICIT INTENT, then CANDIDATE QUALITY. Each is one
 * isolated (candidate, features, ctx) → contribution, weights from RANK_WEIGHTS
 * only, guarded so weak/absent classification never over-penalizes. */

// Tier 1 — species identity. The query names an animal and this candidate names
// a DIFFERENT, incompatible animal → a severe penalty that outweighs any
// preparation/category/token overlap. Only fires when BOTH sides assert a
// concrete species (a candidate with no animal token is judged by other passes).
function scoreSpecies(f, ft, ctx) {
  return ft.speciesMismatch ? RANK_WEIGHTS.speciesMismatch : 0;
}

// Tier 1 — food-family identity. The query IS a collision-prone identity (mayo)
// with an expected family; this candidate belongs to a KNOWN incompatible family
// (a bean carrying the token 'mayo') → severe penalty. Unknown family → neutral,
// so short/ambiguous queries are never over-penalized on weak classification.
function scoreFamilyIdentity(f, ft, ctx) {
  return ft.familyMismatch ? RANK_WEIGHTS.familyIdentityMismatch : 0;
}

// Tier 2 — product-form intent. The query names a product form and this candidate
// asserts a KNOWN incompatible form (Fairlife protein BAR vs Fairlife MILK) → a
// penalty large enough to lose to a plausible correct-form candidate even when
// the brand matches. A candidate with no recognizable form is neutral (judged
// elsewhere), so this never fabricates a mismatch.
function scoreProductForm(f, ft, ctx) {
  return ft.formMismatch ? RANK_WEIGHTS.productFormMismatch : 0;
}

// Explicit-polarity intent. When the query asserts one side of a polar attribute
// (sweetened vs UNsweetened), a candidate asserting the OPPOSITE side is
// penalized — symmetrically in both directions ("sweet tea" must not land on
// unsweetened tea, and "unsweetened tea" must not land on sweetened). Generalizable
// antonym table (positive marker + its "un-" negation), word-boundary matched so
// "sweet" never matches inside "unsweetened". Silent when the query asserts no
// polarity (bare "tea"/"iced tea" are untouched) or the candidate is neutral —
// so it never fabricates a mismatch. NOT a hard-coded product string.
var RANK_POLARITY = [
  { pos: /\bsweet(ened|en)?\b/, neg: /\bunsweeten(ed)?\b/ },
];
function polarityFacet(text, p) {
  if (p.neg.test(text)) return 'neg';
  return p.pos.test(text) ? 'pos' : null;   // 'pos' only when NOT negated
}
function scorePolarity(f, ft, ctx) {
  var s = 0;
  for (var i = 0; i < RANK_POLARITY.length; i++) {
    var qf = polarityFacet(ctx.qLower, RANK_POLARITY[i]);
    if (!qf) continue;                        // query asserts no polarity here
    var cf = polarityFacet(ft.desc, RANK_POLARITY[i]);
    if (cf && cf !== qf) s += RANK_WEIGHTS.polarityMismatch;
  }
  return s;
}

// Tier 2 — brand asymmetry. The user EXPLICITLY named a known brand; a candidate
// that is NOT that brand (generic, or a different brand) pays a penalty. Purely
// asymmetric: with no brand named this is silent, so a generic query never
// suppresses legitimate branded candidates. Sized BELOW product-form so a
// correct-brand/wrong-form loses to a wrong-brand/correct-form, yet meaningful
// enough that an explicit brand beats a generic same-form food.
function scoreBrandAsymmetry(f, ft, ctx) {
  if (!ctx.brandIntent.length) return 0;
  if (brandMatchesIntent(ft.brand, ctx.brandIntent)) return 0;
  return RANK_WEIGHTS.missingRequestedBrand;
}

// Tier 2 — unrequested specialty subtype. For a generic query, a candidate
// flaunting a specialty modifier the user did not type (glutinous/sushi rice for
// "rice") is demoted. Intent-aware: naming the subtype makes it neutral.
function scoreSpecialtySubtype(f, ft, ctx) {
  var n = 0;
  for (var i = 0; i < SPECIALTY_SUBTYPE_STEMS.length; i++) {
    if (termInQuery(SPECIALTY_SUBTYPE_STEMS[i], ctx.qStems)) continue;   // user asked for it
    if (termInStems(SPECIALTY_SUBTYPE_STEMS[i], ft.foodStemSet)) n++;
  }
  if (!n) return 0;   // guard -0 for clean inspectable metadata
  return Math.min(n, RANK_WEIGHTS.specialtySubtypeCap) * RANK_WEIGHTS.specialtySubtype;
}

// Tier 3 — serving-metadata quality (tie-breaker band). Rewards a candidate that
// can actually be portioned (usable gram/ml weight, parseable household measure)
// and lightly demotes a branded row with neither. Magnitude is far below the
// identity/intent tiers, so it only ever breaks near-ties — it can NEVER lift a
// wrong food over the right one on cleaner metadata.
function scoreServingQuality(f, ft, ctx) {
  var s = 0;
  if (ft.servingUsable) s += RANK_WEIGHTS.servingUsable;
  if (ft.servingHouse) s += RANK_WEIGHTS.servingHousehold;
  if (ft.isBranded && !ft.servingUsable && !ft.servingHouse) s += RANK_WEIGHTS.servingWeak;
  return s;
}

// The full score breakdown for one candidate — every pass's named contribution.
// scoreCandidate sums it; explainCandidate exposes it for tests/diagnostics
// (Part 4: every ranking change produces inspectable score metadata).
function scoreBreakdown(f, ft, ctx) {
  return {
    dataSanity:       scoreDataSanity(f),
    phrase:           scorePhraseMatch(f, ft, ctx),
    tokens:           scoreTokenCoverage(f, ft, ctx),
    brand:            scoreBrandSignals(f, ft, ctx),
    genericCanonical: scoreGenericCanonical(f, ft, ctx),
    canonicalTerms:   scoreCanonicalTerms(f, ft, ctx),
    foodIntent:       scoreFoodIntent(f, ft, ctx),
    species:          scoreSpecies(f, ft, ctx),
    familyIdentity:   scoreFamilyIdentity(f, ft, ctx),
    productForm:      scoreProductForm(f, ft, ctx),
    polarity:         scorePolarity(f, ft, ctx),
    brandAsymmetry:   scoreBrandAsymmetry(f, ft, ctx),
    specialtySubtype: scoreSpecialtySubtype(f, ft, ctx),
    servingQuality:   scoreServingQuality(f, ft, ctx),
  };
}

// Score one trimmed food against the query context. Higher = more relevant.
// Pure sum of the isolated passes above + any extension signals.
function scoreCandidate(f, ft, ctx) {
  const parts = scoreBreakdown(f, ft, ctx);
  let s = 0;
  for (const k in parts) s += parts[k];
  // Extension seam: future phases (correction memory, portion compatibility,
  // meal context, preferences) contribute here without touching the engine.
  // Contributions are strictly finite numbers — anything else counts as 0, so
  // a malformed signal can never poison the numeric sort (NaN/string scores
  // would make ordering undefined).
  for (let i = 0; i < ctx.signals.length; i++) {
    const v = ctx.signals[i](f, ft, ctx);
    if (typeof v === 'number' && isFinite(v)) s += v;
  }
  return s;
}

// Diagnostic: the full score + breakdown + derived facets for ONE candidate
// against a query. Pure; used by tests and the Checkpoint 2 weight review. Never
// used in the hot ranking path (rankPool sums via scoreCandidate).
function explainCandidate(query, candidate, options) {
  const ctx = buildQueryContext(query, [candidate], options);
  const ft = deriveFeatures(candidate, ctx);
  const parts = scoreBreakdown(candidate, ft, ctx);
  let total = 0; for (const k in parts) total += parts[k];
  return {
    total: total, parts: parts,
    features: { species: ft.species, forms: ft.forms, family: ft.family,
      servingQuality: ft.servingQuality, present: ft.present, isBranded: ft.isBranded },
  };
}

/* ── Pool ranking + duplicate-family collapse ────────────────────────────── */

// Rank one group of trimmed foods. `strict` (branded) keeps only items matching
// ALL query words so a brand query stays precise; generic keeps anything matching
// at least one word so plain foods (e.g. "Peanut butter, creamy") still surface.
function rankPool(pool, group, strict, cap, ctx) {
  const scored = [];
  for (const f of pool) {
    const ft = deriveFeatures(f, ctx);
    const score = scoreCandidate(f, ft, ctx);
    // Brand-intent foods are kept even if the typed token isn't literally in the
    // text (e.g. "coke" → "Coca-Cola"), so brand-alias searches still return the brand.
    const brandHit = ctx.brandIntent.length > 0 &&
      brandMatchesIntent((f.brand || '').toLowerCase(), ctx.brandIntent);
    const keep = brandHit || (strict ? (ft.present === ctx.toks.length || ft.phrase) : (ft.present >= 1));
    if (!keep) continue;
    f.group = group;
    f.score = score;
    f.servingQuality = ft.servingQuality;   // inspectable candidate metadata (Phase 4.2.7)
    // Hard identity/form-mismatch flag: the user explicitly named a species/form/
    // identity this candidate contradicts. Read by the confidence guard so a poor
    // sole-survivor (e.g. Fairlife MILK for "fairlife protein BAR") is never a
    // confident auto-resolve. Provider-neutral boolean on the shared Candidate.
    f.mismatch = !!ft.hardMismatch;
    // Identity/default signal strength (Phase 4.2.10b): the sum of the SEMANTIC
    // canonical/intent contributions (canonical-generic + preferred/base
    // descriptors + food-intent) — i.e. HOW STRONGLY this candidate is the
    // canonical/preferred/intended form of the query, excluding generic phrase/
    // token match quality. The confidence layer reads it to tell a defensible
    // default (chicken→breast has a real preferred-cut edge over thigh) from an
    // arbitrary pick among tied material subtypes (soup→tomato ties vegetable/
    // cream exactly). Inspectable metadata on the shared Candidate, like
    // `mismatch`/`servingQuality`.
    f.identityScore = scoreGenericCanonical(f, ft, ctx) +
      scoreCanonicalTerms(f, ft, ctx) + scoreFoodIntent(f, ft, ctx) +
      scoreSpecialtySubtype(f, ft, ctx);   // demote an unrequested specialty (glutinous rice for "rice")
    scored.push(f);
  }
  // Highest score first; tie-break toward the shorter (less cluttered) name —
  // the irrelevant-extra-words penalty: same score, fewer stray words wins;
  // final tie-break prefers SR Legacy — identically-named Foundation/SR twins
  // ("Milk, whole, 3.25%…") differ in that SR carries the household measures
  // (1 cup) while Foundation often has none, so SR makes the better default.
  const dtRank = (f) => (f.dataType === 'SR Legacy' ? 0 : 1);
  scored.sort((a, b) => (b.score - a.score) ||
    (a.description.length - b.description.length) || (dtRank(a) - dtRank(b)));
  // Duplicate-family collapse (ranking-aware, not deletion): same normalized
  // name+brand keeps only the best-ranked row (identically-named Foundation/SR
  // twins, USDA program annotations, repeated branded listings), so the cap is
  // spent on DISTINCT foods. Real differences — raw vs cooked, flavors, other
  // brands — normalize to different keys and always survive as candidates.
  const seenKey = new Set();
  const unique = [];
  for (const f of scored) {
    const k = nText(stripAnnotations(f.description)) + '|' + nText(f.brand);
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    unique.push(f);
    if (unique.length >= cap) break;
  }
  return unique;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

// Rank trimmed USDA candidates for a query → the ordered-candidate contract
// every surface consumes: { foods, counts, genericFirst }. Pure and
// deterministic — same inputs, same order, no I/O. `query` must be the
// EFFECTIVE query (after expandQuery); candidates may mix branded and generic
// (split internally on dataType === 'Branded', matching the proxy's separate
// USDA fetches). Options: brandedCap/genericCap (defaults 12/8) and `signals`
// (the 4.2.3+ extension seam documented at the top of this file).
//
// MUTATION NOTE (deliberate): kept candidates are stamped IN PLACE with
// `group` and `score` — they ARE the response payload, and cloning ~250
// objects per request buys nothing (the proxy builds fresh objects via
// trimFood every request, so nothing leaks across requests; stamps are
// overwritten, never accumulated, on reuse — pinned by test). The input
// ARRAY, nutrient objects, and `options` are never modified.
function rankFoodCandidates(query, candidates, options) {
  const pool = Array.isArray(candidates) ? candidates : [];
  const ctx = buildQueryContext(query, pool, options);
  const branded = pool.filter(function (f) { return f.dataType === 'Branded'; });
  const generic = pool.filter(function (f) { return f.dataType !== 'Branded'; });

  const brandedCap = (options && options.brandedCap) || 12;
  const genericCap = (options && options.genericCap) || 8;
  const rankedBranded = rankPool(branded, 'branded', true, brandedCap, ctx);
  const rankedGeneric = rankPool(generic, 'generic', false, genericCap, ctx);

  // Group ORDER is emergent, not a per-food flag:
  //   • BRAND INTENT wins outright: the user named a brand and the pool has its
  //     products → branded leads (Fairlife protein, Kirkland eggs, coke). Without
  //     this, generic whole-category matches (protein isolates…) hijacked the top.
  //   • otherwise lead with GENERIC when a whole-food-category result solidly
  //     matches the query (produce, raw meat/fish, grains…) — covers any such food
  //     via its USDA category, no list — OR when the top generic simply out-scores
  //     the top branded (handles egg: whole food, no recognized brand → generic wins).
  //   • otherwise lead with BRANDED (the brand-driven aisles: dairy, bakery, bars).
  // Guard against brand-word overreach ("one egg": 'one' is a bar brand, but
  // no ONE product matches 'egg'): forcing branded-first requires a brand match
  // whose text ALSO carries every non-brand food word the user typed.
  const brandWordSet = new Set();
  ctx.brandIntent.forEach(function (e) { e.forEach(function (w) { brandWordSet.add(w); }); });
  const foodToks = ctx.toks.filter(function (t) { return !brandWordSet.has(t); });
  const brandIntentHit = ctx.brandIntent.length > 0 && rankedBranded.some(function (b) {
    if (!brandMatchesIntent((b.brand || '').toLowerCase(), ctx.brandIntent)) return false;
    const hayN = nText((b.brand || '') + ' ' + (b.description || ''));
    return foodToks.every(function (t) { return hayN.indexOf(t) >= 0; });
  });
  const genericByCategory = rankedGeneric.some(function (g) {
    return isWholeCategory(g) && matchesAll(g, ctx.qStems);
  });
  const topG = rankedGeneric.length ? rankedGeneric[0].score : 0;
  const topB = rankedBranded.length ? rankedBranded[0].score : 0;
  const genericFirst = !brandIntentHit &&
    rankedGeneric.length > 0 && (genericByCategory || topG >= topB);

  // Both groups always returned; the client renders headers off `group`.
  const foods = genericFirst
    ? rankedGeneric.concat(rankedBranded)
    : rankedBranded.concat(rankedGeneric);

  return {
    foods: foods,
    counts: { branded: rankedBranded.length, generic: rankedGeneric.length },
    genericFirst: genericFirst,
  };
}

/* ── Node exports (guarded — browsers ignore this block) ───────────────── */
// Pure ranking + query-pipeline logic only: no fetch, no auth, no env.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // primary contract
    rankFoodCandidates: rankFoodCandidates,
    RANK_WEIGHTS: RANK_WEIGHTS,
    // query pipeline (consumed by api/usda-search.js fetch orchestration)
    expandQuery: expandQuery,
    supplementFor: supplementFor,
    brandSupplementQuery: brandSupplementQuery,
    spellCorrect: spellCorrect,
    splitCompound: splitCompound,
    completeEntry: completeEntry,
    correctFromPool: correctFromPool,
    // shared text utilities (also re-exported via the proxy's _internals)
    nText: nText,
    tokenize: tokenize,
    stem: stem,
    stemTokens: stemTokens,
    editDistanceLe: editDistanceLe,
    // introspection for tests/diagnostics
    queryBrandEntries: queryBrandEntries,
    pickFoodIntent: pickFoodIntent,
    brandRecognized: brandRecognized,
    isWholeCategory: isWholeCategory,
    // Phase 4.2.7 classifiers + diagnostics
    explainCandidate: explainCandidate,
    speciesOf: speciesOf,
    formsOf: formsOf,
    candidateFamily: candidateFamily,
    hasUsableServingWeight: hasUsableServingWeight,
    hasHouseholdMeasure: hasHouseholdMeasure,
  };
}
