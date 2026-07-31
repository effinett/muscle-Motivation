// Category B — retrieval. Is an acceptable candidate in the retrieved pool at
// all, and within top-N? Scored on the RAW pool (retrieved-at-all) + the ranked
// pool (recall@k). A retrieval miss here is never reported as a ranking failure.

'use strict';

const R = (id, query, expected, extra) => Object.assign(
  { id, category: 'retrieval', input: { query }, expected }, extra || {});

module.exports = [
  R('retr-chicken-breast', 'chicken breast', { acceptableNameRegex: 'chicken.*breast', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-turkey', 'turkey breast cooked', { acceptableNameRegex: 'turkey', recallWithin: 1 }, { tags: ['retrieval', 'species'] }),
  R('retr-mayo', 'mayonnaise', { acceptableNameRegex: 'mayonnaise', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-rice-generic', 'rice', { acceptableNameRegex: 'rice, white', recallWithin: 3 }, { tags: ['retrieval'] }),
  R('retr-fairlife-milk', 'fairlife whole milk', { acceptableNameRegex: 'fairlife.*milk', recallWithin: 3 }, { tags: ['retrieval', 'brand'] }),
  R('retr-whole-milk-generic', 'whole milk', { acceptableNameRegex: 'milk, whole', recallWithin: 3 }, { tags: ['retrieval', 'dairy'] }),
  R('retr-generic-milk-pair', 'whole milk generic-pair', { acceptableCandidateIds: [8800102], recallWithin: 1 }, { tags: ['retrieval', 'dairy'] }),
  R('retr-cream-in-pool', 'heavy cream query', { acceptableCandidateIds: [8800301], recallWithin: 1 }, { tags: ['retrieval', 'dairy'] }),
  R('retr-cream-cheese-present', 'heavy cream query', { acceptableCandidateIds: [8800303], recallWithin: 5 }, { tags: ['retrieval'] }),
  R('retr-jasmine-rice', 'jasmine rice', { acceptableNameRegex: 'jasmine', recallWithin: 1 }, { tags: ['retrieval', 'brand'] }),
  R('retr-double-cheeseburger', 'double cheeseburger', { acceptableNameRegex: 'cheeseburger', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-maple-syrup', 'maple syrup', { acceptableNameRegex: 'maple syrup', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-greek-yogurt', 'greek yogurt', { acceptableNameRegex: 'greek', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-peanut-butter', 'peanut butter', { acceptableNameRegex: 'peanut butter', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-broccoli', 'broccoli', { acceptableNameRegex: 'broccoli', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-restaurant-pizza', 'restaurant pizza', { acceptableNameRegex: 'pizza', recallWithin: 1 }, { tags: ['retrieval', 'restaurant'] }),

  R('retr-spinach', 'spinach', { acceptableNameRegex: 'spinach', recallWithin: 1 }, { tags: ['retrieval', 'vegetable'] }),
  R('retr-salsa', 'salsa', { acceptableNameRegex: 'salsa', recallWithin: 1 }, { tags: ['retrieval', 'condiment'] }),
  R('retr-olive-oil', 'olive oil', { acceptableNameRegex: 'olive', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-blueberries', 'blueberries', { acceptableNameRegex: 'blueberr', recallWithin: 1 }, { tags: ['retrieval', 'fruit'] }),
  R('retr-pizza', 'pizza', { acceptableNameRegex: 'pizza', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-oats', 'oats', { acceptableNameRegex: 'oat', recallWithin: 1 }, { tags: ['retrieval'] }),
  R('retr-cola-both', 'cola', { acceptableNameRegex: 'cola', recallWithin: 1 }, { tags: ['retrieval', 'beverage'] }),
  R('retr-tuna-water-preferred', 'tuna canned', { acceptableCandidateIds: [700030], recallWithin: 1 }, { tags: ['retrieval', 'preparation'] }),

  /* External-data limitation: bare "salad" retrieves only lettuce (USDA has no
     single "salad" record). Documented as external-data, not a retrieval bug. */
  R('retr-salad-external-limit', 'salad', { acceptableNameRegex: 'salad' },
    { tags: ['retrieval', 'external-data'], informational: true, diagnosticStage: 'external-data-ambiguity',
      notes: 'USDA has no generic composed "salad" record; the pool holds only "Lettuce, cos or romaine" — an upstream data limitation, not a retrieval defect.' }),
];
