// theme-tokens.test.js — Phase 4.3.4 V1 design-token contract.
//
// The point of the three tiers is that a user can pick their own accent later
// WITHOUT refactoring components, without diluting the Muscle Motivation
// identity, and without destroying the meaning of success/warning/danger.
// These tests pin each of those properties so a future theme picker is a
// one-line change rather than an audit of every stylesheet.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHELL = read('app-shell.css');

// CSS with comments removed — so a hex mentioned in prose never counts as usage.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const SHELL_CODE = stripComments(SHELL);

// Value of a custom property as declared in app-shell.css.
function token(name) {
  const m = SHELL_CODE.match(new RegExp('(?:^|[;{\\s])' + name + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}

/* ── 1 · The three tiers exist and are separate ─────────────────────────── */

test('tokens: brand tier carries the approved Muscle Motivation palette', () => {
  assert.strictEqual(token('--mm-brand-red'), '#B1121B', 'brand red');
  assert.strictEqual(token('--mm-bg'), '#121011', 'primary dark background');
  assert.strictEqual(token('--mm-surface'), '#231F20', 'secondary dark surface');
  assert.strictEqual(token('--mm-neutral-light'), '#F7F5F2', 'primary light neutral');
  assert.strictEqual(token('--mm-neutral-muted'), '#B8B3B4', 'muted neutral');
  assert.strictEqual(token('--mm-white'), '#FFFFFF', 'functional white');
});

test('tokens: the accent defaults to Muscle Motivation red', () => {
  assert.strictEqual(token('--mm-accent'), 'var(--mm-brand-red)',
    'accent points at brand red today — the default, not a hard-coded copy');
  assert.ok(token('--mm-accent-contrast'), 'an on-accent foreground is defined');
});

test('tokens: the accent is replaceable from one place', () => {
  // A future theme writes --mm-accent on :root. Nothing else may need editing,
  // so the derived accent values must be expressed IN TERMS of --mm-accent.
  const supports = (SHELL.match(/@supports \(color: color-mix[\s\S]*?\n\}/) || [''])[0];
  assert.match(supports, /--mm-accent-soft:\s*color-mix\(in srgb, var\(--mm-accent\)/,
    'soft accent derives from --mm-accent');
  assert.match(supports, /--mm-accent-border:\s*color-mix\(in srgb, var\(--mm-accent\)/,
    'accent border derives from --mm-accent');
});

test('tokens: semantic colours never alias the user accent', () => {
  for (const name of ['--mm-success', '--mm-warning', '--mm-danger']) {
    const v = token(name);
    assert.ok(v, `${name} is defined`);
    assert.ok(!/--mm-accent/.test(v),
      `${name} must not inherit the accent — meaning has to survive personalization`);
    assert.ok(!/--mm-brand-red/.test(v), `${name} must not alias brand red either`);
    assert.match(v, /^#[0-9A-Fa-f]{6}$/, `${name} is its own literal colour`);
  }
  // And they must be distinct from each other and from the default accent.
  const vals = ['--mm-success', '--mm-warning', '--mm-danger'].map(token);
  assert.strictEqual(new Set(vals).size, 3, 'success/warning/danger are distinct');
  assert.ok(!vals.includes('#B1121B'), 'no semantic colour is the brand red itself');
});

/* ── 2 · Components consume tokens, never raw brand hex ─────────────────── */

const MIGRATED = ['app-shell.css', 'app.html', 'profile.html'];

test('tokens: migrated surfaces reference no raw brand hex outside the token block', () => {
  for (const f of MIGRATED) {
    const code = stripComments(read(f));
    // Allow the single canonical declaration; forbid every other occurrence.
    const hits = (code.match(/#B1121B/gi) || []).length;
    const declared = (code.match(/--mm-brand-red\s*:\s*#B1121B/gi) || []).length;
    const pageFallback = (code.match(/--red:\s*#B1121B/gi) || []).length; // page :root fallback
    assert.strictEqual(hits - declared - pageFallback, 0,
      `${f}: components must consume var(--mm-accent), not #B1121B`);
  }
});

test('tokens: migrated surfaces no longer consume the legacy colour names', () => {
  for (const f of MIGRATED) {
    const code = stripComments(read(f));
    for (const legacy of ['var(--red)', 'var(--green)', 'var(--amber)']) {
      assert.ok(!code.includes(legacy),
        `${f}: ${legacy} should have moved to a --mm-* token`);
    }
  }
});

test('tokens: on-accent text uses the accent contrast token', () => {
  // A future light accent would make hard-coded white unreadable.
  for (const f of ['app.html', 'profile.html']) {
    const code = stripComments(read(f));
    assert.ok(!/color:\s*#fff\b/i.test(code), `${f}: no bare #fff on accent surfaces`);
    assert.ok(code.includes('var(--mm-accent-contrast)'), `${f}: uses the contrast token`);
  }
});

/* ── 3 · Legacy bridge keeps unmigrated pages correct ───────────────────── */

test('tokens: the legacy bridge repoints old names at the new palette', () => {
  const expected = {
    '--bg': 'var(--mm-bg)',
    '--surface-2': 'var(--mm-surface)',
    '--text': 'var(--mm-text)',
    '--text-2': 'var(--mm-text-secondary)',
    '--text-muted': 'var(--mm-text-tertiary)',
    '--red': 'var(--mm-accent)',
    '--green': 'var(--mm-success)',
    '--amber': 'var(--mm-warning)',
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.strictEqual(token(name), value, `${name} bridges to ${value}`);
  }
});

test('tokens: every shell page loads the token layer', () => {
  for (const p of ['app.html', 'profile.html', 'workout.html', 'workout-history.html',
    'nutrition.html', 'weight-history.html']) {
    assert.match(read(p), /<link[^>]+href="app-shell\.css"/, `${p} loads the tokens`);
  }
});

/* ── 4 · Accessibility floor of the palette itself ──────────────────────── */

// Follow var(--x) indirection until a literal colour is reached.
function resolve(name, depth = 0) {
  let v = token(name);
  while (v && /^var\(\s*(--[\w-]+)\s*\)$/.test(v) && depth++ < 5) {
    v = token(v.match(/^var\(\s*(--[\w-]+)\s*\)$/)[1]);
  }
  return v;
}

function luminance(hex) {
  const c = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('tokens: all three text tiers clear WCAG AA on the brand background', () => {
  const bg = token('--mm-bg');
  const tiers = {
    primary: token('--mm-neutral-light'),
    secondary: token('--mm-neutral-muted'),
    tertiary: token('--mm-text-tertiary'),
  };
  for (const [name, colour] of Object.entries(tiers)) {
    const ratio = contrast(colour, bg);
    assert.ok(ratio >= 4.5,
      `${name} text ${colour} on ${bg} is ${ratio.toFixed(2)}:1 — below the 4.5:1 AA floor`);
  }
  // Hierarchy must still be legible AS a hierarchy.
  assert.ok(contrast(tiers.primary, bg) > contrast(tiers.secondary, bg));
  assert.ok(contrast(tiers.secondary, bg) > contrast(tiers.tertiary, bg));
});

test('tokens: accent contrast pairing is readable', () => {
  const onAccent = resolve('--mm-accent-contrast');
  assert.match(onAccent, /^#[0-9A-Fa-f]{6}$/, 'the on-accent colour resolves to a literal');
  const ratio = contrast(resolve('--mm-accent'), onAccent);
  assert.ok(ratio >= 4.5,
    `${onAccent} on brand red is ${ratio.toFixed(2)}:1 — CTAs must clear AA`);
});

/* ── 5 · Protected regressions from earlier checkpoints ─────────────────── */

test('tokens: V1 did not regress the iOS 16px form-control floor', () => {
  assert.match(SHELL, /@media \(max-width: 480px\), \(pointer: coarse\)/,
    'the touch/phone guard survives');
  assert.match(SHELL, /font-size:\s*16px\s*!important/, 'the 16px floor survives');
  for (const p of ['app.html', 'nutrition.html', 'workout.html']) {
    const meta = (read(p).match(/<meta[^>]+name="viewport"[^>]*>/) || [''])[0];
    assert.ok(!/maximum-scale|user-scalable\s*=\s*no/.test(meta),
      `${p}: pinch-zoom still enabled`);
  }
});

test('tokens: V1 did not regress the shell contracts', () => {
  assert.match(SHELL, /\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'hidden guard');
  assert.match(SHELL, /--mm-bottom-clearance:\s*calc\(var\(--mm-nav-base-height\)/, 'clearance token');
  assert.match(SHELL, /:root\.mm-has-nav\s*\{[^}]*--mm-nav-base-height:\s*64px/, 'nav height');
  // The nav's accent states now come from the theme layer, not a fixed red.
  assert.match(SHELL, /\.mm-nav-item\.is-active \.mm-nav-glyph\s*\{\s*color:\s*var\(--mm-accent\)/,
    'active nav consumes the accent token');
});
