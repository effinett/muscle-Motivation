// weight-series.test.js — the shared 30-day weight window and its geometry.
//
// These cover the two helpers Home's Progress snapshot leans on: the window
// that defines "recent weight history", and the sparkline points drawn from it.
// The contract that matters is HONESTY — a drawn line must contain only real
// weigh-ins, and it must describe exactly the same rows as the change value
// printed beside it.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const W = require('./weight.js');
const SN = require('./snapshot.js');

// Dates relative to today, so the trailing window is exercised for real.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const row = (n, lbs) => ({ logged_on: daysAgo(n), weight_lbs: lbs });

/* ── The window ─────────────────────────────────────────────────────────── */

test('series: returns real rows inside the window, oldest first', () => {
  const s = W.wlRecentSeries([row(0, 195), row(10, 198), row(20, 200)], 30);
  assert.deepStrictEqual(s.map((r) => r.weight_lbs), [200, 198, 195],
    'ascending by date, so the first element is the oldest');
});

test('series: sorts entries that arrive in any order', () => {
  const s = W.wlRecentSeries([row(3, 191), row(25, 200), row(12, 196), row(0, 190)], 30);
  const dates = s.map((r) => r.logged_on);
  assert.deepStrictEqual(dates, dates.slice().sort(), 'chronological regardless of input order');
});

test('series: excludes anything outside the window', () => {
  const s = W.wlRecentSeries([row(0, 190), row(45, 210), row(400, 230)], 30);
  assert.strictEqual(s.length, 1, 'only the in-window weigh-in survives');
  assert.strictEqual(s[0].weight_lbs, 190);
});

test('series: drops malformed rows rather than coercing them', () => {
  const s = W.wlRecentSeries([
    row(1, 190), { logged_on: null, weight_lbs: 5 }, { logged_on: daysAgo(2) },
    { logged_on: daysAgo(3), weight_lbs: 'abc' }, null,
  ], 30);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].weight_lbs, 190);
});

test('series: no input degrades to an empty series, never a placeholder', () => {
  assert.deepStrictEqual(W.wlRecentSeries(null, 30), []);
  assert.deepStrictEqual(W.wlRecentSeries([], 30), []);
});

/* ── One window, one meaning ────────────────────────────────────────────── */

test('window: change30 is derived from exactly the rows the series contains', () => {
  const logs = [row(0, 195.0), row(9, 197.5), row(27, 200.0), row(90, 220.0)];
  const stats = W.wlStats(logs, null);
  const series = W.wlRecentSeries(logs, 30);

  // The number beside the weight and the line under it must never describe
  // different sets — that is the whole reason the window lives in one place.
  assert.strictEqual(series.length, 3, 'the 90-day-old row is outside the window');
  assert.strictEqual(stats.change30, 195.0 - 200.0, 'newest minus the oldest IN WINDOW');
  assert.strictEqual(stats.change30, stats.current - series[0].weight_lbs);
});

test('window: a lone in-window weigh-in yields no change at all', () => {
  const stats = W.wlStats([row(0, 195), row(60, 210)], null);
  assert.strictEqual(stats.change30, null, 'one point in the window is not a change');
  assert.strictEqual(stats.current, 195, 'current is still the latest weigh-in overall');
});

test('window: change30 keeps its established sign convention', () => {
  const down = W.wlStats([row(0, 195), row(20, 200)], null);
  const up = W.wlStats([row(0, 205), row(20, 200)], null);
  const flat = W.wlStats([row(0, 200), row(20, 200)], null);
  assert.ok(down.change30 < 0, 'losing weight is negative');
  assert.ok(up.change30 > 0, 'gaining is positive');
  assert.strictEqual(flat.change30, 0, 'no movement is zero, not null');
});

test('window: one row per day is a table guarantee, not something to resolve', () => {
  // body_weight_logs is unique on (user_id, logged_on) — enforced by the
  // wlUpsert conflict target — so there is no same-day duplicate to collapse
  // and no Home-specific rule to invent.
  assert.match(read('weight.js'), /onConflict:\s*'user_id,logged_on'/);
  const s = W.wlRecentSeries([row(1, 190), row(2, 191), row(3, 192)], 30);
  assert.strictEqual(new Set(s.map((r) => r.logged_on)).size, s.length, 'dates are distinct');
});

/* ── Geometry ───────────────────────────────────────────────────────────── */

test('spark: plots one point per real weigh-in and nothing else', () => {
  const series = W.wlRecentSeries([row(0, 195), row(7, 197), row(21, 200)], 30);
  const g = W.wlSparklinePoints(series);
  assert.strictEqual(g.count, 3);
  assert.strictEqual(g.points.split(' ').length, 3,
    'no interpolated or manufactured intermediate points');
});

test('spark: x is time-based, so a gap between weigh-ins reads as a gap', () => {
  // Evenly spaced in INDEX but not in time: 0, 1, 29 days ago.
  const g = W.wlSparklinePoints(W.wlRecentSeries([row(29, 200), row(1, 196), row(0, 195)], 30));
  const xs = g.points.split(' ').map((p) => +p.split(',')[0]);
  assert.deepStrictEqual(xs, [0, 96.6, 100].map((n) => n), 'spacing follows elapsed time');
  assert.ok(xs[1] - xs[0] > xs[2] - xs[1], 'the long gap is the wide one');
});

test('spark: fewer than two points draws nothing', () => {
  assert.strictEqual(W.wlSparklinePoints([]), null);
  assert.strictEqual(W.wlSparklinePoints([row(0, 200)]), null);
  assert.strictEqual(W.wlSparklinePoints(null), null);
});

test('spark: a flat series draws a flat line, not an invented shape', () => {
  const g = W.wlSparklinePoints(W.wlRecentSeries([row(0, 200), row(10, 200), row(20, 200)], 30));
  const ys = g.points.split(' ').map((p) => +p.split(',')[1]);
  assert.deepStrictEqual(ys, [50, 50, 50],
    'identical weights must not be stretched to fill the box');
});

test('spark: sorts defensively, so an unsorted caller still gets chronology', () => {
  const unsorted = [row(0, 195), row(21, 200), row(7, 197)];
  const g = W.wlSparklinePoints(unsorted);
  const xs = g.points.split(' ').map((p) => +p.split(',')[0]);
  assert.deepStrictEqual(xs, xs.slice().sort((a, b) => a - b));
});

test('spark: the drawing carries no colour, no axes and no labels', () => {
  const g = W.wlSparklinePoints(W.wlRecentSeries([row(0, 195), row(14, 200)], 30));
  assert.deepStrictEqual(Object.keys(g).sort(), ['count', 'height', 'points', 'width'],
    'points only — the caller owns the SVG, so the stroke stays a theme token');
  assert.ok(!/#|rgb|stroke|text/i.test(JSON.stringify(g)));
});

test('spark: values stay inside the box so the line is never clipped', () => {
  const g = W.wlSparklinePoints(W.wlRecentSeries([row(0, 180), row(10, 220), row(20, 200)], 30));
  for (const p of g.points.split(' ')) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= g.width, `x ${x} within 0..${g.width}`);
    assert.ok(y >= 0 && y <= g.height, `y ${y} within 0..${g.height}`);
  }
});

test('window: extracting the window did not change what wlStats reports', () => {
  // change30 used to filter inline; it now shares wlRecentSeries. Same rows,
  // same arithmetic, same sign — the refactor is behaviour-preserving.
  const logs = [row(2, 191.4), row(11, 194.0), row(29, 196.6), row(31, 210)];
  const s = W.wlStats(logs, null);
  assert.strictEqual(s.current, 191.4, 'latest weigh-in');
  assert.strictEqual(s.count, 4, 'every log still counted, in-window or not');
  assert.strictEqual(+s.change30.toFixed(1), -5.2, 'newest minus oldest inside 30 days');
  assert.ok(s.avg7 === null || typeof s.avg7 === 'number', 'avg7 is untouched');
});

/* ── Scope: the Home sparkline gate is not a weight semantic ────────────── */

test('scope: the Progress page keeps its own rendering, untouched by Home', () => {
  const page = read('weight-history.html');
  // The full chart, with its axes and labels, is still what Progress draws —
  // the sparkline is a Home-only presentation and was not pushed onto it.
  assert.match(page, /wlChartSVG\(/, 'Progress still renders the full chart');
  assert.ok(!/wlSparklinePoints|home-spark/.test(page),
    'the Home sparkline never leaked onto the Progress page');
  // And Progress reads the same shared stats it always did.
  assert.match(page, /wlStats\(/);
  assert.ok(!/HOME_SPARK/.test(page), 'no Home presentation threshold reaches it');
});

test('scope: the shared window returns real rows regardless of any draw gate', () => {
  // Three weigh-ins on three consecutive days: Home declines to draw them, but
  // the domain still reports all three and the full change between them.
  const clustered = [row(0, 198), row(1, 199), row(2, 200)];
  assert.strictEqual(W.wlRecentSeries(clustered, 30).length, 3);
  assert.strictEqual(W.wlStats(clustered, null).change30, -2);
  // Geometry would happily draw them — refusing is Home's decision, made in
  // dashboard-model.js, not a property of the weight domain.
  assert.strictEqual(W.wlSparklinePoints(clustered).count, 3);
  assert.strictEqual(
    require('./dashboard-model.js').buildProgress({
      snapshot: { weight: { current: 198, count: 3, change30: -2, recent: clustered } },
    }).series, null, 'the gate lives in the Home view-model alone');
});

/* ── Wiring: no new request ─────────────────────────────────────────────── */

test('wiring: the series rides the snapshot Home already fetches', () => {
  const src = read('snapshot.js');
  // wlFetchLogs was ALREADY in buildUserSnapshot; the rows were simply being
  // discarded after wlStats. Carrying them adds no query and no round trip.
  const fetches = src.match(/supabaseClient\s*\n?\s*\.from\('([a-z_]+)'\)|\.from\('([a-z_]+)'\)/g) || [];
  assert.ok(!/body_weight_logs/.test(src),
    'snapshot.js never queries weight itself — it reuses wlFetchLogs');
  assert.strictEqual((src.match(/wlFetchLogs\(/g) || []).length, 1,
    'exactly one weight fetch, unchanged');
  assert.match(src, /weight\.recent = wlRecentSeries\(inputs\.weightLogs \|\| \[\], 30\)/,
    'derived from the rows already in hand');

  // And Home itself added no query of its own.
  const home = read('app.html');
  assert.deepStrictEqual([...new Set(home.match(/\.from\('([a-z_]+)'\)/g) || [])],
    [".from('workouts')"], 'the in-progress workout is still Home\'s only direct query');
  assert.strictEqual((home.match(/buildUserSnapshot\(/g) || []).length, 1, 'one snapshot pass');
  assert.ok(!/wlFetchLogs|body_weight_logs/.test(home),
    'Home fetches no weight history for the sparkline');
});

test('wiring: snComputeSnapshot exposes the series without breaking its shape', () => {
  const s = SN.snComputeSnapshot({
    profile: { weight_lbs: 200 },
    weightLogs: [row(0, 195), row(10, 197), row(25, 200)],
    bfLogs: [], msLogs: [], foodRows: [], workouts: [],
  });
  assert.strictEqual(s.weight.current, 195, 'existing fields are unchanged');
  assert.strictEqual(s.weight.count, 3);
  assert.strictEqual(s.weight.change30, -5);
  assert.ok(Array.isArray(s.weight.recent), 'and the series rides alongside');
  assert.strictEqual(s.weight.recent.length, 3);
  assert.strictEqual(s.weight.recent[0].weight_lbs, 200, 'oldest first');
});
