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

const { expandQuery, searchFoods } = require('./api/usda-search.js')._internals;
const HAS_KEY = !!process.env.USDA_API_KEY;

/* ── tier 1: query normalization (pure) ─────────────────────────────────── */

test('toast normalizes to bread, modifiers preserved', () => {
  assert.strictEqual(expandQuery('2 slices whole wheat toast').query, 'whole wheat bread');
  assert.strictEqual(expandQuery('sourdough toast').query, 'sourdough bread');
  assert.strictEqual(expandQuery('rye toast').query, 'rye bread');
  assert.strictEqual(expandQuery('toast').query, 'bread');
  assert.strictEqual(expandQuery('toasted bread').query, 'bread'); // rewrite + dedupe
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
