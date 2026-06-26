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
// Env: USDA_API_KEY (free from https://api.data.gov/signup/). SUPABASE_URL +
// SUPABASE_ANON_KEY are already set for the Stripe routes.

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USDA_API_KEY      = process.env.USDA_API_KEY;

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
// normalizer compute the per-serving amounts.
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

    if (!USDA_API_KEY) {
      // Surfaced to the client as a friendly "search unavailable" state.
      return res.status(503).json({ error: 'Food database is not configured yet.' });
    }

    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) return res.status(200).json({ foods: [] }); // mirror client guard

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const usdaUrl =
      `${USDA_ENDPOINT}?api_key=${encodeURIComponent(USDA_API_KEY)}` +
      `&query=${encodeURIComponent(q)}` +
      `&dataType=${encodeURIComponent('Branded,Foundation,SR Legacy')}` +
      `&pageSize=25&pageNumber=${page}`;

    const r = await fetch(usdaUrl);
    if (!r.ok) {
      console.error('usda-search upstream error:', r.status);
      return res.status(502).json({ error: 'Food database is unavailable right now.' });
    }
    const data = await r.json();
    const foods = Array.isArray(data.foods) ? data.foods.map(trimFood) : [];

    // Short CDN cache: identical queries are common while typing/paging.
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ foods, totalHits: data.totalHits || foods.length });
  } catch (err) {
    console.error('usda-search error:', err);
    return res.status(500).json({ error: 'Search failed. Try again.' });
  }
};
