/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Service-Worker Registration & Controlled Update
 * (Phase 4.3.2, Checkpoint 3)
 *
 * The client-side layer that registers `/sw.js`, detects a ready update, shows a
 * persistent user-controlled update banner, and reloads exactly once after the
 * user opts in. It changes NO cache or privacy boundary from Checkpoints 1–2:
 * the worker still caches only the approved public static assets, HTML/API/
 * Supabase stay network-only, and there is no offline mode and no install
 * onboarding here.
 *
 * Design:
 *   • Pure helper `shouldRegisterServiceWorker(...)` — default-deny environment
 *     gate (approved hostnames + HTTPS/localhost + one explicit HTTPS preview
 *     override). Unit-tested in isolation.
 *   • `createUpdateController(deps)` — the update lifecycle with EVERYTHING
 *     injected (navigator, location, document, storage, reload, now, console),
 *     so Node tests drive it with fakes. No global mutable state.
 *   • Auto-start runs ONLY in a real browser (window+document present); in Node
 *     tests nothing registers.
 *
 * Never: automatic reload, automatic activation, page-driven cache writes,
 * private-data access, tokens, or storage of anything but a tiny transition
 * marker in sessionStorage.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var SW_URL = '/sw.js';
  var SW_SCOPE = '/';
  // `updateViaCache: 'none'` makes the browser bypass the HTTP cache for BOTH
  // sw.js AND its importScripts (`sw-policy.js`, `sw-runtime.js`) during update
  // checks, so a change to an imported module reliably participates in the
  // byte-comparison that triggers an update (the version constant lives in
  // sw-policy.js, not sw.js). Consistent with the no-cache/no-store headers on
  // those three scripts; unknown to very old browsers, which simply ignore the
  // dictionary member. It adds no cache-busting query string.
  var SW_UPDATE_VIA_CACHE = 'none';
  var PREVIEW_FLAG = 'mm_sw_preview';
  var PROD_HOST = 'musclemotivation.fit';
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  // sessionStorage marker: an update was accepted in this tab and a one-time
  // reload is expected. Written on accept, CONSUMED on the next load (which
  // blocks any immediate re-reload until a fresh explicit accept). Never
  // persists across browser sessions; never stores user/auth data.
  var SS_ACCEPTED_KEY = 'mm_sw_update_accepted';
  var FOREGROUND_MIN_MS = 60000; // debounce foreground update checks (no timers)

  // Does the URL search string carry the explicit preview-validation override?
  function hasPreviewFlag(search) {
    if (typeof search !== 'string' || !search) return false;
    try {
      var qs = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
      return qs.get(PREVIEW_FLAG) === '1';
    } catch (e) {
      return false;
    }
  }

  // Default-deny environment gate. Registers only for:
  //   • approved production host over HTTPS,
  //   • localhost / 127.0.0.1 / [::1] over HTTP or HTTPS (local dev),
  //   • an HTTPS *.vercel.app preview WITH the explicit ?mm_sw_preview=1 override.
  // Everything else — arbitrary HTTPS hosts, insecure remotes (even with the
  // override), unsupported browsers, malformed input — is denied.
  function shouldRegisterServiceWorker(env) {
    env = env || {};
    if (!env.supported) return false;
    var protocol = env.protocol;
    var hostname = env.hostname;
    if (typeof protocol !== 'string' || typeof hostname !== 'string') return false;

    var isHttps = protocol === 'https:';
    var isHttp = protocol === 'http:';
    if (!isHttps && !isHttp) return false;

    if (LOCAL_HOSTS.indexOf(hostname) !== -1) return true;         // local dev: http or https
    if (hostname === PROD_HOST) return isHttps;                    // production: https only
    if (isHttps && /\.vercel\.app$/.test(hostname) && hasPreviewFlag(env.search)) return true;
    return false;                                                   // default deny
  }

  // First-ever install for this page = there is no controlling worker yet.
  function isFirstInstall(controller) {
    return !controller;
  }

  function createUpdateController(deps) {
    deps = deps || {};
    var nav = deps.navigator;
    var doc = deps.document;
    var win = deps.window || (typeof window !== 'undefined' ? window : null);
    var storage = deps.storage || null;   // may be null/unavailable → fail safe
    var reload = typeof deps.reload === 'function' ? deps.reload : function () {};
    var warn = (deps.console && typeof deps.console.warn === 'function')
      ? function (m, e) { try { deps.console.warn(m, e); } catch (x) {} }
      : function () {};
    var now = typeof deps.now === 'function' ? deps.now : function () { return Date.now(); };

    var state = {
      started: false,
      registration: null,
      accepted: false,               // user opted into THIS transition
      hasReloaded: false,            // one reload per accepted transition
      bannerShown: false,
      dismissed: false,              // dismissed for this page execution
      lastForegroundCheck: null,     // timestamp of last foreground update check
      controllerListenerBound: false, // controllerchange listener installed once
      resizeListenerBound: false     // resize/orientation recompute installed once
    };

    // ── safe sessionStorage helpers (all contained) ─────────────────────────
    function ssGet(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    function ssSet(k, v) { try { if (storage) storage.setItem(k, v); } catch (e) {} }
    function ssRemove(k) { try { if (storage) storage.removeItem(k); } catch (e) {} }

    function controllerExists() {
      try { return !!(nav && nav.serviceWorker && nav.serviceWorker.controller); }
      catch (e) { return false; }
    }

    // ── registration ────────────────────────────────────────────────────────
    function start() {
      if (state.started) return;      // register at most once per page execution
      state.started = true;

      if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.register !== 'function') return;

      // Consume a prior accepted-transition marker: if it is set we have just
      // reloaded under the new controller, so block any immediate re-reload
      // until the user explicitly accepts a NEW update (which resets the guard).
      if (ssGet(SS_ACCEPTED_KEY) === '1') {
        ssRemove(SS_ACCEPTED_KEY);
        state.hasReloaded = true;
      }

      bindControllerChange();

      try {
        if (doc && typeof doc.addEventListener === 'function') {
          doc.addEventListener('visibilitychange', handleVisibility);
        }
      } catch (e) { /* contained */ }

      var reg;
      try {
        reg = nav.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: SW_UPDATE_VIA_CACHE });
      } catch (e) {
        warn('[mm-sw] registration failed', e); // sync throw → swallowed
        return;
      }
      Promise.resolve(reg).then(onRegistered, function (e) {
        warn('[mm-sw] registration rejected', e); // async rejection → swallowed
      });
    }

    function onRegistered(registration) {
      if (!registration) return;
      state.registration = registration;

      // Case A — an update is already waiting.
      if (registration.waiting) showUpdateIfReady();

      // Case B — a new worker is discovered later.
      try {
        registration.addEventListener('updatefound', handleUpdateFound);
      } catch (e) { /* contained */ }

      safeUpdateCheck(registration);
    }

    function handleUpdateFound() {
      var reg = state.registration;
      var installing = reg && reg.installing;
      if (!installing) return; // nothing installing → safe
      try {
        installing.addEventListener('statechange', function () {
          try {
            if (installing.state === 'installed') showUpdateIfReady();
          } catch (e) { /* contained */ }
        });
      } catch (e) { /* contained */ }
    }

    // Show the banner ONLY when a worker is genuinely waiting AND the page is
    // already controlled (i.e. not the first-ever install) AND it has not been
    // dismissed/shown in this execution.
    function showUpdateIfReady() {
      if (state.dismissed || state.bannerShown) return;
      if (isFirstInstall(nav && nav.serviceWorker && nav.serviceWorker.controller)) return;
      var reg = state.registration;
      if (!reg || !reg.waiting) return;
      showBanner();
    }

    // ── update check (no polling, no timers) ────────────────────────────────
    function safeUpdateCheck(registration) {
      try {
        var p = registration.update();
        if (p && typeof p.then === 'function') p.then(undefined, function () {});
      } catch (e) { /* contained */ }
    }

    function handleVisibility() {
      try {
        if (!doc || doc.visibilityState !== 'visible') return;
        var t = now();
        if (state.lastForegroundCheck != null && (t - state.lastForegroundCheck) < FOREGROUND_MIN_MS) return; // debounce
        state.lastForegroundCheck = t;
        if (state.registration) safeUpdateCheck(state.registration);
      } catch (e) { /* contained */ }
    }

    // Install the controllerchange listener exactly once (before any accept can
    // post SKIP_WAITING), so activation is always observed and never double-bound.
    function bindControllerChange() {
      if (state.controllerListenerBound) return;
      try {
        if (nav && nav.serviceWorker && typeof nav.serviceWorker.addEventListener === 'function') {
          nav.serviceWorker.addEventListener('controllerchange', handleControllerChange);
          state.controllerListenerBound = true;
        }
      } catch (e) { /* contained */ }
    }

    // ── bottom-control clearance ─────────────────────────────────────────────
    // Measure how much of the viewport bottom is occupied by known same-origin
    // fixed bottom controls, so the banner sits ABOVE them (never on top of the
    // workout rest strip or the workout-complete Done bar). Curated selectors
    // only; hidden / zero-height / off-screen / full-screen (modal) elements are
    // ignored; no polling; all DOM access contained.
    var BOTTOM_CONTROL_SELECTORS = ['.done-bar', '.rest-strip', '[data-mm-sw-bottom-control]'];
    function measureBottomClearance() {
      try {
        if (!win || !doc || typeof doc.querySelectorAll !== 'function') return 0;
        var vh = win.innerHeight || 0;
        if (!vh) return 0;
        var occupied = 0;
        for (var i = 0; i < BOTTOM_CONTROL_SELECTORS.length; i++) {
          var els;
          try { els = doc.querySelectorAll(BOTTOM_CONTROL_SELECTORS[i]); } catch (e) { continue; }
          if (!els) continue;
          for (var j = 0; j < els.length; j++) {
            var el = els[j];
            if (!el || typeof el.getBoundingClientRect !== 'function') continue;
            var r;
            try { r = el.getBoundingClientRect(); } catch (e) { continue; }
            if (!r || !r.width || !r.height) continue;   // missing / display:none / zero
            if (r.height >= vh * 0.6) continue;          // full-screen overlay → not a bottom bar
            var region = vh - r.top;                     // occupied band above the viewport bottom
            if (region > 0 && region < vh && region > occupied) occupied = region;
          }
        }
        return occupied > 0 ? Math.round(occupied) : 0;
      } catch (e) {
        return 0;
      }
    }

    function applyBottomClearance(banner) {
      try {
        if (!banner || typeof banner.style !== 'object' || typeof banner.style.setProperty !== 'function') return;
        banner.style.setProperty('--mm-sw-bottom-clearance', measureBottomClearance() + 'px');
      } catch (e) { /* contained */ }
    }

    function bindResizeRecalc() {
      if (state.resizeListenerBound) return;
      try {
        if (win && typeof win.addEventListener === 'function') {
          win.addEventListener('resize', recalcClearance);
          win.addEventListener('orientationchange', recalcClearance);
          state.resizeListenerBound = true;
        }
      } catch (e) { /* contained */ }
    }
    function recalcClearance() {
      var b = getBanner();
      if (b) applyBottomClearance(b); // no-op when no banner is present (no layout loop, no polling)
    }

    // ── banner ───────────────────────────────────────────────────────────────
    function ensureStyles() {
      try {
        if (!doc || typeof doc.createElement !== 'function') return;
        if (doc.getElementById && doc.getElementById('mm-sw-style')) return;
        var style = doc.createElement('style');
        style.id = 'mm-sw-style';
        style.textContent = BANNER_CSS;
        var head = (doc.head || (doc.getElementsByTagName && doc.getElementsByTagName('head')[0]) || doc.body);
        if (head && head.appendChild) head.appendChild(style);
      } catch (e) { /* contained */ }
    }

    function showBanner() {
      try {
        if (!doc || typeof doc.createElement !== 'function') return;
        if (doc.getElementById && doc.getElementById('mm-sw-update-banner')) { state.bannerShown = true; return; }
        ensureStyles();

        var banner = doc.createElement('div');
        banner.id = 'mm-sw-update-banner';
        banner.className = 'mm-sw-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('data-mm-sw-banner', '');

        var text = doc.createElement('div');
        text.className = 'mm-sw-banner-text';
        var title = doc.createElement('strong');
        title.textContent = 'Update available';
        var sub = doc.createElement('span');
        sub.textContent = 'A new version of Muscle Motivation is ready.';
        text.appendChild(title);
        text.appendChild(sub);

        var actions = doc.createElement('div');
        actions.className = 'mm-sw-banner-actions';

        var updateBtn = doc.createElement('button');
        updateBtn.type = 'button';
        updateBtn.id = 'mm-sw-update-btn';
        updateBtn.setAttribute('data-mm-sw-update', '');
        updateBtn.className = 'mm-sw-btn mm-sw-btn-primary';
        updateBtn.textContent = 'Update now';
        if (updateBtn.addEventListener) updateBtn.addEventListener('click', acceptUpdate);

        var laterBtn = doc.createElement('button');
        laterBtn.type = 'button';
        laterBtn.id = 'mm-sw-later-btn';
        laterBtn.setAttribute('data-mm-sw-later', '');
        laterBtn.className = 'mm-sw-btn mm-sw-btn-ghost';
        laterBtn.textContent = 'Later';
        if (laterBtn.addEventListener) laterBtn.addEventListener('click', dismiss);

        actions.appendChild(updateBtn);
        actions.appendChild(laterBtn);
        banner.appendChild(text);
        banner.appendChild(actions);

        var host = doc.body || doc.documentElement;
        if (host && host.appendChild) host.appendChild(banner);
        applyBottomClearance(banner);   // position above any fixed bottom control
        bindResizeRecalc();             // recompute on resize/orientation (once)
        state.bannerShown = true;
      } catch (e) { /* contained — never break the page */ }
    }

    function getBanner() {
      try { return doc && doc.getElementById ? doc.getElementById('mm-sw-update-banner') : null; }
      catch (e) { return null; }
    }

    function hideBanner() {
      try {
        var b = getBanner();
        if (b && b.parentNode && b.parentNode.removeChild) b.parentNode.removeChild(b);
      } catch (e) { /* contained */ }
      state.bannerShown = false;
    }

    function updateButton() {
      var b = getBanner();
      return b && b.querySelector ? b.querySelector('[data-mm-sw-update]') : null;
    }
    function disableUpdateButton() {
      try {
        var btn = updateButton();
        if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
      } catch (e) { /* contained */ }
    }
    function enableUpdateButton() {
      try {
        var btn = updateButton();
        if (btn) { btn.disabled = false; if (btn.removeAttribute) btn.removeAttribute('aria-disabled'); }
      } catch (e) { /* contained */ }
    }

    // ── accept / dismiss ─────────────────────────────────────────────────────
    // Commit accepted state ONLY when the synchronous postMessage succeeds; roll
    // it back fully (no accepted flag, no marker, button re-enabled, banner kept)
    // if it throws, so a failed acceptance is retryable and can NEVER authorize a
    // later unrelated controllerchange reload.
    function acceptUpdate() {
      try {
        if (state.accepted) return; // already accepted — ignore duplicate clicks

        var reg = state.registration;
        var waiting = reg && reg.waiting;
        if (!waiting || typeof waiting.postMessage !== 'function') {
          // missing / stale / malformed worker: set no accepted state, clear any
          // stale marker, leave no reload eligibility, reset the stale banner.
          ssRemove(SS_ACCEPTED_KEY);
          hideBanner();
          return;                 // no reload, no throw
        }

        // Ensure the activation listener exists before posting, and guard against
        // duplicate clicks during the synchronous attempt.
        bindControllerChange();
        disableUpdateButton();

        var posted = false;
        try {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          posted = true;
        } catch (e) {
          posted = false;         // synchronous postMessage failure
        }

        if (posted) {
          // Success boundary (no ack promise exists): commit accepted state.
          state.accepted = true;
          state.hasReloaded = false; // this explicit accept permits exactly one reload
          ssSet(SS_ACCEPTED_KEY, '1');
        } else {
          // Full rollback → retryable; no reload eligibility.
          state.accepted = false;
          ssRemove(SS_ACCEPTED_KEY);
          enableUpdateButton();     // keep the banner so the user can retry
        }
      } catch (e) { /* contained */ }
    }

    function dismiss() {
      state.dismissed = true;       // suppress re-render for this page execution only
      hideBanner();                 // no message, no reload, no unregister, no cache change
    }

    // ── controllerchange → one-time reload ───────────────────────────────────
    function handleControllerChange() {
      if (state.hasReloaded) return;   // in-memory guard: at most one reload / execution
      if (!state.accepted) return;     // only reload if THIS tab opted in (no auto-refresh)
      state.hasReloaded = true;
      try { reload(); } catch (e) { /* contained */ }
    }

    return {
      start: start,
      onRegistered: onRegistered,
      handleUpdateFound: handleUpdateFound,
      showUpdateIfReady: showUpdateIfReady,
      showBanner: showBanner,
      hideBanner: hideBanner,
      getBanner: getBanner,
      acceptUpdate: acceptUpdate,
      dismiss: dismiss,
      handleControllerChange: handleControllerChange,
      safeUpdateCheck: safeUpdateCheck,
      handleVisibility: handleVisibility,
      measureBottomClearance: measureBottomClearance,
      recalcClearance: recalcClearance,
      _state: state
    };
  }

  // Persistent bottom banner styling. Dark brand surface, red primary action,
  // iPhone safe-area aware, above content but not a focus trap and not a modal.
  var BANNER_CSS = [
    // The bottom offset is: measured fixed-bottom-control clearance (0 when none)
    // + a small visual gap + the iPhone safe-area inset — so the banner never
    // sits on top of a bottom nav / workout rest strip, and clears the home
    // indicator. NOT an unconditional bottom:0.
    '.mm-sw-banner{position:fixed;left:0;right:0;',
    'bottom:calc(var(--mm-sw-bottom-clearance, 0px) + 12px + env(safe-area-inset-bottom, 0px));',
    'z-index:2147483000;',
    'display:flex;justify-content:center;',
    'padding:12px 16px;',
    'background:#111111;border:1px solid #2A2A2A;border-radius:12px;',
    'margin:0 12px;color:#FFFFFF;',
    "font-family:'Barlow',system-ui,-apple-system,sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.45);}",
    '.mm-sw-banner-text{display:flex;flex-direction:column;justify-content:center;gap:2px;margin-right:16px;min-width:0;}',
    '.mm-sw-banner-text strong{font-size:15px;font-weight:700;}',
    '.mm-sw-banner-text span{font-size:13px;color:#B8B8B8;}',
    '.mm-sw-banner-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}',
    '.mm-sw-btn{font:inherit;font-weight:700;text-transform:uppercase;letter-spacing:.02em;',
    'border-radius:8px;padding:10px 16px;cursor:pointer;border:1px solid transparent;min-height:40px;}',
    '.mm-sw-btn-primary{background:#B1121B;color:#FFFFFF;}',
    '.mm-sw-btn-primary:hover{background:#D11D27;}',
    '.mm-sw-btn-primary[disabled]{opacity:.6;cursor:default;}',
    '.mm-sw-btn-ghost{background:transparent;color:#FFFFFF;border-color:#2A2A2A;}',
    '@media (max-width:520px){.mm-sw-banner{flex-direction:column;align-items:stretch;gap:10px;}',
    '.mm-sw-banner-text{margin-right:0;}.mm-sw-banner-actions{justify-content:flex-end;}}'
  ].join('');

  function autoStart() {
    try {
      if (typeof navigator === 'undefined' || typeof location === 'undefined' || typeof document === 'undefined') return;
      var supported = !!(navigator && navigator.serviceWorker);
      var ok = shouldRegisterServiceWorker({
        protocol: location.protocol,
        hostname: location.hostname,
        search: location.search,
        supported: supported
      });
      if (!ok) return;
      var storage = null;
      try { storage = window.sessionStorage; } catch (e) { storage = null; }
      var controller = createUpdateController({
        navigator: navigator,
        document: document,
        window: window,
        storage: storage,
        reload: function () { location.reload(); },
        console: (typeof console !== 'undefined') ? console : null
      });
      controller.start();
    } catch (e) { /* never break page startup */ }
  }

  var SWRegister = {
    shouldRegisterServiceWorker: shouldRegisterServiceWorker,
    hasPreviewFlag: hasPreviewFlag,
    isFirstInstall: isFirstInstall,
    createUpdateController: createUpdateController,
    BANNER_CSS: BANNER_CSS,
    SW_URL: SW_URL,
    SW_SCOPE: SW_SCOPE,
    SW_UPDATE_VIA_CACHE: SW_UPDATE_VIA_CACHE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SWRegister;
  root.SWRegister = SWRegister;

  // Auto-start ONLY in a real browser document (never during Node tests).
  if (typeof window !== 'undefined' && typeof document !== 'undefined') autoStart();
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
