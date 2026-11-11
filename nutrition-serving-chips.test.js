// Serving chips on the food card (roadmap 5.4 logging UI).
// Run via `npm test` (node --test). No network, no database.
//
// The <select id="nuServingSelect"> remains the single source of truth; the
// chips are a tappable mirror of it. These tests pin that contract: chips are
// rendered from the same options, a tap goes through the same nuServingChanged
// path the dropdown used, long lists fold, and the chosen serving is never
// hidden.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() { this.focused = true; }, setAttribute() {}, appendChild() {}, options: [] };
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
global.showToast = () => {};
['food-core.js', 'food-display.js', 'food-ranking.js', 'food-memory.js', 'food-meal.js', 'nutrition.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
});
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = [];

const rice = () => ({ fdcId: 13, description: 'Rice, white, cooked', dataType: 'SR Legacy',
  nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0 } });
const cola = () => ({ fdcId: 15, description: 'COLA', dataType: 'Branded', brand: 'Acme',
  servingSize: 355, servingSizeUnit: 'ml', householdServing: '1 can',
  nutrients: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6 } });

function open(raw) {
  nuResetModalState();
  for (const k of Object.keys(nu_detailCache)) delete nu_detailCache[k];
  nu_usdaResults = [nuNormalizeUsdaFood(raw)];
  nuPickUsda(0);
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const chipHtml = () => el('nuServingChips').innerHTML;
const chipKeys = () => (chipHtml().match(/data-key="[^"]+"/g) || []).map((s) => s.slice(10, -1));

test('one chip per serving option, in the same order as the select', async () => {
  detail = [{ label: '1 cup', amount: 1, gramWeight: 158 }];
  open(rice());
  await settle();
  assert.deepStrictEqual(chipKeys(), nu_servingOptions.map((o) => o.key));
  assert.strictEqual((el('nuServingSelect').innerHTML.match(/<option /g) || []).length, nu_servingOptions.length,
    'the select still holds every option');
  assert.match(chipHtml(), />1 cup \(158 g\)</);
  assert.match(chipHtml(), />Custom grams</, 'the custom entry is named by its unit');
  assert.ok(!/nu-serving-more/.test(chipHtml()) || nu_servingOptions.length > NU_SERVING_CHIPS_MAX);
});

test('a liquid names its custom chip in ml', () => {
  detail = [];
  open(cola());
  assert.match(chipHtml(), />Custom ml</);
});

test('tapping a chip is the same path as changing the dropdown', async () => {
  detail = [{ label: '1 cup', amount: 1, gramWeight: 158 }];
  open(rice());
  await settle();
  assert.strictEqual(nu_servingTouched, false);
  const i = nu_servingOptions.findIndex((o) => o.key === '100g');
  nuPickServing(i);
  assert.strictEqual(el('nuServingSelect').value, '100g');
  assert.strictEqual(nu_servingTouched, true, 'a tap is a manual choice — late portions will not override it');
  assert.strictEqual(+el('nuCalories').value, 130);
  assert.strictEqual(nu_pendingSource.grams, 100);

  el('nuCustomGrams').focused = false;
  nuPickServing(nu_servingOptions.findIndex((o) => o.custom));
  assert.strictEqual(el('nuServingSelect').value, 'custom');
  assert.strictEqual(el('nuCustomGrams').focused, true, 'custom moves the cursor into the amount box');
  nuPickServing(99);                                   // out of range: ignored
  assert.strictEqual(el('nuServingSelect').value, 'custom');
});

test('long lists fold behind "More"; Custom stays visible; a new card starts folded', async () => {
  detail = [1, 2, 3, 4, 5].map((n) => ({ label: n + ' piece', amount: 1, gramWeight: 10 * n }));
  open(rice());
  await settle();
  assert.ok(nu_servingOptions.length > NU_SERVING_CHIPS_MAX);
  const html = chipHtml();
  const extras = (html.match(/nu-serving-chip is-extra/g) || []).length;
  assert.strictEqual(extras, nu_servingOptions.length - NU_SERVING_CHIPS_LEAD - 1, 'everything past the lead, except Custom');
  assert.match(html, new RegExp('class="nu-serving-more"[^>]*>More \\(' + extras + '\\)<'));
  assert.ok(!/is-extra"[^>]*data-key="custom"/.test(html), 'Custom is never folded');

  nuExpandServings();
  assert.strictEqual(nu_servingExpanded, true);
  open(rice());
  assert.strictEqual(nu_servingExpanded, false);
});

test('the chosen serving is always visible, including a programmatic choice', () => {
  // nuSyncServingChips against real-ish chip nodes.
  const mk = (key, extra) => {
    const cls = new Set(['nu-serving-chip'].concat(extra ? ['is-extra'] : []));
    const attrs = { 'data-key': key };
    return { key, cls, attrs,
      getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; },
      classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), remove: (c) => cls.delete(c) } };
  };
  const nodes = [mk('p0'), mk('p1'), mk('oz', true), mk('custom')];
  const saved = els.nuServingChips;
  els.nuServingChips = { querySelectorAll: () => nodes };
  el('nuServingSelect').value = 'oz';
  try { nuSyncServingChips(); } finally { els.nuServingChips = saved; }
  const oz = nodes[2];
  assert.strictEqual(oz.attrs['aria-checked'], 'true');
  assert.ok(oz.cls.has('is-on') && !oz.cls.has('is-extra'), 'selected chip is un-folded');
  assert.deepStrictEqual(nodes.filter((n) => n.attrs['aria-checked'] === 'true').map((n) => n.key), ['oz'], 'exactly one chip is checked');
});

test('markup: chips are a labelled radiogroup; the native select is hidden, not removed', () => {
  const html = nuModalMarkup();
  assert.match(html, /id="nuServingChips" role="radiogroup" aria-labelledby="nuServingLabel"/);
  assert.match(html, /<select id="nuServingSelect" class="nu-serving-native" tabindex="-1" aria-hidden="true" onchange="nuServingChanged\(this\.value\)">/);
  const page = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8');
  assert.match(page, /\.nu-serving-native \{ display: none; \}/);
  assert.match(page, /\.nu-serving-chip \{[^}]*min-height:\s*44px/, 'chips clear the 44px touch floor');
  assert.match(page, /\.nu-serving-more \{[^}]*min-height:\s*44px/);
});
