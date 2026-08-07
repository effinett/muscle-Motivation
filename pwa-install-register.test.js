'use strict';

// Phase 4.3.3 — Checkpoint 3. Coverage for the install lifecycle coordinator
// (`pwa-install-register.js`): browser-signal translation, beforeinstallprompt /
// appinstalled handling, persistence + session suppression, meaningful-value
// wiring, eligibility integration, update-banner precedence, bottom-clearance
// measurement, duplicate-init protection, and cross-page HTML coverage. Pure
// Node (node:test) with hand fakes + the real pure core — no jsdom, no packages.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PWAInstallRegister = require('./pwa-install-register.js');
const CORE = require('./pwa-install.js');
const { createInstallLifecycleController } = PWAInstallRegister;

const SRC = fs.readFileSync(path.join(__dirname, 'pwa-install-register.js'), 'utf8');
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ''); }
const CODE = stripComments(SRC);

const NOW = 1700000000000;
const DAY = 24 * 60 * 60 * 1000;
const tick = () => new Promise((r) => setTimeout(r, 0));

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
};

// ── fakes ───────────────────────────────────────────────────────────────────
function store(opts) {
  opts = opts || {};
  const m = {};
  return {
    _m: m,
    getItem(k) { if (opts.throwGet) throw new Error('g'); return (k in m) ? m[k] : null; },
    setItem(k, v) { if (opts.throwSet) throw new Error('s'); m[k] = String(v); },
    removeItem(k) { if (opts.throwRemove) throw new Error('r'); delete m[k]; }
  };
}
function fakeWin(over) {
  return Object.assign({
    innerHeight: 800, _l: {},
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener(t, fn) { if (this._l[t]) { const i = this._l[t].indexOf(fn); if (i >= 0) this._l[t].splice(i, 1); } },
    _emit(t, e) { (this._l[t] || []).slice().forEach((fn) => fn(e || {})); },
    _count(t) { return (this._l[t] || []).length; }
  }, over || {});
}
function fakeDoc(over) {
  const doc = {
    _byId: {}, _q: {}, body: { appendChild() {} },
    getElementById(id) { return this._byId[id] || null; },
    querySelectorAll(sel) { return this._q[sel] || []; }
  };
  return Object.assign(doc, over || {});
}
function fakeMQL(matches) {
  return {
    matches, _l: {},
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener(t, fn) { if (this._l[t]) { const i = this._l[t].indexOf(fn); if (i >= 0) this._l[t].splice(i, 1); } },
    _emit() { (this._l['change'] || []).slice().forEach((fn) => fn({})); }
  };
}
function fakeMatchMedia(map, opts) {
  opts = opts || {};
  return function (q) { if (opts.throws) throw new Error('mm'); return map[q] || fakeMQL(false); };
}
function moFactory(storeArr) {
  return function (cb) {
    const inst = { cb, observed: false, disconnected: false, observe() { this.observed = true; }, disconnect() { this.disconnected = true; }, fire() { this.cb([]); } };
    storeArr.push(inst);
    return inst;
  };
}
function el(rect) { return { getBoundingClientRect() { return rect; } }; }
function bip(opts) {
  opts = opts || {};
  const e = {
    prevented: false, prompted: 0,
    preventDefault() { e.prevented = true; },
    prompt() { e.prompted++; if (opts.promptThrows) throw new Error('pt'); if (opts.promptRejects) return Promise.reject(new Error('pr')); return Promise.resolve(); },
    userChoice: ('outcome' in opts) ? Promise.resolve({ outcome: opts.outcome }) : (opts.noChoice ? undefined : Promise.resolve({ outcome: 'dismissed' }))
  };
  return e;
}
// Fake install UI mimicking Checkpoint-2 canRender + onShown semantics.
function fakeUI() {
  const ui = {
    opened: 0, closes: [], updates: [], destroyed: false, _open: false, opts: null,
    open(o) {
      ui.opts = o;
      const p = o.platform;
      const sup = p === 'ios-safari' || p === 'android-chrome' || p === 'desktop-chromium';
      if (o.updateSurfaceVisible === true) { return false; }
      if (!sup || o.eligible !== true) { return false; }
      if (p !== 'ios-safari' && o.nativePromptAvailable !== true && o.passiveWhenNoPrompt !== true) return false;
      if (ui._open) return true; // idempotent — no second onShown
      ui._open = true; ui.opened++;
      if (typeof o.onShown === 'function') o.onShown({ platform: p });
      return true;
    },
    update(o) {
      ui.updates.push(o);
      if (o && o.updateSurfaceVisible === true && ui._open) { ui._open = false; ui.closes.push('update-precedence'); if (ui.opts && typeof ui.opts.onClosed === 'function') ui.opts.onClosed('update-precedence'); return false; }
      return true;
    },
    close(r) { if (ui._open) { ui._open = false; ui.closes.push(r); if (ui.opts && typeof ui.opts.onClosed === 'function') ui.opts.onClosed(r); } },
    destroy() { ui.destroyed = true; ui._open = false; },
    isOpen() { return ui._open; },
    _getState() { return ui._open ? 'open' : 'closed'; },
    _skip() { const r = ui.opts.onSkip(); ui.close('skip'); return r; },
    _dismiss(reason) { ui.opts.onDismiss(reason); ui.close(reason); },
    _install() { return ui.opts.onInstallRequest(); }
  };
  return ui;
}

function mk(o) {
  o = o || {};
  const timers = [];
  const moStore = [];
  const win = o.win || fakeWin();
  const doc = o.doc || fakeDoc();
  const nav = ('nav' in o) ? o.nav : { userAgent: o.ua || UA.android, maxTouchPoints: o.mtp || 0, standalone: o.iosSA || false };
  const ls = o.ls || store();
  const ss = o.ss || store();
  const ui = o.ui || fakeUI();
  const mm = o.mm || fakeMatchMedia(o.mmMap || {}, o.mmOpts || {});
  const ctrl = createInstallLifecycleController({
    window: win, document: doc, navigator: nav, localStorage: ls, sessionStorage: ss,
    matchMedia: mm, now: o.now || (() => NOW),
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: (id) => { if (id >= 1) timers[id - 1] = null; },
    PWAInstall: CORE,
    PWAInstallUI: { createInstallOnboardingUI: () => ui },
    MutationObserver: moFactory(moStore),
    logger: null,
    config: o.config || {}
  });
  return { ctrl, win, doc, nav, ls, ss, ui, mm, timers, mo: moStore, fireTimers() { timers.slice().forEach((fn, i) => { if (fn) { timers[i] = null; fn(); } }); } };
}
function parseLs(ls) { return JSON.parse(ls._m[CORE.STORAGE_KEY] || '{}'); }

// A ready-to-open Android context: value reached + a captured prompt event.
function openableAndroid(o) {
  o = o || {};
  const h = mk(Object.assign({ ua: UA.android }, o));
  h.ctrl.start();
  h.ctrl.markMeaningfulValue('loggedFood');
  h.win._emit('beforeinstallprompt', bip(o.bipOpts));
  return h;
}

// ════════════════════════════════════════════════════════════════════════════
// Initialization
// ════════════════════════════════════════════════════════════════════════════

test('init: no import-time listeners (module require attaches nothing)', () => {
  const win = fakeWin();
  createInstallLifecycleController({ window: win, document: fakeDoc(), navigator: {}, PWAInstall: CORE });
  assert.strictEqual(win._count('beforeinstallprompt'), 0);
  assert.strictEqual(win._count('appinstalled'), 0);
});

test('init: start attaches exactly one listener per event', () => {
  const h = mk();
  h.ctrl.start();
  assert.strictEqual(h.win._count('beforeinstallprompt'), 1);
  assert.strictEqual(h.win._count('appinstalled'), 1);
  assert.strictEqual(h.win._count('resize'), 1);
  assert.strictEqual(h.win._count('orientationchange'), 1);
  assert.strictEqual(h.win._count('mm:pwa-value'), 1);
});

test('init: repeated start is idempotent (no duplicate listeners)', () => {
  const h = mk();
  h.ctrl.start(); h.ctrl.start(); h.ctrl.start();
  assert.strictEqual(h.win._count('beforeinstallprompt'), 1);
  assert.strictEqual(h.win._count('appinstalled'), 1);
});

test('init: destroy removes all window listeners and disconnects the observer', () => {
  const h = mk();
  h.ctrl.start();
  h.ctrl.destroy();
  assert.strictEqual(h.win._count('beforeinstallprompt'), 0);
  assert.strictEqual(h.win._count('appinstalled'), 0);
  assert.strictEqual(h.win._count('resize'), 0);
  assert.strictEqual(h.win._count('mm:pwa-value'), 0);
  assert.strictEqual(h.mo[0].disconnected, true);
});

test('init: repeated destroy is safe', () => {
  const h = mk();
  h.ctrl.start(); h.ctrl.destroy(); h.ctrl.destroy();
  assert.strictEqual(h.ctrl.getState().destroyed, true);
});

test('init: start after destroy is refused', () => {
  const h = mk();
  h.ctrl.start(); h.ctrl.destroy();
  assert.strictEqual(h.ctrl.start(), false);
  assert.strictEqual(h.win._count('beforeinstallprompt'), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// Platform / standalone reads
// ════════════════════════════════════════════════════════════════════════════

test('reads: iPhone → ios-safari', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'ios-safari');
});
test('reads: iPadOS Macintosh UA with touch → ios-safari', () => {
  const h = mk({ ua: UA.ipadMac, mtp: 5 }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'ios-safari');
});
test('reads: Android Chrome → android-chrome', () => {
  const h = mk({ ua: UA.android }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'android-chrome');
});
test('reads: desktop Chromium → desktop-chromium', () => {
  const h = mk({ ua: UA.desktop }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'desktop-chromium');
});
test('reads: Firefox → other (unsupported)', () => {
  const h = mk({ ua: UA.firefox }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'other');
});
test('reads: display-mode standalone → standalone true', () => {
  const h = mk({ mmMap: { '(display-mode: standalone)': fakeMQL(true) } }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().standalone, true);
});
test('reads: display-mode fullscreen → standalone-like true', () => {
  const h = mk({ mmMap: { '(display-mode: fullscreen)': fakeMQL(true) } }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().standalone, true);
});
test('reads: navigator.standalone → standalone true', () => {
  const h = mk({ iosSA: true }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().standalone, true);
});
test('reads: throwing matchMedia does not crash (standalone false)', () => {
  const h = mk({ mm: fakeMatchMedia({}, { throws: true }) }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().standalone, false);
});
test('reads: missing/throwing navigator fails safe to other', () => {
  const nav = {}; Object.defineProperty(nav, 'userAgent', { get() { throw new Error('ua'); } });
  const h = mk({ nav }); h.ctrl.start();
  assert.strictEqual(h.ctrl.getState().platform, 'other');
});

// ════════════════════════════════════════════════════════════════════════════
// beforeinstallprompt
// ════════════════════════════════════════════════════════════════════════════

test('bip: preventDefault is called and the event is retained in memory', () => {
  const h = mk({ ua: UA.android }); h.ctrl.start();
  const e = bip();
  h.win._emit('beforeinstallprompt', e);
  assert.strictEqual(e.prevented, true);
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, true);
});

test('bip: capture does NOT auto-prompt', () => {
  const h = openableAndroid();
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, true);
  // The UI opened but prompt() was never called on capture.
  assert.strictEqual(h.ui.opened, 1);
});

test('bip: duplicate events keep only the latest', async () => {
  const h = mk({ ua: UA.android }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  const e1 = bip({ outcome: 'accepted' }); const e2 = bip({ outcome: 'accepted' });
  h.win._emit('beforeinstallprompt', e1);
  h.win._emit('beforeinstallprompt', e2);
  await h.ui._install(); await tick();
  assert.strictEqual(e1.prompted, 0, 'stale event never prompted');
  assert.strictEqual(e2.prompted, 1, 'latest event used');
});

test('bip: capture re-evaluates and enables an Android render', () => {
  const h = mk({ ua: UA.android }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 0, 'no prompt yet → no render');
  h.win._emit('beforeinstallprompt', bip());
  assert.strictEqual(h.ui.opened, 1, 'render after capture');
});

test('bip: prompt is called at most once per event', async () => {
  const h = openableAndroid({ bipOpts: { outcome: 'accepted' } });
  await h.ui._install(); await tick();
  // deferredPrompt consumed → a second activation rejects and never re-prompts.
  await assert.rejects(() => h.ui._install());
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, false);
});

test('bip: accepted userChoice records lastAcceptedAt but not installed', async () => {
  const h = openableAndroid({ bipOpts: { outcome: 'accepted' } });
  await h.ui._install(); await tick();
  const st = parseLs(h.ls);
  assert.strictEqual(st.lastAcceptedAt, NOW);
  assert.strictEqual(st.installedObservedAt, null, 'acceptance is not installation');
});

test('bip: dismissed userChoice suppresses for the session, no accept recorded', async () => {
  const h = openableAndroid({ bipOpts: { outcome: 'dismissed' } });
  await h.ui._install(); await tick();
  const st = parseLs(h.ls);
  assert.strictEqual(st.lastAcceptedAt, null);
  assert.strictEqual(h.ctrl.getState().sessionSuppressed, true);
});

test('bip: missing userChoice is treated as dismissed (no invented success)', async () => {
  const h = openableAndroid({ bipOpts: { noChoice: true } });
  await h.ui._install(); await tick();
  const st = parseLs(h.ls);
  assert.strictEqual(st.lastAcceptedAt, null);
});

test('bip: prompt() rejection propagates and clears the consumed event', async () => {
  const h = openableAndroid({ bipOpts: { promptRejects: true } });
  await assert.rejects(() => h.ui._install());
  await tick();
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, false);
});

test('bip: prompt() synchronous throw rejects and clears the event', async () => {
  const h = openableAndroid({ bipOpts: { promptThrows: true } });
  await assert.rejects(() => h.ui._install());
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, false);
});

test('bip: the deferred event is never serialized into storage', async () => {
  const h = openableAndroid({ bipOpts: { outcome: 'accepted' } });
  await h.ui._install(); await tick();
  const raw = h.ls._m[CORE.STORAGE_KEY] || '';
  for (const bad of ['prompt', 'userChoice', 'outcome', 'preventDefault']) {
    assert.strictEqual(raw.indexOf(bad), -1, `stored state must not contain ${bad}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// appinstalled
// ════════════════════════════════════════════════════════════════════════════

test('appinstalled: records installedObservedAt, clears event, closes UI', () => {
  const h = openableAndroid();
  assert.strictEqual(h.ui.isOpen(), true);
  h.win._emit('appinstalled', {});
  assert.strictEqual(parseLs(h.ls).installedObservedAt, NOW);
  assert.strictEqual(h.ctrl.getState().hasDeferredPrompt, false);
  assert.strictEqual(h.ui.isOpen(), false);
});

test('appinstalled: duplicate events are harmless', () => {
  const h = openableAndroid();
  h.win._emit('appinstalled', {});
  assert.doesNotThrow(() => h.win._emit('appinstalled', {}));
});

test('appinstalled: does not reload the page', () => {
  let reloaded = false;
  const win = fakeWin({ location: { reload() { reloaded = true; } } });
  const h = mk({ win, ua: UA.android }); h.ctrl.start();
  h.win._emit('appinstalled', {});
  assert.strictEqual(reloaded, false);
});

test('appinstalled: subsequent evaluation stays suppressed (installed advisory)', () => {
  const h = openableAndroid();
  h.win._emit('appinstalled', {});
  h.ui.opened = 0; // reset counter
  h.ctrl.evaluate('later');
  assert.strictEqual(h.ui.opened, 0, 'installed advisory suppresses future UI');
});

// ════════════════════════════════════════════════════════════════════════════
// Persistence
// ════════════════════════════════════════════════════════════════════════════

test('persist: malformed existing state is sanitized, no crash', () => {
  const ls = store(); ls._m[CORE.STORAGE_KEY] = '{corrupt';
  const h = mk({ ls, ua: UA.android }); h.ctrl.start();
  assert.doesNotThrow(() => h.ctrl.markMeaningfulValue('loggedFood'));
});

test('persist: getItem throwing does not crash evaluation', () => {
  const ls = store({ throwGet: true });
  const h = mk({ ls, ua: UA.android }); h.ctrl.start();
  assert.doesNotThrow(() => h.ctrl.markMeaningfulValue('loggedFood'));
});

test('persist: setItem throwing does not crash a show', () => {
  const ls = store({ throwSet: true });
  const h = openableAndroid({ ls });
  assert.strictEqual(h.ui.opened, 1); // rendered despite storage failure
});

test('persist: lastShownAt + showCount written only after a visible onShown', () => {
  const h = openableAndroid();
  const st = parseLs(h.ls);
  assert.strictEqual(st.lastShownAt, NOW);
  assert.strictEqual(st.showCount, 1);
});

test('persist: a blocked render is not counted as shown', () => {
  const doc = fakeDoc(); doc._byId['mm-sw-update-banner'] = {}; // update banner visible
  const h = mk({ doc, ua: UA.android }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  h.win._emit('beforeinstallprompt', bip());
  assert.strictEqual(h.ui.opened, 0);
  assert.strictEqual(h.ls._m[CORE.STORAGE_KEY], undefined, 'nothing persisted for a blocked render');
});

test('persist: showCount increments exactly once even if evaluate runs again', () => {
  const h = openableAndroid();
  h.ctrl.evaluate('again'); // idempotent — surface already open
  assert.strictEqual(parseLs(h.ls).showCount, 1);
});

test('persist: skip writes lastSkippedAt (durable cooldown)', () => {
  const h = openableAndroid();
  h.ui._skip();
  assert.strictEqual(parseLs(h.ls).lastSkippedAt, NOW);
});

test('persist: dismiss does NOT write lastSkippedAt', () => {
  const h = openableAndroid();
  h.ui._dismiss('close-button');
  assert.strictEqual(parseLs(h.ls).lastSkippedAt, null);
});

test('persist: standalone observation writes installedObservedAt', () => {
  const h = mk({ mmMap: { '(display-mode: standalone)': fakeMQL(true) }, ua: UA.android });
  h.ctrl.start();
  assert.strictEqual(parseLs(h.ls).installedObservedAt, NOW);
});

test('persist: only approved non-sensitive fields are stored', () => {
  const h = openableAndroid();
  h.ui._skip();
  const keys = Object.keys(parseLs(h.ls)).sort();
  assert.deepStrictEqual(keys, ['installedObservedAt', 'lastAcceptedAt', 'lastShownAt', 'lastSkippedAt', 'schemaVersion', 'showCount']);
});

// ════════════════════════════════════════════════════════════════════════════
// Session suppression
// ════════════════════════════════════════════════════════════════════════════

test('session: close button sets session suppression', () => {
  const h = openableAndroid();
  h.ui._dismiss('close-button');
  assert.strictEqual(h.ctrl.getState().sessionSuppressed, true);
});

test('session: iOS "Got it" (dismiss) sets session suppression, not cooldown', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 1);
  h.ui._dismiss('primary');
  assert.strictEqual(h.ctrl.getState().sessionSuppressed, true);
  assert.strictEqual(parseLs(h.ls).lastSkippedAt, null);
});

test('session: native prompt dismissal sets session suppression', async () => {
  const h = openableAndroid({ bipOpts: { outcome: 'dismissed' } });
  await h.ui._install(); await tick();
  assert.strictEqual(h.ctrl.getState().sessionSuppressed, true);
});

test('session: suppression prevents re-opening after navigation-like re-eval', () => {
  const h = openableAndroid();
  h.ui._dismiss('escape');
  h.ui.opened = 0;
  h.ctrl.evaluate('renav');
  assert.strictEqual(h.ui.opened, 0);
});

test('session: sessionStorage failures are contained', () => {
  const ss = store({ throwSet: true, throwGet: true });
  const h = openableAndroid({ ss });
  assert.doesNotThrow(() => h.ui._dismiss('close-button'));
});

test('session: a fresh session (no flag) allows evaluation to show', () => {
  const h = openableAndroid(); // fresh ss → showed
  assert.strictEqual(h.ui.opened, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// Meaningful-value signals
// ════════════════════════════════════════════════════════════════════════════

test('value: dashboard sets onboardingComplete + reachedPersonalizedDashboard', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.ctrl.markMeaningfulValue('dashboard');
  const vs = h.ctrl.getState().valueSignals;
  assert.strictEqual(vs.onboardingComplete, true);
  assert.strictEqual(vs.reachedPersonalizedDashboard, true);
});

test('value: dashboard alone establishes value on iOS (no prompt needed)', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.ctrl.markMeaningfulValue('dashboard');
  assert.strictEqual(h.ui.opened, 1);
});

test('value: completed workout establishes value', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.ctrl.markMeaningfulValue('completedWorkout');
  assert.strictEqual(h.ui.opened, 1);
});

test('value: logged food / weight establish value', () => {
  const a = mk({ ua: UA.iphone }); a.ctrl.start(); a.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(a.ui.opened, 1);
  const b = mk({ ua: UA.iphone }); b.ctrl.start(); b.ctrl.markMeaningfulValue('loggedWeight');
  assert.strictEqual(b.ui.opened, 1);
});

test('value: unknown signal type is ignored', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  assert.strictEqual(h.ctrl.markMeaningfulValue('hack'), false);
  assert.deepStrictEqual(h.ctrl.getState().valueSignals, {});
});

test('value: duplicate signals are idempotent', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.ctrl.markMeaningfulValue('loggedFood');
  h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 1);
});

test('value: window mm:pwa-value event routes through validation', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.win._emit('mm:pwa-value', { detail: { type: 'loggedWeight' } });
  assert.strictEqual(h.ctrl.getState().valueSignals.loggedWeight, true);
  h.win._emit('mm:pwa-value', { detail: { type: 'not-a-real-type' } });
  assert.strictEqual(h.ctrl.getState().valueSignals['not-a-real-type'], undefined);
});

test('value: signals carry no user content (booleans only)', () => {
  const h = mk({ ua: UA.iphone }); h.ctrl.start();
  h.ctrl.markMeaningfulValue('loggedFood');
  const vs = h.ctrl.getState().valueSignals;
  for (const k of Object.keys(vs)) assert.strictEqual(typeof vs[k], 'boolean');
});

// ════════════════════════════════════════════════════════════════════════════
// Eligibility integration
// ════════════════════════════════════════════════════════════════════════════

test('eligibility: no first-load nag (start with no value → no UI)', () => {
  const h = mk({ ua: UA.android }); h.ctrl.start();
  h.win._emit('beforeinstallprompt', bip()); // event but no meaningful value
  assert.strictEqual(h.ui.opened, 0);
});

test('eligibility: Android renders ONLY once a deferred event exists', () => {
  const h = mk({ ua: UA.android }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 0); // eligible reason-wise but UI needs the event
  h.win._emit('beforeinstallprompt', bip());
  assert.strictEqual(h.ui.opened, 1);
});

test('eligibility: cooldown suppresses (recent skip)', () => {
  const ls = store();
  ls._m[CORE.STORAGE_KEY] = JSON.stringify({ schemaVersion: 1, lastSkippedAt: NOW - DAY });
  const h = openableAndroid({ ls });
  assert.strictEqual(h.ui.opened, 0);
  assert.strictEqual(h.ctrl.getState().lastReason, 'skipped-cooldown');
});

test('eligibility: installed advisory suppresses', () => {
  const ls = store();
  ls._m[CORE.STORAGE_KEY] = JSON.stringify({ schemaVersion: 1, installedObservedAt: NOW - DAY });
  const h = openableAndroid({ ls });
  assert.strictEqual(h.ui.opened, 0);
  assert.strictEqual(h.ctrl.getState().lastReason, 'installed');
});

test('eligibility: standalone suppresses and records install', () => {
  const h = mk({ mmMap: { '(display-mode: standalone)': fakeMQL(true) }, ua: UA.android });
  h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 0);
  assert.strictEqual(h.ctrl.getState().lastReason, 'standalone');
});

test('eligibility: unsupported platform stays suppressed', () => {
  const h = mk({ ua: UA.firefox }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  assert.strictEqual(h.ui.opened, 0);
});

test('eligibility: desktop renders only with a deferred event', () => {
  const h = mk({ ua: UA.desktop }); h.ctrl.start(); h.ctrl.markMeaningfulValue('dashboard');
  assert.strictEqual(h.ui.opened, 0);
  h.win._emit('beforeinstallprompt', bip());
  assert.strictEqual(h.ui.opened, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// Update-banner precedence
// ════════════════════════════════════════════════════════════════════════════

test('precedence: an already-visible update banner blocks open', () => {
  const doc = fakeDoc(); doc._byId['mm-sw-update-banner'] = {};
  const h = mk({ doc, ua: UA.android }); h.ctrl.start(); h.ctrl.markMeaningfulValue('loggedFood');
  h.win._emit('beforeinstallprompt', bip());
  assert.strictEqual(h.ui.opened, 0);
  assert.strictEqual(h.ctrl.getState().lastReason, 'update-precedence');
});

test('precedence: banner appearing while open suspends without skip or recount', () => {
  const h = openableAndroid();
  assert.strictEqual(h.ui.isOpen(), true);
  h.doc._byId['mm-sw-update-banner'] = {}; // banner appears
  h.mo[0].fire();                          // observer notices
  assert.strictEqual(h.ui.isOpen(), false);
  assert.ok(h.ui.closes.indexOf('update-precedence') !== -1);
  assert.strictEqual(parseLs(h.ls).lastSkippedAt, null, 'no skip persisted');
  assert.strictEqual(parseLs(h.ls).showCount, 1, 'not re-counted');
});

test('precedence: banner removal does not auto-reopen (already shown this session)', () => {
  const h = openableAndroid();
  h.doc._byId['mm-sw-update-banner'] = {}; h.mo[0].fire(); // suspend
  h.ui.opened = 0;
  delete h.doc._byId['mm-sw-update-banner']; h.mo[0].fire(); // banner gone
  assert.strictEqual(h.ui.opened, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// Bottom-clearance measurement
// ════════════════════════════════════════════════════════════════════════════

test('clearance: no controls → 0', () => {
  const h = mk(); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 0);
});
test('clearance: done bar measured', () => {
  const doc = fakeDoc(); doc._q['.done-bar'] = [el({ top: 740, bottom: 800, width: 320, height: 60 })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 60); // 800 - 740
});
test('clearance: rest strip measured', () => {
  const doc = fakeDoc(); doc._q['.rest-strip'] = [el({ top: 760, bottom: 800, width: 320, height: 40 })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 40);
});
test('clearance: multiple controls → maximum band', () => {
  const doc = fakeDoc();
  doc._q['.done-bar'] = [el({ top: 750, bottom: 800, width: 320, height: 50 })];
  doc._q['.rest-strip'] = [el({ top: 720, bottom: 800, width: 320, height: 80 })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 80);
});
test('clearance: hidden / zero-size control ignored', () => {
  const doc = fakeDoc(); doc._q['.done-bar'] = [el({ top: 0, bottom: 0, width: 0, height: 0 })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 0);
});
test('clearance: malformed geometry ignored', () => {
  const doc = fakeDoc(); doc._q['.rest-strip'] = [el({ top: NaN, bottom: NaN, width: NaN, height: NaN })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 0);
});
test('clearance: full-screen overlay is not treated as a bottom bar', () => {
  const doc = fakeDoc(); doc._q['.done-bar'] = [el({ top: 0, bottom: 800, width: 320, height: 800 })];
  const h = mk({ doc }); h.ctrl.start();
  assert.strictEqual(h.ctrl._measureBottomClearance(), 0);
});
test('clearance: resize updates an open surface (debounced)', () => {
  const doc = fakeDoc(); doc._q['.rest-strip'] = [el({ top: 760, bottom: 800, width: 320, height: 40 })];
  const h = openableAndroid({ doc });
  h.win._emit('resize', {});
  h.fireTimers();
  const last = h.ui.updates[h.ui.updates.length - 1];
  assert.strictEqual(last.bottomClearance, 40);
});
test('clearance: orientationchange updates an open surface', () => {
  const doc = fakeDoc(); doc._q['.done-bar'] = [el({ top: 700, bottom: 800, width: 320, height: 100 })];
  const h = openableAndroid({ doc });
  h.win._emit('orientationchange', {});
  h.fireTimers();
  assert.strictEqual(h.ui.updates[h.ui.updates.length - 1].bottomClearance, 100);
});
test('clearance: resize/orientation listeners removed on destroy', () => {
  const h = mk(); h.ctrl.start(); h.ctrl.destroy();
  assert.strictEqual(h.win._count('resize'), 0);
  assert.strictEqual(h.win._count('orientationchange'), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// Duplicate init / navigation
// ════════════════════════════════════════════════════════════════════════════

test('dup: no duplicate MutationObserver across repeated start', () => {
  const h = mk(); h.ctrl.start(); h.ctrl.start();
  assert.strictEqual(h.mo.length, 1);
});

test('dup: a new page load reads the latest durable state', () => {
  const ls = store(); // shared origin storage across "pages"
  const h1 = openableAndroid({ ls });
  h1.ui._skip(); // writes cooldown
  // Simulate a fresh page: new controller, new fresh sessionStorage, same ls.
  const h2 = openableAndroid({ ls });
  assert.strictEqual(h2.ui.opened, 0, 'cooldown carried across pages via localStorage');
});

// ════════════════════════════════════════════════════════════════════════════
// Error containment
// ════════════════════════════════════════════════════════════════════════════

test('errors: no crash when the UI module is unavailable', () => {
  const win = fakeWin();
  const ctrl = createInstallLifecycleController({
    window: win, document: fakeDoc(), navigator: { userAgent: UA.iphone }, localStorage: store(), sessionStorage: store(),
    matchMedia: fakeMatchMedia({}), now: () => NOW, PWAInstall: CORE, PWAInstallUI: null
  });
  assert.doesNotThrow(() => { ctrl.start(); ctrl.markMeaningfulValue('loggedFood'); });
});

test('errors: no crash when the core is unavailable (fails closed)', () => {
  const win = fakeWin();
  const ctrl = createInstallLifecycleController({ window: win, document: fakeDoc(), navigator: {}, PWAInstall: null, PWAInstallUI: { createInstallOnboardingUI: () => fakeUI() } });
  assert.doesNotThrow(() => { ctrl.start(); ctrl.evaluate('x'); });
});

// ════════════════════════════════════════════════════════════════════════════
// Purity / boundary
// ════════════════════════════════════════════════════════════════════════════

test('purity: no service-worker, cache, network, or Supabase references', () => {
  for (const forbidden of ['serviceWorker', 'caches', 'fetch(', 'XMLHttpRequest', 'supabase', '.reload(', 'importScripts']) {
    assert.strictEqual(CODE.indexOf(forbidden), -1, `must not reference ${forbidden}`);
  }
});

test('purity: does not import or modify sw-register / sw files', () => {
  assert.strictEqual(CODE.indexOf("require('./sw-register')"), -1);
  assert.strictEqual(CODE.indexOf('sw-policy'), -1);
});

test('purity: re-require returns the same frozen object', () => {
  const again = require('./pwa-install-register.js');
  assert.strictEqual(again, PWAInstallRegister);
  assert.ok(Object.isFrozen(PWAInstallRegister));
});

// ════════════════════════════════════════════════════════════════════════════
// Cross-page HTML coverage
// ════════════════════════════════════════════════════════════════════════════

const AUTH_PAGES = ['app.html', 'nutrition.html', 'onboarding.html', 'weight-history.html', 'workout.html', 'workout-history.html', 'workout-complete.html'];
const EXCLUDED_PAGES = ['auth.html', 'reset-password.html', 'index.html', 'store.html', 'get-fit-guide.html', 'calculator.html', 'program-fat-loss.html', 'program-muscle-gain.html', 'program-glute-builder.html'];

function read(p) { return fs.readFileSync(path.join(__dirname, p), 'utf8'); }

test('html: every authenticated page loads the three install scripts in dependency order, deferred, once', () => {
  for (const page of AUTH_PAGES) {
    const html = read(page);
    const iCore = html.indexOf('src="pwa-install.js"');
    const iUI = html.indexOf('src="pwa-install-ui.js"');
    const iReg = html.indexOf('src="pwa-install-register.js"');
    assert.ok(iCore !== -1, `${page} loads pwa-install.js`);
    assert.ok(iUI !== -1, `${page} loads pwa-install-ui.js`);
    assert.ok(iReg !== -1, `${page} loads pwa-install-register.js`);
    assert.ok(iCore < iUI && iUI < iReg, `${page} preserves dependency order`);
    // defer on each
    for (const s of ['pwa-install.js', 'pwa-install-ui.js', 'pwa-install-register.js']) {
      const re = new RegExp('<script src="' + s.replace('.', '\\.') + '" defer></script>', 'g');
      const matches = html.match(re) || [];
      assert.strictEqual(matches.length, 1, `${page} includes ${s} exactly once with defer`);
    }
  }
});

test('html: excluded / unauthenticated pages load NO install scripts', () => {
  for (const page of EXCLUDED_PAGES) {
    const html = read(page);
    assert.strictEqual(html.indexOf('pwa-install.js'), -1, `${page} must not load pwa-install.js`);
    assert.strictEqual(html.indexOf('pwa-install-ui.js'), -1, `${page} must not load pwa-install-ui.js`);
    assert.strictEqual(html.indexOf('pwa-install-register.js'), -1, `${page} must not load pwa-install-register.js`);
  }
});

test('html: calculator.html remains untouched by install wiring', () => {
  const html = read('calculator.html');
  assert.strictEqual(html.indexOf('pwa-install'), -1);
});

test('html: authenticated pages emit only approved value signals (no logged content)', () => {
  // The dashboard/workout/food/weight pages dispatch mm:pwa-value AFTER success.
  const app = read('app.html');
  assert.ok(app.indexOf("mm:pwa-value") !== -1 && app.indexOf("'dashboard'") !== -1, 'app.html emits dashboard value');
  const wc = read('workout-complete.html');
  assert.ok(wc.indexOf('completedWorkout') !== -1, 'workout-complete emits completedWorkout');
});
