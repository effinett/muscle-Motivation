// Saved meals inside food search (roadmap 5.4.3 groundwork).
// Run via `npm test` (node --test). No network, no database.
//
// A saved meal whose name matches the search text is listed above "Your foods".
// The search row never logs anything itself: a pick is handed to the page hook,
// which opens the same confirm sheet a saved-meal chip opens.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
global.window = global;
global.document = { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
global.fetch = async () => { throw new Error('no network in these tests'); };
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched'); },
};
global.showToast = () => {};
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = [];

const meals = () => [
  { id: 'm1', name: 'Usual Breakfast', items: [
    { name: 'Egg', calories: 72, protein: 6, servings: 2 }, { name: 'Oats', calories: 307, protein: 11, servings: 1 }] },
  { id: 'm2', name: 'Post-workout shake', items: [{ name: 'Whey', calories: 120, protein: 24, servings: 1 }] },
  { id: 'm3', name: 'Empty breakfast draft', items: [] },
];
const picked = [];
function setup(opts) {
  nuResetModalState();
  picked.length = 0;
  el('nuFoodId').value = '';
  el('nuMeal').value = 'dinner';
  nu_usdaResults = [];
  nu_savedMeals = meals();
  if (opts && opts.noHook) delete global.onPickSavedMeal;
  else global.onPickSavedMeal = (m, ctx) => { picked.push([m.id, ctx]); };
}
function type(text) {
  el('nuUsdaInput').value = text;
  nuUsdaInputChanged();
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  return el('nuOwnResults').innerHTML;
}

test('a saved meal whose name matches is listed above "Your foods" with its total', () => {
  setup();
  nu_ownFoods = nuMergeOwnFoods([], [{ food_key: 'custom:breakfast burrito', name: 'Breakfast Burrito', calories: 400 }]);
  const html = type('breakfast');
  assert.match(html, /Saved meals/);
  assert.match(html, />Usual Breakfast</);
  assert.match(html, /Saved meal · 2 foods/);
  assert.match(html, />451<small>kcal/, '72×2 + 307');
  assert.ok(html.indexOf('Saved meals') < html.indexOf('Your foods'), 'meals come first');
  assert.ok(!/Empty breakfast draft/.test(html), 'a meal with no foods is never offered');
  assert.ok(!/nuQuickAdd\('meal'/.test(html), 'no one-tap add on a meal — it always goes through the confirm sheet');
  nu_ownFoods = [];
});

test('nothing is shown for an empty box, a non-match, or while editing an entry', () => {
  setup();
  assert.ok(!/Saved meals/.test(type('')));
  assert.ok(!/Saved meals/.test(type('chicken')));
  el('nuFoodId').value = 'log-1';
  assert.ok(!/Saved meals/.test(type('breakfast')), 'editing an entry never offers to swap it for a meal');
});

test('a quantity typed before the name does not block the match', () => {
  setup();
  assert.match(type('2 post workout'), />Post-workout shake</);
});

test('picking a meal hands it to the page with the meal being added to — and logs nothing', () => {
  setup();
  let saves = 0;
  const origLog = nuSaveLog;
  nuSaveLog = async () => { saves++; return { error: null }; };
  try {
    type('usual');
    nuPickSavedMeal(0);
    nuPickSavedMeal(7);                              // out of range: ignored
  } finally { nuSaveLog = origLog; }
  assert.deepStrictEqual(picked, [['m1', { meal: 'dinner' }]]);
  assert.strictEqual(saves, 0);
});

test('a page without the hook shows no meal rows (search works exactly as before)', () => {
  setup({ noHook: true });
  assert.ok(!/Saved meals/.test(type('breakfast')));
  nuPickSavedMeal(0);                                // harmless
});

test('page wiring: chips and search share one cache and one confirm sheet', () => {
  const page = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8');
  assert.match(page, /savedMeals = await nuLoadSavedMeals\(true\);/, 'chips refresh the shared cache');
  assert.match(page, /function pickMeal\(i\) \{ openMealSheet\(savedMeals\[i\]\); \}/, 'a chip opens the same sheet');
  const hook = page.match(/window\.onPickSavedMeal = function \(m, ctx\) \{([\s\S]*?)\n  \};/)[1];
  assert.match(hook, /nuCloseModal\(\);\s*openMealSheet\(m, ctx && ctx\.meal\);/);
  assert.ok(!/nuLogSavedMeal|nuSaveLog/.test(hook), 'the hook only opens the sheet; confirmAddMeal still does the logging');
  assert.match(page, /\(slot && NU_MEAL_LABELS\[slot\]\) \? slot : suggestMeal\(\)/, 'only a real meal slot is honoured');
});

test('nuLoadSavedMeals: one fetch is shared; force refreshes', async () => {
  let fetches = 0;
  const orig = nuFetchSavedMeals;
  nuFetchSavedMeals = async () => { fetches++; return meals(); };
  try {
    nu_savedMeals = null;
    const [a, b] = await Promise.all([nuLoadSavedMeals(), nuLoadSavedMeals()]);
    assert.strictEqual(fetches, 1);
    assert.strictEqual(a, b);
    await nuLoadSavedMeals();
    assert.strictEqual(fetches, 1, 'cached');
    await nuLoadSavedMeals(true);
    assert.strictEqual(fetches, 2);
  } finally { nuFetchSavedMeals = orig; }
});
