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

/* ── Phase 4.2.10b: explicit-polarity + identity metadata ────────────────── */

test('explicit sweetness polarity: an asserted polarity never resolves to its opposite', () => {
  const pool = () => [
    food({ description: 'Tea, iced, unsweetened, brewed', foodCategory: 'Beverages', nutrients: { kcal: 1, protein: 0, carbs: 0, fat: 0, sugar: 0 } }),
    food({ description: 'Tea, iced, sweetened with sugar', foodCategory: 'Beverages', nutrients: { kcal: 30, protein: 0, carbs: 8, fat: 0, sugar: 7 } }),
  ];
  assert.match(rankFoodCandidates('sweet tea', pool()).foods[0].description, /sweetened with sugar/,
    '"sweet" must not land on unsweetened');
  assert.match(rankFoodCandidates('sweetened tea', pool()).foods[0].description, /sweetened with sugar/);
  assert.match(rankFoodCandidates('unsweetened tea', pool()).foods[0].description, /unsweetened/,
    '"unsweetened" must not land on sweetened');
});

test('polarity is silent when the query asserts no polarity (bare term untouched)', () => {
  const f = food({ description: 'Tea, iced, sweetened with sugar', foodCategory: 'Beverages' });
  assert.strictEqual(ranking.explainCandidate('tea', f).parts.polarity, 0);
  assert.strictEqual(ranking.explainCandidate('iced tea', f).parts.polarity, 0);
});

test('ranking stamps identityScore, demoting an unrequested specialty subtype', () => {
  const out = rankFoodCandidates('rice', [
    food({ description: 'Rice, white, cooked', foodCategory: 'Cereal Grains and Pasta', nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, sugar: 0.1 } }),
    food({ description: 'Rice, white, glutinous, cooked', foodCategory: 'Cereal Grains and Pasta', nutrients: { kcal: 97, protein: 2, carbs: 21, fat: 0.2, sugar: 0 } }),
  ]);
  const white = out.foods.find((f) => !/glutinous/.test(f.description));
  const glut = out.foods.find((f) => /glutinous/.test(f.description));
  assert.strictEqual(typeof white.identityScore, 'number', 'identityScore is stamped on the Candidate');
  assert.ok(white.identityScore > glut.identityScore,
    'the unrequested specialty has a strictly weaker identity signal — the confidence default guard');
});

test('generic-first: a query word only in a parenthetical annotation does not hijack ordering', () => {
  // "protein" appears only in "(high protein)" on the generic → it must NOT force
  // the generic ahead of the higher-scored branded protein powder.
  const out = rankFoodCandidates('protein', [
    food({ description: 'Yogurt, Greek, plain, nonfat (high protein)', foodCategory: 'Dairy and Egg Products', nutrients: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.2 } }),
    branded({ description: 'Protein powder, whey', brand: 'ON', foodCategory: 'Sports Nutrition', nutrients: { kcal: 400, protein: 80, carbs: 8, fat: 6, sugar: 4 } }),
  ]);
  assert.match(out.foods[0].description, /Protein powder/, 'the annotation does not silently replace the true top');
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

/* ── Phase 4.2.7 tiered identity / intent / quality signals ──────────────────
 * Each pins one shared, generalized rule behind a named production failure.
 * Weights are provisional; these tests assert ORDERING invariants, not numbers. */

// Tier 1 — species identity (chicken must never lose to turkey on prep overlap)
test('species identity: chicken query never resolves to turkey', () => {
  const out = rankFoodCandidates('chicken breast cooked', [
    food({ description: 'Turkey, breast, meat only, roasted', foodCategory: 'Poultry Products' }),
    food({ description: 'Chicken, broiler, breast, meat only, cooked, roasted', foodCategory: 'Poultry Products' }),
  ]);
  assert.match(out.foods[0].description, /chicken/i);
  assert.strictEqual(out.foods[0].mismatch, false, 'the correct species is not flagged mismatched');
});
test('species identity is symmetric and hierarchical (salmon ≠ tuna, fish ⊇ salmon)', () => {
  const salmonWins = rankFoodCandidates('salmon', [
    food({ description: 'Fish, tuna, light, canned in water', foodCategory: 'Finfish and Shellfish Products' }),
    food({ description: 'Fish, salmon, Atlantic, cooked', foodCategory: 'Finfish and Shellfish Products' }),
  ]);
  assert.match(salmonWins.foods[0].description, /salmon/i);
  // a parent query ("fish") accepts a child species (salmon) — no mismatch flag
  const fishOk = ranking.explainCandidate('fish',
    food({ description: 'Fish, salmon, Atlantic, raw', foodCategory: 'Finfish and Shellfish Products' }));
  assert.strictEqual(fishOk.parts.species, 0, 'a child species satisfies a parent-species query');
});

// Tier 1 — food-family identity (the mayo/Flor-de-Mayo collision, generalized)
test('food-family identity: mayo query rejects a bean carrying the token (independent of text rewrite)', () => {
  const out = rankFoodCandidates('mayo', [
    food({ description: 'Beans, flor de mayo, mature seeds, cooked', foodCategory: 'Legumes and Legume Products' }),
    food({ description: 'Salad dressing, mayonnaise, regular', foodCategory: 'Fats and Oils' }),
  ]);
  assert.match(out.foods[0].description, /mayonnaise/i, 'the condiment wins on family compatibility');
  assert.match(out.foods[out.foods.length - 1].description, /bean/i, 'the incompatible-family bean is demoted');
});
test('food-family identity: the bean still wins when explicitly requested', () => {
  const out = rankFoodCandidates('flor de mayo beans', [
    food({ description: 'Salad dressing, mayonnaise, regular', foodCategory: 'Fats and Oils' }),
    food({ description: 'Beans, flor de mayo, mature seeds, cooked', foodCategory: 'Legumes and Legume Products' }),
  ]);
  assert.match(out.foods[0].description, /bean/i);
});

// Tier 2 — product form gates brand (Fairlife BAR must not resolve to Fairlife MILK)
test('product form gates brand: a wrong-form brand match loses to a correct-form candidate', () => {
  const milk = ranking.explainCandidate('fairlife protein bar',
    branded({ description: 'Fairlife, Ultra-Filtered Whole Milk', brand: 'fairlife' }));
  const bar = ranking.explainCandidate('fairlife protein bar',
    branded({ description: 'Quest Protein Bar, Chocolate', brand: 'Quest Nutrition' }));
  assert.ok(milk.parts.brand < ranking.RANK_WEIGHTS.brandIntent,
    'the brand-intent boost is suppressed on a hard form mismatch (only generic brand recognition remains)');
  assert.ok(milk.parts.productForm < 0, 'the wrong form is penalized');
  assert.ok(bar.total > milk.total, 'the correct-form bar outranks the wrong-form brand match');
  assert.strictEqual(milk.features.forms[0], 'milk');
});

// Tier 2 — asymmetric brand intent (Fairlife milk beats generic; unbranded query stays neutral)
test('brand asymmetry: an explicit brand prefers the branded candidate over generic', () => {
  const fair = ranking.explainCandidate('fairlife whole milk',
    branded({ description: 'Fairlife Whole Milk', brand: 'fairlife' }));
  const generic = ranking.explainCandidate('fairlife whole milk',
    food({ description: 'Milk, whole, 3.25% milkfat', foodCategory: 'Dairy and Egg Products' }));
  assert.strictEqual(generic.parts.brandAsymmetry, ranking.RANK_WEIGHTS.missingRequestedBrand,
    'a generic candidate is penalized for missing the requested brand');
  assert.strictEqual(fair.parts.brandAsymmetry, 0, 'the matching brand pays no penalty');
});
test('brand asymmetry is silent when no brand is typed (generics never suppressed)', () => {
  const generic = ranking.explainCandidate('whole milk',
    food({ description: 'Milk, whole, 3.25% milkfat', foodCategory: 'Dairy and Egg Products' }));
  assert.strictEqual(generic.parts.brandAsymmetry, 0);
});

// Tier 2 — unrequested specialty subtype (generic rice ≠ glutinous rice)
test('specialty subtype: a generic query demotes an unrequested specialty subtype', () => {
  const out = rankFoodCandidates('rice', [
    food({ description: 'Rice, white, glutinous, cooked', foodCategory: 'Cereal Grains and Pasta' }),
    food({ description: 'Rice, white, long-grain, cooked', foodCategory: 'Cereal Grains and Pasta' }),
  ]);
  assert.doesNotMatch(out.foods[0].description, /glutinous/i, 'plain rice leads');
  const glut = ranking.explainCandidate('rice',
    food({ description: 'Rice, white, glutinous, cooked', foodCategory: 'Cereal Grains and Pasta' }));
  assert.ok(glut.parts.specialtySubtype < 0);
  // requested → neutral
  const asked = ranking.explainCandidate('glutinous rice',
    food({ description: 'Rice, white, glutinous, cooked', foodCategory: 'Cereal Grains and Pasta' }));
  assert.strictEqual(asked.parts.specialtySubtype, 0, 'an explicitly requested subtype is never penalized');
});

// Tier 3 — serving-metadata quality (tie-breaker only; never flips identity)
test('serving quality: rewards a portionable record but never overturns identity', () => {
  const usable = ranking.explainCandidate('milk',
    food({ description: 'Milk, whole', foodCategory: 'Dairy and Egg Products',
      servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup' }));
  const weak = ranking.explainCandidate('milk',
    branded({ description: 'Milk, whole', brand: 'X' }));
  assert.ok(usable.parts.servingQuality > weak.parts.servingQuality, 'usable serving scores higher');
  // magnitude is a tie-breaker: far smaller than a single identity signal
  assert.ok(Math.abs(usable.parts.servingQuality) < Math.abs(ranking.RANK_WEIGHTS.speciesMismatch),
    'serving quality can never outweigh a primary-identity signal');
});
test('serving quality is exposed as inspectable candidate metadata', () => {
  const out = rankFoodCandidates('milk', [
    food({ description: 'Milk, whole', foodCategory: 'Dairy and Egg Products',
      servingSize: 244, servingSizeUnit: 'g', householdServing: '1 cup' }),
  ]);
  assert.strictEqual(out.foods[0].servingQuality, 'usable');
  assert.strictEqual(typeof out.foods[0].mismatch, 'boolean');
});

// short / ambiguous queries must not trigger aggressive mismatch penalties
test('short/ambiguous queries with weak classification take no identity penalty', () => {
  const e = ranking.explainCandidate('milk',
    food({ description: 'Milk, whole', foodCategory: 'Dairy and Egg Products' }));
  assert.strictEqual(e.parts.species, 0);
  assert.strictEqual(e.parts.familyIdentity, 0);
  assert.strictEqual(e.parts.productForm, 0);
});
