// Resolve benchmark runner (Phase 4.2.1d) — scores the SHARED resolver
// (food-core.js nuCreateResolver) against benchmarks/resolve-cases.jsonl.
//
//   node benchmarks/run-resolve.js            # report, always exits 0
//   node benchmarks/run-resolve.js --strict   # exit 1 on any unexpected failure
//
// Two tiers, selected per case by its "tier" field:
//   • fixture — deterministic canned pools (benchmarks/fixtures.js). No
//     network, no keys. CI-safe.
//   • live    — the REAL production search (api/usda-search searchFoods) +
//     REAL USDA detail portions. Needs USDA_API_KEY (env or .env.local);
//     live cases are SKIPPED without it.
//
// Division of labor vs the regression suite (nutrition-resolve.test.js):
// regression = behavior Effi approved, must NEVER break, runs in npm test;
// benchmark = the score to improve — 4.2.2+ ranking work optimizes against
// it, 4.2.7 grows it to thousands of cases. PROMOTION RULE (one-way): when a
// case's behavior is deliberately fixed, add an exact regression test for it;
// nothing ever moves from regression down to benchmark.
//
// known_fail cases document today's known gaps (e.g. ranking issues logged
// during live smokes). They don't count against the pass rate — but if one
// STARTS passing, the runner flags it loudly so it gets promoted.
//
// Case format (one JSON object per line):
//   { id, tier: "fixture"|"live", input: ResolveRequest,
//     expect: { fdcId?, servings?, grams?, serving_description?,
//               serving_description_regex?, perUnit_kcal?, kcal_total?,
//               unmatched?, needsChoice?, choices?, not_needsChoice?,
//               unitUnresolved?, not_unitUnresolved?, group?,
//               description_regex?, top_regex?, top_not_regex?,
//               confidence?: { disposition?, level?, material?, ambiguity?[],
//                              alternatives?, reason?, clarificationType?,
//                              policy? } },  // Phase 4.2.3: asserts the shared
//                 nuAssessConfidence verdict on the ordered pool the resolver
//                 saw — additive, independent of the resolved fields above.
//                 `policy` (e.g. { targetedClarification: true }) exercises the
//                 DORMANT clarification contract; omit it for production default.
//     known_fail?, tags: [...], notes? }

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// .env.local (KEY=value lines) — same loader convention as usda-search.test.js.
(function loadEnvLocal() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env.local — fine */ }
})();

const core = require('../food-core.js');
const ranking = require('../food-ranking.js');
const memory = require('../food-memory.js');
const { FIXTURE_SEARCHES, FIXTURE_PORTIONS } = require('./fixtures.js');

const STRICT = process.argv.includes('--strict');
const HAS_KEY = !!process.env.USDA_API_KEY;

/* ── source adapters ───────────────────────────────────────────────────── */

const fixtureSource = {
  search: async (q) => FIXTURE_SEARCHES[q] || [],
  portions: async (id) => FIXTURE_PORTIONS[id] || [],
};

function liveSource() {
  const { searchFoods } = require('../api/usda-search.js')._internals;
  const { trimPortions } = require('../api/usda-food.js')._internals;
  const key = process.env.USDA_API_KEY;
  return {
    search: async (q) => {
      const out = await searchFoods(q);
      if (out.status !== 200) throw new Error('search upstream ' + out.status);
      return out.body.foods;
    },
    portions: async (fdcId) => {
      try {
        const r = await fetch('https://api.nal.usda.gov/fdc/v1/food/' +
          encodeURIComponent(fdcId) + '?api_key=' + encodeURIComponent(key));
        if (!r.ok) return [];
        return trimPortions(await r.json());
      } catch { return []; }               // same graceful fallback as the route
    },
  };
}

// A per-case fixture source that ranks the raw fixture pool exactly as the
// server does (rankFoodCandidates), optionally with a correction-memory signal
// built from the case's `corrections`. This is where Phase 4.2.4 benchmark
// cases exercise correction RANKING offline: the resolver still never reranks —
// it consumes this already-ranked pool, mirroring /api/usda-search.
function rankedCorrectionSource(c) {
  const raw = FIXTURE_SEARCHES[c.input.query] || [];
  let options;
  if (Array.isArray(c.corrections) && c.corrections.length) {
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
    options = { signals: [memory.nmCorrectionSignal(recs, c.input)] };
  }
  const foods = ranking.rankFoodCandidates(c.input.query, raw, options).foods;
  return { search: async () => foods, portions: async (id) => FIXTURE_PORTIONS[id] || [] };
}

/* ── expectation checks ────────────────────────────────────────────────── */

function check(expect, r) {
  const bad = [];
  const want = (name, got, wanted) => {
    if (got !== wanted) bad.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(wanted)}`);
  };
  if (expect.unmatched) { want('unmatched', !!r.unmatched, true); return bad; }
  if (expect.needsClarification) {
    want('needsClarification', !!r.needsClarification, true);
    if (expect.clarificationType && r.clarification)
      want('clarificationType', r.clarification.type, expect.clarificationType);
    return bad;
  }
  if (expect.needsChoice) {
    want('needsChoice', !!r.needsChoice, true);
    if (expect.choices != null && r.choices) want('choices', r.choices.length, expect.choices);
    if (expect.top_regex && r.choices && r.choices[0] &&
        !new RegExp(expect.top_regex, 'i').test(r.choices[0].name)) {
      bad.push(`top choice "${r.choices[0].name}" !~ /${expect.top_regex}/i`);
    }
    if (expect.top_not_regex && r.choices && r.choices[0] &&
        new RegExp(expect.top_not_regex, 'i').test(r.choices[0].name)) {
      bad.push(`top choice "${r.choices[0].name}" matches forbidden /${expect.top_not_regex}/i`);
    }
    return bad;
  }
  if (expect.not_needsChoice) want('not_needsChoice', !r.needsChoice, true);
  if (r.needsChoice || r.unmatched || r.needsClarification) {
    // resolved-field expectations can't be checked on an ask/unmatched outcome
    if (expect.top_not_regex && r.needsChoice && r.choices && r.choices[0] &&
        new RegExp(expect.top_not_regex, 'i').test(r.choices[0].name)) {
      bad.push(`top choice "${r.choices[0].name}" matches forbidden /${expect.top_not_regex}/i`);
      return bad;
    }
    if (Object.keys(expect).some((k) => !['top_not_regex', 'not_needsChoice'].includes(k))) {
      bad.push(`outcome was ${r.unmatched ? 'unmatched' : 'needsChoice'}, expected a resolved item`);
    }
    return bad;
  }
  if (expect.fdcId != null) want('fdcId', r.food.usda_fdc_id, expect.fdcId);
  if (expect.servings != null) want('servings', r.servings, expect.servings);
  if ('grams' in expect) want('grams', r.grams, expect.grams);
  if (expect.serving_description != null) want('serving_description', r.serving_description, expect.serving_description);
  if (expect.serving_description_regex &&
      !new RegExp(expect.serving_description_regex, 'i').test(r.serving_description || '')) {
    bad.push(`serving_description "${r.serving_description}" !~ /${expect.serving_description_regex}/i`);
  }
  if (expect.perUnit_kcal != null) want('perUnit_kcal', r.perUnit.calories, expect.perUnit_kcal);
  if (expect.kcal_total != null) {
    want('kcal_total', core.nuScaleMacros(r.perUnit, r.servings).calories, expect.kcal_total);
  }
  if (expect.unitUnresolved) want('unitUnresolved', !!r.unitUnresolved, true);
  if (expect.not_unitUnresolved) want('not_unitUnresolved', !r.unitUnresolved, true);
  if (expect.group) want('group', r.food.group, expect.group);
  if (expect.description_regex &&
      !new RegExp(expect.description_regex, 'i').test(r.food.description || '')) {
    bad.push(`description "${r.food.description}" !~ /${expect.description_regex}/i`);
  }
  if (expect.top_not_regex &&
      new RegExp(expect.top_not_regex, 'i').test(r.food.description || '')) {
    bad.push(`description "${r.food.description}" matches forbidden /${expect.top_not_regex}/i`);
  }
  return bad;
}

// Phase 4.2.3 confidence-contract check: exercise nuAssessConfidence directly on
// the ordered pool. Additive — runs only when a case carries expect.confidence.
function checkConfidence(want, verdict) {
  const bad = [];
  if (want.disposition && verdict.disposition !== want.disposition)
    bad.push(`confidence.disposition: got ${verdict.disposition}, want ${want.disposition}`);
  if (want.level && verdict.level !== want.level)
    bad.push(`confidence.level: got ${verdict.level}, want ${want.level}`);
  if ('material' in want && !!verdict.material !== !!want.material)
    bad.push(`confidence.material: got ${verdict.material}, want ${want.material}`);
  if (want.alternatives != null && verdict.alternatives.length !== want.alternatives)
    bad.push(`confidence.alternatives: got ${verdict.alternatives.length}, want ${want.alternatives}`);
  for (const a of want.ambiguity || []) if (!verdict.ambiguity.includes(a))
    bad.push(`confidence.ambiguity missing "${a}" (got [${verdict.ambiguity}])`);
  if (want.reason && !verdict.reasons.some((r) => r.code === want.reason))
    bad.push(`confidence.reason "${want.reason}" not in [${verdict.reasons.map((r) => r.code)}]`);
  if (want.clarificationType &&
      (!verdict.clarification || verdict.clarification.type !== want.clarificationType))
    bad.push(`confidence.clarificationType: got ${verdict.clarification && verdict.clarification.type}, want ${want.clarificationType}`);
  return bad;
}

/* ── run ───────────────────────────────────────────────────────────────── */

function normalizeInput(input) {
  return Object.assign({ text: '', query: '', brand: null, quantity: 1, unit: null, grams: null }, input);
}

(async () => {
  const lines = fs.readFileSync(path.join(__dirname, 'resolve-cases.jsonl'), 'utf8')
    .split('\n').filter((l) => l.trim());
  const cases = lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.error(`resolve-cases.jsonl line ${i + 1}: bad JSON — ${e.message}`); process.exit(2); }
  });

  const liveSrc = HAS_KEY ? liveSource() : null;
  const fixtureResolver = core.nuCreateResolver(fixtureSource);
  const liveResolver = liveSrc ? core.nuCreateResolver(liveSrc) : null;

  let pass = 0, fail = 0, knownFail = 0, nowPassing = 0, skipped = 0;
  const failures = [];
  const tagStats = {};   // tag → { pass, fail }

  for (const c of cases) {
    // Correction-memory cases (Phase 4.2.4) rank a fixture pool through the shared
    // ranker + correction signal, then resolve as usual — offline + deterministic.
    let resolver;
    if (c.corrections || c.rank) {
      resolver = core.nuCreateResolver(rankedCorrectionSource(c));
    } else {
      resolver = c.tier === 'live' ? liveResolver : fixtureResolver;
    }
    if (!resolver) { skipped++; continue; }              // live tier without USDA_API_KEY

    let mismatches;
    try {
      const input = normalizeInput(c.input);
      const r = await resolver.resolveItem(input);
      mismatches = check(c.expect || {}, r);
      if (c.expect && c.expect.confidence) {
        // Assert the shared confidence verdict on the same ordered pool the
        // resolver saw (a second search — confidence cases are fixture-tier).
        const source = c.tier === 'live' ? liveSrc : fixtureSource;
        const foods = await source.search(input.query);
        // Optional per-case policy override (e.g. { targetedClarification: true })
        // exercises the DORMANT clarification contract; production stays default.
        const verdict = core.nuAssessConfidence(input, foods, c.expect.confidence.policy);
        mismatches = mismatches.concat(checkConfidence(c.expect.confidence, verdict));
      }
    } catch (e) {
      mismatches = ['threw: ' + e.message];
    }
    if (c.tier === 'live') await new Promise((res) => setTimeout(res, 250)); // be kind to USDA

    const ok = mismatches.length === 0;
    for (const t of c.tags || []) {
      tagStats[t] = tagStats[t] || { pass: 0, fail: 0 };
      tagStats[t][ok ? 'pass' : 'fail']++;
    }

    if (c.known_fail) {
      if (ok) { nowPassing++; console.log(`◆ NOW PASSING (was known_fail): ${c.id} — promote to a regression test and remove known_fail`); }
      else knownFail++;
      continue;
    }
    if (ok) pass++;
    else { fail++; failures.push({ id: c.id, tier: c.tier, mismatches }); }
  }

  console.log('\nresolve benchmark —', new Date().toISOString().slice(0, 10));
  console.log(`cases: ${cases.length} | pass: ${pass} | fail: ${fail} | known_fail: ${knownFail}` +
    (nowPassing ? ` | NOW-PASSING: ${nowPassing}` : '') +
    (skipped ? ` | skipped (no USDA_API_KEY): ${skipped}` : ''));
  const scored = pass + fail;
  if (scored) console.log(`accuracy (excl. known_fail/skipped): ${(100 * pass / scored).toFixed(1)}%`);

  const tags = Object.keys(tagStats).sort();
  if (tags.length) {
    console.log('by tag: ' + tags.map((t) =>
      `${t} ${tagStats[t].pass}/${tagStats[t].pass + tagStats[t].fail}`).join(' · '));
  }
  for (const f of failures) {
    console.log(`✗ ${f.id} [${f.tier}]`);
    f.mismatches.forEach((m) => console.log('    ' + m));
  }

  process.exit(STRICT && fail > 0 ? 1 : 0);
})();
