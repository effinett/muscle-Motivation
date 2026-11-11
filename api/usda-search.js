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
const memory  = require('../food-memory.js');
const mealctx = require('../food-meal.js');

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

/* ── Warm-instance USDA pool cache ────────────────────────────────────────────
 * One search fans out to 3–5 USDA calls, and USDA's food data changes on a
 * release cadence, not per request — so a trimmed pool fetched a few minutes ago
 * is the same pool. Each (query, dataType, pageSize, requireAll) fetch is
 * memoized for the life of the warm function instance:
 *   • the PROMISE is cached, so concurrent identical fetches share one upstream
 *     call (typing "chick" → "chicken" by two users costs one USDA request);
 *   • a failed fetch is evicted immediately — errors are never cached;
 *   • readers get CLONES, so nothing downstream can mutate the cached pool;
 *   • bounded by entry count + TTL (oldest-first eviction), memory-only — it
 *     holds public USDA data only, never anything user-specific, and vanishes
 *     with the instance. A durable cross-instance cache is a separate decision.
 * Ranking is untouched: the ranker receives exactly the pools USDA returned. */
const POOL_CACHE_TTL_MS = 10 * 60 * 1000;
const POOL_CACHE_MAX    = 150;
const poolCache = new Map();   // key → { at, promise }

function clonePool(foods) {
  return foods.map(function (f) {
    return Object.assign({}, f, { nutrients: Object.assign({}, f.nutrients) });
  });
}

// `load` performs the real upstream fetch and resolves to a trimmed pool.
function cachedPool(key, load) {
  const now = Date.now();
  const hit = poolCache.get(key);
  if (hit && now - hit.at < POOL_CACHE_TTL_MS) return hit.promise.then(clonePool);
  if (hit) poolCache.delete(key);
  const promise = Promise.resolve().then(load);
  poolCache.set(key, { at: now, promise: promise });
  promise.catch(function () {
    const cur = poolCache.get(key);
    if (cur && cur.promise === promise) poolCache.delete(key);
  });
  while (poolCache.size > POOL_CACHE_MAX) poolCache.delete(poolCache.keys().next().value);
  return promise.then(clonePool);
}

/* ── Durable response cache (public.usda_search_cache) ────────────────────────
 * The warm-instance pool cache above dies with the instance and is not shared
 * between instances. This one is: the ranked response for a PLAIN search (no
 * correction memory, no meal context) is stored in Supabase for 24 hours, so a
 * repeat of that search — by anyone, on any instance — costs zero USDA requests.
 *   • Server-only: read and written with the service-role key; the table has no
 *     RLS policies and no anon/authenticated privileges. Without the key the
 *     cache is simply off.
 *   • The key embeds a fingerprint of the ranking code, so a ranking change
 *     starts a fresh cache instead of serving an old ordering.
 *   • Only complete, non-empty, non-contextual, real-key responses are stored —
 *     never a degraded result (a USDA pool failed), an empty one (could be a
 *     transient upstream failure) or a DEMO_KEY one.
 *   • Every failure or timeout is a cache miss; search never waits on it for
 *     more than a moment and never fails because of it.
 * It holds public USDA-derived data only — nothing about any user. */
const RESPONSE_CACHE_TTL_MS   = 24 * 60 * 60 * 1000;
const RESPONSE_CACHE_READ_MS  = 350;     // a slower read is a miss
const RESPONSE_CACHE_WRITE_MS = 150;     // wait this long for the write to leave, then respond
const RESPONSE_CACHE_MAX_BYTES = 200 * 1024;
const RESPONSE_CACHE_PRUNE_ONE_IN = 25;

// Fingerprint of everything that decides a plain response: the ranking modules
// and this file. Falls back to the deployment commit; with neither, no cache.
const RANKING_FINGERPRINT = (function () {
  try {
    const fs = require('fs');
    const h = require('crypto').createHash('sha1');
    ['../food-ranking.js', '../food-memory.js', '../food-meal.js'].forEach(function (f) {
      h.update(fs.readFileSync(require.resolve(f)));
    });
    h.update(fs.readFileSync(__filename));
    return h.digest('hex').slice(0, 12);
  } catch (e) {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    return sha ? String(sha).slice(0, 12) : null;
  }
})();

function responseCacheKey(q) {
  const norm = String(q == null ? '' : q).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!RANKING_FINGERPRINT || norm.length < 2 || norm.length > 80) return null;
  return RANKING_FINGERPRINT + '|' + norm;
}

function responseCacheConfig() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  return (key && url) ? { url: url, key: key } : null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise(function (resolve) { timer = setTimeout(function () { resolve(undefined); }, ms); });
  return Promise.race([promise, timeout]).then(
    function (v) { clearTimeout(timer); return v; },
    function () { clearTimeout(timer); return undefined; });
}

// → the cached body, or null (miss, expired, off, slow, or any error).
async function responseCacheGet(cacheKey) {
  const cfg = responseCacheConfig();
  if (!cfg || !cacheKey) return null;
  const since = new Date(Date.now() - RESPONSE_CACHE_TTL_MS).toISOString();
  const url = cfg.url + '/rest/v1/usda_search_cache?select=body' +
    '&cache_key=eq.' + encodeURIComponent(cacheKey) +
    '&created_at=gte.' + encodeURIComponent(since) + '&limit=1';
  const rows = await withTimeout((async function () {
    const r = await fetch(url, { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key } });
    if (!r.ok) return null;
    return await r.json();
  })(), RESPONSE_CACHE_READ_MS);
  const body = Array.isArray(rows) && rows[0] && rows[0].body;
  return (body && Array.isArray(body.foods) && body.foods.length) ? body : null;
}

function responseCacheable(out, contextual) {
  return !!(out && out.status === 200 && !out.degraded && !contextual && !USING_DEMO &&
    out.body && Array.isArray(out.body.foods) && out.body.foods.length && !out.body.warning);
}

// Best effort. Resolves once the write has had time to leave (or finished).
async function responseCachePut(cacheKey, body) {
  const cfg = responseCacheConfig();
  if (!cfg || !cacheKey) return false;
  let payload;
  try { payload = JSON.stringify({ cache_key: cacheKey, body: body, created_at: new Date().toISOString() }); }
  catch (e) { return false; }
  if (payload.length > RESPONSE_CACHE_MAX_BYTES) return false;
  const headers = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
  const jobs = [fetch(cfg.url + '/rest/v1/usda_search_cache?on_conflict=cache_key', {
    method: 'POST', body: payload,
    headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers),
  })];
  if (Math.floor(Math.random() * RESPONSE_CACHE_PRUNE_ONE_IN) === 0) {
    const cutoff = new Date(Date.now() - RESPONSE_CACHE_TTL_MS).toISOString();
    jobs.push(fetch(cfg.url + '/rest/v1/usda_search_cache?created_at=lt.' + encodeURIComponent(cutoff), {
      method: 'DELETE', headers: Object.assign({ Prefer: 'return=minimal' }, headers),
    }));
  }
  await withTimeout(Promise.allSettled(jobs), RESPONSE_CACHE_WRITE_MS);
  return true;
}

/* ── USDA quota visibility ────────────────────────────────────────────────────
 * api.data.gov reports the key's hourly allowance on every response
 * (X-RateLimit-Limit / X-RateLimit-Remaining). The key itself is a Vercel
 * sensitive variable nobody can read back, so the function logs the allowance
 * instead: the limit once per warm instance (and again if it changes), and a
 * warning — at most every five minutes — when under 10% is left. Logging only:
 * it never changes a response and never throws. Read it in Vercel runtime logs
 * (search "usda-search quota"). */
const QUOTA_LOW_FRACTION = 0.1;
const QUOTA_WARN_EVERY_MS = 5 * 60 * 1000;
const quotaState = { limit: null, warnedAt: 0 };
function noteQuota(res, log) {
  try {
    const out = log || console;
    const h = res && res.headers;
    if (!h || typeof h.get !== 'function') return null;
    const limit = parseInt(h.get('x-ratelimit-limit'), 10);
    const remaining = parseInt(h.get('x-ratelimit-remaining'), 10);
    if (!(limit > 0) || !(remaining >= 0)) return null;
    if (quotaState.limit !== limit) {
      quotaState.limit = limit;
      out.log('usda-search quota: limit ' + limit + ' requests/hour, ' + remaining + ' remaining');
    }
    const now = Date.now();
    if (remaining <= limit * QUOTA_LOW_FRACTION && now - quotaState.warnedAt >= QUOTA_WARN_EVERY_MS) {
      quotaState.warnedAt = now;
      out.warn('usda-search quota LOW: ' + remaining + ' of ' + limit + ' requests left this hour');
    }
    return { limit: limit, remaining: remaining };
  } catch (e) { return null; }
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
// `opts.signals` (Phase 4.2.4) is the correction-memory pass — the ONLY new
// input to ranking. It is optional and defaults to undefined, so the offline
// ranking harness (which calls with three args) reproduces production ranking
// exactly, and ranking stays the single authority (food-ranking.js).
function buildResponse(effQuery, branded, generic, opts) {
  const options = (opts && opts.signals && opts.signals.length) ? { signals: opts.signals } : undefined;
  return ranking.rankFoodCandidates(effQuery, (branded || []).concat(generic || []), options);
}

// The complete search flow (expansion → fetches → recovery ladder → ranking),
// separated from HTTP/auth so the verification harness runs EXACTLY what
// production runs. Returns { status, body }. `_retried` bounds the recovery
// recursion: a corrected query reruns the WHOLE flow once (supplements, brand
// intent, multi-word precision included), never more.
async function searchFoods(q, _retried, opts) {
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
    function fetchType(query, dataType, pageSize, requireAll) {
      const key = [dataType, pageSize, requireAll ? 1 : 0, query].join('|');
      return cachedPool(key, async function () {
        const r = await fetch(typeUrl(query, dataType, pageSize, requireAll));
        noteQuota(r);                       // before the ok check, so a 429 is logged with its numbers
        if (!r.ok) { const e = new Error('upstream'); e.status = r.status; throw e; }
        const d = await r.json();
        return Array.isArray(d.foods) ? d.foods.map(trimFood) : [];
      });
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
          const out = await searchFoods(corrected, true, opts);
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
          const out = await searchFoods(corrected, true, opts);
          if (out.status === 200) out.body.expandedQuery = corrected;
          return out;
        }
        branded = fBranded;
        generic = fGeneric;
      }
    }

    // `opts.signals` may be an array OR a promise of one: the route starts the
    // correction-memory lookup alongside the USDA fetches instead of ahead of
    // them, and the signals are only needed here, at ranking time.
    const signals = (opts && opts.signals) ? await opts.signals : undefined;
    const body = buildResponse(effQuery, branded, generic, signals ? { signals: signals } : undefined);

    if (eq.expanded) body.expandedQuery = effQuery;   // transparency for the client/debugging
    if (USING_DEMO) body.warning = 'Using DEMO_KEY (rate-limited, dev only).';
    // `degraded` (not part of the HTTP body): a USDA pool failed, so this is a
    // partial answer — fine to serve once, never to store.
    const degraded = [brandedRes, genericRes, supRes, brandSupRes, allWordsRes]
      .some(function (r) { return r.status === 'rejected'; });
    return { status: 200, body, degraded };
}

/* ── Correction memory (Phase 4.2.4) ─────────────────────────────────────────
 * Ranking stays server-authoritative and the resolver never reranks; correction
 * memory reaches ranking ONLY through the options.signals seam here. Two sources
 * feed the SAME shared nmCorrectionSignal (food-memory.js):
 *   • persistent — the user's stored corrections, loaded under THEIR RLS token
 *     (RLS enforces ownership; a forged user id is impossible), indexed by
 *     normalized query + the anchored intent bucket, bounded by maxLookupRecords;
 *   • session — a request-scoped, client-supplied context (X-Correction-Context)
 *     treated strictly as UNTRUSTED preference EVIDENCE: parsed, size/shape/
 *     identity/schema-validated, never written to the database from here.
 * Persistent ∪ session are deduped so one correction is never double-counted.
 * Every failure path degrades to normal ranking — correction memory can slow or
 * skew nothing more than the ordering, and never breaks food resolution. */

// The user's active corrections matching this query, read under their own token.
async function loadPersistentCorrections(q, token) {
  const nq = memory.nmNormQuery(q);
  if (!nq || !token) return [];
  const conds = ['norm_query.eq.' + encodeURIComponent(nq)];
  const ik = memory.nmIntentKey(q);
  if (ik) conds.push('intent_key.eq.' + encodeURIComponent(ik));
  const url = `${SUPABASE_URL}/rest/v1/food_corrections` +
    `?status=eq.active&limit=${memory.NU_CORRECTION.limits.maxLookupRecords}` +
    `&select=status,raw_query,norm_query,intent_key,corrected_key,incorrect_key,reinforcement_count,last_used_at` +
    `&or=(${conds.join(',')})`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows.map((row) => Object.assign({ origin: 'persistent' }, row)) : [];
}

// Build the correction-memory signal for this request, or null when there is
// nothing to apply. Never throws — the caller treats any failure as "no memory".
async function buildCorrectionSignal(q, req, token) {
  const headerCx = req.headers['x-correction-context'];
  const session = memory.nmParseContext(typeof headerCx === 'string' ? headerCx : '');
  let persistent = [];
  try { persistent = await loadPersistentCorrections(q, token); } catch (e) { persistent = []; }
  const all = memory.nmDedupeMemories(persistent.concat(session));
  if (!all.length) return null;
  return memory.nmCorrectionSignal(all, { query: q });
}

/* ── Meal-level reasoning (Phase 4.2.6) ───────────────────────────────────────
 * The client sends a bounded, CANDIDATE-INDEPENDENT per-item meal projection in
 * the X-Meal-Context header. It is UNTRUSTED preference evidence: parsed +
 * validated (version/enum/array bounds, fail-open) and turned into ONE meal
 * ranking signal, injected through the SAME options.signals seam as correction
 * memory. It carries no candidate ids/rankings/confidence, so it can only nudge
 * ordering among the normally-retrieved pool — server ranking authority is intact.
 * Any malformed/oversized/unknown-version header is ignored → normal ranking. */
function buildMealSignal(req) {
  const headerMx = req.headers['x-meal-context'];
  const projection = mealctx.nuParseMealContext(typeof headerMx === 'string' ? headerMx : '');
  if (!projection) return null;
  return mealctx.nuMealSignal(projection);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // The durable-cache read rides alongside the auth check (both are Supabase
    // round-trips), so a miss adds no latency. Nothing is returned from it until
    // auth has passed; a request with no token or with meal context never reads.
    const q = (req.query.q || '').toString().trim();
    let mealSignal = null;
    try { mealSignal = buildMealSignal(req); } catch (e) { mealSignal = null; }
    const cacheKey = (token && !mealSignal) ? responseCacheKey(q) : null;
    const cachedPromise = cacheKey
      ? responseCacheGet(cacheKey).catch(function () { return null; })
      : Promise.resolve(null);

    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    if (USING_DEMO) {
      // Loud in the server logs so a missing prod env var is obvious in Vercel.
      console.warn('usda-search: USDA_API_KEY missing — falling back to DEMO_KEY ' +
        '(rate-limited, not for production). Set USDA_API_KEY in the environment.');
    }

    if (q.length < 2) return res.status(200).json({ foods: [] }); // mirror client guard

    // Best-effort ranking signals — never block resolution. Both feed the SAME
    // options.signals seam and are summed by the shared ranker (food-ranking.js):
    //   • correction memory (Phase 4.2.4) — user-specific, persistent + session;
    //   • meal context (Phase 4.2.6)      — request-scoped meal reasoning.
    // The correction lookup is a Supabase round-trip that only matters at
    // ranking time, so it runs CONCURRENTLY with the USDA fetches rather than
    // ahead of them. The promise never rejects (failure → no signal).
    const signalsPromise = Promise.resolve()
      .then(function () { return buildCorrectionSignal(q, req, token); })
      .catch(function () { return null; })
      .then(function (correctionSignal) { return [correctionSignal, mealSignal].filter(Boolean); });

    // Durable-cache hit: served only when this request carries no context (a
    // user correction for this query must still re-rank from fresh pools).
    const cached = await cachedPromise;
    if (cached && (await signalsPromise).length === 0) {
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.setHeader('X-Food-Cache', 'hit');
      return res.status(200).json(cached);
    }

    const out = await searchFoods(q, undefined, { signals: signalsPromise });
    const contextual = (await signalsPromise).length > 0;
    if (cacheKey && responseCacheable(out, contextual)) {
      try { await responseCachePut(cacheKey, out.body); } catch (e) { /* best effort */ }
    }
    if (out.status === 200) {
      // A context-influenced response is request-specific (user corrections and/or
      // this meal), so it must never be served from a URL-keyed cache to a later,
      // different-context request; a plain query keeps the short private cache.
      res.setHeader('Cache-Control', contextual ? 'private, no-store' : 'private, max-age=60');
    }
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
  cachedPool, poolCache, POOL_CACHE_TTL_MS, POOL_CACHE_MAX,
  noteQuota, quotaState,
  responseCacheKey, responseCacheGet, responseCachePut, responseCacheable, RANKING_FINGERPRINT,
  RESPONSE_CACHE_TTL_MS, RESPONSE_CACHE_MAX_BYTES,
  loadPersistentCorrections, buildCorrectionSignal, buildMealSignal,
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
