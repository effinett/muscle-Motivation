// Regression tests for /api/usda-search query understanding + ranking.
// Run via `npm test` (node --test).
//
// Two tiers:
//   1. expandQuery — pure, always runs (no network).
//   2. searchFoods — LIVE USDA ranking checks. These need USDA_API_KEY and are
//      skipped when it's absent (DEMO_KEY is rate-limited into uselessness).
//      The key is read from the environment or the git-ignored .env.local.
//
// Origin (Phase 4.2 live testing): "whole wheat toast" matched a dry melba/
// crispbread product instead of sliced bread. The fix is GLOBAL, not per-food:
// TERM_REWRITES normalizes cooking-form words to the base food ("toast" →
// "bread", modifiers preserved) unless a context word marks a distinct product
// ("melba toast", "french toast"), and dry-toast products (melba, crispbread,
// rusk, zwieback) are intent-aware NEGATIVE_TERMS.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Load .env.local (KEY=value lines) before requiring the route, which reads
// USDA_API_KEY at module load. Never logs values.
(function loadEnvLocal() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch (e) { /* no .env.local — fine */ }
})();

const _internals = require('./api/usda-search.js')._internals;
const { expandQuery, searchFoods, buildResponse, buildCorrectionSignal, buildMealSignal, loadPersistentCorrections } = _internals;
const foodMemory = require('./food-memory.js');
const foodMeal = require('./food-meal.js');
const HAS_KEY = !!process.env.USDA_API_KEY;

/* ── tier 1: query normalization (pure) ─────────────────────────────────── */

test('toast normalizes to bread, modifiers preserved', () => {
  assert.strictEqual(expandQuery('2 slices whole wheat toast').query, 'whole wheat bread');
  assert.strictEqual(expandQuery('sourdough toast').query, 'sourdough bread');
  assert.strictEqual(expandQuery('rye toast').query, 'rye bread');
  assert.strictEqual(expandQuery('toast').query, 'bread');
  assert.strictEqual(expandQuery('toasted bread').query, 'bread'); // rewrite + dedupe
});

test('pb&j shorthand and connector words normalize', () => {
  assert.strictEqual(expandQuery('peanut butter and jelly').query, 'peanut butter jelly');
  assert.strictEqual(expandQuery('pb&j').query, 'peanut butter jelly');
  assert.strictEqual(expandQuery('pbj sandwich').query, 'peanut butter jelly sandwich');
  assert.strictEqual(expandQuery('pb toast').query, 'peanut butter bread');
  assert.strictEqual(expandQuery('toast with butter').query, 'bread butter');
});

test('oatmeal normalizes to oats; derivative products stay literal', () => {
  assert.strictEqual(expandQuery('oatmeal').query, 'oats');
  assert.strictEqual(expandQuery('oatmeal bread').query, 'oatmeal bread');
  assert.strictEqual(expandQuery('oatmeal cookies').query, 'oatmeal cookies');
});

test('mayo normalizes to mayonnaise; the bean cultivar stays literal (4.2.7)', () => {
  assert.strictEqual(expandQuery('mayo').query, 'mayonnaise');
  assert.strictEqual(expandQuery('light mayo').query, 'light mayonnaise');
  // "flor de mayo" beans are a DIFFERENT food — the bean context blocks the rewrite
  assert.strictEqual(expandQuery('flor de mayo beans').query, 'flor de mayo beans');
});

test('distinct toast products are NOT rewritten', () => {
  assert.strictEqual(expandQuery('melba toast').query, 'melba toast');
  assert.strictEqual(expandQuery('french toast').query, 'french toast');
  assert.strictEqual(expandQuery('texas toast').query, 'texas toast');
  assert.strictEqual(expandQuery('cinnamon toast crunch').query, 'cinnamon toast crunch');
  assert.strictEqual(expandQuery('avocado toast').query, 'avocado toast');
});

/* ── tier 2: live ranking (needs USDA_API_KEY) ──────────────────────────── */

// A dry/crisp toast product must never lead a bread-intent query.
const DRY = /melba|crispbread|rusk|zwieback|crouton/i;

async function top(q) {
  const out = await searchFoods(q);
  assert.strictEqual(out.status, 200, q + ' should search OK');
  assert.ok(out.body.foods.length, q + ' should return foods');
  return out.body.foods[0];
}

test('live: "2 slices whole wheat toast" → whole-wheat sliced bread', { skip: !HAS_KEY }, async () => {
  const f = await top('2 slices whole wheat toast');
  assert.match(f.description, /bread/i, 'got: ' + f.description);
  assert.match(f.description, /whole[- ]wheat|wheat/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description, DRY, 'got: ' + f.description);
});

test('live: "sourdough toast" → sourdough bread', { skip: !HAS_KEY }, async () => {
  const f = await top('sourdough toast');
  assert.match(f.description, /bread|sourdough/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description, DRY, 'got: ' + f.description);
});

test('live: "rye toast" → rye bread', { skip: !HAS_KEY }, async () => {
  const f = await top('rye toast');
  assert.match(f.description, /rye/i, 'got: ' + f.description);
  assert.match(f.description, /bread/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description, DRY, 'got: ' + f.description);
});

test('live: "toast with butter" never resolves to a dry toast product', { skip: !HAS_KEY }, async () => {
  const f = await top('toast with butter');
  assert.doesNotMatch(f.description, DRY, 'got: ' + f.description);
  assert.match(f.description, /bread|butter/i, 'got: ' + f.description);
});

test('live: explicit "melba toast" still matches melba toast', { skip: !HAS_KEY }, async () => {
  const f = await top('melba toast');
  assert.match(f.description, /melba/i, 'got: ' + f.description);
});

// "jelly" means the fruit spread, never the candy aisle (Phase 4.2 live testing).
const CANDY = /jelly bean|belly|gummy|gummi|candies|candy/i;

test('live: "jelly" → fruit spread, not jelly beans', { skip: !HAS_KEY }, async () => {
  const f = await top('jelly');
  assert.match(f.description + ' ' + (f.brand || ''), /jell|jam|preserve/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description + ' ' + (f.brand || ''), CANDY, 'got: ' + f.description);
});

test('live: "grape jelly" → grape jelly spread', { skip: !HAS_KEY }, async () => {
  const f = await top('grape jelly');
  assert.match(f.description, /grape/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description + ' ' + (f.brand || ''), CANDY, 'got: ' + f.description);
});

test('live: "peanut butter and jelly" never resolves to candy', { skip: !HAS_KEY }, async () => {
  const f = await top('peanut butter and jelly');
  assert.doesNotMatch(f.description + ' ' + (f.brand || ''), CANDY, 'got: ' + f.description);
  assert.match(f.description, /peanut|jelly|jam/i, 'got: ' + f.description);
});

test('live: explicit "jelly beans" still matches jelly beans', { skip: !HAS_KEY }, async () => {
  const f = await top('jelly beans');
  assert.match(f.description + ' ' + (f.brand || ''), /jelly bean|belly/i, 'got: ' + f.description);
});

// Burger queries must offer REAL burgers (fast-food/restaurant entries), never
// dinner kits, seasoning, buns, or sauces — and the top hit's Fast Foods
// category is what triggers the client's "where from?" chooser.
const BURGER_JUNK = /helper|macaroni|dinner|kit\b|pasta|seasoning|marinade|\bbuns\b|sauce|relish|pickles/i;

test('live: "double cheeseburger" → real burgers, Fast Foods category', { skip: !HAS_KEY }, async () => {
  const out = await searchFoods('double cheeseburger');
  const top4 = out.body.foods.slice(0, 4);
  top4.forEach((f) => assert.doesNotMatch(f.description, BURGER_JUNK, 'got: ' + f.description));
  assert.ok(top4.some((f) => /fast foods|mcdonald/i.test(f.description)),
    'expected fast-food entries, got: ' + top4.map((f) => f.description).join(' | '));
  assert.match(out.body.foods[0].foodCategory || '', /fast foods/i, 'top category drives the chooser');
});

test('live: "hamburger" → fast-food burgers, not buns/pickles', { skip: !HAS_KEY }, async () => {
  const out = await searchFoods('hamburger');
  const top4 = out.body.foods.slice(0, 4);
  top4.forEach((f) => assert.doesNotMatch(f.description, BURGER_JUNK, 'got: ' + f.description));
  assert.ok(top4.some((f) => /hamburger/i.test(f.description)));
});

test('live: "chicken" ranking unchanged by Fast Foods category addition', { skip: !HAS_KEY }, async () => {
  const f = await top('chicken');
  assert.match(f.description, /chicken.*breast|breast.*chicken/i, 'got: ' + f.description);
});

test('live: "oats" and "oatmeal" lead with rolled oats, not bread/groats', { skip: !HAS_KEY }, async () => {
  for (const q of ['oats', 'oatmeal']) {
    const f = await top(q);
    assert.match(f.description, /oats.*rolled|rolled.*oats/i, q + ' got: ' + f.description);
  }
});

test('live: "greek yogurt" → plain, not fruit/flavored', { skip: !HAS_KEY }, async () => {
  const f = await top('greek yogurt');
  assert.match(f.description, /greek/i, 'got: ' + f.description);
  assert.doesNotMatch(f.description, /fruit|vanilla|strawberry|honey|flavored/i, 'got: ' + f.description);
});

/* ── Correction memory: server-side ranking application (Phase 4.2.4) ─────────
 * These stay OFFLINE (no USDA key): they exercise the ranking BOUNDARY —
 * buildResponse + buildCorrectionSignal — which is where correction memory
 * enters, per the server-authoritative design (the resolver never reranks). */

// Fresh candidate objects per call — rankFoodCandidates stamps `score` in place,
// so reusing objects across calls would alias scores between them.
function fairlifePool() {
  return [
    { fdcId: 1, description: 'Fairlife Whole Milk', brand: 'Fairlife', dataType: 'Branded',
      nutrients: { kcal: 60, protein: 3, carbs: 5, fat: 3 } },
    { fdcId: 2, description: 'Fairlife Nutrition Bar', brand: 'Fairlife', dataType: 'Branded',
      nutrients: { kcal: 350, protein: 20, carbs: 30, fat: 10 } },
  ];
}
function correction(query, top, picked) {
  return foodMemory.nmBuildCorrectionEvent({
    request: { query }, choices: [{ raw: top }, { raw: picked }], chosenIndex: 1,
  });
}
function scoreOf(resp, fdcId) { return resp.foods.find((f) => f.fdcId === fdcId).score; }

test('correction signal boosts the corrected food and demotes the rejected one', () => {
  const q = 'fairlife milk';
  const base = buildResponse(q, fairlifePool(), []);
  const [milk, bar] = fairlifePool();
  const sig = foodMemory.nmCorrectionSignal([correction(q, bar, milk)], { query: q });
  const withMem = buildResponse(q, fairlifePool(), [], { signals: [sig] });
  assert.equal(scoreOf(withMem, 1) - scoreOf(base, 1), foodMemory.nmContribution('exact', 1)); // milk boosted
  assert.equal(scoreOf(withMem, 2) - scoreOf(base, 2), foodMemory.NU_CORRECTION.demoteIncorrect); // bar demoted
});

test('correction cannot fabricate a candidate absent from the retrieved set', () => {
  const q = 'fairlife milk';
  const [milk] = fairlifePool();
  // corrected food (fdcId 999) is NOT in the pool → ordering is unchanged
  const ghost = { fdcId: 999, description: 'Ghost Milk', brand: 'Fairlife' };
  const sig = foodMemory.nmCorrectionSignal([correction(q, milk, ghost)], { query: q });
  const base = buildResponse(q, fairlifePool(), []);
  const withMem = buildResponse(q, fairlifePool(), [], { signals: [sig] });
  assert.deepEqual(withMem.foods.map((f) => f.fdcId), base.foods.map((f) => f.fdcId));
  assert.ok(!withMem.foods.some((f) => f.fdcId === 999));
});

test('buildResponse with no signal reproduces exactly the pre-4.2.4 ranking', () => {
  const q = 'fairlife milk';
  const a = buildResponse(q, fairlifePool(), []);
  const b = buildResponse(q, fairlifePool(), [], undefined);
  const c = buildResponse(q, fairlifePool(), [], { signals: [] });
  assert.deepEqual(a.foods.map((f) => [f.fdcId, f.score]), b.foods.map((f) => [f.fdcId, f.score]));
  assert.deepEqual(a.foods.map((f) => [f.fdcId, f.score]), c.foods.map((f) => [f.fdcId, f.score]));
});

// Stub global.fetch for the persistent-lookup path (REST under the user's token).
function withFetch(impl, run) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve().then(run).finally(() => { global.fetch = orig; });
}

test('buildCorrectionSignal: session context (header) alone works when persistence is empty', async () => {
  const q = 'fairlife milk';
  const [milk, bar] = fairlifePool();
  const ctx = foodMemory.nmSerializeContext([correction(q, bar, milk)]);
  await withFetch(async () => ({ ok: true, json: async () => [] }), async () => {
    const sig = await buildCorrectionSignal(q, { headers: { 'x-correction-context': ctx } }, 'tok');
    assert.ok(sig, 'a session-only signal is built');
    assert.equal(sig(milk), foodMemory.nmContribution('exact', 1));
  });
});

test('buildCorrectionSignal: session memory still applies when the persistent lookup FAILS', async () => {
  const q = 'fairlife milk';
  const [milk, bar] = fairlifePool();
  const ctx = foodMemory.nmSerializeContext([correction(q, bar, milk)]);
  await withFetch(async () => { throw new Error('db down'); }, async () => {
    const sig = await buildCorrectionSignal(q, { headers: { 'x-correction-context': ctx } }, 'tok');
    assert.ok(sig, 'lookup failure degrades to session-only, never throws');
    assert.equal(sig(milk), foodMemory.nmContribution('exact', 1));
  });
});

test('buildCorrectionSignal: persistent memory alone works with no session context', async () => {
  const q = 'fairlife milk';
  const [milk] = fairlifePool();
  const persisted = [{ status: 'active', raw_query: q, norm_query: foodMemory.nmNormQuery(q),
    intent_key: foodMemory.nmIntentKey(q), corrected_key: 'usda:1', incorrect_key: 'usda:2',
    reinforcement_count: 1, last_used_at: new Date().toISOString() }];
  await withFetch(async () => ({ ok: true, json: async () => persisted }), async () => {
    const sig = await buildCorrectionSignal(q, { headers: {} }, 'tok');
    assert.ok(sig);
    assert.equal(sig(milk), foodMemory.nmContribution('exact', 1));
  });
});

test('buildCorrectionSignal: persistent + session duplicate is not double-counted', async () => {
  const q = 'fairlife milk';
  const [milk, bar] = fairlifePool();
  const ctx = foodMemory.nmSerializeContext([correction(q, bar, milk)]);
  const persisted = [{ status: 'active', raw_query: q, norm_query: foodMemory.nmNormQuery(q),
    intent_key: foodMemory.nmIntentKey(q), corrected_key: 'usda:1', incorrect_key: 'usda:2',
    reinforcement_count: 1, last_used_at: new Date().toISOString() }];
  await withFetch(async () => ({ ok: true, json: async () => persisted }), async () => {
    const sig = await buildCorrectionSignal(q, { headers: { 'x-correction-context': ctx } }, 'tok');
    // Same correction from both sources → single exact contribution, not 2×.
    assert.equal(sig(milk), foodMemory.nmContribution('exact', 1));
  });
});

test('buildCorrectionSignal: no memory anywhere → null (normal ranking)', async () => {
  await withFetch(async () => ({ ok: true, json: async () => [] }), async () => {
    const sig = await buildCorrectionSignal('fairlife milk', { headers: {} }, 'tok');
    assert.equal(sig, null);
  });
});

test('buildCorrectionSignal: malformed session context is ignored safely', async () => {
  await withFetch(async () => ({ ok: true, json: async () => [] }), async () => {
    const sig = await buildCorrectionSignal('fairlife milk',
      { headers: { 'x-correction-context': 'not-json-{{{' } }, 'tok');
    assert.equal(sig, null); // dropped, no throw, falls back to normal ranking
  });
});

/* ── Meal-context ranking signal (Phase 4.2.6) — the SERVER seam ──────────────
 * buildMealSignal parses the untrusted X-Meal-Context header into ONE ranking
 * signal injected through the SAME options.signals seam as correction memory.
 * Every malformed/oversized/unknown-version header must fail open to null. */

function beverageMealPool() {
  // A solid and a beverage candidate for a "cola"-type query.
  return [
    { fdcId: 10, description: 'Cola cake', brand: 'A', dataType: 'Branded',
      foodCategory: 'Sweets', nutrients: { kcal: 350 } },
    { fdcId: 11, description: 'Cola soft drink', brand: 'B', dataType: 'Branded',
      foodCategory: 'Beverages', nutrients: { kcal: 41 } },
  ];
}
function mealHeader(projection) { return { headers: { 'x-meal-context': JSON.stringify(projection) } }; }

test('buildMealSignal: valid header → a signal that reranks via the shared seam', () => {
  const proj = { v: 1, beverage: true, cookedExpected: false, animal: null,
    commodity: false, companionCats: ['carb'], role: 'beverage', mealType: null };
  const sig = buildMealSignal(mealHeader(proj));
  assert.strictEqual(typeof sig, 'function');
  const base = buildResponse('cola', beverageMealPool(), []);
  const withMeal = buildResponse('cola', beverageMealPool(), [], { signals: [sig] });
  // The beverage candidate is boosted, the solid penalized — bounded deltas.
  assert.strictEqual(scoreOf(withMeal, 11) - scoreOf(base, 11), foodMeal.MEAL_WEIGHTS.beverageMatch);
  assert.strictEqual(scoreOf(withMeal, 10) - scoreOf(base, 10), foodMeal.MEAL_WEIGHTS.beverageConflict);
});

test('buildMealSignal: meal context cannot fabricate a candidate', () => {
  const proj = { v: 1, beverage: true, companionCats: ['carb'] };
  const sig = buildMealSignal(mealHeader(proj));
  const base = buildResponse('cola', beverageMealPool(), []);
  const withMeal = buildResponse('cola', beverageMealPool(), [], { signals: [sig] });
  // Same set of candidates, just reordered — nothing invented.
  assert.deepStrictEqual(withMeal.foods.map((f) => f.fdcId).sort(),
    base.foods.map((f) => f.fdcId).sort());
});

test('buildMealSignal: no header → null (normal ranking)', () => {
  assert.strictEqual(buildMealSignal({ headers: {} }), null);
});

test('buildMealSignal: malformed / oversized / unknown-version header → null', () => {
  assert.strictEqual(buildMealSignal({ headers: { 'x-meal-context': 'not-json-{{{' } }), null);
  assert.strictEqual(buildMealSignal({ headers: { 'x-meal-context': 'x'.repeat(9000) } }), null);
  assert.strictEqual(buildMealSignal({ headers: { 'x-meal-context': JSON.stringify({ v: 99, beverage: true }) } }), null);
  // A well-formed but NON-actionable projection is also dropped.
  assert.strictEqual(buildMealSignal({ headers: { 'x-meal-context': JSON.stringify({ v: 1, beverage: false, companionCats: [] }) } }), null);
});

test('buildMealSignal: correction + meal signals coexist on the same request', () => {
  // Both signals apply additively through options.signals (server combines them).
  const proj = { v: 1, beverage: true, companionCats: ['carb'] };
  const mealSig = buildMealSignal(mealHeader(proj));
  const pool = beverageMealPool();
  const corr = foodMemory.nmCorrectionSignal(
    [correction('cola', pool[0], pool[1])], { query: 'cola' });
  const base = buildResponse('cola', beverageMealPool(), []);
  const both = buildResponse('cola', beverageMealPool(), [], { signals: [corr, mealSig] });
  // The drink (fdcId 11) is both the corrected pick AND the beverage match → it
  // gains both contributions and leads decisively; nothing is fabricated.
  assert.strictEqual(both.foods[0].fdcId, 11);
  assert.ok(scoreOf(both, 11) > scoreOf(base, 11));
});

/* ── search latency: warm-instance pool cache + concurrent signals ─────────
 * No network: global.fetch is stubbed with a counting USDA responder. */
const { cachedPool, poolCache, POOL_CACHE_TTL_MS, POOL_CACHE_MAX } = _internals;

function usdaStub(foodsFor) {
  const calls = [];
  return {
    calls,
    impl: async (url) => {
      const u = new URL(String(url));
      calls.push(u.searchParams.get('dataType') + '|' + u.searchParams.get('query'));
      const foods = foodsFor(u.searchParams.get('dataType'), u.searchParams.get('query'));
      if (foods instanceof Error) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ({ foods }) };
    },
  };
}
const rawBanana = () => [{ fdcId: 501, description: 'Bananas, raw', dataType: 'SR Legacy',
  foodCategory: 'Fruits and Fruit Juices',
  foodNutrients: [{ nutrientId: 1008, value: 89 }, { nutrientId: 1003, value: 1.1 }] }];

test('pool cache: a repeated search reuses the USDA pools (no second upstream call)', async () => {
  poolCache.clear();
  const stub = usdaStub((type) => (type === 'Branded' ? [] : rawBanana()));
  await withFetch(stub.impl, async () => {
    const first = await searchFoods('banana');
    const n = stub.calls.length;
    assert.ok(n >= 2, 'first search hits USDA');
    const second = await searchFoods('banana');
    assert.strictEqual(stub.calls.length, n, 'second identical search makes no upstream call');
    assert.deepEqual(second.body.foods.map((f) => [f.fdcId, f.score]), first.body.foods.map((f) => [f.fdcId, f.score]),
      'cached pools rank identically');
  });
});

test('pool cache: concurrent identical fetches share one upstream call; readers get clones', async () => {
  poolCache.clear();
  let loads = 0;
  const load = async () => { loads++; return [{ fdcId: 1, nutrients: { kcal: 10 } }]; };
  const [a, b] = await Promise.all([cachedPool('k', load), cachedPool('k', load)]);
  assert.strictEqual(loads, 1);
  a[0].score = 99; a[0].nutrients.kcal = 0;
  assert.strictEqual(b[0].score, undefined, 'a reader cannot mutate another reader');
  const c = await cachedPool('k', load);
  assert.strictEqual(c[0].nutrients.kcal, 10, 'nor the cached pool itself');
});

test('pool cache: failures are never cached; entries expire; size is bounded', async () => {
  poolCache.clear();
  let n = 0;
  const flaky = async () => { n++; if (n === 1) { const e = new Error('upstream'); e.status = 429; throw e; } return []; };
  await assert.rejects(cachedPool('f', flaky));
  await cachedPool('f', flaky);
  assert.strictEqual(n, 2, 'a failed fetch is retried, not replayed');

  let loads = 0;
  const load = async () => { loads++; return []; };
  await cachedPool('t', load);
  poolCache.get('t').at = Date.now() - POOL_CACHE_TTL_MS - 1;
  await cachedPool('t', load);
  assert.strictEqual(loads, 2, 'an expired entry is refetched');

  for (let i = 0; i < POOL_CACHE_MAX + 20; i++) await cachedPool('b' + i, load);
  assert.ok(poolCache.size <= POOL_CACHE_MAX);
});

test('searchFoods: signals may arrive as a promise and rank exactly like an array', async () => {
  const q = 'fairlife milk';
  const [milk, bar] = fairlifePool();
  const sig = foodMemory.nmCorrectionSignal([correction(q, bar, milk)], { query: q });
  const raw = (f) => ({ fdcId: f.fdcId, description: f.description, brandName: f.brand, dataType: 'Branded',
    foodNutrients: [{ nutrientId: 1008, value: f.nutrients.kcal }] });
  const stub = usdaStub((type) => (type === 'Branded' ? fairlifePool().map(raw) : []));
  const ids = (o) => o.body.foods.map((f) => [f.fdcId, f.score]);
  await withFetch(stub.impl, async () => {
    poolCache.clear(); const plain = await searchFoods(q);
    poolCache.clear(); const arr = await searchFoods(q, undefined, { signals: [sig] });
    poolCache.clear(); const prom = await searchFoods(q, undefined, { signals: Promise.resolve([sig]) });
    poolCache.clear(); const none = await searchFoods(q, undefined, { signals: Promise.resolve([]) });
    assert.deepEqual(ids(prom), ids(arr), 'promise signals == array signals');
    assert.deepEqual(ids(none), ids(plain), 'an empty signal list is plain ranking');
    assert.notDeepEqual(ids(arr), ids(plain), 'and the signal really applies');
  });
});

test('route: correction lookup runs alongside the USDA fetches, not ahead of them', async () => {
  poolCache.clear();
  const order = [];
  let releaseCorrections;
  const gate = new Promise((r) => { releaseCorrections = r; });
  const impl = async (url) => {
    const s = String(url);
    if (s.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1' }) };
    if (s.includes('/rest/v1/food_corrections')) {
      order.push('corrections:start'); await gate; order.push('corrections:end');
      return { ok: true, json: async () => [] };
    }
    order.push('usda');
    if (order.filter((x) => x === 'usda').length === 1) releaseCorrections();
    return { ok: true, json: async () => ({ foods: s.includes('Branded') ? [] : rawBanana() }) };
  };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await withFetch(impl, async () => {
    await require('./api/usda-search.js')({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { q: 'banana' } }, res);
  });
  assert.strictEqual(res.code, 200);
  assert.ok(order.indexOf('usda') < order.indexOf('corrections:end'),
    'USDA fetches start before the correction lookup has finished');
  assert.strictEqual(res.headers['Cache-Control'], 'private, max-age=60', 'no memory → plain cacheable response');
  assert.ok(res.body.foods.some((f) => f.fdcId === 501));
});

/* ── durable response cache (public.usda_search_cache) ─────────────────────
 * No network: Supabase REST and USDA are both stubbed. The route is loaded as
 * a FRESH module with a real-looking USDA key, because a DEMO_KEY response is
 * never stored. */
function freshRoute() {
  const saved = { usda: process.env.USDA_API_KEY, url: process.env.SUPABASE_URL, svc: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.USDA_API_KEY = 'test-usda-key';
  process.env.SUPABASE_URL = 'https://sb.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
  const id = require.resolve('./api/usda-search.js');
  const prior = require.cache[id];
  delete require.cache[id];
  const route = require('./api/usda-search.js');
  require.cache[id] = prior;                       // other tests keep their instance
  const restore = () => {
    for (const [k, env] of [['usda', 'USDA_API_KEY'], ['url', 'SUPABASE_URL'], ['svc', 'SUPABASE_SERVICE_ROLE_KEY']]) {
      if (saved[k] === undefined) delete process.env[env]; else process.env[env] = saved[k];
    }
  };
  return { route, restore };
}
function mockRes() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
// One stub for everything the route talks to. `opts`: cachedBody, corrections,
// authOk, usdaFail (dataType substring that should 503).
function world(opts) {
  const o = opts || {};
  const log = { usda: 0, cacheReads: [], cacheWrites: [], prunes: 0 };
  const impl = async (url, init) => {
    const s = String(url);
    const method = (init && init.method) || 'GET';
    if (s.includes('/auth/v1/user')) return o.authOk === false ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ id: 'u1' }) };
    if (s.includes('/rest/v1/food_corrections')) return { ok: true, json: async () => (o.corrections || []) };
    if (s.includes('/rest/v1/usda_search_cache')) {
      if (method === 'GET') {
        log.cacheReads.push({ url: s, auth: init.headers.Authorization });
        return { ok: true, json: async () => (o.cachedBody ? [{ body: o.cachedBody }] : []) };
      }
      if (method === 'POST') { log.cacheWrites.push({ url: s, row: JSON.parse(init.body), prefer: init.headers.Prefer, auth: init.headers.Authorization }); return { ok: true }; }
      if (method === 'DELETE') { log.prunes++; return { ok: true }; }
    }
    log.usda++;
    const u = new URL(s);
    if (o.usdaFail && u.searchParams.get('dataType').includes(o.usdaFail)) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ foods: u.searchParams.get('dataType') === 'Branded' ? [] : rawBanana() }) };
  };
  return { impl, log };
}
const call = (route, q, headers) => {
  const res = mockRes();
  return route({ method: 'GET', headers: Object.assign({ authorization: 'Bearer tok' }, headers || {}), query: { q } }, res).then(() => res);
};

test('response cache key: ranking fingerprint + normalized text; bounded', () => {
  const { responseCacheKey, RANKING_FINGERPRINT } = _internals;
  assert.match(RANKING_FINGERPRINT, /^[0-9a-f]{12}$/, 'derived from the ranking source');
  assert.strictEqual(responseCacheKey('  Chicken   BREAST '), RANKING_FINGERPRINT + '|chicken breast');
  assert.strictEqual(responseCacheKey('a'), null);
  assert.strictEqual(responseCacheKey('x'.repeat(81)), null);
  assert.strictEqual(responseCacheKey(null), null);
});

test('response cache: a miss searches USDA, then stores the body with the service key', async () => {
  const { route, restore } = freshRoute();
  const w = world({});
  try {
    const res = await withFetch(w.impl, () => call(route, 'Banana'));
    assert.strictEqual(res.code, 200);
    assert.ok(w.log.usda >= 2, 'USDA was queried');
    assert.strictEqual(w.log.cacheReads.length, 1);
    assert.match(w.log.cacheReads[0].url, /cache_key=eq\.[0-9a-f]{12}%7Cbanana&created_at=gte\./, 'keyed read, 24h window');
    assert.strictEqual(w.log.cacheReads[0].auth, 'Bearer svc-key', 'server credential, never the user token');
    assert.strictEqual(w.log.cacheWrites.length, 1);
    const wr = w.log.cacheWrites[0];
    assert.match(wr.prefer, /resolution=merge-duplicates/);
    assert.match(wr.row.cache_key, /\|banana$/);
    assert.deepEqual(wr.row.body, res.body, 'exactly what the user received');
    assert.strictEqual(res.headers['X-Food-Cache'], undefined);
  } finally { restore(); }
});

test('response cache: a hit returns the stored body with zero USDA requests', async () => {
  const { route, restore } = freshRoute();
  const stored = { foods: [{ fdcId: 501, description: 'Bananas, raw', score: 91 }] };
  const w = world({ cachedBody: stored });
  try {
    const res = await withFetch(w.impl, () => call(route, 'banana'));
    assert.strictEqual(res.code, 200);
    assert.deepEqual(res.body, stored);
    assert.strictEqual(w.log.usda, 0, 'no USDA request at all');
    assert.strictEqual(w.log.cacheWrites.length, 0);
    assert.strictEqual(res.headers['X-Food-Cache'], 'hit');
    assert.strictEqual(res.headers['Cache-Control'], 'private, max-age=60');
  } finally { restore(); }
});

test('response cache: never served without auth, never read without a token', async () => {
  const { route, restore } = freshRoute();
  const stored = { foods: [{ fdcId: 501, description: 'Bananas, raw' }] };
  try {
    const bad = world({ cachedBody: stored, authOk: false });
    const res = await withFetch(bad.impl, () => call(route, 'banana'));
    assert.strictEqual(res.code, 401);
    assert.ok(!res.body.foods, 'a rejected token gets no cached data');

    const anon = world({ cachedBody: stored });
    const res2 = mockRes();
    await withFetch(anon.impl, () => route({ method: 'GET', headers: {}, query: { q: 'banana' } }, res2));
    assert.strictEqual(anon.log.cacheReads.length, 0, 'no token → no cache read');
  } finally { restore(); }
});

test('response cache: contextual requests bypass it in both directions', async () => {
  const { route, restore } = freshRoute();
  const stored = { foods: [{ fdcId: 501, description: 'Bananas, raw' }] };
  try {
    // meal context (AI Quick Log item resolution): no read, no write
    const mx = require('./food-meal.js').nuSerializeMealContext({ v: 1, beverage: true, cookedExpected: false,
      animal: null, commodity: false, companionCats: ['carb'], role: 'beverage', mealType: null });
    assert.ok(route._internals.buildMealSignal({ headers: { 'x-meal-context': mx } }), 'the header really carries meal context');
    const m = world({ cachedBody: stored });
    const r = await withFetch(m.impl, () => call(route, 'banana', { 'x-meal-context': mx }));
    assert.strictEqual(r.code, 200);
    assert.strictEqual(m.log.cacheReads.length, 0);
    assert.strictEqual(m.log.cacheWrites.length, 0);
    assert.ok(m.log.usda >= 2);
    // a user correction for this query: the cached plain ranking must not be served or overwritten
    route._internals.poolCache.clear();              // (the meal-context call above warmed the pools)
    const [milk, bar] = fairlifePool();
    const c = world({ cachedBody: stored, corrections: [Object.assign({ status: 'active' }, correction('banana', bar, milk))] });
    const r2 = await withFetch(c.impl, () => call(route, 'banana'));
    assert.strictEqual(r2.code, 200);
    assert.strictEqual(r2.headers['Cache-Control'], 'private, no-store', 'the correction makes this request contextual');
    assert.ok(c.log.usda >= 2, 'contextual → fresh pools, not the stored body');
    assert.strictEqual(r2.headers['X-Food-Cache'], undefined);
    assert.notDeepEqual(r2.body, stored);
    assert.strictEqual(c.log.cacheWrites.length, 0, 'a personalised ranking is never stored');
  } finally { restore(); }
});

test('response cache: degraded, empty and oversized responses are never stored', async () => {
  const { route, restore } = freshRoute();
  try {
    const partial = world({ usdaFail: 'Branded' });       // one pool fails → partial answer
    const res = await withFetch(partial.impl, () => call(route, 'banana'));
    assert.strictEqual(res.code, 200, 'still served once');
    assert.strictEqual(partial.log.cacheWrites.length, 0, 'but not stored');
  } finally { restore(); }
  const { responseCacheable } = _internals;
  const ok = { status: 200, body: { foods: [{ fdcId: 1 }] } };
  assert.strictEqual(responseCacheable(Object.assign({}, ok, { degraded: true }), false), false);
  assert.strictEqual(responseCacheable(ok, true), false, 'contextual');
  assert.strictEqual(responseCacheable({ status: 200, body: { foods: [] } }, false), false, 'empty');
  assert.strictEqual(responseCacheable({ status: 502, body: {} }, false), false);
});

test('response cache: off without the service key; slow or failing storage is just a miss', async () => {
  const { responseCacheGet, responseCachePut, RESPONSE_CACHE_MAX_BYTES } = _internals;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY, savedUrl = process.env.SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let touched = 0;
    await withFetch(async () => { touched++; return { ok: true, json: async () => [] }; }, async () => {
      assert.strictEqual(await responseCacheGet('k|banana'), null);
      assert.strictEqual(await responseCachePut('k|banana', { foods: [{}] }), false);
    });
    assert.strictEqual(touched, 0, 'no key → no request');

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.SUPABASE_URL = 'https://sb.test';
    await withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }), async () => {
      assert.strictEqual(await responseCacheGet('k|banana'), null, 'error → miss');
    });
    await withFetch(async () => { throw new Error('network'); }, async () => {
      assert.strictEqual(await responseCacheGet('k|banana'), null, 'throw → miss');
      assert.strictEqual(await responseCachePut('k|banana', { foods: [{}] }), true, 'a failed write never throws');
    });
    const t0 = Date.now();
    await withFetch(() => new Promise(() => {}), async () => {
      assert.strictEqual(await responseCacheGet('k|banana'), null, 'hung read → miss');
    });
    assert.ok(Date.now() - t0 < 1500, 'and search is not held up by it');
    await withFetch(async () => ({ ok: true, json: async () => [{ body: { foods: [] } }] }), async () => {
      assert.strictEqual(await responseCacheGet('k|banana'), null, 'an empty stored body is not a hit');
    });
    let wrote = 0;
    await withFetch(async () => { wrote++; return { ok: true }; }, async () => {
      assert.strictEqual(await responseCachePut('k|banana', { foods: [{ x: 'y'.repeat(RESPONSE_CACHE_MAX_BYTES) }] }), false);
    });
    assert.strictEqual(wrote, 0, 'oversized bodies are not written');
  } finally {
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
  }
});

/* ── USDA quota visibility ───────────────────────────────────────────────── */
const { noteQuota, quotaState } = _internals;
const quotaRes = (limit, remaining) => ({ headers: { get: (k) => ({ 'x-ratelimit-limit': limit, 'x-ratelimit-remaining': remaining })[k.toLowerCase()] } });
function capture() { const lines = []; return { lines, log: (m) => lines.push('log ' + m), warn: (m) => lines.push('warn ' + m) }; }

test('quota: the limit is logged once per instance, again only if it changes', () => {
  quotaState.limit = null; quotaState.warnedAt = 0;
  const c = capture();
  assert.deepEqual(noteQuota(quotaRes('1000', '998'), c), { limit: 1000, remaining: 998 });
  noteQuota(quotaRes('1000', '997'), c);
  assert.deepEqual(c.lines, ['log usda-search quota: limit 1000 requests/hour, 998 remaining']);
  noteQuota(quotaRes('3600', '3599'), c);
  assert.strictEqual(c.lines.length, 2, 'a changed allowance is logged');
});

test('quota: a low-allowance warning fires under 10%, at most every five minutes', () => {
  quotaState.limit = 1000; quotaState.warnedAt = 0;
  const c = capture();
  noteQuota(quotaRes('1000', '101'), c);
  assert.strictEqual(c.lines.length, 0, 'above 10% is quiet');
  noteQuota(quotaRes('1000', '100'), c);
  noteQuota(quotaRes('1000', '40'), c);
  assert.deepEqual(c.lines, ['warn usda-search quota LOW: 100 of 1000 requests left this hour'], 'one warning, not one per request');
  quotaState.warnedAt = Date.now() - 6 * 60 * 1000;
  noteQuota(quotaRes('1000', '0'), c);
  assert.strictEqual(c.lines.length, 2);
});

test('quota: missing or malformed headers are ignored and never throw', () => {
  quotaState.limit = null; quotaState.warnedAt = 0;
  const c = capture();
  for (const r of [null, {}, { headers: {} }, quotaRes(undefined, undefined), quotaRes('abc', '5'), quotaRes('1000', 'x'),
    { headers: { get() { throw new Error('boom'); } } }]) {
    assert.strictEqual(noteQuota(r, c), null);
  }
  assert.deepEqual(c.lines, []);
});

test('quota: a search reads the headers of real USDA responses, and still works without them', async () => {
  poolCache.clear(); quotaState.limit = null; quotaState.warnedAt = 0;
  const impl = async (url) => ({ ok: true, headers: quotaRes('1000', '42').headers,
    json: async () => ({ foods: String(url).includes('Branded') ? [] : rawBanana() }) });
  const origLog = console.log, origWarn = console.warn; const seen = [];
  console.log = (m) => seen.push(String(m)); console.warn = (m) => seen.push(String(m));
  try {
    await withFetch(impl, async () => {
      const out = await searchFoods('banana');
      assert.strictEqual(out.status, 200);
    });
  } finally { console.log = origLog; console.warn = origWarn; }
  assert.ok(seen.some((m) => /usda-search quota: limit 1000/.test(m)));
  assert.ok(seen.some((m) => /quota LOW: 42 of 1000/.test(m)));
  assert.strictEqual(quotaState.limit, 1000);
});
