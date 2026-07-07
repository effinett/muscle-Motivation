// /api/usda-search.js
// Server-side proxy to USDA FoodData Central /foods/search.
//
// Why a proxy: the USDA api.data.gov key must NEVER ship in client JS. The page
// calls this route with its Supabase access token; we verify the user, then call
// USDA with the key from the environment and return a TRIMMED result list.
//
// We trim (not fully normalize) each food to a small stable shape so the payload
// stays light and the reusable client normalizer (nuNormalizeUsdaFood) owns the
// per-serving macro math — the same normalizer future barcode/photo logging reuse.
//
// Ranking: USDA's default order buries branded products (a combined dataType query
// returns NO branded at all), so we query Branded and generic separately, score
// each result against the query, and return branded-first with a `group` tag.
//
// Env: USDA_API_KEY (free from https://api.data.gov/signup/). If it's missing we
// fall back to the shared DEMO_KEY for local/dev — rate-limited, NOT for prod —
// and warn loudly in the logs + response. SUPABASE_URL + SUPABASE_ANON_KEY are
// already set for the Stripe routes. The key is never sent to the browser.

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USDA_API_KEY      = process.env.USDA_API_KEY;

// Local/dev fallback ONLY. DEMO_KEY is api.data.gov's shared demo key — heavily
// rate-limited (per-IP/hour) and not for production. We use it only when a real
// USDA_API_KEY is absent, and we surface a clear warning when we do.
const EFFECTIVE_KEY = USDA_API_KEY || 'DEMO_KEY';
const USING_DEMO    = !USDA_API_KEY;

const USDA_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// USDA nutrient ids we care about (search results key nutrients by id).
// Energy has a few variants; we try them in order of preference.
const N_ENERGY = [1008, 2048, 2047]; // kcal, Atwater General, Atwater Specific
const N_PROTEIN = 1003;
const N_FAT     = 1004;
const N_CARBS   = 1005;
const N_FIBER   = 1079;
const N_SUGAR   = [2000, 1063]; // Sugars total incl NLEA, Sugars Total NLEA

// Verify the access token by asking Supabase Auth who it belongs to.
// Same approach as the Stripe routes — the client never asserts identity.
async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Pull the first matching nutrient value from a USDA food's foodNutrients array.
function pickNutrient(nutrients, ids) {
  const wanted = Array.isArray(ids) ? ids : [ids];
  for (const id of wanted) {
    const hit = nutrients.find((n) => n.nutrientId === id);
    if (hit && hit.value != null) return +hit.value;
  }
  return 0;
}

// Compact shape returned to the client. Nutrient values are per 100 g (USDA's
// standardized representation in search results); serving info lets the client
// normalizer compute the per-serving amounts. `group` ('branded'|'generic') and
// `score` are added by the ranking pass below.
function trimFood(f) {
  const nutrients = Array.isArray(f.foodNutrients) ? f.foodNutrients : [];
  return {
    fdcId: f.fdcId,
    description: f.description || '',
    dataType: f.dataType || '',
    foodCategory: f.foodCategory || '',     // USDA category (generic) — drives whole-food ranking
    brand: f.brandName || f.brandOwner || '',
    gtinUpc: f.gtinUpc || '',               // branded barcode (GTIN/UPC) — for future barcode lookup
    servingSize: f.servingSize != null ? +f.servingSize : null,
    servingSizeUnit: f.servingSizeUnit || '',
    householdServing: f.householdServingFullText || '',
    nutrients: {
      kcal:    pickNutrient(nutrients, N_ENERGY),
      protein: pickNutrient(nutrients, N_PROTEIN),
      carbs:   pickNutrient(nutrients, N_CARBS),
      fat:     pickNutrient(nutrients, N_FAT),
      fiber:   pickNutrient(nutrients, N_FIBER),
      sugar:   pickNutrient(nutrients, N_SUGAR),
    },
  };
}

// ── Ranking configuration (extend here — no code changes needed) ────────────
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
// `supplement`: a second, small generic USDA query merged into the pool when the
// user's query IS exactly this base food. USDA's own relevance buries the obvious
// cut/form — "chicken" returns no raw breast in its top 50 of 402, "rice" no plain
// cooked white rice in 50 of 141 — so ranking alone can never surface them.
const FOOD_INTENT = {
  'peanut butter': {
    prefer:   ['creamy', 'natural', 'organic', 'smooth', 'crunchy'],
    penalize: ['candy', 'coating', 'cereal', 'dessert', 'cup', 'cups', 'cookie', 'ice cream',
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

// ── Relevance scoring ──────────────────────────────────────────────────────
// USDA's own ordering buries branded products under generic/SR foods (and a
// COMBINED dataType query returns zero branded at all). We instead query Branded
// and generic separately, re-rank each by match quality + brand recognition +
// whole-food (category) relevance, and order the two groups by query intent.
function tokenize(q) {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

// ── Text normalization shared by the query pipeline AND scoring ─────────────
// Forgiving matching means both sides normalize identically: lowercase,
// apostrophes REMOVED ("REESE'S" ↔ "reeses"), any other punctuation → space
// ("Coca-Cola" ↔ "coca cola"). '%' survives so "2% milk" matches "2% milkfat".
function nText(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
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
  'scoop', 'scoops', 'glass', 'bowl',
]);
const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'some', 'my']);
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

// ── Dictionary for spell correction + compound splitting ────────────────────
// Derived from EVERY config list above (foods, brands, cuts, descriptors,
// derivative terms, aliases) — growing any list automatically extends typo
// tolerance. Order matters for ties: common foods first (most likely intent).
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
  let toks = original.split(/\s+/).filter(Boolean);
  let changed = false;

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

// Merge a supplemental pool into the primary one (dedupe by fdcId).
function mergeGeneric(primary, supplement) {
  const seen = new Set(primary.map(function (f) { return f.fdcId; }));
  return primary.concat((supplement || []).filter(function (f) { return !seen.has(f.fdcId); }));
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

// Intent-aware canonical adjustment: + for base-food descriptors, − for processed/
// compound ones — but ONLY for terms the user did not type. Capped so it reorders
// within match quality, never overpowering brand recognition or whole-food category.
function canonicalAdjust(foodStemSet, qStems) {
  var pos = 0, neg = 0, i;
  for (i = 0; i < POSITIVE_STEMS.length; i++) {
    if (termInQuery(POSITIVE_STEMS[i], qStems)) continue;       // user searched it → neutral
    if (termInStems(POSITIVE_STEMS[i], foodStemSet)) pos++;
  }
  for (i = 0; i < NEGATIVE_STEMS.length; i++) {
    if (termInQuery(NEGATIVE_STEMS[i], qStems)) continue;       // user searched it → neutral
    if (termInStems(NEGATIVE_STEMS[i], foodStemSet)) neg++;
  }
  return Math.min(pos, 2) * 100 - Math.min(neg, 3) * 200;       // +0..+200, −0..−600
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

// Every query token present somewhere in the brand+description (stem-aware).
function matchesAll(f, qStems) {
  const hayStems = stemTokens(((f.brand || '') + ' ' + (f.description || '')).toLowerCase().split(/\s+/));
  return qStems.every(function (t) { return hayStems.indexOf(t) >= 0; });
}

// EXACT principal-name match: the query IS this food's name, word for word
// ("honey" ↔ "Honey", "milk" ↔ "Milk, whole…"). Stricter than isCanonicalGeneric
// (same length, not subset) and category-independent — staples in non-whole
// categories (honey → Sweets) must beat whole-category foods that merely
// contain the word (Ham, honey, smoked, cooked).
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

// Score one trimmed food against the query. Higher = more relevant.
// Match-quality signals (exact phrase, starts-with, brand/all/partial tokens) PLUS
// consumer signals: recognized national brand + a low-weight brand-frequency nudge
// (branded), or whole-food-category + canonical-name relevance (generic). qStems is
// the singularized query; freqMap counts how often each brand appears in the pool.
function scoreFood(f, qLower, toks, qStems, ctx) {
  const freqMap = ctx.freqMap, brandIntent = ctx.brandIntent, intent = ctx.intent;
  // Same normalizer as the query pipeline: "Coca-Cola" phrase-matches
  // "coca cola", "REESE'S" token-matches "reeses".
  const desc = nText(f.description);
  const brand = nText(f.brand);
  const hay = (brand + ' ' + desc).trim();
  const isBranded = f.dataType === 'Branded';
  let s = 0;
  // Phrase matching is word-order-insensitive for two-word queries: USDA names
  // generics inverted ("Cheese, cheddar", "Oil, olive"), so "cheddar cheese"
  // must hit them as strongly as the literal order.
  const qRev = ctx.qLowerRev;
  if (qLower && (hay.indexOf(qLower) >= 0 || (qRev && hay.indexOf(qRev) >= 0))) s += 1000;
  if (qLower && (desc.indexOf(qLower) === 0 || (qRev && desc.indexOf(qRev) === 0))) s += 600;
  const btoks = brand.split(/\s+/);
  for (const t of toks) if (btoks.indexOf(t) >= 0) s += 250;  // brand token match
  const foodStemSet = new Set(stemTokens(hay.split(/\s+/)));
  // Presence is stem-aware: "cashews" must count as present in "Nuts, cashew
  // nuts, raw" — literal substring alone fails every plural/singular mismatch.
  let present = 0;
  for (const t of toks) {
    if (hay.indexOf(t) >= 0 || foodStemSet.has(stem(t))) present++;
  }
  if (toks.length && present === toks.length) s += 200;       // every query word present
  s += present * 40;                                          // partial token credit
  if (toks.length && desc.indexOf(toks[0]) === 0) s += 80;    // food name starts with 1st word
  // Processed/compound = carries a negative term the user did not search (e.g. salad,
  // spread, nuggets, deli) OR a food-specific intent penalty (e.g. waffle fries for
  // "waffle"). Such foods don't get the whole-food canonical/base boosts.
  const intentPenalized = intent ? hasUnqueriedTerm(intent.penalize, foodStemSet, qStems) : false;
  const intentPreferred = intent ? hasUnqueriedTerm(intent.prefer, foodStemSet, qStems) : false;
  let processed = hasUnqueriedTerm(NEGATIVE_STEMS, foodStemSet, qStems) || intentPenalized;

  if (isBranded) {
    if (brandRecognized(f.brand)) s += 900;                   // recognized national brand (curated)
    // BRAND INTENT: the user typed a brand (Kirkland, Fairlife, Coke…) and this
    // product is that brand → make it dominant over generic text matches. The
    // product whose description also carries the brand word (Coca-Cola Classic)
    // outranks sibling brands under the same owner (Sprite).
    if (brandMatchesIntent(brand, brandIntent)) {
      s += 1500;
      let descHits = 0;
      brandIntent.forEach(function (entry) {
        entry.forEach(function (bt) { if (desc.indexOf(bt) >= 0) descHits++; });
      });
      s += Math.min(descHits, 2) * 250;
    }
    // Low-weight popularity proxy: a brand with many products in the pool is likely
    // a larger catalog. Capped so it nudges unlisted brands, never overrides above.
    const freq = (freqMap && f.brand) ? (freqMap[f.brand.toLowerCase()] || 0) : 0;
    if (freq > 1) s += Math.min(freq - 1, 5) * 25;            // +25..+125
  } else {
    // EXACT name match (query IS the food): honey → "Honey" beats "Ham, honey,
    // smoked"; coffee → "Beverages, coffee, brewed" beats coffee-flavored
    // products. See nameIsQuery for the category-echo rules.
    const named = !processed && nameIsQuery(f, qStems);
    if (named) s += 2000;
    // EXACT full name, any word order: "Cheese, cheddar" IS "cheddar cheese" —
    // the whole description is the query's words and nothing else.
    if (!processed && qStems.length >= 2) {
      const descStems = stemTokens(desc.split(' ').filter(Boolean));
      const dSet = new Set(descStems);
      if (dSet.size === qStems.length &&
          qStems.every(function (t) { return dSet.has(t); })) s += 1800;
    }
    if (isWholeCategory(f)) {
      // Whole-food relevance from USDA category (algorithmic, not a food list).
      s += 400;
      if (!processed) {
        if (isPrincipalExact(f, qStems)) s += 300;            // the canonical raw food (e.g. "Bananas, raw")
        // BASE-FOOD bonus: the unprocessed whole food — every query word present and a
        // base descriptor (raw/cooked/whole/fillet…). Lifts it over recipe/processed
        // items that merely match the text better (USDA names raw foods awkwardly:
        // "Fish, salmon…", "Chicken, …, breast"). Strictly gated: the item's NAME
        // must be (or canonically contain) the query — an unrelated food that just
        // STARTS with the word ("Water convolvulus" for "water", "Guavas,
        // strawberry" for "strawberry") never collects it.
        const matchAllStems = qStems.length > 0 && qStems.every(function (st) { return foodStemSet.has(st); });
        if (matchAllStems && named &&
            hasUnqueriedTerm(BASE_PREP_STEMS, foodStemSet, qStems)) s += 1500;
      }
    }
    // Completely empty macro panel (no kcal, protein, carbs, or fat) = a data
    // gap in USDA (some Foundation search rows) — useless to log, so demote.
    const n = f.nutrients || {};
    if (!(+n.kcal) && !(+n.protein) && !(+n.carbs) && !(+n.fat)) s -= 1500;
    // Parenthetical qualifiers mark specialized research entries — "(Hopi)",
    // "(Navajo)", "(shoyu)" — a tie-break penalty keeps the mainstream item
    // first. USDA's own "(Includes foods for…)" program note is exempt.
    const paren = (f.description || '').match(/\(([^)]*)/);
    if (paren && !/^includes/i.test(paren[1])) s -= 250;
  }

  // Canonical food preference (both groups): favor base foods, demote processed/
  // compound ones — but only for terms the user did not search.
  s += canonicalAdjust(foodStemSet, qStems);

  // Preferred cut/type the user did not type — lifts the common form people mean
  // (chicken breast, salmon fillet, beef sirloin) over obscure parts/derivatives.
  if (!processed && hasUnqueriedTerm(PREFERRED_CUT_STEMS, foodStemSet, qStems)) s += 250;

  // Food-specific intent (rice/chicken/waffle/egg/peanut butter): strong prefer for
  // the intended form, strong penalty for derivatives — enough to beat a derivative's
  // better text match (e.g. "Waffle Cut Fries" starting with the query word).
  if (intentPreferred) s += 600;
  if (intentPenalized) s -= 1100;
  // `top` breaks ties among equally-preferred forms (rice: cooked over raw).
  if (!processed && intent && intent.top && hasUnqueriedTerm(intent.top, foodStemSet, qStems)) s += 300;

  f._present = present;                                       // stash for filtering
  return s;
}

// Rank a pool of trimmed foods. `strict` (branded) keeps only items matching ALL
// query words so a brand query stays precise; generic keeps anything matching at
// least one word so plain foods (e.g. "Peanut butter, creamy") still surface.
function rankPool(pool, qLower, toks, group, strict, cap, qStems, ctx) {
  const scored = [];
  for (const f of pool) {
    const score = scoreFood(f, qLower, toks, qStems, ctx);
    const hayKeep = nText(f.brand + ' ' + f.description);
    const phrase = qLower && (hayKeep.indexOf(qLower) >= 0 ||
      (ctx.qLowerRev && hayKeep.indexOf(ctx.qLowerRev) >= 0));
    // Brand-intent foods are kept even if the typed token isn't literally in the text
    // (e.g. "coke" → "Coca-Cola"), so brand-alias searches still return the brand.
    const brandHit = ctx.brandIntent.length > 0 && brandMatchesIntent((f.brand || '').toLowerCase(), ctx.brandIntent);
    const keep = brandHit || (strict ? (f._present === toks.length || phrase) : (f._present >= 1));
    delete f._present;          // internal only — keep it out of raw_source_data
    if (!keep) continue;
    f.group = group;
    f.score = score;
    scored.push(f);
  }
  // Highest score first; tie-break toward the shorter (less cluttered) name;
  // final tie-break prefers SR Legacy — identically-named Foundation/SR twins
  // ("Milk, whole, 3.25%…") differ in that SR carries the household measures
  // (1 cup) while Foundation often has none, so SR makes the better default.
  const dtRank = (f) => (f.dataType === 'SR Legacy' ? 0 : 1);
  scored.sort((a, b) => (b.score - a.score) ||
    (a.description.length - b.description.length) || (dtRank(a) - dtRank(b)));
  // Collapse near-duplicates (identically-named Foundation/SR twins, repeated
  // branded listings): same normalized name+brand keeps only the best-ranked
  // row, so the cap is spent on distinct foods, not copies.
  const seenKey = new Set();
  const unique = [];
  for (const f of scored) {
    const k = nText(f.description) + '|' + nText(f.brand);
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    unique.push(f);
    if (unique.length >= cap) break;
  }
  return unique;
}

// Core ranking: trimmed pools + the EFFECTIVE (alias/prefix-expanded) query →
// the response body the client renders. Pure (no I/O), so the offline harness
// can run the EXACT production ranking against captured USDA pools.
function buildResponse(effQuery, branded, generic) {
  const qLower = effQuery.toLowerCase();
  const toks = tokenize(effQuery);
  const qStems = stemTokens(toks);

  // Brand-frequency map over the branded pool (low-weight popularity proxy).
  const freqMap = {};
  branded.forEach(function (f) {
    if (f.brand) { const k = f.brand.toLowerCase(); freqMap[k] = (freqMap[k] || 0) + 1; }
  });

  // Shared scoring context: brand-intent tokens (query named a brand) + the active
  // food-intent map (query IS a base food). Computed once per request.
  const ctx = {
    freqMap,
    brandIntent: queryBrandEntries(toks),
    intent: pickFoodIntent(qStems),
    // Reversed two-word phrase for USDA's inverted names ("Oil, olive").
    qLowerRev: toks.length === 2 ? toks[1] + ' ' + toks[0] : '',
  };

  const rankedBranded = rankPool(branded, qLower, toks, 'branded', true, 12, qStems, ctx);
  const rankedGeneric = rankPool(generic, qLower, toks, 'generic', false, 8, qStems, ctx);

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
  const foodToks = toks.filter(function (t) { return !brandWordSet.has(t); });
  const brandIntentHit = ctx.brandIntent.length > 0 && rankedBranded.some(function (b) {
    if (!brandMatchesIntent((b.brand || '').toLowerCase(), ctx.brandIntent)) return false;
    const hayN = nText((b.brand || '') + ' ' + (b.description || ''));
    return foodToks.every(function (t) { return hayN.indexOf(t) >= 0; });
  });
  const genericByCategory = rankedGeneric.some(function (g) {
    return isWholeCategory(g) && matchesAll(g, qStems);
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
    foods,
    counts: { branded: rankedBranded.length, generic: rankedGeneric.length },
    genericFirst: genericFirst,
  };
}

// The complete search flow (expansion → fetches → recovery ladder → ranking),
// separated from HTTP/auth so the verification harness runs EXACTLY what
// production runs. Returns { status, body }. `_retried` bounds the recovery
// recursion: a corrected query reruns the WHOLE flow once (supplements, brand
// intent, multi-word precision included), never more.
async function searchFoods(q, _retried) {
    // Alias + typeahead expansion — USDA is queried with the EFFECTIVE query
    // ("blueb" → "blueberries", "coke" → "coca cola"), and scoring uses it too.
    const eq = expandQuery(q);
    const effQuery = eq.query;

    // Query Branded and generic SEPARATELY. A combined dataType query returns the
    // top generic hits only (USDA never interleaves branded), so branded products
    // would never appear. Fetched in parallel; one failing doesn't sink the other.
    function typeUrl(query, dataType, pageSize, requireAll) {
      return `${USDA_ENDPOINT}?api_key=${encodeURIComponent(EFFECTIVE_KEY)}` +
        `&query=${encodeURIComponent(query)}` +
        `&dataType=${encodeURIComponent(dataType)}` +
        `&pageSize=${pageSize}&pageNumber=1` +
        (requireAll ? '&requireAllWords=true' : '');
    }
    async function fetchType(query, dataType, pageSize, requireAll) {
      const r = await fetch(typeUrl(query, dataType, pageSize, requireAll));
      if (!r.ok) { const e = new Error('upstream'); e.status = r.status; throw e; }
      const d = await r.json();
      return Array.isArray(d.foods) ? d.foods.map(trimFood) : [];
    }

    // Branded pulls a WIDE pool (USDA max 200). USDA's own relevance buries the
    // right product deep — e.g. "kirkland peanut butter" wouldn't surface Kirkland's
    // organic PB inside the top 50 — so we cast a wide net and let our scorer float
    // the brand+food match to the top. We trim + score + cap, so the client still
    // receives a small, clean list regardless of pool size.
    // Two small supplemental fetches fire only when needed:
    //   • generic: query IS a FOOD_INTENT base food whose obvious form USDA's
    //     relevance buries (chicken → chicken breast).
    //   • branded: query names a known brand — USDA's relevance may return ZERO
    //     of that brand's matching products, so fetch them brand-scoped.
    const supQ = supplementFor(effQuery);
    const brandSupQ = brandSupplementQuery(effQuery);
    const multiWord = effQuery.indexOf(' ') >= 0;
    const [brandedRes, genericRes, supRes, brandSupRes, allWordsRes] = await Promise.allSettled([
      fetchType(effQuery, 'Branded', 200),
      // 50 (not 15): USDA's own relevance buries staple cuts — "chicken" didn't
      // surface breast, "rice" didn't surface plain cooked rice, inside the top 25.
      fetchType(effQuery, 'Foundation,SR Legacy', 50),
      supQ ? fetchType(supQ, 'Foundation,SR Legacy', 25) : Promise.resolve([]),
      brandSupQ ? fetchType(brandSupQ, 'Branded', 50) : Promise.resolve([]),
      // Multi-word precision supplement: USDA's default OR-matching floods the
      // generic pool with single-word hits; requireAllWords recovers the items
      // that actually contain every query word (any multi-word food, no list).
      multiWord ? fetchType(effQuery, 'Foundation,SR Legacy', 25, true) : Promise.resolve([]),
    ]);

    // If BOTH calls failed, surface the error (mirror the old single-call behavior).
    if (brandedRes.status === 'rejected' && genericRes.status === 'rejected') {
      const status = brandedRes.reason && brandedRes.reason.status;
      console.error('usda-search upstream error:', status, USING_DEMO ? '(DEMO_KEY)' : '');
      if (status === 429) {
        return { status: 429, body: {
          error: USING_DEMO
            ? 'Rate limited — DEMO_KEY is shared and capped. Set a real USDA_API_KEY.'
            : 'Too many searches right now. Try again in a moment.',
        } };
      }
      return { status: 502, body: { error: 'Food database is unavailable right now.' } };
    }

    let branded = mergeGeneric(
      brandedRes.status === 'fulfilled' ? brandedRes.value : [],
      brandSupRes.status === 'fulfilled' ? brandSupRes.value : []);
    let generic = mergeGeneric(
      mergeGeneric(
        genericRes.status === 'fulfilled' ? genericRes.value : [],
        allWordsRes.status === 'fulfilled' ? allWordsRes.value : []),
      supRes.status === 'fulfilled' ? supRes.value : []);

    // Zero-result recovery ladder — runs ONLY when the exact query found
    // nothing, so legitimate words are never hijacked by correction:
    //   1. local dictionary correction ("chiken" → "chicken", "yougurt" →
    //      "yogurt") — instant, config-driven, covers common foods and brands;
    //   2. USDA fuzzy retry ("sardin~1" matches sardine) for everything the
    //      dictionary doesn't know, with the query then corrected to the
    //      nearest word actually present in the matched foods, so ranking
    //      scores real text instead of the typo.
    // WEAK results also trigger correction, not just zero: misspelled products
    // exist in USDA ("SESAME CHIKEN"), so a typo can return a handful of junk
    // rows that would otherwise mask the fix. A real food virtually always has
    // generic hits or a deep branded pool; a typo has neither. A correction is
    // adopted only if its results are actually stronger, and it reruns the
    // FULL flow (recursion, bounded to one retry) so corrected queries get
    // supplements/brand intent exactly like clean ones.
    const weak = !generic.length && branded.length < 15;
    if (weak && !_retried) {
      const corrected = effQuery.split(' ').map(spellCorrect).join(' ');
      if (corrected !== effQuery) {
        const cg = await fetchType(corrected, 'Foundation,SR Legacy', 25).catch(function () { return []; });
        if (cg.length) {
          const out = await searchFoods(corrected, true);
          if (out.status === 200) out.body.expandedQuery = corrected;
          return out;
        }
      }
    }
    if (!branded.length && !generic.length && !_retried) {
      // Last resort: USDA fuzzy syntax ("sardin~1" matches sardine) finds what
      // the local dictionary doesn't know, and the matched text tells us the
      // real spelling — rerun the full flow with it.
      const fuzzyQ = effQuery.split(' ')
        .map(function (t) { return t.length >= 4 ? t + '~1' : t; }).join(' ');
      if (fuzzyQ !== effQuery) {
        const [fb, fg] = await Promise.allSettled([
          fetchType(fuzzyQ, 'Branded', 100),
          fetchType(fuzzyQ, 'Foundation,SR Legacy', 50),
        ]);
        const fBranded = fb.status === 'fulfilled' ? fb.value : [];
        const fGeneric = fg.status === 'fulfilled' ? fg.value : [];
        const corrected = correctFromPool(effQuery, fGeneric.concat(fBranded));
        if (corrected !== effQuery) {
          const out = await searchFoods(corrected, true);
          if (out.status === 200) out.body.expandedQuery = corrected;
          return out;
        }
        branded = fBranded;
        generic = fGeneric;
      }
    }

    const body = buildResponse(effQuery, branded, generic);

    if (eq.expanded) body.expandedQuery = effQuery;   // transparency for the client/debugging
    if (USING_DEMO) body.warning = 'Using DEMO_KEY (rate-limited, dev only).';
    return { status: 200, body };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    if (USING_DEMO) {
      // Loud in the server logs so a missing prod env var is obvious in Vercel.
      console.warn('usda-search: USDA_API_KEY missing — falling back to DEMO_KEY ' +
        '(rate-limited, not for production). Set USDA_API_KEY in the environment.');
    }

    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) return res.status(200).json({ foods: [] }); // mirror client guard

    const out = await searchFoods(q);
    // Short CDN cache: identical queries are common while typing.
    if (out.status === 200) res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error('usda-search error:', err);
    return res.status(500).json({ error: 'Search failed. Try again.' });
  }
};

// Exposed for the offline ranking harness (never used by the route itself):
// captured USDA pools → trimFood → buildResponse reproduces production output.
module.exports._internals = {
  trimFood, expandQuery, buildResponse, supplementFor, mergeGeneric, brandSupplementQuery,
  nText, spellCorrect, splitCompound, completeEntry, correctFromPool, editDistanceLe,
  searchFoods,
};
