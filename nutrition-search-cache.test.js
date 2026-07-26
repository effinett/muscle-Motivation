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
