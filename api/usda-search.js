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
    brand: f.brandName || f.brandOwner || '',
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

// ── Relevance scoring ──────────────────────────────────────────────────────
// USDA's own ordering buries branded products under generic/SR foods (and a
// COMBINED dataType query returns zero branded at all). We instead query Branded
// and generic separately, then re-rank each by how well it matches the query.
function tokenize(q) {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

// Score one trimmed food against the query. Higher = more relevant.
// Rewards (in order of weight): exact phrase, description starts-with, brand-token
// match, all-tokens-present, partial tokens, food-name starts-with.
function scoreFood(f, qLower, toks) {
  const desc = (f.description || '').toLowerCase();
  const brand = (f.brand || '').toLowerCase();
  const hay = (brand + ' ' + desc).trim();
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
  f._present = present;                                       // stash for filtering
  return s;
}

// Rank a pool of trimmed foods. `strict` (branded) keeps only items matching ALL
// query words so a brand query stays precise; generic keeps anything matching at
// least one word so plain foods (e.g. "Peanut butter, creamy") still surface.
function rankPool(pool, qLower, toks, group, strict, cap) {
  const scored = [];
  for (const f of pool) {
    const score = scoreFood(f, qLower, toks);
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

    const [brandedRes, genericRes] = await Promise.allSettled([
      fetchType('Branded', 50),
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
    const rankedBranded = rankPool(branded, qLower, toks, 'branded', true, 12);
    const rankedGeneric = rankPool(generic, qLower, toks, 'generic', false, 8);

    // Branded always ahead of generic; the client renders group headers off `group`.
    const foods = rankedBranded.concat(rankedGeneric);

    // Short CDN cache: identical queries are common while typing.
    res.setHeader('Cache-Control', 'private, max-age=60');
    const body = {
      foods,
      counts: { branded: rankedBranded.length, generic: rankedGeneric.length },
    };
    if (USING_DEMO) body.warning = 'Using DEMO_KEY (rate-limited, dev only).';
    return res.status(200).json(body);
  } catch (err) {
    console.error('usda-search error:', err);
    return res.status(500).json({ error: 'Search failed. Try again.' });
  }
};
