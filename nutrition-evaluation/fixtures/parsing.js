// Category A — parsing / structured-intent, DETERMINISTIC seams only. The AI
// text parser (/api/ai-food-parse) is non-deterministic (Claude API) and belongs
// to the optional live tier; here we score the PURE post-parse seams that shape
// intent: dropped-unit recovery (nuDetectFromRawText) and query normalization
// (nmNormQuery — the query-construction boundary that feeds retrieval).

'use strict';

const P = (id, text, parse, extra) => Object.assign(
  { id, category: 'parsing', input: { text }, expected: { parse } }, extra || {});

module.exports = [
  /* dropped vague-unit recovery from raw text */
  P('parse-drizzle', 'a drizzle of olive oil', { detectFromRawText: { query: 'olive oil', portionClass: 'drizzle', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery', 'drizzle'] }),
  P('parse-pinch', 'a pinch of salt', { detectFromRawText: { query: 'salt', portionClass: 'pinch', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery', 'pinch'] }),
  P('parse-scoop', 'a scoop of protein', { detectFromRawText: { query: 'protein', portionClass: 'scoop', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery', 'scoop'] }),
  P('parse-splash', 'a splash of milk', { detectFromRawText: { query: 'milk', portionClass: 'splash', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery', 'splash'] }),
  P('parse-handful', 'a handful of almonds', { detectFromRawText: { query: 'almonds', portionClass: 'handful', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery', 'handful'] }),
  P('parse-some-smallamount', 'some rice', { detectFromRawText: { query: 'rice', portionClass: 'small_amount', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery'] }),
  P('parse-bit-smallamount', 'a bit of peanut butter', { detectFromRawText: { query: 'peanut butter', portionClass: 'small_amount', detected: true } },
    { subcategory: 'dropped-unit', tags: ['parsing', 'raw-recovery'] }),

  /* no false portion detection when there is no quantifier */
  P('parse-no-false-portion', 'just chicken', { detectFromRawText: { query: 'chicken', detected: false } },
    { subcategory: 'no-false-portion', tags: ['parsing', 'raw-recovery'] }),

  /* query normalization (query-construction boundary) */
  P('parse-norm-titlecase', 'Chicken Breast', { normQuery: 'breast chicken' }, { subcategory: 'normalize', tags: ['parsing', 'normalize'] }),
  P('parse-norm-qty-stripped', '2 EGGS', { normQuery: 'egg' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'quantity'] }),
  P('parse-norm-whitespace', '  grilled  chicken ', { normQuery: 'chicken grilled' }, { subcategory: 'normalize', tags: ['parsing', 'normalize'] }),
  P('parse-norm-punctuation', 'Greek Yogurt!!!', { normQuery: 'greek yogurt' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'punctuation'] }),

  /* preparation + quantity stripped, token-order canonicalized */
  P('parse-norm-prep-tokens', 'Grilled Chicken Breast', { normQuery: 'breast chicken grilled' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'preparation'] }),
  P('parse-norm-uppercase', 'BANANA', { normQuery: 'banana' }, { subcategory: 'normalize', tags: ['parsing', 'normalize'] }),
  P('parse-norm-double-space', 'brown  rice', { normQuery: 'brown rice' }, { subcategory: 'normalize', tags: ['parsing', 'normalize'] }),
  P('parse-norm-comma-qualifier', 'Peanut Butter, creamy', { normQuery: 'butter creamy peanut' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'punctuation'] }),
  P('parse-norm-qty-prep', '2 scrambled eggs', { normQuery: 'egg scrambled' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'quantity'] }),
  P('parse-norm-trailing-dot', 'Cheddar cheese.', { normQuery: 'cheddar cheese' }, { subcategory: 'normalize', tags: ['parsing', 'normalize', 'punctuation'] }),
  P('parse-norm-white-rice', 'white rice', { normQuery: 'rice white' }, { subcategory: 'normalize', tags: ['parsing', 'normalize'] }),
];
