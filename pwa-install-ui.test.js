'use strict';

// Phase 4.3.3 — Checkpoint 2. Coverage for the install-onboarding UI controller
// (`pwa-install-ui.js`): rendering per platform, actions, accessibility, focus
// management, safe-area/bottom-clearance, update-banner precedence, error
// recovery, lifecycle, and purity boundaries. Pure Node (node:test) with a
// hand-built fake DOM — no jsdom, no browser, no packages, no globals.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PWAInstallUI = require('./pwa-install-ui.js');
const {
  createInstallOnboardingUI,
  computeInstallSurfaceBottomOffset,
  COPY,
  ROOT_ID,
  STYLE_ID,
  DEFAULT_MIN_GAP,
  SURFACE_CSS
} = PWAInstallUI;

const SRC = fs.readFileSync(path.join(__dirname, 'pwa-install-ui.js'), 'utf8');
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ''); }
const CODE = stripComments(SRC);

const tick = () => new Promise((res) => setTimeout(res, 0));

// ── Fake DOM ──────────────────────────────────────────────────────────────
function makeStyle() {
  return {
    _p: {},
    setProperty(k, v) { this._p[k] = String(v); },
    getPropertyValue(k) { return (k in this._p) ? this._p[k] : ''; },
    removeProperty(k) { delete this._p[k]; }
  };
}
function walk(node, fn) { for (const c of node._children) { fn(c); walk(c, fn); } }
function findById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  let found = null;
  walk(node, (c) => { if (!found && c.id === id) found = c; });
  return found;
}
function elem(tag, doc) {
  return {
    tagName: tag, _doc: doc, id: '', className: '', type: '', textContent: '',
    disabled: false, parentNode: null, _attrs: {}, _children: [], _l: {}, style: makeStyle(),
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    hasAttribute(k) { return k in this._attrs; },
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener(t, fn) { if (this._l[t]) { const i = this._l[t].indexOf(fn); if (i >= 0) this._l[t].splice(i, 1); } },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); },
    focus() { if (this._doc) this._doc._active = this; },
    click() { if (this.disabled) return; this._emit('click', { target: this }); },
    appendChild(c) { c.parentNode = this; this._children.push(c); return c; },
    removeChild(c) { const i = this._children.indexOf(c); if (i >= 0) this._children.splice(i, 1); c.parentNode = null; return c; },
    querySelectorAll(sel) {
      const out = [];
      walk(this, (c) => { if (c.tagName && c.tagName.toLowerCase() === String(sel).toLowerCase()) out.push(c); });
      return out;
    },
    contains(node) { if (node === this) return true; let f = false; walk(this, (c) => { if (c === node) f = true; }); return f; }
  };
}
function makeDoc() {
  const doc = {
    _l: {}, _active: null,
    createElement(tag) { return elem(tag, doc); },
    getElementById(id) { return findById(doc.body, id) || findById(doc.head, id) || null; },
    get activeElement() { return doc._active; },
    addEventListener(t, fn) { (doc._l[t] = doc._l[t] || []).push(fn); },
    removeEventListener(t, fn) { if (doc._l[t]) { const i = doc._l[t].indexOf(fn); if (i >= 0) doc._l[t].splice(i, 1); } },
    _emit(t, e) { (doc._l[t] || []).slice().forEach((fn) => fn(e || {})); }
  };
  doc.body = elem('body', doc);
  doc.head = elem('head', doc);
  doc.documentElement = elem('html', doc);
  return doc;
}

// Callback recorder + UI factory.
function rec() {
  const calls = { onShown: [], onClosed: [], onSkip: [], onDismiss: [], onInstallRequest: [] };
  return {
    calls,
    onShown(a) { calls.onShown.push(a); },
    onClosed(a) { calls.onClosed.push(a); },
    onSkip(a) { calls.onSkip.push(a); return undefined; },
    onDismiss(a) { calls.onDismiss.push(a); },
    onInstallRequest(a) { calls.onInstallRequest.push(a); return undefined; }
  };
}
function mkUI(doc) {
  doc = doc || makeDoc();
  const ui = createInstallOnboardingUI({
    document: doc,
    window: {},
    setTimer: () => 0,
    clearTimer: () => {}
  });
  return { doc, ui };
}
function baseOpts(cb, over) {
  return Object.assign({
    platform: 'android-chrome',
    eligible: true,
    nativePromptAvailable: true,
    onShown: cb.onShown, onClosed: cb.onClosed, onSkip: cb.onSkip,
    onDismiss: cb.onDismiss, onInstallRequest: cb.onInstallRequest
  }, over || {});
}
function surfaceOf(doc) { return doc.getElementById(ROOT_ID); }
function backdropOf(doc) { return doc.getElementById(ROOT_ID + '-backdrop'); }
function q(doc, attr) {
  const s = surfaceOf(doc);
  if (!s) return null;
  let f = null;
  walk(s, (c) => { if (!f && (attr in c._attrs)) f = c; });
  return f;
}

// ════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════

test('exports: public surface is frozen with expected members', () => {
  assert.ok(Object.isFrozen(PWAInstallUI));
  assert.strictEqual(typeof createInstallOnboardingUI, 'function');
  assert.strictEqual(typeof computeInstallSurfaceBottomOffset, 'function');
  assert.ok(Object.isFrozen(COPY));
  assert.strictEqual(ROOT_ID, 'mm-pwa-install-surface');
  assert.strictEqual(DEFAULT_MIN_GAP, 12);
});

test('exports: COPY has no forbidden capability claims', () => {
  const json = JSON.stringify(COPY).toLowerCase();
  for (const bad of ['offline', 'background sync', 'push notification', 'notifications', 'native app']) {
    assert.strictEqual(json.indexOf(bad), -1, `copy must not claim "${bad}"`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// computeInstallSurfaceBottomOffset (pure layout helper)
// ════════════════════════════════════════════════════════════════════════════

test('offset: no fixed controls → default gap only', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 0 }), DEFAULT_MIN_GAP);
});
test('offset: safe-area only (undefined clearance) → default gap', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({}), DEFAULT_MIN_GAP);
  assert.strictEqual(computeInstallSurfaceBottomOffset(), DEFAULT_MIN_GAP);
});
test('offset: bottom navigation present', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 56 }), 68);
});
test('offset: workout done bar present', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 72 }), 84);
});
test('offset: rest strip present', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 88 }), 100);
});
test('offset: very large clearance', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 10000 }), 10012);
});
test('offset: malformed / negative clearance → sanitized to gap', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: -20 }), DEFAULT_MIN_GAP);
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: NaN }), DEFAULT_MIN_GAP);
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: '50' }), DEFAULT_MIN_GAP);
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: Infinity }), DEFAULT_MIN_GAP);
});
test('offset: custom minimumGap honored', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 56, minimumGap: 20 }), 76);
});
test('offset: zero minimumGap honored', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 56, minimumGap: 0 }), 56);
});
test('offset: malformed minimumGap → default', () => {
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 56, minimumGap: -5 }), 68);
  assert.strictEqual(computeInstallSurfaceBottomOffset({ measuredClearance: 56, minimumGap: 'x' }), 68);
});

// ════════════════════════════════════════════════════════════════════════════
// Rendering
// ════════════════════════════════════════════════════════════════════════════

test('render: iOS shows heading, body, and three numbered steps', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { platform: 'ios-safari' }));
  assert.strictEqual(ok, true);
  const s = surfaceOf(doc);
  assert.ok(s);
  const heading = doc.getElementById(ROOT_ID + '-title');
  assert.strictEqual(heading.textContent, COPY['ios-safari'].heading);
  const steps = s.querySelectorAll('li');
  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0].textContent.indexOf('Share') !== -1 || steps[0]._children.some((c) => c.textContent.indexOf('Share') !== -1), true);
  // iOS has no native install request button.
  assert.strictEqual(q(doc, 'data-mm-install-request'), null);
  ui.destroy();
});

test('render: iOS instructions never imply an automatic prompt', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { platform: 'ios-safari' }));
  const text = JSON.stringify(COPY['ios-safari']).toLowerCase();
  assert.strictEqual(text.indexOf('prompt'), -1);
  assert.strictEqual(text.indexOf('install button'), -1);
  ui.destroy();
});

test('render: Android with native prompt shows an Install request button', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { platform: 'android-chrome', nativePromptAvailable: true }));
  const btn = q(doc, 'data-mm-install-request');
  assert.ok(btn);
  assert.strictEqual(btn.textContent, COPY['android-chrome'].primary);
  ui.destroy();
});

test('render: desktop Chromium with native prompt shows an Install button', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { platform: 'desktop-chromium', nativePromptAvailable: true }));
  assert.ok(q(doc, 'data-mm-install-request'));
  ui.destroy();
});

test('render: unsupported platform renders nothing', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { platform: 'other' }));
  assert.strictEqual(ok, false);
  assert.strictEqual(surfaceOf(doc), null);
  assert.strictEqual(cb.calls.onShown.length, 0);
});

test('render: ineligible decision renders nothing', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { eligible: false }));
  assert.strictEqual(ok, false);
  assert.strictEqual(surfaceOf(doc), null);
});

test('render: native prompt unavailable defaults to no render', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { platform: 'android-chrome', nativePromptAvailable: false }));
  assert.strictEqual(ok, false);
  assert.strictEqual(surfaceOf(doc), null);
  assert.strictEqual(cb.calls.onShown.length, 0);
});

test('render: passive mode renders only when explicitly requested (no active Install)', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { platform: 'desktop-chromium', nativePromptAvailable: false, passiveWhenNoPrompt: true }));
  assert.strictEqual(ok, true);
  assert.ok(surfaceOf(doc));
  assert.strictEqual(q(doc, 'data-mm-install-request'), null, 'no active install button in passive mode');
  assert.ok(q(doc, 'data-mm-install-primary'), 'has an acknowledge primary');
  assert.ok(q(doc, 'data-mm-install-skip'), 'has skip');
  ui.destroy();
});

test('render: update surface visible prevents rendering and does not fire onShown', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  const ok = ui.open(baseOpts(cb, { updateSurfaceVisible: true }));
  assert.strictEqual(ok, false);
  assert.strictEqual(surfaceOf(doc), null);
  assert.strictEqual(cb.calls.onShown.length, 0);
});

test('render: no duplicate root nodes on repeated open', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  assert.strictEqual(ui.open(baseOpts(cb)), true);
  assert.strictEqual(ui.open(baseOpts(cb)), true); // idempotent
  const roots = [];
  walk(doc.body, (c) => { if (c.id === ROOT_ID) roots.push(c); });
  assert.strictEqual(roots.length, 1);
  assert.strictEqual(cb.calls.onShown.length, 1, 'onShown fires once');
  ui.destroy();
});

// ════════════════════════════════════════════════════════════════════════════
// Install action
// ════════════════════════════════════════════════════════════════════════════

test('install: callback invoked once per click', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  q(doc, 'data-mm-install-request').click();
  await tick();
  assert.strictEqual(cb.calls.onInstallRequest.length, 1);
  ui.destroy();
});

test('install: double-click prevented while busy (never-settling promise)', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  let calls = 0;
  ui.open(baseOpts(cb, { onInstallRequest: () => { calls++; return new Promise(() => {}); } }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  btn.click(); // disabled + busy guard
  await tick();
  assert.strictEqual(calls, 1);
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(btn.getAttribute('aria-busy'), 'true');
  ui.destroy();
});

test('install: success handoff returns to idle without inventing install success', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onInstallRequest: () => Promise.resolve() }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  await tick();
  assert.strictEqual(ui.isOpen(), true, 'stays open — Checkpoint 3 confirms install');
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(btn.getAttribute('aria-busy'), null);
  assert.strictEqual(cb.calls.onClosed.length, 0);
  ui.destroy();
});

test('install: rejection recovers to an error state and stays retryable', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  let n = 0;
  ui.open(baseOpts(cb, { onInstallRequest: () => { n++; return Promise.reject(new Error('nope')); } }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  await tick();
  assert.strictEqual(ui._getState(), 'error');
  assert.strictEqual(btn.disabled, false, 'not permanently disabled');
  const status = surfaceOf(doc)._children.find((c) => c.className === 'mm-install-status') ||
    (function () { let f = null; walk(surfaceOf(doc), (c) => { if (c.className === 'mm-install-status') f = c; }); return f; })();
  assert.strictEqual(status.textContent, COPY.common.errorStatus);
  // Retry works.
  btn.click();
  await tick();
  assert.strictEqual(n, 2);
  ui.destroy();
});

test('install: synchronous throw recovers to error, not permanently disabled', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onInstallRequest: () => { throw new Error('sync'); } }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  await tick();
  assert.strictEqual(ui._getState(), 'error');
  assert.strictEqual(btn.disabled, false);
  ui.destroy();
});

test('install: external cancellation via update({installReset}) returns to idle', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onInstallRequest: () => new Promise(() => {}) }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  await tick();
  assert.strictEqual(btn.disabled, true);
  ui.update({ installReset: 'cancelled' });
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(ui._getState(), 'open');
  ui.destroy();
});

// ════════════════════════════════════════════════════════════════════════════
// Skip / dismiss semantics
// ════════════════════════════════════════════════════════════════════════════

test('skip: invokes onSkip once and closes with reason "skip"', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  q(doc, 'data-mm-install-skip').click();
  await tick();
  assert.strictEqual(cb.calls.onSkip.length, 1);
  assert.strictEqual(ui.isOpen(), false);
  assert.deepStrictEqual(cb.calls.onClosed, ['skip']);
  assert.strictEqual(cb.calls.onDismiss.length, 0, 'skip is not a dismiss');
});

test('skip: callback throwing keeps the surface open (recoverable)', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onSkip: () => { throw new Error('boom'); } }));
  q(doc, 'data-mm-install-skip').click();
  assert.strictEqual(ui.isOpen(), true);
  ui.destroy();
});

test('skip: callback rejecting keeps the surface open (recoverable)', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onSkip: () => Promise.reject(new Error('later')) }));
  q(doc, 'data-mm-install-skip').click();
  await tick();
  assert.strictEqual(ui.isOpen(), true);
  ui.destroy();
});

test('dismiss: close button fires onDismiss (not onSkip) and closes', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  q(doc, 'data-mm-install-close').click();
  assert.strictEqual(cb.calls.onDismiss.length, 1);
  assert.strictEqual(cb.calls.onSkip.length, 0);
  assert.strictEqual(ui.isOpen(), false);
  assert.strictEqual(cb.calls.onClosed[0], 'close-button');
});

test('dismiss: iOS informational primary ("Got it") dismisses, does not skip', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { platform: 'ios-safari' }));
  q(doc, 'data-mm-install-primary').click();
  assert.strictEqual(cb.calls.onDismiss.length, 1);
  assert.strictEqual(cb.calls.onSkip.length, 0);
  assert.strictEqual(ui.isOpen(), false);
});

test('dismiss: backdrop click (started on backdrop) dismisses', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const bd = backdropOf(doc);
  bd._emit('mousedown', { target: bd });
  bd._emit('click', { target: bd });
  assert.strictEqual(cb.calls.onDismiss.length, 1);
  assert.strictEqual(ui.isOpen(), false);
  assert.strictEqual(cb.calls.onClosed[0], 'backdrop');
});

test('dismiss: click starting on a child does NOT dismiss', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const bd = backdropOf(doc);
  const s = surfaceOf(doc);
  bd._emit('mousedown', { target: s });   // gesture began inside the card
  bd._emit('click', { target: bd });      // ended on backdrop
  assert.strictEqual(cb.calls.onDismiss.length, 0);
  assert.strictEqual(ui.isOpen(), true);
  ui.destroy();
});

test('dismiss: Escape closes through the dismiss callback', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  doc._emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.strictEqual(cb.calls.onDismiss.length, 1);
  assert.strictEqual(ui.isOpen(), false);
  assert.strictEqual(cb.calls.onClosed[0], 'escape');
});

test('dismiss: onDismiss throwing still closes the surface (never traps user)', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onDismiss: () => { throw new Error('x'); } }));
  q(doc, 'data-mm-install-close').click();
  assert.strictEqual(ui.isOpen(), false);
});

test('close: programmatic close propagates its reason to onClosed', () => {
  const cb = rec(); const { ui } = mkUI();
  ui.open(baseOpts(cb));
  ui.close('programmatic');
  assert.strictEqual(cb.calls.onClosed[0], 'programmatic');
});

// ════════════════════════════════════════════════════════════════════════════
// Accessibility
// ════════════════════════════════════════════════════════════════════════════

test('a11y: dialog semantics (role, aria-modal)', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const s = surfaceOf(doc);
  assert.strictEqual(s.getAttribute('role'), 'dialog');
  assert.strictEqual(s.getAttribute('aria-modal'), 'true');
  ui.destroy();
});

test('a11y: heading labelling + description linkage', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const s = surfaceOf(doc);
  const labelled = s.getAttribute('aria-labelledby');
  const described = s.getAttribute('aria-describedby');
  assert.ok(doc.getElementById(labelled), 'labelledby target exists');
  assert.ok(doc.getElementById(described), 'describedby target exists');
  assert.strictEqual(doc.getElementById(labelled).textContent, COPY['android-chrome'].heading);
  ui.destroy();
});

test('a11y: all controls are real <button> elements with type="button"', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const btns = surfaceOf(doc).querySelectorAll('button');
  assert.ok(btns.length >= 3);
  for (const b of btns) assert.strictEqual(b.type, 'button');
  ui.destroy();
});

test('a11y: close control has an accessible label', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  assert.strictEqual(q(doc, 'data-mm-install-close').getAttribute('aria-label'), COPY.common.closeLabel);
  ui.destroy();
});

test('a11y: busy action exposes disabled/aria-disabled/aria-busy', async () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { onInstallRequest: () => new Promise(() => {}) }));
  const btn = q(doc, 'data-mm-install-request');
  btn.click();
  await tick();
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(btn.getAttribute('aria-disabled'), 'true');
  assert.strictEqual(btn.getAttribute('aria-busy'), 'true');
  ui.destroy();
});

test('a11y: a live status region exists for messages', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  let status = null;
  walk(surfaceOf(doc), (c) => { if (c.className === 'mm-install-status') status = c; });
  assert.ok(status);
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  ui.destroy();
});

// ════════════════════════════════════════════════════════════════════════════
// Focus management
// ════════════════════════════════════════════════════════════════════════════

test('focus: initial focus lands on the primary action', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  assert.strictEqual(doc.activeElement, q(doc, 'data-mm-install-request'));
  ui.destroy();
});

test('focus: previous focus is saved and restored on close', () => {
  const doc = makeDoc();
  const prior = elem('button', doc);
  doc._active = prior; // something was focused before we opened
  const cb = rec();
  const ui = createInstallOnboardingUI({ document: doc, window: {} });
  ui.open(baseOpts(cb));
  assert.notStrictEqual(doc.activeElement, prior); // moved into the dialog
  ui.close('programmatic');
  assert.strictEqual(doc.activeElement, prior, 'focus restored');
});

test('focus: removed/unfocusable previous target does not crash close', () => {
  const doc = makeDoc();
  const prior = { focus() { throw new Error('detached'); } };
  doc._active = prior;
  const cb = rec();
  const ui = createInstallOnboardingUI({ document: doc, window: {} });
  ui.open(baseOpts(cb));
  ui.close('programmatic'); // must not throw
  assert.strictEqual(ui.isOpen(), false);
});

test('focus: Tab from last control wraps to first', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const items = surfaceOf(doc).querySelectorAll('button');
  const first = items[0], last = items[items.length - 1];
  doc._active = last;
  doc._emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.strictEqual(doc.activeElement, first);
  ui.destroy();
});

test('focus: Shift+Tab from first control wraps to last', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const items = surfaceOf(doc).querySelectorAll('button');
  const first = items[0], last = items[items.length - 1];
  doc._active = first;
  doc._emit('keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.strictEqual(doc.activeElement, last);
  ui.destroy();
});

test('focus: Tab with focus outside the surface is pulled to the first control', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const items = surfaceOf(doc).querySelectorAll('button');
  doc._active = doc.body; // outside
  doc._emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.strictEqual(doc.activeElement, items[0]);
  ui.destroy();
});

test('focus: with only one enabled control, Tab keeps focus on it', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const items = surfaceOf(doc).querySelectorAll('button');
  // Disable all but the skip button.
  for (const b of items) if (!('data-mm-install-skip' in b._attrs)) b.disabled = true;
  const only = q(doc, 'data-mm-install-skip');
  doc._active = only;
  doc._emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.strictEqual(doc.activeElement, only);
  ui.destroy();
});

test('focus: with no enabled controls, Tab is trapped on the surface', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  const items = surfaceOf(doc).querySelectorAll('button');
  for (const b of items) b.disabled = true;
  let prevented = false;
  doc._emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.strictEqual(prevented, true);
  assert.strictEqual(doc.activeElement, surfaceOf(doc));
  ui.destroy();
});

test('focus: keyboard-only Escape operates without a pointer', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  doc._emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.strictEqual(ui.isOpen(), false);
});

// ════════════════════════════════════════════════════════════════════════════
// Safe-area / bottom-clearance layout
// ════════════════════════════════════════════════════════════════════════════

test('layout: bottom-clearance is applied to the surface CSS var', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { bottomClearance: 80 }));
  assert.strictEqual(surfaceOf(doc).style.getPropertyValue('--mm-install-offset'), '92px');
  ui.destroy();
});

test('layout: update() re-applies a new clearance', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { bottomClearance: 0 }));
  assert.strictEqual(surfaceOf(doc).style.getPropertyValue('--mm-install-offset'), '12px');
  ui.update({ bottomClearance: 100 });
  assert.strictEqual(surfaceOf(doc).style.getPropertyValue('--mm-install-offset'), '112px');
  ui.destroy();
});

test('layout: negative clearance is sanitized', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { bottomClearance: -300 }));
  assert.strictEqual(surfaceOf(doc).style.getPropertyValue('--mm-install-offset'), '12px');
  ui.destroy();
});

test('layout: surface sets no inline width (no 320px overflow risk)', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  assert.strictEqual(surfaceOf(doc).style.getPropertyValue('width'), '');
  ui.destroy();
});

test('layout: CSS enforces fluid width, max-width, border-box, and internal scroll', () => {
  assert.ok(SURFACE_CSS.indexOf('max-width:100%') !== -1);
  assert.ok(SURFACE_CSS.indexOf('max-width:380px') !== -1, 'desktop compact max width');
  assert.ok(SURFACE_CSS.indexOf('box-sizing:border-box') !== -1);
  assert.ok(SURFACE_CSS.indexOf('overflow-y:auto') !== -1, 'short viewport scroll');
  assert.ok(SURFACE_CSS.indexOf('max-height:') !== -1);
});

test('layout: CSS includes the safe-area inset and the offset var', () => {
  assert.ok(SURFACE_CSS.indexOf('env(safe-area-inset-bottom') !== -1);
  assert.ok(SURFACE_CSS.indexOf('--mm-install-offset') !== -1);
});

test('layout: narrow-width media query stacks the action buttons', () => {
  assert.ok(SURFACE_CSS.indexOf('@media (max-width:360px)') !== -1);
});

// ════════════════════════════════════════════════════════════════════════════
// Update-banner precedence
// ════════════════════════════════════════════════════════════════════════════

test('precedence: an open surface is closed cleanly when the update surface appears', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  assert.strictEqual(ui.isOpen(), true);
  const r = ui.update({ updateSurfaceVisible: true });
  assert.strictEqual(r, false);
  assert.strictEqual(ui.isOpen(), false);
  assert.strictEqual(cb.calls.onClosed[0], 'update-precedence');
  assert.strictEqual(surfaceOf(doc), null);
});

test('precedence: cleared update surface does NOT auto-reopen', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb, { updateSurfaceVisible: true }));
  assert.strictEqual(ui.isOpen(), false);
  ui.update({ updateSurfaceVisible: false }); // clearing must not reopen
  assert.strictEqual(ui.isOpen(), false);
  assert.strictEqual(surfaceOf(doc), null);
  assert.strictEqual(cb.calls.onShown.length, 0);
});

test('precedence: blocked open does not count as displayed', () => {
  const cb = rec(); const { ui } = mkUI();
  ui.open(baseOpts(cb, { updateSurfaceVisible: true }));
  assert.strictEqual(cb.calls.onShown.length, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// Lifecycle
// ════════════════════════════════════════════════════════════════════════════

test('lifecycle: open → close → reopen re-renders and re-fires onShown', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  ui.close('programmatic');
  assert.strictEqual(surfaceOf(doc), null);
  ui.open(baseOpts(cb));
  assert.ok(surfaceOf(doc));
  assert.strictEqual(cb.calls.onShown.length, 2);
  ui.destroy();
});

test('lifecycle: close removes the mounted root and fires onClosed once', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  ui.close('programmatic');
  ui.close('programmatic'); // second close is a no-op
  assert.strictEqual(cb.calls.onClosed.length, 1);
  assert.strictEqual(backdropOf(doc), null);
});

test('lifecycle: destroy removes DOM, the injected style, and all doc listeners', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.open(baseOpts(cb));
  assert.ok(doc.getElementById(STYLE_ID));
  ui.destroy();
  assert.strictEqual(surfaceOf(doc), null);
  assert.strictEqual(doc.getElementById(STYLE_ID), null);
  assert.strictEqual((doc._l['keydown'] || []).length, 0, 'no document listeners after destroy');
});

test('lifecycle: repeated destroy is safe', () => {
  const cb = rec(); const { ui } = mkUI();
  ui.open(baseOpts(cb));
  ui.destroy();
  ui.destroy(); // no throw
  assert.strictEqual(ui.isOpen(), false);
});

test('lifecycle: open after destroy is refused', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  ui.destroy();
  assert.strictEqual(ui.open(baseOpts(cb)), false);
  assert.strictEqual(surfaceOf(doc), null);
});

test('lifecycle: no duplicate document listeners after repeated open/close cycles', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  for (let i = 0; i < 3; i++) { ui.open(baseOpts(cb)); ui.close('programmatic'); }
  ui.open(baseOpts(cb));
  assert.strictEqual((doc._l['keydown'] || []).length, 1);
  ui.destroy();
});

test('lifecycle: no document keydown listener while closed', () => {
  const { doc, ui } = mkUI();
  assert.strictEqual((doc._l['keydown'] || []).length, 0, 'no listeners before open');
  ui.destroy();
});

test('lifecycle: closing never auto-persists a skip', () => {
  const cb = rec(); const { ui } = mkUI();
  ui.open(baseOpts(cb));
  ui.close('programmatic');
  assert.strictEqual(cb.calls.onSkip.length, 0, 'close is not a skip');
  assert.strictEqual(cb.calls.onDismiss.length, 0, 'programmatic close is not a dismiss');
});

test('lifecycle: modal open locks body scroll; close restores it', () => {
  const cb = rec(); const { doc, ui } = mkUI();
  doc.body.style.setProperty('overflow', 'auto');
  ui.open(baseOpts(cb));
  assert.strictEqual(doc.body.style.getPropertyValue('overflow'), 'hidden');
  ui.close('programmatic');
  assert.strictEqual(doc.body.style.getPropertyValue('overflow'), 'auto');
});

// ════════════════════════════════════════════════════════════════════════════
// Purity & boundary
// ════════════════════════════════════════════════════════════════════════════

test('purity: source references no persistence / install-event / SW / network APIs', () => {
  for (const forbidden of [
    'localStorage', 'sessionStorage', 'beforeinstallprompt', 'appinstalled',
    'serviceWorker', 'matchMedia', 'navigator', 'caches', 'fetch(', 'XMLHttpRequest', 'supabase'
  ]) {
    assert.strictEqual(CODE.indexOf(forbidden), -1, `must not reference ${forbidden}`);
  }
});

test('purity: does not duplicate Checkpoint-1 eligibility logic or require it', () => {
  assert.strictEqual(CODE.indexOf("require('./pwa-install')"), -1);
  assert.strictEqual(CODE.indexOf('computeInstallEligibility'), -1);
  assert.strictEqual(CODE.indexOf('classifyPlatform'), -1);
  assert.strictEqual(CODE.indexOf('meaningfulValueReached'), -1);
});

test('purity: no import-time side effects; re-require returns the same frozen object', () => {
  const again = require('./pwa-install-ui.js');
  assert.strictEqual(again, PWAInstallUI);
});

test('purity: creating a controller attaches no listeners until open', () => {
  const doc = makeDoc();
  createInstallOnboardingUI({ document: doc, window: {} });
  assert.strictEqual((doc._l['keydown'] || []).length, 0);
  assert.strictEqual(doc.getElementById(STYLE_ID), null, 'no style injected on create');
});
