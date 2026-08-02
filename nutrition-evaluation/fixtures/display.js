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

  /* adjacent duplicate-word collapse (Phase 4.2.10a §3) — generalizable, not per-food */
  D('disp-maple-dup', { description: 'Maple Maple Syrup', brand: '', group: 'branded' },
    { name: 'Maple Syrup' }, { subcategory: 'dedupe-word', tags: ['simplify', 'dedupe'] }),
  D('disp-sourdough-dup', { description: 'Sourdough Sourdough Bread', brand: '', group: 'branded' },
    { name: 'Sourdough Bread' }, { subcategory: 'dedupe-word', tags: ['simplify', 'dedupe'] }),
  D('disp-cinnamon-dup', { description: 'Cinnamon Cinnamon Granola', brand: '', group: 'branded' },
    { name: 'Cinnamon Granola', notRegex: 'Cinnamon Cinnamon' }, { subcategory: 'dedupe-word', tags: ['simplify', 'dedupe'] }),
  D('disp-egg-size-grade', { description: 'Egg, whole, raw, fresh, large, Grade A', brand: '', group: 'generic' },
    { name: 'Egg' }, { subcategory: 'simplify', tags: ['simplify'],
      notes: 'size grade ("large") + USDA quality grade ("Grade A") carry no nutritional identity.' }),

  /* contextual redundant-modifier reduction (Phase 4.2.10a) — scoped, NOT global */
  D('disp-cottage-creamed', { description: 'Cheese, cottage, creamed, large or small curd', brand: '', group: 'generic' },
    { name: 'Cottage Cheese' }, { subcategory: 'context-reduce', tags: ['simplify'],
      notes: '"creamed" is redundant for cottage cheese (its default form).' }),
  D('disp-creamed-corn-kept', { description: 'Corn, sweet, creamed', brand: '', group: 'generic' },
    { nameRegex: 'creamed' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'],
      notes: '"creamed" is a distinct dish for corn — the cottage rule is contextual, so it is preserved here.' }),
  D('disp-creamed-spinach-kept', { description: 'Creamed Spinach', brand: '', group: 'generic' },
    { nameRegex: 'creamed' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'],
      notes: 'creamed spinach keeps "creamed".' }),

  /* species/variety as SECONDARY metadata + evidence-gated lox (Phase 4.2.10a) */
  D('disp-salmon-species-secondary', { description: 'Chinook Smoked Salmon', brand: '', group: 'generic' },
    { name: 'Smoked Salmon', notRegex: 'lox|chinook', varietyIncludes: 'Chinook' }, { subcategory: 'variety-secondary', tags: ['simplify', 'variety'],
      notes: 'species "Chinook" → secondary metadata (still on model.variety); lox NOT inferred from smoked salmon.' }),
  D('disp-salmon-lox-explicit', { description: 'Salmon, Chinook, smoked, (lox), regional', brand: '', group: 'generic' },
    { name: 'Smoked Salmon (Lox)' }, { subcategory: 'variety-secondary', tags: ['simplify', 'variety'],
      notes: 'explicit lox in the canonical name stays visible.' }),
  D('disp-salmon-generic-no-lox', { description: 'Salmon, Atlantic, smoked', brand: '', group: 'generic' },
    { name: 'Smoked Salmon', notRegex: 'lox' }, { subcategory: 'variety-secondary', tags: ['simplify', 'variety'],
      notes: 'generic smoked salmon never gains "(Lox)".' }),

  /* preparation state preserved where it matters */
  D('disp-greek-yogurt-keeps-greek', { description: 'Yogurt, Greek, plain, nonfat', brand: '', group: 'generic' },
    { nameRegex: 'greek', notRegex: '^Yogurt$' }, { subcategory: 'prep-preserved', tags: ['simplify', 'prep'] }),
  D('disp-cheddar-keeps-cheddar', { description: 'Cheese, cheddar', brand: '', group: 'generic' },
    { nameRegex: 'cheddar' }, { subcategory: 'prep-preserved', tags: ['simplify'] }),
  D('disp-salsa-not-oversimplified', { description: 'Sauce, salsa, ready-to-serve', brand: '', group: 'generic' },
    { nameRegex: 'salsa' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'] }),
  D('disp-mayo-keeps-identity', { description: 'Salad dressing, mayonnaise, regular', brand: '', group: 'generic' },
    { nameRegex: 'mayonnaise' }, { subcategory: 'no-oversimplify', tags: ['simplify', 'identity'] }),

  /* brand presentation (Phase 4.2.10a §4): brand is SECONDARY metadata — the
     primary name says what the food is; the brand lives on model.brand only. */
  D('disp-quest-brand', { description: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR', brand: 'Quest Nutrition', group: 'branded' },
    { nameRegex: 'cookie|bar', notRegex: 'quest', brandIncludes: 'Quest' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-fairlife-milk-brand', { description: 'FAIRLIFE WHOLE MILK', brand: 'fairlife', group: 'branded' },
    { nameRegex: 'milk', notRegex: 'fairlife', brandIncludes: 'fairlife' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-kodiak-no-dup', { description: 'KODIAK CAKES POWER CAKES', brand: 'Kodiak Cakes', group: 'branded' },
    { nameRegex: 'power cakes', notRegex: 'kodiak', brandIncludes: 'Kodiak' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-great-value-secondary', { description: 'Great Value Sourdough Bread', brand: 'Great Value', group: 'branded' },
    { name: 'Sourdough Bread', brandIncludes: 'Great Value' }, { subcategory: 'brand', tags: ['brand'] }),
  D('disp-brand-is-identity-kept', { description: 'Coca-Cola Classic', brand: 'Coca-Cola', group: 'branded' },
    { nameRegex: 'coca', brandIncludes: 'Coca-Cola' }, { subcategory: 'brand', tags: ['brand', 'identity'],
      notes: 'brand that IS the product identity is preserved in the name (≤1 word would remain).' }),

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

  /* cross-model primary-name consistency (Phase 4.2.10c) — the same candidate
     yields the SAME primary name in search/resolved, clarification choice, and
     compact chip models (one grammar, every surface). */
  D('disp-xmodel-chicken', { description: 'Chicken, broiler, breast, meat only, cooked, roasted', brand: '', group: 'generic' },
    { name: 'Chicken Breast', crossModel: true }, { subcategory: 'cross-model', tags: ['simplify', 'consistency'] }),
  D('disp-xmodel-salmon', { description: 'Salmon, Chinook, smoked, (lox), regional', brand: '', group: 'generic' },
    { name: 'Smoked Salmon (Lox)', crossModel: true, varietyIncludes: 'Chinook' }, { subcategory: 'cross-model', tags: ['simplify', 'variety', 'consistency'] }),
  D('disp-xmodel-great-value', { description: 'Great Value Sourdough Bread', brand: 'Great Value', group: 'branded' },
    { name: 'Sourdough Bread', crossModel: true, brandIncludes: 'Great Value' }, { subcategory: 'cross-model', tags: ['brand', 'consistency'] }),

  /* descriptor-tail cleanup (Phase 4.2.10a §3) — identity-free USDA tails removed
     WITHOUT destroying food identity (part/botanical-stage/use qualifiers). Were
     informational quality-gaps at the 4.2.9 baseline; now release-scored. */
  D('disp-potato-flesh-artifact', { description: 'Potatoes, boiled, cooked without skin, flesh', brand: '', group: 'generic' },
    { name: 'Potatoes', notRegex: 'Flesh|Without Skin' }, { subcategory: 'descriptor-tail', tags: ['simplify'],
      notes: 'part qualifier "flesh" + absence clause "without skin" carry no identity.' }),
  D('disp-olive-oil-tail-artifact', { description: 'Oil, olive, salad or cooking', brand: '', group: 'generic' },
    { name: 'Olive Oil', notRegex: 'Salad Or Cooking' }, { subcategory: 'descriptor-tail', tags: ['simplify'],
      notes: 'USDA oil-use descriptor "salad or cooking" removed.' }),
  D('disp-lentils-tail-artifact', { description: 'Lentils, mature seeds, cooked, boiled', brand: '', group: 'generic' },
    { name: 'Lentils', notRegex: 'Mature Seeds' }, { subcategory: 'descriptor-tail', tags: ['simplify'],
      notes: 'legume botanical stage "mature seeds" removed.' }),

  /* INFORMATIONAL — DELIBERATELY NOT simplified (Phase 4.2.10a): the milkfat
     basis of yogurt materially affects macros, so per §3 it is preserved rather
     than stripped. Flagged for a later reading-order/secondary-metadata pass. */
  D('disp-yogurt-whole-milk-artifact', { description: 'Yogurt, plain, whole milk', brand: '', group: 'generic' },
    { notRegex: 'Whole Milk' }, { subcategory: 'preserve-fat-basis', tags: ['simplify', 'deferred'], informational: true, diagnosticStage: 'display',
      notes: 'DEFERRED: "whole milk" is a meaningful fat basis for yogurt — not stripped (would misrepresent macros). Candidate for reading-order improvement, not removal.' }),
];
