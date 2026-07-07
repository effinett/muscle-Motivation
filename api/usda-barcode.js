// /api/usda-barcode.js
// Server-side proxy for USDA Branded Foods barcode (GTIN/UPC) lookup.
//
// Phase 3.2 — barcode food logging. The page sends a scanned/typed barcode with
// its Supabase token; we verify the user, query USDA's gtinUpc field with the
// key from the environment, and return ONE best match in the exact trimmed
// shape /api/usda-search returns — so the client reuses its normal USDA food
// flow (nuNormalizeUsdaFood → serving card → save) unchanged.
//
// USDA stores gtinUpc zero-padded to 14 digits ("00016000275287"), while
// scanners hand back 12-digit UPC-A / 13-digit EAN-13, so we query a few
// zero-pad variants and accept only exact matches (leading zeros ignored).
//
// Env: USDA_API_KEY (DEMO_KEY fallback for local/dev only) + SUPABASE_URL +
// SUPABASE_ANON_KEY — same as the other USDA routes. Key never reaches the browser.

const { trimFood } = require('./usda-search.js')._internals;

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USDA_API_KEY      = process.env.USDA_API_KEY;
const EFFECTIVE_KEY     = USDA_API_KEY || 'DEMO_KEY';      // dev fallback (rate-limited)
const USING_DEMO        = !USDA_API_KEY;

const USDA_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';

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

// Leading zeros carry no identity in a GTIN — compare on the stripped form.
function gtinKey(code) {
  return String(code || '').replace(/\D/g, '').replace(/^0+/, '');
}

// The zero-pad widths a scanned code may be stored under (raw, 12, 13, 14).
// UPC-A scans arrive as 12 digits but USDA stores 14; EAN-13 similarly.
function gtinVariants(code) {
  const digits = String(code).replace(/\D/g, '');
  const bare = digits.replace(/^0+/, '');
  const out = new Set([digits]);
  [12, 13, 14].forEach((w) => {
    if (bare.length <= w) out.add(bare.padStart(w, '0'));
  });
  return Array.from(out);
}

// How complete a food's macro panel is (kcal weighted highest) — used to prefer
// the variant with real nutrition data when a barcode matches several rows.
function macroCompleteness(n) {
  n = n || {};
  return (+n.kcal ? 4 : 0) + (+n.protein ? 1 : 0) + (+n.carbs ? 1 : 0) + (+n.fat ? 1 : 0);
}

// Pick the single best row among exact GTIN matches: complete nutrition first,
// then the most recently published/modified (USDA re-publishes current products;
// stale discontinued variants keep old dates).
function pickBest(matches) {
  function recency(f) {
    const d = Date.parse(f.modifiedDate || '') || 0;
    const p = Date.parse(f.publishedDate || '') || 0;
    return Math.max(d, p);
  }
  matches.sort((a, b) =>
    (macroCompleteness(b._trim.nutrients) - macroCompleteness(a._trim.nutrients)) ||
    (recency(b) - recency(a)));
  return matches[0];
}

async function lookupBarcode(code) {
  const variants = gtinVariants(code);
  const key = gtinKey(code);

  // One tiny field-scoped query per pad variant, in parallel. gtinUpc is an
  // exact keyword field upstream, so each returns at most a couple of rows.
  const results = await Promise.allSettled(variants.map(async (v) => {
    const url = `${USDA_ENDPOINT}?api_key=${encodeURIComponent(EFFECTIVE_KEY)}` +
      `&query=${encodeURIComponent('+gtinUpc:' + v)}` +
      `&dataType=Branded&pageSize=10&pageNumber=1`;
    const r = await fetch(url);
    if (!r.ok) { const e = new Error('upstream'); e.status = r.status; throw e; }
    const d = await r.json();
    return Array.isArray(d.foods) ? d.foods : [];
  }));

  if (results.every((r) => r.status === 'rejected')) {
    const status = results[0].reason && results[0].reason.status;
    console.error('usda-barcode upstream error:', status, USING_DEMO ? '(DEMO_KEY)' : '');
    if (status === 429) {
      return { status: 429, body: {
        error: USING_DEMO
          ? 'Rate limited — DEMO_KEY is shared and capped. Set a real USDA_API_KEY.'
          : 'Too many lookups right now. Try again in a moment.',
      } };
    }
    return { status: 502, body: { error: 'Food database is unavailable right now.' } };
  }

  // Merge, keep only EXACT barcode matches (zero-pad insensitive), dedupe by fdcId.
  const seen = new Set();
  const matches = [];
  results.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach((f) => {
      if (seen.has(f.fdcId)) return;
      if (gtinKey(f.gtinUpc) !== key) return;
      seen.add(f.fdcId);
      f._trim = trimFood(f);
      matches.push(f);
    });
  });

  if (!matches.length) return { status: 200, body: { food: null } };

  const best = pickBest(matches);
  const food = best._trim;
  food.group = 'branded';                        // barcodes are always branded rows
  const body = { food };
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
      console.warn('usda-barcode: USDA_API_KEY missing — falling back to DEMO_KEY ' +
        '(rate-limited, not for production). Set USDA_API_KEY in the environment.');
    }

    const code = (req.query.code || '').toString().replace(/\D/g, '');
    if (code.length < 8 || code.length > 14) {
      return res.status(400).json({ error: 'Invalid barcode.' });
    }

    const out = await lookupBarcode(code);
    // A barcode's product is static — cache found results client-side for a day.
    if (out.status === 200 && out.body.food) res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error('usda-barcode error:', err);
    return res.status(500).json({ error: 'Lookup failed. Try again.' });
  }
};

// Exposed for the offline harness only.
module.exports._internals = { gtinVariants, gtinKey, pickBest, lookupBarcode };
