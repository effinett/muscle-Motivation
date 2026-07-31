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

  /* FALSE-CONFIDENCE DEFECT — bare "coffee" auto-resolves HIGH to "Coffee cake"
     rather than asking, while the parallel "cola" correctly asks. Expected to
     ask; production is confidently wrong → feeds the false-confidence metric.
     Marked informational (not release-gating) but wrongIfConfident so it is
     visible in the headline false-confidence rate. Candidate for a future
     confidence-hardening phase. */
  K('conf-coffee-false-confidence', 'coffee',
    { disposition: 'choose_candidate', wrongIfConfident: true },
    { subcategory: 'false-confidence', tags: ['confidence', 'beverage', 'defect'], diagnosticStage: 'production-defect',
      notes: 'bare "coffee" auto-resolves high to "Coffee cake" instead of asking (contrast: "cola" asks). Confirmed calibration gap — recommend confidence hardening.' }),
];
