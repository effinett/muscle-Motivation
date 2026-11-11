// Food-search telemetry (roadmap 4.5.17).
// Run via `npm test` (node --test). No network, no database.
//
// The client vocabulary (food-telemetry.js) and the insert policy on
// public.food_search_events must agree — a drift between them is a real
// defect, so the migration text is read and compared here. Also pins the
// privacy rules and the "can never break the product" contract.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const T = require('./food-telemetry.js');
const MIGRATION = fs.readFileSync(path.join(__dirname, 'supabase/migrations/20261111111733_food_search_events.sql'), 'utf8');

test('cleanQuery: lowercased, collapsed, capped; private-looking text is never sent', () => {
  assert.strictEqual(T.cleanQuery('  Chicken   BREAST '), 'chicken breast');
  assert.strictEqual(T.cleanQuery('200g chicken'), '200g chicken', 'a typed amount is ordinary search text');
  assert.strictEqual(T.cleanQuery('x'.repeat(200)).length, 80);
  for (const bad of ['', ' ', 'a', null, undefined, 'me@example.com', 'call 555 123 4567', '4111-1111-1111-1111', '(845) 555-0100']) {
    assert.strictEqual(T.cleanQuery(bad), null, JSON.stringify(bad));
  }
});

test('buildEvent: zero_result carries the query and nothing else', () => {
  assert.deepStrictEqual(T.buildEvent('zero_result', { query: 'Dragon Fruit Bowl', rank: 3, source: 'own', via: 'row' }), {
    event: 'zero_result', query: 'dragon fruit bowl', result_count: 0,
    picked_rank: null, picked_source: null, via: null, schema_version: 1 });
});

test('buildEvent: pick carries position, list and tap type — never what was picked', () => {
  const row = T.buildEvent('pick', { query: 'rice', resultCount: 25, rank: 2, source: 'generic', via: 'add',
    name: 'Rice, white', fdcId: 13, userId: 'u1', calories: 130 });
  assert.deepStrictEqual(row, { event: 'pick', query: 'rice', result_count: 25,
    picked_rank: 2, picked_source: 'generic', via: 'add', schema_version: 1 });
  assert.deepStrictEqual(Object.keys(row).sort(),
    ['event', 'picked_rank', 'picked_source', 'query', 'result_count', 'schema_version', 'via'],
    'no other field can exist on a row');
});

test('buildEvent: an invalid event is dropped, never repaired', () => {
  const ok = { query: 'rice', resultCount: 5, rank: 0, source: 'own', via: 'row' };
  assert.ok(T.buildEvent('pick', ok));
  for (const patch of [{ rank: -1 }, { rank: 201 }, { rank: 1.5 }, { rank: null }, { rank: '' }, { rank: true },
    { resultCount: 201 }, { resultCount: -1 }, { source: 'usda' }, { source: undefined }, { via: 'tap' }, { query: 'a' }, { query: 'x@y.z' }]) {
    assert.strictEqual(T.buildEvent('pick', Object.assign({}, ok, patch)), null, JSON.stringify(patch));
  }
  assert.strictEqual(T.buildEvent('search', ok), null, 'unknown event');
  assert.strictEqual(T.buildEvent('pick'), null);
});

test('the insert policy enumerates the SAME vocabulary and ranges as the client', () => {
  const list = (re) => MIGRATION.match(re)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepStrictEqual(list(/picked_source in \(([^)]*)\)/), T.SOURCES);
  assert.deepStrictEqual(list(/via in \(([^)]*)\)/), T.VIAS);
  assert.match(MIGRATION, new RegExp('char_length\\(query\\) between ' + T.QUERY_MIN + ' and ' + T.QUERY_MAX));
  assert.match(MIGRATION, new RegExp('result_count between 0 and ' + T.COUNT_MAX));
  assert.match(MIGRATION, new RegExp('picked_rank between 0 and ' + T.COUNT_MAX));
  assert.match(MIGRATION, new RegExp('schema_version = ' + T.SCHEMA_VERSION));
  assert.match(MIGRATION, /event = 'zero_result'[\s\S]*event = 'pick'/);
  assert.match(MIGRATION, new RegExp('create table if not exists public\\.' + T.TABLE + ' '));
});

test('the table is write-only and holds no user identity', () => {
  assert.match(MIGRATION, /for insert\s+to authenticated/);
  assert.strictEqual((MIGRATION.match(/create policy/g) || []).length, 1, 'INSERT is the only policy');
  assert.ok(!/for (select|update|delete|all)\b/i.test(MIGRATION));
  const cols = MIGRATION.match(/create table[\s\S]*?\);/)[0];
  assert.ok(!/user_id|\bemail\b|fdc|calories|food_name/i.test(cols), 'no identity or food-log columns');
});

test('emit: fire-and-forget, never throws, and does nothing without a client', async () => {
  const saved = global.supabaseClient;
  const inserted = [];
  try {
    delete global.supabaseClient;
    assert.strictEqual(T.emit('zero_result', { query: 'rice' }), false);

    global.supabaseClient = { from: (t) => ({ insert: (row) => { inserted.push([t, row]); return Promise.reject(new Error('offline')); } }) };
    assert.strictEqual(T.emit('zero_result', { query: 'Rice' }), true, 'a rejected insert is swallowed');
    assert.strictEqual(T.emit('pick', { query: 'rice', resultCount: 1, rank: 9, source: 'nope', via: 'row' }), false, 'invalid → no request');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepStrictEqual(inserted.map((x) => [x[0], x[1].event, x[1].query]), [['food_search_events', 'zero_result', 'rice']]);

    global.supabaseClient = { from: () => { throw new Error('boom'); } };
    assert.strictEqual(T.emit('zero_result', { query: 'rice' }), false, 'a throwing client is swallowed too');
  } finally { if (saved === undefined) delete global.supabaseClient; else global.supabaseClient = saved; }
});

/* ── wiring in the search UI ─────────────────────────────────────────── */
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setAttribute() {}, appendChild() {}, options: [] };
  return els[id];
}
global.window = global;
global.document = { getElementById: el, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
let searchFoods = [];
global.fetch = async (u) => {
  if (String(u).startsWith('/api/usda-search')) return { ok: true, json: async () => ({ foods: searchFoods }) };
  if (String(u).startsWith('/api/usda-food')) return { ok: true, json: async () => ({ portions: [] }) };
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
nu_favorites = []; nu_favKeys = {}; nu_ownFoods = []; nu_corrections = [];
const events = [];
global.FoodTelemetry = { emit: (kind, fields) => { events.push([kind, fields]); return true; } };
NU_ZERO_SETTLE_MS = 30;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bar = () => ({ fdcId: 30, description: 'PROTEIN BAR', dataType: 'Branded', brand: 'Acme', group: 'branded',
  servingSize: 60, servingSizeUnit: 'g', nutrients: { kcal: 350, protein: 33, carbs: 37, fat: 12, fiber: 5, sugar: 3 } });
const egg = () => ({ fdcId: 12, description: 'Egg, whole, raw', dataType: 'SR Legacy', group: 'generic',
  nutrients: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0, sugar: 0.4 } });

test('a zero-result search is reported only once the text has stopped changing', async () => {
  nuResetModalState(); events.length = 0; searchFoods = [];
  el('nuUsdaInput').value = 'dragonfruit bowl';
  await nuRunUsdaSearch('dragonfruit bowl');
  assert.strictEqual(events.length, 0, 'not yet — the user may still be typing');
  await wait(60);
  assert.deepStrictEqual(events, [['zero_result', { query: 'dragonfruit bowl' }]]);

  events.length = 0;
  await nuRunUsdaSearch('dragonf');                       // a half-typed word…
  el('nuUsdaInput').value = 'dragonfruit';
  nuUsdaInputChanged();                                    // …then more typing
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  await wait(60);
  assert.strictEqual(events.length, 0, 'a superseded empty result is never reported');

  await nuRunUsdaSearch('zzz');
  nuResetModalState();                                     // modal closed / reopened
  await wait(60);
  assert.strictEqual(events.length, 0);
});

test('a pick reports its position, list and tap type', async () => {
  nuResetModalState(); events.length = 0;
  el('nuFoodId').value = '';
  el('nuUsdaInput').value = 'Protein';
  nu_usdaResults = [egg(), bar()].map(nuNormalizeUsdaFood);
  nu_usdaResults[0].group = 'generic'; nu_usdaResults[1].group = 'branded';
  nuPickUsda(1);
  assert.deepStrictEqual(events.pop(), ['pick', { query: 'Protein', resultCount: 2, rank: 1, source: 'branded', via: 'row' }]);
  nuPickUsda(9);
  assert.strictEqual(events.length, 0, 'an out-of-range tap reports nothing');

  nu_ownFoods = nuMergeOwnFoods([], [{ food_key: 'custom:protein shake', name: 'Protein Shake', calories: 220 }]);
  nuRenderOwnResults('protein');
  nuPickOwn(0);
  assert.deepStrictEqual(events.pop(), ['pick', { query: 'Protein', resultCount: 2, rank: 0, source: 'own', via: 'row' }]);

  const origSave = nuSave;
  nuSave = async () => {};
  try { await nuQuickAdd('usda', 0); } finally { nuSave = origSave; }
  assert.deepStrictEqual(events.pop(), ['pick', { query: 'Protein', resultCount: 2, rank: 0, source: 'generic', via: 'add' }]);
  nu_ownFoods = [];
});

test('telemetry failure can never break a pick; the page loads the module', () => {
  nuResetModalState();
  el('nuUsdaInput').value = 'egg';
  nu_usdaResults = [egg()].map(nuNormalizeUsdaFood);
  const saved = global.FoodTelemetry;
  global.FoodTelemetry = { emit: () => { throw new Error('boom'); } };
  try { nuPickUsda(0); } finally { global.FoodTelemetry = saved; }
  assert.ok(nu_pendingSource, 'the card still opened');
  const page = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8');
  assert.ok(page.indexOf('<script src="food-telemetry.js"></script>') < page.indexOf('<script src="nutrition.js"></script>'));
});
