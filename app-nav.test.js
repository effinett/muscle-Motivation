// app-nav.test.js — Phase 4.3.4 CP2 contract for the shared app-shell nav.
//
// Two layers, both pure static/offline analysis (no browser, no DOM engine):
//   1. the app-nav.js decision layer (route resolution, suppression, markup)
//   2. the integration contract — which pages participate, the bottom-control
//      marker, the shared clearance tokens, and the "no worker/cache access"
//      rule the PWA phases established.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const AppNav = require('./app-nav.js');
const NAV_SRC = read('app-nav.js');
const SHELL_CSS = read('app-shell.css');

// Pages that render the shared navigation.
const NAV_PAGES = [
  'app.html', 'profile.html', 'workout.html', 'workout-history.html',
  'nutrition.html', 'weight-history.html',
];
// Authenticated pages that deliberately suppress it, plus every page outside
// the authenticated app. None of them may load the navigation module.
const NO_NAV_PAGES = [
  'workout-complete.html', 'onboarding.html', 'auth.html', 'reset-password.html',
  'index.html', 'store.html', 'get-fit-guide.html', 'calculator.html',
  'program-fat-loss.html', 'program-muscle-gain.html', 'program-glute-builder.html',
];

/* ── 1 · Registry integrity ─────────────────────────────────────────────── */

test('registry: ids are unique and every available destination has a real href', () => {
  const seen = new Set();
  for (const d of AppNav.NAV_DESTINATIONS) {
    assert.ok(d.id && typeof d.id === 'string', 'destination has a string id');
    assert.ok(!seen.has(d.id), `duplicate destination id: ${d.id}`);
    seen.add(d.id);
    assert.ok(d.label && typeof d.label === 'string', `${d.id} has a label`);
    if (d.available) {
      assert.ok(d.href, `${d.id} is available so it must have an href`);
      assert.ok(exists(d.href), `${d.id} href ${d.href} exists in the repo`);
    }
  }
});

test('registry: the permanent IA is Home / Train / Nutrition / Progress / Coach', () => {
  assert.deepStrictEqual(
    AppNav.NAV_DESTINATIONS.map((d) => d.id),
    ['home', 'train', 'nutrition', 'progress', 'coach']
  );
});

test('registry: existing URLs are preserved verbatim — no renames or redirects', () => {
  assert.strictEqual(AppNav.getDestination('home').href, 'app.html');
  assert.strictEqual(AppNav.getDestination('train').href, 'workout.html');
  assert.strictEqual(AppNav.getDestination('nutrition').href, 'nutrition.html');
  assert.strictEqual(AppNav.getDestination('progress').href, 'weight-history.html');
});

/* ── 2 · Route → destination resolution ─────────────────────────────────── */

test('resolution: each canonical route maps to its destination', () => {
  assert.strictEqual(AppNav.resolveDestinationId('/app.html'), 'home');
  assert.strictEqual(AppNav.resolveDestinationId('/workout.html'), 'train');
  assert.strictEqual(AppNav.resolveDestinationId('/nutrition.html'), 'nutrition');
  assert.strictEqual(AppNav.resolveDestinationId('/weight-history.html'), 'progress');
});

test('resolution: child routes map to their parent destination', () => {
  assert.strictEqual(AppNav.resolveDestinationId('/workout-history.html'), 'train');
  // Resolves to Train for identity even though it suppresses the nav.
  assert.strictEqual(AppNav.resolveDestinationId('/workout-complete.html'), 'train');
  // Profile is a child of Home — a secondary destination, never a sixth tab.
  assert.strictEqual(AppNav.resolveDestinationId('/profile.html'), 'home');
});

test('resolution: profile.html adds no primary destination', () => {
  assert.strictEqual(AppNav.navigableDestinations().length, 4, 'still four tabs');
  const html = AppNav.navMarkup({ pathname: '/profile.html' });
  assert.ok(!/profile\.html/.test(html), 'profile is not a nav item');
  const current = html.match(/aria-current="page"/g) || [];
  assert.strictEqual(current.length, 1, 'Home is marked current on profile.html');
  assert.match(html, /data-mm-nav-id="home"[^>]*aria-current="page"/);
});

test('resolution: query strings, fragments and casing do not defeat matching', () => {
  assert.strictEqual(AppNav.resolveDestinationId('/workout.html?program=x&session=y'), 'train');
  assert.strictEqual(AppNav.resolveDestinationId('/workout-complete.html?workout_id=42'), 'train');
  assert.strictEqual(AppNav.resolveDestinationId('/App.html#top'), 'home');
});

test('resolution: routes outside the authenticated app resolve to null, never throw', () => {
  for (const p of ['/', '/index.html', '/auth.html', '/store.html', '/calculator.html',
    '/onboarding.html', '/program-fat-loss.html', '/nope.html', '', null, undefined, 42, {}]) {
    assert.strictEqual(AppNav.resolveDestinationId(p), null, `${String(p)} → null`);
  }
});

test('resolution: normalizeRoute reduces a location to a bare page name', () => {
  assert.strictEqual(AppNav.normalizeRoute('/a/b/nutrition.html?x#y'), 'nutrition.html');
  assert.strictEqual(AppNav.normalizeRoute('/'), '');
  assert.strictEqual(AppNav.normalizeRoute('/dir/'), '');
});

/* ── 3 · Coach is reserved but never rendered ───────────────────────────── */

test('coach: declared in the registry as unavailable with no href', () => {
  const coach = AppNav.getDestination('coach');
  assert.ok(coach, 'coach is present in the registry');
  assert.strictEqual(coach.available, false, 'coach is not available yet');
  assert.strictEqual(coach.href, null, 'coach has no route yet');
  assert.deepStrictEqual(coach.routes, [], 'coach owns no routes yet');
});

test('coach: is not rendered at all — no dead/disabled tab', () => {
  const ids = AppNav.navigableDestinations().map((d) => d.id);
  assert.deepStrictEqual(ids, ['home', 'train', 'nutrition', 'progress']);
  const html = AppNav.navMarkup({ pathname: '/app.html' });
  assert.ok(!/Coach/i.test(html), 'markup mentions no Coach');
  assert.ok(!/data-mm-nav-id="coach"/.test(html), 'no coach nav item is emitted');
  assert.ok(!/disabled|aria-disabled|Coming Soon/i.test(html), 'no disabled/placeholder item');
});

/* ── 4 · Suppression rules ──────────────────────────────────────────────── */

test('suppression: participating pages show the nav', () => {
  for (const p of ['/app.html', '/nutrition.html', '/weight-history.html', '/workout-history.html']) {
    assert.strictEqual(AppNav.shouldShowNav({ pathname: p }), true, `${p} shows nav`);
  }
});

test('suppression: workout.html is view-conditional — start/builder show, active hides', () => {
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html', view: 'start' }), true);
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html', view: 'builder' }), true);
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html', view: 'active' }), false);
  // Initial load has no view yet and must default to the browse surface.
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html' }), true);
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html', view: null }), true);
});

test('suppression: terminal and gated flows never show the nav, in any view', () => {
  for (const view of [undefined, null, 'start', 'active', 'anything']) {
    assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout-complete.html', view }), false);
    assert.strictEqual(AppNav.shouldShowNav({ pathname: '/onboarding.html', view }), false);
  }
});

test('suppression: unknown / non-app routes never show the nav and never throw', () => {
  for (const p of ['/', '/index.html', '/auth.html', '/store.html', '/calculator.html',
    '/nope.html', '', null, undefined]) {
    assert.strictEqual(AppNav.shouldShowNav({ pathname: p }), false, `${String(p)} hides nav`);
  }
  assert.strictEqual(AppNav.shouldShowNav(), false, 'no args → no nav, no throw');
  assert.strictEqual(AppNav.shouldShowNav({}), false, 'empty opts → no nav, no throw');
});

/* ── 5 · Markup: semantics, active state, bottom-control marker ─────────── */

test('markup: semantic nav landmark with an accessible name', () => {
  const html = AppNav.navMarkup({ pathname: '/app.html' });
  assert.match(html, /^<nav\b/, 'renders a <nav> landmark');
  assert.match(html, /aria-label="Primary"/, 'nav has an accessible name');
  assert.match(html, /id="mmNav"/, 'nav carries the stable id');
});

test('markup: exactly one aria-current="page", on the active destination', () => {
  const cases = [
    ['/app.html', 'home'],
    ['/workout.html', 'train'],
    ['/workout-history.html', 'train'],
    ['/nutrition.html', 'nutrition'],
    ['/weight-history.html', 'progress'],
  ];
  for (const [pathname, expected] of cases) {
    const html = AppNav.navMarkup({ pathname });
    const current = html.match(/aria-current="page"/g) || [];
    assert.strictEqual(current.length, 1, `${pathname}: exactly one aria-current`);
    const active = html.match(/data-mm-nav-id="([a-z]+)"[^>]*aria-current="page"/);
    assert.ok(active, `${pathname}: aria-current sits on a nav item`);
    assert.strictEqual(active[1], expected, `${pathname} → ${expected} active`);
    // Active state is never conveyed by colour alone: a class hook drives a
    // shape indicator in app-shell.css alongside the ARIA state.
    assert.match(html, new RegExp(`class="mm-nav-item is-active"[^>]*data-mm-nav-id="${expected}"`),
      `${pathname}: active item carries the is-active shape hook`);
  }
});

test('markup: every item has a visible text label — never icon-only', () => {
  const html = AppNav.navMarkup({ pathname: '/app.html' });
  for (const label of ['Home', 'Train', 'Nutrition', 'Progress']) {
    assert.ok(html.includes(`<span class="mm-nav-label">${label}</span>`), `${label} is labelled`);
  }
  // Icons are decorative and must not be announced.
  const glyphs = html.match(/<svg class="mm-nav-glyph"/g) || [];
  assert.strictEqual(glyphs.length, 4, 'one glyph per item');
  const hidden = html.match(/aria-hidden="true"/g) || [];
  assert.strictEqual(hidden.length, 4, 'every glyph is aria-hidden');
  assert.ok(!/<i data-lucide/.test(html), 'no icon-library dependency in nav markup');
});

test('markup: carries the data-mm-sw-bottom-control marker for the PWA surfaces', () => {
  const html = AppNav.navMarkup({ pathname: '/app.html' });
  assert.match(html, /<nav[^>]*\bdata-mm-sw-bottom-control\b/,
    'the nav element itself is the measured bottom control');
  // The two completed systems that consume it are unchanged and still query it.
  assert.match(read('sw-register.js'), /\[data-mm-sw-bottom-control\]/,
    'sw-register.js still selects the marker');
  assert.match(read('pwa-install-register.js'), /\[data-mm-sw-bottom-control\]/,
    'pwa-install-register.js still selects the marker');
});

test('markup: suppressed states render nothing at all', () => {
  assert.strictEqual(AppNav.navMarkup({ pathname: '/workout.html', view: 'active' }), '');
  assert.strictEqual(AppNav.navMarkup({ pathname: '/workout-complete.html' }), '');
  assert.strictEqual(AppNav.navMarkup({ pathname: '/onboarding.html' }), '');
  assert.strictEqual(AppNav.navMarkup({ pathname: '/index.html' }), '');
  assert.strictEqual(AppNav.navMarkup(), '');
});

/* ── 6 · The module touches no worker, cache, network or storage ────────── */

test('app-nav.js performs no service-worker, cache, network or storage access', () => {
  assert.ok(!/serviceWorker\s*\.\s*register/.test(NAV_SRC), 'no worker registration');
  assert.ok(!/navigator\s*\.\s*serviceWorker/.test(NAV_SRC), 'no worker access');
  assert.ok(!/\bcaches\s*\.\s*(open|match|keys|delete)\b/.test(NAV_SRC), 'no Cache Storage access');
  assert.ok(!/\bfetch\s*\(/.test(NAV_SRC), 'no network access');
  assert.ok(!/\b(localStorage|sessionStorage|indexedDB)\b/.test(NAV_SRC), 'no storage access');
  assert.ok(!/supabase/i.test(NAV_SRC), 'no data-layer coupling');
});

/* ── 7 · Page participation ─────────────────────────────────────────────── */

test('participation: exactly the intended pages load the shared shell', () => {
  const script = /<script[^>]+src="app-nav\.js"[^>]*\bdefer\b[^>]*><\/script>/;
  const sheet = /<link[^>]+rel="stylesheet"[^>]+href="app-shell\.css"[^>]*>/;
  for (const p of NAV_PAGES) {
    const html = read(p);
    assert.match(html, script, `${p} loads app-nav.js deferred`);
    assert.match(html, sheet, `${p} loads app-shell.css`);
    assert.ok(html.includes('id="appNavMount"'), `${p} provides the nav mount point`);
  }
  for (const p of NO_NAV_PAGES) {
    const html = read(p);
    assert.ok(!/app-nav\.js/.test(html), `${p} does NOT load app-nav.js`);
    assert.ok(!/app-shell\.css/.test(html), `${p} does NOT load app-shell.css`);
    assert.ok(!html.includes('appNavMount'), `${p} has no nav mount point`);
  }
});

test('participation: app-shell.css is linked before safe-area.css stays last', () => {
  for (const p of NAV_PAGES) {
    const html = read(p);
    assert.ok(html.indexOf('app-shell.css') < html.indexOf('safe-area.css'),
      `${p}: safe-area.css remains the final stylesheet`);
  }
});

test('participation: workout.html syncs its view state to the nav', () => {
  const html = read('workout.html');
  assert.match(html, /function showActiveView\(\)[\s\S]{0,400}?AppNav\.setView\('active'\)/,
    'showActiveView suppresses the nav');
  assert.match(html, /function showStartView\(\)[\s\S]{0,400}?AppNav\.setView\('start'\)/,
    'showStartView restores the nav');
  assert.match(html, /function showBuilderView\(\)[\s\S]{0,400}?AppNav\.setView\('builder'\)/,
    'showBuilderView keeps the nav');
  // Guarded so the page still works if the module fails to load.
  const calls = html.match(/typeof AppNav !== 'undefined'\) AppNav\.setView/g) || [];
  assert.strictEqual(calls.length, 3, 'every setView call is guarded');
});

test('participation: calculator.html is untouched (CLAUDE.md §3)', () => {
  const html = read('calculator.html');
  assert.ok(!/app-nav|app-shell|appNavMount|mm-skip-link/.test(html));
});

/* ── 8 · Shell structure on participating pages ─────────────────────────── */

test('shell: each nav page has one <main>, one <h1>, and a skip link', () => {
  for (const p of NAV_PAGES) {
    const html = read(p);
    const mains = html.match(/<main\b/g) || [];
    assert.strictEqual(mains.length, 1, `${p}: exactly one <main> landmark`);
    assert.match(html, /<main[^>]+id="mmMain"/, `${p}: main is the skip target`);
    const h1s = html.match(/<h1\b/g) || [];
    assert.strictEqual(h1s.length, 1, `${p}: exactly one <h1>`);
    assert.match(html, /<a class="mm-skip-link" href="#mmMain">Skip to content<\/a>/,
      `${p}: has a skip link`);
    // The skip link must precede the header so it is the first tab stop.
    assert.ok(html.indexOf('mm-skip-link') < html.indexOf('<header>'),
      `${p}: skip link comes before the header`);
  }
});

/* ── 8b · The shared header is defined once ─────────────────────────────── */

test('header: app-shell.css owns the header, logo and back-link rules', () => {
  assert.match(SHELL_CSS, /\nheader\s*\{[^}]*position:\s*sticky[^}]*height:\s*60px/,
    'the sticky 60px header lives in the shell');
  assert.match(SHELL_CSS, /\.header-logo\s*\{[^}]*display:\s*flex/);
  assert.match(SHELL_CSS, /\.header-logo img\s*\{[^}]*height:\s*42px/);
  assert.match(SHELL_CSS, /\.header-logo span\s*\{[^}]*Bebas Neue/);
});

test('header: no participating page redefines the shared header rules', () => {
  for (const p of NAV_PAGES) {
    const css = (read(p).match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    assert.ok(!/(^|\n)\s*header\s*\{/.test(css), `${p}: no local header rule`);
    assert.ok(!/(^|\n)\s*\.header-logo\s*[{ ]/.test(css), `${p}: no local .header-logo rule`);
  }
});

test('header: the redundant back-link is hidden wherever the nav renders', () => {
  assert.match(SHELL_CSS, /:root\.mm-has-nav header \.btn-back\s*\{[^}]*display:\s*none/,
    'nav present → the second Home control is hidden');
  // Only workout.html keeps the markup: it is the one page that can suppress
  // the nav (#activeView) and would otherwise have no visible route out.
  assert.match(read('workout.html'), /<a class="btn-back" href="app\.html">/,
    'workout.html keeps its fallback back-link');
  for (const p of ['nutrition.html', 'weight-history.html', 'workout-history.html']) {
    assert.ok(!/class="btn-back"/.test(read(p)), `${p}: redundant back-link removed`);
  }
});

test('header: the shell back-link is scoped so app.html\'s modal Back button survives', () => {
  // app.html reuses the .btn-back class for the recalculate-goals modal.
  // The shell rule MUST stay scoped to `header` or that button is restyled.
  assert.ok(!/(^|\n)\.btn-back\s*\{/.test(SHELL_CSS),
    'the shell never defines an unscoped .btn-back');
  assert.match(SHELL_CSS, /header \.btn-back\s*\{[^}]*min-height:\s*44px/,
    'the header back-link meets the 44px tap target');
  // profile.html's modal Back button uses a distinct class precisely so it can
  // never collide with the shell's header control.
  const profCss = (read('profile.html').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  assert.match(profCss, /\.btn-back-modal\s*\{/, 'the modal Back button is namespaced');
  for (const p of NAV_PAGES) {
    const css = (read(p).match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    assert.ok(!/(^|\n)\s*\.btn-back\s*\{/.test(css), `${p}: no local .btn-back rule`);
  }
});

/* ── 9 · The one bottom-clearance strategy ──────────────────────────────── */

test('clearance: app-shell.css owns the tokens and toggles on .mm-has-nav', () => {
  assert.match(SHELL_CSS, /:root\s*\{[^}]*--mm-nav-base-height:\s*0px/,
    'no nav → zero height by default');
  assert.match(SHELL_CSS, /:root\.mm-has-nav\s*\{[^}]*--mm-nav-base-height:\s*64px/,
    'nav present → 64px');
  assert.match(SHELL_CSS,
    /--mm-bottom-clearance:\s*calc\(var\(--mm-nav-base-height\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/,
    'clearance = nav height + home indicator');
  // The inset must be composed exactly once in the token itself.
  const insets = SHELL_CSS.match(/--mm-bottom-clearance:[^;]*env\(safe-area-inset-bottom/g) || [];
  assert.strictEqual(insets.length, 1, 'safe-area inset appears once in the token');
  assert.strictEqual(AppNav.HAS_NAV_CLASS, 'mm-has-nav', 'JS and CSS agree on the class');
});

test('clearance: no participating page keeps a hard-coded bottom magic number', () => {
  for (const p of NAV_PAGES) {
    const css = (read(p).match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const containerRules = css.match(/\.container\s*\{[^}]*\}/g) || [];
    assert.ok(containerRules.length > 0, `${p}: has .container rules`);
    for (const r of containerRules) {
      assert.match(r, /var\(--mm-bottom-clearance/,
        `${p}: .container derives its bottom padding from the shared token — got ${r}`);
      assert.ok(!/padding:[^;]*\b(80|120|132)px\s*;/.test(r),
        `${p}: no leftover bottom magic number — got ${r}`);
    }
    // Toasts must clear the nav band too.
    const toast = (css.match(/\.toast\s*\{[^}]*\}/) || [])[0] || '';
    assert.match(toast, /bottom:\s*calc\(24px \+ var\(--mm-nav-base-height, 0px\)\)/,
      `${p}: toast rides above the nav`);
  }
});

test('clearance: the nav occupies exactly the clearance band', () => {
  assert.match(SHELL_CSS, /\.mm-nav\s*\{[^}]*height:\s*var\(--mm-bottom-clearance\)/,
    'nav height IS the clearance band');
  assert.match(SHELL_CSS, /\.mm-nav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/,
    'nav content is inset above the home indicator');
  assert.match(SHELL_CSS, /\.mm-nav\s*\{[^}]*position:\s*fixed/);
  assert.match(SHELL_CSS, /\.mm-nav\s*\{[^}]*bottom:\s*0/);
});

test('clearance: nav z-index sits above the sticky header and below modals', () => {
  const z = SHELL_CSS.match(/\.mm-nav\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(z, 'nav declares a z-index');
  const zi = Number(z[1]);
  assert.ok(zi > 100, `nav (${zi}) is above the sticky page header (100)`);
  assert.ok(zi < 190, `nav (${zi}) is below every modal/sheet overlay (190+)`);
});

test('clearance: workout.html keeps its rest-strip room on #activeView only', () => {
  const css = (read('workout.html').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  assert.match(css, /#activeView\s*\{[^}]*padding-bottom:\s*96px/,
    'the rest-strip allowance belongs to the view that owns the rest strip');
  // The nav is suppressed in that view, so the two never claim the band together.
  assert.strictEqual(AppNav.shouldShowNav({ pathname: '/workout.html', view: 'active' }), false);
});

/* ── 10 · Shell accessibility primitives ────────────────────────────────── */

test('a11y: shell defines a real focus-visible ring and honours reduced motion', () => {
  assert.match(SHELL_CSS, /\.mm-nav-item:focus-visible[\s\S]{0,160}outline:\s*2px solid/,
    'nav items get a 2px focus ring');
  assert.match(SHELL_CSS, /\.mm-skip-link:focus\s*\{[^}]*top:\s*8px/, 'skip link reveals on focus');
  const rm = SHELL_CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm, 'a reduced-motion block exists');
  assert.match(rm[1], /transition:\s*none/, 'shell animation is disabled under reduced motion');
});

test('a11y: nav tap targets clear 44px and are never shrunk on narrow phones', () => {
  // 64px bar, 4 items across → ≥80px wide at 320px, ≥44px tall.
  assert.match(SHELL_CSS, /:root\.mm-has-nav\s*\{[^}]*--mm-nav-base-height:\s*64px/);
  const narrow = SHELL_CSS.match(/@media \(max-width: 360px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(narrow, 'a 360px tier exists');
  assert.ok(!/--mm-nav-base-height/.test(narrow[1]),
    'the nav is never made shorter on narrow phones');
  assert.ok(!/display:\s*none/.test(narrow[1]), 'no label is dropped on narrow phones');
});
