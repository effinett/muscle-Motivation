// dashboard-visual.test.js — Phase 4.3.4 V4 structural contract for Home.
//
// V4's goal was to end card-equality: Home should read as one designed screen,
// not five sibling rectangles. These tests pin the STRUCTURE that produces that
// — which surfaces keep a container, which lost theirs, what left the page —
// without snapshotting markup or asserting pixel values.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HOME = read('app.html');
const HOME_CSS = (HOME.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const HOME_BODY = HOME.slice(HOME.indexOf('<main'), HOME.indexOf('</main>'));
const SHELL = read('app-shell.css');

/* ── 1 · Card equality is gone ──────────────────────────────────────────── */

test('home: exactly two prominent contained surfaces remain', () => {
  // The hero (carries the primary action) and Coach Insight. Everything else
  // is an open section on the background.
  const heroes = HOME_BODY.match(/class="mm-hero"/g) || [];
  const insights = HOME_BODY.match(/class="mm-insight"/g) || [];
  assert.strictEqual(heroes.length, 1, 'one hero');
  assert.strictEqual(insights.length, 1, 'one Coach Insight');

  // The old generic card class is gone entirely.
  assert.ok(!/class="row"|class="card"/.test(HOME_BODY), 'no generic card/row wrappers');
  assert.ok(!/\.row\s*\{/.test(HOME_CSS), 'the generic .row rule is deleted');
});

test('home: the open rows carry no container chrome', () => {
  const row = (HOME_CSS.match(/\.home-row\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(row.length, '.home-row exists');
  assert.ok(!/background:/.test(row), 'open rows have no background fill');
  assert.ok(!/border:\s*1px/.test(row), 'open rows have no border');
});

test('home: This Week, Nutrition and Progress are open sections', () => {
  for (const label of ['This Week', 'Nutrition', 'Progress']) {
    const re = new RegExp('<div class="mm-section">[\\s\\S]{0,200}?' + label);
    assert.match(HOME_BODY, re, `${label} uses a background-level section header`);
  }
});

/* ── 2 · Hierarchy order ────────────────────────────────────────────────── */

test('home: sections appear in the approved priority order', () => {
  const order = ['Train', 'This Week', 'Nutrition', 'Coach Insight', 'Progress'];
  let cursor = -1;
  for (const label of order) {
    const at = HOME_BODY.indexOf('>' + label + '<');
    assert.ok(at > cursor, `${label} follows the previous section`);
    cursor = at;
  }
});

test('home: heading structure is a clean outline', () => {
  const h1 = HOME.match(/<h1\b/g) || [];
  assert.strictEqual(h1.length, 1, 'exactly one h1');
  // Section labels are real headings; the hero title sits under the Train h2.
  const h2 = HOME_BODY.match(/<h2 class="mm-section-label">/g) || [];
  assert.strictEqual(h2.length, 4, 'Train / This Week / Nutrition / Progress');
  assert.match(HOME_BODY, /<h3 class="mm-hero-title"/, 'hero title is an h3');
  assert.ok(!/<h4|<h5|<h6/.test(HOME_BODY), 'no skipped-level headings');
});

/* ── 3 · Hero ───────────────────────────────────────────────────────────── */

test('hero: uses the shared primitive and keeps the dominant action', () => {
  assert.match(HOME_BODY, /<section class="mm-hero" aria-labelledby="todayTitle">/);
  assert.match(HOME_BODY, /class="mm-hero-cta" id="todayCta"/, 'CTA is the hero primitive');
  // The secondary path stays quiet — a text action, never a second slab.
  assert.match(HOME_BODY, /class="home-action" id="todayAlt"/);
  const alt = (HOME_CSS.match(/\.home-action\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/background:\s*var\(--mm-accent\)/.test(alt), 'secondary action is not a filled button');
  assert.match(alt, /min-height:\s*44px/, 'but it is still a real tap target');
});

test('hero: ships no photography in V4', () => {
  assert.ok(!/mm-hero-media/.test(HOME_BODY), 'no image layer wired yet (that is V5)');
  assert.ok(!/\.(jpe?g|png|webp|avif)/i.test(HOME_BODY.replace(/logow\.png/g, '')),
    'no image asset referenced in the hero');
});

test('hero: fabricates no session metadata', () => {
  assert.ok(!/exercises<|exerciseCount|~\d+\s*min|duration/i.test(HOME_BODY),
    'no exercise count or duration — neither is available without a new request');
});

test('hero: long titles are handled by the primitive, not truncated on Home', () => {
  assert.match(SHELL, /\.mm-hero-title\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.ok(!/text-overflow:\s*ellipsis/.test(HOME_CSS), 'Home truncates nothing');
});

/* ── 4 · This Week ──────────────────────────────────────────────────────── */

test('week: strip and meter are the shared primitives', () => {
  assert.match(HOME_BODY, /<div class="mm-daystrip" id="weekStrip"/);
  assert.match(HOME_BODY, /<div class="mm-meter" id="weekMeter"/);
  assert.match(HOME_BODY, /role="progressbar"[^>]*aria-label="Weekly training progress"/);
});

test('week: the count and the strip share one source', () => {
  // Both come from model.week, which reads snapshot.training.week.
  assert.match(HOME, /renderWeek\(model\.week\)/);
  assert.match(HOME, /weekValue'\)\.textContent = w\.hasData \? w\.label/);
  assert.match(HOME, /\(w\.days \|\| \[\]\)\.map/);
});

test('week: with no declared target the meter is hidden, not zeroed', () => {
  assert.match(HOME, /if \(w\.hasData && w\.planned\)[\s\S]{0,400}?meter\.hidden = false;[\s\S]{0,400}?meter\.hidden = true;/,
    'no target → no progress bar toward an invented denominator');
});

/* ── 5 · Nutrition ──────────────────────────────────────────────────────── */

test('nutrition: two compact metrics on two shared meters', () => {
  assert.match(HOME, /aria-label="Calories"/);
  assert.match(HOME, /aria-label="Protein"/);
  const meters = HOME.match(/class="mm-meter" id="nut(Cal|Pro)Meter"/g) || [];
  assert.strictEqual(meters.length, 2, 'exactly two nutrition meters');
});

test('nutrition: no longer the loudest element on the screen', () => {
  // The old 42px Bebas calorie number is gone; values use the compact metric type.
  assert.ok(!/\.nut-num/.test(HOME_CSS), 'the oversized calorie number is removed');
  const val = (HOME_CSS.match(/\.home-metric-value\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(val, /font-size:\s*14px/, 'nutrition values are compact');
  // The hero title remains the largest type on the page.
  assert.match(SHELL, /\.mm-hero-title\s*\{[^}]*clamp\(34px/);
});

test('nutrition: ordinary progress uses the accent, not semantic colour', () => {
  // Calories only go semantic when genuinely OVER target.
  assert.match(HOME, /if \(n\.over\) calMod = 'warning';/);
  assert.ok(!/calMod = 'success'/.test(HOME), 'being under target is not a success state');
  // Default meter fill is the accent (asserted in the shell contract too).
  assert.match(SHELL, /\.mm-meter-fill\s*\{[^}]*background:\s*var\(--mm-accent\)/);
});

test('nutrition: every real-world state is handled', () => {
  assert.match(HOME, /if \(!n\.hasData\)/, 'no data');
  assert.match(HOME, /if \(!n\.logged\)/, 'nothing logged');
  assert.match(HOME, /if \(n\.hasTargets\)/, 'with and without a calorie target');
  assert.match(HOME, /n\.over \? 'over' : 'left'/, 'over vs remaining');
  assert.match(HOME, /if \(n\.protein\.target\)/, 'protein with a target');
  assert.match(HOME, /n\.protein\.pct >= 100 \? 'success' : null/, 'protein achieved');
});

/* ── 6 · Coach Insight ──────────────────────────────────────────────────── */

test('insight: Focus was renamed to Coach Insight', () => {
  assert.match(HOME_BODY, /<div class="mm-insight-label">Coach Insight<\/div>/);
  assert.ok(!/>Focus</.test(HOME_BODY), 'the old Focus label is gone');
  assert.ok(!/id="focusRow"|class="focus"/.test(HOME_BODY), 'old Focus markup removed');
  assert.ok(!/\.focus\s*\{/.test(HOME_CSS), 'old Focus CSS removed');
});

test('insight: the untrained-week message adds information rather than scolding', () => {
  const DM = require('./dashboard-model.js');
  // Monday–Sunday week, nothing trained, target of 3, today is Tuesday.
  const days = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
    '2026-08-14', '2026-08-15', '2026-08-16'].map((date, i) => ({
    date, label: 'MTWTFSS'[i], weekday: date, completed: false,
    isToday: date === '2026-08-11', isFuture: date > '2026-08-11',
  }));
  const f = DM.buildFocus({
    profile: {},
    snapshot: {
      weight: {}, nutrition: { today: {}, week: {} },
      training: { streak: 0, thisWeekCount: 0,
        week: { days, completed: 0, planned: 3, start: days[0].date, end: days[6].date } },
    },
    hourOfDay: 10,
  });
  assert.ok(f, 'an insight is produced');
  assert.strictEqual(f.id, 'week-runway');
  assert.strictEqual(f.text, '6 days left to train this week.',
    'today plus the five remaining days — real calendar data, not a restatement');
  assert.strictEqual(f.severity, undefined, 'a runway is not a warning');
  assert.ok(!/no workouts|nothing|failed|behind/i.test(f.text), 'no negative framing');

  // On the final day it reads as the last day, not "1 days".
  const sunday = days.map((d) => Object.assign({}, d,
    { isToday: d.date === '2026-08-16', isFuture: false }));
  const last = DM.buildFocus({
    profile: {},
    snapshot: { weight: {}, nutrition: { today: {}, week: {} },
      training: { streak: 0, thisWeekCount: 0,
        week: { days: sunday, completed: 0, planned: 3 } } },
    hourOfDay: 10,
  });
  assert.strictEqual(last.text, 'Last day to train this week.');
});

test('insight: hides cleanly when there is no evidence-backed insight', () => {
  assert.match(HOME_BODY, /<section class="mm-insight" id="insightRow" hidden>/,
    'starts hidden');
  assert.match(HOME, /if \(!f\) \{ el\.hidden = true; return; \}/,
    'a null insight hides the whole surface rather than rendering an empty box');
});

test('insight: stays one line with an optional action — never a paragraph', () => {
  assert.match(HOME_BODY, /<p class="mm-insight-text" id="insightText"><\/p>/);
  assert.match(HOME_BODY, /class="mm-insight-action" id="insightAction" hidden/);
  assert.match(HOME, /insightText'\)\.textContent = f\.text/, 'text is set as plain text');
  // No AI framing in anything the user can see (comments are not copy).
  const visible = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/\bAI\b|artificial intelligence/i.test(visible),
    'the surface never claims to be AI');
});

test('insight: default treatment is the accent, warning is reserved', () => {
  assert.match(HOME, /f\.severity \? ' mm-insight--' \+ f\.severity : ''/,
    'styling follows an explicit model severity, not a coarse tone');
  assert.match(SHELL, /\.mm-insight\s*\{[^}]*border-left:\s*2px solid var\(--mm-accent\)/,
    'the default edge is the theme accent');

  // Only exceeding a target the user set is semantic. Everything else is a
  // routine nudge and must render in the accent.
  const DM = require('./dashboard-model.js');
  const base = {
    profile: { target_calories: 2500, protein_target: 160 },
    snapshot: {
      weight: {}, bodyFat: {}, waist: {},
      nutrition: { today: { calories: 3000, protein: 200 }, week: { daysLogged: 6 } },
      training: { trainedToday: false, streak: 0, thisWeekCount: 0 },
    },
    hourOfDay: 20,
  };
  assert.strictEqual(DM.buildFocus(base).severity, 'warning', 'over target is a warning');

  const nudge = JSON.parse(JSON.stringify(base));
  nudge.snapshot.nutrition.today = { calories: 1200, protein: 120 };
  nudge.snapshot.nutrition.week = { daysLogged: 1 };
  const f = DM.buildFocus(nudge);
  assert.ok(f, 'a nudge insight exists');
  assert.strictEqual(f.severity, undefined, 'a routine nudge carries no severity');
});

/* ── 6b · V4 polish ─────────────────────────────────────────────────────── */

test('polish: Quick log is an inline action in the Nutrition section', () => {
  assert.match(HOME_BODY, /<a class="home-action" href="nutrition\.html#quicklog">Quick log<\/a>/);
  // Same visual weight as Log weight — both are .home-action, neither a slab.
  const actions = HOME_BODY.match(/class="home-action"/g) || [];
  assert.ok(actions.length >= 3, 'choose workout, quick log and log weight');
  assert.match(HOME_BODY, /id="logWeightBtn"/, 'Log weight is still inline in Progress');
});

test('polish: Quick log opens the EXISTING nutrition flow, not a new one', () => {
  const nutrition = read('nutrition.html');
  // The dashboard only deep-links; the handler just focuses the existing input.
  assert.match(nutrition, /function focusQuickLogFromHash\(\)/);
  assert.match(nutrition, /window\.location\.hash !== '#quicklog'/);
  assert.match(nutrition, /getElementById\('aiLogInput'\)/,
    'it targets the existing Quick Log field');
  assert.match(nutrition, /<form class="ai-log-row" onsubmit="aiQuickLog\(event\)">/,
    'the original Quick Log form is untouched');
  // No second logging implementation anywhere on Home.
  assert.ok(!/aiQuickLog|aiLogInput|food_logs|nuSaveLog/.test(HOME),
    'Home implements no logging of its own');
});

test('polish: the gap under an inline action is evened out, not the sections', () => {
  assert.match(HOME_CSS,
    /\.home-action \+ \.mm-section,\s*\.home-inline-actions \+ \.mm-section\s*\{[^}]*margin-top:\s*12px/,
    'only the post-action gap is trimmed');
  // The shared section rhythm itself is unchanged.
  assert.match(SHELL, /\.mm-section\s*\{[^}]*margin:\s*26px 0 10px/);
});

test('polish: today + completed remains readable as BOTH states', () => {
  // A thicker accent border would disappear into the accent fill of a completed
  // day. The today marker is a detached ring, so it survives either state.
  const today = (SHELL.match(/\.mm-day\.is-today \.mm-day-dot\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(today, /box-shadow:\s*0 0 0 2px var\(--mm-bg\), 0 0 0 3\.5px var\(--mm-accent\)/,
    'today draws a detached outer ring');
  assert.ok(!/border-width:\s*2px/.test(today), 'not a thicker border that the fill would hide');
  // Home emits both classes together and announces both meanings.
  assert.match(HOME, /\(d\.isToday \? 'today, ' : ''\) \+ \(d\.completed \? 'completed' : 'not completed'\)/,
    'screen readers hear "today, completed"');
});

test('polish: neutral days stay neutral — nothing reads as missed or scheduled', () => {
  // Past days with no workout get NO extra class at all: same neutral outline.
  assert.match(HOME, /d\.completed \? ' is-done' : ''/);
  assert.match(HOME, /d\.isToday \? ' is-today' : ''/);
  assert.ok(!/is-missed|is-skipped|is-scheduled|is-planned/.test(HOME + SHELL),
    'no missed/scheduled state exists in markup or styling');
  // The only dimming is for days that have not happened yet.
  const future = (SHELL.match(/\.mm-day\.is-future \.mm-day-dot\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(future, /opacity/, 'future days are dimmed, not marked');
  assert.ok(!/var\(--mm-danger\)|var\(--mm-warning\)/.test(SHELL.match(/\.mm-day[\s\S]*?\.mm-insight/)[0]),
    'no day state uses a semantic alarm colour');
});

/* ── 7 · Progress + what left Home ──────────────────────────────────────── */

test('progress: compact section with an inline Log weight action', () => {
  assert.match(HOME_BODY, /<span class="mm-section-value" id="progValue">/);
  assert.match(HOME_BODY, /class="home-action" id="logWeightBtn" onclick="wlOpenModal\(\)"/,
    'Log weight is a quiet inline action inside Progress');
  // The old standalone twin-button block is gone.
  assert.ok(!/class="secondary"|class="secondary-btn"/.test(HOME_BODY),
    'the bottom button pair is removed');
  assert.ok(!/\.secondary-btn\s*\{/.test(HOME_CSS));
});

test('progress: a trend is shown only when real data supports it', () => {
  assert.match(HOME, /if \(p\.change30 == null\)[\s\S]{0,220}?textContent = '';/,
    'one weigh-in is not a trend — nothing is invented');
  assert.match(HOME, /No weigh-ins yet/, 'honest empty state');
});

test('home: Profile has no content action, but the avatar remains', () => {
  // The large Profile button is gone from the page content…
  assert.ok(!/href="profile\.html">\s*Profile\s*</.test(HOME_BODY),
    'no Profile action in Home content');
  const bodyProfileLinks = (HOME_BODY.match(/profile\.html/g) || []).length;
  assert.strictEqual(bodyProfileLinks, 0, 'Home content links to Profile zero times');
  // …and the header avatar is still the entry point.
  assert.match(HOME, /class="header-profile" href="profile\.html" aria-label="Profile and settings"/);
});

/* ── 8 · Theme, mobile and protected contracts ──────────────────────────── */

test('home: no component hard-codes the accent', () => {
  const code = HOME.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = (code.match(/#B1121B/gi) || []).length;
  const fallback = (code.match(/--red:\s*#B1121B/gi) || []).length;
  assert.strictEqual(hits - fallback, 0, 'only the :root fallback may name the red');
  assert.ok(!/var\(--red\)|var\(--green\)|var\(--amber\)/.test(code),
    'legacy colour names are not consumed');
});

test('home: interactive targets clear 44px', () => {
  for (const [sel, min] of [['.home-action', 44], ['.header-profile', 44],
    ['.modal-close', 44], ['.field-group input', 44], ['.btn-calc', 48]]) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = (HOME_CSS.match(new RegExp(esc + '\\s*\\{([^}]*)\\}')) || [])[1] || '';
    assert.ok(body.length, `${sel} has a rule`);
    // Either an explicit minimum, or a fixed dimension at/above the floor.
    const ok = new RegExp('min-(height|width):\\s*(\\d+)px').test(body)
      ? Number(body.match(/min-(?:height|width):\s*(\d+)px/)[1]) >= min
      : /(^|;|\s)height:\s*(\d+)px/.test(body) &&
        Number(body.match(/(?:^|;|\s)height:\s*(\d+)px/)[1]) >= min;
    assert.ok(ok, `${sel} must be at least ${min}px`);
  }
  assert.match(SHELL, /\.mm-hero-cta\s*\{[^}]*min-height:\s*48px/);
  assert.match(SHELL, /\.mm-insight-action\s*\{[^}]*min-height:\s*44px/);
});

test('home: bottom clearance and reduced motion are intact', () => {
  assert.match(HOME_CSS, /padding:\s*18px 16px calc\(24px \+ var\(--mm-bottom-clearance, 0px\)\)/);
  assert.match(HOME_CSS, /@media \(max-width: 480px\)[\s\S]{0,220}var\(--mm-bottom-clearance, 0px\)/);
  assert.match(HOME_CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('home: the iOS form-control floor and PWA wiring are untouched', () => {
  assert.match(SHELL, /@media \(max-width: 480px\), \(pointer: coarse\)/);
  assert.match(SHELL, /font-size:\s*16px\s*!important/);
  const meta = (HOME.match(/<meta[^>]+name="viewport"[^>]*>/) || [''])[0];
  assert.ok(!/maximum-scale|user-scalable\s*=\s*no/.test(meta), 'pinch-zoom still enabled');
  for (const s of ['sw-register.js', 'pwa-install.js', 'pwa-install-ui.js',
    'pwa-install-register.js', 'app-nav.js']) {
    assert.ok(HOME.includes(s), `${s} still loaded`);
  }
  assert.match(HOME, /<div id="appNavMount"><\/div>/, 'nav mount preserved');
});

test('home: still consumes shared state only — no new queries, no food stack', () => {
  for (const dep of ['food-core.js', 'food-display.js', 'nutrition.js']) {
    assert.ok(!HOME.includes(dep), `Home does not load ${dep}`);
  }
  const snapCalls = HOME.match(/buildUserSnapshot\(/g) || [];
  assert.strictEqual(snapCalls.length, 1, 'exactly one snapshot pass');
  const froms = [...new Set(HOME.match(/\.from\('([a-z_]+)'\)/g) || [])];
  assert.deepStrictEqual(froms, [".from('workouts')"],
    'the only direct query is the in-progress workout');
});
