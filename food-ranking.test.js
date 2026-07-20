// Focused tests for the shared food-ranking core (food-ranking.js, Phase
// 4.2.2). Run via `npm test` (node --test). Pure module — no network, no
// keys, no globals: synthetic trimmed Candidate pools go through the REAL
// production ranking (rankFoodCandidates), the same call /api/usda-search
// makes. Live end-to-end ranking behavior stays covered by
// usda-search.test.js and the benchmark corpus; this file pins the ranking
// CONTRACT: signal-by-signal ordering rules, duplicate-family collapse,
// deterministic ties, and the 4.2.2 extension seam.

'use strict';
const test = require('node:test');
const assert = require('node:assert');

const ranking = require('./food-ranking.js');
const { rankFoodCandidates } = ranking;

/* ── synthetic trimmed Candidates (the /api/usda-search shape) ─────────── */

let nextId = 1000;
function food(over) {
  return Object.assign({
    fdcId: ++nextId, description: '', dataType: 'SR Legacy', foodCategory: '',
    brand: '', gtinUpc: '', servingSize: null, servingSizeUnit: '', householdServing: '',
    nutrients: { kcal: 120, protein: 5, carbs: 10, fat: 3, fiber: 1, sugar: 1 },
  }, over);
}
function branded(over) { return food(Object.assign({ dataType: 'Branded' }, over)); }
function names(out) { return out.foods.map(function (f) { return f.description; }); }

/* ── exact match, brand intent, generic intent ──────────────────────────── */

test('exact generic name match ranks first and leads the response', () => {
  const out = rankFoodCandidates('honey', [
    branded({ description: 'HONEY', brand: 'GREAT VALUE' }),
    food({ description: 'Ham, honey, smoked, cooked', foodCategory: 'Sausages and Luncheon Meats' }),
    food({ description: 'Honey' }),
  ]);
  assert.strictEqual(out.foods[0].description, 'Honey', 'the food NAMED by the query wins');
  assert.strictEqual(out.genericFirst, true, 'a solid exact generic beats a branded text match');
  assert.ok(typeof out.foods[0].score === 'number', 'scores are retained for diagnostics');
});

test('clear brand intent: the typed brand dominates; other brands drop out', () => {
  const out = rankFoodCandidates('quest bar', [
    branded({ description: 'PROTEIN BAR, COOKIES & CREAM', brand: 'Quest Nutrition' }),
    branded({ description: 'ENERGY BAR, CHOCOLATE', brand: 'Clif Bar' }),
    food({ description: 'Formulated Bar, protein bar' }),
  ]);
  assert.strictEqual(out.foods[0].brand, 'Quest Nutrition');
  assert.strictEqual(out.genericFirst, false, 'brand intent forces branded-first');
  assert.ok(!out.foods.some(function (f) { return f.brand === 'Clif Bar'; }),
    'a different brand matching only the generic word is not kept for a brand query');
});

test('no brand typed → crowded product words carry no brand intent', () => {
  const toks = ranking.tokenize('protein bar');
  assert.strictEqual(ranking.queryBrandEntries(toks).length, 0,
    "'protein'/'bar' alone never become brand intent");
  assert.ok(ranking.queryBrandEntries(ranking.tokenize('quest bar')).length > 0);
});

test('generic staple query stays generic (whole-food category leads)', () => {
  const out = rankFoodCandidates('banana', [
    branded({ description: 'BANANA', brand: 'DOLE' }),
    food({ description: 'Bananas, ripe and slightly ripe, raw', foodCategory: 'Fruits and Fruit Juices' }),
  ]);
  assert.strictEqual(out.genericFirst, true);
  assert.match(out.foods[0].description, /^Bananas/);
});

/* ── phrase similarity: word order, missing words, extra words ──────────── */

test('word-order-insensitive phrase relevance (USDA inverted names)', () => {
  const out = rankFoodCandidates('cheddar cheese', [
    food({ description: 'Cheese, american and cheddar blend', foodCategory: 'Dairy and Egg Products' }),
    food({ description: 'Cheese, cheddar', foodCategory: 'Dairy and Egg Products' }),
  ]);
  assert.strictEqual(out.foods[0].description, 'Cheese, cheddar',
    '"Cheese, cheddar" IS "cheddar cheese" — reversed phrase + exact full name win');
});

test('missing typed words are penalized (phrase coverage)', () => {
  const out = rankFoodCandidates('grilled chicken breast', [
    food({ description: 'Chicken, broiler, breast, meat only, grilled', foodCategory: 'Poultry Products' }),
    food({ description: 'Chicken, broiler, breast, meat only, raw', foodCategory: 'Poultry Products' }),
    food({ description: 'Chicken, stewing, meat only, cooked', foodCategory: 'Poultry Products' }),
  ]);
  assert.match(out.foods[0].description, /grilled/, 'full token coverage first');
  assert.match(out.foods[1].description, /breast/, 'one missing word beats two missing words');
  assert.match(out.foods[2].description, /stewing/);
  assert.ok(out.foods[0].score > out.foods[1].score && out.foods[1].score > out.foods[2].score);
});

test('irrelevant extra words lose the tie (shorter name first, deterministic)', () => {
  const short = branded({ description: 'PROTEIN BAR', brand: 'ACME' });
  const long = branded({ description: 'PROTEIN BAR DELUXE EDITION', brand: 'ACME' });
  const out = rankFoodCandidates('protein bar', [long, short]);
  assert.strictEqual(out.foods[0].description, 'PROTEIN BAR');
  assert.strictEqual(out.foods[0].score, out.foods[1].score,
    'same signals, same score — ordering comes from the extra-word tie-break');
});

test('annotation parentheticals are not identity: no phrase match through "(includes …)"', () => {
  const out = rankFoodCandidates('bread butter', [
    food({ description: 'Pickles, cucumber, sweet (includes bread and butter pickles)',
           foodCategory: 'Vegetables and Vegetable Products' }),
    food({ description: 'Bread, wheat' }),
  ]);
  assert.ok(!out.foods.some(function (f) { return /Pickles/.test(f.description); }),
    'a pickle jar is not a match for "bread butter" — annotation words never count');
  assert.match(out.foods[0].description, /^Bread/);
});

/* ── base-food and subtype intelligence ─────────────────────────────────── */

test('common base food outranks obscure parts and derivatives', () => {
  const out = rankFoodCandidates('chicken', [
    food({ description: 'Chicken, feet, boiled', foodCategory: 'Poultry Products' }),
    food({ description: 'Chicken spread', foodCategory: 'Poultry Products' }),
    food({ description: 'Chicken, broiler, breast, meat only, raw', foodCategory: 'Poultry Products' }),
  ]);
  assert.match(out.foods[0].description, /breast/, 'the cut people mean rises');
  assert.ok(out.foods[0].score > out.foods[1].score);
});

// The generalized jasmine-rice fix (benchmark case live-jasmine-rice-jasmine-leads).
// FOOD_INTENT prefer lists double as subtype vocabularies: typing one subtype
// must never let a SIBLING subtype collect the prefer boost.
test('typed subtype beats sibling subtypes (jasmine rice regression, generalized)', () => {
  const pool = () => [
    food({ description: 'Rice, white, long grain, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ description: 'Rice, jasmine, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ description: 'Wild rice, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    branded({ description: 'JASMINE RICE', brand: 'GREAT VALUE' }),
    branded({ description: 'JASMINE RICE, JASMINE', brand: 'GOOD & GATHER' }),
  ];

  const jasmine = rankFoodCandidates('jasmine rice', pool());
  const above = names(jasmine).slice(0, names(jasmine).findIndex(
    function (d) { return /white/.test(d); }));
  assert.ok(above.length > 0 && above.every(function (d) { return /jasmine/i.test(d); }),
    'everything ranked above white rice IS jasmine rice: ' + names(jasmine).join(' | '));
  assert.ok(names(jasmine).indexOf('Rice, jasmine, cooked') <
            names(jasmine).indexOf('Wild rice, cooked'));

  // Symmetry: the rule is general, not a jasmine special case.
  const white = rankFoodCandidates('white rice', pool());
  assert.strictEqual(names(white)[0], 'Rice, white, long grain, cooked');

  // No subtype typed → the base-food intent is untouched ("rice" still prefers
  // the cooked default via the intent's `top`).
  const rice = rankFoodCandidates('rice', pool());
  assert.match(names(rice)[0], /cooked/i);
});

/* ── data quality, provenance, duplicate families ───────────────────────── */

test('complete nutrition beats an empty macro panel', () => {
  const out = rankFoodCandidates('oats', [
    food({ description: 'Oats, whole grain',
           nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 } }),
    food({ description: 'Oats, whole grain, rolled', foodCategory: 'Cereal Grains and Pasta' }),
  ]);
  assert.match(out.foods[0].description, /rolled/, 'a food with no macros is useless to log');
});

test('provenance tie-break + duplicate family: SR Legacy twin survives the collapse', () => {
  const out = rankFoodCandidates('milk', [
    food({ description: 'Milk, whole', dataType: 'Foundation', foodCategory: 'Dairy and Egg Products' }),
    food({ description: 'Milk, whole', dataType: 'SR Legacy', foodCategory: 'Dairy and Egg Products' }),
  ]);
  assert.strictEqual(out.foods.length, 1, 'identically-named twins collapse to one row');
  assert.strictEqual(out.foods[0].dataType, 'SR Legacy',
    'SR carries household measures — the better default wins the tie');
});

test('duplicate families collapse; real differences survive', () => {
  const out = rankFoodCandidates('cheddar cheese', [
    food({ description: 'Cheese, cheddar', foodCategory: 'Dairy and Egg Products' }),
    food({ description: "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)",
           foodCategory: 'Dairy and Egg Products' }),
    food({ description: 'Cheese, cheddar, reduced fat', foodCategory: 'Dairy and Egg Products' }),
  ]);
  assert.strictEqual(out.foods.length, 2,
    'the USDA program annotation twin folds into the consumer entry');
  assert.strictEqual(out.foods[0].description, 'Cheese, cheddar');
  assert.match(out.foods[1].description, /reduced fat/, 'a materially different food survives');

  const wild = rankFoodCandidates('wild rice', [
    food({ description: 'Wild rice, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ description: 'Wild rice, raw', foodCategory: 'Cereal Grains and Pasta' }),
  ]);
  assert.strictEqual(wild.foods.length, 2, 'raw vs cooked is never collapsed');
});

/* ── determinism, degradation, extension seam ───────────────────────────── */

test('ranking is deterministic: same pool, same order, every run', () => {
  const mk = () => [
    food({ fdcId: 1, description: 'Rice, white, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ fdcId: 2, description: 'Rice, brown, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    branded({ fdcId: 3, description: 'WHITE RICE', brand: 'GREAT VALUE' }),
    branded({ fdcId: 4, description: 'WHITE RICE', brand: 'ZZZ FOODS' }),
  ];
  const a = rankFoodCandidates('rice', mk()).foods.map(function (f) { return f.fdcId; });
  const b = rankFoodCandidates('rice', mk()).foods.map(function (f) { return f.fdcId; });
  assert.deepStrictEqual(a, b);
});

test('degrades safely on empty/absent input', () => {
  assert.deepStrictEqual(rankFoodCandidates('rice', []),
    { foods: [], counts: { branded: 0, generic: 0 }, genericFirst: false });
  assert.deepStrictEqual(rankFoodCandidates('rice', null).foods, []);
  assert.deepStrictEqual(rankFoodCandidates('', [food({ description: 'Rice' })]).counts.branded, 0);
});

test('extension seam: options.signals reranks without touching the engine', () => {
  const pool = () => [
    food({ fdcId: 71, description: 'Rice, white, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ fdcId: 72, description: 'Rice, brown, cooked', foodCategory: 'Cereal Grains and Pasta' }),
  ];
  const plain = rankFoodCandidates('rice', pool());
  // A future pass (correction memory / portion compatibility / meal context)
  // is just a pure (candidate, features, ctx) → number function.
  const preferBrown = function (f) { return /brown/.test(f.description) ? 5000 : 0; };
  const swayed = rankFoodCandidates('rice', pool(), { signals: [preferBrown] });
  assert.notStrictEqual(plain.foods[0].fdcId, swayed.foods[0].fdcId);
  assert.strictEqual(swayed.foods[0].fdcId, 72);

  // Zero-effect defaults: no options, empty signals — identical output.
  assert.deepStrictEqual(rankFoodCandidates('rice', pool(), { signals: [] }), plain,
    'an empty signals array must change nothing');
  // Malformed signals are inert: non-numeric returns can never poison the
  // numeric sort (strings would concatenate, NaN would make order undefined).
  const broken = [function () { return 'oops'; }, function () { return NaN; },
                  function () { return Infinity; }, function () { return undefined; }];
  assert.deepStrictEqual(rankFoodCandidates('rice', pool(), { signals: broken }), plain,
    'non-finite / non-number signal returns count as 0');
});

/* ── contract guards ────────────────────────────────────────────────────── */

test('every score contribution is a named central weight (no scattered magics)', () => {
  const w = ranking.RANK_WEIGHTS;
  for (const k of Object.keys(w)) {
    assert.strictEqual(typeof w[k], 'number', 'RANK_WEIGHTS.' + k + ' must be numeric');
  }
  // spot-check the contract keys future phases tune
  for (const k of ['missingToken', 'competingSubtype', 'brandIntent', 'baseFood', 'intentPrefer']) {
    assert.ok(k in w, 'missing RANK_WEIGHTS.' + k);
  }
});

test('module is pure: ranking twice with identical input mutates nothing that changes output', () => {
  const pool = [food({ description: 'Honey' }), branded({ description: 'HONEY', brand: 'X' })];
  const first = JSON.stringify(rankFoodCandidates('honey', pool));
  const second = JSON.stringify(rankFoodCandidates('honey', pool));
  assert.strictEqual(first, second, 'group/score stamps are overwritten, never accumulated');
});
