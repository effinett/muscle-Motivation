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
// missing. (Dairy/Baked/Snacks/Sweets/Beverages are intentionally NOT here — those
// aisles are brand-driven; egg lands generic-first via the brand-strength fallback.)
const WHOLE_FOOD_CATEGORIES = new Set([
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
  'old fashioned oats',
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

// ── Relevance scoring ──────────────────────────────────────────────────────
// USDA's own ordering buries branded products under generic/SR foods (and a
// COMBINED dataType query returns zero branded at all). We instead query Branded
// and generic separately, re-rank each by match quality + brand recognition +
// whole-food (category) relevance, and order the two groups by query intent.
function tokenize(q) {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
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
  const toks = brand.toLowerCase().split(/\s+/).map(function (t) { return t.replace(/[^a-z0-9]/g, ''); }).filter(Boolean);
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

// Canonical generic: the query essentially IS the food's principal name (the part
// before the first comma), stem-aware — e.g. "bananas" ↔ "Bananas, raw". Algorithmic,
// no list. Only meaningful for whole-food categories (so "milk" doesn't out-rank brands).
function isCanonicalGeneric(f, qStems) {
  const principal = (f.description || '').split(',')[0];
  const pStems = stemTokens(principal.toLowerCase().split(/\s+/).filter(Boolean));
  if (!pStems.length || pStems.length > 3) return false;
  return qStems.every(function (t) { return pStems.indexOf(t) >= 0; });
}

// Score one trimmed food against the query. Higher = more relevant.
// Match-quality signals (exact phrase, starts-with, brand/all/partial tokens) PLUS
// consumer signals: recognized national brand + a low-weight brand-frequency nudge
// (branded), or whole-food-category + canonical-name relevance (generic). qStems is
// the singularized query; freqMap counts how often each brand appears in the pool.
function scoreFood(f, qLower, toks, qStems, freqMap) {
  const desc = (f.description || '').toLowerCase();
  const brand = (f.brand || '').toLowerCase();
  const hay = (brand + ' ' + desc).trim();
  const isBranded = f.dataType === 'Branded';
  let s = 0;
  if (qLower && hay.indexOf(qLower) >= 0) s += 1000;          // exact phrase anywhere
  if (qLower && desc.indexOf(qLower) === 0) s += 600;         // food name starts with phrase
  const btoks = brand.split(/\s+/);
  for (const t of toks) if (btoks.indexOf(t) >= 0) s += 250;  // brand token match
  let present = 0;
  for (const t of toks) if (hay.indexOf(t) >= 0) present++;
  if (toks.length && present === toks.length) s += 200;       // every query word present
  s += present * 40;                                          // partial token credit
  if (toks.length && desc.indexOf(toks[0]) === 0) s += 80;    // food name starts with 1st word

  const foodStemSet = new Set(stemTokens(hay.split(/\s+/)));
  // Processed/compound = carries a negative term the user did not search (e.g. salad,
  // spread, nuggets, deli). Such foods don't get the whole-food canonical/base boosts.
  const processed = hasUnqueriedTerm(NEGATIVE_STEMS, foodStemSet, qStems);

  if (isBranded) {
    if (brandRecognized(f.brand)) s += 900;                   // recognized national brand (curated)
    // Low-weight popularity proxy: a brand with many products in the pool is likely
    // a larger catalog. Capped so it nudges unlisted brands, never overrides above.
    const freq = (freqMap && f.brand) ? (freqMap[f.brand.toLowerCase()] || 0) : 0;
    if (freq > 1) s += Math.min(freq - 1, 5) * 25;            // +25..+125
  } else if (isWholeCategory(f)) {
    // Whole-food relevance from USDA category (algorithmic, not a food list).
    s += 400;
    if (!processed) {
      if (isCanonicalGeneric(f, qStems)) s += 300;            // the canonical raw food (e.g. "Bananas, raw")
      // BASE-FOOD bonus: the unprocessed whole food — every query word present and a
      // base descriptor (raw/cooked/whole/fillet…). Lifts it over recipe/processed
      // items that merely match the text better (USDA names raw foods awkwardly:
      // "Fish, salmon…", "Chicken, …, breast"). Strictly gated → only ever promotes
      // THE base food a user means; never branded or processed items.
      const matchAllStems = qStems.length > 0 && qStems.every(function (st) { return foodStemSet.has(st); });
      if (matchAllStems && hasUnqueriedTerm(BASE_PREP_STEMS, foodStemSet, qStems)) s += 1500;
    }
  }

  // Canonical food preference (both groups): favor base foods, demote processed/
  // compound ones — but only for terms the user did not search.
  s += canonicalAdjust(foodStemSet, qStems);

  // Preferred cut/type the user did not type — lifts the common form people mean
  // (chicken breast, salmon fillet, beef sirloin) over obscure parts/derivatives.
  if (!processed && hasUnqueriedTerm(PREFERRED_CUT_STEMS, foodStemSet, qStems)) s += 250;

  f._present = present;                                       // stash for filtering
  return s;
}

// Rank a pool of trimmed foods. `strict` (branded) keeps only items matching ALL
// query words so a brand query stays precise; generic keeps anything matching at
// least one word so plain foods (e.g. "Peanut butter, creamy") still surface.
function rankPool(pool, qLower, toks, group, strict, cap, qStems, freqMap) {
  const scored = [];
  for (const f of pool) {
    const score = scoreFood(f, qLower, toks, qStems, freqMap);
    const phrase = qLower && (f.brand + ' ' + f.description).toLowerCase().indexOf(qLower) >= 0;
    const keep = strict ? (f._present === toks.length || phrase) : (f._present >= 1);
    delete f._present;          // internal only — keep it out of raw_source_data
    if (!keep) continue;
    f.group = group;
    f.score = score;
    scored.push(f);
  }
  // Highest score first; tie-break toward the shorter (less cluttered) name.
  scored.sort((a, b) => (b.score - a.score) || (a.description.length - b.description.length));
  return scored.slice(0, cap);
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

    // Query Branded and generic SEPARATELY. A combined dataType query returns the
    // top generic hits only (USDA never interleaves branded), so branded products
    // would never appear. Fetched in parallel; one failing doesn't sink the other.
    function typeUrl(dataType, pageSize) {
      return `${USDA_ENDPOINT}?api_key=${encodeURIComponent(EFFECTIVE_KEY)}` +
        `&query=${encodeURIComponent(q)}` +
        `&dataType=${encodeURIComponent(dataType)}` +
        `&pageSize=${pageSize}&pageNumber=1`;
    }
    async function fetchType(dataType, pageSize) {
      const r = await fetch(typeUrl(dataType, pageSize));
      if (!r.ok) { const e = new Error('upstream'); e.status = r.status; throw e; }
      const d = await r.json();
      return Array.isArray(d.foods) ? d.foods.map(trimFood) : [];
    }

    // Branded pulls a WIDE pool (USDA max 200). USDA's own relevance buries the
    // right product deep — e.g. "kirkland peanut butter" wouldn't surface Kirkland's
    // organic PB inside the top 50 — so we cast a wide net and let our scorer float
    // the brand+food match to the top. We trim + score + cap, so the client still
    // receives a small, clean list regardless of pool size.
    const [brandedRes, genericRes] = await Promise.allSettled([
      fetchType('Branded', 200),
      fetchType('Foundation,SR Legacy', 15),
    ]);

    // If BOTH calls failed, surface the error (mirror the old single-call behavior).
    if (brandedRes.status === 'rejected' && genericRes.status === 'rejected') {
      const status = brandedRes.reason && brandedRes.reason.status;
      console.error('usda-search upstream error:', status, USING_DEMO ? '(DEMO_KEY)' : '');
      if (status === 429) {
        return res.status(429).json({
          error: USING_DEMO
            ? 'Rate limited — DEMO_KEY is shared and capped. Set a real USDA_API_KEY.'
            : 'Too many searches right now. Try again in a moment.',
        });
      }
      return res.status(502).json({ error: 'Food database is unavailable right now.' });
    }

    const branded = brandedRes.status === 'fulfilled' ? brandedRes.value : [];
    const generic = genericRes.status === 'fulfilled' ? genericRes.value : [];

    const qLower = q.toLowerCase();
    const toks = tokenize(q);
    const qStems = stemTokens(toks);

    // Brand-frequency map over the branded pool (low-weight popularity proxy).
    const freqMap = {};
    branded.forEach(function (f) {
      if (f.brand) { const k = f.brand.toLowerCase(); freqMap[k] = (freqMap[k] || 0) + 1; }
    });

    const rankedBranded = rankPool(branded, qLower, toks, 'branded', true, 12, qStems, freqMap);
    const rankedGeneric = rankPool(generic, qLower, toks, 'generic', false, 8, qStems, freqMap);

    // Group ORDER is emergent, not a per-food flag:
    //   • lead with GENERIC when a whole-food-category result solidly matches the
    //     query (produce, raw meat/fish, grains…) — covers any such food via its
    //     USDA category, no list — OR when the top generic simply out-scores the top
    //     branded (handles egg: whole food, no recognized brand → generic wins).
    //   • otherwise lead with BRANDED (the brand-driven aisles: dairy, bakery, bars).
    const genericByCategory = rankedGeneric.some(function (g) {
      return isWholeCategory(g) && matchesAll(g, qStems);
    });
    const topG = rankedGeneric.length ? rankedGeneric[0].score : 0;
    const topB = rankedBranded.length ? rankedBranded[0].score : 0;
    const genericFirst = rankedGeneric.length > 0 && (genericByCategory || topG >= topB);

    // Both groups always returned; the client renders headers off `group`.
    const foods = genericFirst
      ? rankedGeneric.concat(rankedBranded)
      : rankedBranded.concat(rankedGeneric);

    // Short CDN cache: identical queries are common while typing.
    res.setHeader('Cache-Control', 'private, max-age=60');
    const body = {
      foods,
      counts: { branded: rankedBranded.length, generic: rankedGeneric.length },
      genericFirst: genericFirst,
    };
    if (USING_DEMO) body.warning = 'Using DEMO_KEY (rate-limited, dev only).';
    return res.status(200).json(body);
  } catch (err) {
    console.error('usda-search error:', err);
    return res.status(500).json({ error: 'Search failed. Try again.' });
  }
};
