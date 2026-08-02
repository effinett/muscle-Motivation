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

  /* CORRECTED (Phase 4.2.10b evidence): bare "coffee" correctly does NOT ask —
     "Coffee, brewed" decisively defeats coffee cake, so auto-resolving is right
     (the former `clar-coffee-should-ask` was stale). Contrast `clar-cola` (tied
     branded → asks). */
  C('clar-coffee-quiet', 'coffee', { expected: false },
    { subcategory: 'no-needless-ask', tags: ['clarify', 'beverage'],
      notes: 'brewed coffee decisively leads → no needless clarification (contrast cola, which is genuinely tied).' }),

  /* Phase 4.2.10b Path C — broad material ties SHOULD ask (rich pools). */
  C('clar-soup-ask', 'soup', { expected: true },
    { pool: 'p10b-soup', subcategory: 'material-ambiguity', tags: ['clarify', 'chooser', 'p10b'] }),
  C('clar-protein-ask', 'protein', { expected: true },
    { pool: 'p10b-protein', subcategory: 'material-ambiguity', tags: ['clarify', 'chooser', 'p10b'] }),
  C('clar-shake-ask', 'shake', { expected: true },
    { pool: 'p10b-shake', subcategory: 'material-ambiguity', tags: ['clarify', 'chooser', 'p10b'] }),
  C('clar-bar-ask', 'bar', { expected: true },
    { pool: 'p10b-bar', subcategory: 'material-ambiguity', tags: ['clarify', 'chooser', 'p10b'] }),

  /* …but defensible defaults / explicit subtypes must NOT over-clarify. */
  C('clar-tea-quiet', 'tea', { expected: false },
    { pool: 'p10b-tea', subcategory: 'no-needless-ask', tags: ['clarify', 'beverage', 'p10b'] }),
  C('clar-sweet-tea-quiet', 'sweet tea', { expected: false },
    { pool: 'p10b-tea', subcategory: 'no-needless-ask', tags: ['clarify', 'beverage', 'p10b'] }),
  C('clar-tomato-soup-quiet', 'tomato soup', { expected: false },
    { pool: 'p10b-soup', subcategory: 'no-needless-ask', tags: ['clarify', 'p10b'] }),
  C('clar-chicken-p10b-quiet', 'chicken', { expected: false },
    { pool: 'p10b-chicken', subcategory: 'no-needless-ask', tags: ['clarify', 'p10b'] }),
  C('clar-apple-quiet', 'apple', { expected: false },
    { pool: 'p10b-apple', subcategory: 'no-needless-ask', tags: ['clarify', 'p10b'] }),
];
