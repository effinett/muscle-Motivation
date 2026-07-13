// /api/ai-food-parse.js
// Phase 4.2 — natural-language food logging, parse step ONLY.
//
// Takes a member's plain-English description ("2 eggs and toast with peanut
// butter") and returns structured items: a short USDA search query plus the
// quantity/unit the user stated. It NEVER returns calories or macros — per
// CLAUDE.md §11 nutrition values must come from the verified USDA database,
// so the client resolves each item through the existing /api/usda-search
// pipeline and the user confirms before anything is saved.
//
// Cost controls (the whole point of doing this server-side):
//   • identity verified from the bearer token (same as create-checkout-session)
//   • input capped at 300 chars, output capped at 1000 tokens
//   • per-user daily cap counted in public.ai_usage via the service role;
//     the count/insert FAIL CLOSED — if we can't record usage, we don't spend.
//
// Env: ANTHROPIC_API_KEY (required), AI_FOOD_MODEL (default claude-haiku-4-5),
//      AI_FOOD_DAILY_LIMIT (default 30), plus the usual SUPABASE_* vars.

const Anthropic = require('@anthropic-ai/sdk');

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL                 = process.env.AI_FOOD_MODEL || 'claude-haiku-4-5';
const DAILY_LIMIT           = parseInt(process.env.AI_FOOD_DAILY_LIMIT, 10) || 30;
const MAX_INPUT_CHARS       = 300;
const MAX_ITEMS             = 10;
const ROUTE                 = 'ai-food-parse';

// Verify the access token by asking Supabase Auth who it belongs to.
// Same helper as create-checkout-session.js — do NOT trust a client user id.
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

/* ── usage cap (service role, fail closed) ─────────────────────────────── */

// Count this user's calls to this route since UTC midnight. Returns a number
// or null on any failure — callers treat null as "cannot enforce the cap".
async function countUsageToday(userId) {
  try {
    const dayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
    const url = `${SUPABASE_URL}/rest/v1/ai_usage` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&route=eq.${ROUTE}` +
      `&created_at=gte.${encodeURIComponent(dayStart)}` +
      `&select=id`;
    const r = await fetch(url, {
      method: 'HEAD',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) return null;
    // Content-Range: "0-9/10" or "*/0" — the total sits after the slash.
    const range = r.headers.get('content-range') || '';
    const total = parseInt(range.split('/')[1], 10);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

// Record one use BEFORE spending tokens. Returns true on success.
async function recordUsage(userId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ user_id: userId, route: ROUTE }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ── the parse itself ───────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You convert a person's plain-English description of what they ate into a structured list of foods to look up in the USDA food database.

Rules:
- Split the text into distinct foods. "toast with peanut butter" is two foods: toast and peanut butter. A named dish the database would have as one entry stays one item ("caesar salad").
- Only list foods the person actually mentioned. Never add, guess, or estimate anything — and never output calories or nutrients; the database provides those.
- "query": the shortest search term that identifies the food ("egg", "white rice", "peanut butter"). Keep brand names the person used ("quest bar", "coke"). Drop quantities and measure words from the query.
- "brand": the brand name the person actually said ("quest", "fairlife", "coca cola"), null when they named no brand. Never guess a brand they didn't say.
- "quantity": how many of the unit the person ate. 1 when unspecified. "half a bagel" is 0.5.
- "unit": the measure word the person actually said ("slice", "cup", "tbsp", "scoop", "oz", "g"), exactly one word, singular. EXCEPTION — approximate hand measures keep their size word as a two-word unit: "handful", "small handful", "large handful". null when they gave a bare count ("2 eggs") or no measure at all.
- "grams": the weight in grams ONLY when the person stated an explicit weight (6 oz = 170, 1 lb = 454, 100g = 100). null otherwise — never guess weights.
- "meal": breakfast, lunch, dinner, or snack ONLY when the text says so ("for breakfast", "as a snack"); otherwise null.
- At most ${MAX_ITEMS} items.
- If the text does not describe food at all, return an empty items list.`;

// Structured-outputs schema: nullable fields use anyOf (type unions and
// numeric/length constraints are not supported by the API's subset).
const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'meal'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'query', 'brand', 'quantity', 'unit', 'grams'],
        properties: {
          text:     { type: 'string' },
          query:    { type: 'string' },
          brand:    { anyOf: [{ type: 'string' }, { type: 'null' }] },
          quantity: { type: 'number' },
          unit:     { anyOf: [{ type: 'string' }, { type: 'null' }] },
          grams:    { anyOf: [{ type: 'number' }, { type: 'null' }] },
        },
      },
    },
    meal: {
      anyOf: [
        { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }, // matches NU_MEALS in nutrition.js
        { type: 'null' },
      ],
    },
  },
};

// The model call, separated from HTTP/auth/caps so the offline harness runs
// EXACTLY what production runs (same convention as usda-search's searchFoods).
// Returns { items, meal } or throws.
async function parseFoods(text) {
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
  });

  if (response.stop_reason === 'refusal') {
    const e = new Error('refused'); e.code = 'refusal'; throw e;
  }
  if (response.stop_reason === 'max_tokens') {
    const e = new Error('truncated'); e.code = 'truncated'; throw e;
  }

  const block = (response.content || []).find((b) => b.type === 'text');
  const parsed = JSON.parse(block.text); // schema-enforced, parse is safe

  // Defensive normalization: cap item count, coerce the numbers we multiply by.
  const items = (parsed.items || []).slice(0, MAX_ITEMS).map((it) => ({
    text: String(it.text || '').slice(0, 120),
    query: String(it.query || '').slice(0, 80),
    brand: it.brand ? String(it.brand).toLowerCase().slice(0, 40) : null,
    quantity: (+it.quantity > 0) ? +it.quantity : 1,
    unit: it.unit ? String(it.unit).toLowerCase().slice(0, 20) : null,
    grams: (+it.grams > 0) ? +it.grams : null,
  })).filter((it) => it.query);

  return { items, meal: parsed.meal || null };
}

/* ── handler ────────────────────────────────────────────────────────────── */

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY || !SUPABASE_SERVICE_KEY) {
      console.error('ai-food-parse: missing ANTHROPIC_API_KEY or SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({ error: 'AI logging is not configured.' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    const text = ((req.body || {}).text || '').toString().trim();
    if (text.length < 2) return res.status(400).json({ error: 'Describe what you ate first.' });
    if (text.length > MAX_INPUT_CHARS) {
      return res.status(400).json({ error: `Keep it under ${MAX_INPUT_CHARS} characters.` });
    }

    // Cap check + usage record both FAIL CLOSED — the cap is the cost control.
    const used = await countUsageToday(user.id);
    if (used === null) return res.status(503).json({ error: 'Try again in a moment.' });
    if (used >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'Daily AI logging limit reached — back tomorrow. You can still search and log foods normally.' });
    }
    if (!(await recordUsage(user.id))) {
      return res.status(503).json({ error: 'Try again in a moment.' });
    }

    const out = await parseFoods(text);
    return res.status(200).json({
      items: out.items,
      meal: out.meal,
      remaining: Math.max(0, DAILY_LIMIT - used - 1),
    });
  } catch (err) {
    if (err && err.code === 'refusal') {
      return res.status(400).json({ error: "Couldn't understand that — try listing the foods, like \"2 eggs and toast\"." });
    }
    console.error('ai-food-parse error:', err);
    return res.status(502).json({ error: 'AI logging is unavailable right now. You can still search and log foods normally.' });
  }
};

// Exposed for the offline harness (never used by the route itself).
module.exports._internals = { parseFoods, SYSTEM_PROMPT, PARSE_SCHEMA, countUsageToday };
