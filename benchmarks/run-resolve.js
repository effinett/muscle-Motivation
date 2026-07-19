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
//               description_regex?, top_not_regex? },
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

/* ── expectation checks ────────────────────────────────────────────────── */

function check(expect, r) {
  const bad = [];
  const want = (name, got, wanted) => {
    if (got !== wanted) bad.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(wanted)}`);
  };
  if (expect.unmatched) { want('unmatched', !!r.unmatched, true); return bad; }
  if (expect.needsChoice) {
    want('needsChoice', !!r.needsChoice, true);
    if (expect.choices != null && r.choices) want('choices', r.choices.length, expect.choices);
    if (expect.top_not_regex && r.choices && r.choices[0] &&
        new RegExp(expect.top_not_regex, 'i').test(r.choices[0].name)) {
      bad.push(`top choice "${r.choices[0].name}" matches forbidden /${expect.top_not_regex}/i`);
    }
    return bad;
  }
  if (expect.not_needsChoice) want('not_needsChoice', !r.needsChoice, true);
  if (r.needsChoice || r.unmatched) {
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

  const fixtureResolver = core.nuCreateResolver(fixtureSource);
  const liveResolver = HAS_KEY ? core.nuCreateResolver(liveSource()) : null;

  let pass = 0, fail = 0, knownFail = 0, nowPassing = 0, skipped = 0;
  const failures = [];
  const tagStats = {};   // tag → { pass, fail }

  for (const c of cases) {
    const resolver = c.tier === 'live' ? liveResolver : fixtureResolver;
    if (!resolver) { skipped++; continue; }              // live tier without USDA_API_KEY

    let mismatches;
    try {
      const r = await resolver.resolveItem(normalizeInput(c.input));
      mismatches = check(c.expect || {}, r);
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
