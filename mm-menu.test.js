// mm-menu.test.js — Phase 4.3.5I contract for the responsive header menu.
//
// The reported defect: on the public pages the hamburger menu "behaves
// incorrectly at scroll depth" — opening it moved the page, and the drawer
// itself appeared somewhere near the top of the document instead of under the
// header, so the user had to scroll back up to find it.
//
// Root cause: the drawer was a `position: relative` block in normal document
// flow directly after a `position: sticky` header. Both symptoms follow from
// that one fact, and both tests below target it rather than its appearance.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MMMenu = require('./mm-menu.js');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JS = read('mm-menu.js');
const CSS = read('mm-menu.css');

const CONSUMERS = ['index.html', 'store.html'];

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · Placement — the root cause
 * ══════════════════════════════════════════════════════════════════════ */

test('the drawer leaves document flow, so opening it cannot move the page', () => {
  const rule = (CSS.match(/\.mm-menu-drawer\s*\{([^}]*)\}/) || [])[1];
  assert.ok(rule, '.mm-menu-drawer is defined');
  assert.match(rule, /position:\s*fixed/,
    'in flow, revealing the drawer inserted its height and pushed the page down');
  assert.match(rule, /top:\s*var\(--mm-menu-top/, 'anchored to the measured header edge');
});

test('no consumer still positions its drawer in the document', () => {
  for (const p of CONSUMERS) {
    const css = (read(p).match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const rule = (css.match(/\.mobile-nav\s*\{([^}]*)\}/) || [])[1] || '';
    assert.ok(rule, `${p} still styles .mobile-nav`);
    assert.ok(!/position:\s*(relative|static|absolute)/.test(rule),
      `${p}: .mobile-nav must not re-declare a document position`);
    assert.ok(!/z-index/.test(rule),
      `${p}: layering belongs to .mm-menu-drawer, which derives it from the header`);
  }
});

test('placement is measured from the header\'s LIVE viewport rect', () => {
  // This is what makes it correct at any scroll depth, and what makes it work
  // on two pages whose headers are different heights (80px and 68px) and
  // change again at their breakpoints.
  assert.strictEqual(MMMenu.drawerTop({ bottom: 68 }), 68);
  assert.strictEqual(MMMenu.drawerTop({ bottom: 80 }), 80);
  assert.match(JS, /header\.getBoundingClientRect\(\)/);
  assert.match(JS, /position\(\);\s*\/\/ measure at OPEN time, never cached/);
});

test('placement degrades safely rather than putting the drawer off-screen', () => {
  assert.strictEqual(MMMenu.drawerTop({ bottom: -120 }), 0, 'never above the viewport');
  assert.strictEqual(MMMenu.drawerTop(null), 0);
  assert.strictEqual(MMMenu.drawerTop({ bottom: NaN }), 0);
  assert.strictEqual(MMMenu.drawerTop({}), 0);
});

test('the drawer is stacked above whichever header it hangs from', () => {
  // A literal would be wrong on one of the two consumers: their headers sit at
  // z-index 1000 and 200 respectively.
  assert.strictEqual(MMMenu.drawerZIndex('1000'), 1001, 'index.html header');
  assert.strictEqual(MMMenu.drawerZIndex('200'), 201, 'store.html header');
  assert.strictEqual(MMMenu.drawerZIndex('auto'), 101, 'a sane default');
  assert.match(CSS, /z-index:\s*var\(--mm-menu-z/);
});

test('a long menu scrolls itself and contains that scroll', () => {
  const rule = (CSS.match(/\.mm-menu-drawer\s*\{([^}]*)\}/) || [])[1];
  assert.match(rule, /max-height:\s*calc\(100vh - var\(--mm-menu-top/);
  assert.match(rule, /overscroll-behavior:\s*contain/);
  // 100vh on mobile is the height with the URL bar hidden, so it can exceed
  // what is visible; dvh is preferred where supported.
  assert.match(CSS, /@supports \(height: 100dvh\)[\s\S]*?max-height:\s*calc\(100dvh/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Accessibility
 * ══════════════════════════════════════════════════════════════════════ */

test('the toggle announces what it controls and whether it is open', () => {
  assert.match(JS, /toggle\.setAttribute\('aria-controls', drawer\.id\)/);
  assert.match(JS, /toggle\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(JS, /toggle\.setAttribute\('aria-expanded', 'true'\)/);
  // And the accessible name reflects the action available now.
  assert.match(JS, /setAttribute\('aria-label', 'Close menu'\)/);
  assert.match(JS, /setAttribute\('aria-label', 'Open menu'\)/);
});

test('focus moves into the menu on open and back to the toggle on close', () => {
  // Without the return, closing dropped the user at the top of the document and
  // they had to tab through the whole header again.
  assert.match(JS, /var first = focusables\(drawer\)\[0\];/);
  assert.match(JS, /first\.focus\(\{ preventScroll: true \}\)/);
  assert.match(JS, /function close\(returnFocus\)/);
  assert.match(JS, /if \(returnFocus\) \{\s*\n\s*try \{ toggle\.focus\(\{ preventScroll: true \}\)/);
  // Escape and the toggle itself return focus; an outside tap does not, because
  // the user has already moved their attention somewhere else.
  assert.match(JS, /if \(ev\.key === 'Escape'\) \{ ev\.preventDefault\(\); close\(true\); \}/);
  assert.match(JS, /function onPointerDown\(ev\)[\s\S]*?close\(false\);/);
});

test('focus is visible inside the drawer', () => {
  assert.match(CSS, /\.mm-menu-drawer a:focus-visible[\s\S]{0,120}outline:/);
});

test('every dismissal path is bound on open and released on close', () => {
  const bind = (JS.match(/function bind\(\)[\s\S]*?\n    \}/) || [''])[0];
  const unbind = (JS.match(/function unbind\(\)[\s\S]*?\n    \}/) || [''])[0];
  for (const ev of ['keydown', 'pointerdown', 'scroll', 'resize']) {
    assert.ok(bind.includes("'" + ev + "'"), `${ev} is bound while open`);
    assert.ok(unbind.includes("'" + ev + "'"), `${ev} is released on close`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Consumers
 * ══════════════════════════════════════════════════════════════════════ */

test('both public pages use the shared controller and none keeps its own', () => {
  for (const p of CONSUMERS) {
    const src = read(p);
    assert.match(src, /<script src="mm-menu\.js" defer><\/script>/, `${p} loads the controller`);
    assert.match(src, /<link rel="stylesheet" href="mm-menu\.css">/, `${p} loads its placement`);
    // The duplicated per-page toggle wiring is gone — two identical copies were
    // two identical bugs.
    assert.ok(!/mobileNav\.classList\.toggle\('open'\)/.test(src),
      `${p} still toggles the drawer itself`);
    assert.ok(!/menuToggle'\)[\s\S]{0,80}addEventListener\('click'/.test(src),
      `${p} still binds its own toggle handler`);
  }
});

test('the controller is a no-op on a page without the markup', () => {
  assert.match(JS, /if \(!toggle \|\| !drawer\) return null;/);
});

test('it is presentation only — no network, storage or user data', () => {
  const code = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/,
    /supabase/i, /serviceWorker/, /\bcaches\b/]) {
    assert.ok(!forbidden.test(code), `mm-menu.js must not reference ${forbidden}`);
  }
});

test('the menu was NOT forced through the dialog primitive', () => {
  // A header menu is a <nav> anchored to the header, not a modal panel with a
  // backdrop. Reusing mm-sheet would have meant inventing markup purely to
  // satisfy the abstraction — the over-generalisation the phase brief warns
  // against. The decision and its reasoning are recorded in the module header.
  assert.ok(!/MMSheet/.test(JS), 'mm-menu.js does not depend on the sheet primitive');
  assert.match(JS, /WHY NOT THE 4\.3\.5C SHEET PRIMITIVE/, 'the decision is documented');
  // index.html therefore does not pay for the dialog primitive it never uses.
  assert.ok(!/mm-sheet\.js/.test(read('index.html')),
    'the marketing landing page loads only what its menu needs');
});
