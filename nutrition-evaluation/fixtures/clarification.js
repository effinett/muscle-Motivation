// Category E — clarification. Does the system ASK when it should and stay quiet
// when the input is clear? `asked` = choose_candidate / clarify disposition or a
// clarification object on the verdict. Precision/recall are aggregated in metrics.

'use strict';

const C = (id, query, clarification, extra) => Object.assign(
  { id, category: 'clarification', input: { query }, expected: { clarification } }, extra || {});

module.exports = [
  /* SHOULD ask — genuinely ambiguous */
  C('clar-double-cheeseburger', 'double cheeseburger', { expected: true }, { subcategory: 'category', tags: ['clarify', 'chooser'] }),
  C('clar-cola', 'cola', { expected: true }, { subcategory: 'identity', tags: ['clarify', 'chooser', 'beverage'] }),

  /* should NOT ask — clear single-identity queries */
  C('clar-chicken-breast-quiet', 'chicken breast', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),
  C('clar-jasmine-rice-quiet', 'jasmine rice', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify', 'brand'] }),
  C('clar-glutinous-rice-quiet', 'glutinous rice', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),
  C('clar-greek-yogurt-quiet', 'greek yogurt', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),
  C('clar-fairlife-bar-quiet', 'fairlife protein bar', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify', 'brand'] }),
  C('clar-maple-syrup-quiet', 'maple syrup', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),
  C('clar-almonds-quiet', 'almonds', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),
  C('clar-banana-quiet', 'banana', { expected: false }, { subcategory: 'no-needless-ask', tags: ['clarify'] }),

  /* INFORMATIONAL — bare "coffee" does NOT ask though it arguably should (paired
     with the confidence false-confidence defect). Not release-gating. */
  C('clar-coffee-should-ask', 'coffee', { expected: true },
    { subcategory: 'missing-ask', tags: ['clarify', 'beverage', 'defect'], informational: true, diagnosticStage: 'production-defect',
      notes: 'mirror of conf-coffee-false-confidence: "coffee" resolves silently instead of offering drink-vs-cake.' }),
];
