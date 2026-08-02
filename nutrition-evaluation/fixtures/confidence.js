// Category D — confidence calibration (nuAssessConfidence on the ranked pool).
// `wrongIfConfident: true` marks a case whose confident resolution would be
// WRONG — those feed the false-confidence rate. Correct high-confidence cases set
// wrongIfConfident:false so they count as confident-and-correct.

'use strict';

const K = (id, query, confidence, extra) => Object.assign(
  { id, category: 'confidence', input: { query }, expected: { confidence } }, extra || {});

module.exports = [
  /* correct high-confidence auto-resolutions */
  K('conf-chicken-breast-high', 'chicken breast', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-jasmine-rice-high', 'jasmine rice', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'brand'] }),
  K('conf-glutinous-rice-high', 'glutinous rice', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-fairlife-bar-high', 'fairlife protein bar', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'brand'] }),
  K('conf-greek-yogurt-high', 'greek yogurt', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-maple-syrup-high', 'maple syrup', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),

  /* correct high-confidence breadth across common single-identity foods */
  K('conf-almonds-high', 'almonds', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-banana-high', 'banana', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'fruit'] }),
  K('conf-broccoli-high', 'broccoli', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'vegetable'] }),
  K('conf-cheese-high', 'cheese', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'dairy'] }),
  K('conf-spinach-high', 'spinach', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'vegetable'] }),
  K('conf-peanut-butter-high', 'peanut butter', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-oats-high', 'oats', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-hummus-high', 'hummus', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-salsa-high', 'salsa', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'condiment'] }),
  K('conf-blueberries-high', 'blueberries', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'fruit'] }),
  K('conf-olive-oil-high', 'olive oil', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence'] }),
  K('conf-whole-milk-high', 'whole milk', { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false }, { subcategory: 'correct-high', tags: ['confidence', 'dairy'] }),

  /* correct low-confidence: genuinely ambiguous → chooser */
  K('conf-double-cheeseburger-choose', 'double cheeseburger', { disposition: 'choose_candidate', ambiguity: ['category'] }, { subcategory: 'correct-low', tags: ['confidence', 'chooser'] }),
  K('conf-cola-identity-choose', 'cola', { disposition: 'choose_candidate', ambiguity: ['identity'] }, { subcategory: 'correct-low', tags: ['confidence', 'chooser', 'beverage'] }),

  /* CORRECTED (Phase 4.2.10b evidence): the former `conf-coffee-false-confidence`
     was STALE. Bare "coffee" does NOT resolve to "Coffee cake" — the canonical
     generic "Coffee, brewed" wins decisively (nameIsQuery +2000; gap ≈2300) and
     auto-resolving to brewed coffee is CORRECT, not false confidence. This is now
     a gating case proving generic brewed coffee defeats coffee cake when the
     evidence is decisive. Contrast `conf-cola-identity-choose`: cola's candidates
     are branded + tied (gap 0), so cola correctly asks — the two are legitimately
     different, not a calibration bug. */
  K('conf-coffee-brewed-decisive', 'coffee',
    { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false },
    { subcategory: 'correct-high', tags: ['confidence', 'beverage'],
      notes: 'bare "coffee" → auto-resolve to brewed coffee (correct); the canonical generic decisively defeats coffee cake.' }),

  /* ── Phase 4.2.10b evidence (realistic multi-candidate pools) ─────────────
     Bare coffee/tea still auto-resolve to a nutritionally-immaterial BREWED
     variant even against a rich pool (safe — all brewed forms are alike). */
  K('conf-coffee-rich-brewed', 'coffee',
    { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false },
    { pool: 'p10b-coffee', subcategory: 'correct-high', tags: ['confidence', 'beverage', 'p10b'],
      notes: 'rich pool: still auto-resolves to a brewed coffee (~1 kcal); brewed variants are nutritionally alike.' }),
  K('conf-tea-rich-brewed', 'tea',
    { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false },
    { pool: 'p10b-tea', subcategory: 'correct-high', tags: ['confidence', 'beverage', 'p10b'],
      notes: 'rich pool: auto-resolves to a brewed tea (~1 kcal); no material competitor near the top.' }),

  /* GENUINE near-tie material ambiguity — GATING now that Path C escalates it
     (Phase 4.2.10b). Each is an arbitrary pick among tied, materially-different
     subtypes with NO defensible default, so it must ASK. */
  K('conf-soup-material-choose', 'soup',
    { disposition: 'choose_candidate', ambiguity: ['material_subtype_tie'], reason: 'material_ambiguity_escalation', wrongIfConfident: false },
    { pool: 'p10b-soup', subcategory: 'material-ambiguity', tags: ['confidence', 'p10b'],
      notes: 'tomato/vegetable/cream soups are tied and materially different — no defensible default → chooser.' }),
  K('conf-cereal-material-choose', 'breakfast cereal',
    { disposition: 'choose_candidate', wrongIfConfident: false },
    { pool: 'p10b-cereal', subcategory: 'material-ambiguity', tags: ['confidence', 'p10b'],
      notes: 'plain RTE cereal / cereal-with-milk / oatmeal are tied and materially different → chooser.' }),
  K('conf-protein-family-choose', 'protein',
    { disposition: 'choose_candidate', wrongIfConfident: false },
    { pool: 'p10b-protein', subcategory: 'material-ambiguity', tags: ['confidence', 'p10b'],
      notes: 'powder / shake / bar are distinct product families → chooser (not an arbitrary greek-yogurt default).' }),
  K('conf-shake-family-choose', 'shake',
    { disposition: 'choose_candidate', wrongIfConfident: false },
    { pool: 'p10b-shake', subcategory: 'material-ambiguity', tags: ['confidence', 'p10b'] }),
  K('conf-bar-family-choose', 'bar',
    { disposition: 'choose_candidate', wrongIfConfident: false },
    { pool: 'p10b-bar', subcategory: 'material-ambiguity', tags: ['confidence', 'p10b'] }),

  /* Explicit product-family words CONSTRAIN eligibility: an incompatible family
     is dropped from the choices, so a single family-consistent candidate resolves
     (Phase 4.2.10b). "protein powder" never offers greek yogurt / shakes / bars. */
  K('conf-protein-powder-family', 'protein powder',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-protein', subcategory: 'family-consistency', tags: ['confidence', 'p10b', 'product-form'],
      notes: 'only the powder is family-consistent → auto (yogurt/shake/bar excluded from the chooser).' }),
  K('conf-protein-shake-family', 'protein shake',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-protein', subcategory: 'family-consistency', tags: ['confidence', 'p10b', 'product-form'] }),
  K('conf-protein-bar-family', 'protein bar',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-protein', subcategory: 'family-consistency', tags: ['confidence', 'p10b', 'product-form'] }),

  /* Defensible defaults & explicit subtypes STAY auto (no over-clarification). */
  K('conf-tomato-soup-auto', 'tomato soup',
    { disposition: 'auto_resolve', level: 'high', wrongIfConfident: false },
    { pool: 'p10b-soup', subcategory: 'explicit-subtype', tags: ['confidence', 'p10b'],
      notes: 'an explicit subtype resolves decisively — the user said which soup.' }),
  K('conf-oat-cereal-auto', 'oat cereal',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-cereal', subcategory: 'explicit-subtype', tags: ['confidence', 'p10b'] }),
  K('conf-coffee-cake-auto', 'coffee cake',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-coffee', subcategory: 'food-identity', tags: ['confidence', 'p10b'],
      notes: 'coffee cake keeps its food identity — not escalated to a drink chooser.' }),
  K('conf-chicken-p10b-auto', 'chicken',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-chicken', subcategory: 'preferred-default', tags: ['confidence', 'p10b'],
      notes: 'staple: breast is the preferred cut (stronger identity) → auto, never over-clarified.' }),
  K('conf-apple-p10b-auto', 'apple',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-apple', subcategory: 'preferred-default', tags: ['confidence', 'p10b'] }),
  K('conf-sweet-tea-auto', 'sweet tea',
    { disposition: 'auto_resolve', wrongIfConfident: false },
    { pool: 'p10b-tea', subcategory: 'explicit-modifier', tags: ['confidence', 'p10b', 'polarity'],
      notes: 'explicit "sweet" modifier keeps the specific query auto (never escalated against tea cake).' }),
];
