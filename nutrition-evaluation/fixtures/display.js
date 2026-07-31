// Category I — display presentation (food-display.js). Pure: operates on a food
// object / log entry, never touches ranking or nutrition identity. Expectations
// authored from observed production output so the baseline is honest.

'use strict';

const D = (id, food, display, extra) => Object.assign(
  { id, category: 'display', input: { food }, expected: { display } }, extra || {});
const L = (id, logEntry, display, extra) => Object.assign(
  { id, category: 'display', input: { logEntry }, expected: { display } }, extra || {});

module.exports = [
  /* simplified USDA names */
  D('disp-egg', { description: 'Egg, whole, cooked, hard-boiled', brand: '', group: 'generic' },
    { name: 'Egg' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-chicken-breast', { description: 'Chicken, broiler, breast, meat only, cooked, roasted', brand: '', group: 'generic' },
    { name: 'Chicken Breast' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-white-bread', { description: 'Bread, white, commercially prepared, toasted', brand: '', group: 'generic' },
    { name: 'White Bread' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-almonds', { description: 'Nuts, almonds', brand: '', group: 'generic' },
    { name: 'Almonds' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-milk', { description: 'Milk, whole, 3.25% milkfat, with added vitamin D', brand: '', group: 'generic' },
    { name: 'Milk' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-banana', { description: 'Banana, raw', brand: '', group: 'generic' },
    { name: 'Banana' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-broccoli', { description: 'Broccoli, cooked, boiled, drained, without salt', brand: '', group: 'generic' },
    { name: 'Broccoli' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-peanut-butter', { description: 'Peanut butter, smooth style, without salt', brand: '', group: 'generic' },
    { name: 'Peanut Butter' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-oatmeal', { description: 'Oatmeal, cooked', brand: '', group: 'generic' },
    { name: 'Oatmeal' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-rice-white', { description: 'Rice, white, long-grain, regular, enriched, cooked', brand: '', group: 'generic' },
    { nameRegex: 'rice', notRegex: 'enriched|regular' }, { subcategory: 'simplify', tags: ['simplify'] }),

  /* preparation state preserved where it matters */
  D('disp-greek-yogurt-keeps-greek', { description: 'Yogurt, Greek, plain, nonfat', brand: '', group: 'generic' },
    { nameRegex: 'greek', notRegex: '^Yogurt$' }, { subcategory: 'prep-preserved', tags: ['simplify', 'prep'] }),
  D('disp-cheddar-keeps-cheddar', { description: 'Cheese, cheddar', brand: '', group: 'generic' },
    { nameRegex: 'cheddar' }, { subcategory: 'prep-preserved', tags: ['simplify'] }),
  D('disp-salsa-not-oversimplified', { description: 'Sauce, salsa, ready-to-serve', brand: '', group: 'generic' },
    { nameRegex: 'salsa' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'] }),
  D('disp-mayo-keeps-identity', { description: 'Salad dressing, mayonnaise, regular', brand: '', group: 'generic' },
    { nameRegex: 'mayonnaise' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'] }),

  /* brand preservation */
  D('disp-quest-brand', { description: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR', brand: 'Quest Nutrition', group: 'branded' },
    { nameRegex: 'quest' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-fairlife-milk-brand', { description: 'FAIRLIFE WHOLE MILK', brand: 'fairlife', group: 'branded' },
    { nameRegex: 'fairlife', servingRegex: '.*' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-kodiak-no-dup', { description: 'KODIAK CAKES POWER CAKES', brand: 'Kodiak Cakes', group: 'branded' },
    { nameRegex: 'kodiak' }, { subcategory: 'brand', tags: ['brand'] }),

  /* long-name / overflow-safe presentation (name must not be empty, stays a phrase) */
  D('disp-long-name', { description: 'Beverages, Protein powder, whey based, chocolate flavor, ready to drink', brand: '', group: 'branded' },
    { nameRegex: 'protein powder' }, { subcategory: 'long-name', tags: ['long-name'] }),

  /* manual / custom name preservation — words kept, not tokenized to USDA style */
  D('disp-manual-name', { description: 'Mom special chili', brand: '', group: 'custom', manualName: 'Mom special chili' },
    { nameRegex: 'chili' }, { subcategory: 'manual', tags: ['manual'] }),

  /* log rows: serving labels + estimated markers + aria */
  L('disp-log-exact-serving', { name: 'Chicken Breast', serving_description: '1 cup', servings: 2, calories: 200, protein: 30, carbs: 0, fat: 5 },
    { serving: '1 cup', estimated: false, ariaIncludes: '200 kcal' }, { subcategory: 'serving-label', tags: ['serving'] }),
  L('disp-log-estimated-compact', { name: 'Almonds', serving_description: '~28 g (handful)', servings: 1, calories: 164, protein: 6, carbs: 6, fat: 14, estimated: true },
    { estimated: true, servingRegex: '28 g', ariaIncludes: 'estimated portion' }, { subcategory: 'estimated-label', tags: ['estimated'] }),
  L('disp-log-aria', { name: 'Greek Nonfat Yogurt', serving_description: '1 container', servings: 1, calories: 100, protein: 17, carbs: 6, fat: 0 },
    { ariaIncludes: 'Greek Nonfat Yogurt' }, { subcategory: 'accessibility', tags: ['aria'] }),

  /* broader clean-simplification coverage across food groups */
  D('disp-ground-beef', { description: 'Beef, ground, 90% lean meat / 10% fat, cooked', brand: '', group: 'generic' },
    { nameRegex: 'ground beef', notRegex: '10% fat' }, { subcategory: 'simplify', tags: ['simplify', 'meat'] }),
  D('disp-salmon', { description: 'Salmon, Atlantic, farmed, cooked, dry heat', brand: '', group: 'generic' },
    { nameRegex: 'salmon', notRegex: 'dry heat' }, { subcategory: 'simplify', tags: ['simplify', 'fish'] }),
  D('disp-brown-rice', { description: 'Rice, brown, long-grain, cooked', brand: '', group: 'generic' },
    { nameRegex: 'brown.*rice' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-apple', { description: 'Apple, raw, with skin', brand: '', group: 'generic' },
    { name: 'Apple' }, { subcategory: 'simplify', tags: ['simplify', 'fruit'] }),
  D('disp-strawberries', { description: 'Strawberries, raw', brand: '', group: 'generic' },
    { name: 'Strawberries' }, { subcategory: 'simplify', tags: ['simplify', 'fruit'] }),
  D('disp-spinach', { description: 'Spinach, raw', brand: '', group: 'generic' },
    { name: 'Spinach' }, { subcategory: 'simplify', tags: ['simplify', 'vegetable'] }),
  D('disp-carrots', { description: 'Carrots, raw', brand: '', group: 'generic' },
    { name: 'Carrots' }, { subcategory: 'simplify', tags: ['simplify', 'vegetable'] }),
  D('disp-butter', { description: 'Butter, salted', brand: '', group: 'generic' },
    { name: 'Butter' }, { subcategory: 'simplify', tags: ['simplify', 'fat'] }),
  D('disp-avocado', { description: 'Avocados, raw, all commercial varieties', brand: '', group: 'generic' },
    { name: 'Avocados' }, { subcategory: 'simplify', tags: ['simplify', 'fat'] }),
  D('disp-almond-butter', { description: 'Almond butter, plain', brand: '', group: 'generic' },
    { name: 'Almond Butter' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-ground-turkey', { description: 'Ground turkey, cooked', brand: '', group: 'generic' },
    { name: 'Ground Turkey' }, { subcategory: 'simplify', tags: ['simplify', 'meat'] }),
  D('disp-pork-loin', { description: 'Pork, fresh, loin, cooked', brand: '', group: 'generic' },
    { nameRegex: 'pork.*loin' }, { subcategory: 'simplify', tags: ['simplify', 'meat'] }),
  D('disp-shrimp', { description: 'Shrimp, cooked', brand: '', group: 'generic' },
    { name: 'Shrimp' }, { subcategory: 'simplify', tags: ['simplify', 'fish'] }),
  D('disp-bagel', { description: 'Bagel, plain, enriched', brand: '', group: 'generic' },
    { name: 'Bagel' }, { subcategory: 'simplify', tags: ['simplify', 'grain'] }),
  D('disp-mozzarella', { description: 'Cheese, mozzarella, whole milk', brand: '', group: 'generic' },
    { nameRegex: 'mozzarella' }, { subcategory: 'simplify', tags: ['simplify', 'dairy'] }),
  D('disp-cottage-cheese', { description: 'Cottage cheese, lowfat, 2% milkfat', brand: '', group: 'generic' },
    { nameRegex: 'cottage cheese' }, { subcategory: 'simplify', tags: ['simplify', 'dairy'] }),
  D('disp-egg-raw', { description: 'Egg, whole, raw, fresh', brand: '', group: 'generic' },
    { name: 'Egg' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-chicken-thigh', { description: 'Chicken, broiler, thigh, meat only, cooked', brand: '', group: 'generic' },
    { name: 'Chicken Thigh' }, { subcategory: 'simplify', tags: ['simplify', 'meat'] }),
  D('disp-ground-beef-raw', { description: 'Beef, ground, 80% lean meat / 20% fat, raw', brand: '', group: 'generic' },
    { nameRegex: 'ground beef', notRegex: '20% fat' }, { subcategory: 'simplify', tags: ['simplify', 'meat'] }),
  D('disp-whole-wheat-bread', { description: 'Bread, whole-wheat, commercially prepared', brand: '', group: 'generic' },
    { nameRegex: 'whole-wheat.*bread' }, { subcategory: 'simplify', tags: ['simplify', 'grain'] }),
  D('disp-cashews', { description: 'Nuts, cashew nuts, raw', brand: '', group: 'generic' },
    { nameRegex: 'cashew' }, { subcategory: 'simplify', tags: ['simplify'] }),
  D('disp-parmesan', { description: 'Cheese, parmesan, grated', brand: '', group: 'generic' },
    { nameRegex: 'parmesan' }, { subcategory: 'simplify', tags: ['simplify', 'dairy'] }),

  /* INFORMATIONAL — over-simplification quality gaps surfaced by the eval (not
     release-gating; candidates for the deferred display cleanup pass). */
  D('disp-potato-flesh-artifact', { description: 'Potatoes, boiled, cooked without skin, flesh', brand: '', group: 'generic' },
    { notRegex: '^Flesh' }, { subcategory: 'oversimplify-gap', tags: ['simplify', 'defect'], informational: true, diagnosticStage: 'display',
      notes: 'leading "Flesh" survives ("Flesh Potato Cooked Without Skin") — display cleanup candidate.' }),
  D('disp-olive-oil-tail-artifact', { description: 'Oil, olive, salad or cooking', brand: '', group: 'generic' },
    { notRegex: 'Salad Or Cooking' }, { subcategory: 'oversimplify-gap', tags: ['simplify', 'defect'], informational: true, diagnosticStage: 'display',
      notes: '"salad or cooking" tail retained ("Olive Oil Salad Or Cooking").' }),
  D('disp-lentils-tail-artifact', { description: 'Lentils, mature seeds, cooked, boiled', brand: '', group: 'generic' },
    { notRegex: 'Mature Seeds' }, { subcategory: 'oversimplify-gap', tags: ['simplify', 'defect'], informational: true, diagnosticStage: 'display',
      notes: '"mature seeds" retained ("Lentils Mature Seeds").' }),
  D('disp-yogurt-whole-milk-artifact', { description: 'Yogurt, plain, whole milk', brand: '', group: 'generic' },
    { notRegex: 'Whole Milk' }, { subcategory: 'oversimplify-gap', tags: ['simplify', 'defect'], informational: true, diagnosticStage: 'display',
      notes: '"whole milk" descriptor surfaces in the label ("Yogurt Whole Milk").' }),
];
