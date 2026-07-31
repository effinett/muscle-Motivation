// Phase 4.2.9 — deterministic execution engine.
//
// Wires the EXACT production pure seams together the way the running app does,
// so the eval measures production behavior — never a re-implementation:
//
//   • retrieval/ranking : /api/usda-search's authoritative boundary is
//     rankFoodCandidates(query, rawPool, {signals}). The resolver NEVER reranks
//     (trusts foods[0]). We rank the canned pool exactly once, here — mirroring
//     the server — and everything downstream consumes that ordered pool.
//   • resolution/portion : food-core.js nuCreateResolver over a source that
//     returns the already-ranked pool + canned USDA portions (same two-tier
//     source contract the benchmark runner uses).
//   • confidence          : food-core.js nuAssessConfidence on the same ordered
//     pool the resolver saw.
//   • correction signal    : food-memory.js nmCorrectionSignal (persistent-style
//     records) through the options.signals seam — the only way correction memory
//     reaches ranking, identical to /api/usda-search.
//   • meal signal          : food-meal.js nuBuildMealContext → nuMealItemProjection
//     → nuMealSignal through the SAME seam (faithful client→server path).
//
// Pure + offline + deterministic: no network, no DB, no keys, no writes.

'use strict';

const core = require('../food-core.js');
const ranking = require('../food-ranking.js');
const memory = require('../food-memory.js');
const mealmod = require('../food-meal.js');
const portion = require('../food-portion.js');
const display = require('../food-display.js');
const { POOLS, PORTIONS } = require('./pools.js');

function clone(pool) { return (pool || []).map((x) => Object.assign({}, x)); }

function normalizeInput(input) {
  return Object.assign(
    { text: '', query: '', brand: null, quantity: 1, unit: null, grams: null },
    input || {},
  );
}

// The raw retrieved pool for a case (pre-ranking) — models "what USDA returned".
function rawPool(c) {
  const key = c.pool || (c.input && c.input.query) || '';
  return clone(POOLS[key]);
}

// Build the correction signal for a case, from persistent-style correction rows
// (same shape the benchmark runner's rankedCorrectionSource builds).
function correctionSignal(c) {
  if (!Array.isArray(c.corrections) || !c.corrections.length) return null;
  const recs = c.corrections.map((cor) => {
    const q = cor.query || c.input.query;
    return {
      status: cor.status || 'active',
      raw_query: q,
      norm_query: memory.nmNormQuery(q),
      intent_key: memory.nmIntentKey(q),
      corrected_key: cor.corrected_key,
      incorrect_key: cor.incorrect_key || null,
      reinforcement_count: cor.reinforcement_count || 1,
      last_used_at: cor.last_used_at || new Date().toISOString(),
    };
  });
  return memory.nmCorrectionSignal(recs, c.input);
}

// Build the meal signal for a case (either an explicit projection or the full
// client builder over the whole meal — the faithful end-to-end path).
function mealSignal(c) {
  if (!c.meal) return null;
  let proj = c.meal.projection;
  if (!proj && Array.isArray(c.meal.items)) {
    const ctx = mealmod.nuBuildMealContext(c.meal.text || c.input.query || '', c.meal.items,
      { mealType: c.meal.mealType || null });
    proj = mealmod.nuMealItemProjection(ctx, c.meal.index || 0);
  }
  return proj ? mealmod.nuMealSignal(proj) : null;
}

// The server-equivalent ranked pool: rank the raw pool exactly once through the
// authoritative ranker, with any correction/meal signals injected via the seam.
function rankedPool(c) {
  const raw = rawPool(c);
  const signals = [correctionSignal(c), mealSignal(c)].filter(Boolean);
  const opts = signals.length ? { signals } : undefined;
  return ranking.rankFoodCandidates((c.input && c.input.query) || '', raw, opts).foods;
}

// Resolve a case through the shared resolver over the ranked pool + canned
// portions — the resolver consumes foods[0]/order, never reranks.
async function resolve(c) {
  const foods = rankedPool(c);
  const src = {
    search: async () => foods,
    portions: async (id) => clone(PORTIONS[id]),
  };
  const resolver = core.nuCreateResolver(src);
  const r = await resolver.resolveItem(normalizeInput(c.input));
  return { result: r, ranked: foods };
}

// Assess confidence on the same ordered pool (fixture-tier, offline).
function assessConfidence(c, policy) {
  const foods = rankedPool(c);
  return core.nuAssessConfidence(normalizeInput(c.input), foods, policy);
}

module.exports = {
  clone,
  normalizeInput,
  rawPool,
  rankedPool,
  correctionSignal,
  mealSignal,
  resolve,
  assessConfidence,
  // re-exported pure seams so scorers never re-require paths
  core, ranking, memory, mealmod, portion, display,
};
