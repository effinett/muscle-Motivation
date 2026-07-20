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
// Ranking (Phase 4.2.2): USDA's default order buries branded products (a combined
// dataType query returns NO branded at all), so we query Branded and generic
// separately and hand the pools to the SHARED ranking core — food-ranking.js
// (rankFoodCandidates) — which owns all scoring, ordering, and duplicate
// collapsing. This route stays the authoritative ranking BOUNDARY (every surface
// receives already-ranked candidates from here), but the ranking BRAIN lives in
// the shared module where tests and benchmarks run it offline.
//
// This file's responsibilities after the extraction: request validation, auth,
// USDA communication, candidate-pool construction (supplements + recovery
// ladder), invoking the shared ranker, HTTP shaping, error handling.
//
// Env: USDA_API_KEY (free from https://api.data.gov/signup/). If it's missing we
// fall back to the shared DEMO_KEY for local/dev — rate-limited, NOT for prod —
// and warn loudly in the logs + response. SUPABASE_URL + SUPABASE_ANON_KEY are
// already set for the Stripe routes. The key is never sent to the browser.

const ranking = require('../food-ranking.js');

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
// `score` are added by the shared ranking pass.
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

// Merge a supplemental pool into the primary one (dedupe by fdcId).
function mergeGeneric(primary, supplement) {
  const seen = new Set(primary.map(function (f) { return f.fdcId; }));
  return primary.concat((supplement || []).filter(function (f) { return !seen.has(f.fdcId); }));
}

// Compat wrapper for the offline ranking harness: trimmed pools + the EFFECTIVE
// query → the response body. The ranking itself lives in food-ranking.js; the
// branded/generic pools are flattened because the shared ranker re-derives the
// split from dataType === 'Branded' (exactly how the pools were fetched).
function buildResponse(effQuery, branded, generic) {
  return ranking.rankFoodCandidates(effQuery, (branded || []).concat(generic || []));
}

// The complete search flow (expansion → fetches → recovery ladder → ranking),
// separated from HTTP/auth so the verification harness runs EXACTLY what
// production runs. Returns { status, body }. `_retried` bounds the recovery
// recursion: a corrected query reruns the WHOLE flow once (supplements, brand
// intent, multi-word precision included), never more.
async function searchFoods(q, _retried) {
    // Alias + typeahead expansion — USDA is queried with the EFFECTIVE query
    // ("blueb" → "blueberries", "coke" → "coca cola"), and scoring uses it too.
    const eq = ranking.expandQuery(q);
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
    // organic PB inside the top 50 — so we cast a wide net and let the shared
    // ranker float the brand+food match to the top. We trim + score + cap, so the
    // client still receives a small, clean list regardless of pool size.
    // Two small supplemental fetches fire only when needed:
    //   • generic: query IS a FOOD_INTENT base food whose obvious form USDA's
    //     relevance buries (chicken → chicken breast).
    //   • branded: query names a known brand — USDA's relevance may return ZERO
    //     of that brand's matching products, so fetch them brand-scoped.
    const supQ = ranking.supplementFor(effQuery);
    const brandSupQ = ranking.brandSupplementQuery(effQuery);
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
      const corrected = effQuery.split(' ').map(ranking.spellCorrect).join(' ');
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
        const corrected = ranking.correctFromPool(effQuery, fGeneric.concat(fBranded));
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
// Shapes/names preserved from before the Phase 4.2.2 extraction — the pure
// entries now delegate to food-ranking.js (one source of truth).
module.exports._internals = {
  trimFood, buildResponse, mergeGeneric, searchFoods,
  expandQuery: ranking.expandQuery,
  supplementFor: ranking.supplementFor,
  brandSupplementQuery: ranking.brandSupplementQuery,
  nText: ranking.nText,
  spellCorrect: ranking.spellCorrect,
  splitCompound: ranking.splitCompound,
  completeEntry: ranking.completeEntry,
  correctFromPool: ranking.correctFromPool,
  editDistanceLe: ranking.editDistanceLe,
};
