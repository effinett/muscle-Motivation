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
    state: 'installing', posted: [], ports: [],
    postMessage(m, transfer) {
      if (w._postThrows) throw new Error('post');
      w.posted.push(m);
      w.ports.push(transfer && transfer.length ? transfer[0] : null);
    },
    // Simulate the real worker replying through the transferred port (ports[0]).
    _reply(type, i) {
      const port = w.ports[i == null ? w.ports.length - 1 : i];
      if (port && typeof port.postMessage === 'function') port.postMessage({ type: type });
    },
    _sendAccepted(i) { w._reply('SKIP_WAITING_ACCEPTED', i); },
    _sendAck(i) { w._reply('SKIP_WAITING_ACCEPTED', i); },   // alias — the accepted handshake
    _sendError(i) { w._reply('SKIP_WAITING_ERROR', i); },
    _setState(s) { w.state = s; w._emit('statechange', {}); }
  });
  return w;
}

// Entangled MessageChannel: port2.postMessage(x) delivers x to port1's listeners.
function fakeChannel() {
  const mk = () => ({
    _l: {}, onmessage: null, _peer: null, _closed: false,
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener(t, fn) { if (this._l[t]) { const i = this._l[t].indexOf(fn); if (i >= 0) this._l[t].splice(i, 1); } },
    start() { this._started = true; },
    close() { this._closed = true; },
    postMessage(m) { if (this._peer) this._peer._deliver(m); },
    _deliver(data) {
      const ev = { data };
      if (typeof this.onmessage === 'function') this.onmessage(ev);
      (this._l['message'] || []).slice().forEach((fn) => fn(ev));
    }
  });
  const port1 = mk(); const port2 = mk();
  port1._peer = port2; port2._peer = port1;
  return { port1, port2 };
}
function fakeTimers() {
  const timers = new Map(); const all = new Map(); let id = 0;
  return {
    setTimer(fn) { const t = ++id; timers.set(t, fn); all.set(t, fn); return t; },
    clearTimer(t) { timers.delete(t); },
    lastId() { return id; },
    fire(t) { const fn = timers.get(t); if (fn) { timers.delete(t); fn(); } },
    // fire a captured callback even after it was cleared, to exercise the
    // attempt-identity guard against an already-dispatched stale callback.
    fireStale(t) { const fn = all.get(t); if (fn) fn(); },
    fireAll() { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); },
    pending() { return timers.size; }
  };
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
    removeEventListener(t, fn) { if (this._l[t]) { const i = this._l[t].indexOf(fn); if (i >= 0) this._l[t].splice(i, 1); } },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); },
    click() { if (this.disabled) return; this._emit('click', {}); },
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
  const timers = fakeTimers();
  // noChannel: constructor returns a portless object → controller falls back to
  // posting without a transferred port (never Node's real global MessageChannel).
  const Channel = opts.noChannel ? function () { return null; } : function () { return fakeChannel(); };
  const ctrl = SWRegister.createUpdateController({
    navigator, document: doc, window: win, storage,
    reload: reload.fn, console: consoleSpy, now() { return nowRef.t; },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, MessageChannel: Channel
  });
  return { ctrl, navigator, container, registration, worker, doc, win, storage, reload, consoleSpy, nowRef, timers };
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

// ── F2. Acknowledged, retryable activation (Checkpoint 4 first-click defect) ──
// A synchronous postMessage return is NOT proof of worker receipt, so the client
// transfers a MessagePort and waits for the worker's SKIP_WAITING_ACK (or a
// controllerchange). Success commits only on ack/controllerchange; a sync throw
// or a bounded ack timeout rolls back and permits exactly one deliberate retry.

test('ack: first click sends exactly one command with a transferred MessagePort', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(s.worker.posted.length, 1);
  assert.deepStrictEqual(s.worker.posted[0], { type: 'SKIP_WAITING' });
  const port = s.worker.ports[0];
  assert.ok(port && typeof port.postMessage === 'function', 'a MessagePort was transferred');
  assert.strictEqual(btn.disabled, true, 'button truly disabled while requesting');
  assert.strictEqual(btn.textContent, 'Updating…', 'progress copy shown');
});

test('ack: synchronous postMessage return alone does NOT mark success', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.ctrl._state.requesting, true, 'still requesting (awaiting ack)');
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'not accepted on sync return');
  assert.ok(!(SS_KEY in s.storage._map), 'no session marker before ack');
});

test('ack: acknowledgment marks accepted, writes the marker, keeps button disabled', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendAck();                 // worker acks through the transferred port
  assert.strictEqual(s.ctrl._state.commandAccepted, true, 'accepted on ack');
  assert.strictEqual(s.ctrl._state.requesting, false);
  assert.strictEqual(s.storage._map[SS_KEY], '1', 'session marker written on ack');
  assert.strictEqual(btn.disabled, true, 'button stays disabled awaiting controllerchange');
  assert.strictEqual(s.reload.count, 0, 'no reload before controllerchange');
});

test('ack: controllerchange after ack reloads exactly once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAck();
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'second controllerchange does nothing');
});

test('ack: controllerchange BEFORE ack (browser ordering) still reloads once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click(); // requesting, no ack yet
  s.ctrl.handleControllerChange();                   // activation ordered before ack
  assert.strictEqual(s.reload.count, 1, 'outstanding request → one reload');
  assert.strictEqual(s.storage._map[SS_KEY], '1', 'marker set for post-reload consumption');
});

test('ack: timeout re-enables the button and clears requesting/accepted/marker', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(s.timers.pending(), 1, 'one bounded ack timeout scheduled');
  s.timers.fireAll();                  // ack never arrived → timeout fires
  assert.strictEqual(s.ctrl._state.requesting, false, 'requesting cleared');
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'accepted cleared');
  assert.ok(!(SS_KEY in s.storage._map), 'marker cleared');
  assert.strictEqual(btn.disabled, false, 'button re-enabled for retry');
  assert.ok(!('aria-disabled' in btn._attrs), 'aria-disabled removed');
  assert.strictEqual(btn.textContent, 'Update now', 'copy restored');
  assert.ok(s.doc.getElementById('mm-sw-update-banner'), 'banner kept');
  assert.strictEqual(s.reload.count, 0, 'timeout never reloads');
});

test('ack: retry after timeout sends exactly one new command, then reloads once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();                         // first attempt
  s.timers.fireAll();                  // timeout → rollback, button re-enabled
  assert.strictEqual(s.worker.posted.length, 1);
  btn.click();                         // one deliberate retry
  assert.strictEqual(s.worker.posted.length, 2, 'exactly one new command on retry');
  s.worker._sendAck();                 // worker acks the retry
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'successful retry reloads once');
});

test('ack: no automatic retries — the command timeout fires once and never re-posts', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.timers.pending(), 1, 'one command-response timeout scheduled');
  s.timers.fireAll();                        // command timeout fires → rollback (no grace)
  assert.strictEqual(s.timers.pending(), 0, 'no rescheduled timer (no poll, no grace)');
  assert.strictEqual(s.worker.posted.length, 1, 'no automatic re-post on timeout');
});

test('ack: duplicate clicks while requesting do nothing (single command)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  btn._emit('click', {});              // bypass disabled — still blocked by requesting guard
  btn._emit('click', {});
  assert.strictEqual(s.worker.posted.length, 1, 'exactly one command while requesting');
});

test('ack: button is NOT permanently detached before acknowledgment', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.timers.fireAll();                  // timeout rollback (no ack)
  btn.click();                         // handler still attached → retry works
  assert.strictEqual(s.worker.posted.length, 2, 'handler survived until a real resolution');
});

test('ack: handler IS detached after acknowledgment (one-shot only post-ack)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendAck();
  btn._emit('click', {});              // bypass disabled — handler removed after ack
  btn._emit('click', {});
  assert.strictEqual(s.worker.posted.length, 1, 'no re-post after acknowledgment');
});

test('ack: synchronous postMessage throw rolls back immediately (retryable)', () => {
  const s = setup({ controller: true, waiting: true });
  s.worker._postThrows = true;
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  assert.strictEqual(s.ctrl._state.requesting, false, 'in-flight lock released');
  assert.ok(!(SS_KEY in s.storage._map), 'marker cleared');
  assert.strictEqual(btn.disabled, false, 'button re-enabled');
  assert.strictEqual(btn.textContent, 'Update now', 'copy restored');
  assert.strictEqual(s.timers.pending(), 0, 'no ack timeout scheduled on sync throw');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0, 'failed request never authorizes a reload');
});

test('ack: the LIVE registration.waiting is re-read immediately before posting', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const fresh = makeWorker();
  s.registration.waiting = fresh;      // waiting worker changed after the banner showed
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.worker.posted.length, 0, 'stale worker not messaged');
  assert.strictEqual(fresh.posted.length, 1, 'current waiting worker messaged');
});

test('ack: missing waiting worker leaves no accepted state or marker', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.storage._map[SS_KEY] = '1';
  s.registration.waiting = null;
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  assert.strictEqual(s.ctrl._state.requesting, false);
  assert.ok(!(SS_KEY in s.storage._map), 'stale marker cleared');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'stale banner hidden');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0);
});

test('ack: malformed worker (no postMessage) leaves no accepted state or marker', () => {
  const s = setup({ controller: true });
  s.registration.waiting = {};
  s.ctrl._state.registration = s.registration;
  s.storage._map[SS_KEY] = '1';
  assert.doesNotThrow(() => s.ctrl.acceptUpdate());
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  assert.ok(!(SS_KEY in s.storage._map));
});

test('ack: no MessageChannel available → still posts; controllerchange completes it', () => {
  const s = setup({ controller: true, waiting: true, noChannel: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.worker.posted.length, 1, 'command posted even without a channel');
  assert.strictEqual(s.worker.ports[0], null, 'no port transferred');
  s.ctrl.handleControllerChange();     // completes via controllerchange (requesting outstanding)
  assert.strictEqual(s.reload.count, 1);
});

test('ack: duplicate controllers attach only one active handler → one command', () => {
  const s = setup({ controller: true, waiting: true });
  const ctrl2 = SWRegister.createUpdateController({
    navigator: s.navigator, document: s.doc, window: s.win, storage: s.storage,
    reload: s.reload.fn, now: () => s.nowRef.t,
    setTimer: s.timers.setTimer, clearTimer: s.timers.clearTimer, MessageChannel: function () { return fakeChannel(); }
  });
  ctrl2._state.registration = s.registration;
  s.ctrl.onRegistered(s.registration);
  ctrl2.showUpdateIfReady();           // finds the existing banner, no rebind
  let banners = 0;
  walk(s.doc.body, (c) => { if (c.id === 'mm-sw-update-banner') banners++; });
  assert.strictEqual(banners, 1, 'only one banner');
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.worker.posted.length, 1, 'exactly one command despite two controllers');
});

test('ack: a future legitimate update remains possible after a timed-out attempt', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.timers.fireAll();     // first attempt times out → rollback (+grace)
  // A genuinely new waiting worker later; the same banner/button still works.
  const next = makeWorker(); s.registration.waiting = next;
  btn.click();
  assert.strictEqual(next.posted.length, 1, 'new update can still be requested');
  next._sendAck();
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
});

// ── F2c. Dismissal ("Later") during an in-flight request ──────────────────────

test('later: dismiss while requesting clears requesting/accepted and all reload eligibility', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();      // requesting, awaiting ack
  assert.strictEqual(s.ctrl._state.requesting, true);
  s.ctrl.dismiss();                                      // "Later"
  assert.strictEqual(s.ctrl._state.requesting, false, 'requesting cleared');
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'commandAccepted cleared');
  assert.ok(!(SS_KEY in s.storage._map), 'session marker removed');
  assert.strictEqual(s.timers.pending(), 0, 'command + activation timers cleared');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'banner removed');
});

test('later: dismiss while requesting sends no extra message and blocks a later controllerchange reload', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  const postsAfterClick = s.worker.posted.length;
  s.ctrl.dismiss();
  assert.strictEqual(s.worker.posted.length, postsAfterClick, 'no extra SKIP_WAITING on Later');
  s.ctrl.handleControllerChange();                       // late change from the cancelled attempt
  assert.strictEqual(s.reload.count, 0, 'cancelled attempt cannot reload');
});

test('later: dismiss closes the ack channel (a late ack cannot re-accept)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.ctrl.dismiss();
  s.worker._sendAck();                                   // late ack from the cancelled attempt
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'closed channel + stale id → no re-accept');
  assert.ok(!(SS_KEY in s.storage._map));
});

test('later: a future page execution can still prompt for the still-waiting worker', () => {
  const s1 = setup({ controller: true, waiting: true });
  s1.ctrl.onRegistered(s1.registration);
  s1.doc.getElementById('mm-sw-update-btn').click();
  s1.ctrl.dismiss();
  const s2 = setup({ controller: true, waiting: true }); // fresh page execution, worker still waiting
  s2.ctrl.onRegistered(s2.registration);
  assert.ok(s2.doc.getElementById('mm-sw-update-banner'), 'new execution prompts again');
});

// ── F2d. Per-attempt identity (generation guard) ──────────────────────────────

test('identity: each new request bumps attemptId; dismiss and controllerchange also bump it', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  assert.strictEqual(s.ctrl._state.attemptId, 0);
  btn.click();
  assert.strictEqual(s.ctrl._state.attemptId, 1, 'request bumps attemptId');
  s.ctrl.dismiss();
  assert.strictEqual(s.ctrl._state.attemptId, 2, 'dismiss bumps attemptId');
});

test('identity: a late ACCEPTED from a superseded attempt cannot affect a newer attempt', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();                       // attempt 1 (worker.ports[0])
  s.timers.fireAll();                // attempt 1 command-times-out → rollback (bumps id)
  btn.click();                       // attempt 2 (fresh channel/id)
  s.worker._sendAccepted(0);         // LATE ACCEPTED delivered to attempt 1's (closed) port
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'attempt 1 response ignored');
  assert.strictEqual(s.ctrl._state.requesting, true, 'attempt 2 still awaiting its own response');
  s.worker._sendAccepted(1);         // attempt 2's real ACCEPTED
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
});

test('identity: a stale command-timeout callback (dismissed attempt) is ignored by the generation guard', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  const staleTimer = s.timers.lastId();        // attempt 1's command timeout
  s.ctrl.dismiss();                            // bumps attemptId, clears the timer
  s.timers.fireStale(staleTimer);              // browser had already dispatched it
  assert.strictEqual(s.ctrl._state.requesting, false);
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0, 'stale timeout created no reload eligibility');
});

test('identity: a stale activation-timeout callback cannot affect a newer attempt', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.worker._sendAccepted();       // attempt 1 → ACCEPTED → activation timer
  const staleActivation = s.timers.lastId();
  s.ctrl.dismiss();                            // bumps id, clears the activation timer
  btn.click();                                 // attempt 2
  s.timers.fireStale(staleActivation);         // fire the old activation callback anyway
  assert.strictEqual(s.ctrl._state.requesting, true, 'attempt 2 untouched by the stale callback');
  s.worker._sendAccepted();                    // attempt 2 ACCEPTED
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
});

test('identity: retry after a command timeout creates a fresh id, channel, and command timeout', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.timers.fireAll();             // attempt 1 command-times-out → rollback (no timer left)
  assert.strictEqual(s.timers.pending(), 0, 'no lingering timer after rollback');
  const idBefore = s.ctrl._state.attemptId;
  btn.click();                                 // retry
  assert.strictEqual(s.ctrl._state.attemptId, idBefore + 1, 'fresh attemptId');
  assert.strictEqual(s.worker.ports.length, 2, 'fresh channel/port transferred');
  assert.strictEqual(s.timers.pending(), 1, 'fresh command timeout');
});

// ── F2e. Post-ACCEPTED activation timeout (30s; replaces the grace window) ─────

test('activation: controllerchange after ACCEPTED reloads exactly once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();                    // ACCEPTED → activation-wait
  assert.strictEqual(s.timers.pending(), 1, 'one activation timeout scheduled');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'controllerchange reloads once');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'never twice');
});

test('activation: the 30s activation timeout restores the button and clears state (no reload)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.worker._sendAccepted();       // ACCEPTED → activation-wait
  assert.strictEqual(btn.disabled, true, 'disabled while awaiting activation');
  s.timers.fireAll();                          // activation timeout fires
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'commandAccepted cleared');
  assert.strictEqual(s.ctrl._state.requesting, false);
  assert.ok(!(SS_KEY in s.storage._map), 'marker cleared');
  assert.strictEqual(btn.disabled, false, 'button re-enabled');
  assert.strictEqual(btn.textContent, 'Update now', 'copy restored');
  assert.ok(s.doc.getElementById('mm-sw-update-banner'), 'banner kept');
  assert.strictEqual(s.reload.count, 0, 'activation timeout never reloads');
  assert.strictEqual(s.timers.pending(), 0, 'no rescheduled timer (no poll)');
});

test('activation: controllerchange AFTER the activation timeout does not reload', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();
  s.timers.fireAll();                          // activation timeout → rollback (bumps id)
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0, 'no reload after the activation window closed');
});

test('activation: Later during activation-wait cancels reload eligibility', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();
  s.ctrl.dismiss();                            // Later while awaiting activation
  assert.strictEqual(s.timers.pending(), 0, 'activation timer cleared');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0);
});

test('activation: retry after activation timeout replaces the attempt cleanly and can reload once', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.worker._sendAccepted(); s.timers.fireAll();   // attempt 1 accepted → activation timeout → rollback
  btn.click();                                                 // retry
  assert.strictEqual(s.ctrl._state.requesting, true, 'fresh attempt requesting');
  s.worker._sendAccepted();
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 1, 'reloads once for the fresh attempt');
});

test('activation: no automatic resend across the whole timeout path', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();
  s.timers.fireAll();                          // activation timeout
  assert.strictEqual(s.worker.posted.length, 1, 'no automatic re-post');
  assert.strictEqual(s.timers.pending(), 0, 'no interval / poll');
});

// ── F2f. SKIP_WAITING_ERROR handling (skipWaiting threw/rejected) ──────────────

test('error: ACCEPTED enters activation-wait, keeps the button disabled, and never reloads by itself', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendAccepted();
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
  assert.strictEqual(btn.disabled, true, 'ACCEPTED keeps button disabled awaiting controllerchange');
  assert.strictEqual(btn.textContent, 'Updating…', 'copy stays Updating… during activation-wait');
  assert.strictEqual(s.reload.count, 0, 'ACCEPTED itself never reloads');
});

test('error: SKIP_WAITING_ERROR rolls back requesting/accepted, clears marker, restores button', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendError();                         // worker reports skipWaiting threw/rejected
  assert.strictEqual(s.ctrl._state.requesting, false, 'requesting cleared');
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'accepted cleared');
  assert.ok(!(SS_KEY in s.storage._map), 'session marker cleared');
  assert.strictEqual(btn.disabled, false, 'button re-enabled');
  assert.ok(!('aria-disabled' in btn._attrs), 'aria-disabled removed');
  assert.strictEqual(btn.textContent, 'Update now', 'copy restored');
  assert.ok(s.doc.getElementById('mm-sw-update-banner'), 'banner kept visible');
});

test('error: SKIP_WAITING_ERROR rolls back immediately and never reloads', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendError();
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  assert.strictEqual(s.timers.pending(), 0, 'no command/activation timer left running');
  s.ctrl.handleControllerChange();
  assert.strictEqual(s.reload.count, 0, 'a failed request can never authorize a reload');
});

test('error: retry after ERROR sends exactly one fresh request (fresh channel + attemptId)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  const idAfter1 = s.ctrl._state.attemptId;
  s.worker._sendError();                         // attempt 1 failed → retryable
  btn.click();                                   // one deliberate retry
  assert.strictEqual(s.worker.posted.length, 2, 'exactly one fresh command');
  // attempt 1 ERROR rollback bumps the id, and the retry bumps it again.
  assert.strictEqual(s.ctrl._state.attemptId, idAfter1 + 2, 'fresh attemptId');
  assert.strictEqual(s.worker.ports.length, 2, 'fresh channel/port');
  s.worker._sendAccepted();                       // retry accepted
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
});

test('error: a stale ERROR from attempt 1 cannot affect attempt 2', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();                                   // attempt 1 (ports[0])
  s.timers.fireAll();                            // attempt 1 command-times-out → rollback
  btn.click();                                   // attempt 2 (ports[1])
  s.worker._sendError(0);                        // LATE error from attempt 1's (closed) port
  assert.strictEqual(s.ctrl._state.requesting, true, 'attempt 2 unaffected by stale error');
  s.worker._sendAccepted(1);                     // attempt 2 real ACCEPTED
  assert.strictEqual(s.ctrl._state.commandAccepted, true);
});

test('error: a stale ACK from attempt 1 cannot affect attempt 2', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click(); s.timers.fireAll();               // attempt 1 → grace
  btn.click();                                   // attempt 2
  s.worker._sendAck(0);                          // LATE ack from attempt 1
  assert.strictEqual(s.ctrl._state.commandAccepted, false, 'attempt 1 ack ignored');
  assert.strictEqual(s.ctrl._state.requesting, true, 'attempt 2 still awaiting its own response');
});

test('error: an unknown response message does nothing', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._reply('SOMETHING_ELSE');             // unknown response type
  assert.strictEqual(s.ctrl._state.requesting, true, 'still awaiting a real ACK/ERROR');
  assert.strictEqual(s.ctrl._state.commandAccepted, false);
  assert.strictEqual(s.reload.count, 0);
});

// ── F2g. Preview-only client diagnostics ([MM SW CLIENT]) ─────────────────────

function diagController(hostname, search) {
  const worker = makeWorker();
  const registration = makeRegistration({ waiting: worker });
  const container = makeContainer({ controller: {}, registration });
  const doc = fakeDoc();
  const timers = fakeTimers();
  const logs = [];
  const con = { log: (m) => logs.push(m), warn: () => {} };
  const ctrl = SWRegister.createUpdateController({
    navigator: { serviceWorker: container }, document: doc, window: fakeWindow(800),
    location: { hostname, search, protocol: 'https:' }, storage: fakeStorage(),
    reload: () => {}, console: con, now: () => 1000,
    setTimer: timers.setTimer, clearTimer: timers.clearTimer, MessageChannel: function () { return fakeChannel(); }
  });
  return { ctrl, doc, worker, registration, logs, timers };
}

test('client-diag: disabled on the production apex (no logs)', () => {
  const d = diagController('musclemotivation.fit', '');
  d.ctrl.onRegistered(d.registration);
  d.doc.getElementById('mm-sw-update-btn').click();
  d.worker._sendAck();
  assert.strictEqual(d.logs.length, 0, 'no client diagnostics on production');
});

test('client-diag: on Vercel requires the ?mm_sw_preview=1 override', () => {
  const off = diagController('mm-x.vercel.app', '');               // no override
  off.ctrl.onRegistered(off.registration);
  off.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(off.logs.length, 0, 'no logs without the preview override');

  const on = diagController('mm-x.vercel.app', '?mm_sw_preview=1'); // with override
  on.ctrl.onRegistered(on.registration);
  on.doc.getElementById('mm-sw-update-btn').click();
  assert.ok(on.logs.some((l) => l.indexOf('[MM SW CLIENT] update_click') === 0), 'logs enabled with override');
});

test('client-diag: enabled on localhost', () => {
  const d = diagController('localhost', '');
  d.ctrl.onRegistered(d.registration);
  d.doc.getElementById('mm-sw-update-btn').click();
  assert.ok(d.logs.some((l) => l.indexOf('[MM SW CLIENT] postmessage_sent') === 0));
});

test('client-diag: only fixed event names + attemptId (no query/user/private data)', () => {
  const d = diagController('mm-x.vercel.app', '?mm_sw_preview=1&secret=shhh');
  d.ctrl.onRegistered(d.registration);
  const btn = d.doc.getElementById('mm-sw-update-btn');
  btn.click(); d.worker._sendError(); btn.click(); d.worker._sendAck(); d.ctrl.handleControllerChange();
  assert.ok(d.logs.length > 0, 'some diagnostics emitted');
  for (const line of d.logs) {
    assert.match(line, /^\[MM SW CLIENT\] [a-z_]+ attempt=\d+$/, `safe fixed name only: ${line}`);
    assert.ok(line.indexOf('secret') === -1 && line.indexOf('shhh') === -1, 'no URL query contents');
  }
});

test('client-diag: diagnostics do not alter behavior (ACK still accepts + reloads once)', () => {
  const d = diagController('localhost', '');
  d.ctrl.onRegistered(d.registration);
  d.doc.getElementById('mm-sw-update-btn').click();
  d.worker._sendAck();
  assert.strictEqual(d.ctrl._state.commandAccepted, true, 'ACK behavior unchanged with diagnostics on');
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
test('clearance: no polling interval introduced (setInterval forbidden)', () => {
  // setInterval (recurring poll) stays forbidden. A single-shot setTimeout is now
  // permitted for the bounded ack timeout; the "no auto-retry" behavior is proven
  // by the acknowledged-activation tests, not by banning setTimeout.
  assert.ok(!/setInterval\s*\(/.test(CODE), 'no setInterval polling');
});

// ── G. Session reload guard ──────────────────────────────────────────────────

const SS_KEY = 'mm_sw_update_accepted';
test('session: accepted transition marker is written on acknowledgment', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl._state.registration = s.registration;
  s.ctrl.acceptUpdate();
  assert.ok(!(SS_KEY in s.storage._map), 'not written on sync post return');
  s.worker._sendAck();
  assert.strictEqual(s.storage._map[SS_KEY], '1', 'written once the worker acknowledges');
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

test('source scan: SKIP_WAITING message shape is exact (both port and fallback forms)', () => {
  assert.ok(/postMessage\(\s*\{\s*type:\s*'SKIP_WAITING'\s*\}\s*\)/.test(SRC), 'fallback (no-port) form');
  assert.ok(/postMessage\(\s*\{\s*type:\s*'SKIP_WAITING'\s*\}\s*,\s*transfer\s*\)/.test(SRC), 'port-transfer form');
  assert.ok(/SKIP_WAITING_ACCEPTED/.test(SRC), 'listens for the exact ACCEPTED response');
  assert.ok(/SKIP_WAITING_ERROR/.test(SRC), 'listens for the exact ERROR response');
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

// ── Phase 4.3.3 Checkpoint 4 — update-UX polish ──────────────────────────────
// Accessible status messaging for every user-facing disposition, plus explicit
// coverage of the states the audit mapped. No protocol/timing change.

const MSGSEL = '[data-mm-sw-message]';
function msgOf(s) {
  const b = s.doc.getElementById('mm-sw-update-banner');
  const el = b && b.querySelector ? b.querySelector(MSGSEL) : null;
  return el ? el.textContent : null;
}

test('c4/copy: ready state announces an available update in plain language', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  assert.strictEqual(msgOf(s), 'A new version of Muscle Motivation is ready.');
});

test('c4/copy: busy state announces Updating… while the attempt is in flight', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(msgOf(s), 'Updating Muscle Motivation…');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-btn').textContent, 'Updating…');
});

test('c4/copy: command timeout explains the failure and stays retryable', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.timers.fireAll();                       // no acknowledgement arrives
  assert.strictEqual(msgOf(s), 'The update didn’t start. Try again.');
  assert.strictEqual(btn.disabled, false, 'retryable');
  assert.strictEqual(btn.textContent, 'Update now');
  assert.strictEqual(s.reload.count, 0);
});

test('c4/copy: activation timeout explains the delay and stays retryable', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendAccepted();                 // ACCEPTED, then no controllerchange
  s.timers.fireAll();
  assert.strictEqual(msgOf(s), 'The update is taking longer than expected. Try again.');
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(s.reload.count, 0);
});

test('c4/copy: worker-reported error explains the failure without jargon', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.worker._sendError();
  assert.strictEqual(msgOf(s), 'We couldn’t apply the update. Try again.');
  assert.strictEqual(btn.disabled, false);
});

test('c4/copy: a synchronous postMessage failure explains the failure', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.worker._postThrows = true;
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(msgOf(s), 'We couldn’t apply the update. Try again.');
  assert.strictEqual(btn.disabled, false, 'not left stuck disabled');
});

test('c4/copy: retry after a failure clears the error message back to busy', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  s.timers.fireAll();                       // command timeout → error copy
  assert.strictEqual(msgOf(s), 'The update didn’t start. Try again.');
  btn.click();                              // deliberate retry
  assert.strictEqual(msgOf(s), 'Updating Muscle Motivation…', 'stale error cleared');
  assert.strictEqual(s.worker.posted.length, 2, 'exactly one new message per retry');
});

test('c4/copy: no service-worker jargon or raw internals in user-facing strings', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const banner = s.doc.getElementById('mm-sw-update-banner');
  const texts = [];
  (function collect(n) { if (n.textContent) texts.push(n.textContent); (n._children || []).forEach(collect); })(banner);
  const all = texts.join(' ');
  for (const jargon of ['SKIP_WAITING', 'controllerchange', 'serviceWorker', 'mm-static-', 'skipWaiting', 'postMessage']) {
    assert.strictEqual(all.indexOf(jargon), -1, `must not expose ${jargon}`);
  }
});

test('c4/copy: success is never claimed before controllerchange', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();                 // receipt only — NOT activation
  assert.strictEqual(msgOf(s), 'Updating Muscle Motivation…', 'still in progress');
  assert.strictEqual(s.reload.count, 0, 'no reload on acknowledgement alone');
});

test('c4/a11y: the banner is a polite status region and the message lives inside it', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const b = s.doc.getElementById('mm-sw-update-banner');
  assert.strictEqual(b.getAttribute('role'), 'status');
  assert.strictEqual(b.getAttribute('aria-live'), 'polite');
  assert.ok(b.querySelector(MSGSEL), 'message element is inside the live region');
});

test('c4/a11y: busy attempt exposes disabled + aria-disabled on the primary action', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  btn.click();
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(btn.getAttribute('aria-disabled'), 'true');
});

test('c4/a11y: Later remains a real keyboard-usable button and never posts a message', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  const later = s.doc.getElementById('mm-sw-later-btn');
  assert.strictEqual(later.tagName, 'button');
  assert.strictEqual(later.type, 'button');
  later.click();
  assert.strictEqual(s.worker.posted.length, 0, 'Later never messages the worker');
  assert.strictEqual(s.reload.count, 0, 'Later never reloads');
  assert.ok(!(SS_KEY in s.storage._map), 'Later never sets the reload marker');
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'banner hidden');
});

test('c4/state: Later does not destroy the waiting worker (a later load can update)', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-later-btn').click();
  assert.ok(s.registration.waiting, 'waiting worker untouched by Later');
});

test('c4/state: a stale banner is removed when the waiting worker is gone at click time', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.registration.waiting = null;            // worker activated/redundant elsewhere
  s.doc.getElementById('mm-sw-update-btn').click();
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null, 'no dead Update button left');
  assert.strictEqual(s.reload.count, 0);
  assert.ok(!(SS_KEY in s.storage._map));
});

test('c4/state: first install (no controller) shows no banner and no message', () => {
  const s = setup({ controller: false, waiting: true });
  s.ctrl.onRegistered(s.registration);
  assert.strictEqual(s.doc.getElementById('mm-sw-update-banner'), null);
});

test('c4/state: an already-waiting worker at load renders exactly one banner', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.ctrl.showUpdateIfReady();               // a later updatefound for the same worker
  s.ctrl.showUpdateIfReady();
  let count = 0;
  (function scan(n) { if (n.id === 'mm-sw-update-banner') count++; (n._children || []).forEach(scan); })(s.doc.body);
  assert.strictEqual(count, 1, 'no duplicate banner root');
});

test('c4/timers: no timer survives a successful activation', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.worker._sendAccepted();
  s.navigator.serviceWorker._emit('controllerchange', {});
  assert.strictEqual(s.timers.pending(), 0, 'all timers cleared on reload');
  assert.strictEqual(s.reload.count, 1, 'reloaded exactly once');
});

test('c4/timers: no timer survives dismissal', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  s.doc.getElementById('mm-sw-update-btn').click();
  s.doc.getElementById('mm-sw-later-btn').click();
  assert.strictEqual(s.timers.pending(), 0);
});

test('c4/marker: the reload marker is never set merely by showing the banner', () => {
  const s = setup({ controller: true, waiting: true });
  s.ctrl.onRegistered(s.registration);
  assert.ok(!(SS_KEY in s.storage._map));
});

test('c4/marker: unavailable storage never breaks the flow or blocks reload', () => {
  const s = setup({ controller: true, waiting: true, storage: null });
  s.ctrl.onRegistered(s.registration);
  const btn = s.doc.getElementById('mm-sw-update-btn');
  assert.doesNotThrow(() => btn.click());
  s.worker._sendAccepted();
  s.navigator.serviceWorker._emit('controllerchange', {});
  assert.strictEqual(s.reload.count, 1);
});

test('c4/layout: banner CSS clears bottom controls, safe area, and small widths', () => {
  const css = SWRegister.BANNER_CSS;
  assert.ok(css.indexOf('--mm-sw-bottom-clearance') !== -1, 'measured clearance var');
  assert.ok(css.indexOf('env(safe-area-inset-bottom') !== -1, 'home-indicator safe area');
  assert.ok(css.indexOf('position:fixed') !== -1);
  assert.ok(css.indexOf('@media (max-width:520px)') !== -1, 'narrow-viewport stacking');
  assert.ok(css.indexOf('min-width:0') !== -1, 'text can shrink → no horizontal overflow');
});
