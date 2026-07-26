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
