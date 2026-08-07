/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Install Lifecycle Coordinator (Phase 4.3.3, Checkpoint 3)
 *
 * The single shared browser + application coordinator that connects the pure
 * eligibility core (`pwa-install.js`) and the presentation controller
 * (`pwa-install-ui.js`) to REAL browser lifecycle signals, device-local
 * persistence, approved meaningful-value signals, and cross-page coordination.
 *
 * It OWNS browser reads and app wiring; it does NOT duplicate eligibility rules
 * or UI rendering, and it never touches the service worker, cache policy,
 * manifest identity, `sw-register.js`, or any private data.
 *
 *   • Reads platform/standalone signals and translates them into the shapes the
 *     core expects (no browser reads are added to `pwa-install.js`).
 *   • Captures a single `beforeinstallprompt` (deferred; kept in memory only,
 *     never serialized/stored, latest-wins) and handles `appinstalled`.
 *   • Persists ONLY the approved versioned state (`mm_pwa_install_state`) via the
 *     core's parse/serialize helpers — timestamps + a counter, nothing private.
 *   • Uses sessionStorage for temporary, per-session suppression only.
 *   • Receives approved meaningful-value signals (window `mm:pwa-value` event or
 *     `markMeaningfulValue`) emitted AFTER a confirmed successful action.
 *   • Measures fixed bottom-control clearance (`.done-bar`, `.rest-strip`, …) and
 *     feeds the final value to the UI (no page selectors live in the UI module).
 *   • Yields to the update banner (`#mm-sw-update-banner`) — it never opens over
 *     it and never modifies it.
 *
 * All dependencies are injected (window, document, navigator, localStorage,
 * sessionStorage, matchMedia, now, timers, PWAInstall, PWAInstallUI, logger), so
 * Node tests drive it with fakes — no jsdom, no packages. NO import-time side
 * effects; NO listeners until start(). Fails OPEN for app usability and CLOSED
 * for install prompting.
 *
 * Exposed as `PWAInstallRegister` on the global and `module.exports`.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var UPDATE_BANNER_ID = 'mm-sw-update-banner';
  var SESSION_SUPPRESS_KEY = 'mm_pwa_install_session_suppressed';
  var DEFAULT_BOTTOM_SELECTORS = ['.done-bar', '.rest-strip', '[data-mm-sw-bottom-control]'];
  var RESIZE_DEBOUNCE_MS = 150;

  // Approved meaningful-value signal types → the core's value-signal flags.
  var VALUE_TYPES = {
    dashboard: ['onboardingComplete', 'reachedPersonalizedDashboard'],
    completedWorkout: ['completedWorkout'],
    loggedFood: ['loggedFood'],
    loggedWeight: ['loggedWeight'],
    meaningfulActionCompleted: ['meaningfulActionCompleted']
  };

  function isFn(f) { return typeof f === 'function'; }
  function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }

  function createInstallLifecycleController(deps) {
    deps = deps || {};
    var win = deps.window || (typeof window !== 'undefined' ? window : null);
    var doc = deps.document || (typeof document !== 'undefined' ? document : null);
    var nav = deps.navigator || (typeof navigator !== 'undefined' ? navigator : null);
    var CORE = deps.PWAInstall || (typeof PWAInstall !== 'undefined' ? PWAInstall : null);
    var UIMOD = deps.PWAInstallUI || (typeof PWAInstallUI !== 'undefined' ? PWAInstallUI : null);
    var now = isFn(deps.now) ? deps.now : function () { return Date.now(); };
    var warn = (deps.logger && isFn(deps.logger.warn)) ? function (m, e) { try { deps.logger.warn(m, e); } catch (x) {} }
      : function () {};
    var setTimer = isFn(deps.setTimer) ? deps.setTimer
      : function (fn, ms) { return (typeof setTimeout !== 'undefined') ? setTimeout(fn, ms) : null; };
    var clearTimer = isFn(deps.clearTimer) ? deps.clearTimer
      : function (id) { if (typeof clearTimeout !== 'undefined') clearTimeout(id); };
    // matchMedia resolver (function(query) -> MediaQueryList-like).
    var matchMedia = isFn(deps.matchMedia) ? deps.matchMedia
      : (win && isFn(win.matchMedia) ? function (q) { return win.matchMedia(q); } : null);
    var localStorage = deps.localStorage || safeGlobalStorage(win, 'localStorage');
    var sessionStorage = deps.sessionStorage || safeGlobalStorage(win, 'sessionStorage');

    var config = deps.config || {};
    var bottomSelectors = Array.isArray(config.bottomControlSelectors) ? config.bottomControlSelectors : DEFAULT_BOTTOM_SELECTORS;

    var state = {
      started: false,
      destroyed: false,
      ui: null,
      deferredPrompt: null,      // in-memory only; never serialized/stored
      sessionAppInstalled: false, // set true by appinstalled this session
      valueSignals: {},          // accumulated approved value flags (this page)
      lastResult: null,
      // bound handlers / observers (for teardown + dedup)
      onBIP: null,
      onAppInstalled: null,
      onResize: null,
      onValueEvent: null,
      dmql: null,                // display-mode standalone MediaQueryList
      dmqlHandler: null,
      observer: null,
      resizeTimer: null,
      promptInFlight: false      // guard: at most one prompt() per captured event
    };

    // ── safe storage helpers ───────────────────────────────────────────────
    function safeGlobalStorage(w, name) {
      try { return w && w[name] ? w[name] : null; } catch (e) { return null; }
    }
    function lsGet(k) { try { return localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { if (localStorage) localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function ssGet(k) { try { return sessionStorage ? sessionStorage.getItem(k) : null; } catch (e) { return null; } }
    function ssSet(k, v) { try { if (sessionStorage) sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }

    // ── persistence (through the core's helpers only) ──────────────────────
    function readState() {
      if (!CORE || !isFn(CORE.parseInstallState)) return null;
      return CORE.parseInstallState(lsGet(CORE.STORAGE_KEY), { now: now() });
    }
    function writeState(mutate) {
      if (!CORE || !isFn(CORE.parseInstallState) || !isFn(CORE.serializeInstallState)) return false;
      var s = readState();
      if (!s) return false;
      try { mutate(s); } catch (e) { warn('[mm-install] state mutate threw', e); }
      return lsSet(CORE.STORAGE_KEY, CORE.serializeInstallState(s));
    }
    function recordShown() { writeState(function (s) { s.lastShownAt = now(); s.showCount = (isFiniteNum(s.showCount) ? s.showCount : 0) + 1; }); }
    function recordSkip() { return writeState(function (s) { s.lastSkippedAt = now(); }); }
    function recordAccepted() { writeState(function (s) { s.lastAcceptedAt = now(); }); }
    function recordInstalledObserved() { writeState(function (s) { s.installedObservedAt = now(); }); }

    // ── session suppression (temporary, per-session only) ──────────────────
    function setSessionSuppressed() { ssSet(SESSION_SUPPRESS_KEY, '1'); }
    function isSessionSuppressed() { return ssGet(SESSION_SUPPRESS_KEY) === '1'; }

    // ── browser-signal translation (into the core's injected shapes) ───────
    function readEnv() {
      var ua = '';
      var mtp = 0;
      try { if (nav && typeof nav.userAgent === 'string') ua = nav.userAgent; } catch (e) {}
      try { var m = nav ? nav.maxTouchPoints : undefined; if (isFiniteNum(m)) mtp = m; } catch (e) {}
      return { userAgent: ua, maxTouchPoints: mtp };
    }
    function mm(query) {
      try {
        if (!matchMedia) return false;
        var r = matchMedia(query);
        return !!(r && r.matches);
      } catch (e) { return false; }
    }
    function readStandaloneSignals() {
      var iosSA = false;
      try { if (nav && nav.standalone === true) iosSA = true; } catch (e) {}
      return {
        displayModeStandalone: mm('(display-mode: standalone)'),
        displayModeFullscreen: mm('(display-mode: fullscreen)'),
        navigatorStandalone: iosSA
      };
    }
    function isStandaloneNow() {
      return CORE && isFn(CORE.isStandaloneMode) ? CORE.isStandaloneMode(readStandaloneSignals()) : false;
    }
    function platformNow() {
      return CORE && isFn(CORE.classifyPlatform) ? CORE.classifyPlatform(readEnv()) : 'other';
    }

    // ── update-surface detection ───────────────────────────────────────────
    function isUpdateSurfaceVisible() {
      try { return !!(doc && isFn(doc.getElementById) && doc.getElementById(UPDATE_BANNER_ID)); }
      catch (e) { return false; }
    }

    // ── bottom-clearance measurement (this module owns the selectors) ──────
    function measureBottomClearance() {
      try {
        if (!win || !doc || !isFn(doc.querySelectorAll)) return 0;
        var vh = win.innerHeight || 0;
        if (!vh) return 0;
        var occupied = 0;
        for (var i = 0; i < bottomSelectors.length; i++) {
          var els;
          try { els = doc.querySelectorAll(bottomSelectors[i]); } catch (e) { continue; }
          if (!els) continue;
          for (var j = 0; j < els.length; j++) {
            var el = els[j];
            if (!el || !isFn(el.getBoundingClientRect)) continue;
            var r;
            try { r = el.getBoundingClientRect(); } catch (e) { continue; }
            if (!r || !isFiniteNum(r.width) || !isFiniteNum(r.height) || !isFiniteNum(r.top)) continue;
            if (r.width <= 0 || r.height <= 0) continue;      // hidden / detached / zero
            if (r.height >= vh * 0.6) continue;               // full-screen overlay → not a bottom bar
            var band = vh - r.top;                            // occupied band above the viewport bottom
            if (band > 0 && band < vh && band > occupied) occupied = band;
          }
        }
        return occupied > 0 ? Math.round(occupied) : 0;
      } catch (e) { return 0; }
    }

    // ── UI wiring ──────────────────────────────────────────────────────────
    function ensureUI() {
      if (state.ui || !UIMOD || !isFn(UIMOD.createInstallOnboardingUI)) return state.ui;
      try {
        state.ui = UIMOD.createInstallOnboardingUI({
          document: doc, window: win, setTimer: setTimer, clearTimer: clearTimer, logger: deps.logger || null
        });
      } catch (e) { warn('[mm-install] UI create failed', e); state.ui = null; }
      return state.ui;
    }

    function callbacks() {
      return {
        onShown: function () {
          // Persist ONLY for an actually visible surface (fired once per render),
          // and mark this session shown so navigation does not re-nag.
          recordShown();
          setSessionSuppressed();
        },
        onSkip: function () {
          // "Skip for now" → durable cooldown. Attempt persistence; the UI closes
          // regardless (a failed write must not trap the user).
          recordSkip();
        },
        onDismiss: function () {
          // close / backdrop / Escape / iOS "Got it" → session-only suppression.
          setSessionSuppressed();
        },
        onInstallRequest: function () { return runNativePrompt(); },
        onClosed: function (/* reason */) { /* interaction-local cleanup only */ }
      };
    }

    // ── native prompt flow ─────────────────────────────────────────────────
    function runNativePrompt() {
      var evt = state.deferredPrompt;
      if (!evt || !isFn(evt.prompt) || state.promptInFlight) {
        return Promise.reject(new Error('no-prompt'));
      }
      // Consume immediately — a captured event is used at most once, never reused.
      state.deferredPrompt = null;
      state.promptInFlight = true;

      var promptReturn;
      try {
        promptReturn = evt.prompt();
      } catch (e) {
        state.promptInFlight = false;
        warn('[mm-install] prompt() threw', e);
        return Promise.reject(e); // UI recovers to a retryable error state
      }

      return Promise.resolve(promptReturn).then(function () {
        return evt.userChoice; // may be a promise, or undefined on older browsers
      }).then(function (choice) {
        state.promptInFlight = false;
        var outcome = choice && choice.outcome;
        if (outcome === 'accepted') {
          // Record acceptance but NEVER mark installed from acceptance alone —
          // appinstalled / standalone remains authoritative.
          recordAccepted();
          setSessionSuppressed();
          safeCloseUI('prompt-accepted');
        } else {
          // dismissed / missing choice → do not invent success; suppress for the
          // session and close (a future browser event / session may re-offer).
          setSessionSuppressed();
          safeCloseUI('prompt-dismissed');
        }
      }, function (err) {
        state.promptInFlight = false;
        warn('[mm-install] prompt/userChoice rejected', err);
        throw err; // propagate so the UI shows its retryable error state
      });
    }

    function safeCloseUI(reason) {
      try { if (state.ui && state.ui.isOpen()) state.ui.close(reason); } catch (e) { /* contained */ }
    }

    // ── core evaluation ────────────────────────────────────────────────────
    function buildEligibilityInput() {
      return {
        now: now(),
        env: readEnv(),
        standaloneSignals: readStandaloneSignals(),
        valueSignals: state.valueSignals,
        state: readState() || undefined,
        sessionAppInstalled: state.sessionAppInstalled === true,
        sessionSuppressed: isSessionSuppressed(),
        config: {
          skipCooldownMs: config.skipCooldownMs,
          installedAdvisoryMs: config.installedAdvisoryMs,
          showCap: config.showCap
        }
      };
    }

    // The one decision point. Authoritative suppressors (standalone / installed /
    // update-precedence) CLOSE an open surface; soft reasons (cooldown / session /
    // no-value) only prevent OPENING and never yank an already-open surface.
    function evaluate(reason) {
      if (state.destroyed || !state.started || !CORE || !isFn(CORE.computeInstallEligibility)) return null;

      // Live standalone is always refreshed first and always authoritative.
      if (isStandaloneNow()) {
        recordInstalledObserved();
        setSessionSuppressed();
        safeCloseUI('standalone');
        state.lastResult = { eligible: false, reason: 'standalone' };
        return state.lastResult;
      }

      // Update banner always wins.
      if (isUpdateSurfaceVisible()) {
        if (state.ui && state.ui.isOpen()) {
          try { state.ui.update({ updateSurfaceVisible: true }); } catch (e) { safeCloseUI('update-precedence'); }
        }
        state.lastResult = { eligible: false, reason: 'update-precedence' };
        return state.lastResult;
      }

      var result;
      try { result = CORE.computeInstallEligibility(buildEligibilityInput()); }
      catch (e) { warn('[mm-install] eligibility threw', e); return null; }
      state.lastResult = result;

      // Authoritative installed advisory / session appinstalled → close if open.
      if (result.reason === 'installed') { safeCloseUI('installed'); return result; }

      // Already open on a soft reason → leave it (user will act; no re-nag loop).
      var ui = ensureUI();
      if (ui && ui.isOpen()) return result;

      if (result.eligible && ui) {
        var platform = result.platform;
        var opened = false;
        try {
          opened = ui.open({
            platform: platform,
            eligible: true,
            nativePromptAvailable: !!state.deferredPrompt,
            passiveWhenNoPrompt: config.passiveWhenNoPrompt === true,
            updateSurfaceVisible: false,
            bottomClearance: measureBottomClearance(),
            minimumGap: config.minimumGap,
            onShown: cbCache.onShown,
            onSkip: cbCache.onSkip,
            onDismiss: cbCache.onDismiss,
            onInstallRequest: cbCache.onInstallRequest,
            onClosed: cbCache.onClosed
          });
        } catch (e) { warn('[mm-install] ui.open threw', e); opened = false; }
        // Persistence for a real show happens in onShown (only when actually rendered).
        void opened;
      }
      return result;
    }
    var cbCache = callbacks();

    // ── meaningful-value signals ───────────────────────────────────────────
    function markMeaningfulValue(type) {
      if (state.destroyed) return false;
      var flags = Object.prototype.hasOwnProperty.call(VALUE_TYPES, type) ? VALUE_TYPES[type] : null;
      if (!flags) return false; // ignore unknown/malformed
      for (var i = 0; i < flags.length; i++) state.valueSignals[flags[i]] = true;
      evaluate('value:' + type);
      return true;
    }
    function handlePageSignal(signal) {
      var type = (signal && typeof signal === 'object') ? signal.type : signal;
      return markMeaningfulValue(type);
    }

    // ── listeners ──────────────────────────────────────────────────────────
    function handleBeforeInstallPrompt(e) {
      try { if (e && isFn(e.preventDefault)) e.preventDefault(); } catch (x) {}
      // Retain ONLY the current event (latest wins); never serialize or store it.
      state.deferredPrompt = e || null;
      state.promptInFlight = false;
      evaluate('beforeinstallprompt');
    }
    function handleAppInstalled() {
      state.sessionAppInstalled = true;
      state.deferredPrompt = null;
      recordInstalledObserved();
      safeCloseUI('appinstalled');
      // No reload, no service-worker interaction. Duplicate events are harmless.
    }
    function handleValueEvent(e) {
      var detail = e && e.detail ? e.detail : null;
      if (!detail) return;
      markMeaningfulValue(detail.type);
    }
    function handleResize() {
      if (state.resizeTimer != null) return; // debounce (bounded, single-shot)
      state.resizeTimer = setTimer(function () {
        state.resizeTimer = null;
        try {
          if (state.ui && state.ui.isOpen()) state.ui.update({ bottomClearance: measureBottomClearance() });
        } catch (e) { /* contained */ }
      }, RESIZE_DEBOUNCE_MS);
    }
    function handleDisplayModeChange() { evaluate('displaymode-change'); }

    function addWin(type, fn) { try { if (win && isFn(win.addEventListener)) win.addEventListener(type, fn); } catch (e) {} }
    function removeWin(type, fn) { try { if (win && isFn(win.removeEventListener)) win.removeEventListener(type, fn); } catch (e) {} }

    // ── lifecycle ──────────────────────────────────────────────────────────
    function start(options) {
      if (state.destroyed) return false;     // start after destroy is refused
      if (state.started) return true;        // idempotent — no duplicate listeners
      state.started = true;
      options = options || {};

      state.onBIP = handleBeforeInstallPrompt;
      state.onAppInstalled = handleAppInstalled;
      state.onResize = handleResize;
      state.onValueEvent = handleValueEvent;

      addWin('beforeinstallprompt', state.onBIP);
      addWin('appinstalled', state.onAppInstalled);
      addWin('resize', state.onResize);
      addWin('orientationchange', state.onResize);
      addWin('mm:pwa-value', state.onValueEvent);

      // display-mode: standalone change → catch entering standalone.
      try {
        if (matchMedia) {
          var mql = matchMedia('(display-mode: standalone)');
          if (mql) {
            state.dmql = mql;
            state.dmqlHandler = handleDisplayModeChange;
            if (isFn(mql.addEventListener)) mql.addEventListener('change', state.dmqlHandler);
            else if (isFn(mql.addListener)) mql.addListener(state.dmqlHandler);
          }
        }
      } catch (e) { /* contained */ }

      // Observe update-banner insertion/removal to yield precedence promptly.
      try {
        var MO = deps.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
        if (MO && doc && doc.body && isFn(doc.body.appendChild)) {
          state.observer = new MO(function () { evaluate('update-surface-change'); });
          if (isFn(state.observer.observe)) state.observer.observe(doc.body, { childList: true, subtree: false });
        }
      } catch (e) { state.observer = null; }

      ensureUI();

      // Seed any caller-provided initial value signals (e.g. dashboard emitted
      // synchronously by the host page), then evaluate once.
      if (options.initialSignals && typeof options.initialSignals === 'object') {
        for (var k in options.initialSignals) {
          if (Object.prototype.hasOwnProperty.call(options.initialSignals, k) && options.initialSignals[k] === true) {
            markMeaningfulValue(k);
          }
        }
      }
      evaluate('start');
      return true;
    }

    function destroy() {
      if (state.destroyed) return;           // idempotent
      state.destroyed = true;
      removeWin('beforeinstallprompt', state.onBIP);
      removeWin('appinstalled', state.onAppInstalled);
      removeWin('resize', state.onResize);
      removeWin('orientationchange', state.onResize);
      removeWin('mm:pwa-value', state.onValueEvent);
      try {
        if (state.dmql && state.dmqlHandler) {
          if (isFn(state.dmql.removeEventListener)) state.dmql.removeEventListener('change', state.dmqlHandler);
          else if (isFn(state.dmql.removeListener)) state.dmql.removeListener(state.dmqlHandler);
        }
      } catch (e) { /* contained */ }
      try { if (state.observer && isFn(state.observer.disconnect)) state.observer.disconnect(); } catch (e) {}
      if (state.resizeTimer != null) { try { clearTimer(state.resizeTimer); } catch (e) {} state.resizeTimer = null; }
      try { if (state.ui && isFn(state.ui.destroy)) state.ui.destroy(); } catch (e) {}
      state.ui = null;
      state.deferredPrompt = null;
      state.observer = null;
      state.dmql = null;
    }

    function getState() {
      return {
        started: state.started,
        destroyed: state.destroyed,
        hasDeferredPrompt: !!state.deferredPrompt,
        sessionAppInstalled: state.sessionAppInstalled,
        platform: platformNow(),
        standalone: isStandaloneNow(),
        sessionSuppressed: isSessionSuppressed(),
        valueSignals: Object.assign({}, state.valueSignals),
        uiOpen: !!(state.ui && isFn(state.ui.isOpen) && state.ui.isOpen()),
        lastReason: state.lastResult ? state.lastResult.reason : null
      };
    }

    return {
      start: start,
      evaluate: evaluate,
      markMeaningfulValue: markMeaningfulValue,
      handlePageSignal: handlePageSignal,
      destroy: destroy,
      getState: getState,
      // introspection for tests
      _measureBottomClearance: measureBottomClearance,
      _runNativePrompt: runNativePrompt
    };
  }

  // Module-scope singleton guard: repeated script evaluation never double-inits.
  var booted = false;
  var singleton = null;
  function autoStart() {
    try {
      if (booted) return;
      booted = true;
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      singleton = createInstallLifecycleController({
        window: window, document: document,
        navigator: (typeof navigator !== 'undefined' ? navigator : null),
        PWAInstall: (typeof PWAInstall !== 'undefined' ? PWAInstall : null),
        PWAInstallUI: (typeof PWAInstallUI !== 'undefined' ? PWAInstallUI : null),
        logger: (typeof console !== 'undefined') ? console : null
      });
      singleton.start();
    } catch (e) { /* never break page startup */ }
  }

  var PWAInstallRegister = Object.freeze({
    createInstallLifecycleController: createInstallLifecycleController,
    getInstance: function () { return singleton; }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = PWAInstallRegister;
  root.PWAInstallRegister = PWAInstallRegister;

  // Auto-start ONLY in a real browser document (never during Node tests).
  if (typeof window !== 'undefined' && typeof document !== 'undefined') autoStart();
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
