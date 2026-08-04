'use strict';

// Phase 4.3.2 — Checkpoint 3. Coverage for the client-side registration +
// controlled-update layer (`sw-register.js`). Pure Node (node:test) with hand
// fakes for navigator.serviceWorker, registration, workers, document, storage,
// reload, and console — no jsdom, no browser, no packages. `sw-register.js`
// never auto-registers in Node (no window/document globals).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SWRegister = require('./sw-register.js');
const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'sw-register.js'), 'utf8');
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ''); }
const CODE = stripComments(SRC);

// ── Fakes ─────────────────────────────────────────────────────────────────

function target() {
  return {
    _l: {},
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); }
  };
}

function makeWorker() {
  const w = Object.assign(target(), {
    state: 'installing', posted: [],
    postMessage(m) { if (w._postThrows) throw new Error('post'); w.posted.push(m); },
    _setState(s) { w.state = s; w._emit('statechange', {}); }
  });
  return w;
}

function makeRegistration(opts) {
  opts = opts || {};
  const reg = Object.assign(target(), {
    waiting: opts.waiting || null,
    installing: null,
    _updateCalls: 0,
    update() {
      reg._updateCalls++;
      if (opts.updateThrows) throw new Error('update-sync');
      if (opts.updateRejects) return Promise.reject(new Error('update-async'));
      return Promise.resolve();
    },
    _triggerUpdateFound(installing) { reg.installing = installing; reg._emit('updatefound', {}); }
  });
  if (opts.addListenerThrows) reg.addEventListener = function () { throw new Error('addl'); };
  return reg;
}

function makeContainer(opts) {
  opts = opts || {};
  const c = Object.assign(target(), {
    controller: opts.controller || null,
    _registerCalls: [],
    register(url, o) {
      c._registerCalls.push([url, o]);
      if (opts.registerThrows) throw new Error('register-sync');
      if (opts.registerRejects) return Promise.reject(new Error('register-async'));
      return Promise.resolve(opts.registration);
    }
  });
  return c;
}

// Minimal DOM.
function elem(tag) {
  return {
    tagName: tag, id: '', className: '', type: '', textContent: '', disabled: false,
    _attrs: {}, _children: [], _l: {}, parentNode: null,
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k]; } },
    _rect: null, // set by tests to simulate getBoundingClientRect
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    removeAttribute(k) { delete this._attrs[k]; },
    getBoundingClientRect() { return this._rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    matchesSel(sel) {
      if (sel.charAt(0) === '.') return (' ' + this.className + ' ').indexOf(' ' + sel.slice(1) + ' ') !== -1;
      if (sel.charAt(0) === '[') return sel.replace(/^\[|\]$/g, '') in this._attrs;
      return false;
    },
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); },
    click() { this._emit('click', {}); },
    appendChild(c) { c.parentNode = this; this._children.push(c); return c; },
    removeChild(c) { const i = this._children.indexOf(c); if (i >= 0) this._children.splice(i, 1); c.parentNode = null; return c; },
    querySelector(sel) { return findBy(this, sel); }
  };
}
function walk(node, fn) { for (const c of node._children) { fn(c); walk(c, fn); } }
function findById(node, id) { let found = null; if (node.id === id) return node; walk(node, (c) => { if (!found && c.id === id) found = c; }); return found; }
function findBy(node, sel) {
  let found = null;
  const attr = sel.replace(/^\[|\]$/g, '');
  walk(node, (c) => { if (!found && attr in c._attrs) found = c; });
  return found;
}
function fakeDoc() {
  const body = elem('body'); const head = elem('head');
  const doc = {
    visibilityState: 'visible', body, head, documentElement: elem('html'), _l: {},
    _extra: [], // extra "page" elements measurable via querySelectorAll
    createElement(t) { return elem(t); },
    getElementById(id) { return findById(this.body, id) || findById(this.head, id) || null; },
    querySelectorAll(sel) {
      const out = [];
      const scan = (n) => { for (const c of n._children) { if (c.matchesSel && c.matchesSel(sel)) out.push(c); scan(c); } };
      scan(this.body);
      for (const e of this._extra) if (e.matchesSel && e.matchesSel(sel)) out.push(e);
      return out;
    },
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); }
  };
  return doc;
}
// A fixed bottom control the banner must clear: className + a getBoundingClientRect.
function bottomControl(doc, className, rect) { const el = elem('div'); el.className = className; el._rect = rect; doc._extra.push(el); return el; }
function fakeWindow(innerHeight) {
  return { innerHeight: innerHeight, _l: {}, addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }, _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); } };
}

function fakeStorage(opts) {
  opts = opts || {};
  const map = {};
  return {
    _map: map,
    getItem(k) { if (opts.throwGet) throw new Error('g'); return k in map ? map[k] : null; },
    setItem(k, v) { if (opts.throwSet) throw new Error('s'); map[k] = String(v); },
    removeItem(k) { if (opts.throwRemove) throw new Error('r'); delete map[k]; }
  };
}

function setup(opts) {
  opts = opts || {};
  const worker = makeWorker();
  const registration = makeRegistration({
    waiting: opts.waiting ? worker : null,
    updateThrows: opts.updateThrows, updateRejects: opts.updateRejects,
    addListenerThrows: opts.regAddListenerThrows
  });
  const container = makeContainer({
    controller: opts.controller ? {} : null,
    registration,
    registerThrows: opts.registerThrows,
    registerRejects: opts.registerRejects
  });
  const navigator = opts.unsupported ? {} : { serviceWorker: container };
  const doc = fakeDoc();
  const win = fakeWindow(opts.innerHeight || 800);
  const storage = opts.storage === null ? null : fakeStorage(opts.storageOpts);
  const reload = { count: 0 }; reload.fn = function () { reload.count += 1; };
  const consoleSpy = { warns: [], warn() { this.warns.push([].slice.call(arguments)); } };
  const nowRef = { t: opts.now || 1000000 };
  const ctrl = SWRegister.createUpdateController({
    navigator, document: doc, window: win, storage,
    reload: reload.fn, console: consoleSpy, now() { return nowRef.t; }
  });
  return { ctrl, navigator, container, registration, worker, doc, win, storage, reload, consoleSpy, nowRef };
}
const tick = () => new Promise((r) => setImmediate(r));

// ── A. Environment guard ─────────────────────────────────────────────────────

const G = SWRegister.shouldRegisterServiceWorker;
test('env: production HTTPS host allowed', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'musclemotivation.fit', search: '', supported: true }), true);
});
test('env: production HTTP host denied', () => {
  assert.strictEqual(G({ protocol: 'http:', hostname: 'musclemotivation.fit', search: '', supported: true }), false);
});
test('env: localhost HTTP and HTTPS allowed', () => {
  assert.strictEqual(G({ protocol: 'http:', hostname: 'localhost', search: '', supported: true }), true);
  assert.strictEqual(G({ protocol: 'https:', hostname: 'localhost', search: '', supported: true }), true);
});
test('env: 127.0.0.1 and [::1] allowed', () => {
  assert.strictEqual(G({ protocol: 'http:', hostname: '127.0.0.1', search: '', supported: true }), true);
  assert.strictEqual(G({ protocol: 'http:', hostname: '[::1]', search: '', supported: true }), true);
});
test('env: arbitrary HTTPS host denied', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'evil.example', search: '', supported: true }), false);
});
test('env: Vercel preview without override denied', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'mm-preview.vercel.app', search: '', supported: true }), false);
});
test('env: Vercel preview with ?mm_sw_preview=1 allowed', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'mm-preview.vercel.app', search: '?mm_sw_preview=1', supported: true }), true);
});
test('env: insecure remote preview with override denied', () => {
  assert.strictEqual(G({ protocol: 'http:', hostname: 'mm-preview.vercel.app', search: '?mm_sw_preview=1', supported: true }), false);
  assert.strictEqual(G({ protocol: 'https:', hostname: 'evil.example', search: '?mm_sw_preview=1', supported: true }), false);
});
test('env: unsupported service workers denied', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'musclemotivation.fit', search: '', supported: false }), false);
});
test('env: malformed / missing inputs denied', () => {
  assert.strictEqual(G(undefined), false);
  assert.strictEqual(G({}), false);
  assert.strictEqual(G({ supported: true }), false);
  assert.strictEqual(G({ protocol: 'ftp:', hostname: 'localhost', supported: true }), false);
  assert.strictEqual(G({ protocol: 'https:', hostname: 123, supported: true }), false);
});
test('env: unrelated query params do not enable registration', () => {
  assert.strictEqual(G({ protocol: 'https:', hostname: 'mm-preview.vercel.app', search: '?foo=1&bar=2', supported: true }), false);
  assert.strictEqual(SWRegister.hasPreviewFlag('?foo=1'), false);
  assert.strictEqual(SWRegister.hasPreviewFlag('?mm_sw_preview=1&x=2'), true);
});

// ── B. Registration ──────────────────────────────────────────────────────────

test('register: registers /sw.js with scope / and updateViaCache none, exactly once', () => {
  const s = setup({ controller: true });
  s.ctrl.start();
  s.ctrl.start();
  assert.strictEqual(s.container._registerCalls.length, 1);
  assert.deepStrictEqual(s.container._registerCalls[0], ['/sw.js', { scope: '/', updateViaCache: 'none' }]);
  assert.strictEqual(SWRegister.SW_UPDATE_VIA_CACHE, 'none');
});
test('register: unsupported navigator does not register', () => {
  const s = setup({ unsupported: true });
  assert.doesNotThrow(() => s.ctrl.start());
});
test('register: async rejection is swallowed, no throw / reload / banner', async () => {
  const s = setup({ controller: true, registerRejects: true });
  assert.doesNotThrow(() => s.ctrl.start());
  await tick();
  assert.strictEqual(s.reload.count, 0);
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('register: synchronous throw is swallowed', () => {
  const s = setup({ controller: true, registerThrows: true });
  assert.doesNotThrow(() => s.ctrl.start());
  assert.strictEqual(s.reload.count, 0);
});
test('register: first install shows no banner and sends no SKIP_WAITING', () => {
  const s = setup({ controller: false, waiting: true }); // no controller = first install
  s.ctrl.onRegistered(s.registration);
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'no banner on first install');
  assert.strictEqual(s.worker.posted.length, 0, 'no SKIP_WAITING');
});

// ── C. Existing waiting worker ───────────────────────────────────────────────

test('waiting: waiting worker + controller → banner appears', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const banner = s.doc.getElementById('mm-sw-update-banner');
  assert.ok(banner, 'banner shown');
});
test('waiting: waiting worker + no controller → no banner', () => {
  const s = setup({ controller: false, waiting: true });
  s.ctrl.onRegistered(s.registration);
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('waiting: repeated detection does not duplicate the banner', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration;
  s.ctrl.showUpdateIfReady();
  s.ctrl.showUpdateIfReady();
  let count = 0;
  walk(s.doc.body, (c) => { if (c.id === 'mm-sw-update-banner') count++; });
  assert.strictEqual(count, 1);
});
test('waiting: malformed waiting worker does not throw', () => {
  const s = setup({ controller: true });
  s.registration.waiting = { not: 'a real worker' };
  assert.doesNotThrow(() => { s.ctrl.onRegistered(s.registration); });
});

// ── D. updatefound flow ──────────────────────────────────────────────────────

test('updatefound: installing → installed + controller → banner', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  s.registration._triggerUpdateFound(s.worker);
  s.registration.waiting = s.worker;       // browser sets waiting once installed
  s.worker._setState('installed');
  assert.ok(s.doc.getElementById('mm-sw-update-banner'), 'banner shown after install');
});
test('updatefound: installed + no controller → no banner (first install)', () => {
  const s = setup({ controller: false });
  s.ctrl.onRegistered(s.registration);
  s.registration._triggerUpdateFound(s.worker);
  s.worker._setState('installed');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('updatefound: redundant / activated states do not prompt', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  s.registration._triggerUpdateFound(s.worker);
  s.worker._setState('redundant');
  s.worker._setState('activated');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('updatefound: repeated installed statechange does not duplicate UI', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  s.registration._triggerUpdateFound(s.worker);
  s.registration.waiting = s.worker;
  s.worker._setState('installed');
  s.worker._setState('installed');
  let count = 0;
  walk(s.doc.body, (c) => { if (c.id === 'mm-sw-update-banner') count++; });
  assert.strictEqual(count, 1);
});
test('updatefound: missing installing worker is safe', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  assert.doesNotThrow(() => s.registration._triggerUpdateFound(null));
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('updatefound: installing.addEventListener errors are contained', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  const bad = makeWorker(); bad.addEventListener = function () { throw new Error('x'); };
  assert.doesNotThrow(() => s.registration._triggerUpdateFound(bad));
});

// ── E. Update banner ─────────────────────────────────────────────────────────

test('banner: structure, actions, accessibility, stable selectors', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.showBanner();
  const b = s.doc.getElementById('mm-sw-update-banner');
  assert.ok(b);
  assert.strictEqual(b.getAttribute('role'), 'status');
  assert.strictEqual(b.getAttribute('aria-live'), 'polite');
  assert.ok('data-mm-sw-banner' in b._attrs);
  const upd = b.querySelector('[data-mm-sw-update]');
  const later = b.querySelector('[data-mm-sw-later]');
  assert.ok(upd && upd.textContent.length > 0, 'update action present');
  assert.ok(later && later.textContent.length > 0, 'later action present');
});
test('banner: dismissed banner is removed', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.showBanner();
  s.ctrl.dismiss();
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('banner: no duplicate banner when shown twice', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.showBanner();
  s.ctrl.showBanner();
  let count = 0;
  walk(s.doc.body, (c) => { if (c.id === 'mm-sw-update-banner') count++; });
  assert.strictEqual(count, 1);
});
test('banner: safe-area styling present in the injected CSS', () => {
  assert.ok(SWRegister.BANNER_CSS.includes('env(safe-area-inset-bottom'), 'CSS accounts for safe area');
});

// ── F. Accept flow ───────────────────────────────────────────────────────────

test('accept: sends exactly {type:"SKIP_WAITING"} once despite repeated clicks', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  btn.click();
  assert.strictEqual(s.worker.posted.length, 1);
  assert.deepStrictEqual(s.worker.posted[0], { type: 'SKIP_WAITING' });
  assert.strictEqual(btn.disabled, true, 'button disabled after accept');
  assert.strictEqual(s.reload.count, 0, 'no immediate reload');
});
test('accept: reload happens once on controllerchange, never before', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration;
  s.ctrl.acceptUpdate();
  assert.strictEqual(s.reload.count, 0, 'no reload before controllerchange');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'second controllerchange does nothing');
});
test('accept: controllerchange without accept does not reload (no auto-refresh)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration;
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0);
});
test('accept: missing waiting worker → hide banner, no reload, no throw', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.registration.waiting = null; // became stale
  assert.doesNotThrow(() => s.ctrl.acceptUpdate());
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'stale banner hidden');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0);
});
test('accept: postMessage throw is contained', () => {
  const s = setup({ controller: true, waiting: true });
  s.worker._postThrows = true;
  s.ctrl._state.registration = s.registration;
  assert.doesNotThrow(() => s.ctrl.acceptUpdate());
});
test('accept: malformed waiting worker is safe', () => {
  const s = setup({ controller: true });
  s.registration.waiting = {}; // no postMessage
  s.ctrl._state.registration = s.registration;
  assert.doesNotThrow(() => s.ctrl.acceptUpdate());
});

// ── F2. Accept rollback on postMessage failure ───────────────────────────────

test('rollback: successful post commits accepted state + marker + disabled button', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(s.worker.posted.length, 1);
  assert.deepStrictEqual(s.worker.posted[0], { type: 'SKIP_WAITING' });
  assert.strictEqual(s.ctrl._state.accepted, true, 'accepted committed after the call');
  assert.strictEqual(s.storage._map[SS_KEY], '1', 'marker written');
  assert.strictEqual(btn.disabled, true, 'button stays disabled');
});
test('rollback: synchronous postMessage throw fully rolls back (retryable)', () => {
  const s = setup({ controller: true, waiting: true });
  s.worker._postThrows = true;
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(s.ctrl._state.accepted, false, 'accepted reset');
  assert.ok(!(SS_KEY in s.storage._map), 'marker cleared');
  assert.strictEqual(btn.disabled, false, 'button re-enabled');
  assert.ok(!('aria-disabled' in btn._attrs), 'aria-disabled removed');
  assert.ok(s.doc.getElementById('mm-sw-update-banner'), 'banner kept for retry');
});
test('rollback: failed post + later controllerchange does NOT reload', () => {
  const s = setup({ controller: true, waiting: true });
  s.worker._postThrows = true;
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0, 'no reload after a failed acceptance');
});
test('rollback: retry after failure posts once and later reloads once', () => {
  const s = setup({ controller: true, waiting: true });
  s.worker._postThrows = true;
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();                 // fails → rolled back
  s.worker._postThrows = false;
  btn.click();                 // retry succeeds
  assert.strictEqual(s.worker.posted.length, 1);
  assert.strictEqual(s.ctrl._state.accepted, true);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'still only one reload');
});
test('rollback: missing waiting worker leaves no accepted state or marker', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.storage._map[SS_KEY] = '1';       // pretend a stale marker exists
  s.registration.waiting = null;
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.ctrl._state.accepted, false);
  assert.ok(!(SS_KEY in s.storage._map), 'stale marker cleared');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'stale banner hidden');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0);
});
test('rollback: malformed worker (no postMessage) leaves no accepted state or marker', () => {
  const s = setup({ controller: true });
  s.registration.waiting = {};        // no postMessage
  s.ctrl._state.registration = s.registration;
  s.storage._map[SS_KEY] = '1';
  assert.doesNotThrow(() => s.ctrl.acceptUpdate());
  assert.strictEqual(s.ctrl._state.accepted, false);
  assert.ok(!(SS_KEY in s.storage._map));
});
test('rollback: duplicate successful clicks still send exactly once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); btn.click(); btn.click();
  assert.strictEqual(s.worker.posted.length, 1);
  assert.deepStrictEqual(s.worker.posted[0], { type: 'SKIP_WAITING' });
});

// ── F3. Bottom-control clearance ─────────────────────────────────────────────

test('clearance: no fixed control → base placement (0)', () => {
  const s = setup({ controller: true, waiting: true });
  assert.strictEqual(s.ctrl.measureBottomClearance(), 0);
  s.ctrl.showBanner();
  const b = s.doc.getElementById('mm-sw-update-banner');
  assert.strictEqual(b.style._p['--mm-sw-bottom-clearance'], '0px');
});
test('clearance: bottom nav / done-bar present → banner clears it', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  bottomControl(s.doc, 'done-bar', { top: 720, bottom: 800, left: 0, right: 400, width: 400, height: 80 });
  assert.strictEqual(s.ctrl.measureBottomClearance(), 80);
});
test('clearance: workout rest strip present → banner clears it', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  bottomControl(s.doc, 'rest-strip', { top: 700, bottom: 776, left: 0, right: 300, width: 300, height: 76 });
  assert.strictEqual(s.ctrl.measureBottomClearance(), 100);
});
test('clearance: both present → clears the taller/topmost occupied region', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  bottomControl(s.doc, 'done-bar', { top: 730, bottom: 800, width: 400, height: 70 });   // region 70
  bottomControl(s.doc, 'rest-strip', { top: 690, bottom: 766, width: 300, height: 76 });  // region 110
  assert.strictEqual(s.ctrl.measureBottomClearance(), 110);
});
test('clearance: hidden / zero-height / off-screen controls are ignored', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  bottomControl(s.doc, 'rest-strip', { top: 0, bottom: 0, width: 0, height: 0 });         // zero-height
  bottomControl(s.doc, 'done-bar', { top: 900, bottom: 980, width: 400, height: 80 });    // translated off-screen below
  assert.strictEqual(s.ctrl.measureBottomClearance(), 0);
});
test('clearance: full-screen overlay (modal) is ignored', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  bottomControl(s.doc, 'done-bar', { top: 0, bottom: 800, width: 400, height: 800 });
  assert.strictEqual(s.ctrl.measureBottomClearance(), 0);
});
test('clearance: malformed measurement / missing window does not throw', () => {
  const s = setup({ controller: true, waiting: true });
  const el = bottomControl(s.doc, 'done-bar', null);
  el.getBoundingClientRect = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => s.ctrl.measureBottomClearance());
  const s2 = SWRegister.createUpdateController({ navigator: {}, document: s.doc, window: null });
  assert.strictEqual(s2.measureBottomClearance(), 0);
});
test('clearance: safe-area spacing remains present alongside clearance', () => {
  assert.ok(SWRegister.BANNER_CSS.includes('env(safe-area-inset-bottom'), 'safe-area preserved');
  assert.ok(SWRegister.BANNER_CSS.includes('--mm-sw-bottom-clearance'), 'clearance variable used');
});
test('clearance: banner no longer relies on unconditional bottom:0', () => {
  assert.ok(!/bottom:\s*0(px)?\s*[;}]/.test(SWRegister.BANNER_CSS), 'no unconditional bottom:0');
  assert.ok(/bottom:calc\(/.test(SWRegister.BANNER_CSS), 'bottom is a calc()');
});
test('clearance: recompute on resize; no duplicate listeners or styles; buttons still work', () => {
  const s = setup({ controller: true, waiting: true, innerHeight: 800 });
  s.ctrl.showBanner();
  s.ctrl.showBanner(); // dedup no-op
  assert.strictEqual((s.win._l['resize'] || []).length, 1, 'one resize listener');
  assert.strictEqual((s.win._l['orientationchange'] || []).length, 1, 'one orientation listener');
  let styleCount = 0; walk(s.doc.head, (c) => { if (c.id === 'mm-sw-style') styleCount++; });
  assert.strictEqual(styleCount, 1, 'one style element');
  bottomControl(s.doc, 'done-bar', { top: 720, bottom: 800, width: 400, height: 80 });
  s.win._emit('resize', {});
  const b = s.doc.getElementById('mm-sw-update-banner');
  assert.strictEqual(b.style._p['--mm-sw-bottom-clearance'], '80px', 'recomputed on resize');
  // banner is still persistent and its actions still work
  assert.ok(b.querySelector('[data-mm-sw-update]'));
  assert.ok(b.querySelector('[data-mm-sw-later]'));
});
test('clearance: no polling / interval introduced', () => {
  assert.ok(!/setInterval\s*\(/.test(CODE) && !/setTimeout\s*\(/.test(CODE));
});

// ── G. Session reload guard ──────────────────────────────────────────────────

const SS_KEY = 'mm_sw_update_accepted';
test('session: accepted transition marker is written', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration;
  s.ctrl.acceptUpdate();
  assert.strictEqual(s.storage._map[SS_KEY], '1');
});
test('session: marker consumed on next load prevents a same-session reload loop', () => {
  const s = setup({ controller: true });
  s.storage._map[SS_KEY] = '1';       // simulate return from a controlled reload
  s.ctrl.start();
  assert.ok(!(SS_KEY in s.storage._map), 'marker consumed');
  s.ctrl.handleControllerChange();     // a stray controllerchange must not reload
  assert.strictEqual(s.reload.count, 0);
});
test('session: a fresh accept after consume still reloads (future update works)', () => {
  const s = setup({ controller: true, waiting: true });
  s.storage._map[SS_KEY] = '1';
  s.ctrl.start();                       // consume → hasReloaded guard set
  s.ctrl._state.registration = s.registration;
  s.ctrl.acceptUpdate();                // explicit accept resets the guard
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'legitimate future update still reloads');
});
test('session: sessionStorage unavailable → no crash', () => {
  const s = setup({ controller: true, waiting: true, storage: null });
  s.ctrl._state.registration = s.registration;
  assert.doesNotThrow(() => { s.ctrl.start(); s.ctrl.acceptUpdate(); s.ctrl.handleControllerChange(); });
});
test('session: throwing storage get/set/remove → no crash', () => {
  const s = setup({ controller: true, waiting: true, storageOpts: { throwGet: true, throwSet: true, throwRemove: true } });
  s.ctrl._state.registration = s.registration;
  assert.doesNotThrow(() => { s.ctrl.start(); s.ctrl.acceptUpdate(); });
});
test('session: no localStorage usage in source', () => {
  assert.ok(!/localStorage/.test(CODE), 'no localStorage');
});

// ── H. Dismissal ─────────────────────────────────────────────────────────────

test('dismiss: sends no message, no reload, hides banner', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const later = s.doc.getElementById('mm-sw-later-btn');
  later.click();
  assert.strictEqual(s.worker.posted.length, 0, 'no SKIP_WAITING');
  assert.strictEqual(s.reload.count, 0, 'no reload');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'banner hidden');
});
test('dismiss: same transition does not immediately re-render', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration; // waiting present + controller → would show
  s.ctrl.showBanner();
  s.ctrl.dismiss();
  s.ctrl.showUpdateIfReady(); // blocked by the dismissed guard, not by missing registration
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});
test('dismiss: a new page execution may prompt again (state is per-instance)', () => {
  const s1 = setup({ controller: true, waiting: true });
  s1.ctrl.showBanner(); s1.ctrl.dismiss();
  const s2 = setup({ controller: true, waiting: true }); // fresh execution
  s2.ctrl.onRegistered(s2.registration);
  assert.ok(s2.doc.getElementById('mm-sw-update-banner'), 'new execution prompts again');
});

// ── I. Update checks ─────────────────────────────────────────────────────────

test('update: registration.update() called safely after registration', () => {
  const s = setup({ controller: true });
  s.ctrl.onRegistered(s.registration);
  assert.strictEqual(s.registration._updateCalls, 1);
});
test('update: rejected update() is swallowed', async () => {
  const s = setup({ controller: true, updateRejects: true });
  assert.doesNotThrow(() => s.ctrl.onRegistered(s.registration));
  await tick();
});
test('update: synchronous update() throw is swallowed', () => {
  const s = setup({ controller: true, updateThrows: true });
  assert.doesNotThrow(() => s.ctrl.onRegistered(s.registration));
});
test('update: hidden visibility does not trigger a check', () => {
  const s = setup({ controller: true });
  s.ctrl._state.registration = s.registration;
  s.doc.visibilityState = 'hidden';
  s.ctrl.handleVisibility();
  assert.strictEqual(s.registration._updateCalls, 0);
});
test('update: foreground check is debounced (no storm)', () => {
  const s = setup({ controller: true });
  s.ctrl._state.registration = s.registration;
  s.doc.visibilityState = 'visible';
  s.ctrl.handleVisibility();               // first → checks
  s.ctrl.handleVisibility();               // same now → debounced
  assert.strictEqual(s.registration._updateCalls, 1);
  s.nowRef.t += 61000;                      // beyond the window
  s.ctrl.handleVisibility();
  assert.strictEqual(s.registration._updateCalls, 2);
});

// ── J. Static source scans ───────────────────────────────────────────────────

const FORBIDDEN = [
  ['auto skipWaiting()', /skipWaiting\s*\(/],
  ['clients.claim(', /clients\s*\.\s*claim\s*\(/],
  ['setInterval', /setInterval\s*\(/],
  ['setTimeout', /setTimeout\s*\(/],
  ['offline', /offline/i],
  ['/api/ caching', /\/api\//],
  ['supabase', /supabase/i],
  ['localStorage', /localStorage/],
  ['access_token', /access_token/],
  ['Authorization header', /Authorization/],
  ['caches.', /\bcaches\s*\./],
  ['alert(', /\balert\s*\(/],
  ['confirm(', /\bconfirm\s*\(/],
  ['beforeinstallprompt', /beforeinstallprompt/],
  ['push listener', /addEventListener\(\s*['"]push['"]/],
  ['notification', /\bNotification\b/],
  ['sync listener', /addEventListener\(\s*['"](periodic)?sync['"]/]
];
for (const [label, re] of FORBIDDEN) {
  test(`source scan: no ${label}`, () => {
    assert.ok(!re.test(CODE), `sw-register.js must not contain ${label}`);
  });
}

test('source scan: reload is only reachable from controllerchange, not registration', () => {
  // The only reload() call sits in handleControllerChange (guarded by accept).
  const chunk = CODE.slice(CODE.indexOf('function handleControllerChange'), CODE.indexOf('return {'));
  assert.ok(/reload\(\)/.test(chunk), 'reload lives in handleControllerChange');
  const startChunk = CODE.slice(CODE.indexOf('function start'), CODE.indexOf('function onRegistered'));
  assert.ok(!/reload\(\)/.test(startChunk), 'no reload during registration');
});

test('source scan: SKIP_WAITING message shape is exact', () => {
  assert.ok(/postMessage\(\s*\{\s*type:\s*'SKIP_WAITING'\s*\}\s*\)/.test(SRC));
});

// ── vercel.json revalidation headers ─────────────────────────────────────────

test('vercel.json: sw.js, sw-policy.js, sw-runtime.js get revalidation headers', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const src of ['/sw.js', '/sw-policy.js', '/sw-runtime.js']) {
    const rule = vercel.headers.find((h) => h.source === src);
    assert.ok(rule, `${src} has a headers rule`);
    const cc = rule.headers.find((h) => h.key === 'Cache-Control');
    assert.ok(cc, `${src} sets Cache-Control`);
    assert.ok(/no-cache/.test(cc.value) && /no-store/.test(cc.value) && /must-revalidate/.test(cc.value),
      `${src} is revalidation-safe (${cc.value})`);
  }
});

// ── HTML integration scope ───────────────────────────────────────────────────

test('html: exactly the approved authenticated pages load sw-register.js', () => {
  const included = ['app.html', 'nutrition.html', 'workout.html', 'workout-history.html',
    'workout-complete.html', 'weight-history.html', 'onboarding.html'];
  const excluded = ['auth.html', 'reset-password.html', 'index.html', 'store.html',
    'calculator.html', 'get-fit-guide.html', 'program-fat-loss.html',
    'program-muscle-gain.html', 'program-glute-builder.html'];
  const re = /<script[^>]+src="sw-register\.js"[^>]*><\/script>/;
  for (const p of included) assert.match(fs.readFileSync(path.join(ROOT, p), 'utf8'), re, `${p} loads sw-register.js`);
  for (const p of excluded) assert.ok(!re.test(fs.readFileSync(path.join(ROOT, p), 'utf8')), `${p} does NOT load sw-register.js`);
});

test('html: no inline navigator.serviceWorker.register in any page', () => {
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    assert.ok(!/navigator\s*\.\s*serviceWorker\s*\.\s*register/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
      `${f} has no inline registration`);
  }
});
