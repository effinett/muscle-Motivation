// Category C — ranking. Is the best candidate first when it is present? Uses the
// authoritative server boundary (rankFoodCandidates over the canned pool). Every
// preferred/acceptable id/regex authored from observed production ranking; a case
// whose acceptable candidate is never retrieved is classified retrieval, not
// ranking, by the scorer.

'use strict';

const C = (id, query, expected, extra) => Object.assign(
  { id, category: 'ranking', input: { query }, expected }, extra || {});
const Cp = (id, query, pool, expected, extra) => Object.assign(
  { id, category: 'ranking', input: { query }, pool, expected }, extra || {});

module.exports = [
  /* species identity — chicken never resolves to turkey and vice-versa */
  C('rank-turkey-not-chicken', 'turkey breast cooked',
    { preferredCandidateId: 730020, topNotRegex: 'chicken' }, { subcategory: 'species', tags: ['ranking', 'species', 'collision'] }),

  /* food-family — "mayonnaise" is the dressing, never the Flor-de-Mayo bean */
  C('rank-mayo-not-bean', 'mayonnaise',
    { preferredCandidateId: 730010, topNotRegex: 'bean|flor' }, { subcategory: 'food-family', tags: ['ranking', 'food-family', 'collision'] }),

  /* generic-vs-specialty — bare "rice" is generic white rice, not glutinous */
  C('rank-rice-generic-not-glutinous', 'rice',
    { preferredCandidateId: 168878, topNotRegex: 'glutinous|sushi' }, { subcategory: 'generic-subtype', tags: ['ranking', 'generic-subtype', 'collision'] }),
  /* …but a specialty query DOES get the specialty item */
  C('rank-glutinous-query-gets-glutinous', 'glutinous rice',
    { preferredCandidateId: 730002 }, { subcategory: 'generic-subtype', tags: ['ranking', 'generic-subtype'] }),

  /* product-form — a Fairlife BAR query never lands on Fairlife milk */
  C('rank-fairlife-bar-not-milk', 'fairlife protein bar',
    { acceptableNameRegex: 'protein bar', topNotRegex: 'milk' }, { subcategory: 'product-form', tags: ['ranking', 'product-form', 'brand', 'collision'] }),
  /* …and a Fairlife MILK query lands on the milk */
  C('rank-fairlife-milk', 'fairlife whole milk',
    { preferredCandidateId: 999103, topNotRegex: 'protein bar' }, { subcategory: 'brand', tags: ['ranking', 'brand'] }),

  /* whole milk — a milk record wins, never a bar */
  C('rank-whole-milk', 'whole milk',
    { acceptableNameRegex: 'milk', topNotRegex: 'protein bar|cheese' }, { subcategory: 'dairy-family', tags: ['ranking', 'dairy'] }),

  /* cream token collision — "cream" is the dairy cream, not ice-cream / cream cheese */
  C('rank-cream-not-icecream', 'heavy cream query',
    { preferredCandidateId: 8800301, topNotRegex: 'ice cream' }, { subcategory: 'token-collision', tags: ['ranking', 'collision', 'dairy'] }),

  /* brand-intent — an explicit brand prefers its branded record */
  C('rank-chobani-brand-intent', 'chobani greek yogurt',
    { preferredCandidateId: 8800111, acceptableNameRegex: 'chobani' }, { subcategory: 'brand-intent', tags: ['ranking', 'brand'] }),

  /* singular generic queries resolve to their generic record */
  C('rank-cheese-cheddar', 'cheese', { acceptableNameRegex: 'chedd|cheese', topNotRegex: 'cream' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-almonds', 'almonds', { acceptableNameRegex: 'almond' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-banana', 'banana', { acceptableNameRegex: 'banana' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-orange-juice-not-orange', 'orange juice', { acceptableNameRegex: 'orange juice', topNotRegex: '^Oranges' }, { subcategory: 'beverage', tags: ['ranking', 'beverage'] }),

  /* restaurant items */
  C('rank-restaurant-pizza', 'restaurant pizza', { acceptableNameRegex: 'pizza' }, { subcategory: 'restaurant', tags: ['ranking', 'restaurant'] }),
  C('rank-turkey-sandwich', 'turkey sandwich', { acceptableNameRegex: 'turkey.*sandwich|sandwich.*turkey' }, { subcategory: 'restaurant', tags: ['ranking', 'restaurant'] }),

  /* generic identity across food groups */
  C('rank-spinach', 'spinach', { acceptableNameRegex: 'spinach' }, { subcategory: 'generic', tags: ['ranking', 'vegetable'] }),
  C('rank-salsa', 'salsa', { acceptableNameRegex: 'salsa' }, { subcategory: 'condiment', tags: ['ranking', 'condiment'] }),
  C('rank-ketchup', 'ketchup', { acceptableNameRegex: 'ketchup' }, { subcategory: 'condiment', tags: ['ranking', 'condiment'] }),
  C('rank-ranch', 'ranch', { acceptableNameRegex: 'ranch' }, { subcategory: 'condiment', tags: ['ranking', 'condiment'] }),
  C('rank-hummus', 'hummus', { acceptableNameRegex: 'hummus' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-chips', 'chips', { acceptableNameRegex: 'chips' }, { subcategory: 'snack', tags: ['ranking', 'snack'] }),
  C('rank-olive-oil', 'olive oil', { acceptableNameRegex: 'olive', topNotRegex: 'salad dressing' }, { subcategory: 'oil', tags: ['ranking'] }),
  C('rank-blueberries', 'blueberries', { acceptableNameRegex: 'blueberr' }, { subcategory: 'fruit', tags: ['ranking'] }),
  C('rank-pizza', 'pizza', { acceptableNameRegex: 'pizza' }, { subcategory: 'mixed-dish', tags: ['ranking'] }),
  C('rank-steak', 'steak', { acceptableNameRegex: 'steak|beef' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-tuna-canned', 'tuna canned', { acceptableNameRegex: 'tuna', topNotRegex: 'oil$' }, { subcategory: 'preparation', tags: ['ranking', 'preparation'] }),
  C('rank-shredded-cheese', 'shredded cheese', { acceptableNameRegex: 'shredded|cheddar' }, { subcategory: 'form', tags: ['ranking'] }),
  C('rank-potatoes-raw-first', 'potatoes', { acceptableNameRegex: 'potato' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-green-beans', 'green beans', { acceptableNameRegex: 'snap.*green|green' }, { subcategory: 'vegetable', tags: ['ranking'] }),
  C('rank-soup', 'soup', { acceptableNameRegex: 'soup' }, { subcategory: 'mixed-dish', tags: ['ranking'] }),
  C('rank-bread-generic', 'bread', { acceptableNameRegex: 'bread' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-pasta-generic', 'pasta', { acceptableNameRegex: 'pasta' }, { subcategory: 'generic', tags: ['ranking'] }),
  C('rank-hot-sauce', 'hot sauce', { acceptableNameRegex: 'hot|sriracha|chile' }, { subcategory: 'condiment', tags: ['ranking', 'condiment'] }),

  /* GATING (corrected in Phase 4.2.10b evidence): bare "coffee" ranks the
     canonical brewed beverage ABOVE coffee cake via nameIsQuery (+2000) — the
     earlier "cake ranks first" note was stale. Pins that the generic beverage
     wins standalone (no meal cue needed). */
  C('rank-coffee-brewed-leads', 'coffee',
    { topNotRegex: 'cake', acceptableNameRegex: 'brewed' },
    { subcategory: 'beverage-term', tags: ['ranking', 'beverage'],
      notes: 'bare "coffee" → "Coffee, brewed" leads over "Coffee cake" standalone (nameIsQuery). Contrast cola (branded, tied).' }),

  /* Phase 4.2.10b — explicit sweetness polarity (rich tea pool). */
  Cp('rank-sweet-tea-sweetened', 'sweet tea', 'p10b-tea',
    { topNameRegex: 'sweetened with sugar', topNotRegex: 'unsweetened|cake' },
    { subcategory: 'polarity', tags: ['ranking', 'beverage', 'polarity'],
      notes: '"sweet tea" must rank the sweetened candidate first — never unsweetened.' }),
  Cp('rank-unsweetened-tea', 'unsweetened tea', 'p10b-tea',
    { topNameRegex: 'unsweetened', topNotRegex: 'sweetened with sugar' },
    { subcategory: 'polarity', tags: ['ranking', 'beverage', 'polarity'],
      notes: '"unsweetened tea" must rank the unsweetened candidate first.' }),
  Cp('rank-tea-cake-identity', 'tea cake', 'p10b-tea',
    { topNameRegex: 'cake' },
    { subcategory: 'food-identity', tags: ['ranking', 'beverage'],
      notes: 'tea cake resolves to its baked identity, not a tea beverage.' }),
];
