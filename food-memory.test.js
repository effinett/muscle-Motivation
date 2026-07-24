// Unit tests for the shared Correction Memory core (food-memory.js, Phase 4.2.4).
// Pure, offline — no network, no DB, no globals. Run via `npm test` (node --test).
//
// Covers checkpoint 4.2.4a (contract, normalization, tiered matching, conflicts,
// bounded signal, capture guards, session serialize/parse/dedupe). Ranking-
// integration and resolver-parity live in nutrition-resolve.test.js /
// food-ranking.test.js; the persistent/server path is exercised in
// usda-search.test.js.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('./food-memory.js');

const req = (q) => ({ query: q });
// A chooser item as the resolver returns it (nuChoiceRows shape): choices[].raw
// is a trimmed USDA candidate.
function chooser(rawTop, rawPicked, more) {
  const choices = [{ raw: rawTop }, { raw: rawPicked }].concat(
    (more || []).map((r) => ({ raw: r })));
  return { needsChoice: true, parsed: { query: 'q' }, choices };
}
const F = (fdcId, description, brand) => ({ fdcId, description, brand: brand || '' });

/* ── identity + validation ───────────────────────────────────────────────── */

test('candidate key maps both trimmed and normalized shapes to nuFoodKey', () => {
  assert.equal(m.nmCandidateKey({ fdcId: 123, description: 'x' }), 'usda:123');
  assert.equal(m.nmCandidateKey({ usda_fdc_id: 123, name: 'x' }), 'usda:123');
  assert.equal(m.nmCandidateKey({ name: 'My Food' }), 'custom:my food');
  assert.equal(m.nmCandidateKey(null), null);
});

test('key validation rejects forged/oversized identities', () => {
  assert.ok(m.nmValidKey('usda:171287'));
  assert.ok(m.nmValidKey('custom:chicken breast'));
  assert.ok(!m.nmValidKey('usda:'));
  assert.ok(!m.nmValidKey('usda:12; drop table'));
  assert.ok(!m.nmValidKey('sql:1'));
  assert.ok(!m.nmValidKey('custom:' + 'x'.repeat(200)));
  assert.ok(!m.nmValidKey(42));
});

/* ── normalization ───────────────────────────────────────────────────────── */

test('normalized query absorbs case, punctuation, spacing, plural, order, fillers', () => {
  const base = m.nmNormQuery('fairlife protein bar');
  assert.equal(m.nmNormQuery('Fairlife  Protein  Bar'), base);   // case + spacing
  assert.equal(m.nmNormQuery('fairlife protein bars'), base);    // plural
  assert.equal(m.nmNormQuery('protein bar fairlife'), base);     // order
  assert.equal(m.nmNormQuery('fairlife, protein bar!'), base);   // punctuation
  assert.equal(m.nmNormQuery('organic fairlife protein bar'), base); // filler dropped
  assert.equal(m.nmNormQuery('2 fairlife protein bar'), base);   // leading quantity dropped
});

/* ── tiered matching ─────────────────────────────────────────────────────── */

function mem(q, correctedKey, incorrectKey) {
  return {
    status: 'active', raw_query: q, norm_query: m.nmNormQuery(q),
    intent_key: m.nmIntentKey(q), corrected_key: correctedKey || 'usda:2',
    incorrect_key: incorrectKey || 'usda:1', reinforcement_count: 1,
  };
}

test('exact tier: same meaningfully-normalized query', () => {
  assert.equal(m.nmMatch(mem('fairlife protein bar'), req('Fairlife Protein Bar')).tier, 'exact');
  assert.equal(m.nmMatch(mem('fairlife protein bar'), req('fairlife protein bars')).tier, 'exact');
});

test('normalized tier: compatible prep added, weaker than exact', () => {
  assert.equal(m.nmMatch(mem('chicken breast'), req('chicken breast cooked')).tier, 'normalized');
});

test('intent tier: anchored memory generalizes to a more specific query', () => {
  assert.equal(m.nmMatch(mem('fairlife protein bar'), req('fairlife caramel protein bar')).tier, 'intent');
});

test('conflict: different brand blocks generalization', () => {
  const r = m.nmMatch(mem('fairlife protein bar'), req('quest protein bar'));
  assert.equal(r.tier, null);
  assert.equal(r.conflict, 'brand');
});

test('conflict: different prep blocks generalization (cooked vs raw)', () => {
  const r = m.nmMatch(mem('chicken breast cooked'), req('chicken breast raw'));
  assert.equal(r.tier, null);
  assert.equal(r.conflict, 'prep');
});

test('conflict: different product type blocks generalization (bar vs milk)', () => {
  const r = m.nmMatch(mem('fairlife protein bar'), req('fairlife whole milk'));
  assert.equal(r.tier, null);
  assert.equal(r.conflict, 'product');
});

test('conflict: different base food blocks generalization (chicken vs turkey)', () => {
  const r = m.nmMatch(mem('chicken breast cooked'), req('turkey breast cooked'));
  assert.equal(r.tier, null);
  assert.equal(r.conflict, 'base');
});

test('brand-specific memory never collapses onto the brandless broad query', () => {
  assert.equal(m.nmMatch(mem('fairlife protein bar'), req('protein bar')).tier, null);
});

test('specific correction does not generalize UP to a broader query', () => {
  // "fairlife chocolate protein bar" corrected → searching bare "protein bar"
  // must not fire it (memory is not a subset of the query).
  assert.equal(m.nmMatch(mem('fairlife chocolate protein bar'), req('protein bar')).tier, null);
});

test('adding a derivative form blocks intent generalization (breaded)', () => {
  assert.equal(m.nmMatch(mem('chicken breast'), req('breaded chicken breast')).tier, null);
});

test('generic (unanchored) correction never reaches the intent tier', () => {
  // "banana" has no brand and no product form → it cannot generalize even when a
  // more specific query adds a product form ("banana bread"): that is a new food.
  assert.equal(m.nmMatch(mem('banana'), req('banana bread')).tier, null);
});

test('same prep class (grilled≡cooked) is compatible, matching normalized', () => {
  // grilled and cooked collapse to the same prep state in food-core, so the base
  // is unchanged — a compatible qualifier, not a conflict.
  assert.equal(m.nmMatch(mem('chicken breast cooked'), req('grilled chicken breast cooked')).tier, 'normalized');
});

/* ── contribution bounds ─────────────────────────────────────────────────── */

test('boost ordering: exact > normalized > intent', () => {
  const e = m.nmContribution('exact', 1);
  const n = m.nmContribution('normalized', 1);
  const i = m.nmContribution('intent', 1);
  assert.ok(e > n && n > i && i > 0);
});

test('reinforcement is bounded and monotonic, capped by totalCap', () => {
  const one = m.nmContribution('exact', 1);
  const many = m.nmContribution('exact', 1000);
  assert.ok(many > one);
  assert.ok(many <= m.NU_CORRECTION.totalCap);
  // multiplier itself never exceeds cap
  assert.ok(m.nmReinforceMult(1e9) <= m.NU_CORRECTION.reinforce.cap);
});

test('stale memory decays to the configured factor', () => {
  const now = Date.now();
  const old = now - m.NU_CORRECTION.stale.ms - 1000;
  const fresh = m.nmContribution('exact', 1, new Date(now).toISOString(), now);
  const stale = m.nmContribution('exact', 1, new Date(old).toISOString(), now);
  assert.ok(stale < fresh);
  assert.equal(Math.round(stale / fresh * 100) / 100, m.NU_CORRECTION.stale.factor);
});

test('correction contribution stays below the hard safety floors', () => {
  // implausibleKcal (-2000) / emptyMacroPanel (-1500) must always dominate.
  assert.ok(m.NU_CORRECTION.totalCap < 2000);
  assert.ok(m.NU_CORRECTION.totalCap < Math.abs(-1500) + m.NU_CORRECTION.boost.exact); // documented margin
});

/* ── ranking signal ──────────────────────────────────────────────────────── */

test('signal boosts the corrected food, demotes the rejected food, ignores others', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const sig = m.nmCorrectionSignal([e], req('fairlife protein bar'));
  assert.equal(sig(F(2, 'x')), m.nmContribution('exact', 1));  // corrected → boost
  assert.equal(sig(F(1, 'x')), m.NU_CORRECTION.demoteIncorrect); // rejected → demote
  assert.equal(sig(F(99, 'x')), 0);                              // unrelated → nothing
});

test('signal never fabricates: absent corrected candidate yields no phantom score', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const sig = m.nmCorrectionSignal([e], req('fairlife protein bar'));
  // The signal only returns numbers for candidates it is asked about; a corrected
  // food that is not in the pool is simply never passed in — nothing to assert
  // beyond: unrelated candidates score 0.
  assert.equal(sig(F(3, 'y')), 0);
});

test('intent-tier boost is weaker than an exact-tier boost for the same food', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const exactSig = m.nmCorrectionSignal([e], req('fairlife protein bar'));
  const intentSig = m.nmCorrectionSignal([e], req('fairlife caramel protein bar'));
  assert.ok(intentSig(F(2, 'x')) < exactSig(F(2, 'x')));
  assert.ok(intentSig(F(2, 'x')) > 0);
});

test('demotion applies only on same-query (exact/normalized), not on generalization', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const intentSig = m.nmCorrectionSignal([e], req('fairlife caramel protein bar'));
  assert.equal(intentSig(F(1, 'x')), 0); // rejected food not demoted on a generalized match
});

test('conflicting memory contributes nothing', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const sig = m.nmCorrectionSignal([e], req('fairlife whole milk')); // product conflict
  assert.equal(sig(F(2, 'x')), 0);
  assert.equal(sig(F(1, 'x')), 0);
});

test('superseded/deactivated memories are ignored by the signal', () => {
  const e = Object.assign(mem('fairlife protein bar', 'usda:2'), { status: 'superseded' });
  const sig = m.nmCorrectionSignal([e], req('fairlife protein bar'));
  assert.equal(sig(F(2, 'x')), 0);
});

test('malformed signal output can never poison ranking (finite numbers only)', () => {
  const e = mem('fairlife protein bar', 'usda:2', 'usda:1');
  const sig = m.nmCorrectionSignal([e], req('fairlife protein bar'));
  const v = sig(F(2, 'x'));
  assert.ok(typeof v === 'number' && isFinite(v));
});

/* ── explicit-correction capture ─────────────────────────────────────────── */

test('capture: picking a non-top chooser candidate is an explicit correction', () => {
  const it = chooser(F(1, 'Milk', 'Fairlife'), F(2, 'Bar', 'Fairlife'));
  assert.ok(m.nmIsExplicitCorrection(it, 1));
});

test('capture: confirming the top hit (index 0) is NOT a correction', () => {
  const it = chooser(F(1, 'Milk'), F(2, 'Bar'));
  assert.ok(!m.nmIsExplicitCorrection(it, 0));
});

test('capture: an auto-resolved / clarification / single-choice item is NOT a correction', () => {
  assert.ok(!m.nmIsExplicitCorrection({ needsClarification: true, choices: [{ raw: F(1, 'a') }, { raw: F(2, 'b') }] }, 1));
  assert.ok(!m.nmIsExplicitCorrection({ food: F(1, 'a') }, 1)); // resolved item
  assert.ok(!m.nmIsExplicitCorrection(chooser(F(1, 'a'), F(1, 'a')), 1)); // same identity twice
  assert.ok(!m.nmIsExplicitCorrection({ needsChoice: true, choices: [{ raw: F(1, 'a') }] }, 0)); // one option
});

test('event build produces a valid, data-minimal, versioned record', () => {
  const it = chooser(F(1, 'Fairlife 2% Milk', 'Fairlife'), F(2, 'Fairlife Nutrition Bar', 'Fairlife'));
  const ev = m.nmBuildCorrectionEvent({ request: req('fairlife protein bar'), choices: it.choices, chosenIndex: 1 });
  assert.equal(ev.schema_version, m.NU_CORRECTION.SCHEMA_VERSION);
  assert.equal(ev.corrected_key, 'usda:2');
  assert.equal(ev.incorrect_key, 'usda:1');
  assert.equal(ev.norm_query, m.nmNormQuery('fairlife protein bar'));
  assert.equal(ev.intent_key, 'fairlife|bar');
  assert.equal(ev.reinforcement_count, 1);
  assert.equal(ev.status, 'active');
  // data minimization: only name+brand snapshots, no nutrient/raw payload
  assert.deepEqual(Object.keys(ev.corrected_meta).sort(), ['brand', 'name']);
});

/* ── session store, transport, dedupe ────────────────────────────────────── */

test('session add: reinforces an equivalent correction, bumping the count', () => {
  const a = m.nmBuildCorrectionEvent({ request: req('fairlife protein bar'), choices: chooser(F(1, 'a'), F(2, 'b')).choices, chosenIndex: 1 });
  let store = m.nmSessionAdd([], a);
  store = m.nmSessionAdd(store, a);
  assert.equal(store.length, 1);
  assert.equal(store[0].reinforcement_count, 2);
});

test('session add: contradictory correction supersedes the old one', () => {
  const a = m.nmBuildCorrectionEvent({ request: req('yogurt'), choices: chooser(F(1, 'a'), F(2, 'b')).choices, chosenIndex: 1 });
  const b = m.nmBuildCorrectionEvent({ request: req('yogurt'), choices: chooser(F(1, 'a'), F(3, 'c')).choices, chosenIndex: 1 });
  let store = m.nmSessionAdd([], a);
  store = m.nmSessionAdd(store, b);
  // only the new (active) correction survives in the active store
  assert.equal(store.length, 1);
  assert.equal(store[0].corrected_key, 'usda:3');
});

test('session store is bounded to maxSessionRecords', () => {
  let store = [];
  for (let i = 0; i < m.NU_CORRECTION.limits.maxSessionRecords + 5; i++) {
    store = m.nmSessionAdd(store, m.nmBuildCorrectionEvent({
      request: req('food ' + i), choices: chooser(F(1, 'a'), F(100 + i, 'b')).choices, chosenIndex: 1,
    }));
  }
  assert.ok(store.length <= m.NU_CORRECTION.limits.maxSessionRecords);
});

test('select relevant filters the session store to the current query', () => {
  const bar = m.nmBuildCorrectionEvent({ request: req('fairlife protein bar'), choices: chooser(F(1, 'a'), F(2, 'b')).choices, chosenIndex: 1 });
  const oats = m.nmBuildCorrectionEvent({ request: req('oatmeal'), choices: chooser(F(3, 'c'), F(4, 'd')).choices, chosenIndex: 1 });
  const rel = m.nmSelectRelevant([bar, oats], req('Fairlife protein bar'));
  assert.equal(rel.length, 1);
  assert.equal(rel[0].corrected_key, 'usda:2');
});

test('serialize → parse round-trips a valid, bounded context', () => {
  const rec = m.nmBuildCorrectionEvent({ request: req('fairlife protein bar'), choices: chooser(F(1, 'a'), F(2, 'b')).choices, chosenIndex: 1 });
  const parsed = m.nmParseContext(m.nmSerializeContext([rec]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].corrected_key, 'usda:2');
  assert.equal(parsed[0].norm_query, rec.norm_query);
  assert.equal(parsed[0].origin, 'session');
});

test('parse rejects malformed / oversized / forged context safely (→ empty)', () => {
  assert.deepEqual(m.nmParseContext('not json'), []);
  assert.deepEqual(m.nmParseContext(''), []);
  assert.deepEqual(m.nmParseContext('{"not":"array"}'), []);
  assert.deepEqual(m.nmParseContext('x'.repeat(m.NU_CORRECTION.limits.maxPayloadChars + 1)), []);
  // forged corrected key is dropped
  const forged = JSON.stringify([{ v: 1, q: 'x', nq: 'x', ck: 'evil; drop', r: 1 }]);
  assert.deepEqual(m.nmParseContext(forged), []);
  // wrong schema version is dropped
  const badV = JSON.stringify([{ v: 999, q: 'x', nq: 'x', ck: 'usda:2', r: 1 }]);
  assert.deepEqual(m.nmParseContext(badV), []);
});

test('parse clamps a claimed reinforcement count (no unbounded influence)', () => {
  const huge = JSON.stringify([{ v: 1, q: 'x', nq: 'x', ck: 'usda:2', r: 1e12 }]);
  const parsed = m.nmParseContext(huge);
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0].reinforcement_count <= m.NU_CORRECTION.limits.maxReinforcement);
});

test('dedupe merges equivalent persistent + session copies (no double counting)', () => {
  const persistent = { norm_query: 'bar fairlife protein', corrected_key: 'usda:2', reinforcement_count: 3, last_used_at: '2026-01-01T00:00:00.000Z', origin: 'persistent' };
  const session = { norm_query: 'bar fairlife protein', corrected_key: 'usda:2', reinforcement_count: 1, last_used_at: '2026-07-01T00:00:00.000Z', origin: 'session', incorrect_key: 'usda:1' };
  const merged = m.nmDedupeMemories([persistent, session]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].reinforcement_count, 3);          // max
  assert.equal(merged[0].last_used_at, '2026-07-01T00:00:00.000Z'); // freshest
  assert.equal(merged[0].incorrect_key, 'usda:1');         // filled from whichever had it
});

test('dedupe keeps distinct corrections separate', () => {
  const a = { norm_query: 'q1', corrected_key: 'usda:2' };
  const b = { norm_query: 'q2', corrected_key: 'usda:3' };
  const c = { norm_query: 'q1', corrected_key: 'usda:9' }; // same query, different food
  assert.equal(m.nmDedupeMemories([a, b, c]).length, 3);
});
