// REGRESSION MANIFEST — one permanent pin per confirmed nutrition bug fixed in
// Phases 4.2.1–4.2.8. Each declares `via` (the underlying category it protects),
// `phase`, and a `regression-<phase>` tag so historical protections are
// auditable. These are release-gating: a regression flipping pass→fail trips the
// gate (runner.js). Expectations mirror the shipped, production-verified fix.

'use strict';

const R = (id, via, phase, input, expected, notes, extra) => Object.assign(
  { id, category: 'regression', via, phase, input, expected, notes,
    tags: ['regression', 'regression-' + phase, via] }, extra || {});

module.exports = [
  /* ── 4.2.1 shared food-resolution core ─────────────────────────────── */
  R('reg-4.2.1-stated-weight-is-total', 'portion', '4.2.1',
    { via: 'resolver', query: 'chicken breast', quantity: 6, unit: 'oz', grams: 170 },
    { portion: { servings: 1, grams: 170 } },
    'stated weights are totals, never multiplied by quantity (3c73250).'),
  R('reg-4.2.1-egg-count-serving', 'portion', '4.2.1',
    { via: 'resolver', query: 'egg', quantity: 2 },
    { portion: { servings: 2, grams: 50, serving_description_regex: '1 large' } },
    'bare count resolves to the per-egg USDA serving.'),

  /* ── 4.2.2 candidate reranking ─────────────────────────────────────── */
  R('reg-4.2.2-maple-syrup-dedupe-brand', 'ranking', '4.2.2',
    { query: 'maple syrup' },
    { acceptableNameRegex: 'maple syrup' },
    'shared reranking floats a real maple-syrup record to the top (nutritionally-identical dupes collapse) (baeac2b/b6ead17).',
    { subcategory: 'dedupe', tags: ['regression', 'regression-4.2.2', 'ranking', 'dedupe'] }),

  /* ── 4.2.3 confidence & clarification ──────────────────────────────── */
  R('reg-4.2.3-ambiguous-asks', 'clarification', '4.2.3',
    { query: 'double cheeseburger' },
    { clarification: { expected: true } },
    'a genuinely ambiguous input surfaces a chooser rather than a false auto-resolve (45a67da).'),
  R('reg-4.2.3-clear-does-not-ask', 'confidence', '4.2.3',
    { query: 'chicken breast' },
    { confidence: { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false } },
    'a clear single-identity query auto-resolves high — no needless clarification.'),

  /* ── 4.2.4 correction memory ───────────────────────────────────────── */
  R('reg-4.2.4-exact-correction-flip', 'correction', '4.2.4',
    { text: 'fairlife protein bar', query: 'fairlife protein bar' },
    { preferredCandidateId: 999101 },
    'an exact user correction flips the auto-pick; user-specific, not a global change (91125b6).',
    { corrections: [{ query: 'fairlife protein bar', corrected_key: 'usda:999101', incorrect_key: 'usda:999102' }] }),
  R('reg-4.2.4-no-false-application', 'correction', '4.2.4',
    { text: 'fairlife protein bar', query: 'fairlife protein bar' },
    { preferredCandidateId: 999102 },
    'a correction for an unrelated query never bleeds into this one.',
    { corrections: [{ query: 'jasmine rice', corrected_key: 'usda:999012', incorrect_key: 'usda:999011' }] }),

  /* ── 4.2.5 vague portions ──────────────────────────────────────────── */
  R('reg-4.2.5-handful-estimate', 'portion', '4.2.5',
    { unit: 'handful', food: { description: 'Nuts, almonds' } },
    { portion: { detected: true, estimatedUnit: 'g', estimatedAmount: 28 } },
    'handful → deterministic gram estimate (4f60fbd/c4479cd).',
    { tolerances: { estimatedAmount: 8 } }),
  R('reg-4.2.5-splash-milk-ml-recovery', 'portion', '4.2.5',
    { unit: null, rawText: 'a splash of milk', query: 'milk', isLiquid: true, food: { description: 'Milk, whole' } },
    { portion: { detected: true, estimatedUnit: 'ml', form: 'liquid' } },
    'dropped "splash" recovered from raw text and resolved in mL for a liquid (8eebd09/29714fd).'),
  R('reg-4.2.5-dropped-quantifier', 'portion', '4.2.5',
    { unit: null, rawText: 'some rice', query: 'rice', food: { description: 'Rice, white, cooked' } },
    { portion: { detected: true } },
    'a dropped small-amount quantifier is recovered (c879c3b).'),
  R('reg-4.2.5-exact-over-vague', 'portion', '4.2.5',
    { unit: 'cup', food: { description: 'Rice, white, cooked' } },
    { portion: { detected: false } },
    'an explicit unit is never treated as a vague portion (precedence).'),

  /* ── 4.2.6 meal reasoning ──────────────────────────────────────────── */
  R('reg-4.2.6-beverage-classified', 'meal', '4.2.6',
    { text: 'coffee with milk', items: [{ query: 'coffee' }, { query: 'milk' }] },
    { meal: { beverageIndexes: [0], notBeverageIndexes: [1] } },
    'the drink is a beverage; its solid companion is not (491ac89).'),
  R('reg-4.2.6-no-false-beverage-forcing', 'meal', '4.2.6',
    { text: 'scrambled eggs and orange juice', items: [{ query: 'eggs' }, { query: 'orange juice' }] },
    { meal: { notBeverageIndexes: [0], beverageIndexes: [1] } },
    'a solid is never force-classified as a beverage.'),
  R('reg-4.2.6-cola-solid-safety', 'meal', '4.2.6',
    { text: 'chicken, rice and broccoli', items: [{ query: 'chicken' }, { query: 'rice' }, { query: 'broccoli' }] },
    { meal: { mealCooked: false, notBeverageIndexes: [0, 1, 2] } },
    'a non-beverage plate stays all-solid.'),

  /* ── 4.2.7 tiered ranking + confidence guard ───────────────────────── */
  R('reg-4.2.7-chicken-not-turkey', 'ranking', '4.2.7',
    { query: 'turkey breast cooked' },
    { preferredCandidateId: 730020, topNotRegex: 'chicken' },
    'species identity: turkey query never resolves to chicken (671f5df).',
    { subcategory: 'species' }),
  R('reg-4.2.7-mayo-not-bean', 'ranking', '4.2.7',
    { query: 'mayonnaise' },
    { preferredCandidateId: 730010, topNotRegex: 'bean|flor' },
    'food-family: "mayonnaise" is the dressing, not the Flor-de-Mayo bean.',
    { subcategory: 'food-family' }),
  R('reg-4.2.7-fairlife-bar-not-milk', 'ranking', '4.2.7',
    { query: 'fairlife protein bar' },
    { acceptableNameRegex: 'protein bar', topNotRegex: 'milk' },
    'product-form gates brand intent: a Fairlife bar query never lands on Fairlife milk.',
    { subcategory: 'product-form' }),
  R('reg-4.2.7-rice-generic-not-glutinous', 'ranking', '4.2.7',
    { query: 'rice' },
    { preferredCandidateId: 168878, topNotRegex: 'glutinous|sushi' },
    'generic "rice" demotes glutinous/sushi specialty subtypes.',
    { subcategory: 'generic-subtype' }),
  R('reg-4.2.7-milk-not-labeled-cheese', 'portion', '4.2.7',
    { unit: 'bowl', food: { description: 'Milk, whole', foodCategory: 'Dairy and Egg Products' }, isLiquid: true },
    { portion: { detected: true, form: 'liquid' } },
    'dairy portion reasoning classifies milk as a liquid — never labels it cheese (c3e9ebe).'),

  /* ── 4.2.8 presentation ────────────────────────────────────────────── */
  R('reg-4.2.8-name-simplification', 'display', '4.2.8',
    { food: { description: 'Chicken, broiler, breast, meat only, cooked, roasted', brand: '', group: 'generic' } },
    { display: { name: 'Chicken Breast' } },
    'USDA name simplified to a clean label (47b9736).'),
  R('reg-4.2.8-manual-name-preserved', 'display', '4.2.8',
    { food: { description: 'Mom special chili', brand: '', group: 'custom', manualName: 'Mom special chili' } },
    { display: { nameRegex: 'chili' } },
    'a manual/custom name is preserved, not tokenized to USDA style.'),
  R('reg-4.2.8-compact-estimated-label', 'display', '4.2.8',
    { logEntry: { name: 'Almonds', serving_description: '~28 g (handful)', servings: 1, calories: 164, protein: 6, carbs: 6, fat: 14, estimated: true } },
    { display: { estimated: true, ariaIncludes: 'estimated portion' } },
    'an estimated portion is marked in the compact row + accessible label.'),
  R('reg-4.2.8-long-name-safe', 'display', '4.2.8',
    { food: { description: 'Beverages, Protein powder, whey based, chocolate flavor, ready to drink', brand: '', group: 'branded' } },
    { display: { nameRegex: 'protein powder' } },
    'a long USDA name yields a non-empty overflow-safe label.'),
  R('reg-4.2.8-milk-not-cheese-label', 'display', '4.2.8',
    { food: { description: 'Milk, whole, 3.25% milkfat', brand: '', group: 'generic' } },
    { display: { name: 'Milk', notRegex: 'cheese' } },
    'a milk record never displays as cheese.'),

  /* ── deferred known-bug (Phase 4.2.8 backlog) — INFORMATIONAL, not gating ── */
  R('reg-4.2.8-cinnamon-duplication', 'display', '4.2.8',
    { food: { description: 'Cinnamon Cinnamon Granola', brand: '', group: 'branded' } },
    { display: { notRegex: 'Cinnamon Cinnamon' } },
    'KNOWN deferred bug: redundant leading word not de-duplicated ("Cinnamon Cinnamon Granola"). Preserved as expected-failure until the 4.2.8 cleanup pass.',
    { informational: true, known_fail: true, diagnosticStage: 'display', subcategory: 'known-deferred' }),
];
