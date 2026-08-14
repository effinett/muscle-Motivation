// shell-primitives.test.js — Phase 4.3.4 V2 contract for the shared UI primitives.
//
// These test the CONTRACT, not appearance: which tokens each primitive consumes,
// which states exist, that no primitive hard-codes a colour, that state is never
// signalled by colour alone, and that interactive parts stay tappable. Nothing
// here snapshots markup or pins pixel values.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHELL = read('app-shell.css');
const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, ''); // comments are not usage

// All flat rule bodies whose selector mentions `sel`.
function rulesFor(sel) {
  const out = [];
  const re = new RegExp('(^|[},])\\s*([^{}]*' + sel.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '[^{}]*)\\{([^{}]*)\\}', 'g');
  let m;
  while ((m = re.exec(CODE)) !== null) out.push({ selector: m[2].trim(), body: m[3] });
  return out;
}
const bodiesFor = (sel) => rulesFor(sel).map((r) => r.body).join('\n');

const PRIMITIVES = ['.mm-section', '.mm-meter', '.mm-daystrip', '.mm-insight', '.mm-hero'];

/* ── Existence + token discipline ───────────────────────────────────────── */

test('primitives: all five requested primitives are defined', () => {
  for (const p of PRIMITIVES) {
    assert.ok(rulesFor(p).length > 0, `${p} is defined in the shell`);
  }
});

test('primitives: no ring was added without a consumer', () => {
  // Deliberately omitted — the nutrition ring was ruled out, so a .mm-ring
  // would be an abstraction with zero consumers (CLAUDE.md §5).
  assert.ok(!/\.mm-ring\b/.test(CODE), 'no speculative .mm-ring primitive');
});

test('primitives: none hard-codes a colour value', () => {
  for (const p of PRIMITIVES) {
    const body = bodiesFor(p);
    assert.ok(!/#[0-9A-Fa-f]{3,8}\b/.test(body), `${p} must not contain a raw hex colour`);
    assert.ok(!/\brgba?\(/.test(body), `${p} must not contain a raw rgb()/rgba() colour`);
  }
});

test('primitives: every colour they use comes from the token layer', () => {
  const allowed = /^--mm-(accent|accent-contrast|accent-soft|accent-border|success|warning|danger|text|text-secondary|text-tertiary|surface|surface-raised|surface-high|line|line-subtle|line-strong|bg|white|neutral-light|neutral-muted|brand-red|meter-pct|meter-height|nav-base-height|bottom-clearance)$/;
  for (const p of PRIMITIVES) {
    const body = bodiesFor(p);
    for (const m of body.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.match(m[1], allowed, `${p} references unknown token ${m[1]}`);
    }
  }
});

/* ── .mm-meter ──────────────────────────────────────────────────────────── */

test('meter: progress is driven by one custom property, not inline width', () => {
  const base = rulesFor('.mm-meter').find((r) => r.selector === '.mm-meter');
  assert.ok(base, '.mm-meter base rule exists');
  assert.match(base.body, /--mm-meter-pct:\s*0%/, 'defaults to empty');
  const fill = rulesFor('.mm-meter-fill').find((r) => r.selector === '.mm-meter-fill');
  assert.match(fill.body, /width:\s*var\(--mm-meter-pct\)/, 'fill width reads the property');
  assert.match(fill.body, /max-width:\s*100%/, 'never overflows its track past full');
});

test('meter: default fill is the accent; semantic states are separate modifiers', () => {
  const fill = rulesFor('.mm-meter-fill').find((r) => r.selector === '.mm-meter-fill');
  assert.match(fill.body, /background:\s*var\(--mm-accent\)/,
    'plain progress is accent-coloured, not success/warning');
  for (const [mod, token] of [['success', '--mm-success'], ['warning', '--mm-warning'], ['danger', '--mm-danger']]) {
    const r = rulesFor(`.mm-meter--${mod}`);
    assert.ok(r.length, `.mm-meter--${mod} exists`);
    assert.ok(r.some((x) => x.body.includes(`var(${token})`)), `${mod} uses ${token}`);
  }
});

test('meter: missing data renders a track, never a misleading fill', () => {
  assert.match(CODE, /\.mm-meter\[data-empty="true"\][^{]*\{[^}]*display:\s*none/,
    'an empty meter hides its fill');
});

/* ── .mm-daystrip ───────────────────────────────────────────────────────── */

test('daystrip: exactly seven columns for a calendar week', () => {
  const strip = rulesFor('.mm-daystrip').find((r) => r.selector === '.mm-daystrip');
  assert.match(strip.body, /grid-template-columns:\s*repeat\(7,/, 'seven day cells');
});

test('daystrip: state is never conveyed by colour alone', () => {
  // Completed draws a check (a shape), today draws a ring (a border change).
  assert.match(CODE, /\.mm-day\.is-done \.mm-day-dot::after[^{]*\{([^}]*)\}/,
    'completed days draw a check glyph');
  const check = CODE.match(/\.mm-day\.is-done \.mm-day-dot::after[^{]*\{([^}]*)\}/)[1];
  assert.match(check, /border-width:\s*0 2px 2px 0/, 'the check is drawn, not coloured in');
  assert.match(check, /transform:\s*rotate\(45deg\)/);
  // Today, on its own, is a single accent OUTLINE at the normal dot size.
  const today = CODE.match(/\.mm-day\.is-today \.mm-day-dot[^{]*\{([^}]*)\}/)[1];
  assert.match(today, /border-color:\s*var\(--mm-accent\)/, 'today is an accent outline');
  assert.ok(!/box-shadow/.test(today), 'no outer ring on its own — that reads as two circles');
  // Only when today is ALSO completed does a detached outer ring appear: the
  // dot is then filled with the accent, so a border could not carry "today",
  // and the ring drawn outside it can.
  const combined = CODE.match(/\.mm-day\.is-today\.is-done \.mm-day-dot[^{]*\{([^}]*)\}/)[1];
  assert.match(combined, /box-shadow:\s*0 0 0 [\d.]+px var\(--mm-bg\), 0 0 0 [\d.]+px var\(--mm-accent\)/,
    'the combined state adds a ring outside the filled dot');
});

test('daystrip: has no "scheduled" state — we never imply a weekday plan', () => {
  // profiles.training_days is a weekly COUNT; there is no per-weekday schedule,
  // so a "scheduled" state would be fabricated data.
  assert.ok(!/\.mm-day\.is-scheduled|\.mm-day\.is-planned/.test(CODE),
    'no scheduled/planned day state exists');
  for (const state of ['is-done', 'is-today', 'is-future']) {
    assert.ok(CODE.includes(`.mm-day.${state}`), `${state} is a supported state`);
  }
});

/* ── .mm-insight ────────────────────────────────────────────────────────── */

test('insight: defaults to the accent, not a warning treatment', () => {
  const base = rulesFor('.mm-insight').find((r) => r.selector === '.mm-insight');
  assert.match(base.body, /border-left:\s*2px solid var\(--mm-accent\)/,
    'a routine coaching nudge must not look like an error');
  assert.ok(!/var\(--mm-warning\)|var\(--mm-danger\)/.test(base.body),
    'semantic colours are opt-in modifiers only');
});

test('insight: semantic modifiers exist for genuinely semantic insights', () => {
  for (const [mod, token] of [['warning', '--mm-warning'], ['danger', '--mm-danger'], ['success', '--mm-success']]) {
    assert.ok(rulesFor(`.mm-insight--${mod}`).some((r) => r.body.includes(`var(${token})`)),
      `.mm-insight--${mod} uses ${token}`);
  }
});

test('insight: the optional action is a real tap target', () => {
  const action = rulesFor('.mm-insight-action').find((r) => r.selector === '.mm-insight-action');
  assert.match(action.body, /min-height:\s*44px/, 'action clears 44px');
  assert.match(action.body, /color:\s*var\(--mm-accent\)/);
  assert.ok(rulesFor('.mm-insight-action:focus-visible').length, 'action has a focus ring');
});

/* ── .mm-hero ───────────────────────────────────────────────────────────── */

test('hero: works with no image and reserves the same composition', () => {
  const before = CODE.match(/\.mm-hero::before[^{]*\{([^}]*)\}/);
  assert.ok(before, 'a no-image fallback layer exists');
  assert.match(before[1], /var\(--mm-accent-soft\)/, 'fallback uses the accent wash');
  // Layout must not depend on the media element existing.
  assert.match(CODE, /\.mm-hero:not\(:has\(\.mm-hero-media\)\) \.mm-hero-body[^{]*\{[^}]*max-width:\s*100%/,
    'copy reclaims the full width when there is no image');
});

test('hero: copy never sits on the photograph', () => {
  const mask = CODE.match(/\.mm-hero-media::after[^{]*\{([^}]*)\}/);
  assert.ok(mask, 'a gradient mask exists over the media');
  assert.match(mask[1], /linear-gradient\(90deg/, 'masks left-to-right toward the copy');
  assert.match(mask[1], /var\(--mm-surface-raised\)/, 'resolves to solid surface behind the text');
  const body = rulesFor('.mm-hero-body').find((r) => r.selector === '.mm-hero-body');
  assert.match(body.body, /max-width:\s*74%/, 'copy is constrained away from the image');
});

test('hero: the image is decorative and cannot shift layout', () => {
  const media = rulesFor('.mm-hero-media').find((r) => r.selector === '.mm-hero-media');
  assert.match(media.body, /position:\s*absolute/, 'media is out of flow — no layout shift');
  assert.match(media.body, /pointer-events:\s*none/, 'never interactive');
  const img = rulesFor('.mm-hero-media img').find((r) => r.selector === '.mm-hero-media img');
  assert.match(img.body, /object-fit:\s*cover/);
  assert.match(img.body, /grayscale\(1\)/, 'monochrome treatment per the approved direction');
});

test('hero: no photography was introduced in this phase', () => {
  assert.ok(!/url\(['"]?(?!data:)[^)]*\.(jpe?g|png|webp|avif)/i.test(CODE),
    'the shell references no image asset yet');
});

test('hero: CTA is a tappable, theme-aware primary action', () => {
  const cta = rulesFor('.mm-hero-cta').find((r) => r.selector === '.mm-hero-cta');
  assert.match(cta.body, /min-height:\s*48px/, 'comfortably past 44px');
  assert.match(cta.body, /background:\s*var\(--mm-accent\)/);
  assert.match(cta.body, /color:\s*var\(--mm-accent-contrast\)/,
    'on-accent text follows the theme, so a light accent stays readable');
  assert.ok(rulesFor('.mm-hero-cta:focus-visible').length, 'CTA has a focus ring');
});

test('hero: long titles wrap instead of overflowing', () => {
  const title = rulesFor('.mm-hero-title').find((r) => r.selector === '.mm-hero-title');
  assert.match(title.body, /overflow-wrap:\s*anywhere/);
  assert.match(title.body, /clamp\(/, 'title scales with viewport');
});

/* ── Cross-cutting ──────────────────────────────────────────────────────── */

test('primitives: animated ones are covered by reduced motion', () => {
  const rm = [...SHELL.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => m[1]).join('\n');
  for (const sel of ['.mm-meter-fill', '.mm-hero-cta']) {
    assert.ok(rm.includes(sel), `${sel} transition is disabled under reduced motion`);
  }
});

test('primitives: V2 did not regress the protected shell contracts', () => {
  assert.match(SHELL, /\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'hidden guard');
  assert.match(SHELL, /@media \(max-width: 480px\), \(pointer: coarse\)/, 'iOS zoom guard');
  assert.match(SHELL, /font-size:\s*16px\s*!important/, '16px form-control floor');
  assert.match(SHELL, /--mm-bottom-clearance:\s*calc\(var\(--mm-nav-base-height\)/, 'clearance token');
  assert.match(SHELL, /:root\.mm-has-nav\s*\{[^}]*--mm-nav-base-height:\s*64px/, 'nav height');
});

/* ── Shared header (Phase 4.3.5A) ───────────────────────────────────────── */

test('header: the logo grew but still fits the header with clearance', () => {
  const header = rulesFor('header').find((r) => r.selector === 'header');
  assert.ok(header, 'the shared header rule exists');
  const headerH = Number((header.body.match(/height:\s*(\d+)px/) || [])[1]);
  const logoH = Number((bodiesFor('.header-logo img').match(/height:\s*(\d+)px/) || [])[1]);
  assert.ok(headerH > 0 && logoH > 0, 'both heights are declared in px');

  assert.ok(logoH > 42, 'the mark is larger than the pre-4.3.5 42px');
  // It must never crowd or grow the bar: the header height is the constraint,
  // and a logo that met or exceeded it would push the sticky header taller and
  // shift --mm-nav-base-height clearance calculations on every page.
  assert.ok(logoH <= headerH - 8,
    `logo (${logoH}px) keeps at least 4px optical clearance inside the ${headerH}px header`);
});

test('header: growing the logo did not change the header geometry', () => {
  const header = rulesFor('header').find((r) => r.selector === 'header').body;
  assert.match(header, /height:\s*60px/, 'header height is unchanged');
  assert.match(header, /position:\s*sticky/, 'still sticky');
  // safe-area.css keeps adding the notch inset on top via header:has(.header-logo).
  assert.match(read('safe-area.css'), /header:has\(\.header-logo\)/);
});

/* ── Home consumes the primitives (wired in V4) ─────────────────────────── */

test('primitives: Home actually consumes every one of them', () => {
  const home = read('app.html');
  for (const p of ['mm-section', 'mm-meter', 'mm-daystrip', 'mm-insight', 'mm-hero']) {
    assert.ok(home.includes(p), `app.html consumes ${p}`);
  }
  // They are used as the shared primitives, not re-implemented locally. A page
  // may still position them contextually (`.home-metric + .mm-meter`), but must
  // never redeclare the primitive itself.
  const css = (home.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)]
    .flatMap((m) => m[2].split(',').map((s) => s.trim()));
  for (const p of ['.mm-hero', '.mm-meter', '.mm-daystrip', '.mm-insight', '.mm-section']) {
    assert.ok(!selectors.includes(p),
      `app.html must not redefine ${p} — it belongs to the shell`);
  }
});
