// One-tap add from a food-search row (roadmap 5.4 logging UI).
// Run via `npm test` (node --test). No network, no database.
//
// The + button is not a second save path: it must open the SAME card a row tap
// opens and then call the SAME nuSave. These tests pin that, plus the three
// safety rules (real household serving first, never log an unapplied typed
// unit, hidden while editing) and the emoji-free injected markup.

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
let detail = [];
global.fetch = async (u) => {
  if (String(u).startsWith('/api/usda-food')) return { ok: true, json: async () => ({ portions: detail }) };
  throw new Error('unexpected fetch ' + u);
};
global.supabaseClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  from: () => { throw new Error('DB must not be touched'); },
};
const toasts = [];
global.showToast = (m) => { toasts.push(m); };
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = [];

// Capture what the ONE save path would persist, at the moment it is called.
const realSave = nuSave;
const saved = [];
const saveOpts = [];
nuSave = async function (opts) {
  saveOpts.push(opts || null);
  saved.push({
    name: el('nuName').value, meal: el('nuMeal').value, servings: +el('nuServings').value,
    calories: +el('nuCalories').value, serving: el('nuServingSelect').value,
    grams: nu_pendingSource ? nu_pendingSource.grams : null,
    fdc: nu_pendingSource ? String(nu_pendingSource.usda_fdc_id) : null,
  });
};

const egg = () => ({ fdcId: 12, description: 'Egg, whole, raw', dataType: 'SR Legacy',
  nutrients: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0, sugar: 0.4 } });
const bar = () => ({ fdcId: 30, description: 'PROTEIN BAR', dataType: 'Branded', brand: 'Acme',
  servingSize: 60, servingSizeUnit: 'g', householdServing: '1 bar',
  nutrients: { kcal: 350, protein: 33, carbs: 37, fat: 12, fiber: 5, sugar: 3 } });

function search(text, raws) {
  nuResetModalState();
  for (const k of Object.keys(nu_detailCache)) delete nu_detailCache[k];
  saved.length = 0; toasts.length = 0; saveOpts.length = 0;
  el('nuFoodId').value = '';
  el('nuMeal').value = 'lunch';
  el('nuUsdaInput').value = text;
  nuUsdaInputChanged();
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  nu_usdaResults = raws.map(nuNormalizeUsdaFood);
  nuRenderUsdaResults();
}

test('every result row carries a + that targets its own index', () => {
  search('protein', [bar(), egg()]);
  const html = el('nuUsdaResults').innerHTML;
  assert.match(html, /onclick="nuQuickAdd\('usda',0\)"/);
  assert.match(html, /onclick="nuQuickAdd\('usda',1\)"/);
  assert.match(html, /aria-label="Add [^"]+"/, 'the button is labelled for screen readers');
  assert.match(html, /onclick="nuPickUsda\(0\)"/, 'tapping the row itself still opens the card');
});

test('+ on a branded food logs its label serving to the chosen meal through nuSave', async () => {
  search('protein bar', [bar()]);
  await nuQuickAdd('usda', 0);
  assert.strictEqual(saved.length, 1);
  assert.deepStrictEqual(saved[0], { name: saved[0].name, meal: 'lunch', servings: 1, calories: 210, serving: 'serving', grams: 60, fdc: '30' });
});

test('+ prepares the card off-screen and asks the save to keep search open', async () => {
  search('protein bar', [bar()]);
  el('nuUsdaView').style.display = 'block'; el('nuAddView').style.display = 'none';
  await nuQuickAdd('usda', 0);
  assert.deepStrictEqual(saveOpts, [{ keepOpen: true }]);
  assert.strictEqual(el('nuAddView').style.display, 'none', 'the card never flashed on screen');
  assert.strictEqual(el('nuUsdaView').style.display, 'block', 'the user stayed on the search list');
  assert.strictEqual(nu_quickSilent, false, 'the silent flag never outlives the tap');
});

test('a successful one-tap save leaves the modal open on a fresh search', async () => {
  search('protein bar', [bar()]);
  let closed = 0, logged = null;
  const origClose = nuCloseModal, origLog = nuSaveLog, origStub = nuSave;
  nuCloseModal = () => { closed++; };
  nuSaveLog = async (uid, entry) => { logged = entry; return { error: null }; };
  nuSave = realSave;
  try {
    await nuQuickAdd('usda', 0);
  } finally { nuCloseModal = origClose; nuSaveLog = origLog; nuSave = origStub; }
  assert.ok(logged, 'the entry went through the real save path');
  assert.strictEqual(logged.meal, 'lunch');
  assert.strictEqual(logged.calories, 210);
  assert.ok(logged.src && String(logged.src.usda_fdc_id) === '30', 'USDA provenance travels with it');
  assert.strictEqual(closed, 0, 'the modal was not closed');
  assert.strictEqual(el('nuUsdaInput').value, '', 'the search box is cleared for the next food');
  assert.strictEqual(nu_pendingSource, null);
  assert.match(toasts.join(' '), /Added to Lunch\./);

  // The ordinary Add Food button is unchanged: it still closes the modal.
  search('protein bar', [bar()]);
  nuPickUsda(0);
  nuCloseModal = () => { closed++; }; nuSaveLog = async () => ({ error: null });
  try { await realSave(); } finally { nuCloseModal = origClose; nuSaveLog = origLog; }
  assert.strictEqual(closed, 1);
  assert.match(toasts.join(' '), /Food logged!/);
});

test('+ on a generic food waits for its real household serving (never a silent 100 g)', async () => {
  detail = [{ label: '1 large', amount: 1, gramWeight: 50 }];
  search('egg', [egg()]);
  await nuQuickAdd('usda', 0);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].grams, 50, 'logged as 1 large (50 g)');
  assert.strictEqual(saved[0].calories, 72);
  assert.strictEqual(saved[0].servings, 1);
});

test('+ honours a typed amount', async () => {
  detail = [{ label: '1 large', amount: 1, gramWeight: 50 }];
  search('3 eggs', [egg()]);
  await nuQuickAdd('usda', 0);
  assert.strictEqual(saved[0].servings, 3);
  assert.strictEqual(saved[0].grams, 50);

  search('120g egg', [egg()]);
  await nuQuickAdd('usda', 0);
  assert.strictEqual(saved[0].serving, 'custom');
  assert.strictEqual(saved[0].grams, 120);
  assert.strictEqual(saved[0].servings, 1);
});

test('+ never logs when a typed unit could not be applied — the card stays open', async () => {
  detail = [{ label: '1 large', amount: 1, gramWeight: 50 }];
  search('2 cups egg', [egg()]);
  await nuQuickAdd('usda', 0);
  assert.strictEqual(saved.length, 0, 'nothing is saved');
  assert.match(toasts.join(' '), /Pick a serving for 2 cup/);
  assert.ok(nu_pendingSource, 'the card is open on that food');
  assert.strictEqual(el('nuAddView').style.display, 'block', 'and it is actually shown');
});

test('+ on one of the user\'s own foods uses the same path', async () => {
  nu_ownFoods = nuMergeOwnFoods([], [{ food_key: 'custom:protein shake', name: 'Protein Shake', calories: 220, protein: 30, carbs: 9, fat: 6 }]);
  search('2 protein shakes', []);
  assert.match(el('nuOwnResults').innerHTML, /onclick="nuQuickAdd\('own',0\)"/);
  await nuQuickAdd('own', 0);
  assert.deepStrictEqual(saved[0], { name: 'Protein Shake', meal: 'lunch', servings: 2, calories: 220, serving: saved[0].serving, grams: null, fdc: null });

  search('200g protein shake', []);                 // a weight on a custom food
  await nuQuickAdd('own', 0);
  assert.strictEqual(saved.length, 0, 'not logged as one serving');
  nu_ownFoods = [];
});

test('no + while editing an existing entry; double taps do not double-log', async () => {
  search('protein bar', [bar()]);
  el('nuFoodId').value = 'log-123';
  nuRenderUsdaResults();
  assert.ok(!/nuQuickAdd/.test(el('nuUsdaResults').innerHTML), 'editing hides one-tap add');
  el('nuFoodId').value = '';
  nuRenderUsdaResults();

  let release;
  const orig = nuSave;
  nuSave = async function () { await new Promise((r) => { release = r; }); return orig(); };
  const first = nuQuickAdd('usda', 0);
  await new Promise((r) => setTimeout(r, 5));
  await nuQuickAdd('usda', 0);                     // ignored while the first is in flight
  release(); await first;
  nuSave = orig;
  assert.strictEqual(saved.length, 1);
});

test('injected food-modal markup contains no emoji', () => {
  const html = nuModalMarkup();
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(html.replace(/[☆★]/g, '')),
    'no emoji glyphs (the favourite star is a text glyph, not an emoji)');
  assert.match(html, /class="nu-scan-ico"[^>]*aria-label="Scan a barcode"/, 'barcode scan lives inside the search field');
  assert.match(html, /class="modal-close"[^>]*aria-label="Close"><svg/);
});
