'use strict';

// Phase 4.3.1 — iPhone standalone-PWA safe-area fix for the rest-timer strip.
// Static presentation-contract regression guard for the #restStrip open/closed
// CSS in workout.html. Locks in the height-relative, safe-area-aware dismissal
// so it can't regress to the brittle fixed translateY(100px) that left a sliver
// above the iPhone home indicator.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');

// Extract a single flat CSS rule body by selector (rules have no nested braces).
function ruleBody(selectorRegex) {
  const m = html.match(new RegExp(selectorRegex.source + '\\s*\\{([\\s\\S]*?)\\}'));
  assert.ok(m, `CSS rule ${selectorRegex} exists in workout.html`);
  return m[1];
}

// Closed/base rule: `.rest-strip {` but NOT `.rest-strip.show`, `.rest-strip-left`, etc.
const closed = ruleBody(/\.rest-strip(?![.\w-])/);
// Open rule.
const show = ruleBody(/\.rest-strip\.show/);

test('closed transform is height-relative (includes 100%)', () => {
  assert.match(closed, /transform:\s*[^;]*translateY\(\s*calc\([^;]*100%/, 'closed translateY uses 100% (full panel height)');
});

test('closed transform includes env(safe-area-inset-bottom)', () => {
  assert.match(closed, /translateY\(\s*calc\([^;]*env\(\s*safe-area-inset-bottom/, 'closed translateY adds the iOS bottom safe-area inset');
});

test('the old brittle translateY(100px) implementation is absent', () => {
  // Strip CSS block comments so the cautionary comment that names the old value
  // does not count as a live declaration.
  const noComments = html.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/translateY\(\s*100px\s*\)/.test(noComments), 'no fixed translateY(100px) declaration in workout.html');
});

test('closed state disables interaction and hides the panel', () => {
  assert.match(closed, /visibility:\s*hidden/, 'closed: visibility: hidden');
  assert.match(closed, /pointer-events:\s*none/, 'closed: pointer-events: none');
});

test('show state re-opens the panel to translateY(0) and re-enables interaction', () => {
  assert.match(show, /transform:\s*translateX\(-50%\)\s*translateY\(\s*0\s*\)/, 'open: translateY(0)');
  assert.match(show, /visibility:\s*visible/, 'open: visibility: visible');
  assert.match(show, /pointer-events:\s*auto/, 'open: pointer-events: auto');
});

test('visibility change is deferred until after the 0.3s transform slide-out', () => {
  // Closed rule: visibility flips only after the transform finishes (0.3s delay),
  // so the panel stays visible for the whole slide-out.
  assert.match(closed, /transition:\s*transform\s+0\.3s\s+ease,\s*visibility\s+0s\s+linear\s+0\.3s/, 'closed: visibility delayed 0.3s to match the transform');
  // Open rule: visibility returns immediately (no delay) so slide-in is visible.
  assert.match(show, /transition:\s*transform\s+0\.3s\s+ease,\s*visibility\s+0s\s+linear\s+0s/, 'open: visibility restored with no delay');
});

test('open-state bottom anchor and placement are unchanged', () => {
  assert.match(closed, /bottom:\s*24px/, 'bottom: 24px anchor preserved');
  assert.match(closed, /position:\s*fixed/, 'position: fixed preserved');
  // The 48px deliberate clearance (24px anchor + 24px border/shadow) is present.
  assert.match(closed, /translateY\(\s*calc\(\s*100%\s*\+\s*env\(\s*safe-area-inset-bottom[^)]*\)\s*\+\s*48px/, 'closed clearance = 100% + safe-area inset + 48px');
});
