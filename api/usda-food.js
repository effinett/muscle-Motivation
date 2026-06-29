// /api/usda-food.js
// Server-side proxy to USDA FoodData Central food DETAIL (/food/{fdcId}).
//
// Phase 3.1.4 — true serving intelligence. The search endpoint omits household
// measures; the detail endpoint returns `foodPortions` (e.g. egg → 1 large = 50 g,
// banana → 1 medium = 118 g, rice cooked → 1 cup = 158 g) WITH real gram weights.
// We return only those portions (gramWeight > 0) so the client can offer accurate
// household servings — never fabricated.
//
// Separate from /api/usda-search (its ranking is untouched). Key stays server-side;
// the page calls this with its Supabase token. Long CDN cache — detail is static.

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USDA_API_KEY      = process.env.USDA_API_KEY;
const EFFECTIVE_KEY     = USDA_API_KEY || 'DEMO_KEY';      // dev fallback (rate-limited)
const USING_DEMO        = !USDA_API_KEY;

const USDA_DETAIL = 'https://api.nal.usda.gov/fdc/v1/food';
const MAX_PORTIONS = 8;

// Verify the access token by asking Supabase Auth who it belongs to (same as the
// other routes — the client never asserts identity).
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

// Human label for a USDA portion, from the messy fields it may carry.
function portionLabel(p) {
  const pd = (p.portionDescription || '').trim();
  if (pd && pd.toLowerCase() !== 'quantity not specified') return pd;
  const amt = p.amount != null ? p.amount : 1;
  const unitName = p.measureUnit && p.measureUnit.name;
  const unit = (unitName && unitName !== 'undetermined') ? unitName : '';
  const mod = (p.modifier || '').trim();
  const label = (String(amt) + (unit ? ' ' + unit : '') + (mod ? (unit ? ', ' : ' ') + mod : '')).trim();
  return label || (String(amt) + ' serving');
}

// Trim USDA foodPortions to what the client needs: accurate gram-weighted measures.
function trimPortions(food) {
  const raw = Array.isArray(food.foodPortions) ? food.foodPortions : [];
  const seen = {};
  const out = [];
  raw.slice()
    // USDA usually returns these in a sensible order; keep it (sequenceNumber when present).
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
    .forEach((p) => {
      const g = +p.gramWeight;
      if (!(g > 0)) return;                        // rule: only real gram weights
      const label = portionLabel(p);
      const dedupe = label.toLowerCase() + '|' + Math.round(g);
      if (seen[dedupe]) return;
      seen[dedupe] = 1;
      out.push({ label, amount: p.amount != null ? +p.amount : 1, gramWeight: g });
    });
  return out.slice(0, MAX_PORTIONS);
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

    const fdcId = (req.query.fdcId || '').toString().trim();
    // Additive feature: any failure returns empty portions so the client degrades
    // silently to the Phase 3.1.2 serving options. Never surfaces a hard error.
    if (!/^\d+$/.test(fdcId)) return res.status(200).json({ portions: [] });

    const url = `${USDA_DETAIL}/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(EFFECTIVE_KEY)}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error('usda-food upstream error:', r.status, USING_DEMO ? '(DEMO_KEY)' : '');
      return res.status(200).json({ portions: [] });      // graceful fallback
    }
    const food = await r.json();
    const portions = trimPortions(food);

    res.setHeader('Cache-Control', 'private, max-age=3600');  // detail is static
    return res.status(200).json({ fdcId, portions });
  } catch (err) {
    console.error('usda-food error:', err);
    return res.status(200).json({ portions: [] });           // graceful fallback
  }
};
