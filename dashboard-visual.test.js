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

test('home: This Week, Nutrition and Weight are open sections', () => {
  for (const label of ['This Week', 'Nutrition', 'Weight']) {
    const re = new RegExp('<div class="mm-section">[\\s\\S]{0,200}?' + label);
    assert.match(HOME_BODY, re, `${label} uses a background-level section header`);
  }
});

/* ── 2 · Hierarchy order ────────────────────────────────────────────────── */

test('home: sections appear in the approved priority order', () => {
  // The hero leads the page directly — no section heading precedes it.
  const heroAt = HOME_BODY.indexOf('class="mm-hero"');
  assert.ok(heroAt > -1, 'the hero is present');
  let cursor = heroAt;
  for (const label of ['This Week', 'Nutrition', 'Coach Insight', 'Weight']) {
    const at = HOME_BODY.indexOf('>' + label + '<');
    assert.ok(at > cursor, `${label} follows the previous section`);
    cursor = at;
  }
});

test('home: the weight snapshot is named WEIGHT; Progress stays the destination', () => {
  // Home shows a weight status; the bottom-nav tab owns the full history. They
  // no longer share a name, so "Progress" means one thing.
  assert.match(HOME_BODY, /<h2 class="mm-section-label">Weight<\/h2>/);
  assert.ok(!/<h2 class="mm-section-label">Progress<\/h2>/.test(HOME_BODY),
    'no Progress heading remains on Home');

  // The tab, its label and its route are untouched.
  const nav = read('app-nav.js');
  assert.match(nav, /id: 'progress',\s*label: 'Progress',\s*href: 'weight-history\.html'/);
  assert.match(nav, /routes: \['weight-history\.html'\]/);
  // And the destination page itself was not renamed or restructured.
  assert.match(read('weight-history.html'), /wlChartSVG\(/,
    'the Progress page still renders its own full chart');
});

test('home: the redundant "View progress ›" text link stays gone', () => {
  // It was a duplicate of the always-visible Progress tab. The route now lives
  // on the trend widget instead, which is a different affordance: it opens the
  // chart specifically, not the destination generally.
  // Rendered markup only — comments are prose, not UI.
  const visible = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/View progress/.test(visible), 'no View progress action on Home');
  assert.ok(!/class="home-action"[^>]*weight-history/.test(visible),
    'and no text navigation action was reinstated');
  // The only ACTION in the section is still the quick log.
  const section = HOME_BODY.slice(HOME_BODY.indexOf('mm-section-label">Weight'));
  const actions = section.match(/class="home-(?:action|log)"/g) || [];
  assert.deepStrictEqual(actions, ['class="home-log"'], 'Log weight alone');
  // The nav still carries the destination.
  assert.match(read('app-nav.js'), /href: 'weight-history\.html'/);
});

test('weight: three distinct interactions, each with its own job', () => {
  // Log a value / inspect the chart / open the destination. Collapsing any two
  // of these would lose an affordance the user relies on.
  assert.match(HOME_BODY, /<button class="home-log" id="logWeightBtn" onclick="wlOpenModal\(\)">Log weight<\/button>/,
    'record a weight');
  assert.match(HOME_BODY,
    /<a class="home-trendcard" id="progSpark" href="weight-history\.html#chartWrap"/,
    'inspect the trend');
  assert.match(read('app-nav.js'), /id: 'progress',\s*label: 'Progress',\s*href: 'weight-history\.html'/,
    'open Progress generally');
  // The widget navigates; it must never open the logging modal.
  assert.ok(!/home-trendcard[^>]*wlOpenModal/.test(HOME_BODY));
});

test('home: the redundant TRAIN heading above the hero is gone', () => {
  // "Today's Plan" inside the card already establishes the context, so a
  // section label above it was a second title for the same thing.
  assert.ok(!/<h2 class="mm-section-label">Train<\/h2>/.test(HOME_BODY),
    'no Train section label');
  // And it was not swapped for another heading — the card simply leads.
  const structure = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  assert.match(structure, /<\/h1> <section class="mm-hero"/,
    'the hero is the first thing after the page heading');
});

test('home: heading structure is a clean outline', () => {
  const h1 = HOME.match(/<h1\b/g) || [];
  assert.strictEqual(h1.length, 1, 'exactly one h1');
  const h2 = HOME_BODY.match(/<h2 class="mm-section-label">/g) || [];
  assert.strictEqual(h2.length, 3, 'This Week / Nutrition / Progress');
  // With the Train label removed, the hero title IS that section's heading —
  // leaving it an h3 would skip a level straight from the h1.
  assert.match(HOME_BODY, /<h2 class="mm-hero-title"/, 'hero title is an h2');
  assert.ok(!/<h3|<h4|<h5|<h6/.test(HOME_BODY), 'no skipped-level headings');
});

/* ── 3 · Hero ───────────────────────────────────────────────────────────── */

test('hero: uses the shared primitive and keeps the dominant action', () => {
  assert.match(HOME_BODY, /<section class="mm-hero" aria-labelledby="todayTitle">/);
  assert.match(HOME_BODY, /class="mm-hero-cta" id="todayCta"/, 'CTA is the hero primitive');
  // The secondary path stays quiet — a text action, never a second slab.
  assert.match(HOME_BODY, /class="home-action home-action--hero" id="todayAlt"/);
  const alt = (HOME_CSS.match(/\.home-action\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/background:\s*var\(--mm-accent\)/.test(alt), 'secondary action is not a filled button');
  assert.match(alt, /min-height:\s*44px/, 'but it is still a real tap target');
});

test('hero: the alternate path sits INSIDE the card, beneath the CTA', () => {
  // Standing on the background between two sections it read as a competing
  // action; inside the card it is plainly one level below START WORKOUT.
  const hero = (HOME_BODY.match(/<section class="mm-hero"[\s\S]*?<\/section>/) || [''])[0];
  assert.ok(hero.includes('id="todayAlt"'), 'the alternate action is in the hero');
  const ctaAt = hero.indexOf('id="todayCta"');
  assert.ok(ctaAt > -1 && hero.indexOf('id="todayAlt"') > ctaAt, 'and it follows the CTA');

  // Subordinate by type, not by a second button: no accent fill, smaller text.
  const modifier = (HOME_CSS.match(/\.home-action--hero\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(modifier.length, '.home-action--hero exists');
  assert.ok(!/background|border:/.test(modifier), 'never a second button');
  assert.match(modifier, /display:\s*flex/, 'it drops onto its own line under the CTA');
  assert.match(modifier, /width:\s*fit-content/,
    'the 44px box must not span the card and become an invisible full-width target');
  // The compaction is margin-only: the tap target itself is never shrunk.
  assert.ok(!/min-height/.test(modifier), 'the 44px minimum is not overridden');

  // Two actions in the card, and only ONE of them is a filled slab.
  assert.strictEqual((hero.match(/mm-hero-cta/g) || []).length, 1, 'one primary CTA');
  assert.ok(!/mm-hero-cta[^"]*" id="todayAlt"/.test(hero), 'the alternate is not a second CTA');
});

test('hero: the alternate is demoted only where it competes with the CTA', () => {
  // Demoted by SIZE, not by contrast, so START WORKOUT stays unmistakably
  // primary while the alternate still reads as reachable.
  const demoted = (HOME_CSS.match(
    /\.mm-hero-cta:not\(\[hidden\]\) \+ \.home-action--hero\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(demoted.length, 'the demotion is scoped to a VISIBLE primary CTA');
  assert.match(demoted, /font-size:\s*12px/, 'one step smaller than the 13px base');

  // `:not([hidden])` is load-bearing: a hidden CTA is still an adjacent sibling,
  // so a bare `+` would also shrink the completed state's only action.
  assert.ok(!/^\s*\.mm-hero-cta \+ \.home-action--hero/m.test(HOME_CSS),
    'the unscoped sibling selector must not be used');
  assert.match(HOME, /cta\.hidden = true;/, 'the completed state does hide the CTA');

  // It must never be dimmed below the standard quiet-action tier. Tertiary
  // measured 4.8:1 — past AA on paper, but it read as DISABLED on device, and
  // a secondary action has to look reachable.
  assert.match(demoted, /color:\s*var\(--mm-text-secondary\)/,
    'the alternate keeps the standard secondary text colour');
  assert.ok(!/--mm-text-tertiary/.test(demoted), 'never the muted tier');
  const secondary = (SHELL.match(/--mm-neutral-muted:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
  const raised = (SHELL.match(/--mm-surface-raised:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const l1 = Math.max(lum(secondary), lum(raised)), l2 = Math.min(lum(secondary), lum(raised));
  const ratio = (l1 + 0.05) / (l2 + 0.05);
  assert.ok(ratio >= 7, `alternate action contrast ${ratio.toFixed(2)}:1 — clearly actionable`);
  assert.ok(!/opacity/.test(demoted), 'dimming by opacity would read as disabled');

  // Hover is the shared .home-action behaviour — no local override cancelling it.
  assert.ok(!/\.home-action--hero:hover/.test(HOME_CSS),
    'no override that would flatten hover feedback to its resting colour');

  // Still decisively quieter than the primary: 12px Barlow vs 19px Bebas.
  const cta = (SHELL.match(/\.mm-hero-cta\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(cta, /font-size:\s*19px/);
  assert.match(cta, /background:\s*var\(--mm-accent\)/, 'only the CTA carries the accent');
  assert.ok(!/background|--mm-accent/.test(demoted), 'the alternate has no fill and no accent');

  // Behaviour, target and chevron are untouched by the demotion.
  assert.ok(!/min-height|display:\s*none|pointer-events/.test(demoted));
  assert.match(HOME_CSS, /\.mm-hero-cta:not\(\[hidden\]\) \+ \.home-action--hero::after\s*\{[^}]*font-size:\s*14px/,
    'the chevron scales with the text — it is never removed');
});

test('hero: the alternate action keeps its exact existing behaviour', () => {
  // Same element, same handler, same destinations — this refinement moved it
  // and renamed one label; it did not touch what it does.
  assert.match(HOME, /alt\.onclick = t\.secondary\.action === 'discard'\s*\?\s*discardSession/,
    'discard still routes to discardSession');
  assert.match(HOME, /window\.location\.href = t\.secondary\.href;/,
    'every other state still navigates to the model href');
  assert.match(HOME, /if \(t\.secondary\) \{[\s\S]{0,320}?alt\.hidden = true;/,
    'and it still hides when the state has no alternate');

  const DM = require('./dashboard-model.js');
  const start = DM.buildToday({
    snapshot: { training: {} },
    program: { sessionLabel: 'Upper Body', href: 'workout.html?program=x' },
  });
  assert.strictEqual(start.secondary.href, 'workout.html', 'destination unchanged');
  assert.strictEqual(start.secondary.label, 'Choose a different workout',
    'copy names the alternative to the session already proposed above it');
  // The no-program state proposes nothing, so "a different workout" would be
  // wrong there — that label is deliberately untouched.
  const choose = DM.buildToday({ snapshot: {}, program: { needsSelection: true } });
  assert.strictEqual(choose.secondary.label, 'Choose workout');
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

test('week: the strip is the shared primitive', () => {
  assert.match(HOME_BODY, /<div class="mm-daystrip" id="weekStrip"/);
});

test('week: the count and the strip share one source', () => {
  // Both come from model.week, which reads snapshot.training.week.
  assert.match(HOME, /renderWeek\(model\.week\)/);
  assert.match(HOME, /weekValue'\)\.textContent = w\.hasData \? w\.label/);
  assert.match(HOME, /\(w\.days \|\| \[\]\)\.map/);
});

test('week: the duplicated horizontal progress bar is gone', () => {
  // The count says how many, the strip says which days — a bar restated the
  // same number a third time and was the only duplicated indicator on Home.
  assert.ok(!/weekMeter/.test(HOME), 'no weekly meter element or wiring remains');
  assert.ok(!/aria-label="Weekly training progress"/.test(HOME),
    'and no orphaned progressbar role is left behind');
  // Nutrition still owns the only two meters on the page.
  const meters = HOME_BODY.match(/class="mm-meter"/g) || [];
  assert.strictEqual(meters.length, 0, 'no static meter markup outside rendered nutrition');
  assert.strictEqual((HOME.match(/class="mm-meter" id="nut(Cal|Pro)Meter"/g) || []).length, 2);
});

test('week: every day state survived the bar removal', () => {
  // The strip was already the stronger of the two indicators; nothing about
  // distinguishing today / completed / neutral / future may weaken.
  assert.match(HOME, /d\.completed \? ' is-done' : ''/);
  assert.match(HOME, /d\.isToday \? ' is-today' : ''/);
  assert.match(HOME, /d\.isFuture \? ' is-future' : ''/);
  assert.match(HOME, /\(d\.isToday \? 'today, ' : ''\) \+ \(d\.completed \? 'completed' : 'not completed'\)/);
  // The count remains, including the honest no-target form.
  assert.match(HOME, /weekValue'\)\.textContent = w\.hasData \? w\.label : '—'/);
  const DM = require('./dashboard-model.js');
  const withTarget = DM.buildWeek({ snapshot: { training: { week: { days: [], completed: 1, planned: 3 } } } });
  assert.strictEqual(withTarget.label, '1 / 3 workouts');
});

test('week: the gap to Nutrition is corrected optically, and only there', () => {
  // Round day markers make the space under them read larger than the same
  // measurement under a flat element, so this one section gap is trimmed.
  const gap = Number((HOME_CSS.match(/\.home-row \+ \.mm-section\s*\{[^}]*margin-top:\s*(\d+)px/) || [])[1]);
  assert.ok(gap, 'the corrective rule exists');
  // It must stay clearly larger than the 10px a section label sits above its
  // OWN content, or the two sections stop reading as separate.
  const rhythm = Number((SHELL.match(/\.mm-section\s*\{[^}]*margin:\s*\d+px 0 (\d+)px/) || [])[1]);
  // Two distinct information groups: training adherence, then nutrition status.
  // At 14px they began reading as one group, so the correction is bounded from
  // BELOW as well as above — tighter than the standard rhythm, never merged.
  assert.ok(gap >= rhythm * 2,
    `section gap (${gap}px) must clearly exceed the label's own gap (${rhythm}px)`);
  assert.ok(gap < 26, 'and it is genuinely a reduction from the standard rhythm');

  // Scoped by adjacency: the nutrition row is followed by the insight, not by
  // a section header, so no other transition is affected.
  const structure = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  const matches = (structure.match(/<\/a> <div class="mm-section">/g) || []).length;
  assert.strictEqual(matches, 1, 'exactly one row→section transition exists on Home');
  // The shared rhythm itself is untouched for every other section.
  assert.match(SHELL, /\.mm-section\s*\{[^}]*margin:\s*26px 0 10px/);
});

test('week: the row containing the strip is still a real tap target', () => {
  // With the meter gone the link is shorter, so its height now comes from the
  // day cells alone: 10px label + 7px gap + 22px dot + padding ≈ 45px.
  assert.match(HOME_BODY, /<a class="home-row" href="workout-history\.html">/);
  const dot = (SHELL.match(/\.mm-day-dot\s*\{([^}]*)\}/) || [])[1] || '';
  const day = (SHELL.match(/\.mm-day\s*\{([^}]*)\}/) || [])[1] || '';
  const row = (HOME_CSS.match(/\.home-row\s*\{([^}]*)\}/) || [])[1] || '';
  const px = (s, re) => Number((s.match(re) || [])[1] || 0);
  const height = px(dot, /height:\s*(\d+)px/) + px(day, /gap:\s*(\d+)px/) + 10 +
    px(row, /padding:\s*(\d+)px/) + 4;
  assert.ok(height >= 44, `the week row measures ~${height}px — must clear 44px`);
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

test('polish: Log food follows the metrics it acts on, not the heading', () => {
  // Reading order: nutrition status → log something → what Coach makes of it.
  const structure = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  assert.match(structure,
    /<h2 class="mm-section-label">Nutrition<\/h2> <\/div> <a class="home-row" href="nutrition\.html" id="nutRow">[\s\S]*?<\/a> <div class="home-actions"> <a class="home-log" href="nutrition\.html#quicklog">Log food<\/a> <\/div>/,
    'heading, then the metrics row, then Log food beneath it');
  assert.ok(!/mm-section-label">Nutrition<\/h2>\s*<a class="home-log/.test(HOME_BODY),
    'it no longer shares the heading row');
  // It must sit OUTSIDE #nutRow — that block is itself an anchor.
  const row = (HOME_BODY.match(/<a class="home-row" href="nutrition\.html" id="nutRow">[\s\S]*?<\/a>/) || [''])[0];
  assert.ok(!row.includes('home-log'), 'never an anchor nested inside an anchor');
  // The header-slot variants existed only to serve that placement.
  assert.ok(!/home-log--section|home-action--section/.test(HOME_BODY + HOME_CSS),
    'the now-unused section-header action variants are removed');
  assert.match(HOME_BODY, /id="logWeightBtn"/, 'Log weight is still in Progress');
});

test('actions: the two logging actions share one pattern and one grid line', () => {
  // Same class, so typography, size, weight, plus glyph, accent treatment and
  // the 44px target are one definition — they cannot drift apart.
  const logs = HOME_BODY.match(/class="home-log"/g) || [];
  assert.strictEqual(logs.length, 2, 'Log food and Log weight, both .home-log');
  assert.ok(!/class="home-log [a-z-]+"/.test(HOME_BODY),
    'neither carries a positional modifier that would offset it from the other');

  // Both are the first child of a .home-actions row, which is left-aligned to
  // the content grid — so they start at the same x with no per-action rule.
  const rows = HOME_BODY.match(/<div class="home-actions">\s*<(a|button) class="home-log"/g) || [];
  assert.strictEqual(rows.length, 2, 'each logging action leads its own action row');
  const actions = (HOME_CSS.match(/\.home-actions\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/justify-content|margin-left|padding-left|text-align/.test(actions),
    'no rule shifts one row off the grid line the other sits on');
  assert.match(actions, /display:\s*flex/);

  // Distinct behaviour is preserved: one deep-links, one opens the modal.
  assert.match(HOME_BODY, /<a class="home-log" href="nutrition\.html#quicklog">Log food<\/a>/);
  assert.match(HOME_BODY, /<button class="home-log" id="logWeightBtn" onclick="wlOpenModal\(\)">Log weight<\/button>/);
});

test('actions: creation and navigation are two distinct visual languages', () => {
  // A plus means "add something"; a chevron means "go and look". Mixing them
  // would make Home's two jobs — status and logging — read as one.
  const log = (HOME_CSS.match(/\.home-log\s*\{([^}]*)\}/) || [])[1] || '';
  const nav = (HOME_CSS.match(/\.home-action\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(log.length && nav.length, 'both action classes exist');
  assert.match(HOME_CSS, /\.home-log::before\s*\{[^}]*content:\s*'\+'/, 'logging carries a plus');
  assert.match(HOME_CSS, /\.home-action::after\s*\{[^}]*content:\s*'›'/, 'navigation carries a chevron');
  assert.ok(!/content:\s*'›'/.test(log), 'a logging action never takes a chevron');
  assert.match(log, /text-transform:\s*uppercase/, 'logging is uppercase');
  assert.ok(!/text-transform/.test(nav), 'navigation stays sentence case');

  // Neither is a button, and neither rivals the hero CTA.
  for (const [name, body] of [['home-log', log], ['home-action', nav]]) {
    assert.ok(!/background:\s*var\(--mm-accent\)/.test(body), `${name} has no accent fill`);
    assert.ok(!/border:\s*1px/.test(body), `${name} is not a bordered button`);
    assert.match(body, /min-height:\s*44px/, `${name} is still a real tap target`);
  }
  // Only the plus glyph is accented — never the whole label.
  assert.match(HOME_CSS, /\.home-log::before\s*\{[^}]*color:\s*var\(--mm-accent\)/);
  assert.ok(!/--mm-accent/.test(log), 'the label itself is not accent-coloured');

  // Exact assignment of the language across Home.
  assert.match(HOME_BODY, /class="home-log" href="nutrition\.html#quicklog">Log food</, 'food = creation');
  assert.match(HOME_BODY, /class="home-log" id="logWeightBtn"[^>]*>Log weight</, 'weight = creation');
  // The alternate-workout label is supplied by the model, so the element is
  // what carries the language — it must remain a .home-action, never a log.
  assert.match(HOME_BODY, /class="home-action home-action--hero" id="todayAlt"/,
    'Choose a different workout stays a navigation action');
  const DM = require('./dashboard-model.js');
  assert.strictEqual(
    DM.buildToday({ snapshot: {}, program: { sessionLabel: 'X', href: 'workout.html?p' } })
      .secondary.label,
    'Choose a different workout', 'and its label is unchanged');
  // Coach Insight is untouched and keeps its own action treatment.
  assert.match(HOME_BODY, /class="mm-insight-action" id="insightAction"/);
  assert.match(SHELL, /\.mm-insight-action::after\s*\{[^}]*content:\s*'›'/);
});

test('polish: Log food opens the EXISTING nutrition flow, not a new one', () => {
  const nutrition = read('nutrition.html');
  // Renaming the presentation must not turn the shortcut into plain navigation
  // to the top of Nutrition — the hash is what triggers scroll-and-focus.
  assert.match(HOME_BODY, /href="nutrition\.html#quicklog"/, 'still the deep link');
  assert.match(nutrition, /function focusQuickLogFromHash\(\)/);
  assert.match(nutrition, /window\.location\.hash !== '#quicklog'/);
  assert.match(nutrition, /getElementById\('aiLogInput'\)/,
    'it targets the existing Quick Log field');
  assert.match(nutrition, /\.focus\(/, 'and focuses it, so typing can start immediately');
  assert.match(nutrition, /<form class="ai-log-row" onsubmit="aiQuickLog\(event\)">/,
    'the original Quick Log form is untouched');
  // No second logging implementation anywhere on Home.
  assert.ok(!/aiQuickLog|aiLogInput|food_logs|nuSaveLog/.test(HOME),
    'Home implements no logging of its own');
});

test('actions: Log weight invokes the shared weight-entry flow, not a copy', () => {
  // weight.js is the one owner of the Log/Edit Weight modal, and Home already
  // used it — this pass changed the label, never the flow.
  assert.match(HOME_BODY, /id="logWeightBtn" onclick="wlOpenModal\(\)"/);
  const weight = read('weight.js');
  assert.match(weight, /One source of truth for body-weight queries/);
  assert.match(weight, /function wlOpenModal\(/);
  assert.match(HOME, /document\.getElementById\('weightModalMount'\)\.innerHTML = wlModalMarkup\(\);/,
    'Home mounts the shared modal markup rather than defining its own');

  // Home must own no part of weight persistence, validation or formatting.
  // Comments are prose, not implementation — strip them before checking.
  const homeCode = HOME.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const owned of ['body_weight_logs', 'wlUpsert', 'wlSave(', 'wlSyncProfileWeight',
    'upsert(', 'onConflict']) {
    assert.ok(!homeCode.includes(owned), `${owned} belongs to weight.js, not Home`);
  }
  assert.match(weight, /async function wlSave\(/, 'saving still lives in weight.js');
  assert.match(HOME, /window\.onWeightSaved = async function/,
    'Home only supplies the refresh hook weight.js calls back into');
});

test('actions: the model still knows the destination, even unrendered on Home', () => {
  // Removing the link is a PRESENTATION change: the view-model keeps `href`
  // for any future consumer, and the nav still routes there.
  const DM = require('./dashboard-model.js');
  assert.strictEqual(DM.buildProgress({ snapshot: { weight: { current: 200 } } }).href,
    'weight-history.html');
  assert.strictEqual(DM.buildProgress({ snapshot: {} }).href, 'weight-history.html',
    'including in the empty state');
  assert.match(read('app-nav.js'), /id: 'progress',[\s\S]{0,120}?href: 'weight-history\.html'/);
});

test('polish: no orphaned inline action is left between two sections', () => {
  // The rule that trimmed the gap under a free-standing action existed only for
  // the alternate-workout button, which now lives inside the hero. Home has no
  // action floating on the background between sections at all.
  assert.ok(!/\.home-action \+ \.mm-section/.test(HOME_CSS), 'the compensating rule is gone');
  // Every action is now inside a hero, a section header or the Progress action
  // row — none is a bare direct child of <main>.
  const main = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<section class="mm-hero"[\s\S]*?<\/section>/, '')
    .replace(/<div class="mm-section">[\s\S]*?<\/div>/g, '')
    .replace(/<div class="home-actions">[\s\S]*?<\/div>/g, '');
  assert.ok(!/home-action|home-log/.test(main), 'no action floats on the background');
  // The shared section rhythm itself is unchanged.
  assert.match(SHELL, /\.mm-section\s*\{[^}]*margin:\s*26px 0 10px/);
});

test('polish: the page starts without a dead band under the header', () => {
  // The hero now leads directly, so it is that element — not a section header —
  // which must carry no top margin. The primitive owns no margin at all.
  const hero = (SHELL.match(/\.mm-hero\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/margin/.test(hero), 'the hero adds no top margin of its own');
  // The shell keeps its first-section rule for any page that DOES open with a
  // section header (`:first-child` alone silently fails behind a hidden h1).
  assert.match(SHELL,
    /\.mm-section:first-child,\s*\.mm-visually-hidden \+ \.mm-section\s*\{\s*margin-top:\s*0/);
  // Only the container's own padding separates the header from the card.
  assert.match(HOME_CSS, /\.container\s*\{[^}]*padding:\s*24px 16px/);
});

test('polish: the hero is tighter without changing its structure or its CTA', () => {
  // Height came out of SPACING only — no element was resized or removed.
  const body = (SHELL.match(/\.mm-hero-body\s*\{([^}]*)\}/) || [])[1] || '';
  const pad = body.match(/padding:\s*(\d+)px (\d+)px/);
  assert.ok(pad, 'vertical and horizontal padding are declared separately');
  assert.ok(Number(pad[1]) < Number(pad[2]),
    'the card gives back vertical space; its 20px side padding defines the shape');
  assert.ok(Number(pad[1]) >= 14, `${pad[1]}px vertical padding — tighter, not cramped`);
  assert.match(body, /max-width:\s*74%/, 'copy constraint unchanged');

  // The primary CTA keeps its dimensions; only the space above it moved.
  const cta = (SHELL.match(/\.mm-hero-cta\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(cta, /min-height:\s*48px/, 'button height unchanged');
  assert.match(cta, /padding:\s*12px 26px/, 'button padding unchanged');
  assert.match(cta, /font-size:\s*19px/, 'button type unchanged');
  assert.match(cta, /background:\s*var\(--mm-accent\)/, 'still the theme accent, still filled');
  const ctaGap = Number((cta.match(/margin-top:\s*(\d+)px/) || [])[1]);
  assert.ok(ctaGap >= 8 && ctaGap < 16, `CTA clearance tightened to ${ctaGap}px`);

  // Title prominence and the card's own chrome are untouched.
  assert.match(SHELL, /\.mm-hero-title\s*\{[^}]*clamp\(34px, 9vw, 46px\)/);
  const shell = (SHELL.match(/\.mm-hero\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(shell, /border-radius:\s*16px/);
  assert.match(shell, /background:\s*var\(--mm-surface-raised\)/);
  assert.match(SHELL, /\.mm-hero::before\s*\{[^}]*radial-gradient/, 'the accent wash survives');
});

test('polish: Nutrition is tighter but the label/bar pairing still reads', () => {
  const gap = Number((HOME_CSS.match(/\.home-metric\s*\{[^}]*margin:\s*0 0 (\d+)px/) || [])[1]);
  const between = Number((HOME_CSS.match(/\.home-metric \+ \.mm-meter\s*\{[^}]*margin-bottom:\s*(\d+)px/) || [])[1]);
  // Was 7 / 14. Roughly a 10–15% reduction across the section, not a squeeze.
  assert.ok(gap >= 4 && gap < 7, `label→bar gap tightened to ${gap}px, still legible`);
  assert.ok(between >= 8 && between < 14, `group gap tightened to ${between}px`);
  assert.ok(between >= gap * 1.8,
    'a metric must still sit closer to its own bar than to the next metric');

  // Tightened by spacing alone — type sizes and tap targets are untouched.
  assert.match(HOME_CSS, /\.home-metric-value\s*\{[^}]*font-size:\s*14px/);
  assert.match(HOME_CSS, /\.home-log\s*\{[^}]*min-height:\s*44px/);
  assert.match(SHELL, /\.mm-meter\s*\{[^}]*--mm-meter-height:\s*6px/, 'bars keep their height');
});

test('polish: Nutrition still shows exactly calories and protein', () => {
  // Tightening the section must not become an excuse to add metrics to it.
  assert.ok(!/\b(carbs|carbohydrate|fat|fiber|water|sugar|sodium)\b/i.test(
    HOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')),
    'no additional macro or hydration metric was introduced');
  const labels = HOME.match(/class="home-metric-label">([^<]+)</g) || [];
  assert.deepStrictEqual([...new Set(labels)].sort(),
    ['class="home-metric-label">Calories<', 'class="home-metric-label">Protein<']);
  // And calories stays the "remaining" model, not a consumed/target headline.
  assert.match(HOME, /n\.left\.toLocaleString\(\) \+ ' <span class="sub">kcal ' \+ \(n\.over \? 'over' : 'left'\)/);
});

test('polish: Coach Insight is compact without losing anything it carries', () => {
  const insight = (SHELL.match(/\.mm-insight\s*\{([^}]*)\}/) || [])[1] || '';
  const pad = insight.match(/padding:\s*(\d+)px (\d+)px/);
  assert.ok(pad, 'the insight declares its padding');
  assert.ok(Number(pad[1]) < 14 && Number(pad[1]) >= 10,
    `vertical padding trimmed to ${pad[1]}px — compact, not cramped`);

  // Every part of the surface survives: label, icon, text, action, accent edge.
  assert.match(HOME_BODY, /<div class="mm-insight-label">Coach Insight<\/div>/);
  assert.match(HOME_BODY, /class="mm-insight-icon"[\s\S]{0,240}?<svg/, 'the icon remains');
  assert.match(HOME_BODY, /<p class="mm-insight-text" id="insightText">/);
  assert.match(HOME_BODY, /class="mm-insight-action" id="insightAction"/);
  assert.match(SHELL, /\.mm-insight\s*\{[^}]*border-left:\s*2px solid var\(--mm-accent\)/);
  assert.ok(!/toast|banner/i.test(HOME_BODY.match(/<section class="mm-insight"[\s\S]*?<\/section>/)[0]),
    'it is still a surface on the page, not a transient toast');

  // The height came out of CHROME, never out of the tap target.
  const action = (SHELL.match(/\.mm-insight-action\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(action, /min-height:\s*44px/, 'the action is still 44px');
  const negatives = [...action.matchAll(/-(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(negatives.length && Math.max(...negatives) < 44,
    'margins absorb dead space but can never collapse the target itself');
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

test('progress: the reading anchors left, the sparkline balances right', () => {
  // Weight is still out of the section-header value slot.
  assert.ok(!/<span class="mm-section-value" id="progValue">/.test(HOME_BODY),
    'weight no longer lives in the section header');
  const structure = HOME_BODY.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  assert.match(structure,
    /<div class="home-progress"> <div class="home-weightstack"> <span class="home-weight" id="progValue">[^<]*<\/span> <span class="home-trend" id="progTrend"><\/span> <\/div> <a class="home-trendcard" id="progSpark" href="weight-history\.html#chartWrap" aria-label="View weight trend in Progress" hidden><\/a> <\/div> <div class="home-actions"> <button class="home-log" id="logWeightBtn" onclick="wlOpenModal\(\)">Log weight<\/button> <\/div>/,
    'weight + change stacked left, trend widget right, then the logging action');

  // Weight and its change stay one group; the widget takes the space on the
  // right and gives way first when the row cannot hold both.
  const stack = (HOME_CSS.match(/\.home-weightstack\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(stack, /flex-direction:\s*column/, 'the two readings stack together');
  assert.ok(!/min-width:\s*0/.test(stack),
    'the reading keeps its intrinsic width — the widget is what gives way');
  const spark = (HOME_CSS.match(/\.home-trendcard\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(spark, /margin-left:\s*auto/, 'the widget balances the right');

  // Weight is the primary element; the change is quieter context beside it.
  const weight = (HOME_CSS.match(/\.home-weight\s*\{([^}]*)\}/) || [])[1] || '';
  const trend = (HOME_CSS.match(/\.home-trend\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(weight, /Bebas Neue/);
  const wSize = Number((weight.match(/font-size:\s*(\d+)px/) || [])[1]);
  const tSize = Number((trend.match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(wSize > tSize, `weight (${wSize}px) must outrank the change (${tSize}px)`);
  // The old standalone twin-button block is still gone.
  assert.ok(!/class="secondary"|class="secondary-btn"/.test(HOME_BODY));
  assert.ok(!/\.secondary-btn\s*\{/.test(HOME_CSS));
});

test('progress: related items stay grouped, and nothing is indented', () => {
  // Weight + change is one status statement, held together in the stack rather
  // than separated across the row.
  assert.ok(!/\.home-trend\s*\{[^}]*margin-left:\s*auto/.test(HOME_CSS),
    'the change is not pushed away from the weight it belongs to');
  assert.ok(!/is-empty/.test(HOME_CSS + HOME),
    'the empty-state realignment that push required is still gone');

  // The action row is a single left-aligned action; nothing forces members of
  // a pair to opposite edges.
  const actions = (HOME_CSS.match(/\.home-actions\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/justify-content:\s*space-between/.test(actions));
  assert.match(actions, /flex-wrap:\s*wrap/, 'it wraps rather than cramping');

  // Every row starts on the same content-grid line.
  for (const sel of ['.home-progress', '.home-actions', '.home-weightstack']) {
    const body = (HOME_CSS.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}')) || [])[1] || '';
    assert.ok(body.length, `${sel} has a rule`);
    assert.ok(!/margin-left:|padding-left|text-align/.test(body), `${sel} is not indented`);
  }
});

test('weight: the trend widget balances the section without dominating it', () => {
  const spark = (HOME_CSS.match(/\.home-trendcard\s*\{([^}]*)\}/) || [])[1] || '';
  const width = Number((spark.match(/width:\s*(\d+)%/) || [])[1]);
  assert.ok(width && width <= 50, `widget takes ${width}% — never more than the reading`);
  assert.match(spark, /max-width:\s*\d+px/, 'capped so it cannot grow on a wide screen');
  assert.match(spark, /min-width:\s*\d+px/, 'and floored so it stays a readable chart');
  assert.match(spark, /flex:\s*0 1 auto/, 'it shrinks before the weight column does');

  // Sized in the requested band, and the weight value still leads the section:
  // a 24px Bebas number against a quiet bordered box.
  const h = Number((spark.match(/height:\s*(\d+)px/) || [])[1]);
  assert.ok(h >= 70 && h <= 90, `widget height ${h}px sits in the 70–90px band`);
  const min = Number((spark.match(/min-width:\s*(\d+)px/) || [])[1]);
  const max = Number((spark.match(/max-width:\s*(\d+)px/) || [])[1]);
  assert.ok(min >= 140 && max <= 170, `widget spans ${min}–${max}px`);
  assert.match(HOME_CSS, /\.home-weight\s*\{[^}]*font-size:\s*24px/,
    'the weight value keeps its scale');
  assert.match(spark, /padding:/, 'internal breathing room so the line never touches the edge');
});

test('weight: the widget borrows the Progress chart card, not a new look', () => {
  // Seeing the mini widget and then the full chart should feel like one object
  // at two sizes — so it reuses that card's surface, hairline and radius.
  const mini = (HOME_CSS.match(/\.home-trendcard\s*\{([^}]*)\}/) || [])[1] || '';
  const full = (read('weight-history.html').match(/\.chart-card\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(full.length, 'the Progress page still defines .chart-card');
  assert.match(full, /background:\s*var\(--surface-1\)/);
  assert.match(full, /border:\s*1px solid var\(--border-2\)/);
  assert.match(full, /border-radius:\s*10px/);
  // Same steps, named through the current token layer rather than the legacy
  // aliases (app-shell.css maps --surface-1 → --mm-surface-raised, --border-2 → --mm-line).
  assert.match(mini, /background:\s*var\(--mm-surface-raised\)/);
  assert.match(mini, /border:\s*1px solid var\(--mm-line\)/);
  assert.match(mini, /border-radius:\s*10px/, 'same radius as the full chart card');
  assert.match(SHELL, /--surface-1:\s*var\(--mm-surface-raised\)/);
  assert.match(SHELL, /--border-2:\s*var\(--mm-line\)/);
  // No raw colour anywhere in the widget.
  assert.ok(!/#[0-9A-Fa-f]{3,8}\b|rgba?\(/.test(mini), 'tokens only');
});

test('progress: weight direction is never coloured good or bad', () => {
  // Losing weight is not universally good and gaining is not universally bad —
  // it depends on whether the user is cutting, maintaining or bulking, and
  // nothing on Home knows that. Colouring it would be an unsupported judgement.
  const trend = (HOME_CSS.match(/\.home-trend\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(trend, /color:\s*var\(--mm-text-secondary\)/, 'neutral text colour');
  assert.ok(!/\.home-trend\.(down|up)\s*\{/.test(HOME_CSS),
    'no direction-keyed colour rule may exist');
  assert.ok(!/--mm-success|--mm-danger|--mm-warning/.test(
    HOME_CSS.slice(HOME_CSS.indexOf('.home-trend'), HOME_CSS.indexOf('.home-spark'))),
    'no semantic colour anywhere in the trend treatment');
  // weight.js states the same rule for its own delta pill — Home now agrees.
  assert.match(read('weight.js'), /Neutral by design/);
});

test('weight: the widget is an accessible navigation target, the SVG is not', () => {
  // The CONTAINER is the control and announces the destination; the drawing
  // stays decorative, because the weight and change text already state the
  // status in words.
  assert.match(HOME, /<a class="home-trendcard" id="progSpark" href="weight-history\.html#chartWrap"\s*\n?\s*aria-label="View weight trend in Progress" hidden><\/a>/,
    'a real anchor with a label naming where it goes');
  assert.match(HOME, /aria-hidden="true" focusable="false"/,
    'the SVG itself is hidden from assistive technology');
  // A native <a href> gives keyboard activation and focus for free — no
  // tabindex or key handler is needed, and none is used.
  const render = (HOME.match(/function renderSparkline[\s\S]*?\n  \}/) || [''])[0];
  assert.ok(render.length, 'renderSparkline exists');
  for (const attr of ['href', 'onclick', 'tabindex', 'role=', 'addEventListener']) {
    assert.ok(!render.includes(attr), `the emitted drawing carries no ${attr}`);
  }
  assert.match(HOME_CSS, /\.home-trendcard:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--mm-accent\)/,
    'and it uses the app-wide focus ring');
  // Nothing may suppress the tap it now needs to receive.
  const spark = (HOME_CSS.match(/\.home-trendcard\s*\{([^}]*)\}/) || [])[1] || '';
  assert.ok(!/pointer-events:\s*none/.test(spark), 'the widget must be tappable');

  // Theme tokens throughout.
  assert.match(spark, /color:\s*var\(--mm-accent\)/, 'theme token, not a literal');
  assert.match(HOME_CSS, /\.home-trendcard polyline\s*\{[^}]*stroke:\s*currentColor/,
    'the stroke follows the theme colour, so a user accent flows through');

  // No chart chrome: no axes, grid, ticks, labels, tooltips or heading.
  assert.ok(!/<text|tooltip|axis|gridline|TREND|legend/i.test(render),
    'a preview, not a second full chart');
  // Geometry is borrowed from weight.js — Home computes none of its own.
  assert.match(HOME, /wlSparklinePoints\(series\)/, 'geometry comes from the shared module');
  assert.ok(!/Math\.(min|max)|\/ *span|normali[sz]/i.test(render),
    'Home does no scaling maths of its own');
});

test('weight: the widget opens the EXISTING Trend chart, adding no new page', () => {
  const page = read('weight-history.html');
  // #chartWrap already existed as the container renderChart() fills — no new
  // target was invented, and the section itself is untouched.
  assert.match(page, /<div id="chartWrap"><\/div>/, 'the existing container is the anchor');
  assert.match(page, /wrap\.innerHTML = '<div class="section-label">Trend<\/div><div class="chart-card">' \+ svg/,
    'the Trend section renders exactly as before');
  // The only addition is a scroll that waits for the chart to exist, because a
  // plain anchor would jump to an empty div.
  assert.match(page, /function scrollToTrendFromHash\(\)/);
  assert.match(page, /window\.location\.hash !== '#chartWrap'/);
  assert.match(page, /if \(!el \|\| !el\.firstChild\) return;/, 'never scrolls to an empty container');
  assert.match(page, /await refresh\(\);\s*\n\s*scrollToTrendFromHash\(\);/, 'called after render');

  // Entering Progress normally is unaffected: the handler is a no-op without
  // the hash, and nothing else about the page changed.
  assert.ok(!/scrollToTrendFromHash/.test(page.replace(/function scrollToTrendFromHash[\s\S]*?\n  \}/, '')
    .replace(/scrollToTrendFromHash\(\);/, '')), 'exactly one definition and one call site');
  // Home introduces no chart of its own beyond the shared sparkline helper.
  assert.ok(!/wlChartSVG/.test(HOME), 'the full chart is never duplicated onto Home');
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

test('progress: with a real trend, the change states its own window', () => {
  assert.match(HOME, /valueEl\.hidden = false;\s*valueEl\.textContent = p\.current \+ ' ' \+ p\.unit;/);
  assert.match(HOME, /Math\.abs\(p\.change30\)/, 'the signed 30-day change is rendered');
  assert.match(HOME, /<span class="muted">this month<\/span>/,
    'the window is named, so the number is never an unlabelled delta');
  // The arrow is decorative; direction is also spoken, since "↓" announces badly.
  assert.match(HOME, /<span aria-hidden="true">' \+ arrow \+ '<\/span>/);
  assert.match(HOME, /var spoken = p\.direction === 'down' \? 'Down'/);
  assert.match(HOME, /<span class="mm-visually-hidden">' \+ spoken/);
});

test('progress: with no trend, nothing marks where one would go', () => {
  assert.match(HOME, /if \(p\.change30 == null\)[\s\S]{0,240}?trendEl\.textContent = '';/,
    'a single weigh-in produces no trend text');
  assert.match(HOME_CSS, /\.home-trend:empty\s*\{[^}]*display:\s*none/,
    'and the empty element collapses rather than leaving a gap');
  // Nothing is invented to fill the space.
  const body = (HOME.match(/function renderProgress[\s\S]*?\n  \}/) || [''])[0]
    .replace(/this month/g, '').replace(/No change,/g, '');
  assert.ok(!/n\/a|0 lb this month/i.test(body), 'no placeholder trend is fabricated');
});

test('progress: with no weight at all, the state is honest and still actionable', () => {
  assert.match(HOME, /if \(!p\.hasData\)[\s\S]{0,320}?valueEl\.hidden = true;/,
    'the weight element is hidden rather than showing a lone em dash');
  assert.match(HOME, /No weigh-ins yet/, 'the empty state says so plainly');
  // With the row grouped from the left, the empty message simply leads it —
  // no special-case realignment is needed any more.
  assert.match(HOME, /trendEl\.className = 'home-trend';/);
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
