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

/* ── Category colouring: green = calories, accent = macros ──────────────── */

test('nutrition: Calories uses the calorie-category token, not semantic success', () => {
  assert.match(SHELL, /--mm-calories:\s*#[0-9A-Fa-f]{6}/, 'a dedicated category token exists');
  assert.match(SHELL, /\.mm-meter--calories \.mm-meter-fill\s*\{[^}]*background:\s*var\(--mm-calories\)/);
  // Home asks for the category modifier by default.
  assert.match(HOME, /var calValue, calPct, calMod = 'calories';/);
  assert.match(HOME, /setMeter\('nutCalMeter', calPct, calMod\)/);
  // It is its OWN token — not an alias of success, and not accent-derived.
  const cal = (SHELL.match(/--mm-calories:\s*([^;]+);/) || [])[1].trim();
  assert.ok(!/var\(/.test(cal), 'calorie category is a literal, not an alias');
  assert.ok(!/--mm-accent/.test(cal), 'a user theme can never collapse calories into macros');
});

test('nutrition: Protein uses the theme accent at every value', () => {
  assert.match(HOME, /setMeter\('nutProMeter', n\.protein\.pct, null\)/,
    'no modifier — the meter default is var(--mm-accent)');
  assert.match(SHELL, /\.mm-meter-fill\s*\{[^}]*background:\s*var\(--mm-accent\)/);
  // Protein must not turn green on completion, or green would mean both
  // "this is calories" and "this is finished" on the same screen.
  assert.ok(!/nutProMeter'[^)]*'success'/.test(HOME), 'protein never switches to success green');
});

test('nutrition: over target is still semantic amber, overriding the category', () => {
  assert.match(HOME, /if \(n\.over\) calMod = 'warning';/);
  assert.match(SHELL, /\.mm-meter--warning \.mm-meter-fill\s*\{[^}]*background:\s*var\(--mm-warning\)/);
});

test('nutrition: Home matches the nutrition page category treatment', () => {
  // The page has coloured calories green and macros with the accent since
  // before this phase — Home now agrees rather than inventing its own scheme.
  const page = read('nutrition.html');
  assert.match(page, /\.total-cals \.bar-fill\s*\{\s*background:\s*var\(--green\)/,
    'nutrition page: calories green');
  assert.match(page, /\.bar-fill\s*\{[^}]*background:\s*var\(--red\)/,
    'nutrition page: macros accent');
  // And no rainbow per-macro palette was introduced anywhere.
  assert.ok(!/--mm-(carbs|fat|protein)\b/.test(SHELL), 'no per-macro colour tokens');
});

/* ── Day-marker state model ─────────────────────────────────────────────── */

test('day states: the outer ring belongs to today+completed alone', () => {
  const ringRule = SHELL.match(/\.mm-day\.is-today\.is-done \.mm-day-dot\s*\{([^}]*)\}/);
  assert.ok(ringRule, 'the ring is scoped to the combined state');
  assert.match(ringRule[1], /box-shadow:\s*0 0 0 2px var\(--mm-bg\), 0 0 0 4px var\(--mm-accent\)/,
    'a larger outer ring with a background-coloured gap');
  // No other day state may draw a ring.
  const dayRules = [...SHELL.matchAll(/\.mm-day[^{]*\{([^}]*)\}/g)];
  for (const r of dayRules) {
    const sel = SHELL.slice(SHELL.lastIndexOf('.mm-day', r.index), r.index + 1);
    if (/box-shadow/.test(r[1])) {
      assert.match(r[0], /is-today\.is-done/,
        `only today+completed may draw a ring — found one on: ${sel.split('\n').pop()}`);
    }
  }
});

test('day states: today-incomplete is a single accent outline at normal size', () => {
  const today = SHELL.match(/\.mm-day\.is-today \.mm-day-dot\s*\{([^}]*)\}/)[1];
  assert.match(today, /border-color:\s*var\(--mm-accent\)/, 'a single accent outline');
  assert.ok(!/box-shadow/.test(today), 'no outer ring — that would read as two circles');
  assert.ok(!/width|height|border-width/.test(today), 'same size and stroke as every other day');
});

test('day states: a previously completed day is fill + check, with no ring', () => {
  const done = SHELL.match(/\.mm-day\.is-done \.mm-day-dot\s*\{([^}]*)\}/)[1];
  assert.match(done, /background:\s*var\(--mm-accent\)/);
  assert.ok(!/box-shadow/.test(done), 'no ring on an ordinary completed day');
  assert.match(SHELL, /\.mm-day\.is-done \.mm-day-dot::after[^{]*\{[^}]*border-width:\s*0 2px 2px 0/,
    'the check is drawn as a shape');
});

test('day states: neutral days stay unmarked, and no failure state exists', () => {
  const base = SHELL.match(/\.mm-day-dot\s*\{([^}]*)\}/)[1];
  assert.match(base, /border:\s*1\.5px solid var\(--mm-line\)/, 'plain neutral circle');
  assert.ok(!/box-shadow|background:/.test(base), 'nothing marks a neutral day');
  assert.ok(!/is-missed|is-skipped|is-scheduled|is-planned|is-failed/.test(SHELL + HOME),
    'no missed/scheduled/failed day state exists anywhere');
});

test('day states: both meanings stay available without colour', () => {
  // Completed = a drawn check; today = an outline/ring. Screen readers get both.
  assert.match(HOME, /\(d\.isToday \? 'today, ' : ''\) \+ \(d\.completed \? 'completed' : 'not completed'\)/);
  assert.match(HOME, /d\.completed \? ' is-done' : ''/);
  assert.match(HOME, /d\.isToday \? ' is-today' : ''/);
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
  assert.match(HOME, /else if \(n\.protein\.consumed\)/, 'protein without a target');
  // Protein achieved is conveyed by the numbers and a full bar, not by a
  // colour change — see the category-colouring tests above.
});

/* ── 6 · Coach Insight ──────────────────────────────────────────────────── */

test('insight: Focus was renamed to Coach Insight', () => {
  assert.match(HOME_BODY, /<div class="mm-insight-label">Coach Insight<\/div>/);
  assert.ok(!/>Focus</.test(HOME_BODY), 'the old Focus label is gone');
  assert.ok(!/id="focusRow"|class="focus"/.test(HOME_BODY), 'old Focus markup removed');
  assert.ok(!/\.focus\s*\{/.test(HOME_CSS), 'old Focus CSS removed');
});

test('insight: weekly training is expressed in WORKOUTS remaining, never days', () => {
  const DM = require('./dashboard-model.js');
  const week = (completed, planned) => DM.buildFocus({
    profile: {},
    snapshot: {
      weight: {}, nutrition: { today: {}, week: {} },
      training: { streak: 0, thisWeekCount: completed,
        week: { days: [], completed, planned } },
    },
    hourOfDay: 10,
  });

  // Plural and singular, straight from the real completed/planned values.
  assert.strictEqual(week(0, 3).text, '3 workouts to hit your weekly goal.');
  assert.strictEqual(week(1, 3).text, '2 workouts to hit your weekly goal.');
  assert.strictEqual(week(2, 3).text, '1 workout to hit your weekly goal.');
  assert.strictEqual(week(0, 1).text, '1 workout to hit your weekly goal.');

  const f = week(1, 3);
  assert.strictEqual(f.id, 'week-remaining');
  assert.strictEqual(f.severity, undefined, 'being mid-week is not a warning');
  // Must never imply the remaining CALENDAR days are training days.
  assert.ok(!/day|days/i.test(f.text),
    'no day-counting — the product has no per-weekday schedule to promise');
  assert.ok(!/missed|behind|failed|should/i.test(f.text), 'no scolding');
});

test('insight: target met reads as a concise completion', () => {
  const DM = require('./dashboard-model.js');
  const met = (completed, planned) => DM.buildFocus({
    profile: {},
    snapshot: {
      weight: {}, nutrition: { today: {}, week: {} },
      training: { streak: 0, thisWeekCount: completed,
        week: { days: [], completed, planned } },
    },
    hourOfDay: 10,
  });
  assert.strictEqual(met(3, 3).text, 'Weekly training goal complete.');
  assert.strictEqual(met(3, 3).id, 'week-complete');
  assert.strictEqual(met(5, 3).text, 'Weekly training goal complete.',
    'exceeding the target still reads as complete, not as a new number');
  assert.ok(met(3, 3).text.length <= 40, 'stays concise');
});

test('insight: with no declared weekly target the rule stays silent', () => {
  const DM = require('./dashboard-model.js');
  const f = DM.buildFocus({
    profile: {},
    snapshot: {
      weight: {}, nutrition: { today: {}, week: {} },
      training: { streak: 0, thisWeekCount: 2,
        week: { days: [], completed: 2, planned: null } },
    },
    hourOfDay: 10,
  });
  // No target → no goal to count toward. Nothing else qualifies here either,
  // so the surface hides rather than inventing a denominator or filler.
  assert.strictEqual(f, null);
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

test('polish: Quick log is the Nutrition section action, in its header row', () => {
  // Moved out of a detached row beneath the metrics and into the section
  // header's value slot, which Nutrition leaves empty.
  assert.match(HOME_BODY,
    /<h2 class="mm-section-label">Nutrition<\/h2>[\s\S]{0,220}?<a class="home-action home-action--section" href="nutrition\.html#quicklog">Quick log<\/a>[\s\S]{0,40}?<\/div>/,
    'Quick log sits inside the Nutrition section header');
  assert.ok(!/home-inline-actions/.test(HOME_BODY), 'the detached action row is gone');
  // Still the same quiet weight as Log weight — both .home-action, no slab.
  assert.match(HOME_BODY, /id="logWeightBtn"/, 'Log weight is still inline in Progress');
  const actions = HOME_BODY.match(/class="home-action/g) || [];
  assert.ok(actions.length >= 3, 'choose workout, quick log and log weight');
  // The header variant keeps a full tap target without growing the header.
  assert.match(HOME_CSS, /\.home-action--section\s*\{[^}]*min-height:\s*44px/);
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
  assert.match(HOME_CSS, /\.home-action \+ \.mm-section\s*\{[^}]*margin-top:\s*12px/,
    'only the post-action gap is trimmed');
  // The shared section rhythm itself is unchanged.
  assert.match(SHELL, /\.mm-section\s*\{[^}]*margin:\s*26px 0 10px/);
});

test('polish: the first section starts without a dead band under the header', () => {
  // `:first-child` alone never matched, because the visually-hidden <h1> is the
  // real first child. The heading case is now matched explicitly — no negative
  // margins are used to compensate.
  assert.match(SHELL,
    /\.mm-section:first-child,\s*\.mm-visually-hidden \+ \.mm-section\s*\{\s*margin-top:\s*0/,
    'the first section drops its top margin structurally');
  const structure = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  assert.match(structure, /<h1 class="mm-visually-hidden">[^<]*<\/h1> <div class="mm-section">/,
    'Home is exactly that structure — the hidden h1 immediately precedes it');
});

test('polish: Progress keeps its action beside the weight, never stranded', () => {
  const row = (HOME_CSS.match(/\.home-progress\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/justify-content:\s*space-between/.test(row),
    'space-between pushed Log weight to the far right when there was no trend');
  assert.match(row, /flex-wrap:\s*wrap/, 'trend and action wrap rather than stretch apart');
  assert.match(HOME_CSS, /\.home-trend:empty\s*\{[^}]*display:\s*none/,
    'an absent trend collapses instead of leaving a gap');
});

test('polish: the calorie value uses the shared section-value scale', () => {
  assert.match(HOME_BODY.length ? HOME : HOME, /class="home-metric-value is-lead"/,
    'calories is the lead nutrition metric');
  const lead = (HOME_CSS.match(/\.home-metric-value\.is-lead\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(lead, /Bebas Neue/, 'matches the section-value family');
  const size = Number((lead.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(size >= 20 && size <= 24,
    `calorie value should sit with its siblings, not shout — got ${size}px`);
  // Protein deliberately stays at the secondary size.
  const base = (HOME_CSS.match(/\.home-metric-value\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(base, /font-size:\s*14px/);
  // And nowhere near the old 42px treatment.
  assert.ok(!/font-size:\s*(3\d|4\d)px/.test(HOME_CSS), 'no oversized calorie number returns');
});

test('polish: meters read as empty at zero and stay visible just above it', () => {
  assert.match(SHELL, /\.mm-meter\s*\{[^}]*--mm-meter-height:\s*6px/);
  assert.match(SHELL, /\.mm-meter-fill\s*\{[^}]*min-width:\s*var\(--mm-meter-height\)/,
    'a tiny value renders as a deliberate pill, not a clipped speck');
  assert.match(SHELL, /\.mm-meter\[data-empty="true"\] \.mm-meter-fill[^{]*\{[^}]*display:\s*none/);
  // Zero is hidden outright rather than floored up to the visibility minimum.
  assert.match(HOME, /if \(p === 0\) el\.setAttribute\('data-empty', 'true'\);/);
  assert.match(HOME, /else el\.removeAttribute\('data-empty'\);/);
  // aria-valuenow stays exact regardless of the visual floor.
  assert.match(HOME, /setAttribute\('aria-valuenow', String\(p\)\)/);
});

test('polish: today + completed remains readable as BOTH states', () => {
  // The fill and check carry "completed"; the outer ring adds "and it is
  // today". A thicker border could not do that job — it would vanish into the
  // accent fill — which is why the ring is drawn outside the dot.
  const combined = (SHELL.match(/\.mm-day\.is-today\.is-done \.mm-day-dot\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(combined, /box-shadow:\s*0 0 0 2px var\(--mm-bg\), 0 0 0 4px var\(--mm-accent\)/,
    'the combined state adds a larger outer ring with a visible gap');
  assert.match(SHELL, /\.mm-day\.is-done \.mm-day-dot\s*\{[^}]*background:\s*var\(--mm-accent\)/,
    'while still carrying the completed fill');
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

test('progress: weight, trend and action are one row, not a header/body split', () => {
  // Weight moved OUT of the section-header value slot, which had placed it
  // diagonally opposite its own action.
  assert.ok(!/<span class="mm-section-value" id="progValue">/.test(HOME_BODY),
    'weight no longer lives in the section header');
  assert.match(HOME_BODY,
    /<div class="home-progress">\s*<span class="home-weight" id="progValue">[\s\S]*?<span class="home-trend" id="progTrend"><\/span>\s*<button class="home-action" id="logWeightBtn" onclick="wlOpenModal\(\)">/,
    'weight → trend → action, in that reading order, in one row');
  // Weight is the primary element; trend is quieter context.
  const weight = (HOME_CSS.match(/\.home-weight\s*\{([^}]*)\}/) || [])[1] || '';
  const trend = (HOME_CSS.match(/\.home-trend\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(weight, /Bebas Neue/);
  const wSize = Number((weight.match(/font-size:\s*(\d+)px/) || [])[1]);
  const tSize = Number((trend.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(wSize > tSize, `weight (${wSize}px) must outrank the trend (${tSize}px)`);
  // Action stays right-aligned and quiet.
  assert.match(HOME_CSS, /\.home-progress \.home-action\s*\{[^}]*margin-left:\s*auto/);
  // The old standalone twin-button block is still gone.
  assert.ok(!/class="secondary"|class="secondary-btn"/.test(HOME_BODY));
  assert.ok(!/\.secondary-btn\s*\{/.test(HOME_CSS));
});

test('progress: remains an open section — never a card', () => {
  const row = (HOME_CSS.match(/\.home-progress\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/background:/.test(row), 'no surface fill');
  assert.ok(!/border:/.test(row), 'no border');
  assert.ok(!/border-radius:/.test(row), 'no card rounding');
  // Still exactly two contained surfaces on the page.
  assert.strictEqual((HOME_BODY.match(/class="mm-hero"/g) || []).length, 1);
  assert.strictEqual((HOME_BODY.match(/class="mm-insight"/g) || []).length, 1);
});

test('progress: with a real trend, all three read as one statement', () => {
  // renderProgress emits weight, then the signed 30-day change, then the row
  // keeps the action to the right.
  assert.match(HOME, /valueEl\.hidden = false;\s*valueEl\.textContent = p\.current \+ ' ' \+ p\.unit;/);
  assert.match(HOME, /trendEl\.innerHTML = arrow \+ ' ' \+ Math\.abs\(p\.change30\)/);
  assert.match(HOME, /<span class="muted">this month<\/span>/);
});

test('progress: with no trend, nothing marks where one would go', () => {
  assert.match(HOME, /if \(p\.change30 == null\)[\s\S]{0,240}?trendEl\.textContent = '';/,
    'a single weigh-in produces no trend text');
  assert.match(HOME_CSS, /\.home-trend:empty\s*\{[^}]*display:\s*none/,
    'and the empty element collapses, leaving weight + action adjacent');
  // Nothing is invented to fill the space.
  assert.ok(!/--|n\/a|no change|0 lb this month/i.test(
    (HOME.match(/function renderProgress[\s\S]*?\n  \}/) || [''])[0].replace(/this month/g, '')),
    'no placeholder trend is fabricated');
});

test('progress: with no weight at all, the state is honest and still actionable', () => {
  assert.match(HOME, /if \(!p\.hasData\)[\s\S]{0,320}?valueEl\.hidden = true;/,
    'the weight element is hidden rather than showing a lone em dash');
  assert.match(HOME, /No weigh-ins yet/, 'the empty state says so plainly');
  // The action is outside that branch, so it always remains available.
  const body = (HOME.match(/function renderProgress[\s\S]*?\n  \}/) || [''])[0];
  assert.ok(!/logWeightBtn/.test(body), 'Log weight is never hidden or disabled');
  assert.match(HOME_BODY, /id="logWeightBtn" onclick="wlOpenModal\(\)"/);
});

test('progress: cannot overflow at narrow widths or large values', () => {
  const row = (HOME_CSS.match(/\.home-progress\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(row, /flex-wrap:\s*wrap/,
    'a long weight or large text size wraps instead of overflowing 320px');
  const weight = (HOME_CSS.match(/\.home-weight\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(weight, /white-space:\s*nowrap/, 'the value itself never breaks mid-number');
  assert.ok(!/width:\s*\d+px/.test(row), 'no fixed widths to overflow');
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
  assert.match(HOME_CSS, /padding:\s*24px 16px calc\(24px \+ var\(--mm-bottom-clearance, 0px\)\)/);
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
