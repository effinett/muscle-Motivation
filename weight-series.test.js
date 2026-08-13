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

/* ── Geometry: the shared chart renderer ────────────────────────────────
 * Home draws a COMPACT wlChartSVG, so these exercise the one renderer both
 * sizes share. Each <circle> is a plotted weigh-in, which makes the emitted
 * markers the honest record of what was drawn. */

const OPTS = { width: 300, height: 124, pad: 34, labelSize: 13, dotRadius: 3.4, gradId: 'g' };
const chart = (rows, o) => W.wlChartSVG(rows, Object.assign({}, OPTS, o));
const pointsOf = (svg) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)]
  .map((m) => ({ x: +m[1], y: +m[2] }));
const xsOf = (svg) => pointsOf(svg).map((p) => p.x);
const LEFT = OPTS.pad, RIGHT = OPTS.width - OPTS.pad;

test('chart: plots one marker per real weigh-in and nothing else', () => {
  const series = W.wlRecentSeries([row(0, 195), row(7, 197), row(21, 200)], 30);
  assert.strictEqual(pointsOf(chart(series)).length, 3,
    'no interpolated or manufactured intermediate points');
});

test('chart: x is time-based, so a gap between weigh-ins reads as a gap', () => {
  // Evenly spaced in INDEX but not in time: 0, 1, 29 days ago.
  const xs = xsOf(chart(W.wlRecentSeries([row(29, 200), row(1, 196), row(0, 195)], 30)));
  assert.ok(xs[1] - xs[0] > xs[2] - xs[1], 'the long gap is the wide one');
});

test('chart: the earliest and latest plotted points anchor the two edges', () => {
  // The x-axis is the span of the data actually drawn — NOT the 30-day window
  // it came from. Three consecutive days therefore use the full plot width
  // instead of huddling in the first tenth of an invisible month.
  for (const spanDays of [1, 2, 3, 7, 21, 29]) {
    const xs = xsOf(chart(W.wlRecentSeries(
      [row(spanDays, 200), row(Math.floor(spanDays / 2), 199), row(0, 198)], 30)));
    assert.strictEqual(xs[0], LEFT, `${spanDays}d: earliest sits on the left edge`);
    assert.strictEqual(xs[xs.length - 1], RIGHT, `${spanDays}d: latest on the right edge`);
  }
});

test('chart: intermediate points keep their REAL proportional spacing', () => {
  // Aug 1 / Aug 2 / Aug 20 must not become three evenly spaced points: the
  // middle one belongs beside the first, not in the centre.
  const span = RIGHT - LEFT;
  const xs = xsOf(chart(W.wlRecentSeries([row(20, 200), row(19, 199.5), row(0, 198)], 30)));
  assert.strictEqual(xs[0], LEFT);
  assert.strictEqual(xs[2], RIGHT);
  assert.ok(xs[1] < LEFT + span * 0.1, `middle point at ${xs[1]} must hug the earliest`);
  assert.strictEqual(xs[1], +(LEFT + span / 20).toFixed(1), 'one day of twenty is 5% along');

  // Explicitly NOT index-based: evenly spaced dates land evenly, uneven ones
  // do not, so array position cannot be what determines x.
  const even = xsOf(chart(W.wlRecentSeries([row(20, 200), row(10, 199), row(0, 198)], 30)));
  assert.deepStrictEqual(even, [LEFT, LEFT + span / 2, RIGHT], 'evenly dated points land evenly');
  assert.notDeepStrictEqual(xs, even, 'unevenly dated ones must not');
});

test('chart: identical dates degrade safely, with no invalid geometry', () => {
  // body_weight_logs is unique on (user_id, logged_on) so this cannot arise in
  // production, but the geometry must never emit NaN or Infinity regardless.
  for (const rows of [
    [row(0, 200), row(0, 199), row(0, 198)],          // every date identical
    [row(5, 200), row(5, 199), row(0, 198)],          // two share a date
  ]) {
    for (const p of pointsOf(chart(rows))) {
      for (const [axis, v, max] of [['x', p.x, OPTS.width], ['y', p.y, OPTS.height]]) {
        assert.ok(Number.isFinite(v), `${axis} must be finite, got ${v}`);
        assert.ok(v >= 0 && v <= max, `${axis} ${v} within 0..${max}`);
      }
    }
  }
  // A zero-width span centres the line rather than dividing by zero.
  const mid = LEFT + (RIGHT - LEFT) / 2;
  assert.deepStrictEqual(xsOf(chart([row(0, 200), row(0, 199), row(0, 198)])), [mid, mid, mid]);
});

test('chart: normalisation invents nothing — one point in, one point out', () => {
  const rows = [row(18, 201), row(12, 200), row(4, 199), row(0, 197)];
  const pts = pointsOf(chart(W.wlRecentSeries(rows, 30)));
  assert.strictEqual(pts.length, rows.length, 'no endpoint padding, no resampling');
  // Every plotted y traces back to a logged weight, not a smoothed value.
  assert.strictEqual(new Set(pts.map((p) => p.y)).size,
    new Set(rows.map((r) => r.weight_lbs)).size,
    'distinct weights stay distinct — nothing is averaged away');
});

test('chart: fewer than two points draws nothing', () => {
  assert.strictEqual(chart([]), '');
  assert.strictEqual(chart([row(0, 200)]), '');
  assert.strictEqual(chart(null), '');
});

test('chart: a flat series draws a flat line, not an invented shape', () => {
  const ys = pointsOf(chart(W.wlRecentSeries([row(0, 200), row(10, 200), row(20, 200)], 30)))
    .map((p) => p.y);
  const mid = OPTS.pad + (OPTS.height - OPTS.pad * 2) / 2;
  assert.deepStrictEqual(ys, [mid, mid, mid],
    'identical weights must not be stretched to fill the box');
});

test('chart: sorts defensively, so an unsorted caller still gets chronology', () => {
  const xs = xsOf(chart([row(0, 195), row(21, 200), row(7, 197)]));
  assert.deepStrictEqual(xs, xs.slice().sort((a, b) => a - b));
});

test('chart: carries no baked colour, so both sizes follow the theme', () => {
  const svg = chart(W.wlRecentSeries([row(0, 195), row(14, 200), row(25, 202)], 30));
  assert.ok(!/#B1121B|rgba\(177/.test(svg), 'no brand literal survives in the output');
  assert.match(svg, /stroke="currentColor"/);
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /stop-color="currentColor"/);
});

test('chart: values stay inside the box so the line is never clipped', () => {
  for (const p of pointsOf(chart(W.wlRecentSeries([row(0, 180), row(10, 220), row(20, 200)], 30)))) {
    assert.ok(p.x >= 0 && p.x <= OPTS.width, `x ${p.x} within 0..${OPTS.width}`);
    assert.ok(p.y >= 0 && p.y <= OPTS.height, `y ${p.y} within 0..${OPTS.height}`);
  }
});

/* ── Scope: the Home sparkline gate is not a weight semantic ────────────── */

test('scope: the Progress page keeps its own full-size rendering', () => {
  const page = read('weight-history.html');
  // Progress calls the shared renderer with NO size options, so it gets the
  // full 640x200 chart it always had. Home's compact options never reach it.
  assert.match(page, /var svg = wlChartSVG\(logs\);/, 'the bare, full-size call');
  assert.ok(!/HOME_TREND|labelSize|dotRadius|decorative/.test(page),
    'no Home presentation option leaked onto the Progress page');
  assert.ok(!/home-trendcard/.test(page), 'nor the Home card');
  // And Progress reads the same shared stats it always did.
  assert.match(page, /wlStats\(/);
  assert.ok(!/HOME_SPARK/.test(page), 'no Home presentation threshold reaches it');
});

test('scope: one renderer serves both sizes — no second implementation', () => {
  const W_SRC = read('weight.js');
  assert.strictEqual((W_SRC.match(/function wlChartSVG\(/g) || []).length, 1,
    'exactly one chart renderer exists');
  assert.ok(!/function wlSparklinePoints\(/.test(W_SRC),
    'the superseded standalone sparkline geometry is gone, not left to drift');
  // Home and Progress both go through it.
  assert.match(read('app.html'), /wlChartSVG\(/);
  assert.match(read('weight-history.html'), /wlChartSVG\(/);
});

test('scope: the drawing decision lives in Home, not in the weight domain', () => {
  const clustered = [row(0, 198), row(1, 199), row(2, 200)];
  // The domain reports every real row and the full change, unconditionally.
  assert.strictEqual(W.wlRecentSeries(clustered, 30).length, 3);
  assert.strictEqual(W.wlStats(clustered, null).change30, -2);
  assert.strictEqual(pointsOf(chart(clustered)).length, 3);
  // Whether to draw is decided in dashboard-model.js. Only ONE row is below the
  // threshold, so the domain's answer is identical either way.
  const DM = require('./dashboard-model.js');
  const build = (recent) => DM.buildProgress({
    snapshot: { weight: { current: 198, count: recent.length, change30: -2, recent } },
  });
  assert.strictEqual(build(clustered).series.length, 3, 'Home draws three real rows');
  assert.strictEqual(build([row(0, 198)]).series, null, 'one point is not a line');
  assert.strictEqual(W.wlStats([row(0, 198)], null).change30, null,
    'and the domain independently reports no change for it');
});

test('scope: unsorted entries still reach the page in chronological order', () => {
  // End to end: rows arrive from Supabase newest-first, the shared window sorts
  // them ascending, the model passes those exact rows through, and geometry
  // sorts defensively again. No stage may reorder them into nonsense.
  const jumbled = [row(2, 191.4), row(25, 200.0), row(12, 196.0), row(0, 190.0)];
  const series = W.wlRecentSeries(jumbled, 30);
  const p = require('./dashboard-model.js').buildProgress({
    snapshot: { weight: W.wlStats(jumbled, null).count
      ? Object.assign(W.wlStats(jumbled, null), { recent: series }) : {} },
  });
  assert.deepStrictEqual(p.series.map((r) => r.logged_on),
    [daysAgo(25), daysAgo(12), daysAgo(2), daysAgo(0)], 'oldest to newest');

  const xs = xsOf(chart(p.series));
  assert.deepStrictEqual(xs, xs.slice().sort((a, b) => a - b), 'and x increases with time');
  // The rendered points are exactly the logged ones — reordering invented none.
  assert.strictEqual(xs.length, jumbled.length);
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
