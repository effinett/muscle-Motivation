// Regression: nuUsdaSearch browser-cache behavior for correction context
// (Phase 4.2.4 hardening). Run via `npm test` (node --test). No network.
//
// A plain (no-correction) search response is cached `private, max-age=60`, so a
// correction-context request MUST bypass the browser cache (`cache: 'no-store'`)
// — otherwise, right after a correction, the identical query would be served the
// stale pre-correction ranking (browser cache is keyed by URL and ignores the
// X-Correction-Context header). Plain searches must keep the short cache.
//
// Loads the full client stack (food-core → food-ranking → food-memory →
// food-meal → nutrition.js), same order as the pages, with a capturing fetch stub.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/* ── minimal browser globals ─────────────────────────────────────────── */
global.window = global;
global.document = { getElementById: () => null, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };

let lastFetchOpts = null;
global.fetch = async (u, opts) => {
  if (String(u).startsWith('/api/usda-search')) {
    lastFetchOpts = opts || {};
    return { ok: true, json: async () => ({ foods: [] }) };
  }
  throw new Error('unexpected fetch ' + u);
};
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched by search'); },
};

// Page load order: shared core, ranking, memory, meal, then nutrition.js.
['food-core.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});

function seedCorrection(query) {
  const ev = nmBuildCorrectionEvent({
    request: { query: query },
    choices: [
      { raw: { fdcId: 1, description: 'PROTEIN BAR', brand: 'X' } },
      { raw: { fdcId: 2, description: "PROTEIN BAR, S'MORES", brand: 'X' } },
    ],
    chosenIndex: 1,
  });
  return nmSessionAdd([], ev);
}

test('nuUsdaSearch: no correction context → keeps default cache (no override)', async () => {
  nu_corrections = [];
  lastFetchOpts = null;
  await nuUsdaSearch('banana');
  assert.ok(lastFetchOpts, 'fetch was called');
  assert.strictEqual(lastFetchOpts.cache, undefined, 'plain search must NOT force no-store (keeps max-age=60)');
  assert.ok(!(lastFetchOpts.headers || {})['X-Correction-Context'], 'no correction header when store empty');
});

test('nuUsdaSearch: relevant correction context → cache no-store + header attached', async () => {
  nu_corrections = seedCorrection('protein bar');
  lastFetchOpts = null;
  await nuUsdaSearch('protein bar');
  assert.strictEqual(lastFetchOpts.cache, 'no-store', 'correction-context request must bypass the browser cache');
  assert.ok((lastFetchOpts.headers || {})['X-Correction-Context'], 'correction header is attached');
});

test('nuUsdaSearch: correction present but NOT relevant to this query → default cache', async () => {
  nu_corrections = seedCorrection('protein bar');   // memory for "protein bar"…
  lastFetchOpts = null;
  await nuUsdaSearch('chicken breast');             // …unrelated query → no header, no override
  assert.strictEqual(lastFetchOpts.cache, undefined);
  assert.ok(!(lastFetchOpts.headers || {})['X-Correction-Context']);
});

test('nuUsdaSearch: signal option is forwarded (options-object contract)', async () => {
  // Phase 4.2.6 changed the 2nd arg from a bare AbortSignal to an options object
  // { signal?, mealContext? } so the resolver can attach meal context. The manual
  // search path passes { signal }, and it must still reach fetch.
  nu_corrections = [];
  lastFetchOpts = null;
  const ctrl = { aborted: false };
  await nuUsdaSearch('banana', { signal: ctrl });
  assert.strictEqual(lastFetchOpts.signal, ctrl, 'abort signal still passed through');
});

test('nuUsdaSearch: meal context → X-Meal-Context header + cache no-store (Phase 4.2.6)', async () => {
  nu_corrections = [];
  lastFetchOpts = null;
  // A valid, actionable per-item projection (a beverage item within a meal).
  const projection = { v: 1, beverage: true, cookedExpected: false, animal: null,
    commodity: false, companionCats: ['carb'], role: 'beverage', mealType: null };
  await nuUsdaSearch('coke', { mealContext: projection });
  assert.ok((lastFetchOpts.headers || {})['X-Meal-Context'], 'meal header is attached');
  assert.strictEqual(lastFetchOpts.cache, 'no-store', 'meal-context request must bypass the browser cache');
});

test('nuUsdaSearch: no meal context → no X-Meal-Context header, default cache', async () => {
  nu_corrections = [];
  lastFetchOpts = null;
  await nuUsdaSearch('coke', {});
  assert.ok(!(lastFetchOpts.headers || {})['X-Meal-Context'], 'no meal header without a projection');
  assert.strictEqual(lastFetchOpts.cache, undefined, 'plain search keeps the short cache');
});

/* ── session query cache (search latency) ──────────────────────────────────
 * A plain search answered moments ago is served from memory; anything carrying
 * correction or meal context always reaches the server. */
function countingFetch(foods) {
  const state = { calls: 0 };
  const orig = global.fetch;
  global.fetch = async (u, opts) => {
    if (String(u).startsWith('/api/usda-search')) {
      state.calls++;
      lastFetchOpts = opts || {};
      return { ok: true, json: async () => ({ foods: foods }) };
    }
    throw new Error('unexpected fetch ' + u);
  };
  state.restore = () => { global.fetch = orig; };
  return state;
}
const oatPool = () => [{ fdcId: 77, description: 'Oats, rolled', dataType: 'SR Legacy', nutrients: { kcal: 379 } }];

test('query cache: a repeated plain query is served from memory (one request)', async () => {
  nu_corrections = [];
  const f = countingFetch(oatPool());
  try {
    const a = await nuUsdaSearch('rolled oats');
    const b = await nuUsdaSearch('  Rolled Oats ');           // case/space-insensitive key
    assert.strictEqual(f.calls, 1, 'second identical query costs no request');
    assert.deepStrictEqual(b, a);
    b[0].description = 'mutated';
    const c = await nuUsdaSearch('rolled oats');
    assert.strictEqual(c[0].description, 'Oats, rolled', 'readers get copies, never the cached rows');
  } finally { f.restore(); }
});

test('query cache: correction context always bypasses the cache', async () => {
  nu_corrections = [];
  const f = countingFetch(oatPool());
  try {
    await nuUsdaSearch('protein bar');                         // cached as a plain query
    nu_corrections = seedCorrection('protein bar');            // user corrects it
    await nuUsdaSearch('protein bar');
    assert.strictEqual(f.calls, 2, 'a fresh correction must reach the server');
    assert.strictEqual(lastFetchOpts.cache, 'no-store');
  } finally { f.restore(); nu_corrections = []; }
});

test('query cache: meal-context requests are neither served from nor stored in it', async () => {
  nu_corrections = [];
  const f = countingFetch(oatPool());
  const projection = { v: 1, beverage: true, cookedExpected: false, animal: null,
    commodity: false, companionCats: ['carb'], role: 'beverage', mealType: null };
  try {
    await nuUsdaSearch('iced latte', { mealContext: projection });
    await nuUsdaSearch('iced latte', { mealContext: projection });
    assert.strictEqual(f.calls, 2, 'contextual responses are never cached');
    await nuUsdaSearch('iced latte');
    assert.strictEqual(f.calls, 3, 'and never seed the plain-query cache');
  } finally { f.restore(); }
});

test('query cache: empty results are not cached; entries expire and are bounded', async () => {
  nu_corrections = [];
  const empty = countingFetch([]);
  try {
    await nuUsdaSearch('zzqx'); await nuUsdaSearch('zzqx');
    assert.strictEqual(empty.calls, 2, 'a zero-result answer is always re-asked');
  } finally { empty.restore(); }

  nuQueryCachePut('stale thing', oatPool());
  nu_queryCache['stale thing'].at = Date.now() - NU_QUERY_CACHE_TTL - 1;
  assert.strictEqual(nuQueryCacheGet('stale thing'), null, 'expired entries are not served');

  for (let i = 0; i < NU_QUERY_CACHE_MAX + 15; i++) nuQueryCachePut('bulk ' + i, oatPool());
  assert.ok(Object.keys(nu_queryCache).length <= NU_QUERY_CACHE_MAX, 'cache stays bounded');
  assert.strictEqual(nuQueryCacheGet('bulk 0'), null, 'oldest entries are evicted first');
});
