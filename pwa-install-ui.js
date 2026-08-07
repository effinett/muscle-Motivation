/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Install Onboarding UI (Phase 4.3.3, Checkpoint 2)
 *
 * The reusable, accessible, mobile-safe PRESENTATION layer for PWA install
 * onboarding. It is UI-only: it renders a branded bottom-sheet dialog from an
 * ALREADY-COMPUTED decision and fires injected callbacks. It does NOT:
 *   • decide eligibility (that is `pwa-install.js`, Checkpoint 1),
 *   • read application/onboarding/workout/nutrition/weight state,
 *   • capture beforeinstallprompt / appinstalled or call prompt(),
 *   • touch localStorage / sessionStorage, Supabase, the network, caches, or the
 *     service worker,
 *   • measure page-specific bottom controls (that is Checkpoint 3 — the final
 *     clearance value is INJECTED here).
 *
 * Everything the DOM needs is injected (`document`, optional `window`, timers,
 * style host, callbacks), so Node tests drive it with hand fakes — no jsdom, no
 * packages, no globals. There are NO import-time side effects and NO listeners
 * before `open()`. `destroy()` removes every node, listener, focus trap, scroll
 * lock, and pending timer.
 *
 * Reuses the repo's dual-export IIFE convention (browser global +
 * `module.exports`) and Object.freeze discipline (see sw-policy.js /
 * sw-register.js), and mirrors sw-register.js's safe-area/bottom-clearance
 * PRINCIPLES without importing or coupling to it.
 *
 * Exposed as `PWAInstallUI` on the global and `module.exports` (Node tests).
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // Supported install presentations. Anything else renders nothing.
  var IOS = 'ios-safari';
  var ANDROID = 'android-chrome';
  var DESKTOP = 'desktop-chromium';
  var SUPPORTED = Object.freeze({ 'ios-safari': true, 'android-chrome': true, 'desktop-chromium': true });

  var ROOT_ID = 'mm-pwa-install-surface';
  var STYLE_ID = 'mm-pwa-install-style';
  var DEFAULT_MIN_GAP = 12; // px visual gap above measured bottom controls

  // Internal lifecycle states.
  var STATE = Object.freeze({ CLOSED: 'closed', OPEN: 'open', BUSY: 'busy', ERROR: 'error' });

  // ── Centralized, frozen copy (product edits live here, never in event code) ──
  // No claims about offline private data, background sync, push, or native-only
  // features — only shipped benefits (faster access, full-screen app-like use).
  var COPY = Object.freeze({
    common: Object.freeze({
      skip: 'Skip for now',
      closeLabel: 'Close',
      busy: 'Starting…',
      errorStatus: 'Couldn’t start the install. Please try again.'
    }),
    'ios-safari': Object.freeze({
      heading: 'Put Muscle Motivation on your Home Screen',
      body: 'Add the app to your Home Screen for faster access and a full-screen, app-like experience.',
      steps: Object.freeze([
        'Tap the Share button in Safari.',
        'Choose “Add to Home Screen.”',
        'Tap “Add” to confirm.'
      ]),
      primary: 'Got it'
    }),
    'android-chrome': Object.freeze({
      heading: 'Install Muscle Motivation',
      body: 'Install the app for faster access and a full-screen, app-like experience.',
      primary: 'Install',
      passive: 'To install, open your browser menu and choose “Install app.”',
      passivePrimary: 'Got it'
    }),
    'desktop-chromium': Object.freeze({
      heading: 'Install Muscle Motivation',
      body: 'Install the app for faster access and a full-screen, app-like experience.',
      primary: 'Install',
      passive: 'To install, use the install icon in your browser’s address bar.',
      passivePrimary: 'Got it'
    })
  });

  // ── Pure layout helper ──────────────────────────────────────────────────────
  // Final bottom offset for the surface = sanitized measured clearance + a
  // minimum visual gap. The device safe-area inset is added SEPARATELY in CSS
  // (env(safe-area-inset-bottom)); this helper never encodes a page-specific
  // selector list. Malformed / negative inputs are sanitized to safe values.
  function computeInstallSurfaceBottomOffset(args) {
    args = args || {};
    var m = args.measuredClearance;
    var g = args.minimumGap;
    var clearance = (typeof m === 'number' && isFinite(m) && m > 0) ? m : 0;
    var gap = (typeof g === 'number' && isFinite(g) && g >= 0) ? g : DEFAULT_MIN_GAP;
    return Math.round(clearance + gap);
  }

  function isFn(f) { return typeof f === 'function'; }

  // ── Controller factory ──────────────────────────────────────────────────────
  function createInstallOnboardingUI(deps) {
    deps = deps || {};
    var doc = deps.document || (typeof document !== 'undefined' ? document : null);
    var win = deps.window || (typeof window !== 'undefined' ? window : null);
    var warn = (deps.console && isFn(deps.console.warn))
      ? function (m, e) { try { deps.console.warn(m, e); } catch (x) {} }
      : function () {};
    var setTimer = isFn(deps.setTimer) ? deps.setTimer
      : function (fn, ms) { return (typeof setTimeout !== 'undefined') ? setTimeout(fn, ms) : null; };
    var clearTimer = isFn(deps.clearTimer) ? deps.clearTimer
      : function (id) { if (typeof clearTimeout !== 'undefined') clearTimeout(id); };
    // Where the injected <style> is appended. Defaults to document.head.
    var styleHost = deps.styleHost || null;

    var state = {
      phase: STATE.CLOSED,
      destroyed: false,
      rootEl: null,          // backdrop (modal) or surface (non-modal) top node
      surfaceEl: null,       // the dialog card
      installBtn: null,
      skipBtn: null,
      primaryBtn: null,
      closeBtn: null,
      statusEl: null,
      backdropEl: null,      // only in modal mode
      modal: true,
      platform: null,
      opts: null,            // last open options snapshot (frozen copies of primitives)
      prevFocus: null,       // element focused before open, to restore on close
      prevOverflow: null,    // saved body overflow for scroll-lock restore
      backdropMouseDownOnSelf: false,
      keydownHandler: null,  // document keydown (Escape + Tab trap)
      pendingTimers: [],     // any single-shot timers we created
      attemptId: 0,          // install-request generation token
      shownFired: false,
      closing: false
    };

    // ── tiny DOM helpers (all contained) ──────────────────────────────────────
    function create(tag) {
      try { return doc && isFn(doc.createElement) ? doc.createElement(tag) : null; } catch (e) { return null; }
    }
    function setText(el, t) { if (el) { try { el.textContent = t; } catch (e) {} } }
    function setAttr(el, k, v) { if (el && isFn(el.setAttribute)) { try { el.setAttribute(k, v); } catch (e) {} } }
    function removeAttr(el, k) { if (el && isFn(el.removeAttribute)) { try { el.removeAttribute(k); } catch (e) {} } }
    function on(el, type, fn) { if (el && isFn(el.addEventListener)) { try { el.addEventListener(type, fn); } catch (e) {} } }
    function off(el, type, fn) { if (el && isFn(el.removeEventListener)) { try { el.removeEventListener(type, fn); } catch (e) {} } }
    function append(parent, child) { if (parent && child && isFn(parent.appendChild)) { try { parent.appendChild(child); } catch (e) {} } return child; }

    function getStyleHost() {
      if (styleHost) return styleHost;
      if (!doc) return null;
      return doc.head || (isFn(doc.getElementsByTagName) && doc.getElementsByTagName('head')[0]) || doc.body || null;
    }

    function ensureStyles() {
      try {
        if (!doc || !isFn(doc.createElement)) return;
        if (doc.getElementById && doc.getElementById(STYLE_ID)) return;
        var st = create('style');
        if (!st) return;
        st.id = STYLE_ID;
        setText(st, SURFACE_CSS);
        append(getStyleHost(), st);
      } catch (e) { /* contained */ }
    }

    function activeElement() {
      try { return doc ? doc.activeElement : null; } catch (e) { return null; }
    }
    function focusEl(el) {
      if (el && isFn(el.focus)) { try { el.focus(); } catch (e) {} }
    }

    // Collect enabled, focusable controls inside the surface (buttons only — the
    // surface has no inputs/links). Order is DOM order.
    function focusable() {
      var out = [];
      var s = state.surfaceEl;
      if (!s) return out;
      var list;
      try { list = isFn(s.querySelectorAll) ? s.querySelectorAll('button') : null; } catch (e) { list = null; }
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var el = list[i];
          if (el && el.disabled !== true) out.push(el);
        }
        return out;
      }
      // Fallback: our known buttons, in order.
      var known = [state.closeBtn, state.installBtn, state.primaryBtn, state.skipBtn];
      for (var j = 0; j < known.length; j++) if (known[j] && known[j].disabled !== true) out.push(known[j]);
      return out;
    }

    // ── scroll lock ───────────────────────────────────────────────────────────
    function lockScroll() {
      try {
        if (!doc || !doc.body || !doc.body.style) return;
        var st = doc.body.style;
        state.prevOverflow = isFn(st.getPropertyValue) ? st.getPropertyValue('overflow') : (st.overflow || '');
        if (isFn(st.setProperty)) st.setProperty('overflow', 'hidden');
        else st.overflow = 'hidden';
      } catch (e) { /* contained */ }
    }
    function unlockScroll() {
      try {
        if (!doc || !doc.body || !doc.body.style) return;
        var st = doc.body.style;
        var prev = state.prevOverflow;
        if (prev) {
          if (isFn(st.setProperty)) st.setProperty('overflow', prev);
          else st.overflow = prev;
        } else if (isFn(st.removeProperty)) {
          st.removeProperty('overflow');
        } else {
          st.overflow = '';
        }
      } catch (e) { /* contained */ }
      state.prevOverflow = null;
    }

    // ── status messaging (accessible) ────────────────────────────────────────
    function setStatus(msg) {
      if (state.statusEl) setText(state.statusEl, msg || '');
    }

    // ── install-button visual state ──────────────────────────────────────────
    function setBusy(on) {
      var b = state.installBtn;
      if (!b) return;
      if (on) {
        b.disabled = true;
        setAttr(b, 'aria-disabled', 'true');
        setAttr(b, 'aria-busy', 'true');
      } else {
        b.disabled = false;
        removeAttr(b, 'aria-disabled');
        removeAttr(b, 'aria-busy');
      }
    }

    // ── offset application ────────────────────────────────────────────────────
    function applyOffset(measuredClearance, minimumGap) {
      try {
        var s = state.surfaceEl;
        if (!s || !s.style || !isFn(s.style.setProperty)) return;
        var off = computeInstallSurfaceBottomOffset({ measuredClearance: measuredClearance, minimumGap: minimumGap });
        s.style.setProperty('--mm-install-offset', off + 'px');
      } catch (e) { /* contained */ }
    }

    // ── build DOM ─────────────────────────────────────────────────────────────
    function build(platform, opts) {
      var isModal = opts.modal !== false; // modal by default
      state.modal = isModal;

      var headingId = ROOT_ID + '-title';
      var bodyId = ROOT_ID + '-desc';

      var surface = create('div');
      if (!surface) return null;
      surface.id = ROOT_ID;
      surface.className = 'mm-install-surface';
      setAttr(surface, 'role', 'dialog');
      if (isModal) setAttr(surface, 'aria-modal', 'true');
      setAttr(surface, 'aria-labelledby', headingId);
      setAttr(surface, 'aria-describedby', bodyId);
      state.surfaceEl = surface;

      // Close (icon) button — always labelled.
      var closeBtn = create('button');
      closeBtn.type = 'button';
      closeBtn.className = 'mm-install-close';
      setAttr(closeBtn, 'data-mm-install-close', '');
      setAttr(closeBtn, 'aria-label', COPY.common.closeLabel);
      setText(closeBtn, '×'); // × glyph; aria-label carries the real name
      on(closeBtn, 'click', function () { requestDismiss('close-button'); });
      state.closeBtn = closeBtn;
      append(surface, closeBtn);

      var heading = create('h2');
      heading.id = headingId;
      heading.className = 'mm-install-heading';
      setAttr(heading, 'tabindex', '-1'); // programmatically focusable fallback
      setText(heading, COPY[platform].heading);
      append(surface, heading);

      var body = create('p');
      body.id = bodyId;
      body.className = 'mm-install-body';
      setText(body, COPY[platform].body);
      append(surface, body);

      // iOS: numbered manual instruction rows (text-first, never icon-only).
      if (platform === IOS) {
        var ol = create('ol');
        ol.className = 'mm-install-steps';
        var steps = COPY[IOS].steps;
        for (var i = 0; i < steps.length; i++) {
          var li = create('li');
          li.className = 'mm-install-step';
          var num = create('span');
          num.className = 'mm-install-step-num';
          setAttr(num, 'aria-hidden', 'true');
          setText(num, String(i + 1));
          var txt = create('span');
          txt.className = 'mm-install-step-text';
          setText(txt, steps[i]);
          append(li, num);
          append(li, txt);
          append(ol, li);
        }
        append(surface, ol);
      }

      // Passive explanation (android/desktop, no native prompt, opt-in only).
      var hasNativeInstall = (platform === ANDROID || platform === DESKTOP) && opts.nativePromptAvailable === true;
      var passiveMode = (platform === ANDROID || platform === DESKTOP) && !hasNativeInstall && opts.passiveWhenNoPrompt === true;
      if (passiveMode) {
        var passive = create('p');
        passive.className = 'mm-install-passive';
        setText(passive, COPY[platform].passive);
        append(surface, passive);
      }

      // Accessible live status region (busy / error messages).
      var status = create('div');
      status.className = 'mm-install-status';
      setAttr(status, 'role', 'status');
      setAttr(status, 'aria-live', 'polite');
      state.statusEl = status;
      append(surface, status);

      // Actions row.
      var actions = create('div');
      actions.className = 'mm-install-actions';

      // Primary action.
      var primary = create('button');
      primary.type = 'button';
      primary.className = 'mm-install-btn mm-install-btn-primary';
      if (hasNativeInstall) {
        primary.setAttribute('data-mm-install-request', '');
        setText(primary, COPY[platform].primary);
        on(primary, 'click', requestInstall);
        state.installBtn = primary;
      } else {
        // iOS informational primary, or passive-mode acknowledge → session dismiss.
        primary.setAttribute('data-mm-install-primary', '');
        var label = (platform === IOS) ? COPY[IOS].primary
          : (COPY[platform].passivePrimary || COPY.common.skip);
        setText(primary, label);
        on(primary, 'click', function () { requestDismiss('primary'); });
      }
      state.primaryBtn = primary;
      append(actions, primary);

      // Skip for now — always present.
      var skip = create('button');
      skip.type = 'button';
      skip.className = 'mm-install-btn mm-install-btn-ghost';
      skip.setAttribute('data-mm-install-skip', '');
      setText(skip, COPY.common.skip);
      on(skip, 'click', requestSkip);
      state.skipBtn = skip;
      append(actions, skip);

      append(surface, actions);

      // Modal wrapper (backdrop) or bare surface.
      if (isModal) {
        var backdrop = create('div');
        backdrop.id = ROOT_ID + '-backdrop';
        backdrop.className = 'mm-install-backdrop';
        setAttr(backdrop, 'data-mm-install-backdrop', '');
        // Dismiss ONLY when the gesture starts AND ends on the backdrop itself.
        on(backdrop, 'mousedown', function (e) {
          state.backdropMouseDownOnSelf = !!(e && e.target === backdrop);
        });
        on(backdrop, 'click', function (e) {
          var onSelf = state.backdropMouseDownOnSelf && e && e.target === backdrop;
          state.backdropMouseDownOnSelf = false;
          if (onSelf) requestDismiss('backdrop');
        });
        append(backdrop, surface);
        state.backdropEl = backdrop;
        state.rootEl = backdrop;
      } else {
        state.rootEl = surface;
      }

      applyOffset(opts.bottomClearance, opts.minimumGap);
      return state.rootEl;
    }

    // ── keydown (Escape + focus trap) ─────────────────────────────────────────
    function onKeydown(e) {
      if (!e) return;
      var key = e.key;
      if (key === 'Escape' || key === 'Esc') {
        try { if (isFn(e.preventDefault)) e.preventDefault(); } catch (x) {}
        requestDismiss('escape');
        return;
      }
      if ((key === 'Tab') && state.modal) {
        var items = focusable();
        if (items.length === 0) {
          // Nothing focusable → keep focus on the surface, prevent leaving.
          try { if (isFn(e.preventDefault)) e.preventDefault(); } catch (x) {}
          focusEl(state.surfaceEl);
          return;
        }
        var first = items[0];
        var last = items[items.length - 1];
        var current = activeElement();
        if (e.shiftKey) {
          if (current === first || items.indexOf(current) === -1) {
            try { if (isFn(e.preventDefault)) e.preventDefault(); } catch (x) {}
            focusEl(last);
          }
        } else {
          if (current === last || items.indexOf(current) === -1) {
            try { if (isFn(e.preventDefault)) e.preventDefault(); } catch (x) {}
            focusEl(first);
          }
        }
      }
    }

    function bindDocKeydown() {
      if (state.keydownHandler || !doc || !isFn(doc.addEventListener)) return;
      state.keydownHandler = onKeydown;
      on(doc, 'keydown', state.keydownHandler);
    }
    function unbindDocKeydown() {
      if (state.keydownHandler && doc) off(doc, 'keydown', state.keydownHandler);
      state.keydownHandler = null;
    }

    function clearPendingTimers() {
      var t = state.pendingTimers;
      state.pendingTimers = [];
      for (var i = 0; i < t.length; i++) { try { clearTimer(t[i]); } catch (e) {} }
    }

    // ── actions ───────────────────────────────────────────────────────────────
    function fire(name, arg) {
      var opts = state.opts;
      var cb = opts && opts[name];
      if (!isFn(cb)) return undefined;
      try { return cb(arg); } catch (e) { warn('[mm-install] ' + name + ' threw', e); return { __threw: e }; }
    }

    function requestInstall() {
      if (state.destroyed) return;
      if (state.phase === STATE.BUSY) return;             // prevent repeated activation
      if (!state.installBtn) return;
      var myId = ++state.attemptId;
      state.phase = STATE.BUSY;
      setBusy(true);
      setStatus(COPY.common.busy);

      var result;
      var threw = false;
      try {
        var opts = state.opts;
        result = (opts && isFn(opts.onInstallRequest)) ? opts.onInstallRequest() : undefined;
      } catch (e) {
        threw = true;
        warn('[mm-install] onInstallRequest threw', e);
      }

      if (threw) { recoverInstall(myId, true); return; }

      // Success handoff: DO NOT invent installation success — return to idle so
      // Checkpoint 3 can close the surface on real appinstalled/standalone
      // evidence, and the user can retry if nothing happens.
      Promise.resolve(result).then(function () {
        settleInstallIdle(myId);
      }, function (err) {
        warn('[mm-install] onInstallRequest rejected', err);
        recoverInstall(myId, true);
      });
    }

    function settleInstallIdle(myId) {
      if (myId !== state.attemptId) return;     // stale (superseded / closed)
      if (state.phase !== STATE.BUSY) return;
      state.phase = STATE.OPEN;
      setBusy(false);
      setStatus('');
    }
    function recoverInstall(myId, isError) {
      if (myId !== state.attemptId) return;     // stale
      if (state.phase !== STATE.BUSY) return;
      state.phase = isError ? STATE.ERROR : STATE.OPEN;
      setBusy(false);
      setStatus(isError ? COPY.common.errorStatus : '');
    }

    function requestSkip() {
      if (state.destroyed || state.phase === STATE.CLOSED) return;
      var res = fire('onSkip');
      if (res && res.__threw) return;            // callback threw → stay open, recoverable
      Promise.resolve(res).then(function () {
        close('skip');
      }, function (err) {
        warn('[mm-install] onSkip rejected', err); // stay open, recoverable
      });
    }

    // Dismiss = session-only intent (Checkpoint 3 persists no cooldown). It always
    // closes (a dismiss must never trap the user), even if onDismiss throws.
    function requestDismiss(reason) {
      if (state.destroyed || state.phase === STATE.CLOSED) return;
      fire('onDismiss', reason);                 // contained; result ignored
      close(reason || 'dismiss');
    }

    // ── open / update / close / destroy ───────────────────────────────────────
    function shouldBlockForUpdate(opts) {
      return !!(opts && opts.updateSurfaceVisible === true);
    }
    function canRender(platform, opts) {
      if (!SUPPORTED[platform]) return false;
      if (!opts || opts.eligible !== true) return false;
      if (platform === IOS) return true;         // manual instructions always renderable
      var hasNative = opts.nativePromptAvailable === true;
      if (hasNative) return true;
      return opts.passiveWhenNoPrompt === true;  // else default: no render
    }

    function open(options) {
      if (state.destroyed || !doc) return false;
      options = options || {};

      // Update-banner precedence: never open beneath a visible update surface;
      // do not fire onShown, do not count as displayed. If already open, close.
      if (shouldBlockForUpdate(options)) {
        if (state.phase !== STATE.CLOSED) close('update-precedence');
        return false;
      }

      var platform = options.platform;
      if (!canRender(platform, options)) {
        if (state.phase !== STATE.CLOSED) close('ineligible');
        return false;
      }

      // Idempotent: an existing surface (this controller or a stray duplicate)
      // means do not build a second root.
      if (state.phase !== STATE.CLOSED) return true;
      if (doc.getElementById && doc.getElementById(ROOT_ID)) { return true; }

      state.opts = options;
      state.platform = platform;
      state.shownFired = false;
      state.attemptId++;

      ensureStyles();
      var rootEl = build(platform, options);
      if (!rootEl) { cleanupState(); return false; }

      // Save prior focus BEFORE mounting, to restore on close.
      state.prevFocus = activeElement();

      var host = doc.body || doc.documentElement;
      append(host, rootEl);

      if (state.modal) { lockScroll(); }
      bindDocKeydown();

      state.phase = STATE.OPEN;

      // Deterministic initial focus: primary action, else skip, else heading.
      var target = state.installBtn || state.primaryBtn || state.skipBtn || state.surfaceEl;
      focusEl(target);

      if (!state.shownFired) { state.shownFired = true; fire('onShown', { platform: platform }); }
      return true;
    }

    function update(options) {
      if (state.destroyed) return false;
      options = options || {};

      // Update-banner precedence can arrive after open → suspend cleanly.
      if (shouldBlockForUpdate(options)) {
        if (state.phase !== STATE.CLOSED) close('update-precedence');
        return false;
      }
      if (state.phase === STATE.CLOSED) return false;

      // Re-apply bottom clearance if supplied.
      if ('bottomClearance' in options || 'minimumGap' in options) {
        var clr = ('bottomClearance' in options) ? options.bottomClearance : (state.opts && state.opts.bottomClearance);
        var gap = ('minimumGap' in options) ? options.minimumGap : (state.opts && state.opts.minimumGap);
        applyOffset(clr, gap);
      }

      // Externally-driven install recovery (timeout-like / cancellation), for a
      // caller managing the native prompt itself: reset the busy action to idle
      // or error without inventing success.
      if (options.installReset === 'idle' || options.installReset === 'cancelled') {
        state.attemptId++;                       // invalidate any in-flight settle
        if (state.installBtn) { state.phase = STATE.OPEN; setBusy(false); setStatus(''); }
      } else if (options.installReset === 'error') {
        state.attemptId++;
        if (state.installBtn) { state.phase = STATE.ERROR; setBusy(false); setStatus(COPY.common.errorStatus); }
      }
      return true;
    }

    function close(reason) {
      if (state.destroyed) return;
      if (state.phase === STATE.CLOSED || state.closing) return;
      state.closing = true;
      state.attemptId++;                         // invalidate any pending install settle

      unbindDocKeydown();
      clearPendingTimers();
      if (state.modal) unlockScroll();

      // Remove the mounted root.
      try {
        var r = state.rootEl;
        if (r && r.parentNode && isFn(r.parentNode.removeChild)) r.parentNode.removeChild(r);
      } catch (e) { /* contained */ }

      // Capture the closed callback BEFORE cleanupState() nulls state.opts.
      var prev = state.prevFocus;
      var closedCb = state.opts && state.opts.onClosed;
      cleanupState();

      // Restore focus to the previously focused element if it still can take it.
      if (prev && isFn(prev.focus)) { try { prev.focus(); } catch (e) {} }

      if (isFn(closedCb)) { try { closedCb(reason || 'programmatic'); } catch (e) { warn('[mm-install] onClosed threw', e); } }
    }

    // Reset all per-open references (keeps deps + destroyed flag).
    function cleanupState() {
      state.phase = STATE.CLOSED;
      state.closing = false;
      state.rootEl = null;
      state.surfaceEl = null;
      state.installBtn = null;
      state.skipBtn = null;
      state.primaryBtn = null;
      state.closeBtn = null;
      state.statusEl = null;
      state.backdropEl = null;
      state.opts = null;
      state.platform = null;
      state.prevFocus = null;
      state.backdropMouseDownOnSelf = false;
      state.shownFired = false;
    }

    function destroy() {
      if (state.destroyed) return;               // idempotent
      if (state.phase !== STATE.CLOSED) {
        try { close('destroy'); } catch (e) { /* contained */ }
      }
      // Belt-and-suspenders teardown even if close short-circuited.
      unbindDocKeydown();
      clearPendingTimers();
      unlockScroll();
      // Remove the injected <style> we own.
      try {
        var st = doc && doc.getElementById ? doc.getElementById(STYLE_ID) : null;
        if (st && st.parentNode && isFn(st.parentNode.removeChild)) st.parentNode.removeChild(st);
      } catch (e) { /* contained */ }
      state.destroyed = true;
    }

    function isOpen() {
      return state.phase !== STATE.CLOSED && !state.destroyed;
    }

    return {
      open: open,
      update: update,
      close: close,
      destroy: destroy,
      isOpen: isOpen,
      // introspection for tests/diagnostics (read-only intent)
      _getState: function () { return state.phase; }
    };
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  // Brand: near-black card (#181818) on a dim scrim, red primary (#B1121B),
  // light text (#F7F5F2), Barlow. Mobile = bottom sheet lifted above bottom
  // controls (--mm-install-offset) + safe-area; desktop (≥600px) = compact
  // lower-right card, max-width 380px. Fluid width, no horizontal overflow, and
  // scrolls internally on very short viewports.
  var SURFACE_CSS = [
    '.mm-install-backdrop{position:fixed;inset:0;z-index:2147482000;',
    'background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;',
    '-webkit-overflow-scrolling:touch;}',
    '.mm-install-surface{position:relative;box-sizing:border-box;width:100%;max-width:100%;',
    'max-height:calc(100vh - 24px);overflow-y:auto;',
    'margin:0 12px calc(var(--mm-install-offset, 12px) + env(safe-area-inset-bottom, 0px)) 12px;',
    'background:#181818;color:#F7F5F2;border:1px solid #2A2A2A;',
    'border-radius:16px;padding:20px 18px;',
    'box-shadow:0 -8px 32px rgba(0,0,0,.5);',
    "font-family:'Barlow',system-ui,-apple-system,sans-serif;}",
    '@media (min-width:600px){.mm-install-backdrop{align-items:flex-end;justify-content:flex-end;}',
    '.mm-install-surface{max-width:380px;margin:0 24px calc(var(--mm-install-offset, 24px) + env(safe-area-inset-bottom, 0px)) 0;}}',
    '.mm-install-close{position:absolute;top:8px;right:8px;width:36px;height:36px;line-height:1;',
    'font-size:22px;background:transparent;color:#B8B3B4;border:0;border-radius:8px;cursor:pointer;}',
    '.mm-install-close:hover{color:#F7F5F2;}',
    ".mm-install-heading{margin:0 32px 8px 0;font-family:'Bebas Neue',system-ui,sans-serif;",
    'font-weight:400;font-size:24px;letter-spacing:.01em;line-height:1.05;color:#F7F5F2;}',
    '.mm-install-heading:focus{outline:2px solid #B1121B;outline-offset:3px;}',
    '.mm-install-body{margin:0 0 14px 0;font-size:14px;line-height:1.4;color:#B8B3B4;}',
    '.mm-install-passive{margin:0 0 14px 0;font-size:13px;line-height:1.4;color:#B8B3B4;}',
    '.mm-install-steps{list-style:none;margin:0 0 16px 0;padding:0;display:flex;flex-direction:column;gap:10px;}',
    '.mm-install-step{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.35;color:#F7F5F2;}',
    '.mm-install-step-num{flex:0 0 auto;width:22px;height:22px;border-radius:50%;',
    'background:#B1121B;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;}',
    '.mm-install-step-text{min-width:0;}',
    '.mm-install-status{min-height:0;font-size:13px;color:#B8B3B4;}',
    '.mm-install-status:empty{display:none;}',
    '.mm-install-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}',
    '.mm-install-btn{flex:1 1 auto;min-width:120px;min-height:44px;font:inherit;font-weight:700;',
    'text-transform:uppercase;letter-spacing:.02em;border-radius:10px;padding:11px 16px;cursor:pointer;border:1px solid transparent;}',
    '.mm-install-btn-primary{background:#B1121B;color:#fff;}',
    '.mm-install-btn-primary:hover{background:#D11D27;}',
    '.mm-install-btn-primary[disabled]{opacity:.6;cursor:default;}',
    '.mm-install-btn-ghost{background:transparent;color:#F7F5F2;border-color:#2A2A2A;}',
    '.mm-install-btn:focus-visible,.mm-install-close:focus-visible{outline:2px solid #B1121B;outline-offset:2px;}',
    '@media (max-width:360px){.mm-install-actions{flex-direction:column;}.mm-install-btn{width:100%;}}'
  ].join('');

  var PWAInstallUI = Object.freeze({
    createInstallOnboardingUI: createInstallOnboardingUI,
    computeInstallSurfaceBottomOffset: computeInstallSurfaceBottomOffset,
    COPY: COPY,
    STATE: STATE,
    ROOT_ID: ROOT_ID,
    STYLE_ID: STYLE_ID,
    DEFAULT_MIN_GAP: DEFAULT_MIN_GAP,
    SURFACE_CSS: SURFACE_CSS
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = PWAInstallUI;
  root.PWAInstallUI = PWAInstallUI;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
