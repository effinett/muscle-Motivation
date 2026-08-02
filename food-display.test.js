// food-display.test.js — unit tests for the shared Food PRESENTATION core
// (Phase 4.2.8). Pure module: no DOM, no fetch, no keys. Run via `npm test`.
//
// Coverage: number/quantity formatting, serving-label sanitization (the
// "1 1 serving" / "158.0 g" / "1 unit" / null cases), estimated detection,
// name simplification + brand de-duplication, macro/calorie formatting, the
// full food + log display models, and the PRESENTATION CONTRACT (no input
// mutation, stable output, canonical values preserved).

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fd = require('./food-display.js');

/* ── number + quantity formatting ───────────────────────────────────────── */

test('fdNum: strips trailing zeros; guards NaN/Infinity', () => {
  assert.strictEqual(fd.fdNum(158.0), '158');
  assert.strictEqual(fd.fdNum(1.5), '1.5');
  assert.strictEqual(fd.fdNum(1.50), '1.5');
  assert.strictEqual(fd.fdNum(2), '2');
  assert.strictEqual(fd.fdNum(0.333333), '0.33');
  assert.strictEqual(fd.fdNum(NaN), '');
  assert.strictEqual(fd.fdNum(Infinity), '');
});

test('fdQty: renders common fractions as glyphs', () => {
  assert.strictEqual(fd.fdQty(0.5), '½');
  assert.strictEqual(fd.fdQty(1.5), '1½');
  assert.strictEqual(fd.fdQty(0.25), '¼');
  assert.strictEqual(fd.fdQty(2), '2');
  assert.strictEqual(fd.fdQty(1.25), '1¼');     // whole + quarter glyph
  assert.strictEqual(fd.fdQty(0.1), '0.1');     // uncommon fraction → decimal
});

/* ── serving-label sanitization ─────────────────────────────────────────── */

test('fdServingLabel: household portion → "MAIN · DETAIL"', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1 cup (158 g)' }), '1 cup · 158 g');
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1 large (50 g)' }), '1 large · 50 g');
});

test('fdServingLabel: metric-only stays single token', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: '100 g' }), '100 g');
  assert.strictEqual(fd.fdServingLabel({ serving_description: '100 ml' }), '100 ml');
});

test('fdServingLabel: kills the "1 1 serving" double-number bug', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1 1 serving' }), '1 serving');
});

test('fdServingLabel: "1 unit" → "1 serving"; "serving serving" collapses', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1 unit' }), '1 serving');
  assert.strictEqual(fd.fdServingLabel({ serving_description: 'serving serving' }), 'serving');
});

test('fdServingLabel: trailing zeros trimmed inside numbers', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1.0 cup (158.0 g)' }), '1 cup · 158 g');
});

test('fdServingLabel: null / empty / empty-parens → "1 serving"', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: null }), '1 serving');
  assert.strictEqual(fd.fdServingLabel({ serving_description: '' }), '1 serving');
  assert.strictEqual(fd.fdServingLabel({ serving_description: 'null' }), '1 serving');
  assert.strictEqual(fd.fdServingLabel({ serving_description: '1 serving ()' }), '1 serving');
});

test('fdServingLabel: falls back to amount+unit with pluralization', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_amount: 2, serving_unit: 'slice' }), '2 slices');
  assert.strictEqual(fd.fdServingLabel({ serving_amount: 1, serving_unit: 'slice' }), '1 slice');
  assert.strictEqual(fd.fdServingLabel({ serving_amount: 2, serving_unit: 'g' }), '2 g'); // metric invariant
});

test('fdServingLabel: capitalize option (compact rows)', () => {
  assert.strictEqual(fd.fdServingLabel({ serving_description: 'splash (~15 ml)' }, { capitalize: true }),
    'Splash · ~15 ml');
});

/* ── estimated detection + compact serving ──────────────────────────────── */

test('fdIsEstimatedServing: "~" or "estimated" marks estimated', () => {
  assert.strictEqual(fd.fdIsEstimatedServing('splash (~15 ml)'), true);
  assert.strictEqual(fd.fdIsEstimatedServing('handful — estimated'), true);
  assert.strictEqual(fd.fdIsEstimatedServing('1 cup (158 g)'), false);
  assert.strictEqual(fd.fdIsEstimatedServing(null), false);
});

test('fdCompactServing: estimated portion stays visibly estimated + keeps ~amount', () => {
  const c = fd.fdCompactServing({ serving_description: 'splash (~15 ml)' });
  assert.strictEqual(c.estimated, true);
  assert.strictEqual(c.text, 'Splash · ~15 ml');
});

test('fdCompactServing: explicit estimated flag honoured even without "~"', () => {
  const c = fd.fdCompactServing({ serving_description: 'handful', estimated: true });
  assert.strictEqual(c.estimated, true);
});

test('fdCompactServing: exact portion is NOT estimated', () => {
  const c = fd.fdCompactServing({ serving_description: '1 cup (158 g)' });
  assert.strictEqual(c.estimated, false);
  assert.strictEqual(c.text, '1 cup · 158 g');
});

/* ── name simplification + brand de-duplication ─────────────────────────── */

test('fdStripBrandSuffix: removes trailing "(Brand)" only when it matches', () => {
  assert.strictEqual(fd.fdStripBrandSuffix('Whole Milk (Fairlife)', 'Fairlife'), 'Whole Milk');
  assert.strictEqual(fd.fdStripBrandSuffix('Whole Milk', 'Fairlife'), 'Whole Milk');
  assert.strictEqual(fd.fdStripBrandSuffix('Milk (2%)', 'Fairlife'), 'Milk (2%)'); // unrelated parens kept
});

test('fdSimplifyName: verbose generic USDA name → scannable', () => {
  assert.strictEqual(fd.fdSimplifyName('Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
    'Chicken Breast');
  assert.strictEqual(fd.fdSimplifyName('Apples, fuji, with skin, raw'), 'Fuji Apple');
});

test('fdSimplifyName: brand never appears twice', () => {
  // name carries "(Fairlife)" AND brand is Fairlife → simplified name drops it.
  assert.strictEqual(fd.fdSimplifyName('Milk, whole (Fairlife)', 'Fairlife'), 'Milk');
});

/* ── Phase 4.2.10a: adjacent duplicate-word collapse (generalizable) ─────── */
test('fdSimplifyName: an immediately-repeated word is collapsed', () => {
  assert.strictEqual(fd.fdSimplifyName('Maple Maple Syrup'), 'Maple Syrup');
  assert.strictEqual(fd.fdSimplifyName('Sourdough Sourdough Bread'), 'Sourdough Bread');
  assert.strictEqual(fd.fdSimplifyName('Cinnamon Cinnamon Granola'), 'Cinnamon Granola');
});
test('fdSimplifyName: a legitimate NON-adjacent repeat is preserved', () => {
  // "Cakes" repeats but is not adjacent → both kept.
  assert.strictEqual(fd.fdSimplifyName('Power Power Cakes Cakes'), 'Power Cakes');
  assert.ok(/Cakes/.test(fd.fdSimplifyName('Kodiak Cakes Power Cakes', 'Kodiak Cakes')));
});

/* ── Phase 4.2.10a: brand is secondary metadata, never the primary name ──── */
test('fdStripBrandPrefix: strips a leading brand run, leaving the product name', () => {
  assert.strictEqual(fd.fdStripBrandPrefix('FAIRLIFE WHOLE MILK', 'fairlife'), 'WHOLE MILK');
  assert.strictEqual(fd.fdStripBrandPrefix('Great Value Sourdough Bread', 'Great Value'), 'Sourdough Bread');
  assert.strictEqual(fd.fdStripBrandPrefix('KODIAK CAKES POWER CAKES', 'Kodiak Cakes'), 'POWER CAKES');
});
test('fdStripBrandPrefix: keeps the brand when it IS the identity (≤1 word left)', () => {
  // "Classic" alone is not a food → the brand must stay.
  assert.strictEqual(fd.fdStripBrandPrefix('Coca-Cola Classic', 'Coca-Cola'), 'Coca-Cola Classic');
  assert.strictEqual(fd.fdStripBrandPrefix('Pepsi', 'Pepsi'), 'Pepsi');
  // no brand / no prefix match → unchanged
  assert.strictEqual(fd.fdStripBrandPrefix('Whole Milk', ''), 'Whole Milk');
  assert.strictEqual(fd.fdStripBrandPrefix('Almond Butter', 'Trader Joe'), 'Almond Butter');
});
test('fdSimplifyName: brand-forward USDA name simplifies to the product', () => {
  assert.strictEqual(fd.fdSimplifyName('FAIRLIFE WHOLE MILK', 'fairlife'), 'Whole Milk');
  assert.strictEqual(fd.fdSimplifyName('Great Value Sourdough Bread', 'Great Value'), 'Sourdough Bread');
});

/* ── Phase 4.2.10a: descriptor-tail cleanup (identity preserved) ──────────── */
test('fdSimplifyName: identity-free USDA descriptor tails are removed', () => {
  assert.strictEqual(fd.fdSimplifyName('Potatoes, boiled, cooked without skin, flesh'), 'Potatoes');
  assert.strictEqual(fd.fdSimplifyName('Oil, olive, salad or cooking'), 'Olive Oil');
  assert.strictEqual(fd.fdSimplifyName('Lentils, mature seeds, cooked, boiled'), 'Lentils');
  assert.strictEqual(fd.fdSimplifyName('Egg, whole, raw, fresh, large, Grade A'), 'Egg');
});
test('fdSimplifyName: meaningful variety/form is NOT over-simplified', () => {
  // brown vs white rice, greek yogurt, cheddar — distinctions must survive.
  assert.ok(/brown/i.test(fd.fdSimplifyName('Rice, brown, long-grain, cooked')));
  assert.ok(/greek/i.test(fd.fdSimplifyName('Yogurt, Greek, plain, nonfat')));
  assert.ok(/cheddar/i.test(fd.fdSimplifyName('Cheese, cheddar')));
});

/* ── Phase 4.2.10a: contextual cottage-cheese reduction (not a global drop) ── */
test('fdSimplifyName: cottage cheese absorbs redundant "creamed"', () => {
  assert.strictEqual(fd.fdSimplifyName('Cheese, cottage, creamed, large or small curd'), 'Cottage Cheese');
  assert.strictEqual(fd.fdSimplifyName('Cottage Creamed Cheese'), 'Cottage Cheese');
});
test('fdSimplifyName: "creamed" is preserved for other creamed dishes', () => {
  assert.ok(/creamed/i.test(fd.fdSimplifyName('Creamed Corn')), 'creamed corn keeps creamed');
  assert.ok(/creamed/i.test(fd.fdSimplifyName('Creamed Spinach')), 'creamed spinach keeps creamed');
  assert.ok(/creamed/i.test(fd.fdSimplifyName('Creamed Onions')), 'creamed onions keeps creamed');
  assert.ok(/creamed/i.test(fd.fdSimplifyName('Corn, sweet, creamed')), 'USDA creamed corn keeps creamed');
});

/* ── Phase 4.2.10a: species as secondary metadata + evidence-gated lox ─────── */
test('fdExtractVariety: known salmon species moves to secondary (multi-word residue)', () => {
  assert.deepStrictEqual(fd.fdExtractVariety('Chinook Smoked Salmon'), { name: 'Smoked Salmon', variety: 'Chinook' });
  assert.deepStrictEqual(fd.fdExtractVariety('Atlantic Smoked Salmon'), { name: 'Smoked Salmon', variety: 'Atlantic' });
  // 1-word residue → NOT demoted; a directly-named variety (apple) is untouched.
  assert.deepStrictEqual(fd.fdExtractVariety('Chinook Salmon'), { name: 'Chinook Salmon', variety: '' });
  assert.deepStrictEqual(fd.fdExtractVariety('Fuji Apple'), { name: 'Fuji Apple', variety: '' });
});
test('fdApplyLox: "(Lox)" only with a real lox identity signal, never inferred', () => {
  assert.strictEqual(fd.fdApplyLox('Smoked Salmon', ['Salmon, Chinook, smoked, (lox)']), 'Smoked Salmon (Lox)');
  assert.strictEqual(fd.fdApplyLox('Smoked Salmon', ['lox bagel']), 'Smoked Salmon (Lox)');
  assert.strictEqual(fd.fdApplyLox('Smoked Salmon', ['Salmon, Atlantic, smoked']), 'Smoked Salmon'); // no signal
  assert.strictEqual(fd.fdApplyLox('Grilled Salmon', ['lox']), 'Grilled Salmon'); // only smoked salmon can be lox
});
test('buildFoodDisplay: Chinook smoked salmon → primary "Smoked Salmon", secondary "Chinook"', () => {
  const m = fd.buildFoodDisplay({ usda_fdc_id: 175168, description: 'Chinook Smoked Salmon', name: 'Chinook Smoked Salmon', brand: '', calories: 117 });
  assert.strictEqual(m.name, 'Smoked Salmon');
  assert.strictEqual(m.variety, 'Chinook');
  assert.ok(!/lox/i.test(m.name), 'no lox is inferred from smoked salmon alone');
  assert.strictEqual(m.fullName, 'Chinook Smoked Salmon', 'canonical name preserved');
  assert.strictEqual(m.calories, 117);
});
test('buildFoodDisplay: explicit lox stays visible; species available in model', () => {
  const m = fd.buildFoodDisplay({ usda_fdc_id: 175168, description: 'Salmon, Chinook, smoked, (lox), regional', name: 'Salmon, Chinook, smoked, (lox), regional', brand: '', calories: 117 });
  assert.strictEqual(m.name, 'Smoked Salmon (Lox)');
  assert.strictEqual(m.variety, 'Chinook');
  assert.strictEqual(m.fullName, 'Salmon, Chinook, smoked, (lox), regional', 'canonical + id untouched');
});
test('buildFoodDisplay: generic smoked salmon never gains "(Lox)"', () => {
  const m = fd.buildFoodDisplay({ usda_fdc_id: 175167, description: 'Salmon, Atlantic, smoked', name: 'Salmon, Atlantic, smoked', brand: '', calories: 117 });
  assert.ok(!/lox/i.test(m.name), 'generic smoked salmon has no lox');
  assert.strictEqual(m.variety, 'Atlantic');
});

test('buildFoodDisplay: brand-forward branded food keeps identity out of the name', () => {
  const m = fd.buildFoodDisplay({
    usda_fdc_id: 9, description: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR', name: 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR',
    brand: 'Quest Nutrition', group: 'branded', calories: 190,
  });
  assert.strictEqual(m.brand, 'Quest Nutrition');
  assert.ok(!/quest/i.test(m.name), 'brand must not appear in the primary name');
  assert.ok(/cookie|bar/i.test(m.name), 'the product name survives');
  // canonical identity is preserved verbatim for downstream fidelity
  assert.strictEqual(m.fullName, 'QUEST CHOCOLATE CHIP COOKIE DOUGH BAR');
});

/* ── macros + calories ──────────────────────────────────────────────────── */

test('fdMacroSummary: one consistent format (whole grams by default)', () => {
  assert.strictEqual(fd.fdMacroSummary({ protein: 30.4, carbs: 12.6, fat: 8.1 }), 'P 30 · C 13 · F 8');
  assert.strictEqual(fd.fdMacroSummary({ protein: 30.4, carbs: 12.6, fat: 8.1 }, { round1: true }),
    'P 30.4 · C 12.6 · F 8.1');
});

test('fdCalories: rounds to whole kcal', () => {
  assert.strictEqual(fd.fdCalories(210.6), 211);
});

/* ── full food display model ────────────────────────────────────────────── */

test('buildFoodDisplay: branded food — brand shown once, USDA badge, clean serving', () => {
  const food = {
    usda_fdc_id: 123, name: 'Milk, whole (Fairlife)', description: 'Milk, whole',
    brand: 'Fairlife', serving_description: '1 cup (240 ml)',
    calories: 150, protein: 13, carbs: 12, fat: 8,
  };
  const m = fd.buildFoodDisplay(food);
  assert.strictEqual(m.name, 'Milk');
  assert.strictEqual(m.brand, 'Fairlife');
  assert.ok(!/Fairlife/.test(m.name), 'brand must not appear in the name');
  assert.strictEqual(m.serving, '1 cup · 240 ml');
  assert.strictEqual(m.caloriesLabel, '150 kcal');
  assert.deepStrictEqual(m.badges, ['USDA']);
  assert.ok(m.fullName.length > 0);
});

test('buildFoodDisplay: raw vs cooked distinction is preserved in fullName', () => {
  const raw = fd.buildFoodDisplay({ description: 'Chicken breast, raw', name: 'Chicken breast, raw' });
  const cooked = fd.buildFoodDisplay({ description: 'Chicken breast, cooked', name: 'Chicken breast, cooked' });
  assert.notStrictEqual(raw.fullName, cooked.fullName);
});

test('buildFoodDisplay: estimated vague portion flagged', () => {
  const m = fd.buildFoodDisplay({ name: 'Almonds', serving_description: 'handful (~28 g)', calories: 164 });
  assert.strictEqual(m.estimated, true);
});

test('buildFoodDisplay: fallback name when everything is empty', () => {
  const m = fd.buildFoodDisplay({});
  assert.strictEqual(m.name, 'Food');
  assert.strictEqual(m.serving, '1 serving');
});

/* ── log display model ──────────────────────────────────────────────────── */

test('buildLogDisplay: USDA row simplified; manual row verbatim', () => {
  const usda = fd.buildLogDisplay({ source: 'usda', name: 'Apples, fuji, with skin, raw',
    calories: 95, protein: 0.5, carbs: 25, fat: 0.3, servings: 1 });
  assert.strictEqual(usda.name, 'Fuji Apple');
  const manual = fd.buildLogDisplay({ source: 'manual', name: "Grandma's stew", calories: 400, servings: 2 });
  assert.strictEqual(manual.name, "Grandma's stew");
  assert.strictEqual(manual.servingsLabel, '2×');
});

test('buildLogDisplay: estimated portion visible in compact row', () => {
  const m = fd.buildLogDisplay({ source: 'usda', name: 'Milk', brand: '',
    serving_description: 'splash (~15 ml)', calories: 9, servings: 1 });
  assert.strictEqual(m.estimated, true);
  assert.strictEqual(m.serving, 'Splash · ~15 ml');
});

/* ── PRESENTATION CONTRACT — the load-bearing guarantees ─────────────────── */

test('contract: buildFoodDisplay does NOT mutate its input', () => {
  const food = {
    usda_fdc_id: 5, name: 'Milk, whole (Fairlife)', description: 'Milk, whole',
    brand: 'Fairlife', serving_description: '1 cup (240 ml)',
    calories: 150, protein: 13, carbs: 12, fat: 8,
  };
  const snapshot = JSON.parse(JSON.stringify(food));
  fd.buildFoodDisplay(food);
  assert.deepStrictEqual(food, snapshot, 'input food record must be untouched');
});

test('contract: buildLogDisplay does NOT mutate its input row', () => {
  const row = { source: 'usda', name: 'Apples, fuji, with skin, raw', brand: '',
    serving_description: 'splash (~15 ml)', calories: 9, protein: 0, carbs: 2, fat: 0, servings: 1 };
  const snapshot = JSON.parse(JSON.stringify(row));
  fd.buildLogDisplay(row);
  assert.deepStrictEqual(row, snapshot, 'input log row must be untouched');
});

test('contract: aria text carries the FULL canonical name (mobile has no hover)', () => {
  const m = fd.buildFoodDisplay({ usda_fdc_id: 1,
    name: 'Chicken, broilers or fryers, breast, meat only, cooked',
    description: 'Chicken, broilers or fryers, breast, meat only, cooked', calories: 165 });
  assert.notStrictEqual(m.name, m.fullName);            // visible name is simplified
  assert.ok(m.ariaLabel.indexOf('broilers') >= 0, 'aria must expose the full identity');
});

test('contract: canonical name/id/macros are preserved, never overwritten', () => {
  const food = { usda_fdc_id: 42, name: 'Chicken, broilers or fryers, breast, cooked',
    description: 'Chicken, broilers or fryers, breast, cooked', calories: 165, protein: 31 };
  const m = fd.buildFoodDisplay(food);
  assert.strictEqual(food.usda_fdc_id, 42);            // id untouched
  assert.strictEqual(m.fullName, food.description);    // canonical still available
  assert.strictEqual(food.calories, 165);              // macros untouched
});

test('contract: output is stable for identical input', () => {
  const food = { name: 'Broccoli, boiled, drained', description: 'Broccoli, boiled, drained',
    serving_description: '1 cup (156 g)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6 };
  assert.deepStrictEqual(fd.buildFoodDisplay(food), fd.buildFoodDisplay(food));
});

test('contract: malformed optional fields never render null/undefined', () => {
  const m = fd.buildFoodDisplay({ name: 'Egg', brand: null, serving_description: undefined,
    calories: 'x', protein: null });
  assert.ok(!/null|undefined|NaN/.test(m.serving));
  assert.ok(!/null|undefined|NaN/.test(m.macroSummary));
  assert.ok(!/null|undefined/.test(m.caloriesLabel));
});

/* ── Phase 4.2.10c: shared presentation contract ─────────────────────────── */

test('fdPresentName: one primary name + extracted variety, canonical preserved', () => {
  const p = fd.fdPresentName({ description: 'Salmon, Chinook, smoked, (lox), regional' });
  assert.strictEqual(p.name, 'Smoked Salmon (Lox)');
  assert.strictEqual(p.variety, 'Chinook');
  assert.strictEqual(p.fullName, 'Salmon, Chinook, smoked, (lox), regional');
});

test('buildChoiceDisplay: primary name + Brand · Variety · kcal/100 g', () => {
  const salmon = fd.buildChoiceDisplay({ description: 'Salmon, Chinook, smoked, (lox), regional', brand: '', nutrients: { kcal: 117 } });
  assert.strictEqual(salmon.name, 'Smoked Salmon (Lox)');
  assert.deepStrictEqual(salmon.secondaryParts, ['Chinook', '117 kcal/100 g']);
  const gv = fd.buildChoiceDisplay({ description: 'Great Value Sourdough Bread', brand: 'Great Value', nutrients: { kcal: 267 } });
  assert.strictEqual(gv.name, 'Sourdough Bread');
  assert.deepStrictEqual(gv.secondaryParts, ['Great Value', '267 kcal/100 g']);
});

test('buildChoiceDisplay: per-100 g basis (NOT the resolved total) — intentional', () => {
  const c = fd.buildChoiceDisplay({ description: 'Coffee, brewed', brand: '', nutrients: { kcal: 1 } });
  assert.strictEqual(c.kcalPer100g, 1);
  assert.strictEqual(c.caloriesBasis, '100g');
  assert.ok(c.secondaryParts.some((p) => /kcal\/100 g/.test(p)), 'choice shows a normalized 100 g basis');
});

test('fdSecondaryParts: order, empty omission, and no duplicate-with-name', () => {
  // brand already in the name → suppressed; variety kept; total kcal.
  const parts = fd.fdSecondaryParts({ name: 'Coca-Cola Classic', brand: 'Coca-Cola', variety: '', calories: 140 }, { calories: 'total' });
  assert.ok(!parts.includes('Coca-Cola'), 'brand already in name is not repeated');
  assert.deepStrictEqual(fd.fdSecondaryParts({ name: 'Smoked Salmon', brand: '', variety: 'Chinook', calories: 117 }, { calories: 'total' }),
    ['Chinook', '117 kcal']);
  assert.deepStrictEqual(fd.fdSecondaryParts({ name: 'Bread', brand: '', variety: '' }, {}), []);
});

test('fdCompactLabel: shared primary name, single value, full accessible label', () => {
  const cl = fd.fdCompactLabel({ name: 'Chicken, broiler, breast, meat only, cooked, roasted' });
  assert.strictEqual(cl.name, 'Chicken Breast');
  assert.ok(/Chicken, broiler, breast/.test(cl.ariaLabel), 'aria keeps the full canonical name');
});

test('consistency: one food → one primary name across every model', () => {
  const food = { source: 'usda', usda_fdc_id: 5, description: 'Chicken, broiler, breast, meat only, cooked, roasted',
    name: 'Chicken, broiler, breast, meat only, cooked, roasted', brand: '', nutrients: { kcal: 165 }, calories: 165, servings: 1 };
  const a = fd.buildFoodDisplay(food).name;
  const b = fd.buildChoiceDisplay(food).name;
  const c = fd.fdCompactLabel(food).name;
  const d = fd.buildLogDisplay(food).name;
  assert.strictEqual(a, 'Chicken Breast');
  assert.ok(a === b && b === c && c === d, `all models agree: ${JSON.stringify([a, b, c, d])}`);
});

test('log rows now extract variety (consistent with search/choice)', () => {
  const l = fd.buildLogDisplay({ source: 'usda', name: 'Salmon, Chinook, smoked, (lox), regional', servings: 1, calories: 117 });
  assert.strictEqual(l.name, 'Smoked Salmon (Lox)');
  assert.strictEqual(l.variety, 'Chinook');
});

test('presentation models never mutate the input food + keep canonical identity', () => {
  const food = Object.freeze({ usda_fdc_id: 9, source: 'usda', description: 'FAIRLIFE WHOLE MILK', name: 'FAIRLIFE WHOLE MILK', brand: 'fairlife', nutrients: Object.freeze({ kcal: 60 }) });
  // Object.freeze makes any mutation throw — proves the pure layer never writes back.
  assert.doesNotThrow(() => { fd.buildFoodDisplay(food); fd.buildChoiceDisplay(food); fd.fdCompactLabel(food); });
  assert.strictEqual(fd.buildChoiceDisplay(food).fullName, 'FAIRLIFE WHOLE MILK', 'canonical fullName preserved verbatim');
  assert.ok(!/fairlife/i.test(fd.buildChoiceDisplay(food).name), 'brand is secondary, not in the primary name');
});
