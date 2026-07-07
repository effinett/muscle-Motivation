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
  let unitName = p.measureUnit && p.measureUnit.name;
  if (unitName === 'RACC') unitName = 'serving';   // USDA jargon (Reference Amount Customarily Consumed)
  const unit = (unitName && unitName !== 'undetermined') ? unitName : '';
  const mod = (p.modifier || '').trim();
  const label = (String(amt) + (unit ? ' ' + unit : '') + (mod ? (unit ? ', ' : ' ') + mod : '')).trim();
  return label || (String(amt) + ' serving');
}

// How "natural" a household portion is as the DEFAULT serving. The client
// defaults to the FIRST portion, so the most natural one must sort first:
// 1 medium banana over 1 cup mashed, 2 tbsp peanut butter over 1 cup, 1 slice
// bread over 1 loaf. Heuristic + a stable sort (USDA sequence breaks ties, which
// USDA itself orders sensibly — e.g. "1 large" first for eggs). Tune the weights/
// word lists here; no client changes needed.
function naturalScore(label, grams, amount) {
  // Parentheticals describe, they don't measure — "1 cup (4.86 large eggs)" must
  // not score as a "large egg". Strip them before matching.
  const l = ' ' + label.toLowerCase().replace(/\([^)]*\)/g, ' ') + ' ';
  let s = 0;
  // prepared/altered forms are poor defaults (cup mashed, sliced, packed…)
  if (/\b(mashed|sliced|chopped|diced|cubed|shredded|grated|melted|crumbled|pureed|packed|drained)\b/.test(l)) s -= 30;
  if (/\bnlea\b/.test(l)) s -= 5;                      // fine as fallback, not first
  // common single-item sizes; medium/large tie → USDA sequence decides (egg: large
  // listed first; produce: medium listed before large)
  if (/\bmedium\b/.test(l)) s += 24;
  if (/\blarge\b/.test(l) && !/\bextra\b/.test(l)) s += 24;
  if (/\bsmall\b/.test(l) && !/\bextra\b/.test(l)) s -= 8;
  if (/\b(extra small|extra large|jumbo)\b/.test(l)) s -= 15;
  // natural household units (1 cup rice/milk, 1 slice bread, 2 tbsp PB, 1 breast…)
  if (/\b(cup|cups|slice|piece|egg|breast|thigh|fillet|filet|tbsp|tablespoon|scoop|patty|link|waffle|pancake|bottle|can|container)\b/.test(l)) s += 10;
  if (/\b(tsp|teaspoon)\b/.test(l)) s -= 5;            // too small to be the default
  if (grams >= 10 && grams <= 250) s += 15;            // plausible one-serving weight
  if (amount === 1) s += 5;                            // "1 x" beats "3 x" / "0.25 x"
  return s;
}

// Trim USDA foodPortions to what the client needs: accurate gram-weighted
// measures, most natural default FIRST (the client defaults to portions[0]).
function trimPortions(food) {
  const raw = Array.isArray(food.foodPortions) ? food.foodPortions : [];
  const seen = {};
  const out = [];
  raw.slice()
    // USDA sequence first — it stays as the tie-break within equal naturalness.
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
    .forEach((p) => {
      const g = +p.gramWeight;
      if (!(g > 0)) return;                        // rule: only real gram weights
      const label = portionLabel(p);
      const dedupe = label.toLowerCase() + '|' + Math.round(g);
      if (seen[dedupe]) return;
      seen[dedupe] = 1;
      const amount = p.amount != null ? +p.amount : 1;
      out.push({ label, amount, gramWeight: g, _n: naturalScore(label, g, amount) });
    });
  // Stable sort (Node ≥ 12): naturalness desc, USDA sequence as tie-break.
  out.sort((a, b) => b._n - a._n);
  out.forEach((p) => { delete p._n; });
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

// Exposed for the offline harness only (verifies default-portion selection).
module.exports._internals = { trimPortions, naturalScore };
